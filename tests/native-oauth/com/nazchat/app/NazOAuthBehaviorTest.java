package com.nazchat.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import java.net.URLEncoder;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.json.*;

/** Executes production NazOAuth with host-only fixtures. Not a device/browser test. */
public final class NazOAuthBehaviorTest {
    private static int passed, assertions, nextId;
    private static final String ACCESS = "private-access-sentinel", REFRESH = "private-refresh-sentinel";
    interface Case { void run() throws Exception; }
    static void check(boolean condition, String message) {
        assertions++; if (!condition) throw new AssertionError(message);
    }
    static void eq(Object expected, Object actual, String message) {
        check(Objects.equals(expected, actual), message + ": expected " + expected + ", got " + actual);
    }
    static void test(String name, Case test) throws Exception {
        NazSecrets.reset(); NazApp.reset(); McpHttp.reset();
        test.run(); passed++; System.out.println("PASS " + name);
    }
    static JSONObject tokens(String access, String refresh) throws Exception {
        JSONObject value = new JSONObject().put("access_token", access).put("token_type", "Bearer").put("expires_in", 3600);
        if (refresh != null) value.put("refresh_token", refresh);
        return value;
    }
    static final class Session {
        final Activity activity = new Activity();
        final NazOAuth oauth = new NazOAuth(activity);
        final String id = "oauth-test-" + (++nextId);
        Uri browser;
        JSONObject pending;
        void begin(String client) throws Exception {
            oauth.start(McpHttp.RESOURCE, id, client);
            Intent intent = activity.awaitBrowser();
            eq(Intent.ACTION_VIEW, intent.getAction(), "Browser action");
            browser = intent.getData();
            pending = new JSONObject(NazSecrets.getStored(activity, pendingKey()));
        }
        String pendingKey() { return "mcp:pending:" + browser.getQueryParameter("state"); }
        Uri callback(String issuer) throws Exception {
            return Uri.parse(NazOAuth.REDIRECT + "?state=" + browser.getQueryParameter("state")
                + "&code=" + URLEncoder.encode("code +&=bound", "UTF-8")
                + (issuer == null ? "" : "&iss=" + URLEncoder.encode(issuer, "UTF-8")));
        }
        JSONObject event(String kind, String message) throws Exception {
            String script = NazApp.awaitPost();
            JSONObject event = new JSONObject(oauth.consumeEvent());
            eq(kind, event.getString("kind"), "Event kind");
            check(event.getString("message").contains(message), "Expected event message: " + message);
            check(script.startsWith("if(window.nazMcpOAuth)"), "Captured NazApp.post bridge event");
            eq("", oauth.consumeEvent(), "Event consumed once");
            noLeaks(event.toString()); noLeaks(script);
            return event;
        }
        void authorize() throws Exception {
            begin(""); McpHttp.tokenReplies.add(tokens(ACCESS, REFRESH));
            oauth.handleRedirect(callback(McpHttp.ISSUER)); event("authorized", "Signed in");
        }
        JSONObject config() throws Exception { return NazOAuth.config(activity, id); }
        void reject(String issuer, String message) throws Exception {
            oauth.handleRedirect(callback(issuer)); event("error", message);
            eq(0, McpHttp.forms().size(), "Rejected callback must not exchange code");
            check(!oauth.hasToken(id), "Rejected callback must not store a token");
            eq("", NazSecrets.getStored(activity, pendingKey()), "Rejected state is consumed");
        }
    }
    static void noLeaks(String value) {
        for (String secret : new String[]{ACCESS, REFRESH, "rotated-access-sentinel", "rotated-refresh-sentinel"})
            check(!value.contains(secret), "Token must not appear in event");
    }
    static void join(Thread thread) throws Exception {
        thread.join(3000); check(!thread.isAlive(), "Worker must finish within 3 seconds");
    }
    public static void main(String[] args) throws Exception {
        test("production PKCE S256 and authorization-code resource binding", () -> {
            Session s = new Session(); s.begin("");
            String verifier = s.pending.getString("verifier"), state = s.browser.getQueryParameter("state");
            check(verifier.matches("[A-Za-z0-9_-]{43}"), "32-byte verifier is 43 unpadded base64url chars");
            check(state.matches("[A-Za-z0-9_-]{43}"), "State is 43 unpadded base64url chars");
            String challenge = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(
                MessageDigest.getInstance("SHA-256").digest(verifier.getBytes("US-ASCII")));
            eq(43, s.browser.getQueryParameter("code_challenge").length(), "S256 challenge length");
            eq(challenge, s.browser.getQueryParameter("code_challenge"), "Production challenge is SHA-256(verifier)");
            eq("S256", s.browser.getQueryParameter("code_challenge_method"), "Challenge method");
            eq(NazOAuth.CLIENT_DOC, s.browser.getQueryParameter("client_id"), "Metadata document client ID");
            eq(NazOAuth.REDIRECT, s.browser.getQueryParameter("redirect_uri"), "Redirect binding");
            eq(McpHttp.RESOURCE, s.browser.getQueryParameter("resource"), "Authorization resource binding");
            eq("tools:read tools:write", s.browser.getQueryParameter("scope"), "Challenge scope");
            McpHttp.tokenReplies.add(tokens(ACCESS, REFRESH));
            s.oauth.handleRedirect(s.callback(McpHttp.ISSUER)); s.event("authorized", "Signed in");
            McpHttp.Request request = McpHttp.forms().get(0);
            eq(McpHttp.TOKEN, request.url, "Token endpoint");
            eq("application/x-www-form-urlencoded", request.headers.get("Content-Type"), "Exchange form content type");
            JSONObject form = request.form;
            eq(6, form.length(), "Public exchange has no client secret");
            eq("authorization_code", form.getString("grant_type"), "Grant type");
            eq("code +&=bound", form.getString("code"), "Code survives form encoding");
            eq(verifier, form.getString("code_verifier"), "Exchange uses pending verifier");
            eq(McpHttp.RESOURCE, form.getString("resource"), "Exchange resource binding");
            eq(NazOAuth.REDIRECT, form.getString("redirect_uri"), "Exchange redirect binding");
            eq(NazOAuth.CLIENT_DOC, form.getString("client_id"), "Exchange client binding");
            eq(ACCESS, s.config().getString("access_token"), "Access token stored");
            check(s.oauth.hasToken(s.id), "hasToken after authorization");
            eq("", NazSecrets.getStored(s.activity, s.pendingKey()), "Pending state deleted");
        });
        test("manual public client ID wins and is trimmed", () -> {
            McpHttp.authorizationMetadata.put("client_id_metadata_document_supported", false)
                .put("registration_endpoint", "https://issuer.example/register");
            Session s = new Session(); s.begin("  manual-client +&  ");
            eq("manual-client +&", s.browser.getQueryParameter("client_id"), "Manual client ID");
            McpHttp.tokenReplies.add(tokens(ACCESS, REFRESH));
            s.oauth.handleRedirect(s.callback(McpHttp.ISSUER)); s.event("authorized", "Signed in");
            eq("manual-client +&", McpHttp.forms().get(0).form.getString("client_id"), "Manual ID in exchange");
        });
        test("manual ID required without registration or client metadata support", () -> {
            McpHttp.authorizationMetadata.put("client_id_metadata_document_supported", false);
            Session s = new Session(); s.oauth.start(McpHttp.RESOURCE, s.id, "");
            s.event("error", "pre-registered public client ID");
            eq(0, s.activity.launchCount(), "No browser launch"); eq(0, s.config().length(), "No config stored");
        });
        test("authorization metadata issuer mismatch rejects every candidate", () -> {
            McpHttp.authorizationMetadata.put("issuer", "https://attacker.example");
            Session s = new Session(); s.oauth.start(McpHttp.RESOURCE, s.id, "manual");
            s.event("error", "issuer could not be verified");
            eq(5, McpHttp.requests.size(), "Probe, protected metadata, three issuer candidates");
            eq(0, s.activity.launchCount(), "No browser for wrong issuer"); eq(0, s.config().length(), "No config stored");
        });
        test("protected resource mismatch rejects", () -> {
            McpHttp.protectedMetadata.put("resource", "https://other.example/mcp");
            Session s = new Session(); s.oauth.start(McpHttp.RESOURCE, s.id, "manual");
            s.event("error", "Resource metadata does not match"); eq(0, s.activity.launchCount(), "No browser");
        });
        test("missing S256 support rejects", () -> {
            McpHttp.authorizationMetadata.put("code_challenge_methods_supported", new JSONArray().put("plain"));
            Session s = new Session(); s.oauth.start(McpHttp.RESOURCE, s.id, "manual");
            s.event("error", "PKCE S256"); eq(0, s.activity.launchCount(), "No browser");
        });
        test("callback state succeeds once and replay cannot exchange", () -> {
            Session s = new Session(); s.authorize();
            s.oauth.handleRedirect(s.callback(McpHttp.ISSUER)); s.event("error", "expired or already used");
            eq(1, McpHttp.forms().size(), "Replay does not exchange"); eq(ACCESS, s.config().getString("access_token"), "Replay preserves token");
        });
        test("expired pending state rejects without sleeping", () -> {
            Session s = new Session(); s.begin("");
            s.pending.put("created", System.currentTimeMillis() - 600001);
            NazSecrets.putStored(s.activity, s.pendingKey(), s.pending.toString());
            s.reject(McpHttp.ISSUER, "Sign-in expired");
        });
        test("callback iss mismatch rejects", () -> {
            Session s = new Session(); s.begin(""); s.reject("https://attacker.example", "issuer mismatch");
        });
        test("required callback iss cannot be omitted", () -> {
            Session s = new Session(); s.begin(""); s.reject(null, "issuer mismatch");
        });
        test("optional callback iss may be absent but cannot mismatch", () -> {
            McpHttp.authorizationMetadata.put("authorization_response_iss_parameter_supported", false);
            Session bad = new Session(); bad.begin(""); bad.reject("https://attacker.example", "issuer mismatch");
            Session good = new Session(); good.begin(""); McpHttp.tokenReplies.add(tokens(ACCESS, REFRESH));
            good.oauth.handleRedirect(good.callback(null)); good.event("authorized", "Signed in");
            check(good.oauth.hasToken(good.id), "Optional iss omission accepted");
        });
        test("refresh rotation, resource binding, Control and omitted refresh preservation", () -> {
            Session s = new Session(); s.authorize();
            AtomicReference<java.net.HttpURLConnection> opened = new AtomicReference<java.net.HttpURLConnection>();
            McpHttp.Control control = connection -> opened.set(connection);
            McpHttp.tokenReplies.add(tokens("rotated-access-sentinel", "rotated-refresh-sentinel"));
            eq("rotated-access-sentinel", NazOAuth.access(s.activity, s.id, McpHttp.RESOURCE, true, control), "Refreshed access");
            eq(control, McpHttp.lastControl, "Control forwarded to token HTTP"); check(opened.get() != null, "Control opened called");
            JSONObject form = McpHttp.forms().get(1).form;
            eq(4, form.length(), "Public refresh has only four fields"); eq("refresh_token", form.getString("grant_type"), "Refresh grant");
            eq(REFRESH, form.getString("refresh_token"), "Original refresh sent");
            eq(McpHttp.RESOURCE, form.getString("resource"), "Refresh resource binding");
            eq(NazOAuth.CLIENT_DOC, form.getString("client_id"), "Refresh client binding");
            eq("rotated-refresh-sentinel", s.config().getString("refresh_token"), "Rotation stored");
            McpHttp.tokenReplies.add(tokens("next-access", null));
            eq("next-access", NazOAuth.access(s.activity, s.id, McpHttp.RESOURCE, true, null), "Second refresh");
            eq("rotated-refresh-sentinel", McpHttp.forms().get(2).form.getString("refresh_token"), "Rotated refresh used");
            eq("rotated-refresh-sentinel", s.config().getString("refresh_token"), "Omitted refresh preserves rotation");
            eq(1, NazApp.history.size(), "Refresh emits no token-bearing event");
            for (String post : NazApp.history) noLeaks(post);
            eq("next-access", NazOAuth.access(s.activity, s.id, McpHttp.RESOURCE, false, null), "Unexpired access cached");
            eq(3, McpHttp.forms().size(), "Unexpired access does not refresh");
        });
        test("access refuses a different resource endpoint", () -> {
            Session s = new Session(); s.authorize();
            try { NazOAuth.access(s.activity, s.id, "https://other.example/mcp", true, null); throw new AssertionError("Wrong endpoint accepted"); }
            catch (Exception e) { check(e.getMessage().contains("another MCP endpoint"), "Endpoint error"); }
            eq(1, McpHttp.forms().size(), "Wrong endpoint did not refresh");
        });
        test("signOut invalidates pending callback", () -> {
            Session s = new Session(); s.begin(""); s.oauth.signOut(s.id);
            s.reject(McpHttp.ISSUER, "removed or authorization changed"); eq(0, s.config().length(), "Sign-out remains effective");
        });
        test("signOut invalidates in-flight callback completion", () -> {
            Session s = new Session(); s.begin(""); McpHttp.tokenReplies.add(tokens(ACCESS, REFRESH));
            McpHttp.Gate gate = new McpHttp.Gate(); McpHttp.nextGate = gate;
            s.oauth.handleRedirect(s.callback(McpHttp.ISSUER));
            try { gate.awaitEntered(); s.oauth.signOut(s.id); } finally { gate.release.countDown(); }
            s.event("error", "Sign-in was cancelled"); eq(0, s.config().length(), "Callback cannot restore signed-out credentials");
            check(!s.oauth.hasToken(s.id), "No token after cancelled callback");
        });
        test("signOut invalidates in-flight refresh completion", () -> {
            Session s = new Session(); s.authorize(); McpHttp.tokenReplies.add(tokens("rotated-access-sentinel", "rotated-refresh-sentinel"));
            McpHttp.Gate gate = new McpHttp.Gate(); McpHttp.nextGate = gate;
            AtomicReference<Throwable> error = new AtomicReference<Throwable>(); AtomicReference<String> result = new AtomicReference<String>();
            Thread worker = new Thread(() -> {
                try { result.set(NazOAuth.access(s.activity, s.id, McpHttp.RESOURCE, true, null)); }
                catch (Throwable e) { error.set(e); }
            }, "host-refresh-test");
            worker.start();
            try { gate.awaitEntered(); s.oauth.signOut(s.id); } finally { gate.release.countDown(); }
            join(worker); check(error.get() instanceof Exception, "Refresh throws after sign-out");
            check(error.get().getMessage().contains("Authorization changed while refreshing"), "Refresh cancellation reason");
            eq(null, result.get(), "Cancelled refresh returns no token"); eq(0, s.config().length(), "Refresh cannot restore credentials");
            eq("", NazOAuth.access(s.activity, s.id, McpHttp.RESOURCE, false, null), "Signed-out access is empty");
        });
        test("redirect shape rejects authority, fragment and wrong path", () -> {
            check(NazOAuth.isRedirect(Uri.parse(NazOAuth.REDIRECT)), "Canonical redirect accepted");
            for (String uri : new String[]{"https://example.com/oauth/callback", "com.nazchat.app://evil/oauth/callback",
                    NazOAuth.REDIRECT + "#fragment", "com.nazchat.app:/other"})
                check(!NazOAuth.isRedirect(Uri.parse(uri)), "Invalid redirect rejected: " + uri);
        });
        test("token 400 invalid_target retries once without resource and remembers it", () -> {
            Session s = new Session(); s.begin("");
            McpHttp.tokenReplies.add(new JSONObject().put("__status", 400).put("error", "invalid_target").put("error_description", "resource not recognised"));
            McpHttp.tokenReplies.add(tokens(ACCESS, REFRESH));
            s.oauth.handleRedirect(s.callback(McpHttp.ISSUER)); s.event("authorized", "Signed in");
            eq(2, McpHttp.forms().size(), "One retry");
            check(McpHttp.forms().get(0).form.has("resource"), "First attempt sends resource");
            check(!McpHttp.forms().get(1).form.has("resource"), "Retry omits resource");
            eq(true, s.config().optBoolean("noResource"), "Server preference remembered");
            McpHttp.tokenReplies.add(tokens("next-access", REFRESH));
            NazOAuth.access(s.activity, s.id, McpHttp.RESOURCE, true, null);
            check(!McpHttp.forms().get(2).form.has("resource"), "Refresh omits resource too");
        });
        test("token 400 shows the server's reason and does not retry other errors", () -> {
            Session s = new Session(); s.begin("");
            McpHttp.tokenReplies.add(new JSONObject().put("__status", 400).put("error", "invalid_grant").put("error_description", "Authorization code expired"));
            s.oauth.handleRedirect(s.callback(McpHttp.ISSUER));
            JSONObject event = s.event("error", "invalid_grant - Authorization code expired");
            check(event.getString("message").contains("HTTP 400"), "Status kept");
            eq(1, McpHttp.forms().size(), "No retry for invalid_grant");
            check(!s.oauth.hasToken(s.id), "No token stored");
        });
        test("invalid_client forgets a rejected metadata-document client", () -> {
            Session s = new Session(); s.begin("");
            eq(NazOAuth.CLIENT_DOC, s.browser.getQueryParameter("client_id"), "Started with metadata document");
            McpHttp.tokenReplies.add(new JSONObject().put("__status", 400).put("error", "invalid_client"));
            s.oauth.handleRedirect(s.callback(McpHttp.ISSUER)); s.event("error", "invalid_client");
            eq("", s.config().optString("clientId"), "Rejected client forgotten");
            eq(true, s.config().optBoolean("skipCimd"), "Metadata document skipped next time");
            s.oauth.start(McpHttp.RESOURCE, s.id, "");
            s.event("error", "pre-registered public client ID");
        });
        System.out.println("RESULT " + passed + " cases passed; " + assertions + " assertions; production NazOAuth; host fixtures only");
    }
}
