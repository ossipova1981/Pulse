package local.planer.app;

import android.content.Context;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

final class TodayWidgetUpdater {
    private static final String EMPTY_PLACEHOLDER = "Пока пусто — открой Pulse";

    private TodayWidgetUpdater() {}

    static void applyJson(Context context, String json) {
        if (json == null || json.trim().isEmpty()) return;
        try {
            JSONObject root = new JSONObject(json);
            String today = localTodayIso();

            // Always trust the ready-made payload from the WebView when it has real text.
            // Date mismatch used to fall through, re-parse to empty, and wipe the widget.
            JSONObject ready = root.optJSONObject("widgetToday");
            if (ready != null) {
                String readyLines = ready.optString("lines", "");
                String readySubtitle = ready.optString("subtitle", "");
                String readyTheme = ready.optString("theme", "turquoise");
                if (readyLines != null && !readyLines.trim().isEmpty() && !isEmptyPlaceholder(readyLines)) {
                    TodayWidgetStore.save(context, readyLines, readySubtitle, readyTheme);
                    return;
                }
            }

            Map<String, List<String>> byBucket = new LinkedHashMap<>();
            byBucket.put("allday", new ArrayList<>());
            byBucket.put("morning", new ArrayList<>());
            byBucket.put("day", new ArrayList<>());
            byBucket.put("evening", new ArrayList<>());

            JSONArray entries = root.optJSONArray("entries");
            if (entries != null) {
                for (int i = 0; i < entries.length(); i += 1) {
                    JSONObject entry = entries.optJSONObject(i);
                    if (entry == null) continue;
                    if (!"day".equals(entry.optString("horizon", "day"))) continue;
                    String date = normalizeDate(entry.optString("date", ""));
                    if (!today.equals(date)) continue;
                    String bucket = timeBucket(entry.optString("startTime", ""));
                    List<String> target = byBucket.get(bucket);
                    if (target == null) continue;
                    String title = entry.optString("title", "").trim();
                    boolean entryDone = entry.optBoolean("done", false);
                    if (!title.isEmpty()) target.add((entryDone ? "✓ " : "• ") + title);
                    JSONArray checklist = entry.optJSONArray("checklist");
                    if (checklist != null) {
                        for (int c = 0; c < checklist.length(); c += 1) {
                            JSONObject item = checklist.optJSONObject(c);
                            if (item == null) continue;
                            String text = item.optString("text", "").trim();
                            if (text.isEmpty()) continue;
                            target.add((item.optBoolean("done", false) ? "✓ " : "• ") + text);
                        }
                    }
                }
            }

            List<String> lines = new ArrayList<>();
            String[][] buckets = new String[][] {
                {"allday", "Весь день"},
                {"morning", "Утро"},
                {"day", "День"},
                {"evening", "Вечер"}
            };
            for (String[] bucket : buckets) {
                List<String> items = byBucket.get(bucket[0]);
                if (items == null || items.isEmpty()) continue;
                if (lines.size() >= 12) break;
                lines.add(bucket[1]);
                for (String item : items) {
                    if (lines.size() >= 12) break;
                    lines.add(item);
                }
            }

            List<String> habits = new ArrayList<>();
            JSONArray habitList = root.optJSONArray("habits");
            if (habitList != null) {
                for (int i = 0; i < habitList.length(); i += 1) {
                    JSONObject habit = habitList.optJSONObject(i);
                    if (habit == null) continue;
                    if (!"day".equals(habit.optString("schedule", "day"))) continue;
                    String name = habit.optString("name", "").trim();
                    if (name.isEmpty()) continue;
                    boolean done = hasMark(habit.optJSONObject("cells"), today);
                    habits.add((done ? "✓ " : "○ ") + name);
                }
            }
            if (!habits.isEmpty() && lines.size() < 12) {
                if (!lines.isEmpty()) lines.add("Привычки");
                for (String habit : habits) {
                    if (lines.size() >= 12) break;
                    lines.add(habit);
                }
            }

            String subtitle = formatSubtitle(new Date());
            String themeId = root.optString("theme", TodayWidgetStore.theme(context));
            if (themeId == null || themeId.trim().isEmpty()) themeId = "turquoise";
            if (lines.isEmpty()) {
                // Keep whatever the WebView already pushed; do not replace with placeholder.
                String existing = TodayWidgetStore.lines(context);
                if (existing != null && !existing.trim().isEmpty() && !isEmptyPlaceholder(existing)) {
                    return;
                }
                TodayWidgetStore.save(context, EMPTY_PLACEHOLDER, subtitle, themeId);
                return;
            }
            TodayWidgetStore.save(context, join(lines), subtitle, themeId);
        } catch (Exception ignored) {
            /* keep previous widget text */
        }
    }

    static void applyJsonAndRefresh(Context context, String json) {
        applyJson(context, json);
        TodayWidgetProvider.refreshAll(context);
    }

    static void refreshFromPhoneCopy(Context context) {
        try {
            String json = PhoneCopy.read(context);
            if (json != null && !json.trim().isEmpty()) {
                applyJsonAndRefresh(context, json);
                return;
            }
        } catch (Exception ignored) {
            /* fall through */
        }
        TodayWidgetProvider.refreshAll(context);
    }

    private static boolean isEmptyPlaceholder(String text) {
        String value = String.valueOf(text == null ? "" : text).trim();
        return value.isEmpty() || value.contains("Пока пусто");
    }

    private static String timeBucket(String startTime) {
        String value = String.valueOf(startTime == null ? "" : startTime).trim();
        if (value.isEmpty()) return "allday";
        try {
            int hour = Integer.parseInt(value.substring(0, Math.min(2, value.length())));
            if (hour < 12) return "morning";
            if (hour < 17) return "day";
            return "evening";
        } catch (Exception ignored) {
            return "allday";
        }
    }

    private static String normalizeDate(String raw) {
        String value = String.valueOf(raw == null ? "" : raw).trim();
        if (value.length() >= 10) return value.substring(0, 10);
        return value;
    }

    private static boolean hasMark(JSONObject cells, String iso) {
        if (cells == null || iso == null || iso.isEmpty()) return false;
        String value = cells.optString(iso, "").trim();
        return !value.isEmpty();
    }

    private static String localTodayIso() {
        Calendar cal = Calendar.getInstance();
        return String.format(
            Locale.US,
            "%04d-%02d-%02d",
            cal.get(Calendar.YEAR),
            cal.get(Calendar.MONTH) + 1,
            cal.get(Calendar.DAY_OF_MONTH)
        );
    }

    private static String formatSubtitle(Date date) {
        try {
            return new SimpleDateFormat("EE, d MMM", new Locale("ru", "RU")).format(date);
        } catch (Exception error) {
            return localTodayIso();
        }
    }

    private static String join(List<String> lines) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < lines.size(); i += 1) {
            if (i > 0) out.append('\n');
            out.append(lines.get(i));
        }
        return out.toString();
    }
}
