package com.nazchat.app;

import java.io.IOException;
import org.json.JSONObject;

/** OAuth token endpoint failure with the server's own reason (RFC 6749 section 5.2). */
final class NazOAuthError extends IOException {
    final int status;
    final String error, description;

    private NazOAuthError(int status, String error, String description) {
        super("Sign-in failed at the token step (HTTP " + status
            + (error.isEmpty() ? "" : ": " + error) + (description.isEmpty() ? "" : " - " + description) + "). Sign in again.");
        this.status = status; this.error = error; this.description = description;
    }

    static NazOAuthError from(int status, String body) {
        String error = "", description = "";
        try {
            JSONObject o = new JSONObject(body == null ? "" : body);
            error = o.optString("error", "");
            description = o.optString("error_description", "");
        } catch (Exception ignored) {}
        error = error.matches("[A-Za-z0-9_.-]{1,60}") ? error : "";
        description = description.replaceAll("[\\p{Cntrl}]", " ").trim();
        if (description.length() > 160) description = description.substring(0, 160);
        return new NazOAuthError(status, error, description);
    }

    /** The server rejected the RFC 8707 resource parameter. */
    boolean rejectsResource() {
        return "invalid_target".equals(error)
            || ("invalid_request".equals(error) && description.toLowerCase(java.util.Locale.US).contains("resource"));
    }
}
