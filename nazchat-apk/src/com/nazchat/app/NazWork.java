package com.nazchat.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;

/** JavaScript bridge for background builds (see NazWorkService). */
public final class NazWork {
    static final int NOTIFY_PERMISSION_REQUEST = 7403;
    private final Activity activity;

    public NazWork(Activity activity) { this.activity = activity; }

    private static String clip(String s, int max) {
        if (s == null) return "";
        s = s.replace('\n', ' ').trim();
        return s.length() > max ? s.substring(0, max) : s;
    }

    @JavascriptInterface
    public void start(String title, String text) {
        askNotificationPermissionOnce();
        Intent i = new Intent(activity, NazWorkService.class)
            .setAction(NazWorkService.START)
            .putExtra("title", clip(title, 80))
            .putExtra("text", clip(text, 160));
        try {
            if (Build.VERSION.SDK_INT >= 26) activity.startForegroundService(i);
            else activity.startService(i);
        } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public void update(String text, int done, int total) {
        NazWorkService.update(activity.getApplicationContext(), clip(text, 160), done, total);
    }

    @JavascriptInterface
    public void finish(String title, String text, boolean ok) {
        NazWorkService.finish(activity.getApplicationContext(), clip(title, 80), clip(text, 200), ok, MainActivity.visible);
    }

    /** Android 13+: ask once for notification permission, the first time a build goes to the background. */
    private void askNotificationPermissionOnce() {
        if (Build.VERSION.SDK_INT < 33) return;
        final String perm = "android.permission.POST_NOTIFICATIONS";
        if (activity.checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED) return;
        SharedPreferences prefs = activity.getSharedPreferences("kita_work", Context.MODE_PRIVATE);
        if (prefs.getBoolean("asked_notifications", false)) return;
        prefs.edit().putBoolean("asked_notifications", true).apply();
        activity.runOnUiThread(new Runnable() {
            public void run() {
                try { activity.requestPermissions(new String[]{perm}, NOTIFY_PERMISSION_REQUEST); } catch (Exception ignored) {}
            }
        });
    }
}
