package com.nazchat.app;

import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;

/**
 * Native network bridge for the NazChat APK.
 * CORS does not apply to native HttpURLConnection, so the app can talk to
 * ANY OpenAI-compatible provider (even ones without CORS headers, like Lyber).
 *
 * The web app calls: POST nazchat://fetch  with a JSON body:
 *   { "url": "...", "method": "GET|POST", "headers": {...}, "body": "..." }
 * and receives: { "status": 200, "headers": {...}, "body": "..." }
 *
 * Streaming (SSE) is handled through a native streaming bridge (NazStream).
 */
public class NazNet {
    public static final String[] SEARCH_HOSTS = {
        "html.duckduckgo.com", "api.duckduckgo.com", "r.jina.ai", "lite.duckduckgo.com"
    };

    /** Simple non-streaming fetch used for /models and errors. */
    public static String fetchJson(String urlStr, String method, Map<String, String> headers, String body) {
        try {
            URL u = new URL(urlStr);
            HttpURLConnection c = NazDns.open(u);
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setRequestMethod(method);
            c.setRequestProperty("User-Agent",
                "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36 NazChat/1.2");
            for (Map.Entry<String, String> e : headers.entrySet()) {
                if (e.getKey() == null || e.getKey().isEmpty()) continue;
                c.setRequestProperty(e.getKey(), e.getValue());
            }
            if (body != null && !body.isEmpty() && !method.equals("GET")) {
                c.setDoOutput(true);
                OutputStream os = c.getOutputStream();
                os.write(body.getBytes("UTF-8"));
                os.close();
            }
            int code = c.getResponseCode();
            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while (in != null && (n = in.read(buf)) > 0) out.write(buf, 0, n);
            if (in != null) in.close();
            return "{\"status\":" + code + ",\"body\":" + jsonString(out.toString("UTF-8")) + "}";
        } catch (Exception e) {
            return "{\"status\":0,\"body\":" + jsonString("Network error: " + e.getMessage()) + "}";
        }
    }

    /** Intercept requests for the free web-search hosts (adds CORS header for the page). */
    public static WebResourceResponse intercept(String url) {
        try {
            if (url == null || !url.startsWith("http")) return null;
            URL u = new URL(url);
            String host = u.getHost();
            for (String h : SEARCH_HOSTS) {
                if (h.equals(host)) {
                    HttpURLConnection c = NazDns.open(u);
                    c.setConnectTimeout(10000);
                    c.setReadTimeout(20000);
                    c.setRequestProperty("User-Agent",
                        "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36");
                    int code = c.getResponseCode();
                    InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    while (in != null && (n = in.read(buf)) > 0) out.write(buf, 0, n);
                    if (in != null) in.close();
                    String type = c.getContentType();
                    if (type == null) type = "text/plain; charset=utf-8";
                    Map<String, String> hdrs = new HashMap<>();
                    hdrs.put("Access-Control-Allow-Origin", "*");
                    return new WebResourceResponse(type, "UTF-8", new ByteArrayInputStream(out.toByteArray()));
                }
            }
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    static String jsonString(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (char ch : s.toCharArray()) {
            switch (ch) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (ch < 0x20) sb.append(String.format("\\u%04x", (int) ch));
                    else sb.append(ch);
            }
        }
        return sb.append("\"").toString();
    }
}
