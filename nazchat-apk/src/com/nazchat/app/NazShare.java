package com.nazchat.app;

import android.app.Activity;
import android.content.Intent;
import android.webkit.JavascriptInterface;

/** Opens Android's share sheet for plain text (an answer the user chose to share). */
public final class NazShare {
    private static final int MAX_CHARS = 100000;
    private final Activity activity;

    public NazShare(Activity activity) { this.activity = activity; }

    @JavascriptInterface
    public void text(final String value) {
        if (value == null || value.isEmpty()) return;
        final String text = value.length() > MAX_CHARS ? value.substring(0, MAX_CHARS) : value;
        activity.runOnUiThread(new Runnable() {
            public void run() {
                try {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("text/plain");
                    send.putExtra(Intent.EXTRA_TEXT, text);
                    activity.startActivity(Intent.createChooser(send, "Share"));
                } catch (Exception ignored) {}
            }
        });
    }
}
