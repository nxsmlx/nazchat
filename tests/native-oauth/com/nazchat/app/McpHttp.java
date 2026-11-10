package com.nazchat.app;

import java.io.IOException;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** Scripted HTTPS responder. No sockets, DNS, or production transport code. */
final class McpHttp {
    static final String RESOURCE = "https://resource.example/mcp";
    static final String ISSUER = "https://issuer.example/tenant";
    static final String METADATA = "https://resource.example/protected-metadata";
    static final String AUTH = "https://issuer.example/authorize";
    static final String TOKEN = "https://issuer.example/token";
    interface Control { void opened(HttpURLConnection connection) throws Exception; }
    static final class Response {
        final int status; final String body; final Map<String, String> headers;
        Response(int status, String body, Map<String, String> headers) {
            this.status = status; this.body = body; this.headers = headers;
        }
        String header(String name) { String v = headers.get(name); return v == null ? "" : v; }
    }
    static final class Request {
        final String url, method, body;
        final Map<String, String> headers;
        final JSONObject form;
        Request(String url, String method, Map<String, String> headers, String body) throws Exception {
            this.url = url; this.method = method; this.headers = new HashMap<String, String>(headers); this.body = body;
            form = new JSONObject();
            if ("application/x-www-form-urlencoded".equals(headers.get("Content-Type"))) {
                for (String pair : body.split("&")) {
                    String[] p = pair.split("=", 2);
                    form.put(URLDecoder.decode(p[0], "UTF-8"), URLDecoder.decode(p[1], "UTF-8"));
                }
            }
        }
    }
    static final class Gate {
        final CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
        void awaitEntered() throws Exception {
            if (!entered.await(3, TimeUnit.SECONDS)) throw new AssertionError("Token request did not reach gate");
        }
    }
    static final List<Request> requests = Collections.synchronizedList(new ArrayList<Request>());
    static final BlockingQueue<JSONObject> tokenReplies = new LinkedBlockingQueue<JSONObject>();
    static volatile JSONObject protectedMetadata, authorizationMetadata;
    static volatile Gate nextGate;
    static volatile Control lastControl;
    static void reset() throws Exception {
        requests.clear(); tokenReplies.clear(); nextGate = null; lastControl = null;
        protectedMetadata = new JSONObject().put("resource", RESOURCE)
            .put("authorization_servers", new JSONArray().put(ISSUER));
        authorizationMetadata = new JSONObject().put("issuer", ISSUER)
            .put("authorization_endpoint", AUTH).put("token_endpoint", TOKEN)
            .put("code_challenge_methods_supported", new JSONArray().put("S256"))
            .put("authorization_response_iss_parameter_supported", true)
            .put("client_id_metadata_document_supported", true);
    }
    static URL checked(String value) throws Exception {
        URL url = new URL(value);
        if (!"https".equals(url.getProtocol()) || url.getHost().isEmpty()
                || url.getUserInfo() != null || url.getRef() != null)
            throw new IOException("Fixture requires HTTPS URL without credentials or fragments");
        return url;
    }
    static Map<String, String> jsonHeaders() {
        Map<String, String> headers = new HashMap<String, String>(); headers.put("Accept", "application/json"); return headers;
    }
    static Response request(String url, String method, Map<String, String> headers, String body, Control control) throws Exception {
        checked(url);
        Request request = new Request(url, method, headers, body); requests.add(request);
        if (control != null) {
            lastControl = control;
            control.opened(new HttpURLConnection(new URL(url)) {
                public void connect() {} public void disconnect() {} public boolean usingProxy() { return false; }
            });
        }
        if (RESOURCE.equals(url) && "POST".equals(method)) {
            Map<String, String> h = new HashMap<String, String>();
            h.put("www-authenticate", "Bearer resource_metadata=\"" + METADATA + "\", scope=\"tools:read tools:write\"");
            return new Response(401, "", h);
        }
        if (METADATA.equals(url) && "GET".equals(method)) return json(protectedMetadata);
        if ("GET".equals(method) && (url.equals("https://issuer.example/.well-known/oauth-authorization-server/tenant")
                || url.equals(ISSUER + "/.well-known/openid-configuration")
                || url.equals("https://issuer.example/.well-known/openid-configuration/tenant"))) return json(authorizationMetadata);
        if (TOKEN.equals(url) && "POST".equals(method)) {
            Gate gate = nextGate; nextGate = null;
            if (gate != null) {
                gate.entered.countDown();
                if (!gate.release.await(3, TimeUnit.SECONDS)) throw new AssertionError("Token gate not released");
            }
            JSONObject reply = tokenReplies.poll();
            if (reply == null) throw new AssertionError("Unscripted token request");
            if (reply.has("__status")) {
                int status = reply.getInt("__status"); JSONObject errorBody = new JSONObject(reply.toString()); errorBody.remove("__status");
                return new Response(status, errorBody.toString(), Collections.<String, String>emptyMap());
            }
            return json(reply);
        }
        throw new AssertionError("Unexpected fake HTTP request: " + method + " " + url);
    }
    private static Response json(JSONObject body) {
        return new Response(200, body.toString(), Collections.<String, String>emptyMap());
    }
    static JSONObject getJson(String url) throws Exception { return new JSONObject(request(url, "GET", jsonHeaders(), null, null).body); }
    static JSONObject postJson(String url, JSONObject data) throws Exception {
        Map<String, String> h = jsonHeaders(); h.put("Content-Type", "application/json");
        return new JSONObject(request(url, "POST", h, data.toString(), null).body);
    }
    static JSONObject postForm(String url, JSONObject data) throws Exception { return postForm(url, data, null); }
    static JSONObject postForm(String url, JSONObject data, Control control) throws Exception {
        StringBuilder body = new StringBuilder();
        for (Iterator<String> keys = data.keys(); keys.hasNext();) {
            String key = keys.next(); if (body.length() > 0) body.append('&');
            body.append(URLEncoder.encode(key, "UTF-8")).append('=').append(URLEncoder.encode(data.getString(key), "UTF-8"));
        }
        Map<String, String> h = jsonHeaders(); h.put("Content-Type", "application/x-www-form-urlencoded");
        Response r = request(url, "POST", h, body.toString(), control);
        if (r.status / 100 != 2) throw NazOAuthError.from(r.status, r.body);
        return new JSONObject(r.body);
    }
    static List<Request> forms() {
        List<Request> forms = new ArrayList<Request>();
        synchronized (requests) { for (Request r : requests) if (TOKEN.equals(r.url)) forms.add(r); }
        return forms;
    }
}
