package com.nazchat.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.webkit.JavascriptInterface;

/**
 * Reads the clipboard text when the user pastes into the message box.
 * Some keyboards insert only part of a very long clipboard item, so the page
 * asks for the full text and attaches it as a document instead.
 */
public final class NazClipboard {
    private static final int MAX_CHARS = 2_000_000;
    private final Activity activity;

    public NazClipboard(Activity activity) { this.activity = activity; }

    @JavascriptInterface
    public String text() {
        try {
            ClipboardManager cm = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null || !cm.hasPrimaryClip()) return "";
            ClipData clip = cm.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return "";
            CharSequence t = clip.getItemAt(0).coerceToText(activity);
            if (t == null) return "";
            String s = t.toString();
            return s.length() > MAX_CHARS ? s.substring(0, MAX_CHARS) : s;
        } catch (Exception e) {
            return "";
        }
    }
}
