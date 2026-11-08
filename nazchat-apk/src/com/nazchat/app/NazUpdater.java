package com.nazchat.app;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
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
    public void downloadAndInstall(final String apkUrl) { downloadAndInstall(apkUrl, ""); }

    @JavascriptInterface
    public void downloadAndInstall(final String apkUrl, final String expectedSha256) {
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
                    if (expectedSha256 != null && expectedSha256.trim().length() > 0) {
                        String actual = sha256(apk);
                        if (!actual.equalsIgnoreCase(expectedSha256.trim())) throw new Exception("checksum mismatch");
                    }

                    String authority = activity.getPackageName() + ".updateprovider";
                    Uri uri = new Uri.Builder().scheme("content").authority(authority).path(apk.getName()).build();
                    // Android 8+ requires the user to allow this app to request package installs.
                    if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
                        Intent permission = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + activity.getPackageName()));
                        permission.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        activity.startActivity(permission);
                        emit("permission");
                        busy = false;
                        return;
                    }
                    // Give Package Installer both the MIME type and a readable content URI.
                    // ACTION_VIEW is more reliable across Android vendor installers than
                    // ACTION_INSTALL_PACKAGE with an untyped URI.
                    Intent i = new Intent(Intent.ACTION_VIEW);
                    i.setDataAndType(uri, "application/vnd.android.package-archive");
                    i.setFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
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

    private static String sha256(File file) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        InputStream in = new java.io.FileInputStream(file);
        byte[] buf = new byte[8192]; int n;
        while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        in.close();
        StringBuilder out = new StringBuilder();
        for (byte b : md.digest()) out.append(String.format("%02x", b & 0xff));
        return out.toString();
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
