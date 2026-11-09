package com.nazchat.app;

import android.webkit.JavascriptInterface;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import org.json.JSONObject;

/**
 * Async non-streaming fetch bridge (no CORS). Never blocks the WebView UI thread.
 * Java does the HTTP call on a background thread and calls back:
 *   window.nazFetchDone(reqId, status, body)
 */
public class NazBridge {
    private static int nextReqId = 1;
    private static final java.util.concurrent.ConcurrentHashMap<Integer, java.net.HttpURLConnection> active = new java.util.concurrent.ConcurrentHashMap<>();
    private static final java.util.concurrent.ConcurrentHashMap<Integer, Boolean> cancelled = new java.util.concurrent.ConcurrentHashMap<>();

    /** Lets JS stop waiting for a native request (timeout/Stop) without leaking the socket. */
    @JavascriptInterface
    public void cancel(int reqId) {
        cancelled.put(reqId, Boolean.TRUE);
        java.net.HttpURLConnection c = active.remove(reqId);
        if (c != null) { try { c.disconnect(); } catch (Exception ignored) {} }
    }

    @JavascriptInterface
    public int fetch(final String url, final String method, final String headersJson, final String body) {
        return startFetch(url, method, headersJson, body, "");
    }

    /** Native-only secret path: Java loads the key from Android Keystore. */
    @JavascriptInterface
    public int fetchSecret(final String url, final String method, final String headersJson, final String body, final String secretRef) {
        return startFetch(url, method, headersJson, body, secretRef);
    }

    private int startFetch(final String url, final String method, final String headersJson, final String body, final String secretRef) {
        final int reqId;
        synchronized (NazBridge.class) { reqId = nextReqId++; }
        if (cancelled.size() > 64) cancelled.clear();

        Thread t = new Thread(new Runnable() {
            public void run() {
                Map<String, String> headers = new HashMap<>();
                try {
                    JSONObject h = new JSONObject(headersJson == null ? "{}" : headersJson);
                    Iterator<String> it = h.keys();
                    while (it.hasNext()) { String k = it.next(); headers.put(k, h.getString(k)); }
                } catch (Exception ignored) {}

                int status;
                String text;
                try {
                    String key = "";
                    if (secretRef != null && secretRef.length() > 0) {
                        // Refuses non-provider refs, non-HTTPS and hosts the key is not bound to.
                        key = NazSecrets.keyForRequest(NazApp.activity, secretRef, url);
                        if (key.length() > 0) headers.put("Authorization", "Bearer " + key);
                    }
                    java.net.URL u = new java.net.URL(url);
                    java.net.HttpURLConnection c = (java.net.HttpURLConnection) u.openConnection();
                    // Never let a redirect carry the key to another host.
                    if (key.length() > 0) c.setInstanceFollowRedirects(false);
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(30000);
                    c.setRequestMethod(method);
                    c.setRequestProperty("User-Agent",
                        "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36 NazChat/1.3");
                    for (Map.Entry<String, String> e : headers.entrySet()) {
                        if (e.getKey() == null || e.getKey().isEmpty()) continue;
                        c.setRequestProperty(e.getKey(), e.getValue());
                    }
                    if (body != null && !body.isEmpty() && !method.equals("GET")) {
                        c.setDoOutput(true);
                        java.io.OutputStream os = c.getOutputStream();
                        os.write(body.getBytes("UTF-8"));
                        os.close();
                    }
                    active.put(reqId, c);
                    if (cancelled.containsKey(reqId)) { active.remove(reqId); throw new Exception("cancelled"); }
                    status = c.getResponseCode();
                    java.io.InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                    java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    while (in != null && (n = in.read(buf)) > 0) out.write(buf, 0, n);
                    if (in != null) in.close();
                    text = out.toString("UTF-8");
                    active.remove(reqId);
                    try { c.disconnect(); } catch (Exception ignored) {}
                } catch (Exception e) {
                    active.remove(reqId);
                    status = 0;
                    text = "Network error: " + (e.getMessage() == null ? "connection failed" : e.getMessage());
                }

                final String js = "if(window.nazFetchDone)window.nazFetchDone(" + reqId + "," + status + "," + NazNet.jsonString(text) + ");";
                NazApp.post(js);
            }
        });
        t.setDaemon(true);
        t.start();
        return reqId;
    }
}
