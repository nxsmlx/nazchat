package com.nazchat.app;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * Durable copy of the app state, written to the app's private files directory.
 * Pure Java (no Android types) so it can be tested on a host JVM.
 *
 * WebView localStorage is committed to disk lazily and is rate limited when large
 * values are written often, so changes made shortly before the process is killed
 * (app update, low-memory kill) can be lost. This file is written with fsync and
 * an atomic rename, keeping the previous copy until the new one is in place.
 */
final class NazStoreFiles {
    private NazStoreFiles() {}

    static final String NAME = "kita-state.json";
    static final String PREVIOUS = "kita-state.prev.json";
    static final String TEMP = "kita-state.tmp";
    static final int MAX_BYTES = 48 * 1024 * 1024;

    static synchronized boolean write(File dir, String text) {
        if (dir == null || text == null) return false;
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        if (bytes.length == 0 || bytes.length > MAX_BYTES) return false;
        File tmp = new File(dir, TEMP), current = new File(dir, NAME), previous = new File(dir, PREVIOUS);
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(bytes);
            out.flush();
            out.getFD().sync();
        } catch (Exception e) {
            tmp.delete();
            return false;
        }
        // Keep the last good copy; read() falls back to it if the swap is interrupted.
        if (current.exists()) {
            previous.delete();
            if (!current.renameTo(previous)) { tmp.delete(); return false; }
        }
        if (!tmp.renameTo(current)) {
            previous.renameTo(current);
            tmp.delete();
            return false;
        }
        return true;
    }

    static synchronized String read(File dir) {
        if (dir == null) return "";
        String text = readFile(new File(dir, NAME));
        return text.length() > 0 ? text : readFile(new File(dir, PREVIOUS));
    }

    private static String readFile(File file) {
        if (!file.isFile() || file.length() <= 0 || file.length() > MAX_BYTES) return "";
        try (InputStream in = new FileInputStream(file)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream((int) file.length());
            byte[] buffer = new byte[64 * 1024];
            int n;
            while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }
}
