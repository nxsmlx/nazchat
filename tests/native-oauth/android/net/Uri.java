package android.net;
import java.net.URI;
import java.net.URLDecoder;
/** Only the URI surface exercised by NazOAuth. No Android runtime dependency. */
public final class Uri {
    private final URI uri;
    private Uri(String value) { uri = URI.create(value); }
    public static Uri parse(String value) { return new Uri(value); }
    public String getScheme() { return uri.getScheme(); }
    public String getAuthority() { return uri.getAuthority(); }
    public String getPath() { return uri.getPath(); }
    public String getFragment() { return uri.getFragment(); }
    public String getQueryParameter(String key) {
        String query = uri.getRawQuery();
        if (query != null) for (String pair : query.split("&")) {
            String[] parts = pair.split("=", 2);
            if (decode(parts[0]).equals(key)) return parts.length == 1 ? "" : decode(parts[1]);
        }
        return null;
    }
    private static String decode(String value) {
        try { return URLDecoder.decode(value, "UTF-8"); }
        catch (java.io.UnsupportedEncodingException e) { throw new AssertionError(e); }
    }
    @Override public String toString() { return uri.toString(); }
}
