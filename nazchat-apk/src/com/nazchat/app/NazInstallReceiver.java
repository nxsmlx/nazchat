package com.nazchat.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/**
 * Receives the result of a PackageInstaller session committed by NazUpdater.
 * Shows the system confirmation screen when Android asks for user action and
 * reports the exact failure reason back to the web UI.
 */
public class NazInstallReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        String message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm == null) { NazUpdater.emit("error:Android did not provide the install confirmation screen"); return; }
            confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                if (NazUpdater.activity != null) NazUpdater.activity.startActivity(confirm);
                else context.startActivity(confirm);
                NazUpdater.emit("confirm");
            } catch (Exception e) {
                NazUpdater.emit("error:Could not open the install confirmation screen");
            }
            return;
        }
        if (status == PackageInstaller.STATUS_SUCCESS) { NazUpdater.emit("installed"); return; }
        NazUpdater.emit("error:" + describe(status) + (message != null && message.length() > 0 ? " (" + message + ")" : ""));
    }

    static String describe(int status) {
        switch (status) {
            case PackageInstaller.STATUS_FAILURE_ABORTED: return "Install cancelled";
            case PackageInstaller.STATUS_FAILURE_BLOCKED: return "Install blocked by the device or Play Protect";
            case PackageInstaller.STATUS_FAILURE_CONFLICT: return "Conflicts with the installed app (different signature or package)";
            case PackageInstaller.STATUS_FAILURE_INCOMPATIBLE: return "Not compatible with this device";
            case PackageInstaller.STATUS_FAILURE_INVALID: return "The downloaded APK is invalid";
            case PackageInstaller.STATUS_FAILURE_STORAGE: return "Not enough storage";
            default: return "Android rejected the install";
        }
    }
}
