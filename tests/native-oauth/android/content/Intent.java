package android.content;
import android.net.Uri;
public final class Intent {
    public static final String ACTION_VIEW = "android.intent.action.VIEW";
    private final String action;
    private final Uri data;
    public Intent(String action, Uri data) { this.action = action; this.data = data; }
    public String getAction() { return action; }
    public Uri getData() { return data; }
}
