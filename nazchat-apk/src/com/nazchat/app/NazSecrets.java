package com.nazchat.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Map;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Keystore-backed secret storage. Raw keys never enter localStorage, backups or JavaScript. */
public final class NazSecrets {
    private static final String KEY_ALIAS = "KitaChatSecretsKeyV1";
    private static final String PREFS = "kita_secrets_v1";
    private static final String PREFIX = "v1:";
    private static final String ORIGIN_PREFS = "kita_secret_origins_v1";
    private final Context context;

    public NazSecrets(Context context) { this.context = context.getApplicationContext(); }

    // JavaScript can reach provider references only. Native namespaces such as
    // "mcp:" (OAuth tokens) are never readable, writable or removable from JS.
    @JavascriptInterface
    public boolean put(String ref, String value) {
        if (!NazSecretPolicy.isJsRef(ref)) return false;
        synchronized (NazSecrets.class) {
            if (!putStored(context, ref, value)) return false;
            // A new key value is the only way to move a key to another host.
            origins(context).edit().remove(ref).commit();
            return true;
        }
    }

    @JavascriptInterface
    public String get(String ref) { return ""; }

    @JavascriptInterface
    public boolean has(String ref) {
        return NazSecretPolicy.isJsRef(ref) && getStored(context, ref).length() > 0;
    }

    @JavascriptInterface
    public boolean remove(String ref) {
        if (!NazSecretPolicy.isJsRef(ref)) return false;
        synchronized (NazSecrets.class) {
            boolean ok = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(PREFIX + ref).commit();
            origins(context).edit().remove(ref).commit();
            return ok;
        }
    }

    /**
     * Provider keys that are stored on this device, without their values: the reference,
     * the last four characters (to tell keys apart) and the host the key is bound to.
     * Lets the app offer saved keys again when provider settings were lost.
     */
    @JavascriptInterface
    public String listProviderKeys() {
        org.json.JSONArray out = new org.json.JSONArray();
        synchronized (NazSecrets.class) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            SharedPreferences bindings = origins(context);
            for (String key : prefs.getAll().keySet()) {
                if (!key.startsWith(PREFIX)) continue;
                String ref = key.substring(PREFIX.length());
                if (!NazSecretPolicy.isProviderRef(ref)) continue;
                String value = getStored(context, ref);
                if (value.length() == 0) continue;
                try {
                    org.json.JSONObject item = new org.json.JSONObject();
                    item.put("ref", ref);
                    item.put("hint", value.length() >= 12 ? value.substring(value.length() - 4) : "");
                    item.put("origin", bindings.getString(ref, ""));
                    out.put(item);
                } catch (Exception ignored) {}
            }
        }
        return out.toString();
    }

    /** Removes provider keys only; MCP credentials are managed by NazOAuth. */
    @JavascriptInterface
    public void clearAll() {
        synchronized (NazSecrets.class) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            SharedPreferences.Editor edit = prefs.edit();
            for (String key : prefs.getAll().keySet()) {
                if (key.startsWith(PREFIX) && NazSecretPolicy.isJsRef(key.substring(PREFIX.length()))) edit.remove(key);
            }
            edit.commit();
            origins(context).edit().clear().commit();
        }
    }

    /**
     * The provider key to attach to a request for {@code url}, or "" when none is
     * stored. Throws (and attaches nothing) for non-provider refs, non-HTTPS URLs
     * and hosts other than the one the key is bound to.
     */
    static synchronized String keyForRequest(Context context, String ref, String url) throws java.io.IOException {
        if (NazSecretPolicy.isSearchRef(ref)) {
            NazSecretPolicy.authorizeSearch(ref, url);
            String all = getStored(context, NazSecretPolicy.searchBase(ref));
            if (all.length() == 0) return "";
            String[] keys = all.split("\n");
            return keys[NazSecretPolicy.searchIndex(ref) % keys.length].trim();
        }
        if (NazSecretPolicy.isIntegrationRef(ref)) {
            NazSecretPolicy.authorizeIntegration(ref, url);
            return getStored(context, ref);
        }
        if (!NazSecretPolicy.isProviderRef(ref)) throw new java.io.IOException("Secret reference refused");
        String key = getStored(context, ref);
        if (key.length() == 0) return "";
        String origin = NazSecretPolicy.originOf(url);
        SharedPreferences bindings = origins(context);
        String bound = bindings.getString(ref, null);
        String allowed = NazSecretPolicy.authorize(bound, origin);
        if (bound == null && !bindings.edit().putString(ref, allowed).commit())
            throw new java.io.IOException("Could not record the API key's host");
        return key;
    }

    private static SharedPreferences origins(Context context) {
        return context.getSharedPreferences(ORIGIN_PREFS, Context.MODE_PRIVATE);
    }

    public static synchronized boolean putStored(Context context, String ref, String value) {
        if (ref == null || ref.length() == 0 || value == null) return false;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getKey());
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] out = new byte[cipher.getIV().length + encrypted.length];
            System.arraycopy(cipher.getIV(), 0, out, 0, cipher.getIV().length);
            System.arraycopy(encrypted, 0, out, cipher.getIV().length, encrypted.length);
            String encoded = Base64.encodeToString(out, Base64.NO_WRAP);
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(PREFIX + ref, encoded).apply();
            return true;
        } catch (Exception ignored) { return false; }
    }

    public static synchronized String getStored(Context context, String ref) {
        if (ref == null || ref.length() == 0) return "";
        try {
            String encoded = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PREFIX + ref, null);
            if (encoded == null || encoded.length() == 0) return "";
            byte[] all = Base64.decode(encoded, Base64.NO_WRAP);
            if (all.length < 13) return "";
            byte[] iv = new byte[12];
            byte[] encrypted = new byte[all.length - iv.length];
            System.arraycopy(all, 0, iv, 0, iv.length);
            System.arraycopy(all, iv.length, encrypted, 0, encrypted.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getKey(), new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (Exception ignored) { return ""; }
    }

    private static SecretKey getKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
        return kg.generateKey();
    }
}
