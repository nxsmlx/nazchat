package com.nazchat.app;

import java.net.URL;
import java.util.Arrays;

public final class NazDnsCoreTest {
    private static int assertions = 0;
    private static void check(boolean ok, String what) { assertions++; if (!ok) throw new AssertionError(what); }

    public static void main(String[] args) throws Exception {
        // Endpoints are IP addressed, so the lookup itself needs no DNS.
        check(NazDnsCore.endpoint("cloudflare", "").equals("https://1.1.1.1/dns-query"), "cloudflare endpoint");
        check(NazDnsCore.endpoint("google", "").equals("https://8.8.8.8/resolve"), "google endpoint");
        check(NazDnsCore.endpoint("system", "") == null, "system uses the phone resolver");
        check(NazDnsCore.endpoint("custom", "https://dns.example/dns-query").equals("https://dns.example/dns-query"), "custom endpoint");
        check(NazDnsCore.endpoint("custom", "http://dns.example/q") == null, "custom must be https");
        check(NazDnsCore.endpoint("custom", "https://u:p@dns.example/q") == null, "no credentials in custom endpoint");
        check(NazDnsCore.endpoint("weird", "") == null, "unknown mode is system");
        check(NazDnsCore.queryUrl("https://1.1.1.1/dns-query", "api.openai.com", false).equals("https://1.1.1.1/dns-query?name=api.openai.com&type=A"), "A query");
        check(NazDnsCore.queryUrl("https://x/resolve?ct=json", "a.b", true).equals("https://x/resolve?ct=json&name=a.b&type=AAAA"), "AAAA query, existing ?");

        // Answers: CNAMEs are skipped, only real addresses of the wanted type are kept.
        String json = "{\"Status\":0,\"Answer\":[{\"name\":\"www.x.com.\",\"type\":5,\"TTL\":30,\"data\":\"x.cdn.net.\"},{\"name\":\"x.cdn.net.\",\"type\":1,\"TTL\":120,\"data\":\"104.18.2.3\"},{\"name\":\"x.cdn.net.\",\"type\":1,\"TTL\":300,\"data\":\"104.18.2.4\"}]}";
        NazDnsCore.Answer a = NazDnsCore.parse(json, false);
        check(a.ips.equals(Arrays.asList("104.18.2.3", "104.18.2.4")), "A records");
        check(a.ttl == 120, "shortest TTL");
        check(NazDnsCore.parse("{\"Status\":3,\"Answer\":[]}", false).ips.isEmpty(), "NXDOMAIN");
        check(NazDnsCore.parse("{\"Status\":0}", false).ips.isEmpty(), "no answer");
        check(NazDnsCore.parse("{\"Status\":0,\"Answer\":[{\"type\":1,\"TTL\":5,\"data\":\"999.1.1.1\"}]}", false).ips.isEmpty(), "invalid address dropped");
        check(NazDnsCore.parse("{\"Status\":0,\"Answer\":[{\"type\":1,\"TTL\":5,\"data\":\"1.2.3.4\"}]}", false).ttl == 60, "TTL at least 60s");
        check(NazDnsCore.parse("{\"Status\":0,\"Answer\":[{\"type\":28,\"TTL\":99999,\"data\":\"2606:4700::6810:1\"}]}", true).ips.get(0).equals("2606:4700::6810:1"), "AAAA");
        check(NazDnsCore.parse("{\"Status\":0,\"Answer\":[{\"type\":28,\"TTL\":99999,\"data\":\"2606:4700::6810:1\"}]}", true).ttl == 3600, "TTL at most 1h");
        check(NazDnsCore.parse("{\"Status\":0,\"Answer\":[{\"type\":28,\"data\":\"2606::1\"}]}", false).ips.isEmpty(), "AAAA ignored when asking A");

        // Rewriting keeps the path, query and port; IPv6 goes in brackets.
        check(NazDnsCore.rewrite("https://api.openai.com/v1/chat/completions?x=1", "104.18.2.3").equals("https://104.18.2.3/v1/chat/completions?x=1"), "rewrite");
        check(NazDnsCore.rewrite("https://h.example:8443/a", "1.2.3.4").equals("https://1.2.3.4:8443/a"), "port kept");
        check(NazDnsCore.rewrite("https://h.example", "2606::1").equals("https://[2606::1]/"), "ipv6 brackets");
        check(NazDnsCore.hostHeader(new URL("https://api.openai.com/v1")).equals("api.openai.com"), "host header");
        check(NazDnsCore.hostHeader(new URL("https://h.example:8443/a")).equals("h.example:8443"), "host header with port");
        check(NazDnsCore.isIpLiteral("1.1.1.1") && NazDnsCore.isIpLiteral("[2606::1]") && !NazDnsCore.isIpLiteral("api.github.com"), "ip literal");

        // Cache: remembered until the TTL runs out.
        NazDnsCore.clear();
        NazDnsCore.remember("API.example", a, 1000);
        check(NazDnsCore.cached("api.example", 1000 + 119000) != null, "cached within TTL");
        check(NazDnsCore.cached("api.example", 1000 + 121000) == null, "expired after TTL");
        System.out.println("RESULT NazDnsCore passed; " + assertions + " assertions; production source; host JVM");
    }
}
