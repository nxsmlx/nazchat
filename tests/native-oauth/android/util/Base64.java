package android.util;
public final class Base64 {
    public static final int NO_PADDING = 1, NO_WRAP = 2, URL_SAFE = 8;
    private Base64() {}
    public static String encodeToString(byte[] value, int flags) {
        if (flags != (NO_PADDING | NO_WRAP | URL_SAFE))
            throw new AssertionError("Unexpected Base64 flags: " + flags);
        return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }
}
