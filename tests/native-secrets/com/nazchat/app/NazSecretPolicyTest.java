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

        // Integration tokens: fixed official API origin per service, nothing else.
        check(NazSecretPolicy.isIntegrationRef("integration:github"), "github integration ref");
        check(NazSecretPolicy.isJsRef("integration:supabase"), "supabase reachable from JS");
        check(!NazSecretPolicy.isIntegrationRef("integration:evil"), "unknown service refused");
        check(!NazSecretPolicy.isJsRef("integration:"), "empty service refused");
        check(!NazSecretPolicy.isProviderRef("integration:github"), "integration is not a provider ref");
        io(() -> NazSecretPolicy.authorizeIntegration("integration:github", "https://api.github.com/user/repos"));
        io(() -> NazSecretPolicy.authorizeIntegration("integration:vercel", "https://API.vercel.com/v13/deployments?x=1"));
        io(() -> NazSecretPolicy.authorizeIntegration("integration:cloudflare", "https://api.cloudflare.com/client/v4/accounts"));
        io(() -> NazSecretPolicy.authorizeIntegration("integration:supabase", "https://api.supabase.com/v1/projects"));
        refused("github token to another host", io(() -> NazSecretPolicy.authorizeIntegration("integration:github", "https://evil.example/repos")));
        refused("github token to look-alike", io(() -> NazSecretPolicy.authorizeIntegration("integration:github", "https://api.github.com.evil.example/")));
        refused("vercel token over http", io(() -> NazSecretPolicy.authorizeIntegration("integration:vercel", "http://api.vercel.com/v13/deployments")));
        refused("cloudflare token to workers.dev", io(() -> NazSecretPolicy.authorizeIntegration("integration:cloudflare", "https://site.example.workers.dev/")));
        refused("supabase token to a project URL", io(() -> NazSecretPolicy.authorizeIntegration("integration:supabase", "https://abc.supabase.co/rest/v1/")));
        refused("token for another service's API", io(() -> NazSecretPolicy.authorizeIntegration("integration:github", "https://api.vercel.com/v13/deployments")));

        System.out.println("RESULT NazSecretPolicy passed; " + assertions + " assertions; production source; host JVM");
    }
}
