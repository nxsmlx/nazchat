package com.nazchat.app;

import android.webkit.JavascriptInterface;

/**
 * Opens generated HTML in a dedicated fullscreen WebView.
 *
 * Android WebView can refuse to paint a sandboxed iframe that points at a data:
 * or blob: document when the host page itself came from file://. A separate
 * activity using loadDataWithBaseURL() is the reliable path, so the APK uses it
 * as the primary preview renderer.
 */
public final class NazPreview {

    @JavascriptInterface
    public void open(final String html, final String title) {
        if (NazApp.activity == null || html == null || html.length() == 0) return;
        try {
            PreviewActivity.pendingHtml = html;
            android.content.Intent i = new android.content.Intent(NazApp.activity, PreviewActivity.class);
            i.putExtra("title", title == null || title.length() == 0 ? "Preview" : title);
            NazApp.activity.startActivity(i);
        } catch (Exception ignored) {
        }
    }
}
