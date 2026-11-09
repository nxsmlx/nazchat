package android.app;

import android.content.Intent;
import java.util.concurrent.*;

/** Host fixture: executes UI callbacks inline and captures browser intents. */
public class Activity {
    private final Preferences preferences = new Preferences();
    private final BlockingQueue<Launch> launches = new LinkedBlockingQueue<Launch>();
    public void runOnUiThread(Runnable task) { task.run(); }
    public void startActivity(Intent intent) { launches.add(new Launch(intent, Thread.currentThread())); }
    public Preferences getPreferences(int mode) { return preferences; }
    public int launchCount() { return launches.size(); }
    public Intent awaitBrowser() throws Exception {
        Launch launch = launches.poll(3, TimeUnit.SECONDS);
        if (launch == null) throw new AssertionError("No browser intent within 3 seconds");
        launch.thread.join(3000);
        if (launch.thread.isAlive()) throw new AssertionError("OAuth start thread did not finish");
        return launch.intent;
    }
    private static final class Launch {
        final Intent intent; final Thread thread;
        Launch(Intent intent, Thread thread) { this.intent = intent; this.thread = thread; }
    }
    public static final class Preferences {
        private final ConcurrentMap<String, String> values = new ConcurrentHashMap<String, String>();
        public String getString(String key, String fallback) {
            String value = values.get(key); return value == null ? fallback : value;
        }
        public Editor edit() { return new Editor(this); }
    }
    public static final class Editor {
        private final Preferences preferences;
        private String key, value;
        Editor(Preferences preferences) { this.preferences = preferences; }
        public Editor putString(String key, String value) { this.key = key; this.value = value; return this; }
        public Editor remove(String key) { this.key = key; this.value = null; return this; }
        public void apply() {
            if (value == null) preferences.values.remove(key); else preferences.values.put(key, value);
        }
    }
}
