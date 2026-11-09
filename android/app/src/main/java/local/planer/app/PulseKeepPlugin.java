package local.planer.app;

import android.util.Base64;
import android.widget.Toast;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "PulseKeep")
public class PulseKeepPlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        String text = call.getString("text", "");
        try {
            // Phone backup only. Widget text is pushed by updateToday —
            // re-parsing JSON here used to overwrite a good widget with «пусто».
            PhoneCopy.write(getContext(), text == null ? "" : text);
            JSObject result = new JSObject();
            result.put("ok", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Не удалось сохранить копию на телефоне", error);
        }
    }

    @PluginMethod
    public void load(PluginCall call) {
        try {
            JSObject result = new JSObject();
            String text = PhoneCopy.read(getContext());
            result.put("text", text == null ? "" : text);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Не удалось прочитать копию на телефоне", error);
        }
    }

    @PluginMethod
    public void updateToday(PluginCall call) {
        String json = call.getString("json", "");
        String lines = call.getString("lines", "");
        String linesB64 = call.getString("linesB64", "");
        String subtitle = call.getString("subtitle", "");
        String theme = call.getString("theme", "");
        boolean toast = Boolean.TRUE.equals(call.getBoolean("toast", false));
        try {
            String decoded = decodeLines(linesB64);
            if (decoded != null && !decoded.trim().isEmpty()) {
                lines = decoded;
            }
            String themeId = theme == null || theme.trim().isEmpty() ? "turquoise" : theme.trim();

            boolean wrote = false;
            if (lines != null && !lines.trim().isEmpty() && !isEmptyPlaceholder(lines)) {
                TodayWidgetStore.save(getContext(), lines, subtitle == null ? "" : subtitle, themeId);
                wrote = true;
            } else if (json != null && !json.trim().isEmpty()) {
                TodayWidgetUpdater.applyJson(getContext(), json);
                if (theme != null && !theme.trim().isEmpty()) {
                    TodayWidgetStore.save(
                        getContext(),
                        TodayWidgetStore.lines(getContext()),
                        TodayWidgetStore.subtitle(getContext()),
                        themeId
                    );
                }
                String after = TodayWidgetStore.lines(getContext());
                wrote = after != null && !after.trim().isEmpty() && !isEmptyPlaceholder(after);
            }

            int widgets = TodayWidgetProvider.refreshAll(getContext());
            String shown = TodayWidgetStore.lines(getContext());
            if (toast) {
                String msg;
                if (widgets <= 0) {
                    msg = "Виджет «Сегодня» не найден — добавь его с рабочего стола";
                } else if (!wrote || shown == null || shown.trim().isEmpty() || isEmptyPlaceholder(shown)) {
                    msg = "На виджет ушло пусто — проверь список на сегодня в Pulse";
                } else {
                    String first = shown.split("\n", 2)[0];
                    msg = "Виджет: " + first;
                }
                Toast.makeText(getContext().getApplicationContext(), msg, Toast.LENGTH_LONG).show();
            }

            JSObject result = new JSObject();
            result.put("widgets", widgets);
            result.put("wrote", wrote);
            result.put("lines", shown == null ? "" : shown);
            result.put("subtitle", TodayWidgetStore.subtitle(getContext()));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Не удалось обновить виджет", error);
        }
    }

    @PluginMethod
    public void refreshToday(PluginCall call) {
        try {
            TodayWidgetUpdater.refreshFromPhoneCopy(getContext());
            JSObject result = new JSObject();
            result.put("widgets", TodayWidgetProvider.refreshAll(getContext()));
            result.put("lines", TodayWidgetStore.lines(getContext()));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Не удалось обновить виджет", error);
        }
    }

    private static String decodeLines(String linesB64) {
        if (linesB64 == null || linesB64.trim().isEmpty()) return null;
        try {
            byte[] raw = Base64.decode(linesB64.trim(), Base64.DEFAULT);
            return new String(raw, StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static boolean isEmptyPlaceholder(String text) {
        String value = String.valueOf(text == null ? "" : text).trim();
        return value.isEmpty()
            || value.contains("Пока пусто")
            || value.equalsIgnoreCase("empty");
    }
}
