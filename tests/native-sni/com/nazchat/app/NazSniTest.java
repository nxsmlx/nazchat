package com.nazchat.app;

import java.io.*;
import java.net.*;
import java.security.KeyStore;
import java.security.cert.X509Certificate;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import javax.net.ssl.*;

/** Host-JVM check: NazSni presents the original host name even when the HTTPS client
 *  replaces the server name afterwards with the address (as Android does). */
public class NazSniTest {
    static int n = 0;
    static void check(boolean ok, String what) { n++; if (!ok) throw new AssertionError(what); System.out.println("ok " + what); }

    public static void main(String[] a) throws Exception {
        String ks = a[0], pass = "changeit";
        KeyStore store = KeyStore.getInstance("PKCS12");
        try (InputStream in = new FileInputStream(ks)) { store.load(in, pass.toCharArray()); }
        KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(store, pass.toCharArray());
        SSLContext server = SSLContext.getInstance("TLS"); server.init(kmf.getKeyManagers(), null, null);
        TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        tmf.init(store);
        SSLContext client = SSLContext.getInstance("TLS"); client.init(null, tmf.getTrustManagers(), null);

        final AtomicReference<String> seen = new AtomicReference<>("");
        final SSLServerSocket ss = (SSLServerSocket) server.getServerSocketFactory().createServerSocket(0, 5, InetAddress.getByName("127.0.0.1"));
        SSLParameters sp = ss.getSSLParameters();
        sp.setSNIMatchers(Collections.<SNIMatcher>singletonList(new SNIMatcher(StandardConstants.SNI_HOST_NAME) {
            public boolean matches(SNIServerName name) { seen.set(new String(name.getEncoded(), java.nio.charset.StandardCharsets.US_ASCII)); return true; }
        }));
        ss.setSSLParameters(sp);
        Thread t = new Thread(() -> {
            while (true) try (Socket s = ss.accept()) {
                BufferedReader r = new BufferedReader(new InputStreamReader(s.getInputStream()));
                String line; while ((line = r.readLine()) != null && line.length() > 0) {}
                s.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok".getBytes());
            } catch (IOException e) { if (ss.isClosed()) return; }
        });
        t.setDaemon(true); t.start();
        int port = ss.getLocalPort();

        // 1. Layered socket, as HttpsURLConnection uses it; then the client overwrites the
        //    server name with nothing (an IP host), like Android does after the factory.
        NazSni.Factory f = new NazSni.Factory("kita.test", client.getSocketFactory());
        Socket raw = new Socket("127.0.0.1", port);
        SSLSocket s = (SSLSocket) f.createSocket(raw, "127.0.0.1", port, true);
        SSLParameters p = s.getSSLParameters(); p.setServerNames(Collections.<SNIServerName>emptyList()); s.setSSLParameters(p);
        s.getOutputStream().write("GET / HTTP/1.1\r\nHost: kita.test\r\n\r\n".getBytes()); s.getOutputStream().flush();
        BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream()));
        check(in.readLine().startsWith("HTTP/1.1 200"), "request over the factory's socket succeeds");
        s.close();
        check("kita.test".equals(seen.get()), "server saw SNI kita.test after the client cleared it (got '" + seen.get() + "')");
        check(NazSni.verifier("kita.test", HttpsURLConnection.getDefaultHostnameVerifier()) != null, "verifier created");

        // 2. Full HttpsURLConnection to the address, as NazDns.open does.
        seen.set("");
        HttpsURLConnection c = (HttpsURLConnection) new URL("https://127.0.0.1:" + port + "/v1/models").openConnection();
        c.setSSLSocketFactory(new NazSni.Factory("kita.test", client.getSocketFactory()));
        c.setHostnameVerifier(NazSni.verifier("kita.test", (h, sess) -> {
            try { X509Certificate cert = (X509Certificate) sess.getPeerCertificates()[0]; return h.equals("kita.test") && cert.getSubjectX500Principal().getName().contains("CN=kita.test"); }
            catch (Exception e) { return false; }
        }));
        c.setRequestProperty("Host", "kita.test");
        check(c.getResponseCode() == 200, "HttpsURLConnection to the address returns 200");
        check("kita.test".equals(seen.get()), "HttpsURLConnection sent SNI kita.test (got '" + seen.get() + "')");

        // 3. Control: without NazSni, connecting to the address sends no host name.
        seen.set("none");
        SSLSocket plain = (SSLSocket) client.getSocketFactory().createSocket("127.0.0.1", port);
        plain.startHandshake(); plain.close();
        check("none".equals(seen.get()), "control: an address alone carries no SNI");
        ss.close();
        System.out.println("RESULT NazSni passed; " + n + " assertions");
    }
}
