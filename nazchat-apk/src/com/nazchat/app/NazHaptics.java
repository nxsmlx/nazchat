package com.nazchat.app;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.webkit.JavascriptInterface;

public class NazHaptics {
    private final Vibrator vibrator;
    public NazHaptics(Context context) { vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE); }
    @JavascriptInterface
    public void vibrate(int milliseconds) {
        if (vibrator == null || !vibrator.hasVibrator()) return;
        if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createOneShot(Math.min(milliseconds, 50), VibrationEffect.DEFAULT_AMPLITUDE));
        else vibrator.vibrate(Math.min(milliseconds, 50));
    }
}
