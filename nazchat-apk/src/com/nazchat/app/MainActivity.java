package com.nazchat.app;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.ConsoleMessage;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient.FileChooserParams;
import android.graphics.Color;
import android.net.Uri;
import android.content.Intent;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
    static WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private NazVoice voice;
    private static final int FILE_PICKER = 7401;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        setContentView(web);
        MainActivity.web = web;
        NazApp.activity = this;
        NazApp.webView = web;
        NazUpdater.activity = this;
        voice = new NazVoice(this);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        // Keep local app assets loadable; block cross-file and universal file access.
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            s.setAllowFileAccessFromFileURLs(false);
            s.setAllowUniversalAccessFromFileURLs(false);
        }
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setTextZoom(100);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        WebView.setWebContentsDebuggingEnabled(false);

        web.setBackgroundColor(Color.parseColor("#0d0d0d"));

        // Native bridges — CORS-free networking for any provider
        web.addJavascriptInterface(new NazBridge(), "NazBridge");
        web.addJavascriptInterface(new NazStream(), "NazStream");
        web.addJavascriptInterface(new NazHaptics(this), "NazHaptics");
        web.addJavascriptInterface(new NazUpdater(), "NazUpdater");
        web.addJavascriptInterface(new NazSecrets(this), "NazSecrets");
        web.addJavascriptInterface(voice, "NazVoice");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Open external links in browser, keep app internal
                Uri u = Uri.parse(url);
                String host = u.getHost() == null ? "" : u.getHost();
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                if ("file".equals(scheme) || ("https".equals(scheme) && host.equals("appassets.androidplatform.net"))) return false;
                if (host.endsWith("duckduckgo.com") || host.endsWith("jina.ai")
                        || host.equals("localhost") || host.equals("127.0.0.1")) {
                    return false; // in-app fetch targets
                }
                try {
                    android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_VIEW, u);
                    startActivity(i);
                } catch (Exception ignored) {}
                return true;
            }

            // Allow CORS-free fetches for the free web search: intercept and proxy
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                return NazNet.intercept(url);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    Intent intent = params.createIntent();
                    startActivityForResult(intent, FILE_PICKER);
                    return true;
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
            }
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                return true;
            }
        });

        web.loadUrl("file:///android_asset/index.html"); // bundled Kita Chat shell; keep file origin for update compatibility
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_PICKER && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    result = new Uri[n];
                    for (int i = 0; i < n; i++) result[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) result = new Uri[]{data.getData()};
            }
            fileCallback.onReceiveValue(result);
            fileCallback = null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (voice != null) voice.onPermissionResult(requestCode, grantResults);
    }

    @Override
    protected void onPause() { if (web != null) web.onPause(); super.onPause(); }
    @Override
    protected void onResume() { if (web != null) web.onResume(); super.onResume(); }
    @Override
    protected void onDestroy() {
        NazStream.cancelAll();
        if (web != null) { web.stopLoading(); web.removeAllViews(); web.destroy(); web = null; }
        NazApp.clear();
        super.onDestroy();
    }
    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
