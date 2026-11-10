package com.nazchat.app;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebResourceRequest;import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.ConsoleMessage;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient.FileChooserParams;
import android.net.Uri;
import android.content.Intent;
import android.content.res.Configuration;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
    static WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private NazVoice voice;
    private NazTheme theme;
    private NazOAuth oauth;
    private NazMcp mcp;
    private static final int FILE_PICKER = 7401;
    private NazFiles files;

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
        // Follow the phone's font size (Settings > Display), clamped so layouts stay usable.
        float fontScale = getResources().getConfiguration().fontScale;
        s.setTextZoom(Math.max(85, Math.min(150, Math.round(fontScale * 100))));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        WebView.setWebContentsDebuggingEnabled(false);

        NazTheme.disableWebDarkening(web);
        theme = new NazTheme(this, web);
        // Theme-only bridge; never expose this on generated-HTML preview WebViews.
        web.addJavascriptInterface(theme, "NazTheme");

        // Native bridges — CORS-free networking for any provider
        web.addJavascriptInterface(new NazBridge(), "NazBridge");
        web.addJavascriptInterface(new NazStream(), "NazStream");
        web.addJavascriptInterface(new NazHaptics(this), "NazHaptics");
        web.addJavascriptInterface(new NazUpdater(), "NazUpdater");
        web.addJavascriptInterface(new NazSecrets(this), "NazSecrets");
        // Durable state copy: survives a process kill that loses uncommitted localStorage.
        web.addJavascriptInterface(new NazStore(this), "NazStore");
        web.addJavascriptInterface(new NazShare(this), "NazShare");
        files = new NazFiles(this);
        web.addJavascriptInterface(files, "NazFiles");
        web.addJavascriptInterface(new NazPreview(), "NazPreview");
        web.addJavascriptInterface(voice, "NazVoice");
        mcp = new NazMcp(this);
        web.addJavascriptInterface(mcp, "NazMcp");
        oauth = new NazOAuth(this);
        web.addJavascriptInterface(oauth, "NazOAuth");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri u = Uri.parse(url);
                String host = u.getHost() == null ? "" : u.getHost();
                String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
                // Bridges belong only to our bundled shell, never to browsed documents.
                if ("file:///android_asset/index.html".equals(url)) return false;
                if (!"https".equals(scheme) && !"http".equals(scheme)) return true;
                try {
                    android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_VIEW, u);
                    startActivity(i);
                } catch (Exception ignored) {}
                return true;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request == null) return false;
                // Untrusted documents run in PreviewActivity with no native interfaces.
                if (!request.isForMainFrame()) return true;
                return shouldOverrideUrlLoading(view, request.getUrl() == null ? "" : request.getUrl().toString());
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

        web.loadUrl("file:///android_asset/index.html"); // preserve storage origin across upgrades
        if (getIntent() != null && NazOAuth.isRedirect(getIntent().getData())) oauth.handleRedirect(getIntent().getData());
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == NazFiles.REQUEST) { if (files != null) files.onResult(resultCode, data); return; }
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
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Uri u = intent != null ? intent.getData() : null;
        if (NazOAuth.isRedirect(u) && oauth != null) {
            oauth.handleRedirect(u);
        }
    }
    @Override
    protected void onResume() { super.onResume(); if (web != null) web.onResume(); if (theme != null) theme.refreshSystemTheme(); }
    @Override
    public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        if (theme != null) theme.refreshSystemTheme();
    }
    @Override
    protected void onDestroy() {
        if (theme != null) { theme.dispose(); theme = null; }
        if (web != null) web.removeJavascriptInterface("NazTheme");
        NazStream.cancelAll();
        if (mcp != null) mcp.dispose();
        if (web != null) { web.stopLoading(); web.removeAllViews(); web.destroy(); web = null; }
        NazApp.clear();
        super.onDestroy();
    }
    @Override
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript("(function(){if(window.kitaHandleBack)return window.kitaHandleBack();return false;})()", new ValueCallback<String>() {
            @Override public void onReceiveValue(String handled) {
                if ("true".equals(handled) || isFinishing() || isDestroyed()) return;
                if (web != null && web.canGoBack()) web.goBack();
                else MainActivity.super.onBackPressed();
            }
        });
    }
}
