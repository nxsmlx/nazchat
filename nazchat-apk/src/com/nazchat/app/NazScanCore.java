package com.nazchat.app;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Limits and parsing for the network tools, without Android types (host-JVM tested).
 *
 * The tools audit the user's OWN local network: only private IPv4 addresses
 * (10/8, 172.16/12, 192.168/16, 169.254/16) inside a subnet the phone is on can be
 * scanned. Carrier-grade NAT (100.64/10, mobile data) and public addresses are refused,
 * a sweep covers at most one /24, and a port check at most 1200 ports.
 */
final class NazScanCore {
    private NazScanCore() {}

    static final int MAX_PORTS = 1200;
    static final int[] COMMON_PORTS = {21, 22, 23, 25, 53, 80, 110, 139, 143, 443, 445, 554, 631, 1883, 1900, 3306, 3389, 5000, 5353, 5432, 5555, 5900, 6379, 7547, 8000, 8008, 8080, 8443, 8888, 9000, 9100, 27017, 32400, 49152, 62078};
    static final int[] SWEEP_PORTS = {80, 443, 22, 445, 139, 53, 8080, 554, 62078, 5353, 7000, 9100};
    // Well-known services above 1024, added to ports 1-1024 for the "top" profile.
    static final int[] HIGH_PORTS = {1080, 1194, 1433, 1521, 1723, 1883, 1900, 2049, 2082, 2083, 2086, 2087, 2181, 2375, 2376, 3000, 3128, 3260, 3306, 3389, 3690, 4000, 4369, 4443, 4444, 4567, 5000, 5001, 5060, 5061, 5222, 5353, 5432, 5555, 5601, 5672, 5800, 5900, 5901, 5984, 6000, 6379, 6443, 6667, 7000, 7001, 7070, 7443, 7547, 7777, 8000, 8008, 8009, 8010, 8060, 8080, 8081, 8083, 8086, 8088, 8089, 8090, 8123, 8181, 8200, 8291, 8443, 8530, 8834, 8880, 8883, 8888, 9000, 9001, 9042, 9090, 9091, 9100, 9200, 9300, 9418, 9443, 9999, 10000, 10250, 11211, 15672, 16992, 20000, 25565, 27017, 28017, 32400, 37777, 49152, 50000, 50070, 51413, 62078};

    /** Ports for a profile: "quick" (common), "top" (1-1024 plus well-known high ports), or a custom list. */
    static int[] profile(String spec) {
        if (spec == null || spec.trim().isEmpty() || "quick".equals(spec)) return COMMON_PORTS.clone();
        if ("top".equals(spec)) {
            Set<Integer> set = new LinkedHashSet<>();
            for (int p = 1; p <= 1024; p++) set.add(p);
            for (int p : HIGH_PORTS) set.add(p);
            int[] out = new int[set.size()]; int i = 0; for (int p : set) out[i++] = p; return out;
        }
        return ports(spec);
    }

    static long ip(String s) {
        String[] p = s == null ? new String[0] : s.trim().split("\\.", -1);
        if (p.length != 4) return -1;
        long v = 0;
        for (String x : p) {
            if (x.isEmpty() || x.length() > 3) return -1;
            for (int i = 0; i < x.length(); i++) if (!Character.isDigit(x.charAt(i))) return -1;
            int n = Integer.parseInt(x);
            if (n > 255) return -1;
            v = (v << 8) | n;
        }
        return v;
    }
    static String ipString(long v) { return ((v >> 24) & 255) + "." + ((v >> 16) & 255) + "." + ((v >> 8) & 255) + "." + (v & 255); }
    static boolean inRange(long v, String base, int bits) { long b = ip(base), mask = bits == 0 ? 0 : (0xFFFFFFFFL << (32 - bits)) & 0xFFFFFFFFL; return (v & mask) == (b & mask); }

    /** Private LAN address the tools may touch (not CGNAT, loopback, multicast or public). */
    static boolean isPrivateLan(String s) {
        long v = ip(s);
        if (v < 0) return false;
        return inRange(v, "10.0.0.0", 8) || inRange(v, "172.16.0.0", 12) || inRange(v, "192.168.0.0", 16) || inRange(v, "169.254.0.0", 16);
    }

