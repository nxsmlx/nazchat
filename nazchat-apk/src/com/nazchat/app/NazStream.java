package com.nazchat.app;

import android.webkit.JavascriptInterface;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import org.json.JSONObject;

/**
 * PUSH-based streaming SSE bridge (no CORS, native sockets, never blocks the UI thread).
 *
 * Java opens the SSE connection on a background thread and pushes each line to JS:
 *   window.nazStreamOnLine(sid, line)   — one SSE line
 *   window.nazStreamOnStatus(sid, code) — HTTP status after connect
 *   window.nazStreamOnDone(sid, error)  — end of stream (error==null means normal EOF)
 *
 * JS usage:
 *   const sid = NazStream.open(url, headersJson, bodyJson);
 *   NazStream.close(sid); // abort
 */
public class NazStream {
    private static final Map<Integer, HttpURLConnection> conns = new HashMap<>();
    private static final Map<Integer, BufferedReader> readers = new HashMap<>();
    private static int nextId = 1;
    private static final java.util.Set<Integer> active = new java.util.HashSet<>();

    @JavascriptInterface
    public int open(final String urlStr, final String headersJson, final String bodyJson) {
        return openInternal(urlStr, headersJson, bodyJson, "");
    }

    /** Native-only secret path: Java loads the provider key from Android Keystore. */
    @JavascriptInterface
    public int openSecret(final String urlStr, final String headersJson, final String bodyJson, final String secretRef) {
        return openInternal(urlStr, headersJson, bodyJson, secretRef);
    }

    private int openInternal(final String urlStr, final String headersJson, final String bodyJson, final String secretRef) {
        final int id;
        synchronized (NazStream.class) { id = nextId++; active.add(id); }

        Thread t = new Thread(new Runnable() {
            public void run() {
                HttpURLConnection c = null;
                try {
                    String key = "";
                    if (secretRef != null && secretRef.length() > 0) {
                        // Refuses non-provider refs, non-HTTPS and hosts the key is not bound to.
                        key = NazSecrets.keyForRequest(NazApp.activity, secretRef, urlStr);
                    }
                    URL u = new URL(urlStr);
                    c = NazDns.open(u);
                    // Never let a redirect carry the key to another host.
                    if (key.length() > 0) c.setInstanceFollowRedirects(false);
                    synchronized (NazStream.class) {
                        if (!active.contains(id)) { c.disconnect(); return; }
                        conns.put(id, c);
                    }
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(180000);
                    c.setRequestMethod("POST");
                    try {
                        JSONObject h = new JSONObject(headersJson == null ? "{}" : headersJson);
                        if (key.length() > 0) h.put("Authorization", "Bearer " + key);
                        Iterator<String> it = h.keys();
                        while (it.hasNext()) { String k = it.next(); c.setRequestProperty(k, h.getString(k)); }
                    } catch (Exception ignored) {}
                    if (bodyJson != null && !bodyJson.isEmpty()) {
                        c.setDoOutput(true);
                        OutputStream os = c.getOutputStream();
                        os.write(bodyJson.getBytes("UTF-8"));
                        os.close();
                    }
                    int code = c.getResponseCode();
                    emitStatus(id, code);

                    synchronized (NazStream.class) { if (!active.contains(id)) return; }
                    InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                    if (in == null) { emitDone(id, "HTTP " + code); return; }
                    BufferedReader reader = new BufferedReader(new InputStreamReader(in, "UTF-8"));
                    synchronized (NazStream.class) { readers.put(id, reader); }

                    String line;
                    while ((line = reader.readLine()) != null) {
                        emitLine(id, line);
                        synchronized (NazStream.class) {
                            if (!conns.containsKey(id)) break; // closed by JS
                        }
                    }
                    emitDone(id, null);
                } catch (Exception e) {
                    emitDone(id, e.getMessage() == null ? "connection error" : e.getMessage());
                } finally {
                    cleanup(id, c);
                }
            }
        });
        t.setDaemon(true);
        t.start();
        return id;
    }

    public static void cancelAll() {
        Integer[] ids;
        synchronized (NazStream.class) { ids = active.toArray(new Integer[0]); }
        for (Integer id : ids) if (id != null) closeStored(id);
    }

    private static void closeStored(int id) {
        BufferedReader r;
        HttpURLConnection c;
        synchronized (NazStream.class) {
            active.remove(id);
            r = readers.remove(id);
            c = conns.remove(id);
        }
        // Never block the JavascriptInterface thread on a reader locked in readLine().
        final BufferedReader reader = r;
        final HttpURLConnection connection = c;
        Thread closer = new Thread(new Runnable() {
            public void run() {
                try { if (connection != null) connection.disconnect(); } catch (Exception ignored) {}
                try { if (reader != null) reader.close(); } catch (Exception ignored) {}
            }
        });
        closer.setDaemon(true);
        closer.start();
    }

    @JavascriptInterface
    public void close(int id) { closeStored(id); }

    private static void cleanup(int id, HttpURLConnection c) {
        BufferedReader r;
        synchronized (NazStream.class) {
            active.remove(id);
            r = readers.remove(id);
            conns.remove(id);
        }
        try { if (r != null) r.close(); } catch (Exception ignored) {}
        try { if (c != null) c.disconnect(); } catch (Exception ignored) {}
    }

    private static void emitLine(int id, String line) {
        NazApp.post("if(window.nazStreamOnLine)window.nazStreamOnLine(" + id + "," + NazNet.jsonString(line) + ");");
    }
    private static void emitStatus(int id, int code) {
        NazApp.post("if(window.nazStreamOnStatus)window.nazStreamOnStatus(" + id + "," + code + ");");
    }
    private static void emitDone(int id, String error) {
        NazApp.post("if(window.nazStreamOnDone)window.nazStreamOnDone(" + id + "," + (error==null?"null":NazNet.jsonString(error)) + ");");
    }
}
