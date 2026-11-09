package local.planer.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.widget.RemoteViews;

public class TodayWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateOne(context, manager, appWidgetId);
        }
    }

    @Override
    public void onEnabled(Context context) {
        refreshAll(context);
    }

    /** @return number of widget instances updated */
    static int refreshAll(Context context) {
        Context app = context.getApplicationContext();
        AppWidgetManager manager = AppWidgetManager.getInstance(app);
        ComponentName component = new ComponentName(app, TodayWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
        if (ids == null || ids.length == 0) return 0;

        RemoteViews views = buildViews(app);
        manager.updateAppWidget(component, views);
        for (int id : ids) {
            updateOne(app, manager, id);
        }
        return ids.length;
    }

    private static void updateOne(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = buildViews(context);
        bindClick(context, views, appWidgetId);
        manager.updateAppWidget(appWidgetId, views);
    }

    private static RemoteViews buildViews(Context context) {
        String lines = TodayWidgetStore.lines(context);
        String subtitle = TodayWidgetStore.subtitle(context);
        if (lines == null || lines.trim().isEmpty()) {
            try {
                String json = PhoneCopy.read(context);
                if (json != null && !json.trim().isEmpty()) {
                    TodayWidgetUpdater.applyJson(context, json);
                    lines = TodayWidgetStore.lines(context);
                    subtitle = TodayWidgetStore.subtitle(context);
                }
            } catch (Exception ignored) {
                /* keep empty state */
            }
        }

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.today_widget);
        if (subtitle == null || subtitle.trim().isEmpty()) {
            subtitle = context.getString(R.string.widget_today_subtitle_default);
        }
        if (lines == null || lines.trim().isEmpty()) {
            lines = context.getString(R.string.widget_today_empty);
        }

        TodayWidgetTheme theme = TodayWidgetTheme.fromId(TodayWidgetStore.theme(context));
        views.setInt(R.id.widget_root, "setBackgroundResource", theme.bgRes);
        views.setTextColor(R.id.widget_title, theme.title);
        views.setTextColor(R.id.widget_subtitle, theme.muted);
        views.setTextColor(R.id.widget_lines, theme.text);

        views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_today_title));
        views.setTextViewText(R.id.widget_subtitle, subtitle);
        views.setTextViewText(R.id.widget_lines, lines);
        return views;
    }

    private static void bindClick(Context context, RemoteViews views, int appWidgetId) {
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pending = PendingIntent.getActivity(context, appWidgetId, open, flags);
        views.setOnClickPendingIntent(R.id.widget_root, pending);
    }
}