    /** {network, prefix} of a "a.b.c.d/n" string, or null. */
    static long[] cidr(String s) {
        if (s == null) return null;
        int slash = s.indexOf('/');
        if (slash < 0) return null;
        long v = ip(s.substring(0, slash));
        int bits;
        try { bits = Integer.parseInt(s.substring(slash + 1).trim()); } catch (Exception e) { return null; }
        if (v < 0 || bits < 0 || bits > 32) return null;
        long mask = bits == 0 ? 0 : (0xFFFFFFFFL << (32 - bits)) & 0xFFFFFFFFL;
        return new long[]{v & mask, bits};
    }
    static boolean contains(String cidr, String addr) {
        long[] c = cidr(cidr); long v = ip(addr);
        if (c == null || v < 0) return false;
        return inRange(v, ipString(c[0]), (int) c[1]);
    }

    /**
     * Hosts to sweep for the phone's address and prefix: the whole subnet when it is /24
     * or smaller, otherwise the /24 around the phone. Network, broadcast and the phone
     * itself are left out. Empty when the address is not a private LAN address.
     */
    static List<String> sweepHosts(String self, int prefix) {
        List<String> out = new ArrayList<>();
        long me = ip(self);
        if (me < 0 || !isPrivateLan(self) || prefix < 0 || prefix > 32) return out;
        int bits = Math.max(prefix, 24);
        long mask = (0xFFFFFFFFL << (32 - bits)) & 0xFFFFFFFFL;
        long net = me & mask, size = 1L << (32 - bits);
        for (long i = 1; i < size - 1; i++) { long h = net + i; if (h != me) out.add(ipString(h)); }
        return out;
    }

    /** Ports from "22,80,8000-8010"; null when invalid or more than MAX_PORTS. */
    static int[] ports(String spec) {
        if (spec == null || spec.trim().isEmpty()) return COMMON_PORTS.clone();
        Set<Integer> set = new LinkedHashSet<>();
        for (String part : spec.split("[,\\s]+")) {
            if (part.isEmpty()) continue;
            try {
                int dash = part.indexOf('-');
                int a = Integer.parseInt(dash < 0 ? part : part.substring(0, dash));
                int b = dash < 0 ? a : Integer.parseInt(part.substring(dash + 1));
                if (a < 1 || b > 65535 || b < a) return null;
                for (int p = a; p <= b; p++) { set.add(p); if (set.size() > MAX_PORTS) return null; }
            } catch (Exception e) { return null; }
        }
        int[] out = new int[set.size()]; int i = 0; for (int p : set) out[i++] = p; return out;
    }

