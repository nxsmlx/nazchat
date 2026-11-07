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

/** Keystore-backed provider secret storage. Raw keys never enter localStorage or backups. */
public final class NazSecrets {
    private static final String KEY_ALIAS = "KitaChatSecretsKeyV1";
    private static final String PREFS = "kita_secrets_v1";
    private static final String PREFIX = "v1:";
    private final Context context;

    public NazSecrets(Context context) { this.context = context.getApplicationContext(); }

    @JavascriptInterface
    public synchronized boolean put(String ref, String value) { return putStored(context, ref, value); }

    @JavascriptInterface
    public synchronized String get(String ref) { return ""; }

    @JavascriptInterface
    public synchronized boolean has(String ref) { return getStored(context, ref).length() > 0; }

    @JavascriptInterface
    public synchronized boolean remove(String ref) {
        if (ref == null || ref.length() == 0) return false;
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(PREFIX + ref).apply();
        return true;
    }

    @JavascriptInterface
    public synchronized void clearAll() { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply(); }

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
