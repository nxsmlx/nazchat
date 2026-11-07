package com.nazchat.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.UriMatcher;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/** Minimal FileProvider: serves files under cache/update/ as content:// URIs. */
public class NazFileProvider extends ContentProvider {
    private static final UriMatcher MATCHER = new UriMatcher(UriMatcher.NO_MATCH);
    private static final int FILE = 1;

    @Override public boolean onCreate() {
        MATCHER.addURI(getContext().getPackageName() + ".updateprovider", "*/*", FILE);
        MATCHER.addURI(getContext().getPackageName() + ".updateprovider", "*", FILE);
        return true;
    }
    private File fileFor(Uri uri) {
        String name = Uri.decode(uri.getPathSegments().get(0));
        File f = new File(getContext().getCacheDir(), "update" + File.separator + name);
        try { if (f.getCanonicalPath().startsWith(new File(getContext().getCacheDir(), "update").getCanonicalPath())) return f; } catch (Exception ignored) {}
        return null;
    }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = fileFor(uri);
        if (f == null || !f.exists()) throw new FileNotFoundException(uri.toString());
        return ParcelFileDescriptor.open(f, mode.contains("w") ? ParcelFileDescriptor.MODE_WRITE_ONLY : ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public String getType(Uri uri) {
        if (uri.getLastPathSegment() != null && uri.getLastPathSegment().endsWith(".apk"))
            return "application/vnd.android.package-archive";
        return "application/octet-stream";
    }
    @Override public Cursor query(Uri uri, String[] cols, String sel, String[] args, String sort) {
        File f = fileFor(uri); if (f == null) return null;
        MatrixCursor c = new MatrixCursor(cols == null ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : cols);
        c.addRow(new Object[]{f.getName(), f.length()});
        return c;
    }
    @Override public Uri insert(Uri uri, ContentValues v) { return null; }
    @Override public int delete(Uri uri, String s, String[] a) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
