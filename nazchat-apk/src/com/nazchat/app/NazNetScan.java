package com.nazchat.app;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.RouteInfo;
import android.net.wifi.WifiManager;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.MulticastSocket;
import java.net.Socket;
import java.net.URL;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * Network tools for auditing the user's OWN local network (see NazScanCore for the
 * limits): network info, a device sweep of the phone's subnet, port checks with
 * service banners, mDNS/SSDP discovery, and TLS details for a site. Results are pushed
 * to window.nazScanEvent(jobId, json). Scans run only when the user starts them.
 */
public final class NazNetScan {
    private final Context context;
    private static final Set<Integer> cancelled = ConcurrentHashMap.newKeySet();
    private static int nextJob = 1;

    public NazNetScan(Context context) { this.context = context.getApplicationContext(); }

    private static void emit(int job, JSONObject o) {
        NazApp.post("window.nazScanEvent&&window.nazScanEvent(" + job + "," + NazNet.jsonString(o.toString()) + ");");
    }
    private static synchronized int job() { return nextJob++; }

    /** Current network: type, the phone's IPv4 address and prefix, gateway, DNS servers. */
    @JavascriptInterface
    public String info() {
        JSONObject o = new JSONObject();
        try {
            ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            Network n = cm.getActiveNetwork();
            NetworkCapabilities caps = n == null ? null : cm.getNetworkCapabilities(n);
            LinkProperties lp = n == null ? null : cm.getLinkProperties(n);
            o.put("type", caps == null ? "none" : caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ? "wifi" : caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) ? "ethernet" : caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ? "cellular" : "other");
            if (lp != null) {
                for (LinkAddress la : lp.getLinkAddresses()) {
                    if (la.getAddress() instanceof Inet4Address) { o.put("ip", la.getAddress().getHostAddress()); o.put("prefix", la.getPrefixLength()); break; }
                }
                for (RouteInfo r : lp.getRoutes()) if (r.isDefaultRoute() && r.getGateway() instanceof Inet4Address) { o.put("gateway", r.getGateway().getHostAddress()); break; }
                JSONArray dns = new JSONArray(); for (InetAddress a : lp.getDnsServers()) dns.put(a.getHostAddress()); o.put("dns", dns);
                if (lp.getInterfaceName() != null) o.put("iface", lp.getInterfaceName());
            }
            String ip = o.optString("ip", "");
            o.put("scannable", NazScanCore.isPrivateLan(ip) && !"cellular".equals(o.optString("type")));
        } catch (Exception e) { try { o.put("error", String.valueOf(e.getMessage())); } catch (Exception ignored) {} }
        return o.toString();
    }

    private String[] self() {
        try { JSONObject i = new JSONObject(info()); return i.optBoolean("scannable") ? new String[]{i.getString("ip"), String.valueOf(i.getInt("prefix"))} : null; }
        catch (Exception e) { return null; }
    }

    @JavascriptInterface
    public void cancel(int job) { cancelled.add(job); }

    /** Finds devices on the phone's own subnet (TCP connect to common ports). Returns a job id, or -1. */
    @JavascriptInterface
    public int sweep() {
        final String[] me = self();
        if (me == null) return -1;
        final int id = job();
        final List<String> hosts = NazScanCore.sweepHosts(me[0], Integer.parseInt(me[1]));
        new Thread(new Runnable() { public void run() {
            ExecutorService pool = Executors.newFixedThreadPool(32);
            final int[] done = {0};
            for (final String h : hosts) pool.execute(new Runnable() { public void run() {
                if (cancelled.contains(id)) return;
                JSONArray open = new JSONArray();
                for (int port : NazScanCore.SWEEP_PORTS) {
                    if (cancelled.contains(id)) return;
                    if (connect(h, port, 250)) open.put(port);
                }
                boolean up = open.length() > 0;
                if (!up) { try { up = InetAddress.getByName(h).isReachable(250); } catch (Exception ignored) {} }
                if (up) {
                    try {
                        String name = "";
                        try { String c = InetAddress.getByName(h).getCanonicalHostName(); if (!h.equals(c)) name = c; } catch (Exception ignored) {}
                        emit(id, new JSONObject().put("type", "host").put("ip", h).put("name", name).put("open", open));
                    } catch (Exception ignored) {}
                }
                synchronized (done) { done[0]++; if (done[0] % 16 == 0) try { emit(id, new JSONObject().put("type", "progress").put("done", done[0]).put("total", hosts.size())); } catch (Exception ignored) {} }
            }});
            pool.shutdown();
            try { pool.awaitTermination(4, TimeUnit.MINUTES); } catch (InterruptedException ignored) {}
            try { emit(id, new JSONObject().put("type", "done").put("cancelled", cancelled.remove(id)).put("total", hosts.size())); } catch (Exception ignored) {}
        }}).start();
        return id;
    }

    /** Checks ports on one device of the phone's subnet and reads what each service says. */
    @JavascriptInterface
    public int ports(final String host, String spec) {
        final String[] me = self();
        final int[] ports = NazScanCore.ports(spec);
        if (me == null || ports == null || !NazScanCore.isPrivateLan(host)
                || !NazScanCore.contains(me[0] + "/" + Math.max(Integer.parseInt(me[1]), 24), host)) return -1;
        final int id = job();
        new Thread(new Runnable() { public void run() {
            ExecutorService pool = Executors.newFixedThreadPool(16);
            for (final int port : ports) pool.execute(new Runnable() { public void run() {
                if (cancelled.contains(id) || !connect(host, port, 600)) return;
                try { emit(id, new JSONObject().put("type", "port").put("ip", host).put("port", port).put("banner", banner(host, port))); } catch (Exception ignored) {}
            }});
            pool.shutdown();
            try { pool.awaitTermination(2, TimeUnit.MINUTES); } catch (InterruptedException ignored) {}
            try { emit(id, new JSONObject().put("type", "done").put("cancelled", cancelled.remove(id))); } catch (Exception ignored) {}
        }}).start();
        return id;
    }

    /** Asks the local network which devices and services announce themselves (SSDP, mDNS). */
    @JavascriptInterface
    public int discover() {
        if (self() == null) return -1;
        final int id = job();
        new Thread(new Runnable() { public void run() {
            WifiManager.MulticastLock lock = null;
            try {
                WifiManager wm = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
                lock = wm.createMulticastLock("kita-discovery"); lock.setReferenceCounted(false); lock.acquire();
            } catch (Exception ignored) {}
            try { ssdp(id); } catch (Exception ignored) {}
            try { mdns(id); } catch (Exception ignored) {}
            try { if (lock != null) lock.release(); } catch (Exception ignored) {}
            try { emit(id, new JSONObject().put("type", "done")); } catch (Exception ignored) {}
        }}).start();
        return id;
    }

    private void ssdp(int id) throws Exception {
        MulticastSocket s = new MulticastSocket(); s.setSoTimeout(700);
        byte[] q = ("M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: ssdp:all\r\n\r\n").getBytes("UTF-8");
        s.send(new DatagramPacket(q, q.length, InetAddress.getByName("239.255.255.250"), 1900));
        long end = System.currentTimeMillis() + 3000; byte[] buf = new byte[4096];
        while (System.currentTimeMillis() < end && !cancelled.contains(id)) {
            try {
                DatagramPacket p = new DatagramPacket(buf, buf.length); s.receive(p);
                String from = p.getAddress().getHostAddress();
                if (!NazScanCore.isPrivateLan(from)) continue;
                String[] h = NazScanCore.ssdp(new String(p.getData(), 0, p.getLength(), "UTF-8"));
                emit(id, new JSONObject().put("type", "service").put("via", "ssdp").put("ip", from).put("server", h[0]).put("st", h[1]).put("location", h[2]));
            } catch (java.net.SocketTimeoutException ignored) {}
        }
        s.close();
    }

    private void mdns(int id) throws Exception {
        MulticastSocket s = new MulticastSocket(); s.setSoTimeout(700);
        byte[] q = NazScanCore.mdnsQuery();
        s.send(new DatagramPacket(q, q.length, InetAddress.getByName("224.0.0.251"), 5353));
        long end = System.currentTimeMillis() + 3000; byte[] buf = new byte[9000];
        while (System.currentTimeMillis() < end && !cancelled.contains(id)) {
            try {
                DatagramPacket p = new DatagramPacket(buf, buf.length); s.receive(p);
                String from = p.getAddress().getHostAddress();
                if (!NazScanCore.isPrivateLan(from)) continue;
                JSONArray names = new JSONArray(); for (String n : NazScanCore.mdnsNames(p.getData(), p.getLength())) names.put(n);
                emit(id, new JSONObject().put("type", "service").put("via", "mdns").put("ip", from).put("names", names));
            } catch (java.net.SocketTimeoutException ignored) {}
        }
        s.close();
    }

    /** Certificate and TLS details of a public HTTPS site (for auditing your own site). */
    @JavascriptInterface
    public String tls(String host) {
        JSONObject o = new JSONObject();
        try {
            if (host == null || !host.matches("[A-Za-z0-9.-]{1,253}") || NazScanCore.ip(host) >= 0) throw new Exception("Enter a domain name");
            McpHttp.requirePublicHost(host);
            HttpsURLConnection c = (HttpsURLConnection) NazDns.open(new URL("https://" + host + "/"));
            c.setConnectTimeout(8000); c.setReadTimeout(8000); c.setInstanceFollowRedirects(false); c.setRequestMethod("GET");
            c.setRequestProperty("User-Agent", "KitaChat-SiteAudit/1.0");
            o.put("status", c.getResponseCode());
            o.put("cipher", c.getCipherSuite());
            JSONObject headers = new JSONObject();
            for (String h : new String[]{"strict-transport-security", "content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy", "server", "location"}) {
                String v = c.getHeaderField(h); if (v != null) headers.put(h, v.length() > 300 ? v.substring(0, 300) : v);
            }
            o.put("headers", headers);
            Certificate[] chain = c.getServerCertificates();
            if (chain.length > 0 && chain[0] instanceof X509Certificate) {
                X509Certificate x = (X509Certificate) chain[0];
                o.put("subject", x.getSubjectX500Principal().getName()); o.put("issuer", x.getIssuerX500Principal().getName());
                o.put("notAfter", x.getNotAfter().getTime()); o.put("notBefore", x.getNotBefore().getTime());
            }
            c.disconnect();
            o.put("valid", true);
            // Does plain http:// send visitors to https://?
            // (A raw request: the app does not allow cleartext HttpURLConnection traffic.)
            try {
                List<String> ips = NazDns.resolve(host);
                String addr = ips != null && !ips.isEmpty() ? ips.get(0) : InetAddress.getByName(host).getHostAddress();
                String[] r = rawHttp(addr, host, 80, "HEAD", 6000);
                o.put("httpStatus", Integer.parseInt(r[0])); o.put("httpRedirect", r[1]);
            } catch (Exception e) { o.put("httpStatus", 0); }
        } catch (javax.net.ssl.SSLException e) {
            try { o.put("valid", false); o.put("error", "Certificate or TLS problem: " + e.getMessage()); } catch (Exception ignored) {}
        } catch (Exception e) {
            try { o.put("error", String.valueOf(e.getMessage())); } catch (Exception ignored) {}
        }
        return o.toString();
    }

    private static boolean connect(String host, int port, int timeout) {
        Socket s = new Socket();
        try { s.connect(new InetSocketAddress(host, port), timeout); return true; }
        catch (Exception e) { return false; }
        finally { try { s.close(); } catch (Exception ignored) {} }
    }

    /** A minimal HTTP/1.0 request over a plain socket: {status, Location, Server, body start}. */
    static String[] rawHttp(String connectTo, String hostHeader, int port, String method, int timeout) throws Exception {
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(connectTo, port), timeout); s.setSoTimeout(timeout);
            OutputStream out = s.getOutputStream();
            out.write((method + " / HTTP/1.0\r\nHost: " + hostHeader + "\r\nUser-Agent: KitaChat-Audit/1.0\r\nConnection: close\r\n\r\n").getBytes("UTF-8"));
            out.flush();
            InputStream in = s.getInputStream(); java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream(); byte[] buf = new byte[4096]; int n;
            while (b.size() < 16384 && (n = in.read(buf)) > 0) b.write(buf, 0, n);
            String text = b.toString("ISO-8859-1");
            String status = "0", location = "", server = "";
            String[] lines = text.split("\r?\n");
            if (lines.length > 0) { String[] p = lines[0].split(" "); if (p.length > 1) status = p[1]; }
            int i = 1;
            for (; i < lines.length && !lines[i].isEmpty(); i++) {
                int c = lines[i].indexOf(':'); if (c < 0) continue;
                String k = lines[i].substring(0, c).trim().toLowerCase(java.util.Locale.US), v = lines[i].substring(c + 1).trim();
                if (k.equals("location")) location = v; else if (k.equals("server")) server = v;
            }
            int body = text.indexOf("\r\n\r\n");
            return new String[]{status, location, server, body < 0 ? "" : text.substring(body + 4)};
        } finally { try { s.close(); } catch (Exception ignored) {} }
    }

    /** What a service says: the HTTP title and Server header, or the first line it sends. */
    private static String banner(String host, int port) {
        boolean tls = port == 443 || port == 8443;
        if (!tls && (port == 80 || port == 8080 || port == 8000 || port == 8008 || port == 8888 || port == 5000 || port == 9000 || port == 32400)) {
            try {
                String[] r = rawHttp(host, host, port, "GET", 1500);
                java.util.regex.Matcher t = java.util.regex.Pattern.compile("(?is)<title[^>]*>(.*?)</title>").matcher(r[3]);
                String title = t.find() ? t.group(1).replaceAll("\\s+", " ").trim() : "";
                return ("HTTP " + r[0] + (r[2].isEmpty() ? "" : " · " + r[2]) + (title.isEmpty() ? "" : " · " + title)).trim();
            } catch (Exception e) { return "HTTP"; }
        }
        if (tls) {
            try {
                URL u = new URL((tls ? "https://" : "http://") + host + ":" + port + "/");
                HttpURLConnection c = (HttpURLConnection) u.openConnection();
                if (c instanceof HttpsURLConnection) trustForBanner((HttpsURLConnection) c);
                c.setConnectTimeout(1500); c.setReadTimeout(1500); c.setInstanceFollowRedirects(false);
                int code = c.getResponseCode();
                String server = c.getHeaderField("Server");
                InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                String body = "";
                if (in != null) { byte[] b = new byte[8192]; int n = in.read(b); in.close(); if (n > 0) body = new String(b, 0, n, "UTF-8"); }
                java.util.regex.Matcher t = java.util.regex.Pattern.compile("(?is)<title[^>]*>(.*?)</title>").matcher(body);
                String title = t.find() ? t.group(1).replaceAll("\\s+", " ").trim() : "";
                c.disconnect();
                return ("HTTP " + code + (server != null ? " · " + server : "") + (title.isEmpty() ? "" : " · " + title) + (tls ? " · certificate not checked" : "")).trim();
            } catch (Exception e) { return tls ? "TLS" : "HTTP"; }
        }
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(host, port), 800); s.setSoTimeout(900);
            InputStream in = s.getInputStream(); byte[] b = new byte[256];
            int n = -1;
            try { n = in.read(b); } catch (Exception ignored) {}
            if (n <= 0 && (port == 21 || port == 25 || port == 110 || port == 143)) return "";
            return n > 0 ? NazScanCore.banner(b, n) : "";
        } catch (Exception e) { return ""; }
        finally { try { s.close(); } catch (Exception ignored) {} }
    }

    /** LAN devices use self-signed certificates; only the banner is read and nothing is sent. */
    private static void trustForBanner(HttpsURLConnection c) {
        try {
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, new TrustManager[]{new X509TrustManager() {
                public void checkClientTrusted(X509Certificate[] a, String b) {}
                public void checkServerTrusted(X509Certificate[] a, String b) {}
                public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            }}, null);
            c.setSSLSocketFactory(ctx.getSocketFactory());
            c.setHostnameVerifier(new javax.net.ssl.HostnameVerifier() { public boolean verify(String h, javax.net.ssl.SSLSession s) { return true; } });
        } catch (Exception ignored) {}
    }
}