    /** Printable part of a service banner (one line, at most 160 characters). */
    static String banner(byte[] data, int n) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < n && b.length() < 160; i++) {
            int c = data[i] & 255;
            if (c == '\r' || c == '\n') { if (b.length() > 0) break; else continue; }
            if (c >= 32 && c < 127) b.append((char) c);
        }
        return b.toString().trim();
    }

    /** MySQL/MariaDB greeting: the server version, or "". */
    static String mysqlVersion(byte[] b, int n) {
        if (n < 6 || (b[4] & 255) != 10) return "";
        StringBuilder v = new StringBuilder();
        for (int i = 5; i < n && b[i] != 0 && v.length() < 60; i++) { int c = b[i] & 255; if (c >= 32 && c < 127) v.append((char) c); }
        return v.toString();
    }

    /** Client request for NTP (mode 3, version 4). */
    static byte[] ntpQuery() { byte[] q = new byte[48]; q[0] = 0x23; return q; }
    /** "NTP v4 · stratum 2" for a server reply, or "". */
    static String ntpInfo(byte[] b, int n) {
        if (n < 48 || (b[0] & 7) != 4) return "";
        return "NTP v" + ((b[0] >> 3) & 7) + " · stratum " + (b[1] & 255);
    }

    /** NetBIOS node status request (who are you). */
    static byte[] netbiosQuery() {
        byte[] q = new byte[50];
        q[0] = 0x4b; q[1] = 0x49; q[5] = 1; q[12] = 0x20;
        q[13] = 'C'; q[14] = 'K'; for (int i = 15; i < 45; i++) q[i] = 'A';
        q[47] = 0x21; q[49] = 1;
        return q;
    }
    /** First unique workstation name from a node status reply, or "". */
    static String netbiosName(byte[] b, int n) {
        if (n < 57) return "";
        int count = b[56] & 255, off = 57;
        for (int i = 0; i < count && off + 18 <= n; i++, off += 18) {
            String name = new String(b, off, 15, StandardCharsets.US_ASCII).trim();
            int suffix = b[off + 15] & 255, flags = b[off + 16] & 255;
            if (suffix == 0 && (flags & 0x80) == 0 && !name.isEmpty()) return name;
        }
        return "";
    }

    /** DNS query for example.com (A, recursion desired) to see whether a device answers DNS. */
    static byte[] dnsQuery() {
        byte[] name = name("example.com");
        byte[] q = new byte[12 + name.length + 4];
        q[0] = 0x4b; q[1] = 0x43; q[2] = 1; q[5] = 1;
        System.arraycopy(name, 0, q, 12, name.length);
        q[12 + name.length + 1] = 1; q[12 + name.length + 3] = 1;
        return q;
    }
    /** "DNS server · recursion available" for a reply to dnsQuery, or "". */
    static String dnsInfo(byte[] b, int n) {
        if (n < 12 || b[0] != 0x4b || b[1] != 0x43 || (b[2] & 0x80) == 0) return "";
        boolean ra = (b[3] & 0x80) != 0; int answers = ((b[6] & 255) << 8) | (b[7] & 255);
        return "DNS server" + (ra ? " · answers lookups for any name (recursion on)" : "") + (answers > 0 ? " · " + answers + " answer" + (answers == 1 ? "" : "s") : "");
    }

    /** SSDP reply headers we show: SERVER, ST and LOCATION (lower-cased keys). */
    static String[] ssdp(String reply) {
        String server = "", st = "", location = "";
        for (String line : reply.split("\r?\n")) {
            int c = line.indexOf(':');
            if (c < 0) continue;
            String k = line.substring(0, c).trim().toLowerCase(Locale.US), v = line.substring(c + 1).trim();
            if (k.equals("server")) server = v; else if (k.equals("st")) st = v; else if (k.equals("location")) location = v;
        }
        return new String[]{server, st, location};
    }

    /** mDNS query for the list of advertised service types. */
    static byte[] mdnsQuery() {
        byte[] head = {0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0};
        byte[] name = name("_services._dns-sd._udp.local");
        byte[] out = new byte[head.length + name.length + 4];
        System.arraycopy(head, 0, out, 0, head.length);
        System.arraycopy(name, 0, out, head.length, name.length);
        int i = head.length + name.length;
        out[i] = 0; out[i + 1] = 12; out[i + 2] = 0; out[i + 3] = 1; // PTR, IN
        return out;
    }
    static byte[] name(String dotted) {
        java.io.ByteArrayOutputStream o = new java.io.ByteArrayOutputStream();
        for (String label : dotted.split("\\.")) { byte[] b = label.getBytes(StandardCharsets.UTF_8); o.write(b.length); o.write(b, 0, b.length); }
        o.write(0);
        return o.toByteArray();
    }
    /** Names in the answer records of an mDNS reply (PTR targets and record names). */
    static List<String> mdnsNames(byte[] m, int len) {
        List<String> out = new ArrayList<>();
        try {
            if (len < 12) return out;
            int qd = ((m[4] & 255) << 8) | (m[5] & 255), an = ((m[6] & 255) << 8) | (m[7] & 255), ar = ((m[10] & 255) << 8) | (m[11] & 255);
            int[] pos = {12};
            for (int i = 0; i < qd; i++) { readName(m, len, pos); pos[0] += 4; }
            for (int i = 0; i < an + ar && i < 64; i++) {
                String owner = readName(m, len, pos);
                int type = ((m[pos[0]] & 255) << 8) | (m[pos[0] + 1] & 255);
                int rdlen = ((m[pos[0] + 8] & 255) << 8) | (m[pos[0] + 9] & 255);
                int rd = pos[0] + 10;
                if (type == 12) { int[] p2 = {rd}; String target = readName(m, len, p2); if (!out.contains(target)) out.add(target); }
                else if ((type == 1 || type == 33 || type == 16) && !out.contains(owner)) out.add(owner);
                pos[0] = rd + rdlen;
                if (pos[0] > len) break;
            }
        } catch (Exception ignored) {}
        return out;
    }
    private static String readName(byte[] m, int len, int[] pos) {
        StringBuilder b = new StringBuilder();
        int p = pos[0], jumps = 0; boolean jumped = false;
        while (p < len) {
            int l = m[p] & 255;
            if (l == 0) { p++; break; }
            if ((l & 0xC0) == 0xC0) {
                int ptr = ((l & 0x3F) << 8) | (m[p + 1] & 255);
                if (!jumped) pos[0] = p + 2;
                jumped = true; p = ptr;
                if (++jumps > 16) break;
                continue;
            }
            if (b.length() > 0) b.append('.');
            b.append(new String(m, p + 1, Math.min(l, len - p - 1), StandardCharsets.UTF_8));
            p += l + 1;
        }
        if (!jumped) pos[0] = p;
        return b.toString();
    }
}
