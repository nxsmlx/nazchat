package com.nazchat.app;

import android.app.Activity;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Runs generated HTML in a hidden, bridge-free WebView and reports console errors and
 * uncaught exceptions, so the app can ask the model to fix them (write → run → fix).
 * Same isolation as PreviewActivity: no JavaScript interfaces, no file or content
 * access, and navigation away from the page is blocked.
 */
public final class NazCodeCheck {
    private static final int SETTLE_MS = 2000, TIMEOUT_MS = 9000, MAX_ERRORS = 6, MAX_CHARS = 1000000;
    private final Activity activity;

    public NazCodeCheck(Activity activity) { this.activity = activity; }

    /** Results arrive in window.nazCodeChecked(id, errorsJson). */
    @JavascriptInterface
    public void run(final String id, final String html) {
        if (id == null || !id.matches("[A-Za-z0-9_-]{1,64}") || html == null || html.length() > MAX_CHARS) {
            NazApp.post("if(window.nazCodeChecked)window.nazCodeChecked(" + NazNet.jsonString(String.valueOf(id)) + ",'[]');");
            return;
        }
        activity.runOnUiThread(new Runnable() { public void run() { start(id, html); } });
    }

    private void start(final String id, String html) {
        final Set<String> errors = new LinkedHashSet<String>();
        final Handler handler = new Handler(Looper.getMainLooper());
        final WebView web = new WebView(activity);
        final boolean[] done = {false};
        final Runnable finish = new Runnable() {
            public void run() {
                if (done[0]) return;
                done[0] = true;
                JSONArray out = new JSONArray();
                for (String e : errors) { if (out.length() >= MAX_ERRORS) break; out.put(e); }
                try { web.stopLoading(); web.loadUrl("about:blank"); web.destroy(); } catch (Exception ignored) {}
                NazApp.post("if(window.nazCodeChecked)window.nazCodeChecked(" + NazNet.jsonString(id) + "," + NazNet.jsonString(out.toString()) + ");");
            }
        };
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                if (m != null && m.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                    String text = String.valueOf(m.message()).replaceAll("\\s+", " ").trim();
                    if (text.length() > 300) text = text.substring(0, 300);
                    errors.add(text + (m.lineNumber() > 0 ? " (line " + m.lineNumber() + ")" : ""));
                }
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return r != null && r.isForMainFrame(); }
            @Override public boolean shouldOverrideUrlLoading(WebView v, String url) { return true; }
            @Override public void onPageFinished(WebView v, String url) { handler.postDelayed(finish, SETTLE_MS); }
        });
        handler.postDelayed(finish, TIMEOUT_MS);
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }
}
