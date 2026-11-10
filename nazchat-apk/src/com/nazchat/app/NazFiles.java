package com.nazchat.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Saves a text file chosen by the user with Android's "Save to" screen (Storage Access
 * Framework). WebView ignores <a download> links, so exports and code downloads
 * produced no file on Android. No storage permission is needed: the user picks the
 * destination and Android grants access to that one document.
 */
public final class NazFiles {
    static final int REQUEST = 7402;
    private static final int MAX_BYTES = 48 * 1024 * 1024;
    private final Activity activity;
    private byte[] pending;
    private String pendingName = "";

    public NazFiles(Activity activity) { this.activity = activity; }

    /** Returns false when nothing could be offered; the result arrives in window.nazFileSaved. */
    @JavascriptInterface
    public synchronized boolean save(String name, String mime, String text) {
        if (text == null) return false;
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_BYTES) return false;
        pending = bytes;
        pendingName = cleanName(name);
        final String type = mime == null || !mime.matches("[a-z]+/[a-z0-9.+-]+") ? "text/plain" : mime;
        final String title = pendingName;
        activity.runOnUiThread(new Runnable() {
            public void run() {
                try {
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType(type);
                    intent.putExtra(Intent.EXTRA_TITLE, title);
                    activity.startActivityForResult(intent, REQUEST);
                } catch (Exception e) {
                    finish(false, "No app can save files on this device");
                }
            }
        });
        return true;
    }

    /** Called from MainActivity.onActivityResult. */
    void onResult(int resultCode, Intent data) {
        final Uri uri = resultCode == Activity.RESULT_OK && data != null ? data.getData() : null;
        final byte[] bytes;
        synchronized (this) { bytes = pending; pending = null; }
        if (uri == null || bytes == null) { finish(false, "cancelled"); return; }
        Thread t = new Thread(new Runnable() {
            public void run() {
                try (OutputStream out = activity.getContentResolver().openOutputStream(uri, "wt")) {
                    if (out == null) throw new Exception("Could not open the file");
                    out.write(bytes);
                    out.flush();
                    finish(true, "");
                } catch (Exception e) {
                    finish(false, e.getMessage() == null ? "Could not write the file" : e.getMessage());
                }
            }
        });
        t.setDaemon(true);
        t.start();
    }

    private void finish(boolean ok, String error) {
        NazApp.post("if(window.nazFileSaved)window.nazFileSaved(" + ok + "," + NazNet.jsonString(pendingName) + "," + NazNet.jsonString(error) + ");");
    }

    static String cleanName(String name) {
        String n = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (n.isEmpty()) n = "kita-file.txt";
        return n.length() > 120 ? n.substring(n.length() - 120) : n;
    }
}
