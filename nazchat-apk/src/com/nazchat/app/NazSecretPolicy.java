package com.nazchat.app;

import java.io.IOException;
import java.net.URL;
import java.util.Locale;

/**
 * Rules for provider API keys that JavaScript may ask native code to attach.
 * Pure Java (no Android types) so it can be tested on a host JVM.
 *
 * JavaScript never reads a stored key, but it chooses the request URL. Without
 * these rules any script in the shell could have the key, or an MCP OAuth token,
 * attached to a request to a host of its choosing. So:
 *  - only provider references are reachable from JavaScript ("mcp:" stays native);
 *  - a key is attached only over HTTPS, and only to the origin it is bound to.
 *    The first authorised request binds the origin; saving a new key value
 *    clears the binding, so moving a key to a new host requires the key itself.
 */
final class NazSecretPolicy {
    private NazSecretPolicy() {}

    static final int MAX_REF_LENGTH = 200;

    /** References created by the web UI: "provider:<id>" and "draft:<id>" (new providers). */
    static boolean isProviderRef(String ref) {
        if (ref == null || ref.length() == 0 || ref.length() > MAX_REF_LENGTH) return false;
        if (!ref.startsWith("provider:") && !ref.startsWith("draft:")) return false;
        for (int i = 0; i < ref.length(); i++) if (ref.charAt(i) < 0x20 || ref.charAt(i) == 0x7f) return false;
        return true;
    }

    /**
     * Integration tokens ("integration:github" etc.). Unlike provider keys they are
     * never bound on first use: each service has one fixed official API origin, and the
     * token is attached to requests for that origin only.
     */
    static String integrationOrigin(String ref) {
        if (ref == null) return null;
        switch (ref) {
            case "integration:github": return "https://api.github.com";
            case "integration:vercel": return "https://api.vercel.com";
            case "integration:cloudflare": return "https://api.cloudflare.com";
            case "integration:supabase": return "https://api.supabase.com";
            default: return null;
        }
    }

    static boolean isIntegrationRef(String ref) { return integrationOrigin(ref) != null; }

    /**
     * Web search API keys: "search:<service>" holds one or more keys (one per line);
     * a request names the key to use as "search:<service>#<n>". Each service has one
     * fixed API origin and its own header.
     */
    static String searchBase(String ref) {
        if (ref == null) return null;
        int h = ref.indexOf('#');
        return h < 0 ? ref : ref.substring(0, h);
    }
    static int searchIndex(String ref) {
        int h = ref == null ? -1 : ref.indexOf('#');
        if (h < 0) return 0;
        try { int n = Integer.parseInt(ref.substring(h + 1)); return n >= 0 && n < 20 ? n : -1; } catch (Exception e) { return -1; }
    }
    /** {origin, header name, value prefix} for a search service, or null. */
    static String[] searchSpec(String ref) {
        String base = searchBase(ref);
        if (base == null) return null;
        switch (base) {
            case "search:brave": return new String[]{"https://api.search.brave.com", "X-Subscription-Token", ""};
            case "search:tavily": return new String[]{"https://api.tavily.com", "Authorization", "Bearer "};
            case "search:search1api": return new String[]{"https://api.search1api.com", "Authorization", "Bearer "};
            case "search:exa": return new String[]{"https://api.exa.ai", "x-api-key", ""};
            case "search:serper": return new String[]{"https://google.serper.dev", "X-API-KEY", ""};
            default: return null;
        }
    }
    static boolean isSearchRef(String ref) { return searchSpec(ref) != null && searchIndex(ref) >= 0; }
    static String authorizeSearch(String ref, String url) throws IOException {
        String[] spec = searchSpec(ref);
        if (spec == null || searchIndex(ref) < 0) throw new IOException("Secret reference refused");
        String requested = originOf(url);
        if (!spec[0].equals(requested)) throw new IOException("This key is only sent to " + spec[0] + ", not " + requested + ".");
        return spec[0];
    }
    /** Header used to send a stored key: Bearer for providers and integrations, per service for search. */
    static String authHeaderName(String ref) { String[] s = searchSpec(ref); return s == null ? "Authorization" : s[1]; }
    static String authHeaderValue(String ref, String key) { String[] s = searchSpec(ref); return (s == null ? "Bearer " : s[2]) + key; }

    /** References JavaScript may store, test and use (never read). */
    static boolean isJsRef(String ref) { return isProviderRef(ref) || isIntegrationRef(ref) || (isSearchRef(ref) && ref.indexOf('#') < 0); }

    /** Refuses an integration token for any URL outside its service's API origin. */
    static String authorizeIntegration(String ref, String url) throws IOException {
        String allowed = integrationOrigin(ref);
        if (allowed == null) throw new IOException("Secret reference refused");
        String requested = originOf(url);
        if (!allowed.equals(requested))
            throw new IOException("This token is only sent to " + allowed + ", not " + requested + ".");
        return allowed;
    }

    /** Canonical "https://host[:port]" for a request URL; refuses anything that is not plain HTTPS. */
    static String originOf(String url) throws IOException {
        URL u;
        try { u = new URL(url); } catch (Exception e) { throw new IOException("Invalid request URL"); }
        if (!"https".equalsIgnoreCase(u.getProtocol()))
            throw new IOException("API keys are only sent over HTTPS");
        if (u.getUserInfo() != null) throw new IOException("URLs with embedded credentials are refused");
        String host = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.US);
        if (host.length() == 0) throw new IOException("Invalid request URL");
        int port = u.getPort();
        return "https://" + host + (port == -1 || port == 443 ? "" : ":" + port);
    }

    /**
     * Decides whether a key bound to {@code bound} (null when not yet bound) may be
     * sent to {@code requested}. Returns the origin to store as the binding.
     */
    static String authorize(String bound, String requested) throws IOException {
        if (bound == null || bound.length() == 0) return requested;
        if (bound.equals(requested)) return bound;
        throw new IOException("This API key is locked to " + bound
            + ". Re-enter the key in Edit Provider to use it with " + requested + ".");
    }
}
