package com.nazchat.app;

import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * DNS-over-HTTPS rules without Android types, so they can be tested on a host JVM:
 * which endpoint to ask, how to read its JSON answer, how long to keep it, and how to
 * point a request at the resolved address while keeping the original host name.
 */
final class NazDnsCore {
    private NazDnsCore() {}

    // IP-addressed endpoints: asking them needs no DNS lookup of their own.
    static final String CLOUDFLARE = "https://1.1.1.1/dns-query";
    static final String GOOGLE = "https://8.8.8.8/resolve";
    static final long MIN_TTL = 60, MAX_TTL = 3600;

    static final class Answer {
        final List<String> ips; final long ttl;
        Answer(List<String> ips, long ttl) { this.ips = ips; this.ttl = ttl; }
    }

    /** Endpoint for a mode, or null for the system resolver. */
    static String endpoint(String mode, String custom) {
        if ("cloudflare".equals(mode)) return CLOUDFLARE;
        if ("google".equals(mode)) return GOOGLE;
        if ("custom".equals(mode)) return validCustom(custom) ? custom.trim() : null;
        return null;
    }

    static boolean validCustom(String url) {
        if (url == null) return false;
        try {
            URL u = new URL(url.trim());
            return "https".equalsIgnoreCase(u.getProtocol()) && u.getHost() != null && u.getHost().length() > 0 && u.getUserInfo() == null;
        } catch (Exception e) { return false; }
    }

    static String queryUrl(String endpoint, String name, boolean ipv6) {
        try {
            return endpoint + (endpoint.contains("?") ? "&" : "?") + "name=" + URLEncoder.encode(name, "UTF-8") + "&type=" + (ipv6 ? "AAAA" : "A");
        } catch (Exception e) { return null; }
    }

    private static final Pattern RECORD = Pattern.compile("\\{[^{}]*\\}");
    private static final Pattern TYPE = Pattern.compile("\"type\"\\s*:\\s*(\\d+)");
    private static final Pattern TTL = Pattern.compile("\"TTL\"\\s*:\\s*(\\d+)");
    private static final Pattern DATA = Pattern.compile("\"data\"\\s*:\\s*\"([^\"]+)\"");
    private static final Pattern STATUS = Pattern.compile("\"Status\"\\s*:\\s*(\\d+)");
    private static final Pattern ANSWER = Pattern.compile("\"Answer\"\\s*:\\s*\\[([\\s\\S]*?)\\]");

    /** Addresses of the wanted type (1 = A, 28 = AAAA) from a JSON DoH answer. */
    static Answer parse(String json, boolean ipv6) {
        List<String> ips = new ArrayList<>();
        long ttl = MAX_TTL;
        if (json == null) return new Answer(ips, MIN_TTL);
        Matcher st = STATUS.matcher(json);
        if (st.find() && !"0".equals(st.group(1))) return new Answer(ips, MIN_TTL);
        Matcher answer = ANSWER.matcher(json);
        if (!answer.find()) return new Answer(ips, MIN_TTL);
        Matcher rec = RECORD.matcher(answer.group(1));
        int want = ipv6 ? 28 : 1;
        while (rec.find()) {
            String r = rec.group();
            Matcher t = TYPE.matcher(r), d = DATA.matcher(r), l = TTL.matcher(r);
            if (!t.find() || Integer.parseInt(t.group(1)) != want || !d.find()) continue;
            String ip = d.group(1).trim();
            if (ipv6 ? !isIpv6(ip) : !isIpv4(ip)) continue;
            ips.add(ip);
            if (l.find()) ttl = Math.min(ttl, Long.parseLong(l.group(1)));
        }
        return new Answer(ips, clampTtl(ttl));
    }

    static long clampTtl(long ttl) { return Math.max(MIN_TTL, Math.min(MAX_TTL, ttl)); }

    static boolean isIpv4(String s) {
        if (s == null) return false;
        String[] p = s.split("\\.", -1);
        if (p.length != 4) return false;
        for (String x : p) {
            if (x.isEmpty() || x.length() > 3) return false;
            for (int i = 0; i < x.length(); i++) if (!Character.isDigit(x.charAt(i))) return false;
            if (Integer.parseInt(x) > 255) return false;
        }
        return true;
    }
    static boolean isIpv6(String s) { return s != null && s.indexOf(':') >= 0 && s.matches("[0-9a-fA-F:.]+"); }
    static boolean isIpLiteral(String host) {
        if (host == null) return false;
        String h = host.startsWith("[") && host.endsWith("]") ? host.substring(1, host.length() - 1) : host;
        return isIpv4(h) || isIpv6(h);
    }

    /** The same URL with its host replaced by an address (IPv6 in brackets). */
    static String rewrite(String url, String ip) throws Exception {
        URL u = new URL(url);
        String host = isIpv6(ip) ? "[" + ip + "]" : ip;
        String port = u.getPort() == -1 ? "" : ":" + u.getPort();
        String file = u.getFile() == null || u.getFile().isEmpty() ? "/" : u.getFile();
        String ref = u.getRef() == null ? "" : "#" + u.getRef();
        return u.getProtocol() + "://" + host + port + file + ref;
    }

    /** Host header for the original URL (port only when it is not the default). */
    static String hostHeader(URL u) {
        int port = u.getPort();
        boolean dflt = port == -1 || ("https".equalsIgnoreCase(u.getProtocol()) && port == 443) || ("http".equalsIgnoreCase(u.getProtocol()) && port == 80);
        return u.getHost() + (dflt ? "" : ":" + port);
    }

    // Small TTL cache shared by every request.
    private static final Map<String, Answer> cache = new HashMap<>();
    private static final Map<String, Long> expires = new HashMap<>();
    static synchronized List<String> cached(String host, long now) {
        String k = host.toLowerCase(Locale.US);
        Long until = expires.get(k);
        if (until == null || until <= now) { cache.remove(k); expires.remove(k); return null; }
        return cache.get(k).ips;
    }
    static synchronized void remember(String host, Answer a, long now) {
        if (a == null || a.ips.isEmpty()) return;
        String k = host.toLowerCase(Locale.US);
        cache.put(k, a); expires.put(k, now + a.ttl * 1000L);
        if (cache.size() > 512) { cache.clear(); expires.clear(); }
    }
    static synchronized void clear() { cache.clear(); expires.clear(); }
}
