package com.flamects.cts;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Hands files the app made (PDFs, Excel exports) to WhatsApp, email and
 * other apps, read-only, from the app's cache/shared folder only.
 */
public class SharedFiles extends ContentProvider {
  File file(Uri uri) throws FileNotFoundException {
    String name = uri.getLastPathSegment();
    if (name == null || name.contains("/") || name.contains("..")) throw new FileNotFoundException();
    File f = new File(new File(getContext().getCacheDir(), "shared"), name);
    if (!f.exists()) throw new FileNotFoundException();
    return f;
  }

  @Override public boolean onCreate() { return true; }

  @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
    return ParcelFileDescriptor.open(file(uri), ParcelFileDescriptor.MODE_READ_ONLY);
  }

  @Override public String getType(Uri uri) {
    return MainActivity.mimeOf(String.valueOf(uri.getLastPathSegment()));
  }

  @Override public Cursor query(Uri uri, String[] projection, String sel, String[] args, String sort) {
    File f;
    try { f = file(uri); } catch (FileNotFoundException e) { return null; }
    String[] cols = projection != null ? projection : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
    MatrixCursor c = new MatrixCursor(cols);
    Object[] row = new Object[cols.length];
    for (int i = 0; i < cols.length; i++) {
      if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i] = f.getName();
      else if (OpenableColumns.SIZE.equals(cols[i])) row[i] = f.length();
    }
    c.addRow(row);
    return c;
  }

  @Override public Uri insert(Uri uri, ContentValues v) { return null; }
  @Override public int delete(Uri uri, String s, String[] a) { return 0; }
  @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
