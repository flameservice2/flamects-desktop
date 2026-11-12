package android.print;

import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;

import java.io.File;

/**
 * Writes what a WebView would print straight into a PDF file, without the
 * print dialog. Lives in android.print because the layout/write callbacks
 * can only be created from this package.
 */
public class PdfExporter {
  public interface Done { void done(boolean ok, String error); }

  public static void export(final PrintDocumentAdapter adapter, final PrintAttributes attrs, final File out, final Done done) {
    adapter.onStart();
    adapter.onLayout(null, attrs, new CancellationSignal(), new PrintDocumentAdapter.LayoutResultCallback() {
      @Override public void onLayoutFinished(PrintDocumentInfo info, boolean changed) {
        final ParcelFileDescriptor pfd;
        try {
          pfd = ParcelFileDescriptor.open(out, ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE | ParcelFileDescriptor.MODE_READ_WRITE);
        } catch (Exception e) { adapter.onFinish(); done.done(false, String.valueOf(e)); return; }
        adapter.onWrite(new PageRange[]{PageRange.ALL_PAGES}, pfd, new CancellationSignal(), new PrintDocumentAdapter.WriteResultCallback() {
          @Override public void onWriteFinished(PageRange[] pages) { close(pfd); adapter.onFinish(); done.done(true, null); }
          @Override public void onWriteFailed(CharSequence error) { close(pfd); adapter.onFinish(); done.done(false, String.valueOf(error)); }
          @Override public void onWriteCancelled() { close(pfd); adapter.onFinish(); done.done(false, "cancelled"); }
        });
      }
      @Override public void onLayoutFailed(CharSequence error) { adapter.onFinish(); done.done(false, String.valueOf(error)); }
      @Override public void onLayoutCancelled() { adapter.onFinish(); done.done(false, "cancelled"); }
    }, new Bundle());
  }

  static void close(ParcelFileDescriptor p) { try { p.close(); } catch (Exception e) { /* ignore */ } }
}
