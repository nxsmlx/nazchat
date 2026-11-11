package com.nazchat.app;

import java.io.IOException;
import java.net.InetAddress;
import java.net.Socket;
import java.util.Collections;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSession;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * TLS to a resolved address while presenting and verifying the original host name.
 * Pure javax.net.ssl, so it is tested on a host JVM (tests/native-sni).
 *
 * Android's HttpsURLConnection sets the SNI itself after the socket factory returns, using
 * the URL's host, which is the IP address here. Servers that host several sites on one
 * address (Caddy, Cloudflare, shared hosting) then answer with another site's certificate
 * or a TLS "internal error". So the handshake is finished inside the factory, with the
 * real name; later changes to the server name cannot apply to a finished handshake.
 */
final class NazSni {
    private NazSni() {}

    static final class Factory extends SSLSocketFactory {
        private final SSLSocketFactory base;
        private final String host;
        Factory(String host) { this(host, HttpsURLConnection.getDefaultSSLSocketFactory()); }
        Factory(String host, SSLSocketFactory base) { this.host = host; this.base = base; }

        private Socket sni(Socket s) throws IOException {
            if (!(s instanceof SSLSocket)) return s;
            SSLSocket ss = (SSLSocket) s;
            try {
                SSLParameters p = ss.getSSLParameters();
                p.setServerNames(Collections.singletonList(new SNIHostName(host)));
                ss.setSSLParameters(p);
            } catch (Exception ignored) {}
            // Conscrypt (Android) reads the name from setHostname.
            try { ss.getClass().getMethod("setHostname", String.class).invoke(ss, host); } catch (Exception ignored) {}
            if (ss.isConnected()) ss.startHandshake();
            return ss;
        }
        @Override public String[] getDefaultCipherSuites() { return base.getDefaultCipherSuites(); }
        @Override public String[] getSupportedCipherSuites() { return base.getSupportedCipherSuites(); }
        @Override public Socket createSocket(Socket s, String h, int port, boolean autoClose) throws IOException { return sni(base.createSocket(s, host, port, autoClose)); }
        @Override public Socket createSocket(String h, int port) throws IOException { return sni(base.createSocket(h, port)); }
        @Override public Socket createSocket(String h, int port, InetAddress local, int localPort) throws IOException { return sni(base.createSocket(h, port, local, localPort)); }
        @Override public Socket createSocket(InetAddress a, int port) throws IOException { return sni(base.createSocket(a, port)); }
        @Override public Socket createSocket(InetAddress a, int port, InetAddress local, int localPort) throws IOException { return sni(base.createSocket(a, port, local, localPort)); }
    }

    /** Verifies the certificate against the original host name, not the address. */
    static HostnameVerifier verifier(final String host, final HostnameVerifier base) {
        return new HostnameVerifier() {
            public boolean verify(String ignored, SSLSession session) { return base.verify(host, session); }
        };
    }
}
