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

    @JavascriptInterface
    public int fetch(final String url, final String method, final String headersJson, final String body) {
        final int reqId;
        synchronized (NazBridge.class) { reqId = nextReqId++; }

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
                    java.net.URL u = new java.net.URL(url);
                    java.net.HttpURLConnection c = (java.net.HttpURLConnection) u.openConnection();
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
                    status = c.getResponseCode();
                    java.io.InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                    java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    while (in != null && (n = in.read(buf)) > 0) out.write(buf, 0, n);
                    if (in != null) in.close();
                    text = out.toString("UTF-8");
                    try { c.disconnect(); } catch (Exception ignored) {}
                } catch (Exception e) {
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
