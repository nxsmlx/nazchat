package com.nazchat.app;

import java.util.Arrays;
import java.util.List;

public final class NazScanCoreTest {
    private static int assertions = 0;
    private static void check(boolean ok, String what) { assertions++; if (!ok) throw new AssertionError(what); }

    public static void main(String[] args) {
        // Only the user's own private LAN.
        for (String ok : new String[]{"192.168.1.10", "10.0.0.5", "172.16.4.4", "172.31.255.1", "169.254.3.3"}) check(NazScanCore.isPrivateLan(ok), "private " + ok);
        for (String no : new String[]{"100.64.0.1", "100.127.1.1", "8.8.8.8", "172.32.0.1", "127.0.0.1", "224.0.0.251", "0.0.0.0", "192.169.1.1", "300.1.1.1", "1.2.3", "a.b.c.d"}) check(!NazScanCore.isPrivateLan(no), "refused " + no);

        // Sweep: whole /24, or the /24 around the phone on bigger subnets; never the phone, network or broadcast.
        List<String> h = NazScanCore.sweepHosts("192.168.1.23", 24);
        check(h.size() == 253 && h.get(0).equals("192.168.1.1") && h.get(252).equals("192.168.1.254") && !h.contains("192.168.1.23"), "/24 sweep");
        List<String> big = NazScanCore.sweepHosts("10.4.7.9", 16);
        check(big.size() == 253 && big.get(0).equals("10.4.7.1") && big.get(252).equals("10.4.7.254"), "/16 clamped to the phone's /24");
        check(NazScanCore.sweepHosts("192.168.1.2", 30).equals(Arrays.asList("192.168.1.1")), "/30");
        check(NazScanCore.sweepHosts("100.70.1.2", 24).isEmpty(), "mobile data CGNAT refused");
        check(NazScanCore.sweepHosts("203.0.113.5", 24).isEmpty(), "public refused");
        check(NazScanCore.contains("192.168.1.0/24", "192.168.1.200") && !NazScanCore.contains("192.168.1.0/24", "192.168.2.1"), "subnet membership");

        // Ports.
        check(NazScanCore.ports("22, 80,8000-8002").length == 5, "port list and range");
        check(NazScanCore.ports("") .length == NazScanCore.COMMON_PORTS.length, "default common ports");
        check(NazScanCore.ports("1-101") == null, "more than 100 ports refused");
        check(NazScanCore.ports("0") == null && NazScanCore.ports("70000") == null && NazScanCore.ports("90-80") == null && NazScanCore.ports("x") == null, "invalid ports refused");

        // Banners and SSDP.
        byte[] ssh = "SSH-2.0-OpenSSH_8.4p1 Debian\r\nmore".getBytes();
        check(NazScanCore.banner(ssh, ssh.length).equals("SSH-2.0-OpenSSH_8.4p1 Debian"), "banner first line");
        check(NazScanCore.banner(new byte[]{0, 1, 2, 'O', 'K'}, 5).equals("OK"), "banner printable only");
        String[] s = NazScanCore.ssdp("HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=1800\r\nLOCATION: http://192.168.1.1:1900/rootDesc.xml\r\nSERVER: Linux UPnP/1.0 MiniUPnPd/2.1\r\nST: upnp:rootdevice\r\n\r\n");
        check(s[0].equals("Linux UPnP/1.0 MiniUPnPd/2.1") && s[1].equals("upnp:rootdevice") && s[2].equals("http://192.168.1.1:1900/rootDesc.xml"), "ssdp headers");

        // mDNS: query layout and a reply with a compressed PTR target.
        byte[] q = NazScanCore.mdnsQuery();
        check(q.length == 12 + 30 + 4 && q[5] == 1 && q[q.length - 3] == 12, "mdns query");
        byte[] owner = NazScanCore.name("_services._dns-sd._udp.local");
        byte[] reply = new byte[12 + owner.length + 10 + 10];
        reply[2] = (byte) 0x84; reply[7] = 1; // one answer
        System.arraycopy(owner, 0, reply, 12, owner.length);
        int p = 12 + owner.length;
        reply[p + 1] = 12; reply[p + 3] = 1; reply[p + 9] = 10; // PTR, IN, rdlength 10
        byte[] target = {5, '_', 'h', 't', 't', 'p', 4, '_', 't', 'c', 'p'};
        byte[] rd = new byte[10];
        // "_ipp" label + pointer to "._tcp" ... keep it simple: "_ipp._tcp" built with a pointer to the owner's "local".
        rd[0] = 4; rd[1] = '_'; rd[2] = 'i'; rd[3] = 'p'; rd[4] = 'p'; rd[5] = 4; rd[6] = '_'; rd[7] = 't'; rd[8] = (byte) 0xC0; rd[9] = (byte) (12 + 1 + 9 + 1 + 8 + 1 + 4);
        System.arraycopy(rd, 0, reply, p + 10, 10);
        List<String> names = NazScanCore.mdnsNames(reply, reply.length);
        check(names.size() == 1 && names.get(0).startsWith("_ipp._t"), "mdns PTR name with compression: " + names);
        check(NazScanCore.mdnsNames(new byte[5], 5).isEmpty(), "short packet ignored");
        System.out.println("RESULT NazScanCore passed; " + assertions + " assertions; production source; host JVM");
    }
}
