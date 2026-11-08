package com.nazchat.app;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
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
            return Build.VERSION.SDK_INT >= 28 ? (int) pi.getLongVersionCode() : pi.versionCode;
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
                    if (expectedSha256 == null || !expectedSha256.matches("[a-fA-F0-9]{64}")) throw new Exception("Missing verified update checksum");
                    URL u = new URL(apkUrl);
                    if (!"https".equals(u.getProtocol()) || !"github.com".equals(u.getHost())
                            || !u.getPath().matches("/nxsmlx/nazchat/releases/download/v[0-9]+\\.[0-9]+\\.[0-9]+/NazChat\\.apk")
                            || u.getUserInfo() != null || u.getPort() != -1) throw new Exception("Unapproved update source");
                    HttpURLConnection c = (HttpURLConnection) u.openConnection();
                    c.setConnectTimeout(20000);
                    c.setReadTimeout(30000);
                    c.setRequestProperty("User-Agent", "NazChat-Updater");
                    c.setInstanceFollowRedirects(false);
                    c.connect();
                    int redirects = 0;
                    while (c.getResponseCode() >= 300 && c.getResponseCode() < 400) {
                        if (++redirects > 4) throw new Exception("Too many update redirects");
                        String location = c.getHeaderField("Location");
                        URL next = new URL(c.getURL(), location);
                        String host = next.getHost();
                        if (!"https".equals(next.getProtocol()) || next.getUserInfo() != null
                                || !("github.com".equals(host) || "release-assets.githubusercontent.com".equals(host)
                                || "objects.githubusercontent.com".equals(host))) throw new Exception("Unapproved update redirect");
                        c.disconnect();
                        c = (HttpURLConnection) next.openConnection();
                        c.setConnectTimeout(20000); c.setReadTimeout(30000);
                        c.setInstanceFollowRedirects(false);
                        c.setRequestProperty("User-Agent", "NazChat-Updater");
                        c.connect();
                    }
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
                    long bytes = 0;
                    while ((n = in.read(buf)) > 0) {
                        bytes += n;
                        if (bytes > 50L * 1024 * 1024) { in.close(); out.close(); c.disconnect(); apk.delete(); throw new Exception("Update exceeds 50 MB limit"); }
                        out.write(buf, 0, n);
                    }
                    out.flush(); out.close(); in.close(); c.disconnect();

                    if (apk.length() < 1000) throw new Exception("empty download");
                    if (expectedSha256 != null && expectedSha256.trim().length() > 0) {
                        String actual = sha256(apk);
                        if (!actual.equalsIgnoreCase(expectedSha256.trim())) throw new Exception("checksum mismatch");
                    }

                    verifyUpdateIdentity(apk);
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
                    // Preferred path: stream the APK straight into a PackageInstaller session.
                    // No content provider is involved and Android reports the exact result.
                    try {
                        installWithSession(apk);
                        emit("installing");
                        busy = false;
                        return;
                    } catch (Exception sessionError) {
                        // Fall back to the system installer screen below.
                    }
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

    @SuppressWarnings("deprecation")
    private static void verifyUpdateIdentity(File apk) throws Exception {
        android.content.pm.PackageManager pm = activity.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? android.content.pm.PackageManager.GET_SIGNING_CERTIFICATES : android.content.pm.PackageManager.GET_SIGNATURES;
        PackageInfo candidate = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        PackageInfo installed = pm.getPackageInfo(activity.getPackageName(), flags);
        if (candidate == null || !activity.getPackageName().equals(candidate.packageName)) throw new Exception("Update package identity mismatch");
        long next = Build.VERSION.SDK_INT >= 28 ? candidate.getLongVersionCode() : candidate.versionCode;
        long current = Build.VERSION.SDK_INT >= 28 ? installed.getLongVersionCode() : installed.versionCode;
        if (next <= current) throw new Exception("Update is not newer than the installed app");
        android.content.pm.Signature[] a = Build.VERSION.SDK_INT >= 28 && candidate.signingInfo != null ? candidate.signingInfo.getApkContentsSigners() : candidate.signatures;
        android.content.pm.Signature[] b = Build.VERSION.SDK_INT >= 28 && installed.signingInfo != null ? installed.signingInfo.getApkContentsSigners() : installed.signatures;
        if (a == null || b == null || a.length == 0 || a.length != b.length) throw new Exception("Update signing certificate unavailable");
        java.util.Set<String> expected = new java.util.HashSet<String>();
        for (android.content.pm.Signature signature : b) expected.add(signature.toCharsString());
        java.util.Set<String> actual = new java.util.HashSet<String>();
        for (android.content.pm.Signature signature : a) actual.add(signature.toCharsString());
        if (!actual.equals(expected)) throw new Exception("Update signing certificate does not match this app");
    }

    private static void installWithSession(File apk) throws Exception {
        PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(activity.getPackageName());
        params.setSize(apk.length());
        int sessionId = installer.createSession(params);
        PackageInstaller.Session session = installer.openSession(sessionId);
        try {
            OutputStream out = session.openWrite("base.apk", 0, apk.length());
            InputStream in = new java.io.FileInputStream(apk);
            byte[] buf = new byte[65536]; int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            session.fsync(out);
            out.close();
            Intent result = new Intent(activity, NazInstallReceiver.class);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            // The system adds the status extras, so the PendingIntent must be mutable on Android 12+.
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent pending = PendingIntent.getBroadcast(activity, sessionId, result, flags);
            session.commit(pending.getIntentSender());
        } catch (Exception e) {
            session.abandon();
            throw e;
        } finally {
            session.close();
        }
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

    static void emit(final String state) {
        if (activity == null) return;
        activity.runOnUiThread(new Runnable() {
            public void run() {
                if (MainActivity.web != null)
                    MainActivity.web.evaluateJavascript("if(window.nazUpdateStatus)window.nazUpdateStatus(" + NazNet.jsonString(state) + ");", null);
            }
        });
    }
}
