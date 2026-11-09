package com.nazchat.app;

import java.io.IOException;

/** Host-JVM checks for the production NazSecretPolicy (no Android runtime). */
public final class NazSecretPolicyTest {
    private static int assertions;

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    private static void refused(String what, Runnable call) {
        try { call.run(); } catch (RuntimeException e) {
            if (e.getCause() instanceof IOException) { assertions++; return; }
            throw e;
        }
        throw new AssertionError("expected refusal: " + what);
    }

    private interface Io { String run() throws IOException; }
    private static Runnable io(Io call) {
        return () -> { try { call.run(); } catch (IOException e) { throw new RuntimeException(e); } };
    }

    public static void main(String[] args) throws Exception {
        // Only references created by the web UI are reachable from JavaScript.
        check(NazSecretPolicy.isProviderRef("provider:abc"), "provider ref");
        check(NazSecretPolicy.isProviderRef("draft:abc"), "draft ref");
        check(!NazSecretPolicy.isProviderRef("mcp:credentials:server"), "MCP credentials must stay native");
        check(!NazSecretPolicy.isProviderRef("mcp:pending:state"), "MCP pending state must stay native");
        check(!NazSecretPolicy.isProviderRef(""), "empty ref");
        check(!NazSecretPolicy.isProviderRef(null), "null ref");
        check(!NazSecretPolicy.isProviderRef("provider:a\nb"), "control characters");
        check(!NazSecretPolicy.isProviderRef("provider:" + new String(new char[300]).replace('\0', 'x')), "overlong ref");

        // Canonical HTTPS origins.
        check(NazSecretPolicy.originOf("https://API.OpenAI.com/v1/chat/completions").equals("https://api.openai.com"), "lowercase host, no path");
        check(NazSecretPolicy.originOf("https://api.example.com:443/v1").equals("https://api.example.com"), "default port");
        check(NazSecretPolicy.originOf("https://api.example.com:8443/v1").equals("https://api.example.com:8443"), "explicit port kept");
        refused("cleartext", io(() -> NazSecretPolicy.originOf("http://api.example.com/v1")));
        refused("embedded credentials", io(() -> NazSecretPolicy.originOf("https://user:pw@api.example.com/v1")));
        refused("garbage", io(() -> NazSecretPolicy.originOf("not a url")));
        refused("javascript scheme", io(() -> NazSecretPolicy.originOf("javascript:alert(1)")));

        // First authorised use binds; later requests must match exactly.
        check(NazSecretPolicy.authorize(null, "https://api.openai.com").equals("https://api.openai.com"), "first use binds");
        check(NazSecretPolicy.authorize("https://api.openai.com", "https://api.openai.com").equals("https://api.openai.com"), "same origin allowed");
        refused("other host", io(() -> NazSecretPolicy.authorize("https://api.openai.com", "https://evil.example")));
        refused("look-alike subdomain", io(() -> NazSecretPolicy.authorize("https://api.openai.com", "https://api.openai.com.evil.example")));
        refused("other port", io(() -> NazSecretPolicy.authorize("https://api.example.com", "https://api.example.com:8443")));
        try {
            NazSecretPolicy.authorize("https://api.openai.com", "https://evil.example");
        } catch (IOException e) {
            check(e.getMessage().contains("Re-enter the key"), "refusal tells the user how to move the key");
        }

        System.out.println("RESULT NazSecretPolicy passed; " + assertions + " assertions; production source; host JVM");
    }
}
