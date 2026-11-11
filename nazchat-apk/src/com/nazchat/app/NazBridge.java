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
    private static final int MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
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

    /** HttpURLConnection may refuse PATCH (needed by the GitHub API); set it directly then. */
    static void setMethod(java.net.HttpURLConnection c, String method) throws java.io.IOException {
        try { c.setRequestMethod(method); return; }
        catch (java.net.ProtocolException e) { if (!"PATCH".equals(method)) throw e; }
        try {
            java.lang.reflect.Field f = java.net.HttpURLConnection.class.getDeclaredField("method");
            f.setAccessible(true);
            f.set(c, method);
        } catch (Exception e) {
            throw new java.io.IOException("PATCH requests are not supported on this device");
        }
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
                    // Plain fetches (web pages, skill imports) carry no key: they may reach public
                    // hosts only, and every redirect hop is checked again.
                    final boolean plain = secretRef == null || secretRef.length() == 0;
                    if (!plain) {
                        // Refuses unknown refs, non-HTTPS, hosts a provider key is not bound to,
                        // and any host other than an integration token's official API.
                        key = NazSecrets.keyForRequest(NazApp.activity, secretRef, url);
                        if (key.length() > 0) headers.put("Authorization", "Bearer " + key);
                    }
                    String current = url, currentMethod = method, currentBody = body;
                    java.net.HttpURLConnection c;
                    for (int hop = 0; ; hop++) {
                        java.net.URL u = new java.net.URL(current);
                        if (plain) {
                            String scheme = u.getProtocol().toLowerCase(java.util.Locale.US);
                            if (!"https".equals(scheme) && !"http".equals(scheme)) throw new java.io.IOException("Only http(s) URLs are allowed");
                            if (u.getUserInfo() != null) throw new java.io.IOException("URLs with embedded credentials are refused");
                            McpHttp.requirePublicHost(u.getHost());
                        }
                        c = (java.net.HttpURLConnection) u.openConnection();
                        // Plain requests follow redirects here, after the host check; a key never follows one.
                        if (plain || key.length() > 0) c.setInstanceFollowRedirects(false);
                        c.setConnectTimeout(15000);
                        c.setReadTimeout(30000);
                        setMethod(c, currentMethod);
                        c.setRequestProperty("User-Agent",
                            "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36 NazChat/1.3");
                        for (Map.Entry<String, String> e : headers.entrySet()) {
                            if (e.getKey() == null || e.getKey().isEmpty()) continue;
                            c.setRequestProperty(e.getKey(), e.getValue());
                        }
                        if (currentBody != null && !currentBody.isEmpty() && !currentMethod.equals("GET")) {
                            c.setDoOutput(true);
                            java.io.OutputStream os = c.getOutputStream();
                            os.write(currentBody.getBytes("UTF-8"));
                            os.close();
                        }
                        active.put(reqId, c);
                        if (cancelled.containsKey(reqId)) { active.remove(reqId); throw new Exception("cancelled"); }
                        int code = c.getResponseCode();
                        String location = c.getHeaderField("Location");
                        if (plain && code >= 300 && code < 400 && location != null) {
                            if (hop >= 5) throw new java.io.IOException("Too many redirects");
                            current = new java.net.URL(u, location).toString();
                            if (code != 307 && code != 308) { currentMethod = "GET"; currentBody = ""; }
                            active.remove(reqId);
                            try { c.disconnect(); } catch (Exception ignored) {}
                            continue;
                        }
                        break;
                    }
                    status = c.getResponseCode();
                    java.io.InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                    java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    while (in != null && (n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        if (out.size() > MAX_RESPONSE_BYTES) { in.close(); throw new java.io.IOException("Response is larger than 8 MB"); }
                    }
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
