package com.nazchat.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import java.lang.ref.WeakReference;

/** Theme-only bridge: validated palette writes and an OS night-mode boolean; no secrets or URLs. */
public final class NazTheme {
    private static final String PREFS = "naz_theme";
    private static final Palette DEFAULT = new Palette(false, "#171920", "#1e212a", "#edf0f7");
    private final WeakReference<Activity> activity;
    private final WeakReference<WebView> web;
    private final SharedPreferences preferences;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private Palette applied;
    private Palette pending;
    private boolean posted;
    private boolean closed;
    private volatile boolean systemDark;

    // At most one queued update and one pending palette, even if JS calls sync repeatedly.
    private final Runnable applyPending = new Runnable() {
        @Override
        public void run() {
            final Palette palette;
            synchronized (NazTheme.this) {
                if (closed) return;
                palette = pending;
                pending = null;
                posted = false;
            }
            Activity owner = activity.get();
            WebView view = web.get();
            if (palette == null || owner == null || view == null
                    || owner.isFinishing() || owner.isDestroyed()) return;
            if (palette.sameAs(applied)) return;
            view.setBackgroundColor(palette.background);
            applyWindow(owner, palette);
            preferences.edit()
                    .putBoolean("light", palette.light)
                    .putString("background", palette.backgroundHex)
                    .putString("surface", palette.surfaceHex)
                    .putString("text", palette.textHex)
                    .apply();
            applied = palette;
        }
    };

    /** Construct on the UI thread, before loading the main page. */
    NazTheme(Activity owner, WebView view) {
        activity = new WeakReference<Activity>(owner);
        web = new WeakReference<WebView>(view);
        preferences = preferences(owner);
        systemDark = (owner.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        applied = load(owner);
        view.setBackgroundColor(applied.background);
        applyWindow(owner, applied);
    }

    /** OS configuration, not WebView's fixed Theme.Black media-query preference. */
    @JavascriptInterface
    public boolean isSystemDark() { return systemDark; }

    /** Main UI thread only; no URLs or arbitrary input cross this bridge. */
    void refreshSystemTheme() {
        Activity owner = activity.get();
        WebView view = web.get();
        if (closed || owner == null || view == null || owner.isFinishing() || owner.isDestroyed()) return;
        systemDark = (owner.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        view.evaluateJavascript("if(window.nazSystemThemeChanged)window.nazSystemThemeChanged();", null);
    }

    @JavascriptInterface
    public void sync(boolean light, String backgroundHex, String surfaceHex, String textHex) {
        Palette palette = parse(light, backgroundHex, surfaceHex, textHex);
        if (palette == null) return;
        synchronized (this) {
            if (closed) return;
            pending = palette;
            if (!posted) {
                posted = true;
                ui.post(applyPending);
            }
        }
    }

    /** Called on the UI thread before MainActivity destroys its WebView. */
    synchronized void dispose() {
        closed = true;
        pending = null;
        posted = false;
        ui.removeCallbacks(applyPending);
        activity.clear();
        web.clear();
    }

    private static SharedPreferences preferences(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static Palette load(Context context) {
        SharedPreferences prefs = preferences(context);
        try {
            Palette palette = parse(prefs.getBoolean("light", DEFAULT.light),
                    prefs.getString("background", DEFAULT.backgroundHex),
                    prefs.getString("surface", DEFAULT.surfaceHex),
                    prefs.getString("text", DEFAULT.textHex));
            return palette == null ? DEFAULT : palette;
        } catch (ClassCastException ignored) {
            return DEFAULT;
        }
    }

    private static Palette parse(boolean light, String background, String surface, String text) {
        if (!isHex(background) || !isHex(surface) || !isHex(text)) return null;
        return new Palette(light, background, surface, text);
    }

    private static boolean isHex(String value) {
        if (value == null || value.length() != 7 || value.charAt(0) != '#') return false;
        for (int i = 1; i < 7; i++) {
            char c = value.charAt(i);
            if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')
                    || (c >= 'A' && c <= 'F'))) return false;
        }
        return true;
    }

    /** UI-thread only. Preserve fullscreen, layout and all unrelated visibility flags. */
    @SuppressWarnings("deprecation")
    static void applyWindow(Activity owner, Palette palette) {
        Window window = owner.getWindow();
        View decor = window.getDecorView();
        window.setBackgroundDrawable(new ColorDrawable(palette.background));
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS
                | WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
        window.setStatusBarColor(palette.background);
        // API 24-25 cannot draw dark navigation icons, so always use a dark backdrop.
        window.setNavigationBarColor(Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? palette.surface : DEFAULT.background);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            decor.setForceDarkAllowed(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                controller.setSystemBarsAppearance(palette.light ? mask : 0, mask);
            }
        } else {
            int mask = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                mask |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            int flags = decor.getSystemUiVisibility();
            decor.setSystemUiVisibility((flags & ~mask) | (palette.light ? mask : 0));
        }
    }

    /** Let authored CSS, not platform color inversion, control WebView content. */
    @SuppressWarnings("deprecation")
    static void disableWebDarkening(WebView view) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            view.setForceDarkAllowed(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            view.getSettings().setAlgorithmicDarkeningAllowed(false);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Legacy providers on API 29-32; modern target-33+ providers may ignore this.
            view.getSettings().setForceDark(WebSettings.FORCE_DARK_OFF);
        }
    }

    static final class Palette {
        final boolean light;
        final int background;
        final int surface;
        final int text;
        private final String backgroundHex;
        private final String surfaceHex;
        private final String textHex;

        private Palette(boolean light, String backgroundHex, String surfaceHex, String textHex) {
            this.light = light;
            this.backgroundHex = backgroundHex;
            this.surfaceHex = surfaceHex;
            this.textHex = textHex;
            background = Color.parseColor(backgroundHex);
            surface = Color.parseColor(surfaceHex);
            text = Color.parseColor(textHex);
        }

        boolean sameAs(Palette other) {
            return other != null && light == other.light && background == other.background
                    && surface == other.surface && text == other.text;
        }
    }
}
