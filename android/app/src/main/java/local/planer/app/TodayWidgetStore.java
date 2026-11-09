package local.planer.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

final class TodayWidgetStore {
    private static final String PREFS = "pulse_today_widget";
    private static final String KEY_LINES = "lines";
    private static final String KEY_SUBTITLE = "subtitle";
    private static final String KEY_THEME = "theme";
    private static final String KEY_UPDATED = "updated";
    private static final String FILE_NAME = "today_widget.txt";

    private TodayWidgetStore() {}

    static void save(Context context, String lines, String subtitle) {
        save(context, lines, subtitle, theme(context));
    }

    static void save(Context context, String lines, String subtitle, String themeId) {
        String safeLines = lines == null ? "" : lines;
        String safeSubtitle = subtitle == null ? "" : subtitle;
        String safeTheme = themeId == null || themeId.trim().isEmpty() ? "turquoise" : themeId.trim();
        SharedPreferences.Editor editor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        editor.putString(KEY_LINES, safeLines);
        editor.putString(KEY_SUBTITLE, safeSubtitle);
        editor.putString(KEY_THEME, safeTheme);
        editor.putLong(KEY_UPDATED, System.currentTimeMillis());
        editor.commit();
        writeFile(context, safeTheme + "\n" + safeSubtitle + "\n" + safeLines);
    }

    static String lines(Context context) {
        String fromPrefs = prefs(context).getString(KEY_LINES, "");
        if (fromPrefs != null && !fromPrefs.trim().isEmpty()) return fromPrefs;
        String fromFile = readFile(context);
        if (fromFile == null || fromFile.isEmpty()) return "";
        String[] parts = fromFile.split("\n", 3);
        return parts.length >= 3 ? parts[2] : (parts.length == 2 ? parts[1] : "");
    }

    static String subtitle(Context context) {
        String fromPrefs = prefs(context).getString(KEY_SUBTITLE, "");
        if (fromPrefs != null && !fromPrefs.trim().isEmpty()) return fromPrefs;
        String fromFile = readFile(context);
        if (fromFile == null || fromFile.isEmpty()) return "";
        String[] parts = fromFile.split("\n", 3);
        if (parts.length >= 2) return parts[1];
        return parts[0];
    }

    static String theme(Context context) {
        String fromPrefs = prefs(context).getString(KEY_THEME, "");
        if (fromPrefs != null && !fromPrefs.trim().isEmpty()) return fromPrefs;
        String fromFile = readFile(context);
        if (fromFile == null || fromFile.isEmpty()) return "turquoise";
        String[] parts = fromFile.split("\n", 3);
        return parts.length >= 3 ? parts[0] : "turquoise";
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static void writeFile(Context context, String text) {
        try (FileOutputStream out = new FileOutputStream(file(context))) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
        } catch (Exception ignored) {
            /* prefs still hold the value */
        }
    }

    private static String readFile(Context context) {
        File target = file(context);
        if (!target.isFile()) return "";
        try (FileInputStream in = new FileInputStream(target)) {
            byte[] data = new byte[(int) target.length()];
            int read = in.read(data);
            if (read <= 0) return "";
            return new String(data, 0, read, StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            return "";
        }
    }

    private static File file(Context context) {
        return new File(context.getFilesDir(), FILE_NAME);
    }
}
