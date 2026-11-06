package com.nazchat.app;

import android.app.Activity;
import android.webkit.WebView;

/** Helper to post JS onto the WebView UI thread from any background thread. */
public class NazApp {
    static Activity activity;
    static WebView webView;

    static void post(final String js) {
        if (activity == null || webView == null) return;
        activity.runOnUiThread(new Runnable() {
            public void run() {
                webView.evaluateJavascript(js, null);
            }
        });
    }
}
