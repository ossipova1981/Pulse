package local.planer.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

final class PhoneCopy {
    private static final String FILE_NAME = "planer.json";
    private static final String RELATIVE_PATH = Environment.DIRECTORY_DOWNLOADS + "/Pulse/";
    private static final String[] RELATIVE_CANDIDATES = new String[] {
        Environment.DIRECTORY_DOWNLOADS + "/Pulse/",
        Environment.DIRECTORY_DOWNLOADS + "/Pulse",
        "Download/Pulse/",
        "Download/Pulse",
        "Downloads/Pulse/",
        "Downloads/Pulse"
    };

    private PhoneCopy() {}

    static void write(Context context, String text) throws Exception {
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        Exception mediaError = null;
        if (Build.VERSION.SDK_INT >= 29) {
            try {
                writeMediaStore(context, bytes);
            } catch (Exception error) {
                mediaError = error;
            }
        }
        try {
            writeLegacy(bytes);
            return;
        } catch (Exception legacyError) {
            if (mediaError != null) throw mediaError;
            throw legacyError;
        }
    }

    static String read(Context context) throws Exception {
        List<String> candidates = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 29) {
            String fromStore = readMediaStore(context);
            if (fromStore != null && !fromStore.trim().isEmpty()) candidates.add(fromStore);
        }
        String legacy = readLegacy();
        if (legacy != null && !legacy.trim().isEmpty()) candidates.add(legacy);

        String best = "";
        int bestWeight = -1;
        for (String text : candidates) {
            int weight = roughWeight(text);
            if (weight > bestWeight) {
                bestWeight = weight;
                best = text;
            }
        }
        return best;
    }

    private static int roughWeight(String text) {
        if (text == null || text.isEmpty()) return 0;
        int score = 0;
        if (text.contains("\"entries\"")) score += 1;
        if (text.contains("\"habits\"")) score += 1;
        if (text.contains("\"lists\"")) score += 1;
        // Prefer larger payloads when both look valid.
        score += Math.min(50, text.length() / 200);
        return score;
    }

    private static void writeMediaStore(Context context, byte[] bytes) throws Exception {
        ContentResolver resolver = context.getContentResolver();
        Uri existing = find(resolver);
        Uri target = existing;
        if (target == null) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, FILE_NAME);
            values.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, RELATIVE_PATH);
            target = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        }
        if (target == null) throw new IllegalStateException("no downloads uri");
        try (OutputStream output = resolver.openOutputStream(target, "wt")) {
            if (output == null) throw new IllegalStateException("no output");
            output.write(bytes);
        }
    }

    private static String readMediaStore(Context context) throws Exception {
        ContentResolver resolver = context.getContentResolver();
        Uri uri = find(resolver);
        if (uri == null) uri = findLoose(resolver);
        if (uri == null) return "";
        try (InputStream input = resolver.openInputStream(uri)) {
            if (input == null) return "";
            return readAll(input);
        }
    }

    private static Uri find(ContentResolver resolver) {
        for (String relative : RELATIVE_CANDIDATES) {
            Uri uri = queryOne(resolver, MediaStore.MediaColumns.DISPLAY_NAME + "=? AND " + MediaStore.MediaColumns.RELATIVE_PATH + "=?", new String[] { FILE_NAME, relative });
            if (uri != null) return uri;
        }
        return null;
    }

    private static Uri findLoose(ContentResolver resolver) {
        String[] projection = new String[] {
            MediaStore.MediaColumns._ID,
            MediaStore.MediaColumns.RELATIVE_PATH,
            MediaStore.MediaColumns.DISPLAY_NAME
        };
        try (Cursor cursor = resolver.query(
            MediaStore.Downloads.EXTERNAL_CONTENT_URI,
            projection,
            MediaStore.MediaColumns.DISPLAY_NAME + "=?",
            new String[] { FILE_NAME },
            MediaStore.MediaColumns.DATE_MODIFIED + " DESC"
        )) {
            if (cursor == null) return null;
            while (cursor.moveToNext()) {
                String relative = cursor.getString(1);
                String name = cursor.getString(2);
                if (!FILE_NAME.equals(name)) continue;
                if (relative != null && relative.replace('\\', '/').toLowerCase().contains("pulse")) {
                    long id = cursor.getLong(0);
                    return Uri.withAppendedPath(MediaStore.Downloads.EXTERNAL_CONTENT_URI, String.valueOf(id));
                }
            }
            // Last resort: any planer.json in Downloads.
            if (cursor.moveToFirst()) {
                long id = cursor.getLong(0);
                return Uri.withAppendedPath(MediaStore.Downloads.EXTERNAL_CONTENT_URI, String.valueOf(id));
            }
        }
        return null;
    }

    private static Uri queryOne(ContentResolver resolver, String selection, String[] args) {
        String[] projection = new String[] { MediaStore.MediaColumns._ID };
        try (Cursor cursor = resolver.query(
            MediaStore.Downloads.EXTERNAL_CONTENT_URI,
            projection,
            selection,
            args,
            MediaStore.MediaColumns.DATE_MODIFIED + " DESC"
        )) {
            if (cursor == null || !cursor.moveToFirst()) return null;
            long id = cursor.getLong(0);
            return Uri.withAppendedPath(MediaStore.Downloads.EXTERNAL_CONTENT_URI, String.valueOf(id));
        }
    }

    private static File legacyFile(boolean create) {
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Pulse");
        if (create && !dir.exists()) dir.mkdirs();
        return new File(dir, FILE_NAME);
    }

    private static void writeLegacy(byte[] bytes) throws Exception {
        File file = legacyFile(true);
        try (FileOutputStream output = new FileOutputStream(file, false)) {
            output.write(bytes);
        }
    }

    private static String readLegacy() throws Exception {
        File file = legacyFile(false);
        if (!file.isFile() || !file.canRead()) return "";
        try (FileInputStream input = new FileInputStream(file)) {
            return readAll(input);
        }
    }

    private static String readAll(InputStream input) throws Exception {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[4096];
        int count;
        while ((count = input.read(chunk)) >= 0) {
            buffer.write(chunk, 0, count);
        }
        return buffer.toString(StandardCharsets.UTF_8.name());
    }
}
