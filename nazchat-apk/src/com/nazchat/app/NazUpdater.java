package com.nazchat.app;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.webkit.JavascriptInterface;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Enumeration;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;

/**
 * Silent in-app updater (no browser):
 *   window.NazUpdater.getVersion()            -> current versionCode
 *   window.NazUpdater.downloadAndInstall(url) -> backgrounds download, then
 *       pushes window.nazUpdateDone(errorOrNull) and opens the installer.
 *       JS only shows discreet "Checking… / Preparing…" states.
 * Callbacks: window.nazUpdateStatus(state) where state in
 *   "downloading" (silent), "ready" (installer opened), "error:msg".
 */
public class NazUpdater {
    static Activity activity;
    private static volatile boolean busy = false;

    @JavascriptInterface
    public int getVersion() {
        try {
            PackageInfo pi = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            return (int) pi.getLongVersionCode();
        } catch (Exception e) { return 0; }
    }

    @JavascriptInterface
    public void downloadAndInstall(final String apkUrl) {
        if (busy) return;
        busy = true;
        new Thread(new Runnable() {
            public void run() {
                try {
                    emit("downloading");
                    URL u = new URL(apkUrl);
                    HttpURLConnection c = (HttpURLConnection) u.openConnection();
                    c.setConnectTimeout(20000);
                    c.setRequestProperty("User-Agent", "NazChat-Updater");
                    c.setInstanceFollowRedirects(true);
                    c.connect();
                    int code = c.getResponseCode();
                    if (code != 200) throw new Exception("HTTP " + code);

                    File dir = new File(activity.getCacheDir(), "update");
                    if (!dir.exists()) dir.mkdirs();
                    // cleanup old files
                    File[] old = dir.listFiles();
                    if (old != null) for (File f : old) f.delete();
                    File apk = new File(dir, "update.apk");

                    OutputStream out = new FileOutputStream(apk);
                    InputStream in = c.getInputStream();
                    byte[] buf = new byte[8192]; int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    out.flush(); out.close(); in.close(); c.disconnect();

                    if (apk.length() < 1000) throw new Exception("empty download");

                    String authority = activity.getPackageName() + ".updateprovider";
                    Uri uri = new Uri.Builder().scheme("content").authority(authority).path(apk.getName()).build();
                    Intent i = new Intent(Intent.ACTION_INSTALL_PACKAGE);
                    i.setData(uri);
                    i.setFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    activity.startActivity(i);
                    emit("ready");
                    busy = false;
                } catch (Exception e) {
                    busy = false;
                    String m = e.getMessage() == null ? "download failed" : e.getMessage();
                    emit("error:" + m);
                }
            }
        }).start();
    }

    private static void emit(String state) {
        if (activity == null) return;
        activity.runOnUiThread(new Runnable() {
            public void run() {
                if (MainActivity.web != null)
                    MainActivity.web.evaluateJavascript("if(window.nazUpdateStatus)window.nazUpdateStatus(" + NazNet.jsonString(state) + ");", null);
            }
        });
    }
}
