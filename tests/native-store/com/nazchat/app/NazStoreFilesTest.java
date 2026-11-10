package com.nazchat.app;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/** Host-JVM checks for the production NazStoreFiles (no Android runtime). */
public final class NazStoreFilesTest {
    private static int assertions;
    private static void check(boolean ok, String message) { assertions++; if (!ok) throw new AssertionError(message); }

    public static void main(String[] args) throws Exception {
        File dir = Files.createTempDirectory("kita-store").toFile();
        check(NazStoreFiles.read(dir).isEmpty(), "empty directory reads as empty");

        String first = "{\"savedAt\":1,\"db\":{\"providers\":[{\"name\":\"Ünïcödé ✓ 提供者\"}]}}";
        check(NazStoreFiles.write(dir, first), "first write");
        check(NazStoreFiles.read(dir).equals(first), "round trip keeps UTF-8 text");
        check(!new File(dir, NazStoreFiles.TEMP).exists(), "temp file removed after write");

        String second = "{\"savedAt\":2,\"db\":{}}";
        check(NazStoreFiles.write(dir, second), "second write");
        check(NazStoreFiles.read(dir).equals(second), "latest copy wins");
        check(new String(Files.readAllBytes(new File(dir, NazStoreFiles.PREVIOUS).toPath()), StandardCharsets.UTF_8).equals(first),
            "previous copy kept");

        // Interrupted swap: the current file is missing, the previous copy is used.
        check(new File(dir, NazStoreFiles.NAME).delete(), "simulate interrupted swap");
        check(NazStoreFiles.read(dir).equals(first), "falls back to previous copy");

        // A truncated or empty current file never hides the previous copy.
        try (FileOutputStream out = new FileOutputStream(new File(dir, NazStoreFiles.NAME))) { }
        check(NazStoreFiles.read(dir).equals(first), "empty current file falls back");

        check(!NazStoreFiles.write(dir, ""), "empty text refused");
        check(!NazStoreFiles.write(dir, null), "null refused");
        check(!NazStoreFiles.write(null, "x"), "missing directory refused");
        StringBuilder big = new StringBuilder(NazStoreFiles.MAX_BYTES + 1);
        for (int i = 0; i <= NazStoreFiles.MAX_BYTES; i++) big.append('x');
        check(!NazStoreFiles.write(dir, big.toString()), "oversized state refused");
        check(NazStoreFiles.read(dir).equals(first), "refused writes leave stored data untouched");

        System.out.println("RESULT NazStoreFiles passed; " + assertions + " assertions; production source; host JVM");
    }
}
