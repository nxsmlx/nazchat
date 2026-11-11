package com.nazchat.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.Socket;
import java.net.URL;
import java.util.Collections;
import java.util.List;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSession;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * DNS-over-HTTPS for every native request (models, MCP, search, integrations, updates).
 * Some networks answer DNS with a block page; with DoH the host is looked up over HTTPS
 * and the request goes to the real address. TLS still checks the certificate against
 * the original host name (SNI and hostname verification use it), so nothing about
 * security changes. If the lookup fails, the request falls back to the system resolver.
 */
public final class NazDns {
    private static final String PREFS = "kita_dns";
    static volatile String mode = "system";
    static volatile String custom = "";

    public NazDns(Context context) { load(context); }

    static void load(Context context) {
        SharedPreferences p = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        mode = p.getString("mode", "system");
        custom = p.getString("custom", "");
    }

    @JavascriptInterface
    public boolean setMode(String m, String url) {
        if (!"cloudflare".equals(m) && !"google".equals(m) && !"custom".equals(m) && !"system".equals(m)) return false;
        if ("custom".equals(m) && !NazDnsCore.validCustom(url)) return false;
        mode = m; custom = url == null ? "" : url.trim();
        NazDnsCore.clear();
        Context ctx = NazApp.activity;
        if (ctx != null) ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("mode", mode).putString("custom", custom).apply();
        return true;
    }

    @JavascriptInterface
    public String getMode() { return mode; }

    /** Looks a host up with the current setting; "1.2.3.4, …" or "Error: …". */
    @JavascriptInterface
    public String test(String host) {
        if (NazDnsCore.endpoint(mode, custom) == null) {
            try { InetAddress[] a = InetAddress.getAllByName(host); StringBuilder b = new StringBuilder(); for (InetAddress x : a) { if (b.length() > 0) b.append(", "); b.append(x.getHostAddress()); } return b.toString(); }
            catch (Exception e) { return "Error: " + e.getMessage(); }
        }
        NazDnsCore.clear();
        List<String> ips = resolve(host);
        return ips == null || ips.isEmpty() ? "Error: no answer from the DNS-over-HTTPS server" : String.join(", ", ips);
    }

    static List<String> resolve(String host) {
        String ep = NazDnsCore.endpoint(mode, custom);
        if (ep == null) return null;
        long now = System.currentTimeMillis();
        List<String> hit = NazDnsCore.cached(host, now);
        if (hit != null) return hit;
        for (boolean v6 : new boolean[]{false, true}) {
            try {
                String q = NazDnsCore.queryUrl(ep, host, v6);
                HttpURLConnection c = (HttpURLConnection) new URL(q).openConnection();
                c.setConnectTimeout(5000); c.setReadTimeout(5000);
                c.setRequestProperty("Accept", "application/dns-json");
                int code = c.getResponseCode();
                if (code != 200) { c.disconnect(); continue; }
                InputStream in = c.getInputStream();
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[4096]; int n;
                while ((n = in.read(buf)) > 0 && out.size() < 65536) out.write(buf, 0, n);
                in.close(); c.disconnect();
                NazDnsCore.Answer a = NazDnsCore.parse(out.toString("UTF-8"), v6);
                if (!a.ips.isEmpty()) { NazDnsCore.remember(host, a, now); return a.ips; }
            } catch (Exception ignored) {}
        }
        return Collections.emptyList();
    }

    /** Opens a connection for {@code u}, through DNS-over-HTTPS when it is on. */
    static HttpURLConnection open(URL u) throws IOException {
        final String host = u.getHost();
        String ep = NazDnsCore.endpoint(mode, custom);
        if (ep == null || !"https".equalsIgnoreCase(u.getProtocol()) || host == null || NazDnsCore.isIpLiteral(host)
                || "localhost".equalsIgnoreCase(host) || host.equalsIgnoreCase(new URL(ep).getHost()))
            return (HttpURLConnection) u.openConnection();
        List<String> ips = resolve(host);
        if (ips == null || ips.isEmpty()) return (HttpURLConnection) u.openConnection();
        URL target;
        try { target = new URL(NazDnsCore.rewrite(u.toString(), ips.get(0))); }
        catch (Exception e) { return (HttpURLConnection) u.openConnection(); }
        HttpsURLConnection c = (HttpsURLConnection) target.openConnection();
        c.setSSLSocketFactory(new SniFactory(host));
        c.setHostnameVerifier(new HostnameVerifier() {
            public boolean verify(String ignored, SSLSession session) {
                return HttpsURLConnection.getDefaultHostnameVerifier().verify(host, session);
            }
        });
        c.setRequestProperty("Host", NazDnsCore.hostHeader(u));
        return c;
    }

    /** TLS to an address, presenting and verifying the original host name. */
    static final class SniFactory extends SSLSocketFactory {
        private final SSLSocketFactory base = HttpsURLConnection.getDefaultSSLSocketFactory();
        private final String host;
        SniFactory(String host) { this.host = host; }
        private Socket sni(Socket s) {
            if (s instanceof SSLSocket) {
                try { SSLParameters p = ((SSLSocket) s).getSSLParameters(); p.setServerNames(Collections.singletonList(new SNIHostName(host))); ((SSLSocket) s).setSSLParameters(p); }
                catch (Exception ignored) {}
            }
            return s;
        }
        @Override public String[] getDefaultCipherSuites() { return base.getDefaultCipherSuites(); }
        @Override public String[] getSupportedCipherSuites() { return base.getSupportedCipherSuites(); }
        @Override public Socket createSocket(Socket s, String h, int port, boolean autoClose) throws IOException { return sni(base.createSocket(s, host, port, autoClose)); }
        @Override public Socket createSocket(String h, int port) throws IOException { return sni(base.createSocket(h, port)); }
        @Override public Socket createSocket(String h, int port, InetAddress local, int localPort) throws IOException { return sni(base.createSocket(h, port, local, localPort)); }
        @Override public Socket createSocket(InetAddress a, int port) throws IOException { return sni(base.createSocket(a, port)); }
        @Override public Socket createSocket(InetAddress a, int port, InetAddress local, int localPort) throws IOException { return sni(base.createSocket(a, port, local, localPort)); }
    }
}
