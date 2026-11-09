package local.planer.app;

import android.graphics.Color;

final class TodayWidgetTheme {
    final String id;
    final int bgRes;
    final int title;
    final int text;
    final int muted;

    private TodayWidgetTheme(String id, int bgRes, int title, int text, int muted) {
        this.id = id;
        this.bgRes = bgRes;
        this.title = title;
        this.text = text;
        this.muted = muted;
    }

    static TodayWidgetTheme fromId(String themeId) {
        String id = themeId == null ? "" : themeId.trim().toLowerCase();
        switch (id) {
            case "classic":
                return new TodayWidgetTheme(
                    "classic",
                    R.drawable.today_widget_bg_classic,
                    Color.parseColor("#241f18"),
                    Color.parseColor("#241f18"),
                    Color.parseColor("#6f675c")
                );
            case "dark":
                return new TodayWidgetTheme(
                    "dark",
                    R.drawable.today_widget_bg_dark,
                    Color.parseColor("#ececec"),
                    Color.parseColor("#ececec"),
                    Color.parseColor("#a0a0a0")
                );
            case "swamp":
                return new TodayWidgetTheme(
                    "swamp",
                    R.drawable.today_widget_bg_swamp,
                    Color.parseColor("#f1fbef"),
                    Color.parseColor("#f1fbef"),
                    Color.parseColor("#b9d6b5")
                );
            case "orange":
                return new TodayWidgetTheme(
                    "orange",
                    R.drawable.today_widget_bg_orange,
                    Color.parseColor("#fff4ea"),
                    Color.parseColor("#fff4ea"),
                    Color.parseColor("#e0c7a6")
                );
            case "candy":
                return new TodayWidgetTheme(
                    "candy",
                    R.drawable.today_widget_bg_candy,
                    Color.parseColor("#5a3d5c"),
                    Color.parseColor("#5a3d5c"),
                    Color.parseColor("#a889a8")
                );
            case "citrus":
                return new TodayWidgetTheme(
                    "citrus",
                    R.drawable.today_widget_bg_citrus,
                    Color.parseColor("#000000"),
                    Color.parseColor("#000000"),
                    Color.parseColor("#000000")
                );
            case "winter":
                return new TodayWidgetTheme(
                    "winter",
                    R.drawable.today_widget_bg_winter,
                    Color.parseColor("#1e3344"),
                    Color.parseColor("#1e3344"),
                    Color.parseColor("#5a7388")
                );
            case "noel":
                return new TodayWidgetTheme(
                    "noel",
                    R.drawable.today_widget_bg_noel,
                    Color.parseColor("#1f2a1c"),
                    Color.parseColor("#1f2a1c"),
                    Color.parseColor("#6b4a3a")
                );
            case "golden":
                return new TodayWidgetTheme(
                    "golden",
                    R.drawable.today_widget_bg_golden,
                    Color.parseColor("#f5e6c0"),
                    Color.parseColor("#f5e6c0"),
                    Color.parseColor("#c4a46a")
                );
            case "turquoise":
            default:
                return new TodayWidgetTheme(
                    "turquoise",
                    R.drawable.today_widget_bg_turquoise,
                    Color.parseColor("#f0fffb"),
                    Color.parseColor("#e4f4f8"),
                    Color.parseColor("#a8d0dc")
                );
        }
    }
}
