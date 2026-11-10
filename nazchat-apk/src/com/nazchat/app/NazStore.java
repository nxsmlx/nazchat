package com.nazchat.app;

import android.content.Context;
import android.webkit.JavascriptInterface;

import java.io.File;

/** JavaScript bridge for the durable app-state copy (see NazStoreFiles). */
public final class NazStore {
    private final File dir;

    public NazStore(Context context) { this.dir = context.getApplicationContext().getFilesDir(); }

    @JavascriptInterface
    public boolean write(String text) { return NazStoreFiles.write(dir, text); }

    @JavascriptInterface
    public String read() { return NazStoreFiles.read(dir); }
}
