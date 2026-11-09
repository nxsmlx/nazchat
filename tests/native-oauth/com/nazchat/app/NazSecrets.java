package com.nazchat.app;
import android.app.Activity;
import java.util.concurrent.*;
/** In-memory only. Does not exercise Android encrypted storage. */
final class NazSecrets {
    private static final ConcurrentMap<String, String> values = new ConcurrentHashMap<String, String>();
    NazSecrets(Activity activity) {}
    static String getStored(Activity activity, String key) {
        String value = values.get(key); return value == null ? "" : value;
    }
    static boolean putStored(Activity activity, String key, String value) { values.put(key, value); return true; }
    void remove(String key) { values.remove(key); }
    static void reset() { values.clear(); }
}
