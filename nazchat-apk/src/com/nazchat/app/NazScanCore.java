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
 * a sweep covers at most one /24, and a port check at most 100 ports.
 */
final class NazScanCore {
    private NazScanCore() {}

    static final int MAX_PORTS = 100;
    static final int[] COMMON_PORTS = {21, 22, 23, 25, 53, 80, 110, 139, 143, 443, 445, 554, 631, 1883, 1900, 3306, 3389, 5000, 5353, 5432, 5555, 5900, 6379, 7547, 8000, 8008, 8080, 8443, 8888, 9000, 9100, 27017, 32400, 49152, 62078};
    static final int[] SWEEP_PORTS = {80, 443, 22, 445, 139, 53, 8080, 554, 62078, 5353, 7000, 9100};

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
