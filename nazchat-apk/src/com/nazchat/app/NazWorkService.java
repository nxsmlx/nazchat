package com.nazchat.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Foreground service that keeps a long build (orchestrator + agents) alive while the
 * app is in the background. The work itself still runs in the app's WebView; this
 * service raises the process priority, holds a time-limited partial wake lock and
 * shows progress. When the build ends it posts a "finished" notification if the app
 * is not on screen.
 */
public final class NazWorkService extends Service {
    static final String START = "com.nazchat.app.work.START";
    static final String STOP_BUILD = "com.nazchat.app.work.STOP_BUILD";
    static final String CHANNEL_RUN = "kita_work";
    static final String CHANNEL_DONE = "kita_done";
    static final int ID_RUN = 7410, ID_DONE = 7411;
    private static final long WAKE_LIMIT_MS = 45L * 60L * 1000L;

    private static volatile boolean running = false;
    private static volatile String title = "Kita Chat";
    private PowerManager.WakeLock lock;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (STOP_BUILD.equals(action)) {
            NazApp.post("window.kitaStopFromNotification&&window.kitaStopFromNotification();");
            return START_NOT_STICKY;
        }
        if (intent != null && intent.getStringExtra("title") != null) title = intent.getStringExtra("title");
        String text = intent != null && intent.getStringExtra("text") != null ? intent.getStringExtra("text") : "Working…";
        ensureChannels(this);
        Notification n = progress(this, text, 0, 0);
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(ID_RUN, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            else startForeground(ID_RUN, n);
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        if (lock == null) {
            try {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "KitaChat:build");
                lock.setReferenceCounted(false);
                lock.acquire(WAKE_LIMIT_MS);
            } catch (Exception ignored) { lock = null; }
        }
        return START_NOT_STICKY;
    }

    static void update(Context ctx, String text, int done, int total) {
        if (!running) return;
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            nm.notify(ID_RUN, progress(ctx, text, done, total));
        } catch (Exception ignored) {}
    }

    static void finish(Context ctx, String doneTitle, String text, boolean ok, boolean appVisible) {
        running = false;
        try { ctx.stopService(new Intent(ctx, NazWorkService.class)); } catch (Exception ignored) {}
        if (appVisible) return;
        try {
            ensureChannels(ctx);
            Notification.Builder b = builder(ctx, CHANNEL_DONE)
                .setSmallIcon(ok ? android.R.drawable.stat_sys_download_done : android.R.drawable.stat_notify_error)
                .setContentTitle(doneTitle)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(title + "\n" + text))
                .setAutoCancel(true)
                .setContentIntent(openApp(ctx));
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            nm.notify(ID_DONE, b.build());
        } catch (Exception ignored) {}
    }

    private static Notification progress(Context ctx, String text, int done, int total) {
        Intent stop = new Intent(ctx, NazWorkService.class).setAction(STOP_BUILD);
        PendingIntent stopPi = PendingIntent.getService(ctx, 2, stop, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = builder(ctx, CHANNEL_RUN)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("Kita is building · " + title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_PROGRESS)
            .setContentIntent(openApp(ctx))
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopPi).build());
        if (total > 0) b.setProgress(total, Math.max(0, Math.min(done, total)), false);
        else b.setProgress(0, 0, true);
        return b.build();
    }

    @SuppressWarnings("deprecation")
    private static Notification.Builder builder(Context ctx, String channel) {
        return Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, channel) : new Notification.Builder(ctx);
    }

    private static PendingIntent openApp(Context ctx) {
        Intent open = new Intent(ctx, MainActivity.class)
            .setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CHANNEL_RUN) == null) {
            NotificationChannel c = new NotificationChannel(CHANNEL_RUN, "Builds in progress", NotificationManager.IMPORTANCE_LOW);
            c.setDescription("Shows while Kita keeps building in the background");
            c.setShowBadge(false);
            nm.createNotificationChannel(c);
        }
        if (nm.getNotificationChannel(CHANNEL_DONE) == null) {
            NotificationChannel c = new NotificationChannel(CHANNEL_DONE, "Finished builds", NotificationManager.IMPORTANCE_DEFAULT);
            c.setDescription("Tells you when a background build has finished");
            nm.createNotificationChannel(c);
        }
    }

    @Override
    public void onTimeout(int startId) { stopSelf(); }

    @Override
    public void onTimeout(int startId, int fgsType) { stopSelf(); }

    @Override
    public void onDestroy() {
        running = false;
        try { if (lock != null && lock.isHeld()) lock.release(); } catch (Exception ignored) {}
        lock = null;
        if (Build.VERSION.SDK_INT >= 24) stopForeground(Service.STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
