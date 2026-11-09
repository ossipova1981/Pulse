const STORAGE_KEY = "planer-local-v1";
const APP_VERSION = "0.4.76";
const PALETTE = ["#7a8fa8", "#e07a3d", "#5fad78", "#4db0d4", "#d4658a", "#e0b040", "#c4a27a", "#a57bc4"];

const DEFAULT_LEVELS = [
  { id: "level-work", name: "Работа", color: "#3d4a5c", visible: true, order: 0 },
  { id: "level-home", name: "Дом", color: "#c45c26", visible: true, order: 1 },
  { id: "level-family", name: "Семья", color: "#4a7c59", visible: true, order: 2 },
  { id: "level-vacation", name: "Отпуска", color: "#3d6b8a", visible: true, order: 3 },
];

const LIFE_SPANS = [5, 10, 15, 20, 30, 40, 50, 70, 100];
const GOAL_YEAR_PRESETS = [1, 3, 5, 10, 15, 20, 30, 50, 70, 100];
const VIEWS = ["day", "week", "year", "span", "habit", "goals", "lists", "search", "settings"];
const YEAR_MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfWeek(date) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = next.getDay();
  next.setDate(next.getDate() + (day === 0 ? -6 : 1 - day));
  return next;
}

function addDays(date, amount) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function weekDates(cursor) {
  const monday = startOfWeek(cursor);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function monthLabel(date) {
  return new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(date);
}

function weekdayLabel(date) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date);
}

function formatDayHeading(date) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(date);
}

function formatWeekRange(cursor) {
  const days = weekDates(cursor);
  const start = days[0];
  const end = days[6];
  const startMonth = monthLabel(start);
  const endMonth = monthLabel(end);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${startMonth} ${start.getFullYear()}`;
  }
  return `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth} ${end.getFullYear()}`;
}

function belongsToMonth(isoDate, year, month) {
  const date = parseISODate(isoDate);
  return date.getFullYear() === year && date.getMonth() === month;
}

function timeBucket(startTime) {
  if (!startTime) return "allday";
  const hour = Number(startTime.slice(0, 2));
  if (hour < 12) return "morning";
  if (hour < 17) return "day";
  return "evening";
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function emptyState() {
  const today = toISODate(new Date());
  return {
    version: 1,
    levels: DEFAULT_LEVELS.map((level) => ({ ...level })),
    entries: [],
    view: "week",
    spanYears: 10,
    cursor: today,
    lastLevelId: DEFAULT_LEVELS[0].id,
    habits: [],
    selectedHabitId: "",
    dailies: {},
    showDaily: true,
    composing: null,
    editingId: null,
    levelDraftId: null,
    levelDraftName: "",
    routineTasks: [],
    theme: "turquoise",
    goals: [],
    selectedGoalId: "",
    goalYearsDraft: 5,
    lists: [],
    selectedListId: "",
    listSearch: "",
    entrySearch: "",
    expandedListId: "",
    timer: defaultTimer(),
    editorChecklist: [],
    editorDraft: null,
    sidebarOpen: false,
    weekTabDate: "",
    routinesOpen: false,
    dayRoutinesOpenByDate: {},
    updatedAt: 0,
  };
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function daysInYear(year) {
  return daysInMonth(year, 1) === 29 ? 366 : 365;
}

function filledHabitCount(habit, year) {
  const prefix = `${year}-`;
  return Object.entries(habit.cells || {}).filter(([date, value]) => date.startsWith(prefix) && String(value).trim()).length;
}

function filledHabitMonthCount(habit, year, month) {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
  return Object.entries(habit.cells || {}).filter(([date, value]) => date.startsWith(prefix) && String(value).trim()).length;
}

function habitCurrentStreak(habit) {
  let cursor = new Date();
  const today = toISODate(cursor);
  if (!habitMarkedOn(habit, today)) {
    cursor = addDays(cursor, -1);
  }
  let streak = 0;
  for (let i = 0; i < 800; i += 1) {
    const iso = toISODate(cursor);
    if (!habitMarkedOn(habit, iso)) break;
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function habitStats(habit, year) {
  const now = new Date();
  const month = now.getFullYear() === year ? now.getMonth() : 11;
  const monthDone = filledHabitMonthCount(habit, year, month);
  const monthDays = daysInMonth(year, month);
  const yearDone = filledHabitCount(habit, year);
  const yearDays = daysInYear(year);
  const streak = habitCurrentStreak(habit);
  const months = Array.from({ length: 12 }, (_, m) => ({
    done: filledHabitMonthCount(habit, year, m),
    days: daysInMonth(year, m),
  }));
  return { monthDone, monthDays, yearDone, yearDays, streak, months };
}

function horizonLabel(horizon) {
  if (horizon === "day") return "День";
  if (horizon === "week") return "Неделя";
  if (horizon === "year") return "Год";
  if (horizon === "span") return "Горизонт";
  return horizon || "Запись";
}

function entrySearchText(entry) {
  const checklist = normalizeChecklist(entry.checklist)
    .map((item) => item.text)
    .join(" ");
  return [entry.title, entry.notes, checklist].filter(Boolean).join("\n").toLowerCase();
}

function searchPlannerEntries(query) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return [];
  return [...(state.entries || [])]
    .filter((entry) => entrySearchText(entry).includes(q))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 100);
}

function normalizeHabits(habits) {
  if (!Array.isArray(habits)) return [];
  return habits.map((habit) => {
    const cells = {};
    if (habit.cells && typeof habit.cells === "object" && !Array.isArray(habit.cells)) {
      for (const [date, value] of Object.entries(habit.cells)) {
        const text = String(value ?? "").trim().slice(0, 2);
        if (text) cells[date] = text;
      }
    } else if (Array.isArray(habit.checks)) {
      const year = new Date().getFullYear();
      let offset = 0;
      YEAR_MONTH_DAYS.forEach((count, month) => {
        for (let day = 0; day < count; day += 1) {
          const mark = habit.checks[offset + day];
          if (mark) {
            const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day + 1).padStart(2, "0")}`;
            cells[iso] = typeof mark === "string" ? String(mark).trim().slice(0, 2) || "x" : "x";
          }
        }
        offset += count;
      });
    }
    return {
      id: habit.id || uid(),
      name: String(habit.name || "").trim() || "Привычка",
      schedule: normalizeSchedule(habit.schedule),
      bucket: normalizeBucket(habit.bucket),
      remindAt: habit.remindAt ? normalizeRemindAt(habit.remindAt, habit.bucket || "day") : "",
      cells,
    };
  });
}

function migrateRoutinesIntoHabits(habits, routineTasks) {
  const list = normalizeHabits(habits);
  const tasks = normalizeRoutineTasks(routineTasks);
  tasks.forEach((task) => {
    const habit = list.find((item) => item.id === task.habitId);
    if (!habit) return;
    if (!habit.bucket) habit.bucket = normalizeBucket(task.bucket);
    if (!habit.remindAt) {
      habit.remindAt =
        normalizeRemindAt(task.remindAt, task.bucket) || defaultRemindAt(task.bucket);
    }
    habit.schedule = normalizeSchedule(habit.schedule || "day");
  });
  return list;
}

function ensureWorkLevel(levels) {
  const hasWork = levels.some((level) => level.id === "level-work" || /^работа$/i.test(level.name));
  if (hasWork) return levels;
  return [
    { id: "level-work", name: "Работа", color: "#3d4a5c", visible: true, order: 0 },
    ...levels,
  ];
}

function isCommitKey(event) {
  return event.key === "Enter" || event.key === "Done" || event.key === "Go" || event.keyCode === 13;
}

function addLevel(name) {
  const text = String(name || "").trim();
  if (!text) return false;
  const used = new Set(state.levels.map((level) => level.color));
  const color = PALETTE.find((item) => !used.has(item)) || PALETTE[state.levels.length % PALETTE.length];
  const level = { id: uid(), name: text, color, visible: true, order: state.levels.length };
  state.levels.push(level);
  state.lastLevelId = level.id;
  return true;
}

function loadState() {
  const fallback = emptyState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      ...fallback,
      levels: ensureWorkLevel(parsed.levels?.length ? parsed.levels : fallback.levels),
      entries: parsed.entries ?? [],
      view: VIEWS.includes(parsed.view) ? parsed.view : "week",
      spanYears: LIFE_SPANS.includes(parsed.spanYears) ? parsed.spanYears : 10,
      cursor: parsed.cursor ?? fallback.cursor,
      lastLevelId: parsed.lastLevelId ?? fallback.lastLevelId,
      habits: migrateRoutinesIntoHabits(parsed.habits, parsed.routineTasks),
      selectedHabitId: parsed.selectedHabitId ?? "",
      dailies: parsed.dailies && typeof parsed.dailies === "object" ? parsed.dailies : {},
      showDaily: parsed.showDaily !== false,
      routineTasks: [],
      theme: isThemeId(parsed.theme) ? parsed.theme : fallback.theme,
      goals: normalizeGoals(parsed.goals),
      selectedGoalId: parsed.selectedGoalId ?? "",
      goalYearsDraft: Math.min(120, Math.max(1, Number(parsed.goalYearsDraft) || 5)),
      lists: normalizeLists(parsed.lists),
      selectedListId: parsed.selectedListId ?? "",
      timer: normalizeTimer(parsed.timer),
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch {
    return fallback;
  }
}

function snapshotPlanner(current) {
  return {
    version: 1,
    levels: current.levels,
    entries: current.entries,
    view: current.view,
    spanYears: current.spanYears,
    cursor: current.cursor,
    lastLevelId: current.lastLevelId,
    habits: current.habits,
    selectedHabitId: current.selectedHabitId,
    dailies: current.dailies,
    showDaily: current.showDaily !== false,
    routineTasks: current.routineTasks,
    theme: current.theme,
    goals: current.goals,
    selectedGoalId: current.selectedGoalId,
    goalYearsDraft: current.goalYearsDraft,
    lists: current.lists,
    selectedListId: current.selectedListId,
    timer: snapshotTimer(current.timer),
    updatedAt: Number(current.updatedAt) || 0,
  };
}

function plannerFingerprint(current) {
  return JSON.stringify({
    levels: current.levels,
    entries: current.entries,
    habits: current.habits,
    dailies: current.dailies,
    routineTasks: current.routineTasks,
    goals: current.goals,
    lists: current.lists,
    theme: current.theme,
    showDaily: current.showDaily !== false,
  });
}

function applyPlannerSnapshot(parsed, { bumpTime = false } = {}) {
  if (!parsed || !Array.isArray(parsed.levels) || !Array.isArray(parsed.entries)) return false;
  state.levels = parsed.levels;
  state.entries = parsed.entries;
  state.view = VIEWS.includes(parsed.view) ? parsed.view : state.view;
  state.spanYears = LIFE_SPANS.includes(parsed.spanYears) ? parsed.spanYears : state.spanYears;
  state.cursor = parsed.cursor || state.cursor;
  state.lastLevelId = parsed.lastLevelId || state.levels[0]?.id || "";
  state.habits = migrateRoutinesIntoHabits(parsed.habits, parsed.routineTasks);
  state.selectedHabitId = parsed.selectedHabitId || "";
  state.dailies = parsed.dailies && typeof parsed.dailies === "object" ? parsed.dailies : {};
  state.showDaily = parsed.showDaily !== false;
  state.routineTasks = [];
  state.goals = normalizeGoals(parsed.goals);
  state.selectedGoalId = parsed.selectedGoalId || "";
  state.goalYearsDraft = Math.min(120, Math.max(1, Number(parsed.goalYearsDraft) || state.goalYearsDraft || 5));
  state.lists = normalizeLists(parsed.lists);
  state.selectedListId = parsed.selectedListId || "";
  state.timer = normalizeTimer(parsed.timer);
  state.theme = isThemeId(parsed.theme) ? parsed.theme : state.theme;
  state.updatedAt = bumpTime ? Date.now() : Number(parsed.updatedAt) || Date.now();
  applyTheme(state.theme);
  return true;
}

let phoneCopyReady = !window.Capacitor?.isNativePlatform?.();
let phoneCopyTimer = 0;
let todayWidgetTimer = 0;

function persist(state) {
  try {
    const fingerprint = plannerFingerprint(state);
    if (!cloudApplying && lastDataFingerprint && fingerprint !== lastDataFingerprint) {
      state.updatedAt = Date.now();
      window.PulseCloud?.schedulePush?.();
    }
    lastDataFingerprint = fingerprint;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotPlanner(state)));
    if (phoneCopyReady) schedulePhoneCopy();
    scheduleTodayWidget();
    scheduleRemindSync();
  } catch (err) {
    console.warn("Не удалось сохранить данные", err);
  }
}

function capacitorPlatform() {
  const cap = window.Capacitor;
  if (!cap) return "web";
  try {
    if (typeof cap.getPlatform === "function") {
      const platform = String(cap.getPlatform() || "").toLowerCase();
      if (platform) return platform;
    }
  } catch {
    /* ignore */
  }
  return "web";
}

function isCapacitorNative() {
  const cap = window.Capacitor;
  if (!cap) return false;
  try {
    if (typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) return true;
  } catch {
    /* ignore */
  }
  const platform = capacitorPlatform();
  return platform === "android" || platform === "ios";
}

function phoneKeep() {
  if (!isCapacitorNative()) return null;
  const cap = window.Capacitor;
  try {
    if (typeof cap.registerPlugin === "function") {
      return cap.registerPlugin("PulseKeep");
    }
    return cap.Plugins?.PulseKeep || null;
  } catch {
    return null;
  }
}

function widgetBridgeHint() {
  if (isCapacitorNative() && phoneKeep()) {
    return "Связь с виджетом: есть (Android-приложение).";
  }
  if (capacitorPlatform() === "electron" || window.planerDesktop) {
    return "Сейчас открыт компьютер — домашний виджет только на телефоне в приложении Pulse.";
  }
  return "Сейчас открыта веб-версия (браузер или ярлык сайта). Виджет обновится только если открыть Pulse из иконки приложения.";
}

function plannerWeight(data) {
  if (!data || typeof data !== "object") return 0;
  const entryItems = Array.isArray(data.entries)
    ? data.entries.reduce((sum, entry) => sum + 1 + (Array.isArray(entry?.checklist) ? entry.checklist.length : 0), 0)
    : 0;
  return (
    entryItems +
    (Array.isArray(data.habits) ? data.habits.length : 0) +
    (Array.isArray(data.lists) ? data.lists.length : 0) +
    (Array.isArray(data.goals) ? data.goals.length : 0) +
    (Array.isArray(data.routineTasks) ? data.routineTasks.length : 0)
  );
}

function isSparsePlanner(data) {
  return plannerWeight(data) === 0;
}

function schedulePhoneCopy() {
  const keep = phoneKeep();
  if (!keep?.save || plannerWeight(state) === 0) return;
  clearTimeout(phoneCopyTimer);
  phoneCopyTimer = setTimeout(() => {
    const payload = buildTodayWidgetPayload();
    keep.save({ text: payload.json }).catch(() => {});
  }, 500);
}

function formatWidgetDate(date) {
  try {
    return new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "short" }).format(date);
  } catch {
    return toISODate(date);
  }
}

function normalizeEntryDate(value) {
  const raw = String(value || "").trim();
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
}

function widgetEntryLines(entry) {
  const lines = [];
  const title = String(entry.title || "").trim();
  const mark = entry.done ? "✓" : "•";
  if (title) lines.push(`${mark} ${title}`);
  normalizeChecklist(entry.checklist).forEach((item) => {
    const text = String(item.text || "").trim();
    if (!text) return;
    lines.push(`${item.done ? "✓" : "•"} ${text}`);
  });
  return lines;
}

function buildTodayWidgetPayload() {
  const now = new Date();
  const today = toISODate(now);
  const lines = [];
  const buckets = [
    ["allday", "Весь день"],
    ["morning", "Утро"],
    ["day", "День"],
    ["evening", "Вечер"],
  ];

  const dayEntries = (state.entries || []).filter(
    (entry) => (entry.horizon || "day") === "day" && normalizeEntryDate(entry.date) === today,
  );

  // Order like the Day screen: all-day → morning → day → evening.
  // Skip empty buckets entirely.
  buckets.forEach(([id, label]) => {
    const items = dayEntries.filter((entry) => timeBucket(entry.startTime) === id);
    if (!items.length) return;
    if (lines.length >= 12) return;
    lines.push(label);
    items.forEach((entry) => {
      widgetEntryLines(entry).forEach((line) => {
        if (lines.length >= 12) return;
        lines.push(line);
      });
    });
  });

  const habitLines = sortHabitsForDay(habitsBySchedule("day")).map((habit) => {
    const done = habitMarkedOn(habit, today);
    return `${done ? "✓" : "○"} ${habit.name}`;
  });
  if (habitLines.length && lines.length < 12) {
    if (lines.length) lines.push("Привычки");
    habitLines.forEach((line) => {
      if (lines.length >= 12) return;
      lines.push(line);
    });
  }

  const subtitle = formatWidgetDate(now);
  const text = lines.length ? lines.join("\n") : "Пока пусто — открой Pulse";
  const theme = displayedTheme();
  const snap = snapshotPlanner(state);
  snap.theme = theme;
  snap.widgetToday = { date: today, subtitle, lines: text, theme };
  return {
    subtitle,
    lines: text,
    theme,
    json: JSON.stringify(snap),
  };
}

function encodeWidgetLines(text) {
  try {
    return btoa(unescape(encodeURIComponent(String(text || ""))));
  } catch {
    return "";
  }
}

async function pushTodayWidget({ toast = false } = {}) {
  const keep = phoneKeep();
  if (!keep?.updateToday && !keep?.save) {
    return { ok: false, reason: "no-plugin", widgets: 0 };
  }
  const payload = buildTodayWidgetPayload();
  let result = { widgets: 0, wrote: false, lines: payload.lines };
  try {
    // updateToday first (exact lines). save() only backs up JSON and must not rebuild the widget.
    if (keep.updateToday) {
      result = await keep.updateToday({
        lines: payload.lines,
        linesB64: encodeWidgetLines(payload.lines),
        subtitle: payload.subtitle,
        theme: payload.theme || displayedTheme(),
        json: payload.json,
        toast: !!toast,
      });
    }
    if (keep.save) {
      await keep.save({ text: payload.json });
    }
    return {
      ok: true,
      widgets: Number(result?.widgets || 0),
      wrote: !!result?.wrote,
      lines: String(result?.lines || payload.lines || ""),
    };
  } catch (err) {
    console.warn("Не удалось обновить виджет", err);
    return { ok: false, reason: "error", widgets: 0, error: err };
  }
}

function scheduleTodayWidget() {
  const keep = phoneKeep();
  if (!keep?.updateToday && !keep?.save) return;
  clearTimeout(todayWidgetTimer);
  todayWidgetTimer = setTimeout(() => {
    pushTodayWidget().then(() => {});
  }, 300);
}

async function restorePhoneCopy() {
  const keep = phoneKeep();
  if (!keep?.load) {
    phoneCopyReady = true;
    return;
  }
  try {
    const result = await keep.load();
    const text = String(result?.text || "");
    if (!text) return;
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.entries)) return;
    const localW = plannerWeight(state);
    const fileW = plannerWeight(parsed);
    const localAt = Number(state.updatedAt) || 0;
    const fileAt = Number(parsed.updatedAt) || 0;
    // After reinstall localStorage is empty: always prefer a non-empty phone copy.
    const shouldRestore =
      fileW > 0 && (isSparsePlanner(state) || localW === 0 || fileW > localW || fileAt > localAt);
    if (shouldRestore) {
      applyPlannerSnapshot(parsed, { bumpTime: false });
      lastDataFingerprint = plannerFingerprint(state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotPlanner(state)));
    }
  } catch (err) {
    console.warn("Не удалось прочитать копию на телефоне", err);
  } finally {
    phoneCopyReady = true;
  }
}

function normalizeGoals(goals) {
  if (!Array.isArray(goals)) return [];
  return goals.map((goal) => {
    const years = Math.min(120, Math.max(1, Number(goal.years || goal.spanYears) || 5));
    const startYear = Number(goal.startYear) || new Date().getFullYear();
    return {
      id: goal.id || uid(),
      name: String(goal.name || "").trim() || `Цели на ${years} ${plural(years, "год", "года", "лет")}`,
      years,
      startYear,
      items: Array.isArray(goal.items)
        ? goal.items
            .map((item) => ({
              id: item.id || uid(),
              text: String(item.text || "").trim(),
              done: Boolean(item.done),
            }))
            .filter((item) => item.text)
        : [],
    };
  });
}

function normalizeLists(lists) {
  if (!Array.isArray(lists)) return [];
  return lists.map((list) => ({
    id: list.id || uid(),
    name: String(list.name || "").trim() || "Список",
    items: Array.isArray(list.items)
      ? list.items
          .map((item) => ({
            id: item.id || uid(),
            text: String(item.text || "").trim(),
            done: Boolean(item.done),
          }))
          .filter((item) => item.text)
      : [],
  }));
}

function defaultTimer() {
  return {
    workMinutes: 25,
    breakMinutes: 5,
    phase: "idle",
    endsAt: 0,
    pausedMs: 0,
    settingsOpen: false,
    collapsed: false,
  };
}

function normalizeTimer(timer) {
  const base = defaultTimer();
  if (!timer || typeof timer !== "object") return base;
  const phase = timer.phase === "work" || timer.phase === "break" || timer.phase === "idle" ? timer.phase : "idle";
  return {
    workMinutes: Math.min(180, Math.max(1, Number(timer.workMinutes) || base.workMinutes)),
    breakMinutes: Math.min(60, Math.max(1, Number(timer.breakMinutes) || base.breakMinutes)),
    phase,
    endsAt: phase === "idle" ? 0 : Math.max(0, Number(timer.endsAt) || 0),
    pausedMs: phase === "idle" ? 0 : Math.max(0, Number(timer.pausedMs) || 0),
    settingsOpen: false,
    collapsed: Boolean(timer.collapsed),
  };
}

function snapshotTimer(timer) {
  const t = normalizeTimer(timer);
  return {
    workMinutes: t.workMinutes,
    breakMinutes: t.breakMinutes,
    phase: t.phase,
    endsAt: t.endsAt,
    pausedMs: t.pausedMs,
    collapsed: t.collapsed,
  };
}

function defaultRemindAt(bucket) {
  if (bucket === "morning") return "09:00";
  if (bucket === "day") return "13:00";
  if (bucket === "evening") return "19:00";
  return "09:00";
}

function normalizeBucket(value) {
  return value === "morning" || value === "day" || value === "evening" ? value : "";
}

function normalizeRemindAt(value, bucket) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [h, m] = raw.split(":").map(Number);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  return defaultRemindAt(bucket);
}

function habitBucket(habit) {
  return normalizeBucket(habit?.bucket);
}

function habitRemindAt(habit) {
  const bucket = habitBucket(habit) || "day";
  return normalizeRemindAt(habit?.remindAt, bucket);
}

function habitBucketLabel(bucket) {
  if (bucket === "morning") return "Утро";
  if (bucket === "day") return "День";
  if (bucket === "evening") return "Вечер";
  return "";
}

function habitBucketOrder(bucket) {
  if (bucket === "morning") return 1;
  if (bucket === "day") return 2;
  if (bucket === "evening") return 3;
  return 0;
}

function sortHabitsForDay(habits) {
  return [...habits].sort((a, b) => {
    const byBucket = habitBucketOrder(habitBucket(a)) - habitBucketOrder(habitBucket(b));
    if (byBucket) return byBucket;
    const timeA = habitRemindAt(a) || "99:99";
    const timeB = habitRemindAt(b) || "99:99";
    if (timeA !== timeB) return timeA.localeCompare(timeB);
    return String(a.name || "").localeCompare(String(b.name || ""), "ru");
  });
}

function normalizeRoutineTasks(tasks) {
  if (!Array.isArray(tasks)) return [];
  return tasks
    .map((task) => {
      const bucket = task.bucket === "morning" || task.bucket === "day" || task.bucket === "evening" ? task.bucket : "day";
      return {
        id: task.id || uid(),
        bucket,
        habitId: task.habitId || "",
        levelId: task.levelId || "",
        remindAt: normalizeRemindAt(task.remindAt || task.time, bucket),
      };
    })
    .filter((task) => task.habitId);
}

function selectedGoal() {
  return (state.goals || []).find((goal) => goal.id === state.selectedGoalId);
}

function selectedList() {
  return (state.lists || []).find((list) => list.id === state.selectedListId);
}

function ensureTimer() {
  if (!state.timer) state.timer = defaultTimer();
  return state.timer;
}

function timerPhaseLabel(phase) {
  if (phase === "work") return "Работа";
  if (phase === "break") return "Перерыв";
  return "Фокус";
}

function timerRemainingMs(timer = ensureTimer()) {
  if (timer.phase === "idle") return 0;
  if (timer.pausedMs > 0 && !timer.endsAt) return timer.pausedMs;
  if (!timer.endsAt) return 0;
  return Math.max(0, timer.endsAt - Date.now());
}

function formatTimerClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function timerPhaseDurationMs(timer, phase = timer.phase) {
  if (phase === "break") return timer.breakMinutes * 60 * 1000;
  return timer.workMinutes * 60 * 1000;
}

const TIMER_ALARM_ID = 91;
const TIMER_CHANNEL_START = "pulse-timer-start-v1";
const TIMER_CHANNEL_DONE = "pulse-timer-done-v1";

function playTimerChime(kind = "done") {
  const start = kind === "start";
  try {
    navigator.vibrate?.(start ? [120, 80, 160] : [220, 120, 220, 120, 360]);
  } catch {
    /* ignore */
  }

  // Prefer the authored wav (same files Android notifications use).
  try {
    const src = start ? "sounds/pulse_focus_start.wav" : "sounds/pulse_focus_done.wav";
    const audio = new Audio(src);
    audio.volume = start ? 0.85 : 0.75;
    const played = audio.play();
    if (played && typeof played.catch === "function") {
      played.catch(() => {
        playTimerChimeSynth(start);
      });
      return;
    }
    return;
  } catch {
    /* fall through to synth */
  }
  playTimerChimeSynth(start);
}

function playTimerChimeSynth(start) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = start
      ? [
          [523.25, 0, 0.12],
          [659.25, 0.16, 0.12],
          [783.99, 0.32, 0.22],
        ]
      : [
          [783.99, 0, 0.16],
          [659.25, 0.2, 0.18],
          [523.25, 0.42, 0.28],
        ];
    const master = ctx.createGain();
    master.gain.value = start ? 0.22 : 0.18;
    master.connect(ctx.destination);
    notes.forEach(([freq, when, dur]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = start ? "sine" : "triangle";
      osc.frequency.value = freq;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(master);
      const t0 = ctx.currentTime + when;
      gain.gain.exponentialRampToValueAtTime(1, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    });
    setTimeout(() => {
      try {
        ctx.close();
      } catch {
        /* ignore */
      }
    }, 1200);
  } catch {
    /* ignore */
  }
}

async function cancelTimerAlarm() {
  const LocalNotifications = getLocalNotifications();
  if (!LocalNotifications) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: TIMER_ALARM_ID }] });
  } catch {
    /* ignore */
  }
}

async function ensureTimerChannels(LocalNotifications) {
  const specs = [
    {
      id: TIMER_CHANNEL_START,
      name: "Фокус · старт работы",
      description: "Сигнал начала рабочего интервала",
      sound: "pulse_focus_start",
    },
    {
      id: TIMER_CHANNEL_DONE,
      name: "Фокус · конец работы",
      description: "Сигнал окончания работы / начало перерыва",
      sound: "pulse_focus_done",
    },
  ];
  for (const spec of specs) {
    try {
      await LocalNotifications.createChannel({
        id: spec.id,
        name: spec.name,
        description: spec.description,
        importance: 5,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: "#0a4a5c",
        sound: spec.sound,
      });
    } catch {
      /* channel may already exist */
    }
  }
}

async function scheduleTimerAlarm() {
  const timer = ensureTimer();
  await cancelTimerAlarm();
  if (timer.phase === "idle" || !timer.endsAt || timer.pausedMs) return;

  const LocalNotifications = getLocalNotifications();
  if (!LocalNotifications) return;

  try {
    const access = await ensureReminderPermissions(LocalNotifications, { promptExact: false });
    if (!access.ok) return;
    await ensureTimerChannels(LocalNotifications);

    const fireAt = Number(timer.endsAt);
    if (!Number.isFinite(fireAt) || fireAt <= Date.now() + 700) return;

    const endingWork = timer.phase === "work";
    await LocalNotifications.schedule({
      notifications: [
        {
          id: TIMER_ALARM_ID,
          title: "Pulse · Фокус",
          body: endingWork ? "Работа закончилась — время перерыва" : "Перерыв закончился — снова за работу",
          largeBody: endingWork ? "Работа закончилась — время перерыва" : "Перерыв закончился — снова за работу",
          channelId: endingWork ? TIMER_CHANNEL_DONE : TIMER_CHANNEL_START,
          sound: endingWork ? "pulse_focus_done" : "pulse_focus_start",
          smallIcon: "ic_stat_pulse",
          iconColor: "#0a4a5c",
          schedule: {
            at: new Date(fireAt).toISOString(),
            allowWhileIdle: true,
          },
          extra: { kind: "timer", phase: timer.phase, chime: endingWork ? "done" : "start" },
        },
      ],
    });
  } catch (err) {
    console.warn("timer alarm", err);
  }
}

function startTimerPhase(phase, { chime = false } = {}) {
  const timer = ensureTimer();
  timer.phase = phase;
  timer.pausedMs = 0;
  timer.endsAt = Date.now() + timerPhaseDurationMs(timer, phase);
  timer.settingsOpen = false;
  if (chime && phase === "work") playTimerChime("start");
  if (chime && phase === "break") playTimerChime("done");
  scheduleTimerAlarm();
}

function advanceTimerPhase() {
  const timer = ensureTimer();
  const next = timer.phase === "work" ? "break" : "work";
  // End of work → soft “done”; end of break → bright “start work”.
  playTimerChime(next === "break" ? "done" : "start");
  startTimerPhase(next);
  // Web-only fallback; on Android the LocalNotification already fired / is scheduled.
  if (!isCapacitorNative()) {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("Pulse", {
          body: next === "break" ? "Перерыв — можно отдохнуть" : "Снова за работу",
        });
      }
    } catch {
      /* ignore */
    }
  }
}

function paintTimerDisplay() {
  const timer = ensureTimer();
  const remaining = timerRemainingMs(timer);
  if (timer.phase !== "idle" && timer.endsAt && remaining <= 0 && !timer.pausedMs) {
    advanceTimerPhase();
    render();
    return;
  }
  const clock = root.querySelector("[data-role=timer-clock]");
  const label = root.querySelector("[data-role=timer-label]");
  const meta = root.querySelector("[data-role=timer-meta]");
  if (clock) {
    clock.textContent =
      timer.phase === "idle"
        ? formatTimerClock(timer.workMinutes * 60 * 1000)
        : formatTimerClock(remaining);
  }
  if (label) label.textContent = timerPhaseLabel(timer.phase);
  if (meta) {
    meta.textContent =
      timer.phase === "idle"
        ? `${timer.workMinutes} мин · перерыв ${timer.breakMinutes} мин`
        : timer.pausedMs && !timer.endsAt
          ? "Пауза"
          : timer.phase === "work"
            ? `из ${timer.workMinutes} мин`
            : `из ${timer.breakMinutes} мин`;
  }
  const widget = root.querySelector("[data-role=focus-timer]");
  if (widget) {
    widget.dataset.phase = timer.phase;
    widget.classList.toggle("running", timer.phase !== "idle" && timer.endsAt > 0);
    widget.classList.toggle("paused", timer.phase !== "idle" && timer.pausedMs > 0 && !timer.endsAt);
  }
}

function renderFocusTimer() {
  const timer = ensureTimer();
  const remaining = timerRemainingMs(timer);
  const clock =
    timer.phase === "idle"
      ? formatTimerClock(timer.workMinutes * 60 * 1000)
      : formatTimerClock(remaining);
  const running = timer.phase !== "idle" && timer.endsAt > 0;
  const paused = timer.phase !== "idle" && timer.pausedMs > 0 && !timer.endsAt;

  if (timer.collapsed) {
    return `
      <button
        type="button"
        class="focus-timer-chip${running ? " running" : ""}${paused ? " paused" : ""}"
        data-action="timer-expand"
        data-phase="${timer.phase}"
        title="Показать фокус"
        aria-label="Показать фокус"
      >
        <span>${timerPhaseLabel(timer.phase)}</span>
        <strong data-role="timer-clock">${clock}</strong>
      </button>
    `;
  }

  return `
    <aside
      class="focus-timer${running ? " running" : ""}${paused ? " paused" : ""}${timer.settingsOpen ? " settings-open" : ""}"
      data-role="focus-timer"
      data-phase="${timer.phase}"
    >
      <div class="focus-timer-head">
        <div class="focus-timer-main">
          <div class="focus-timer-label" data-role="timer-label">${timerPhaseLabel(timer.phase)}</div>
          <div class="focus-timer-clock" data-role="timer-clock">${clock}</div>
          <div class="focus-timer-meta" data-role="timer-meta">
            ${
              timer.phase === "idle"
                ? `${timer.workMinutes} мин · перерыв ${timer.breakMinutes} мин`
                : paused
                  ? "Пауза"
                  : timer.phase === "work"
                    ? `из ${timer.workMinutes} мин`
                    : `из ${timer.breakMinutes} мин`
            }
          </div>
        </div>
        <button type="button" class="ghost focus-timer-hide" data-action="timer-collapse" title="Скрыть" aria-label="Скрыть фокус">✕</button>
      </div>
      <div class="focus-timer-actions">
        ${
          timer.phase === "idle"
            ? `<button type="button" class="solid" data-action="timer-start">Старт</button>`
            : paused
              ? `<button type="button" class="solid" data-action="timer-resume">Продолжить</button>`
              : `<button type="button" class="ghost" data-action="timer-pause">Пауза</button>`
        }
        ${
          timer.phase === "idle"
            ? ""
            : `<button type="button" class="ghost" data-action="timer-skip">Дальше</button>
               <button type="button" class="ghost" data-action="timer-reset">Сброс</button>`
        }
        <button type="button" class="ghost" data-action="timer-toggle-settings" title="Настроить">⚙</button>
      </div>
      ${
        timer.settingsOpen
          ? `
        <div class="focus-timer-settings">
          <label class="field">
            <span>Работа, мин</span>
            <input type="number" min="1" max="180" data-role="timer-work" value="${timer.workMinutes}" />
          </label>
          <label class="field">
            <span>Перерыв, мин</span>
            <input type="number" min="1" max="60" data-role="timer-break" value="${timer.breakMinutes}" />
          </label>
          <p class="focus-timer-hint">Например 25 / 5 — классический помидор</p>
        </div>`
          : ""
      }
    </aside>
  `;
}

const THEMES = {
  classic: {
    "--paper": "#f3eee4",
    "--paper-2": "#ebe4d6",
    "--ink": "#241f18",
    "--muted": "#6f675c",
    "--line": "#d8cebe",
    "--today": "#efe3c4",
    "--weekend": "#efe8db",
    "--danger": "#8b3d3d",
    "--focus": "#9a4a2a",
    "--check": "#9a4a2a",
  },
  dark: {
    "--paper": "#121212",
    "--paper-2": "#1c1c1c",
    "--ink": "#ececec",
    "--muted": "#a0a0a0",
    "--line": "#3a3a3a",
    "--today": "#2a2a2a",
    "--weekend": "#181818",
    "--danger": "#c06060",
    "--focus": "#8a8a8a",
    "--check": "#ececec",
  },
  swamp: {
    "--paper": "#163128",
    "--paper-2": "#1f3c31",
    "--ink": "#f1fbef",
    "--muted": "#b9d6b5",
    "--line": "#3f634b",
    "--today": "#3f7a4f",
    "--weekend": "#2a523f",
    "--danger": "#d16b4a",
    "--focus": "#e2b35a",
    "--check": "#e2b35a",
  },
  turquoise: {
    "--paper": "#0d7ab8",
    "--paper-2": "#1488c8",
    "--ink": "#ffffff",
    "--muted": "#e8f7ff",
    "--line": "#5ebce6",
    "--today": "#4eb8e4",
    "--weekend": "#1c6fa8",
    "--danger": "#ff8585",
    "--focus": "#7ed4f4",
    "--check": "#ffffff",
  },
  orange: {
    "--paper": "#3a1f0c",
    "--paper-2": "#4b2710",
    "--ink": "#fff4ea",
    "--muted": "#e0c7a6",
    "--line": "#8b4b2d",
    "--today": "#d48832",
    "--weekend": "#6f3d1d",
    "--danger": "#b85a5a",
    "--focus": "#f0a23f",
    "--check": "#f0a23f",
  },
  candy: {
    "--paper": "#f6eef8",
    "--paper-2": "#e8f2fc",
    "--ink": "#5a3d5c",
    "--muted": "#a889a8",
    "--line": "#e4c8e0",
    "--today": "#f4b8d6",
    "--weekend": "#c8e6f8",
    "--danger": "#d4788e",
    "--focus": "#d8a0e8",
    "--check": "#8a4a9a",
  },
  citrus: {
    "--paper": "#ffb84d",
    "--paper-2": "#ff9a1f",
    "--ink": "#000000",
    "--muted": "#000000",
    "--line": "#000000",
    "--today": "#ff6200",
    "--weekend": "#ff8c2a",
    "--danger": "#b01010",
    "--focus": "#000000",
    "--check": "#000000",
  },
  winter: {
    "--paper": "#d5e2ec",
    "--paper-2": "#c3d4e2",
    "--ink": "#1e3344",
    "--muted": "#5a7388",
    "--line": "#9bb4c6",
    "--today": "#b8d4c0",
    "--weekend": "#c8d8e6",
    "--danger": "#a85a5a",
    "--focus": "#3d6b58",
    "--check": "#2f5d4a",
  },
  noel: {
    "--paper": "#b01018",
    "--paper-2": "#9a0e14",
    "--ink": "#fff8f0",
    "--muted": "#f0d8c8",
    "--line": "#2a7a3a",
    "--today": "#1f6b3a",
    "--weekend": "#8a0c12",
    "--danger": "#ffe08a",
    "--focus": "#f0d070",
    "--check": "#f0d070",
  },
  golden: {
    "--paper": "#d4a84a",
    "--paper-2": "#c89838",
    "--ink": "#2a1a08",
    "--muted": "#5a3a18",
    "--line": "#8a6018",
    "--today": "#e8c86a",
    "--weekend": "#b88828",
    "--danger": "#a03020",
    "--focus": "#3a2410",
    "--check": "#2a1a08",
  },
};

const THEME_IDS = [
  "classic",
  "dark",
  "swamp",
  "turquoise",
  "orange",
  "candy",
  "citrus",
  "winter",
  "noel",
  "golden",
];

function isThemeId(value) {
  return THEME_IDS.includes(value);
}

const FREE_THEMES = [
  "classic",
  "dark",
  "turquoise",
  "swamp",
  "orange",
  "citrus",
  "candy",
  "winter",
  "noel",
  "golden",
];
const THEME_CHOICES = [
  ["classic", "Классика"],
  ["dark", "Тёмная"],
  ["turquoise", "Бирюзовый"],
  ["swamp", "Болотный"],
  ["orange", "Кожаный"],
  ["citrus", "Сочный"],
  ["candy", "Рассвет на море"],
  ["winter", "Зимний туман"],
  ["noel", "Новогодняя"],
  ["golden", "Золотая коза"],
];
const PLUS_KEY = "planer-plus-v1";
const PLUS_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PLUS_SECRET = "pulse-plus-2026";

function readPlus() {
  try {
    return localStorage.getItem(PLUS_KEY) === "1";
  } catch {
    return false;
  }
}

function hasPlus() {
  return state.plus === true;
}

function themeIsFree(themeName) {
  return FREE_THEMES.includes(themeName);
}

function displayedTheme() {
  if (isThemeId(state.theme) && (themeIsFree(state.theme) || hasPlus())) return state.theme;
  return "turquoise";
}

function plusDigest(payload) {
  let hash = 2166136261;
  const text = `${PLUS_SECRET}:${payload}`;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function plusChecksum(payload) {
  let n = plusDigest(payload);
  let out = "";
  for (let i = 0; i < 4; i += 1) {
    out += PLUS_ALPHABET[n % PLUS_ALPHABET.length];
    n = Math.floor(n / PLUS_ALPHABET.length);
  }
  return out;
}

function isPlusCode(value) {
  const code = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (code.length !== 8) return false;
  const payload = code.slice(0, 4);
  const check = code.slice(4);
  const chars = [...payload, ...check];
  if (chars.some((ch) => !PLUS_ALPHABET.includes(ch))) return false;
  return plusChecksum(payload) === check;
}

function applyTheme(themeName) {
  const theme = THEMES[themeName] || THEMES.turquoise;
  for (const [k, v] of Object.entries(theme)) document.documentElement.style.setProperty(k, v);
  document.documentElement.dataset.theme = THEMES[themeName] ? themeName : "turquoise";
}

const state = loadState();
state.plus = readPlus();
const root = document.getElementById("app");
let cloudApplying = false;
let lastDataFingerprint = plannerFingerprint(state);
applyTheme(displayedTheme());

function visibleLevels() {
  return state.levels.filter((level) => level.visible);
}

function visibleEntries() {
  const ids = new Set(visibleLevels().map((level) => level.id));
  return state.entries.filter((entry) => ids.has(entry.levelId));
}

function filterLabel() {
  const shown = visibleLevels();
  if (!shown.length) return "Ничего не выбрано";
  if (shown.length === state.levels.length) return "Все уровни";
  return shown.map((level) => level.name).join(" · ");
}

function levelById(id) {
  return state.levels.find((level) => level.id === id);
}

function isWorkLevel(levelId) {
  if (levelId === "level-work") return true;
  const level = levelById(levelId);
  return Boolean(level && /^работа$/i.test(level.name));
}

function selectedHabit() {
  return state.habits.find((habit) => habit.id === state.selectedHabitId);
}

function shiftCursor(direction) {
  const date = parseISODate(state.cursor);
  if (state.view === "day") state.cursor = toISODate(addDays(date, direction));
  else if (state.view === "week") state.cursor = toISODate(addDays(date, direction * 7));
  else if (state.view === "span") {
    date.setFullYear(date.getFullYear() + direction * (state.spanYears || 10));
    state.cursor = toISODate(date);
  } else if (state.view === "year" || state.view === "habit") {
    date.setFullYear(date.getFullYear() + direction);
    state.cursor = toISODate(date);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeChecklist(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: item.id || uid(),
      text: String(item.text || "").trim(),
      done: Boolean(item.done),
    }))
    .filter((item) => item.text);
}

function notesToChecklist(notes) {
  return String(notes || "")
    .split("\n")
    .map((line) => {
      const checked = line.match(/^\s*[-*]\s*\[([ xX])\]\s*(.*)$/);
      if (checked) {
        const text = checked[2].trim();
        return text ? { id: uid(), text, done: checked[1].toLowerCase() === "x" } : null;
      }
      const plain = line.replace(/^\s*[-*]\s*/, "").trim();
      return plain ? { id: uid(), text: plain, done: false } : null;
    })
    .filter(Boolean);
}

function checklistToNotes(items) {
  return normalizeChecklist(items)
    .map((item) => `- [${item.done ? "x" : " "}] ${item.text}`)
    .join("\n");
}

function initEditorChecklist(entry) {
  if (entry?.checklist?.length) state.editorChecklist = normalizeChecklist(entry.checklist);
  else if ((entry?.notes || "").trim()) state.editorChecklist = notesToChecklist(entry.notes);
  else state.editorChecklist = [];
}

function chip(entry, showTime) {
  const level = levelById(entry.levelId);
  const meta = [showTime && entry.startTime, level?.name].filter(Boolean).join(" · ");
  const checklist = normalizeChecklist(entry.checklist);
  const body = checklist.length
    ? `<div class="chip-checklist">${checklist
        .map(
          (item) =>
            `<div class="chip-check-item${item.done ? " done" : ""}"><span class="chip-check-mark">${item.done ? "✓" : "○"}</span><span>${escapeHtml(item.text)}</span></div>`,
        )
        .join("")}</div>`
    : (entry.notes || "").trim()
      ? `<div class="chip-text">${escapeHtml((entry.notes || "").trim())}</div>`
      : "";
  return `
    <div class="chip${entry.done ? " done" : ""}">
      <span class="chip-bar" style="background:${level?.color || "#7a7166"}"></span>
      <button type="button" class="chip-main" data-action="edit-entry" data-id="${entry.id}">
        <span class="chip-body">
        <div class="chip-title">${escapeHtml(entry.title || "Без названия")}</div>
        ${body}
        <div class="chip-meta-row">
          ${meta ? `<div class="chip-meta">${escapeHtml(meta)}</div>` : `<div class="chip-meta"></div>`}
          <label class="chip-toggle${entry.done ? " active" : ""}" data-action="toggle-done" data-id="${entry.id}">
            <input type="checkbox" ${entry.done ? "checked" : ""} />
            <span>сделано</span>
          </label>
        </div>
        </span>
      </button>
    </div>
  `;
}

function habitMarkDisplay(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (/^[xX✓✔]$/.test(v)) return "✓";
  if (/^\d{1,3}$/.test(v)) {
    const n = Number(v);
    if (n >= 1 && n <= 100) return String(n);
    if (n > 100) return "100";
    return "";
  }
  return v.slice(0, 3);
}

function normalizeHabitCellValue(raw) {
  const v = String(raw || "").trim().slice(0, 3);
  if (!v) return "";
  if (/^[xX✓✔]$/.test(v)) return "✓";
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    if (n >= 1 && n <= 100) return String(n);
    if (n > 100) return "100";
    return "";
  }
  return v;
}

const HABIT_SCHEDULES = [
  ["day", "Каждый день", "день"],
  ["week", "Раз в неделю", "неделя"],
  ["month", "Раз в месяц", "месяц"],
];

function normalizeSchedule(value) {
  return value === "week" || value === "month" ? value : "day";
}

function habitSchedule(habit) {
  return normalizeSchedule(habit?.schedule);
}

function habitScheduleLabel(schedule, short) {
  const row = HABIT_SCHEDULES.find((item) => item[0] === schedule) || HABIT_SCHEDULES[0];
  return short ? row[2] : row[1];
}

function habitsBySchedule(schedule) {
  return (state.habits || []).filter((habit) => habitSchedule(habit) === schedule);
}

function habitMarkedOn(habit, iso) {
  return Boolean(String(habit?.cells?.[iso] || "").trim());
}

function datesInWeek(mondayIso) {
  const start = parseISODate(mondayIso);
  return Array.from({ length: 7 }, (_, index) => toISODate(addDays(start, index)));
}

function monthDateList(year, month) {
  const max = daysInMonth(year, month);
  const mm = String(month + 1).padStart(2, "0");
  return Array.from({ length: max }, (_, index) => `${year}-${mm}-${String(index + 1).padStart(2, "0")}`);
}

function habitMarkedIn(habit, dates) {
  return dates.some((iso) => habitMarkedOn(habit, iso));
}

function clearHabitMarks(habit, dates) {
  if (!habit.cells) habit.cells = {};
  dates.forEach((iso) => {
    delete habit.cells[iso];
  });
}

function habitScheduleButtons(current, action, id) {
  return HABIT_SCHEDULES.map(
    ([value, label]) => `
      <button
        type="button"
        class="habit-schedule-btn${current === value ? " active" : ""}"
        data-action="${action}"
        ${id ? `data-id="${id}"` : ""}
        data-schedule="${value}"
      >${label}</button>`,
  ).join("");
}

const HABIT_BUCKETS = [
  ["", "Без корзины"],
  ["morning", "Утро"],
  ["day", "День"],
  ["evening", "Вечер"],
];

function habitBucketButtons(current, action, id) {
  return HABIT_BUCKETS.map(
    ([value, label]) => `
      <button
        type="button"
        class="habit-schedule-btn${current === value ? " active" : ""}"
        data-action="${action}"
        ${id ? `data-id="${id}"` : ""}
        data-bucket="${value}"
      >${label}</button>`,
  ).join("");
}

function habitMetaLine(habit) {
  const parts = [
    habitScheduleLabel(habitSchedule(habit)),
    habitBucketLabel(habitBucket(habit)),
    habitRemindAt(habit) ? `⌚ ${habitRemindAt(habit)}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

function habitCheckChip(habit, options) {
  const done = options.done;
  return `
    <div class="chip routine-chip habit-chip${done ? " done" : ""}">
      <span class="chip-bar" style="background:#2f6f73"></span>
      <span class="chip-body">
        <div class="chip-title">${escapeHtml(habit.name)}</div>
        <div class="chip-meta-row">
          <div class="chip-meta">${escapeHtml(habitMetaLine(habit))}</div>
          <label
            class="chip-toggle${done ? " active" : ""}"
            data-action="toggle-habit-mark"
            data-id="${habit.id}"
            data-scope="${options.scope}"
            data-anchor="${options.anchor}"
            data-mark="${options.mark}"
          >
            <input type="checkbox" ${done ? "checked" : ""} />
            <span>сделано</span>
          </label>
        </div>
      </span>
    </div>
  `;
}

function habitControls(habit) {
  const bucket = habitBucket(habit);
  const remind = habitRemindAt(habit);
  return `
    <div class="habit-controls">
      <div class="habit-schedule-row">
        ${habitScheduleButtons(habitSchedule(habit), "set-habit-schedule", habit.id)}
      </div>
      <div class="habit-schedule-row">
        ${habitBucketButtons(bucket, "set-habit-bucket", habit.id)}
      </div>
      <div class="habit-remind-row">
        <span>Напоминание</span>
        <div class="habit-remind-actions">
          <input
            class="habit-remind"
            type="text"
            inputmode="numeric"
            placeholder="нет"
            maxlength="5"
            data-role="habit-remind"
            data-id="${habit.id}"
            value="${escapeHtml(remind)}"
            title="Время в формате 09:00"
          />
          ${
            remind
              ? `<button type="button" class="ghost habit-remind-clear" data-action="clear-habit-remind" data-id="${habit.id}">Убрать</button>`
              : ""
          }
        </div>
      </div>
    </div>
  `;
}

function renderHabitChecks(title, habits, optionsFor) {
  if (!habits.length) return "";
  const done = habits.filter((habit) => optionsFor(habit).done).length;
  return `
    <section class="day-routines open habit-checks">
      <div class="day-routines-toggle static">
        <span>${escapeHtml(title)}</span>
        <span class="day-routines-meta">${done}/${habits.length}</span>
      </div>
      <div class="day-routines-body" data-open="true">
        ${habits.map((habit) => habitCheckChip(habit, optionsFor(habit))).join("")}
      </div>
    </section>
  `;
}

function renderMonthHabitChecks(year, month) {
  const habits = habitsBySchedule("month");
  if (!habits.length) return "";
  const dates = monthDateList(year, month);
  const today = toISODate(new Date());
  const mark = dates.includes(today) ? today : dates[0];
  const anchor = dates[0];
  return `
    <div class="month-habits">
      ${habits
        .map((habit) => {
          const done = habitMarkedIn(habit, dates);
          return `
            <label
              class="month-habit${done ? " done" : ""}"
              data-action="toggle-habit-mark"
              data-id="${habit.id}"
              data-scope="month"
              data-anchor="${anchor}"
              data-mark="${mark}"
            >
              <input type="checkbox" ${done ? "checked" : ""} />
              <span>${escapeHtml(habit.name)}</span>
            </label>`;
        })
        .join("")}
    </div>
  `;
}


function dayPlanCount(iso) {
  return visibleEntries().filter((entry) => entry.horizon === "day" && entry.date === iso).length;
}

const DAILY_QUOTES = [
  "Маленькие шаги каждый день складываются в жизнь.",
  "Сделай сегодня то, за что себе скажешь спасибо завтра.",
  "Не идеальный день — а живой.",
  "Тихий прогресс всё равно прогресс.",
  "Один спокойный шаг лучше десяти тревожных планов.",
  "Береги ритм — он важнее рывка.",
  "Можно начать с малого. Главное — начать.",
  "Сегодня достаточно быть честной с собой.",
  "Порядок снаружи помогает ясности внутри.",
  "Не догоняй всех — держи свой темп.",
  "То, что повторяешь, и становится тобой.",
  "Отдых — тоже часть работы над жизнью.",
  "Лучше чуть-чуть каждый день, чем идеально никогда.",
  "Сначала ясность, потом скорость.",
  "День не обязан быть большим, чтобы быть важным.",
  "Выбери одно важное — и сделай его.",
  "Мягкая дисциплина сильнее жёсткого давления.",
  "Пусть сегодня будет на шаг ближе к себе.",
  "Забота о себе — не награда, а условие.",
  "Планы помогают, если оставляют место живому.",
  "Не всё нужно успеть. Нужно выбрать.",
  "Спокойствие — тоже продуктивность.",
  "Маленькая победа сегодня кормит завтра.",
  "Доверься процессу, а не идеальной картинке.",
  "Ты уже в пути — просто продолжай.",
  "Ясный приоритет снимает половину шума.",
  "День удался, если ты к себе добрее.",
  "Делай меньше, но то, что правда твоё.",
  "Ритм важнее мотивации.",
  "Пусть будет просто: важное — вперёд.",
  "Не спеши. Иди верно.",
];

function quoteOfTheDay(date = new Date()) {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const now = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const dayOfYear = Math.floor((now - start) / 86400000);
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
}

function renderPlusSettings() {
  if (hasPlus()) {
    return `<p class="hint">Pulse Plus включён на этом устройстве: облако и копии.</p>`;
  }
  return `
          <p class="hint">Планировщик бесплатный. Все цвета уже открыты. Один код открывает на этом устройстве синхронизацию и копии.</p>
          <input class="add-level" data-role="plus-code" enterkeyhint="done" placeholder="Код Pulse Plus" autocomplete="off" />
          <p class="cloud-status" data-role="plus-status"></p>
          <button type="button" class="ghost" data-action="unlock-plus">Открыть</button>
  `;
}

function renderCloudSettings() {
  if (!hasPlus()) {
    return `
          <p class="hint">Синхронизация между телефоном и компьютером входит в Pulse Plus.</p>
          <button type="button" class="ghost" data-action="open-plus">Что входит в Plus</button>
    `;
  }
  const meta = window.PulseCloud?.loadMeta?.() || { enabled: false, email: "", lastError: "" };
  const nativeOk = window.PulseCloud?.isNativeApp?.();
  const status = window.PulseCloud?.formatStatus?.(meta) || "";
  return `
          <p class="cloud-help">
            Нужен <a href="https://id.mail.ru/security" target="_blank" rel="noopener">пароль внешнего приложения</a>
            с доступом к Облаку (WebDAV), не обычный пароль почты.
            Файл: <code>Pulse/planer.json</code> (или <code>planer.json</code> в корне Облака).
            ${nativeOk ? "" : "В браузере синхронизация не работает — откройте приложение на телефоне или компьютере."}
          </p>
          <input class="add-level" data-role="cloud-email" type="email" autocomplete="username" placeholder="email@mail.ru" value="${escapeHtml(meta.email || "")}" />
          <input class="add-level" data-role="cloud-password" type="password" autocomplete="off" placeholder="Пароль внешнего приложения" />
          <label class="cloud-enable">
            <input type="checkbox" data-role="cloud-enabled" ${meta.enabled ? "checked" : ""} />
            Синхронизировать это устройство
          </label>
          <label class="cloud-enable">
            <input type="checkbox" data-role="cloud-auto-30" ${meta.autoEvery30 ? "checked" : ""} ${meta.enabled ? "" : "disabled"} />
            Автосинхронизация каждые 30 минут
          </label>
          <p class="cloud-status" data-role="cloud-status">${escapeHtml(status)}</p>
          <div class="file-row">
            <button type="button" class="ghost" data-action="cloud-save">Сохранить</button>
            <button type="button" class="ghost" data-action="cloud-sync-now">Синхронизировать</button>
          </div>
  `;
}

function renderSettingsNav() {
  return `
    <div class="lists-block">
      <button
        type="button"
        class="routine-toggle${state.view === "settings" ? " open" : ""}"
        data-action="open-settings"
      >
        <span>Настройки</span>
        <span class="routine-toggle-meta">${state.view === "settings" ? "▾" : "▸"}</span>
      </button>
    </div>
  `;
}

function renderSettingsBoard() {
  return `
    <section class="lists-page settings-page">
      <div class="goals-panel open-always lists-create">
        <div class="banner-title">Настройки</div>
        <p class="hint" style="margin:0">Записи живут на устройстве. Синхронизация и копии открываются в Pulse Plus.</p>
      </div>

      <section class="settings-section" data-role="settings-day">
        <h3 class="settings-section-title">День</h3>
        <label class="daily-toggle" data-action="toggle-daily">
          <input type="checkbox" ${state.showDaily === false ? "" : "checked"} />
          Показывать дейли
        </label>
        <p class="hint">Можно убрать, когда не работаете.</p>
        <p class="hint">На телефоне: виджет «Сегодня» на рабочий стол и напоминания привычек (время у привычки). Разрешите уведомления Pulse.</p>
      </section>

      <section class="settings-section" data-role="settings-theme">
        <h3 class="settings-section-title">Цвет</h3>
        <div class="theme-settings-row">
          ${THEME_CHOICES.map(([id, label]) => {
            const paid = !themeIsFree(id);
            const locked = paid && !hasPlus();
            const active = displayedTheme() === id;
            return `<button type="button" class="${active ? "solid" : "ghost"}${locked ? " theme-locked" : ""}" data-action="set-theme" data-theme="${id}">${label}${locked ? " · Plus" : ""}</button>`;
          }).join("")}
        </div>
      </section>

      <section class="settings-section" data-role="settings-data">
        <h3 class="settings-section-title">Копии</h3>
        <p class="hint">Экспорт и импорт файла planer.json. На телефоне копия лежит в Загрузки → Pulse → planer.json и должна вернуться после переустановки.</p>
        <div class="file-row">
          <button type="button" class="ghost" data-action="export">Экспорт</button>
          <button type="button" class="ghost" data-action="import">Импорт</button>
          <button type="button" class="ghost" data-action="restore-phone-copy">Вернуть с телефона</button>
        </div>
        <input type="file" accept="application/json,.json" data-role="import-file" hidden />
      </section>

      <section class="settings-section" data-role="settings-cloud">
        <h3 class="settings-section-title">Облако Mail.ru</h3>
        ${renderCloudSettings()}
      </section>

      <section class="settings-section" data-role="settings-plus" id="settings-plus">
        <h3 class="settings-section-title">${hasPlus() ? "Pulse Plus включён" : "Pulse Plus"}</h3>
        ${renderPlusSettings()}
      </section>

      <section class="settings-section" data-role="settings-reminders">
        <h3 class="settings-section-title">Уведомления</h3>
        <p class="hint">${escapeHtml(state.remindStatus || "Проверяю…")}</p>
        <p class="hint">Напоминания: ${habitsWithReminders().length}</p>
        <div class="file-row">
          <button type="button" class="ghost" data-action="enable-reminders">Включить</button>
          <button type="button" class="ghost" data-action="test-reminder">Тест сейчас</button>
        </div>
      </section>

      <section class="settings-section" data-role="settings-about">
        <h3 class="settings-section-title">О приложении</h3>
        <p class="hint">Pulse ${escapeHtml(APP_VERSION)}</p>
        <p class="hint">${escapeHtml(widgetBridgeHint())}</p>
        <p class="hint">Что уйдёт в виджет «Сегодня»:</p>
        <pre class="widget-preview">${escapeHtml(buildTodayWidgetPayload().lines)}</pre>
        <button type="button" class="ghost" data-action="refresh-today-widget">Обновить виджет</button>
        <p class="hint" data-role="widget-push-status">${escapeHtml(state.widgetPushStatus || "")}</p>
      </section>
    </section>
  `;
}

function renderSidebar() {
  const rows = state.levels
    .map((level) => {
      if (state.levelDraftId === level.id) {
        return `
          <div class="edit-level">
            <input data-role="level-name" value="${escapeHtml(state.levelDraftName || level.name)}" />
            <div class="palette">
              ${PALETTE.map(
                (color) =>
                  `<button type="button" class="palette-swatch${color === level.color ? " selected" : ""}" data-action="level-color" data-id="${level.id}" data-color="${color}" aria-label="Цвет ${color}" title="${color}"><span class="palette-dot" style="background:${color};background-color:${color}"></span></button>`,
              ).join("")}
            </div>
            <div class="file-row">
              <button type="button" class="ghost" data-action="save-level" data-id="${level.id}">готово</button>
              <button type="button" class="ghost" data-action="delete-level" data-id="${level.id}">удалить</button>
            </div>
          </div>
        `;
      }
      return `
        <div class="level-row${state.lastLevelId === level.id ? " active" : ""}${level.visible ? "" : " hidden"}">
          <input type="checkbox" data-action="toggle-level" data-id="${level.id}" ${level.visible ? "checked" : ""} title="Показать на доске" />
          <span class="swatch" style="background:${level.color}"></span>
          <button type="button" class="level-name" data-action="select-level" data-id="${level.id}">${escapeHtml(level.name)}</button>
          <button type="button" class="ghost" data-action="edit-level" data-id="${level.id}">изм.</button>
        </div>
      `;
    })
    .join("");

  return `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-row">
          <div>
            <h1>Pulse</h1>
            <p class="brand-quote">${escapeHtml(quoteOfTheDay())}</p>
            <p class="brand-note">${window.PulseCloud?.loadMeta?.().enabled ? "Синхронизация с Облаком Mail.ru" : "Данные на этом устройстве"}</p>
          </div>
          <button type="button" class="icon-btn sidebar-close" data-action="close-sidebar" aria-label="Закрыть меню" title="Закрыть">✕</button>
        </div>
      </div>
      <div class="levels-block">
        <div class="section-head">
          <div class="section-label">На доске</div>
          <button type="button" class="ghost" data-action="show-all">Все</button>
        </div>
        <div class="level-list">${rows}</div>
        <div class="add-row">
          <input class="add-level" data-role="new-level" enterkeyhint="done" placeholder="Новый уровень…" />
          <button type="button" class="ghost add-row-btn" data-action="add-level" aria-label="Добавить уровень" title="Добавить">＋</button>
        </div>
      </div>
      ${renderSearchNav()}
      ${renderHabitNav()}
      ${renderGoalsNav()}
      <div class="horizons-block">
        <div class="section-label">Горизонты</div>
        <div class="span-switch">
          ${LIFE_SPANS.map(
            (n) =>
              `<button type="button" class="${state.view === "span" && state.spanYears === n ? "active" : ""}" data-action="span-view" data-span="${n}">${n} лет</button>`,
          ).join("")}
        </div>
      </div>
      ${renderListsNav()}
      ${renderSettingsNav()}
    </aside>
  `;
}

function renderSearchNav() {
  return `
    <div class="lists-block">
      <button
        type="button"
        class="routine-toggle${state.view === "search" ? " open" : ""}"
        data-action="open-search"
      >
        <span>Поиск</span>
        <span class="routine-toggle-meta">${state.view === "search" ? "▾" : "▸"}</span>
      </button>
    </div>
  `;
}

function renderSearchBoard() {
  const query = String(state.entrySearch || "");
  const results = searchPlannerEntries(query);
  const trimmed = query.trim();
  return `
    <section class="lists-page search-page">
      <div class="goals-panel open-always lists-create">
        <div class="banner-title">Поиск</div>
        <p class="hint" style="margin:0 0 10px">Ищет по названию, заметкам и пунктам чеклиста во всех записях.</p>
        <input
          class="add-level lists-search"
          data-role="entry-search"
          type="search"
          enterkeyhint="search"
          placeholder="Найти запись…"
          value="${escapeHtml(query)}"
          autofocus
        />
      </div>
      ${
        !trimmed
          ? `<p class="hint">Начните вводить текст — покажу совпадения.</p>`
          : !results.length
            ? `<p class="hint">Ничего не найдено по «${escapeHtml(trimmed)}».</p>`
            : `<div class="search-results">
                <p class="hint search-count">${results.length} ${plural(results.length, "запись", "записи", "записей")}</p>
                ${results
                  .map((entry) => {
                    const level = levelById(entry.levelId);
                    const snippet = String(entry.notes || "")
                      .trim()
                      .split("\n")[0]
                      .slice(0, 120);
                    return `
                  <button type="button" class="search-hit${entry.done ? " done" : ""}" data-action="open-search-entry" data-id="${entry.id}">
                    <span class="search-hit-title">${escapeHtml(entry.title || "Без названия")}</span>
                    <span class="search-hit-meta">${escapeHtml(horizonLabel(entry.horizon))} · ${escapeHtml(entry.date || "")}${level ? ` · ${escapeHtml(level.name)}` : ""}</span>
                    ${snippet ? `<span class="search-hit-snippet">${escapeHtml(snippet)}</span>` : ""}
                  </button>`;
                  })
                  .join("")}
              </div>`
      }
    </section>
  `;
}

function renderGoalsNav() {
  const draftYears = Math.min(120, Math.max(1, Number(state.goalYearsDraft) || 5));
  return `
    <div class="goals-block">
      <div class="section-label">Цели</div>
      <div class="goal-nav-list">
        ${(state.goals || [])
          .map((goal) => {
            const done = goal.items.filter((item) => item.done).length;
            return `
              <div class="habit-row${state.selectedGoalId === goal.id ? " active" : ""}">
                <button type="button" class="habit-name" data-action="select-goal" data-id="${goal.id}">
                  ${escapeHtml(goal.name)}
                </button>
                <span class="habit-count">${done}/${goal.items.length} · ${goal.years}л</span>
                <button type="button" class="ghost" data-action="delete-goal" data-id="${goal.id}">×</button>
              </div>
            `;
          })
          .join("")}
      </div>
      <div class="goal-year-presets">
        ${GOAL_YEAR_PRESETS.map(
          (n) =>
            `<button type="button" class="${draftYears === n ? "active" : ""}" data-action="set-goal-years-draft" data-years="${n}">${n}</button>`,
        ).join("")}
      </div>
      <div class="goal-create-row">
        <input class="add-level" data-role="new-goal-list" placeholder="Новый список целей…" />
        <input class="goal-years-input" data-role="goal-years-draft" type="number" min="1" max="120" value="${draftYears}" title="На сколько лет" />
      </div>
      <div class="goals-hint">Срок: ${draftYears} ${plural(draftYears, "год", "года", "лет")} — можно 1, 3 или любое число</div>
    </div>
  `;
}

function renderGoalsBoard() {
  const goal = selectedGoal();
  if (!goal) {
    return `<p class="hint">Выберите список целей слева или создайте новый. Срок можно задать на 1, 3, 5… или любое число лет.</p>`;
  }
  const start = Number(goal.startYear) || parseISODate(state.cursor).getFullYear();
  const end = start + Number(goal.years) - 1;
  const doneCount = goal.items.filter((item) => item.done).length;
  return `
    <section class="goals-panel open-always">
      <div class="goals-head">
        <div>
          <div class="banner-title">Цели</div>
          <h2 class="goals-title">${escapeHtml(goal.name)}</h2>
          <div class="goals-meta">${doneCount}/${goal.items.length} · ${start}–${end}</div>
        </div>
        <label class="goal-years-field">
          <span>На сколько лет</span>
          <input type="number" min="1" max="120" data-role="goal-years" data-id="${goal.id}" value="${goal.years}" />
        </label>
      </div>
      <div class="goal-year-presets board">
        ${GOAL_YEAR_PRESETS.map(
          (n) =>
            `<button type="button" class="${Number(goal.years) === n ? "active" : ""}" data-action="set-goal-years" data-id="${goal.id}" data-years="${n}">${n}</button>`,
        ).join("")}
      </div>
      <div class="goals-list">
        ${
          goal.items.length
            ? goal.items
                .map(
                  (item) => `
          <div class="goal-row${item.done ? " done" : ""}">
            <label class="goal-check" data-action="toggle-goal-item" data-id="${item.id}">
              <input type="checkbox" ${item.done ? "checked" : ""} tabindex="-1" />
              <span>${escapeHtml(item.text)}</span>
            </label>
            <button type="button" class="ghost" data-action="delete-goal-item" data-id="${item.id}">×</button>
          </div>`,
                )
                .join("")
            : `<div class="empty">Пока пусто — добавь первую цель ниже.</div>`
        }
      </div>
      <input class="add-level goals-input" data-role="new-goal-item" placeholder="Новая цель…" />
    </section>
  `;
}

function renderListsNav() {
  const total = (state.lists || []).length;
  return `
    <div class="lists-block">
      <button
        type="button"
        class="routine-toggle${state.view === "lists" ? " open" : ""}"
        data-action="open-lists"
      >
        <span>Списки</span>
        <span class="routine-toggle-meta">${total ? total : ""}${state.view === "lists" ? " ▾" : " ▸"}</span>
      </button>
    </div>
  `;
}

function renderListsBoard() {
  const query = String(state.listSearch || "")
    .trim()
    .toLowerCase();
  const lists = (state.lists || []).filter((list) =>
    query ? list.name.toLowerCase().includes(query) : true,
  );
  const expandedId = state.expandedListId || "";

  return `
    <section class="lists-page">
      <div class="goals-panel open-always lists-create">
        <div class="banner-title">Списки</div>
        <input
          class="add-level lists-search"
          data-role="list-search"
          type="search"
          placeholder="Поиск по названию…"
          value="${escapeHtml(state.listSearch || "")}"
        />
        <input class="add-level goals-input" data-role="new-list" placeholder="Новый список…" />
      </div>
      ${
        !(state.lists || []).length
          ? `<p class="hint">Пока списков нет — создайте первый выше.</p>`
          : !lists.length
            ? `<p class="hint">Ничего не найдено по «${escapeHtml(state.listSearch || "")}».</p>`
            : lists
                .map((list) => {
                  const doneCount = list.items.filter((item) => item.done).length;
                  const open = expandedId === list.id;
                  return `
        <section class="list-card${open ? " open" : ""}">
          <button type="button" class="list-card-toggle" data-action="toggle-list-open" data-id="${list.id}">
            <span class="list-card-name">${escapeHtml(list.name)}</span>
            <span class="list-card-meta">${doneCount}/${list.items.length}${open ? " ▾" : " ▸"}</span>
          </button>
          ${
            open
              ? `
          <div class="list-card-body">
            <div class="goals-list">
              ${
                list.items.length
                  ? list.items
                      .map(
                        (item) => `
                <div class="goal-row${item.done ? " done" : ""}">
                  <label class="goal-check" data-action="toggle-list-item" data-list-id="${list.id}" data-id="${item.id}">
                    <input type="checkbox" ${item.done ? "checked" : ""} tabindex="-1" />
                    <span>${escapeHtml(item.text)}</span>
                  </label>
                  <button type="button" class="ghost" data-action="delete-list-item" data-list-id="${list.id}" data-id="${item.id}">×</button>
                </div>`,
                      )
                      .join("")
                  : `<div class="empty">Пока пусто — добавьте пункты ниже.</div>`
              }
            </div>
            <input class="add-level goals-input" data-role="new-list-item" data-list-id="${list.id}" placeholder="Новый пункт…" />
            <div class="list-card-actions">
              <button type="button" class="ghost" data-action="delete-list" data-id="${list.id}">Удалить список</button>
            </div>
          </div>`
              : ""
          }
        </section>`;
                })
                .join("")
      }
    </section>
  `;
}

function renderHabitNav() {
  const total = (state.habits || []).length;
  return `
    <div class="habits-block">
      <button
        type="button"
        class="routine-toggle${state.view === "habit" ? " open" : ""}"
        data-action="open-habits"
      >
        <span>Привычки</span>
        <span class="routine-toggle-meta">${total ? total : ""}${state.view === "habit" ? " ▾" : " ▸"}</span>
      </button>
    </div>
  `;
}

function renderHabitStats(habit, year) {
  const stats = habitStats(habit, year);
  const maxDone = Math.max(1, ...stats.months.map((item) => item.done));
  const monthNames = ["я", "ф", "м", "а", "м", "и", "и", "а", "с", "о", "н", "д"];
  return `
    <div class="habit-stats">
      <div class="habit-stats-row">
        <div class="habit-stat">
          <span class="habit-stat-value">${stats.monthDone}</span>
          <span class="habit-stat-label">в месяце</span>
        </div>
        <div class="habit-stat">
          <span class="habit-stat-value">${stats.yearDone}</span>
          <span class="habit-stat-label">в году</span>
        </div>
        <div class="habit-stat">
          <span class="habit-stat-value">${stats.streak}</span>
          <span class="habit-stat-label">${plural(stats.streak || 0, "день", "дня", "дней")} подряд</span>
        </div>
      </div>
      <div class="habit-month-bars" aria-label="Отметки по месяцам">
        ${stats.months
          .map((item, index) => {
            const height = Math.max(8, Math.round((item.done / maxDone) * 100));
            return `<div class="habit-month-bar" title="${item.done} в месяце ${index + 1}">
              <span class="habit-month-fill" style="height:${height}%"></span>
              <span class="habit-month-label">${monthNames[index]}</span>
            </div>`;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderHabitTracker(habit, year) {
  const today = toISODate(new Date());
  const done = filledHabitCount(habit, year);
  const dayHeads = Array.from({ length: 31 }, (_, i) => `<th>${i + 1}</th>`).join("");
  const rows = Array.from({ length: 12 }, (_, month) => {
    const max = daysInMonth(year, month);
    const label = new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(new Date(year, month, 1));
    const cells = Array.from({ length: 31 }, (_, i) => {
      const day = i + 1;
      if (day > max) return `<td class="void"></td>`;
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const raw = habit.cells?.[iso] || "";
      const value = habitMarkDisplay(raw);
      const cls = [iso === today ? "today" : "", value ? "filled" : "", value === "✓" ? "checked" : ""]
        .filter(Boolean)
        .join(" ");
      return `<td class="${cls}"><input data-role="habit-cell" data-id="${habit.id}" data-date="${iso}" maxlength="3" value="${escapeHtml(value)}" title="${value === "✓" ? "Сделано" : value ? value : "1–100 или ✓"}" /></td>`;
    }).join("");
    return `<tr><th>${escapeHtml(label)}</th>${cells}</tr>`;
  }).join("");

  return `
    <div class="list-card-body habit-card-body">
      ${renderHabitStats(habit, year)}
      <div class="habit-board-head">
        <p class="hint">${done} из ${daysInYear(year)} · в ячейку — число 1–100 или ✓</p>
        <div class="habit-export-actions">
          <button type="button" class="ghost" data-action="export-habit-a4" data-mode="blank">A4 пустой</button>
          <button type="button" class="ghost" data-action="export-habit-a4" data-mode="filled">A4 с отметками</button>
        </div>
      </div>
      <div class="habit-table-wrap">
        <table class="habit-table">
          <thead><tr><th></th>${dayHeads}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="list-card-actions">
        <button type="button" class="ghost" data-action="delete-habit" data-id="${habit.id}">Удалить привычку</button>
      </div>
    </div>
  `;
}

function renderHabitBoard() {
  const year = parseISODate(state.cursor).getFullYear();
  const size = daysInYear(year);
  const habits = state.habits || [];
  const expandedId = state.selectedHabitId || "";
  const now = new Date();
  const monthIndex = now.getFullYear() === year ? now.getMonth() : 11;
  const monthTotal = habits.reduce((sum, habit) => sum + filledHabitMonthCount(habit, year, monthIndex), 0);
  const bestStreak = habits.reduce((best, habit) => Math.max(best, habitCurrentStreak(habit)), 0);

  return `
    <section class="lists-page habits-page">
      <div class="goals-panel open-always lists-create">
        <div class="banner-title">Привычки</div>
        <p class="hint" style="margin:0 0 10px">Каждый день — на экране дня, раз в неделю — на неделе, раз в месяц — в месяце. Можно выбрать корзину и напоминание. Отметка попадает в таблицу.</p>
        ${
          habits.length
            ? `<div class="habit-summary">
                <span>В этом месяце: <strong>${monthTotal}</strong> ${plural(monthTotal, "отметка", "отметки", "отметок")}</span>
                <span>Лучшая серия: <strong>${bestStreak}</strong> ${plural(bestStreak || 0, "день", "дня", "дней")}</span>
              </div>`
            : ""
        }
        <div class="habit-controls">
          <div class="habit-schedule-row">
            ${habitScheduleButtons(normalizeSchedule(state.habitScheduleDraft), "set-new-habit-schedule")}
          </div>
          <div class="habit-schedule-row">
            ${habitBucketButtons(normalizeBucket(state.habitBucketDraft), "set-new-habit-bucket")}
          </div>
        </div>
        <input class="add-level goals-input" data-role="new-habit" enterkeyhint="done" placeholder="Новая привычка…" />
      </div>
      ${
        habits.length
          ? habits
              .map((habit) => {
                const done = filledHabitCount(habit, year);
                const stats = habitStats(habit, year);
                const open = expandedId === habit.id;
                return `
        <section class="list-card${open ? " open" : ""}">
          <button type="button" class="list-card-toggle" data-action="toggle-habit-open" data-id="${habit.id}">
            <span class="list-card-name">${escapeHtml(habit.name)}</span>
            <span class="list-card-meta">${escapeHtml(habitMetaLine(habit))} · ${done}/${size} · серия ${stats.streak}${open ? " ▾" : " ▸"}</span>
          </button>
          ${habitControls(habit)}
          ${open ? renderHabitTracker(habit, year) : ""}
        </section>`;
              })
              .join("")
          : `<p class="hint">Пока привычек нет — создайте первую выше.</p>`
      }
    </section>
  `;
}

function buildHabitA4Document(habit, year, mode) {
  const months = Array.from({ length: 12 }, (_, month) => {
    const max = daysInMonth(year, month);
    const label = new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(new Date(year, month, 1));
    const dots = Array.from({ length: 31 }, (_, i) => {
      const day = i + 1;
      if (day > max) return `<span class="dot dot-void"></span>`;
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const value = habitMarkDisplay(habit.cells?.[iso] || "");
      const filled = mode === "filled" && value;
      const text = filled ? escapeHtml(value) : "";
      return `<span class="dot${filled ? " filled" : ""}" title="${day}">${text}</span>`;
    }).join("");
    return `
      <section class="month-card">
        <div class="month-top">
          <div class="month-name">${escapeHtml(label)}</div>
          <div class="month-line"></div>
        </div>
        <div class="dots-row">${dots}</div>
      </section>
    `;
  }).join("");

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(habit.name)} ${year}</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      * { box-sizing: border-box; }
      body {
        font-family: "Avenir Next", "Segoe UI", Arial, sans-serif;
        color: #24323a;
        margin: 0;
        background: #fffdfa;
      }
      .sheet {
        min-height: 100vh;
        padding: 8mm 10mm;
      }
      .hero {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12mm;
        margin-bottom: 8mm;
      }
      .hero-left {
        flex: 1 1 auto;
      }
      .badge {
        display: inline-block;
        padding: 8px 16px;
        border-radius: 4px;
        background: #ec8f92;
        color: #fff;
        font-size: 18px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        margin-bottom: 10px;
      }
      h1 {
        margin: 0 0 6px;
        font-size: 26px;
        font-family: "Iowan Old Style", Georgia, serif;
        text-transform: lowercase;
      }
      .meta {
        display: flex;
        align-items: center;
        gap: 10px;
        color: #78838b;
        font-size: 14px;
      }
      .meta-line {
        flex: 0 0 120px;
        border-bottom: 2px solid #cfd6da;
        height: 0;
      }
      .quote {
        max-width: 260px;
        color: #7a838a;
        font-size: 14px;
        line-height: 1.5;
        text-align: right;
      }
      .quote strong {
        display: block;
        margin-top: 8px;
        font-size: 12px;
        color: #9aa3a9;
      }
      .months-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 7px;
      }
      .month-card {
        display: grid;
        grid-template-columns: 120px 1fr;
        align-items: center;
        gap: 10px;
        min-height: 23px;
      }
      .month-top {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .month-name {
        font-size: 16px;
        font-weight: 600;
        color: #3a454d;
        text-transform: lowercase;
        min-width: 86px;
      }
      .month-line {
        flex: 1 1 auto;
        border-bottom: 2px solid #d8dee2;
      }
      .dots-row {
        display: grid;
        grid-template-columns: repeat(31, 1fr);
        gap: 4px;
        align-items: center;
      }
      .days-head {
        display: grid;
        grid-template-columns: 120px 1fr;
        gap: 10px;
        margin-bottom: 5px;
      }
      .days-spacer {
        height: 1px;
      }
      .days-grid {
        width: 100%;
        display: grid;
        grid-template-columns: repeat(31, 1fr);
        gap: 4px;
      }
      .day-num {
        text-align: center;
        font-size: 10px;
        color: #7d888f;
        font-weight: 700;
      }
      .dot {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 15px;
        height: 15px;
        border-radius: 999px;
        border: 1.7px solid #bfc7cc;
        color: #fff;
        font-size: 8px;
        font-weight: 700;
        line-height: 1;
      }
      .dot.filled {
        background: #68b9c8;
        border-color: #68b9c8;
      }
      .dot-void {
        visibility: hidden;
      }
      .footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 8mm;
        color: #9ca4aa;
        font-size: 12px;
      }
      .footer-line {
        flex: 1 1 auto;
        border-bottom: 1px solid #d8dee2;
        margin-left: 10px;
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="hero">
        <div class="hero-left">
          <div class="badge">Трекер привычек</div>
          <h1>${escapeHtml(habit.name)}</h1>
          <div class="meta">
            <span>${year}</span>
            <span class="meta-line"></span>
            <span>${mode === "filled" ? "с отметками" : "пустой шаблон"}</span>
          </div>
        </div>
        <div class="quote">
          Чтобы дойти до цели, нужно прежде всего идти.
          <strong>Оноре де Бальзак</strong>
        </div>
      </div>

      <div class="days-head">
        <div class="days-spacer"></div>
        <div class="days-grid">
          ${Array.from({ length: 31 }, (_, i) => `<span class="day-num">${i + 1}</span>`).join("")}
        </div>
      </div>

      <div class="months-grid">${months}</div>

      <div class="footer">
        <span>Моя привычка на ${year}</span>
        <span class="footer-line"></span>
      </div>
    </div>
  </body>
</html>`;
}

function showA4PreviewModal(docUrl) {
  const existing = document.getElementById("a4-preview-overlay");
  const overlay =
    existing ||
    (() => {
      const el = document.createElement("div");
      el.id = "a4-preview-overlay";
      el.innerHTML = `
        <div class="a4-preview-modal">
          <div class="a4-preview-actions">
            <button type="button" class="ghost" data-action="close-a4-preview">Закрыть</button>
            <button type="button" class="solid" data-action="print-a4-preview">Печать</button>
          </div>
          <iframe title="A4 preview" class="a4-preview-iframe"></iframe>
        </div>
      `;
      document.body.appendChild(el);
      el.addEventListener("click", (event) => {
        const t = event.target.closest("[data-action]");
        if (t) {
          const action = t.dataset.action;
          if (action === "close-a4-preview") {
            el.dataset.open = "false";
            return;
          }
          if (action === "print-a4-preview") {
            const iframe = el.querySelector("iframe");
            if (iframe && iframe.contentWindow) iframe.contentWindow.print();
          }
          return;
        }
        // Клик по затемнённому фону закрывает модалку.
        if (event.target === el) el.dataset.open = "false";
      });

      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (el.dataset.open === "true") el.dataset.open = "false";
      });
      return el;
    })();

  const iframe = overlay.querySelector("iframe");
  if (iframe) iframe.src = docUrl;
  overlay.dataset.open = "true";
}

function openHtmlDocument(doc, baseName) {
  const safeName = String(baseName || "planner-preview")
    .trim()
    .replace(/[^\p{L}\p{N}\-_]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "planner-preview";
  const url = URL.createObjectURL(new Blob([doc], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName}.html`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function spanWindow() {
  const start = parseISODate(state.cursor).getFullYear();
  const n = state.spanYears || 10;
  return { start, end: start + n - 1, n };
}

function spanLabel(n) {
  return `${n} ${plural(n, "год", "года", "лет")}`;
}

function heading() {
  const date = parseISODate(state.cursor);
  if (state.view === "day") return formatDayHeading(date);
  if (state.view === "week") return formatWeekRange(date);
  if (state.view === "habit") {
    const habit = selectedHabit();
    if (!habit) return "Привычки";
    return `${habit.name} · ${date.getFullYear()}`;
  }
  if (state.view === "goals") {
    const goal = selectedGoal();
    if (!goal) return "Цели";
    const start = Number(goal.startYear) || date.getFullYear();
    return `${goal.name} · ${start}–${start + Number(goal.years) - 1}`;
  }
  if (state.view === "lists") {
    return "Списки";
  }
  if (state.view === "search") {
    return "Поиск";
  }
  if (state.view === "settings") {
    return "Настройки";
  }
  if (state.view === "span") {
    const { start, end, n } = spanWindow();
    return `${spanLabel(n)} · ${start}–${end}`;
  }
  return String(date.getFullYear());
}

function renderTopBar() {
  return `
    <header class="topbar">
      <div class="topbar-row topbar-row-nav">
        <button type="button" class="icon-btn menu-btn" data-action="toggle-sidebar" aria-label="Меню" title="Меню">☰</button>
        <button type="button" class="icon-btn" data-action="shift" data-dir="-1">‹</button>
        <button type="button" class="icon-btn" data-action="shift" data-dir="1">›</button>
        <h2>${escapeHtml(heading())}</h2>
      </div>
      <div class="topbar-row topbar-row-meta">
        <span class="board-filter">${escapeHtml(filterLabel())}</span>
        ${state.view === "habit" || state.view === "goals" || state.view === "lists" || state.view === "search" || state.view === "settings" ? "" : `<button type="button" class="solid" data-action="compose" data-horizon="${state.view === "span" ? "span" : state.view}" data-date="${state.cursor}" data-year="${state.view === "year" || state.view === "span" ? "1" : ""}" data-span="${state.spanYears || ""}">Запись</button>`}
      </div>
      <div class="topbar-row topbar-row-views">
        <div class="horizon-switch">
          ${["day", "week", "year"]
            .map((id, i) => {
              const label = ["День", "Неделя", "Год"][i];
              return `<button type="button" class="${state.view === id ? "active" : ""}" data-action="view" data-view="${id}">${label}</button>`;
            })
            .join("")}
        </div>
        <button type="button" class="today-btn" data-action="today">Сегодня</button>
      </div>
    </header>
  `;
}

function renderWeek() {
  const date = parseISODate(state.cursor);
  const days = weekDates(date);
  const monday = toISODate(startOfWeek(date));
  const today = toISODate(new Date());
  const entries = visibleEntries();
  const weekItems = entries.filter(
    (entry) => entry.horizon === "week" && toISODate(startOfWeek(parseISODate(entry.date))) === monday,
  );
  const dayIsos = days.map((day) => toISODate(day));
  const activeIso = dayIsos.includes(state.weekTabDate)
    ? state.weekTabDate
    : dayIsos.includes(today)
      ? today
      : dayIsos.includes(toISODate(date))
        ? toISODate(date)
        : dayIsos[0];
  const activeDay = days[dayIsos.indexOf(activeIso)] || days[0];
  const activeItems = entries.filter((entry) => entry.horizon === "day" && entry.date === activeIso);
  const activeWeekend = activeDay.getDay() === 0 || activeDay.getDay() === 6;

  const cols = days
    .map((day) => {
      const iso = toISODate(day);
      const items = entries.filter((entry) => entry.horizon === "day" && entry.date === iso);
      const weekend = day.getDay() === 0 || day.getDay() === 6;
      return `
        <section class="day-col${iso === today ? " today" : ""}${weekend ? " weekend" : ""}">
          <div class="day-head"><span>${weekdayLabel(day)}</span><strong>${day.getDate()}</strong></div>
          <div class="drop-zone" data-action="compose" data-horizon="day" data-date="${iso}">
            ${items.map((entry) => chip(entry, true)).join("")}
            ${items.length ? "" : `<span class="empty">Добавить</span>`}
          </div>
        </section>
      `;
    })
    .join("");

  const tabs = days
    .map((day) => {
      const iso = toISODate(day);
      const count = dayPlanCount(iso);
      return `
        <button
          type="button"
          class="week-tab${iso === activeIso ? " active" : ""}${iso === today ? " today" : ""}"
          data-action="select-week-tab"
          data-date="${iso}"
        >
          <span class="week-tab-label">${weekdayLabel(day)} ${day.getDate()}</span>
          ${count ? `<span class="week-tab-count">${count}</span>` : ""}
        </button>
      `;
    })
    .join("");

  const weekHabitDates = days.map((day) => toISODate(day));
  return `
    <section class="week-banner" data-action="compose" data-horizon="week" data-date="${monday}">
      <div class="banner-title">План недели</div>
      ${weekItems.length ? `<div class="chip-row">${weekItems.map((entry) => chip(entry)).join("")}</div>` : `<div class="empty">Нажмите, чтобы задать намерение недели — дом, семья, отпуск</div>`}
    </section>
    ${renderHabitChecks("Привычки недели", habitsBySchedule("week"), (habit) => ({
      done: habitMarkedIn(habit, weekHabitDates),
      scope: "week",
      anchor: monday,
      mark: activeIso,
    }))}
    <div class="week-tabs">${tabs}</div>
    <section class="week-tab-panel day-col${activeIso === today ? " today" : ""}${activeWeekend ? " weekend" : ""}">
      ${renderHabitChecks("Привычки дня", sortHabitsForDay(habitsBySchedule("day")), (habit) => ({
        done: habitMarkedOn(habit, activeIso),
        scope: "day",
        anchor: activeIso,
        mark: activeIso,
      }))}
      <div class="drop-zone" data-action="compose" data-horizon="day" data-date="${activeIso}">
        ${activeItems.map((entry) => chip(entry, true)).join("")}
        ${activeItems.length ? "" : `<span class="empty">Добавить</span>`}
      </div>
    </section>
    <div class="week-grid">${cols}</div>
  `;
}

function renderYear() {
  const date = parseISODate(state.cursor);
  const year = date.getFullYear();
  const currentMonth = new Date().getFullYear() === year ? new Date().getMonth() : -1;
  const entries = visibleEntries();
  const yearItems = entries.filter(
    (entry) => entry.horizon === "year" && entry.wholeYear && parseISODate(entry.date).getFullYear() === year,
  );

  const months = Array.from({ length: 12 }, (_, month) => {
    const monthDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const monthItems = entries.filter(
      (entry) => entry.horizon === "year" && !entry.wholeYear && belongsToMonth(entry.date, year, month),
    );
    const activity = entries.filter((entry) => entry.horizon !== "year" && belongsToMonth(entry.date, year, month)).length;
    return `
      <section class="month-card${month === currentMonth ? " today" : ""}" data-action="compose" data-horizon="year" data-date="${monthDate}">
        <h3>${monthLabel(parseISODate(monthDate))}</h3>
        ${activity ? `<div class="activity">${activity} ${plural(activity, "запись", "записи", "записей")} на неделях и днях</div>` : ""}
        ${renderMonthHabitChecks(year, month)}
        ${monthItems.map((entry) => chip(entry)).join("")}
        ${monthItems.length ? "" : `<span class="empty">План месяца</span>`}
      </section>
    `;
  }).join("");

  return `
    <section class="year-banner" data-action="compose" data-horizon="year" data-date="${year}-01-01" data-year="1">
      <div class="banner-title">Тема года</div>
      ${yearItems.length ? `<div class="chip-row">${yearItems.map((entry) => chip(entry)).join("")}</div>` : `<div class="empty">Что важно в этом году на каждом уровне</div>`}
    </section>
    <div class="year-grid">${months}</div>
  `;
}

function renderSpan() {
  const { start, end, n } = spanWindow();
  const now = new Date().getFullYear();
  const entries = visibleEntries();
  const periodItems = entries.filter(
    (entry) =>
      entry.horizon === "span" &&
      Number(entry.spanYears) === n &&
      entry.wholeYear &&
      parseISODate(entry.date).getFullYear() === start,
  );
  const compact = n >= 20;
  const minWidth = n >= 70 ? 72 : n >= 30 ? 96 : 128;
  const years = Array.from({ length: n }, (_, i) => start + i)
    .map((year) => {
      const yearDate = `${year}-01-01`;
      const yearItems = entries.filter((entry) => {
        const entryYear = parseISODate(entry.date).getFullYear();
        if (entryYear !== year) return false;
        if (entry.horizon === "year" && entry.wholeYear) return true;
        if (entry.horizon === "span" && Number(entry.spanYears) === n && !entry.wholeYear) return true;
        return false;
      });
      const activity = entries.filter((entry) => {
        const entryYear = parseISODate(entry.date).getFullYear();
        return entryYear === year && entry.horizon !== "span" && !(entry.horizon === "year" && entry.wholeYear);
      }).length;
      return `
        <section class="month-card span-year${year === now ? " today" : ""}${compact ? " compact" : ""}" data-action="compose" data-horizon="year" data-date="${yearDate}" data-year="1">
          <h3>${year}</h3>
          ${activity ? `<div class="activity">${activity}</div>` : ""}
          ${yearItems.map((entry) => chip(entry)).join("")}
          ${yearItems.length ? "" : `<span class="empty">${compact ? "+" : "План года"}</span>`}
        </section>
      `;
    })
    .join("");

  return `
    <section class="year-banner" data-action="compose" data-horizon="span" data-date="${start}-01-01" data-year="1" data-span="${n}">
      <div class="banner-title">План на ${escapeHtml(spanLabel(n))} · ${start}–${end}</div>
      ${periodItems.length ? `<div class="chip-row">${periodItems.map((entry) => chip(entry)).join("")}</div>` : `<div class="empty">Нажмите, чтобы задать направление на ${escapeHtml(spanLabel(n))}</div>`}
    </section>
    <div class="span-grid" style="grid-template-columns:repeat(auto-fill,minmax(${minWidth}px,1fr))">${years}</div>
  `;
}

function lineFromEntry(entry) {
  const title = (entry.title || "").trim();
  const notes = (entry.notes || "").trim();
  const text = notes && notes !== title ? `${title}${title ? ". " : ""}${notes}` : title || notes;
  if (!text) return "";
  return entry.done ? `${text} — сделала` : text;
}

function composeDailyText(cursorDate) {
  const yesterday = toISODate(addDays(cursorDate, -1));
  const today = toISODate(cursorDate);
  const yesterdayLabel = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(
    parseISODate(yesterday),
  );
  const entries = (state.entries || []).filter((entry) => isWorkLevel(entry.levelId));
  const yesterdayItems = entries
    .filter((entry) => entry.horizon === "day" && entry.date === yesterday)
    .map(lineFromEntry)
    .filter(Boolean);
  const todayItems = entries
    .filter((entry) => entry.horizon === "day" && entry.date === today)
    .map(lineFromEntry)
    .filter(Boolean);

  const parts = [`Дейли · Работа · ${yesterdayLabel}`];
  parts.push("");
  if (yesterdayItems.length) {
    parts.push("Вчера по работе:");
    yesterdayItems.forEach((item) => parts.push(`• ${item}`));
  } else {
    parts.push("Вчера по работе записей нет — можно дописать.");
  }
  parts.push("");
  if (todayItems.length) {
    parts.push("Сегодня по работе:");
    todayItems.forEach((item) => parts.push(`• ${item}`));
  } else {
    parts.push("Сегодня по работе пока пусто — добавьте задачи на уровень «Работа».");
  }
  return parts.join("\n");
}

function renderDay() {
  const date = parseISODate(state.cursor);
  const iso = toISODate(date);
  const monday = toISODate(startOfWeek(date));
  const year = date.getFullYear();
  const entries = visibleEntries();
  const dayItems = entries.filter((entry) => entry.horizon === "day" && entry.date === iso);
  const weekItems = entries.filter(
    (entry) => entry.horizon === "week" && toISODate(startOfWeek(parseISODate(entry.date))) === monday,
  );
  const yearItems = entries.filter((entry) => {
    if (entry.horizon !== "year") return false;
    const entryDate = parseISODate(entry.date);
    return entryDate.getFullYear() === year && (entry.wholeYear || entryDate.getMonth() === date.getMonth());
  });
  const context = [...yearItems, ...weekItems];
  const buckets = [
    ["allday", "Весь день", ""],
    ["morning", "Утро", "09:00"],
    ["day", "День", "13:00"],
    ["evening", "Вечер", "19:00"],
  ];

  const generated = composeDailyText(date);
  const custom = state.dailies?.[iso];
  const dailyText = custom || generated;

  const showDaily = state.showDaily !== false;
  return `
    <div class="day-page${showDaily ? "" : " no-daily"}">
    <div class="day-layout">
      <section class="day-context">
        <div class="banner-title">Контекст · ${escapeHtml(formatWeekRange(date))}</div>
        ${context.length ? `<div class="chip-row">${context.map((entry) => chip(entry)).join("")}</div>` : `<div class="empty">Сначала можно наметить год или неделю</div>`}
      </section>
      ${renderHabitChecks("Привычки", sortHabitsForDay(habitsBySchedule("day")), (habit) => ({
        done: habitMarkedOn(habit, iso),
        scope: "day",
        anchor: iso,
        mark: iso,
      }))}
      ${buckets
        .map(([id, title, time]) => {
          const items = dayItems.filter((entry) => timeBucket(entry.startTime) === id);
          return `
            <section class="day-section">
              <h3>${title}</h3>
              ${items.map((entry) => chip(entry, true)).join("")}
              <button type="button" class="add-entry" data-action="compose" data-horizon="day" data-date="${iso}" data-time="${time}">Добавить</button>
            </section>
          `;
        })
        .join("")}
    </div>
    ${
      showDaily
        ? `<aside class="daily-panel">
      <div class="daily-head">
        <div class="banner-title">Дейли</div>
        <button type="button" class="ghost" data-action="reset-daily" data-date="${iso}">Собрать заново</button>
      </div>
      <textarea data-role="daily-text" data-date="${iso}" spellcheck="true">${escapeHtml(dailyText)}</textarea>
      <p class="daily-hint">Только задачи уровня «Работа». Без ежедневных, дома, семьи и отпуска. «Собрать заново» обновит текст. Выключается в меню, когда не работаете.</p>
    </aside>`
        : ""
    }
    </div>
  `;
}

function renderEditor() {
  const existing = state.editingId ? state.entries.find((entry) => entry.id === state.editingId) : null;
  if (!existing && !state.composing) return "";
  const draft = {
    id: existing?.id || "",
    levelId: state.lastLevelId || state.levels[0]?.id || "",
    title: "",
    notes: "",
    horizon: state.composing?.horizon || existing?.horizon || "day",
    date:
      state.composing?.horizon === "week"
        ? toISODate(startOfWeek(parseISODate(state.composing.date)))
        : state.composing?.date || existing?.date || state.cursor,
    startTime: state.composing?.startTime || existing?.startTime || "",
    done: Boolean(existing?.done),
    wholeYear: Boolean(state.composing?.wholeYear ?? existing?.wholeYear),
    spanYears: Number(state.composing?.spanYears || existing?.spanYears || state.spanYears || 10),
    ...(existing || {}),
    ...(state.editorDraft || {}),
  };
  if (state.editorDraft?.levelId) draft.levelId = state.editorDraft.levelId;
  const checklist = Array.isArray(state.editorChecklist) ? state.editorChecklist : [];

  return `
    <div class="panel-root" data-action="close-editor">
      <form class="panel" data-role="editor" data-id="${draft.id}">
        <h3>${existing ? "Запись" : "Новая запись"}</h3>
        <label class="field"><span>Название</span><input name="title" value="${escapeHtml(draft.title || "")}" placeholder="Что планируете" autofocus /></label>
        <label class="field"><span>Уровень</span>
          <select name="levelId">
            ${state.levels.map((level) => `<option value="${level.id}" ${level.id === draft.levelId ? "selected" : ""}>${escapeHtml(level.name)}</option>`).join("")}
          </select>
        </label>
        <div class="row">
          <label class="field"><span>Горизонт</span>
            <select name="horizon">
              <option value="day" ${draft.horizon === "day" ? "selected" : ""}>День</option>
              <option value="week" ${draft.horizon === "week" ? "selected" : ""}>Неделя</option>
              <option value="year" ${draft.horizon === "year" ? "selected" : ""}>Год</option>
              ${LIFE_SPANS.map(
                (n) =>
                  `<option value="span-${n}" ${draft.horizon === "span" && Number(draft.spanYears) === n ? "selected" : ""}>${spanLabel(n)}</option>`,
              ).join("")}
            </select>
          </label>
          <label class="field"><span>Дата</span><input type="date" name="date" value="${draft.date}" /></label>
        </div>
        <label class="field"><span>Время — по желанию</span><input type="time" name="startTime" value="${draft.startTime || ""}" /></label>
        <label class="check"><input type="checkbox" name="wholeYear" ${draft.wholeYear ? "checked" : ""} /> ${draft.horizon === "span" ? "На весь период, не на один год" : "На весь год, не на месяц"}</label>
        <div class="field">
          <span>Заметки · списком</span>
          <div class="editor-checklist">
            ${
              checklist.length
                ? checklist
                    .map(
                      (item) => `
              <div class="goal-row${item.done ? " done" : ""}">
                <label class="goal-check" data-action="toggle-editor-check" data-id="${item.id}">
                  <input type="checkbox" ${item.done ? "checked" : ""} tabindex="-1" />
                  <span>${escapeHtml(item.text)}</span>
                </label>
                <button type="button" class="ghost" data-action="delete-editor-check" data-id="${item.id}">×</button>
              </div>`,
                    )
                    .join("")
                : `<div class="empty">Добавляй пункты ниже — каждый с Enter</div>`
            }
            <input class="add-level" data-role="new-editor-check" placeholder="Новый пункт списка…" />
          </div>
        </div>
        <label class="check"><input type="checkbox" name="done" ${draft.done ? "checked" : ""} /> Сделано</label>
        <div class="panel-actions">
          ${existing ? `<button type="button" class="danger" data-action="delete-entry" data-id="${existing.id}">Удалить</button>` : "<span></span>"}
          <button type="button" class="today-btn" data-action="close-editor">Отмена</button>
          <button type="submit" class="solid">Сохранить</button>
        </div>
      </form>
    </div>
  `;
}

let lastRenderedView = "";

function captureScroll() {
  return {
    canvas: root.querySelector(".canvas")?.scrollTop || 0,
    theme: root.querySelector(".theme-settings-row")?.scrollTop || 0,
    sidebar: root.querySelector(".sidebar")?.scrollTop || 0,
  };
}

function restoreScroll(saved) {
  if (!saved) return;
  const canvas = root.querySelector(".canvas");
  const theme = root.querySelector(".theme-settings-row");
  const sidebar = root.querySelector(".sidebar");
  if (canvas) canvas.scrollTop = saved.canvas;
  if (theme) theme.scrollTop = saved.theme;
  if (sidebar) sidebar.scrollTop = saved.sidebar;
}

function render() {
  const keepScroll = lastRenderedView === state.view;
  const savedScroll = keepScroll ? captureScroll() : null;
  const viewHtml =
    state.view === "habit"
      ? renderHabitBoard()
      : state.view === "goals"
        ? renderGoalsBoard()
        : state.view === "lists"
          ? renderListsBoard()
          : state.view === "search"
            ? renderSearchBoard()
          : state.view === "settings"
            ? renderSettingsBoard()
          : !visibleLevels().length
            ? `<p class="hint">На доске ничего не выбрано. Отметьте уровни слева или нажмите «Все».</p>`
            : state.view === "day"
              ? renderDay()
              : state.view === "year"
                ? renderYear()
                : state.view === "span"
                  ? renderSpan()
                  : renderWeek();
  root.innerHTML = `
    <div class="app${state.sidebarOpen ? " sidebar-open" : ""}">
      <div class="sidebar-backdrop" data-action="close-sidebar"></div>
      ${renderSidebar()}
      <main class="workspace">
        ${renderTopBar()}
        <div class="canvas">${viewHtml}</div>
      </main>
      ${renderEditor()}
    </div>
    ${renderFocusTimer()}
  `;
  lastRenderedView = state.view;
  applyTheme(displayedTheme());
  if (savedScroll) {
    restoreScroll(savedScroll);
    requestAnimationFrame(() => restoreScroll(savedScroll));
  }
  persist(state);
  paintTimerDisplay();
}

function closeEditor() {
  state.composing = null;
  state.editingId = null;
  state.editorChecklist = [];
  state.editorDraft = null;
}

function snapshotEditorForm() {
  const form = root.querySelector("[data-role=editor]");
  if (!form) return;
  const data = new FormData(form);
  let horizon = String(data.get("horizon") || "day");
  let spanYears = 10;
  if (horizon.startsWith("span-")) {
    spanYears = Number(horizon.slice(5));
    horizon = "span";
  }
  state.editorDraft = {
    title: String(data.get("title") || ""),
    levelId: String(data.get("levelId") || ""),
    horizon,
    spanYears,
    date: String(data.get("date") || state.cursor),
    startTime: String(data.get("startTime") || ""),
    wholeYear: data.get("wholeYear") === "on",
    done: data.get("done") === "on",
  };
}

function exportFile() {
  const blob = new Blob(
    [
      JSON.stringify(snapshotPlanner(state), null, 2),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "planer.json";
  link.click();
  URL.revokeObjectURL(url);
}

function importFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!applyPlannerSnapshot(parsed, { bumpTime: true })) return;
      closeEditor();
      render();
      scheduleRemindSync();
      window.PulseCloud?.schedulePush?.();
    } catch {
      /* ignore broken local files */
    }
  };
  reader.readAsText(file);
}

root.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "close-editor") {
    if (event.target.closest("[data-role=editor]") && event.currentTarget !== target) {
      if (target.dataset.action === "close-editor" && target.classList.contains("panel-root") && event.target !== target) return;
    }
    if (target.classList.contains("panel-root") && event.target !== target) return;
    closeEditor();
    render();
    return;
  }

  if (action === "edit-entry") {
    event.stopPropagation();
    state.editingId = target.dataset.id;
    state.composing = null;
    const entry = state.entries.find((item) => item.id === target.dataset.id);
    state.editorDraft = null;
    initEditorChecklist(entry);
    render();
    return;
  }

  if (action === "toggle-done") {
    event.stopPropagation();
    const entry = state.entries.find((item) => item.id === target.dataset.id);
    if (entry) entry.done = !entry.done;
    render();
    return;
  }


  if (action === "toggle-habit-mark") {
    event.preventDefault();
    event.stopPropagation();
    const habit = state.habits.find((item) => item.id === target.dataset.id);
    const anchor = target.dataset.anchor;
    if (!habit || !anchor) return;
    if (!habit.cells) habit.cells = {};
    const scope = target.dataset.scope || "day";
    let dates = [anchor];
    if (scope === "week") dates = datesInWeek(anchor);
    if (scope === "month") {
      const parsed = parseISODate(anchor);
      dates = monthDateList(parsed.getFullYear(), parsed.getMonth());
    }
    const done = habitMarkedIn(habit, dates);
    if (done) clearHabitMarks(habit, dates);
    else habit.cells[target.dataset.mark || anchor] = "✓";
    render();
    return;
  }

  if (action === "set-habit-schedule") {
    event.preventDefault();
    event.stopPropagation();
    const habit = state.habits.find((item) => item.id === target.dataset.id);
    if (!habit) return;
    habit.schedule = normalizeSchedule(target.dataset.schedule);
    render();
    return;
  }

  if (action === "set-habit-bucket") {
    event.preventDefault();
    event.stopPropagation();
    const habit = state.habits.find((item) => item.id === target.dataset.id);
    if (!habit) return;
    habit.bucket = normalizeBucket(target.dataset.bucket);
    render();
    return;
  }

  if (action === "clear-habit-remind") {
    event.preventDefault();
    event.stopPropagation();
    const habit = state.habits.find((item) => item.id === target.dataset.id);
    if (!habit) return;
    habit.remindAt = "";
    render();
    scheduleRemindSync();
    return;
  }

  if (action === "set-new-habit-schedule") {
    event.preventDefault();
    state.habitScheduleDraft = normalizeSchedule(target.dataset.schedule);
    root.querySelectorAll("[data-action=set-new-habit-schedule]").forEach((button) => {
      button.classList.toggle("active", button.dataset.schedule === state.habitScheduleDraft);
    });
    return;
  }

  if (action === "set-new-habit-bucket") {
    event.preventDefault();
    state.habitBucketDraft = normalizeBucket(target.dataset.bucket);
    root.querySelectorAll("[data-action=set-new-habit-bucket]").forEach((button) => {
      button.classList.toggle("active", (button.dataset.bucket || "") === state.habitBucketDraft);
    });
    return;
  }

  if (action === "compose") {
    if (event.target.closest("[data-action=edit-entry]")) return;
    state.editingId = null;
    state.composing = {
      horizon: target.dataset.horizon,
      date: target.dataset.date,
      wholeYear: target.dataset.year === "1",
      startTime: target.dataset.time || "",
      spanYears: target.dataset.span ? Number(target.dataset.span) : state.spanYears,
    };
    initEditorChecklist(null);
    state.editorDraft = null;
    render();
    const input = root.querySelector("[data-role=editor] [name=title]");
    if (input) input.focus();
    return;
  }

  if (action === "toggle-sidebar") {
    state.sidebarOpen = !state.sidebarOpen;
    render();
    return;
  }

  if (action === "close-sidebar") {
    state.sidebarOpen = false;
    render();
    return;
  }

  if (action === "select-week-tab") {
    state.weekTabDate = target.dataset.date;
    state.cursor = target.dataset.date;
    render();
    return;
  }

  if (action === "view") {
    state.view = target.dataset.view;
    state.sidebarOpen = false;
    render();
    return;
  }

  if (action === "span-view") {
    state.view = "span";
    state.spanYears = Number(target.dataset.span);
    state.sidebarOpen = false;
    render();
    return;
  }

  if (action === "toggle-editor-check") {
    event.preventDefault();
    event.stopPropagation();
    snapshotEditorForm();
    if (!Array.isArray(state.editorChecklist)) state.editorChecklist = [];
    const item = state.editorChecklist.find((g) => g.id === target.dataset.id);
    if (item) item.done = !item.done;
    render();
    return;
  }

  if (action === "delete-editor-check") {
    event.stopPropagation();
    snapshotEditorForm();
    if (!Array.isArray(state.editorChecklist)) state.editorChecklist = [];
    state.editorChecklist = state.editorChecklist.filter((g) => g.id !== target.dataset.id);
    render();
    return;
  }

  if (action === "select-goal") {
    state.selectedGoalId = target.dataset.id;
    state.view = "goals";
    state.sidebarOpen = false;
    render();
    return;
  }

  if (action === "delete-goal") {
    event.stopPropagation();
    state.goals = state.goals.filter((goal) => goal.id !== target.dataset.id);
    if (state.selectedGoalId === target.dataset.id) {
      state.selectedGoalId = state.goals[0]?.id || "";
      if (!state.selectedGoalId && state.view === "goals") state.view = "week";
    }
    render();
    return;
  }

  if (action === "set-goal-years-draft") {
    state.goalYearsDraft = Math.min(120, Math.max(1, Number(target.dataset.years) || 5));
    render();
    return;
  }

  if (action === "set-goal-years") {
    const goal = state.goals.find((g) => g.id === target.dataset.id);
    if (goal) goal.years = Math.min(120, Math.max(1, Number(target.dataset.years) || goal.years || 5));
    render();
    return;
  }

  if (action === "toggle-goal-item") {
    event.preventDefault();
    event.stopPropagation();
    const goal = selectedGoal();
    const item = goal?.items.find((g) => g.id === target.dataset.id);
    if (item) item.done = !item.done;
    render();
    return;
  }

  if (action === "delete-goal-item") {
    event.stopPropagation();
    const goal = selectedGoal();
    if (goal) goal.items = goal.items.filter((g) => g.id !== target.dataset.id);
    render();
    return;
  }

  if (action === "select-list") {
    state.selectedListId = target.dataset.id;
    state.view = "lists";
    state.sidebarOpen = false;
    render();
    return;
  }

  if (action === "open-search") {
    state.view = "search";
    state.sidebarOpen = false;
    closeEditor();
    render();
    const field = root.querySelector("[data-role=entry-search]");
    if (field) field.focus();
    return;
  }

  if (action === "open-search-entry") {
    const entry = state.entries.find((item) => item.id === target.dataset.id);
    if (!entry) return;
    state.editingId = entry.id;
    state.composing = null;
    state.editorDraft = null;
    if (entry.date) state.cursor = entry.date;
    initEditorChecklist(entry);
    render();
    return;
  }

  if (action === "open-lists") {
    state.view = "lists";
    state.sidebarOpen = false;
    render();
    return;
  }

  if (action === "open-settings") {
    state.view = "settings";
    state.sidebarOpen = false;
    render();
    scheduleRemindSync();
    return;
  }

  if (action === "refresh-today-widget") {
    state.widgetPushStatus = "Обновляю виджет…";
    render();
    pushTodayWidget({ toast: true }).then((result) => {
      if (!result?.ok && result?.reason === "no-plugin") {
        state.widgetPushStatus = widgetBridgeHint();
      } else if (!result?.ok) {
        state.widgetPushStatus = "Не удалось отправить текст на виджет.";
      } else if (!result.widgets) {
        state.widgetPushStatus =
          "Текст сохранён, но виджета на экране нет — добавь «Сегодня» с рабочего стола.";
      } else {
        state.widgetPushStatus = `На виджет ушло (${result.widgets}): обновлён.`;
      }
      if (state.view === "settings") render();
    });
    return;
  }

  if (action === "enable-reminders") {
    state.remindStatus = "Запрашиваю разрешения…";
    render();
    syncRoutineReminders({ prompt: true }).then(() => {
      if (state.view === "settings") render();
    });
    return;
  }

  if (action === "test-reminder") {
    state.remindStatus = "Ставлю тест на 3 секунды…";
    render();
    syncRoutineReminders({ prompt: true, test: true }).then(() => {
      if (state.view === "settings") render();
    });
    return;
  }

  if (action === "restore-phone-copy") {
    phoneCopyReady = false;
    restorePhoneCopy().finally(() => {
      phoneCopyReady = true;
      closeEditor();
      render();
      scheduleTodayWidget();
    });
    return;
  }

  if (action === "open-habits") {
    state.view = "habit";
    state.sidebarOpen = false;
    render();
    return;
  }

  if (action === "timer-start") {
    startTimerPhase("work", { chime: true });
    render();
    return;
  }

  if (action === "timer-pause") {
    const timer = ensureTimer();
    if (timer.phase !== "idle" && timer.endsAt) {
      timer.pausedMs = Math.max(0, timer.endsAt - Date.now());
      timer.endsAt = 0;
      cancelTimerAlarm();
      render();
    }
    return;
  }

  if (action === "timer-resume") {
    const timer = ensureTimer();
    if (timer.phase !== "idle" && timer.pausedMs > 0) {
      timer.endsAt = Date.now() + timer.pausedMs;
      timer.pausedMs = 0;
      scheduleTimerAlarm();
      render();
    }
    return;
  }

  if (action === "timer-skip") {
    const timer = ensureTimer();
    if (timer.phase === "idle") return;
    advanceTimerPhase();
    render();
    return;
  }

  if (action === "timer-reset") {
    const timer = ensureTimer();
    timer.phase = "idle";
    timer.endsAt = 0;
    timer.pausedMs = 0;
    cancelTimerAlarm();
    render();
    return;
  }

  if (action === "timer-toggle-settings") {
    const timer = ensureTimer();
    timer.settingsOpen = !timer.settingsOpen;
    render();
    return;
  }

  if (action === "timer-collapse") {
    const timer = ensureTimer();
    timer.collapsed = true;
    timer.settingsOpen = false;
    render();
    return;
  }

  if (action === "timer-expand") {
    const timer = ensureTimer();
    timer.collapsed = false;
    render();
    return;
  }

  if (action === "toggle-list-open") {
    state.expandedListId = state.expandedListId === target.dataset.id ? "" : target.dataset.id;
    render();
    return;
  }

  if (action === "delete-list") {
    event.stopPropagation();
    state.lists = (state.lists || []).filter((list) => list.id !== target.dataset.id);
    if (state.selectedListId === target.dataset.id) {
      state.selectedListId = state.lists[0]?.id || "";
    }
    if (state.expandedListId === target.dataset.id) {
      state.expandedListId = "";
    }
    render();
    return;
  }

  if (action === "toggle-list-item") {
    event.preventDefault();
    event.stopPropagation();
    const list =
      (state.lists || []).find((item) => item.id === target.dataset.listId) || selectedList();
    const item = list?.items.find((g) => g.id === target.dataset.id);
    if (item) item.done = !item.done;
    render();
    return;
  }

  if (action === "delete-list-item") {
    event.stopPropagation();
    const list =
      (state.lists || []).find((item) => item.id === target.dataset.listId) || selectedList();
    if (list) list.items = list.items.filter((g) => g.id !== target.dataset.id);
    render();
    return;
  }

  if (action === "shift") {
    shiftCursor(Number(target.dataset.dir));
    render();
    return;
  }

  if (action === "today") {
    state.cursor = toISODate(new Date());
    render();
    return;
  }

  if (action === "toggle-level") {
    const level = levelById(target.dataset.id);
    if (level) level.visible = !level.visible;
    render();
    return;
  }

  if (action === "show-all") {
    state.levels.forEach((level) => {
      level.visible = true;
    });
    render();
    return;
  }

  if (action === "add-level") {
    const input = root.querySelector("[data-role=new-level]");
    if (!input || !addLevel(input.value)) return;
    render();
    const next = root.querySelector("[data-role=new-level]");
    if (next) next.focus();
    return;
  }

  if (action === "select-level") {
    state.lastLevelId = target.dataset.id;
    render();
    return;
  }

  if (action === "edit-level") {
    const level = levelById(target.dataset.id);
    state.levelDraftId = target.dataset.id;
    state.levelDraftName = level?.name || "";
    render();
    const input = root.querySelector("[data-role=level-name]");
    if (input) input.focus();
    return;
  }

  if (action === "level-color") {
    const level = levelById(target.dataset.id);
    const nameInput = root.querySelector("[data-role=level-name]");
    if (nameInput) state.levelDraftName = nameInput.value;
    if (level) level.color = target.dataset.color;
    render();
    return;
  }

  if (action === "save-level") {
    const level = levelById(target.dataset.id);
    const input = root.querySelector("[data-role=level-name]");
    if (level && input) level.name = input.value.trim() || level.name;
    state.levelDraftId = null;
    render();
    return;
  }

  if (action === "delete-level") {
    state.levels = state.levels.filter((level) => level.id !== target.dataset.id);
    state.entries = state.entries.filter((entry) => entry.levelId !== target.dataset.id);
    state.lastLevelId = state.levels[0]?.id || "";
    state.levelDraftId = null;
    render();
    return;
  }

  if (action === "delete-entry") {
    state.entries = state.entries.filter((entry) => entry.id !== target.dataset.id);
    closeEditor();
    render();
    return;
  }

  if (action === "toggle-daily") {
    const input = target.querySelector("input");
    state.showDaily = input ? input.checked : state.showDaily === false;
    render();
    return;
  }

  if (action === "export") {
    if (!hasPlus()) {
      openPlusPanel();
      return;
    }
    exportFile();
    return;
  }

  if (action === "import") {
    if (!hasPlus()) {
      openPlusPanel();
      return;
    }
    root.querySelector("[data-role=import-file]").click();
    return;
  }

  if (action === "toggle-plus" || action === "open-plus") {
    openPlusPanel();
    return;
  }

  if (action === "unlock-plus") {
    const code = root.querySelector("[data-role=plus-code]")?.value || "";
    if (!isPlusCode(code)) {
      const status = root.querySelector("[data-role=plus-status]");
      if (status) status.textContent = "Код не подошёл";
      return;
    }
    try {
      localStorage.setItem(PLUS_KEY, "1");
    } catch {
      /* ignore */
    }
    state.plus = true;
    applyTheme(displayedTheme());
    render();
    window.PulseCloud?.restartAutoSync?.();
    window.PulseCloud?.syncNow?.();
    return;
  }

  if (action === "cloud-save") {
    const email = root.querySelector("[data-role=cloud-email]")?.value || "";
    const password = root.querySelector("[data-role=cloud-password]")?.value || "";
    const enabled = Boolean(root.querySelector("[data-role=cloud-enabled]")?.checked);
    const autoEvery30 = Boolean(root.querySelector("[data-role=cloud-auto-30]")?.checked);
    window.PulseCloud?.saveFromForm?.({ email, password, enabled, autoEvery30 }).then(() => {
      state.view = "settings";
      render();
    });
    return;
  }

  if (action === "cloud-sync-now") {
    window.PulseCloud?.syncNow?.();
    return;
  }

  if (action === "set-theme") {
    const next = target.dataset.theme;
    if (!isThemeId(next)) return;
    if (!themeIsFree(next) && !hasPlus()) {
      openPlusPanel();
      return;
    }
    if (state.theme === next) return;
    state.theme = next;
    state.updatedAt = Date.now();
    applyTheme(displayedTheme());
    render();
    return;
  }

  if (action === "reset-daily") {
    if (!state.dailies) state.dailies = {};
    delete state.dailies[target.dataset.date];
    render();
    return;
  }

  if (action === "export-habit-a4") {
    const habit = selectedHabit();
    if (!habit) return;
    const year = new Date().getFullYear();
    const mode = target.dataset.mode === "filled" ? "filled" : "blank";
    const doc = buildHabitA4Document(habit, year, mode);
    const url = URL.createObjectURL(new Blob([doc], { type: "text/html;charset=utf-8" }));
    showA4PreviewModal(url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }

  if (action === "select-habit") {
    state.selectedHabitId = target.dataset.id;
    state.view = "habit";
    state.sidebarOpen = false;
    render();
    return;
  }

  if (action === "toggle-habit-open") {
    state.selectedHabitId = state.selectedHabitId === target.dataset.id ? "" : target.dataset.id;
    state.view = "habit";
    render();
    return;
  }

  if (action === "delete-habit") {
    event.stopPropagation();
    state.habits = state.habits.filter((habit) => habit.id !== target.dataset.id);
    if (state.selectedHabitId === target.dataset.id) {
      state.selectedHabitId = "";
    }
    render();
    return;
  }
});

root.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.role !== "editor") return;
  const data = new FormData(form);
  const title = String(data.get("title") || "").trim();
  const checklist = normalizeChecklist(state.editorChecklist);
  const notes = checklistToNotes(checklist);
  if (!title && !checklist.length) return;
  let date = String(data.get("date") || state.cursor);
  let horizon = String(data.get("horizon") || "day");
  let spanYears = 10;
  if (horizon.startsWith("span-")) {
    spanYears = Number(horizon.slice(5));
    horizon = "span";
  }
  if (horizon === "week") date = toISODate(startOfWeek(parseISODate(date)));
  const entry = {
    id: form.dataset.id || uid(),
    levelId: String(data.get("levelId") || state.lastLevelId),
    title: title || checklist[0]?.text || "Без названия",
    notes,
    checklist,
    horizon,
    date,
    startTime: String(data.get("startTime") || ""),
    done: data.get("done") === "on",
    wholeYear: data.get("wholeYear") === "on",
    spanYears,
    createdAt: new Date().toISOString(),
  };
  const index = state.entries.findIndex((item) => item.id === entry.id);
  if (index >= 0) state.entries[index] = { ...state.entries[index], ...entry };
  else state.entries.push(entry);
  state.lastLevelId = entry.levelId;
  closeEditor();
  render();
});

root.addEventListener("keydown", (event) => {
  if (event.target.dataset.role === "new-level" && isCommitKey(event)) {
    event.preventDefault();
    if (!addLevel(event.target.value)) return;
    event.target.value = "";
    render();
    const next = root.querySelector("[data-role=new-level]");
    if (next) next.focus();
    return;
  }

  if (event.target.dataset.role === "plus-code" && isCommitKey(event)) {
    event.preventDefault();
    root.querySelector("[data-action=unlock-plus]")?.click();
    return;
  }

  if (event.target.dataset.role === "new-habit" && isCommitKey(event)) {
    event.preventDefault();
    const name = event.target.value.trim();
    if (!name) return;
    const habit = {
      id: uid(),
      name,
      schedule: normalizeSchedule(state.habitScheduleDraft),
      bucket: normalizeBucket(state.habitBucketDraft),
      remindAt: "",
      cells: {},
    };
    state.habits.push(habit);
    state.selectedHabitId = habit.id;
    state.view = "habit";
    event.target.value = "";
    render();
    scheduleRemindSync();
    return;
  }

  if (event.target.dataset.role === "new-editor-check" && isCommitKey(event)) {
    event.preventDefault();
    const text = event.target.value.trim();
    if (!text) return;
    snapshotEditorForm();
    if (!Array.isArray(state.editorChecklist)) state.editorChecklist = [];
    state.editorChecklist.push({ id: uid(), text, done: false });
    event.target.value = "";
    render();
    const next = root.querySelector("[data-role=new-editor-check]");
    if (next) next.focus();
    return;
  }

  if (event.target.dataset.role === "new-goal-item" && isCommitKey(event)) {
    event.preventDefault();
    const text = event.target.value.trim();
    if (!text) return;
    const goal = selectedGoal();
    if (!goal) return;
    goal.items.push({ id: uid(), text, done: false });
    event.target.value = "";
    render();
    const next = root.querySelector("[data-role=new-goal-item]");
    if (next) next.focus();
    return;
  }

  if (event.target.dataset.role === "new-goal-list" && isCommitKey(event)) {
    event.preventDefault();
    const name = event.target.value.trim();
    if (!name) return;
    const years = Math.min(120, Math.max(1, Number(state.goalYearsDraft) || 5));
    const goal = {
      id: uid(),
      name,
      years,
      startYear: parseISODate(state.cursor).getFullYear(),
      items: [],
    };
    if (!Array.isArray(state.goals)) state.goals = [];
    state.goals.push(goal);
    state.selectedGoalId = goal.id;
    state.view = "goals";
    event.target.value = "";
    render();
    const next = root.querySelector("[data-role=new-goal-item]");
    if (next) next.focus();
    return;
  }

  if (event.target.dataset.role === "new-list-item" && isCommitKey(event)) {
    event.preventDefault();
    const text = event.target.value.trim();
    if (!text) return;
    const list =
      (state.lists || []).find((item) => item.id === event.target.dataset.listId) || selectedList();
    if (!list) return;
    list.items.push({ id: uid(), text, done: false });
    event.target.value = "";
    render();
    const next = root.querySelector(`[data-role=new-list-item][data-list-id="${list.id}"]`);
    if (next) next.focus();
    return;
  }

  if (event.target.dataset.role === "new-list" && isCommitKey(event)) {
    event.preventDefault();
    const name = event.target.value.trim();
    if (!name) return;
    const list = {
      id: uid(),
      name,
      items: [],
    };
    if (!Array.isArray(state.lists)) state.lists = [];
    state.lists.push(list);
    state.selectedListId = list.id;
    state.expandedListId = list.id;
    state.view = "lists";
    event.target.value = "";
    render();
    const next = root.querySelector(`[data-role=new-list-item][data-list-id="${list.id}"]`);
    if (next) next.focus();
    return;
  }

});

root.addEventListener("input", (event) => {
  if (event.target.dataset.role === "daily-text") {
    if (!state.dailies) state.dailies = {};
    state.dailies[event.target.dataset.date] = event.target.value;
    persist(state);
    return;
  }
  if (event.target.dataset.role === "goal-years-draft") {
    state.goalYearsDraft = Math.min(120, Math.max(1, Number(event.target.value) || 1));
    persist(state);
    return;
  }
  if (event.target.dataset.role === "goal-years") {
    const goal = state.goals.find((g) => g.id === event.target.dataset.id);
    if (goal) {
      goal.years = Math.min(120, Math.max(1, Number(event.target.value) || 1));
      persist(state);
      const meta = root.querySelector(".goals-meta");
      if (meta) {
        const start = Number(goal.startYear) || parseISODate(state.cursor).getFullYear();
        const doneCount = goal.items.filter((item) => item.done).length;
        meta.textContent = `${doneCount}/${goal.items.length} · ${start}–${start + goal.years - 1}`;
      }
    }
    return;
  }
  if (event.target.dataset.role === "list-search") {
    state.listSearch = event.target.value;
    const caret = event.target.selectionStart;
    render();
    const next = root.querySelector("[data-role=list-search]");
    if (next) {
      next.focus();
      try {
        const pos = typeof caret === "number" ? caret : next.value.length;
        next.setSelectionRange(pos, pos);
      } catch {
        /* ignore */
      }
    }
    return;
  }
  if (event.target.dataset.role === "entry-search") {
    state.entrySearch = event.target.value;
    const caret = event.target.selectionStart;
    render();
    const next = root.querySelector("[data-role=entry-search]");
    if (next) {
      next.focus();
      try {
        const pos = typeof caret === "number" ? caret : next.value.length;
        next.setSelectionRange(pos, pos);
      } catch {
        /* ignore */
      }
    }
    return;
  }
  if (event.target.dataset.role === "timer-work" || event.target.dataset.role === "timer-break") {
    const timer = ensureTimer();
    const value = Math.min(
      event.target.dataset.role === "timer-work" ? 180 : 60,
      Math.max(1, Number(event.target.value) || 1),
    );
    if (event.target.dataset.role === "timer-work") timer.workMinutes = value;
    else timer.breakMinutes = value;
    event.target.value = String(value);
    if (timer.phase === "idle") paintTimerDisplay();
    persist(state);
    return;
  }
  if (event.target.dataset.role !== "habit-cell") return;
  const habit = state.habits.find((item) => item.id === event.target.dataset.id);
  if (!habit) return;
  if (!habit.cells) habit.cells = {};
  const value = normalizeHabitCellValue(event.target.value);
  const date = event.target.dataset.date;
  if (value) habit.cells[date] = value;
  else delete habit.cells[date];
  if (event.target.value !== value) event.target.value = value;
  event.target.parentElement.classList.toggle("filled", Boolean(value));
  event.target.parentElement.classList.toggle("checked", value === "✓");
  const year = parseISODate(state.cursor).getFullYear();
  const count = root.querySelector(".list-card.open .list-card-meta");
  if (count) count.textContent = `${filledHabitCount(habit, year)}/${daysInYear(year)} ▾`;
  const hint = root.querySelector(".list-card.open .habit-board-head .hint");
  if (hint) hint.textContent = `${filledHabitCount(habit, year)} из ${daysInYear(year)} · в ячейку — число 1–100 или ✓`;
  persist(state);
});

root.addEventListener("change", (event) => {
  if (event.target.dataset.role === "habit-remind") {
    const habit = state.habits.find((item) => item.id === event.target.dataset.id);
    if (!habit) return;
    const raw = String(event.target.value || "").trim();
    habit.remindAt = raw ? normalizeRemindAt(raw, habitBucket(habit) || "day") : "";
    event.target.value = habit.remindAt;
    persist(state);
    scheduleRemindSync();
    return;
  }
  if (event.target.dataset.role === "import-file" && event.target.files[0]) {
    importFile(event.target.files[0]);
    event.target.value = "";
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && (state.composing || state.editingId || state.levelDraftId)) {
    closeEditor();
    state.levelDraftId = null;
    render();
    return;
  }
  if (event.key === "Escape" && state.sidebarOpen) {
    state.sidebarOpen = false;
    render();
  }
});

function handlePulseBack() {
  const overlay = document.getElementById("a4-preview-overlay");
  if (overlay?.dataset.open === "true") {
    overlay.dataset.open = "false";
    return true;
  }
  if (state.composing || state.editingId || state.levelDraftId) {
    closeEditor();
    state.levelDraftId = null;
    render();
    return true;
  }
  if (state.sidebarOpen) {
    state.sidebarOpen = false;
    render();
    return true;
  }
  return false;
}

window.__pulseHandleBack = handlePulseBack;

const REMIND_CHANNEL_ID = "pulse-habits-v2";

function notificationIdForTask(taskId) {
  let hash = 0;
  const text = String(taskId || "");
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return (Math.abs(hash) % 1800000000) + 1000;
}

function getLocalNotifications() {
  if (!isCapacitorNative()) return null;
  const cap = window.Capacitor;
  try {
    if (typeof cap.registerPlugin === "function") {
      return cap.registerPlugin("LocalNotifications");
    }
    return cap.Plugins?.LocalNotifications || null;
  } catch {
    return null;
  }
}

let remindSyncTimer = null;
let lastWebRemindKey = "";
let remindStatusBusy = false;

function habitsWithReminders() {
  return (state.habits || [])
    .map((habit) => {
      const remindAt = habitRemindAt(habit);
      if (!remindAt) return null;
      return { habit, remindAt, bucket: habitBucket(habit) };
    })
    .filter(Boolean);
}

function nextRemindDate(remindAt) {
  const [hour, minute] = String(remindAt || "")
    .split(":")
    .map((part) => Number(part));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const at = new Date();
  at.setSeconds(0, 0);
  at.setHours(hour, minute, 0, 0);
  if (at.getTime() <= Date.now() + 1500) {
    at.setDate(at.getDate() + 1);
  }
  return at;
}

function setRemindStatus(text) {
  state.remindStatus = text;
  if (state.view === "settings" && !remindStatusBusy) {
    const node = root?.querySelector?.('[data-role="settings-reminders"] .hint');
    if (node) node.textContent = text;
  }
}

async function ensureReminderPermissions(LocalNotifications, { promptExact = true } = {}) {
  let perm = await LocalNotifications.checkPermissions();
  if (perm.display !== "granted") {
    perm = await LocalNotifications.requestPermissions();
  }
  if (perm.display !== "granted") {
    return { ok: false, reason: "notifications" };
  }

  let exact = { exact_alarm: "granted" };
  try {
    if (typeof LocalNotifications.checkExactNotificationSetting === "function") {
      exact = await LocalNotifications.checkExactNotificationSetting();
    }
  } catch {
    exact = { exact_alarm: "granted" };
  }

  if (exact.exact_alarm !== "granted" && promptExact) {
    try {
      if (typeof LocalNotifications.changeExactNotificationSetting === "function") {
        exact = await LocalNotifications.changeExactNotificationSetting();
      }
    } catch {
      /* user may cancel the system screen */
    }
  }

  return {
    ok: true,
    exact: exact.exact_alarm === "granted",
  };
}

async function ensureReminderChannel(LocalNotifications) {
  try {
    await LocalNotifications.createChannel({
      id: REMIND_CHANNEL_ID,
      name: "Привычки Pulse",
      description: "Ежедневные напоминания о привычках",
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: "#0a4a5c",
    });
  } catch {
    /* channel may already exist */
  }
}

function buildHabitNotification({ habit, remindAt, bucket }, idOffset = 0) {
  const [hour, minute] = remindAt.split(":").map(Number);
  const bucketLabel = habitBucketLabel(bucket);
  const body = bucketLabel ? `${habit.name} · ${bucketLabel}` : habit.name;
  const at = nextRemindDate(remindAt);
  const base = {
    id: notificationIdForTask(habit.id) + idOffset,
    title: "Pulse",
    body,
    largeBody: body,
    channelId: REMIND_CHANNEL_ID,
    smallIcon: "ic_stat_pulse",
    iconColor: "#0a4a5c",
    extra: { habitId: habit.id, remindAt },
  };

  // Daily cron-like schedule (survives reboot via Capacitor restore).
  const daily = {
    ...base,
    schedule: {
      on: { hour, minute, second: 0 },
      allowWhileIdle: true,
    },
  };

  // Concrete next fire — more reliable on OEM launchers that delay inexact alarms.
  if (!at) return [daily];
  return [
    daily,
    {
      ...base,
      id: notificationIdForTask(`${habit.id}:next`),
      schedule: {
        at: at.toISOString(),
        allowWhileIdle: true,
      },
    },
  ];
}

async function syncRoutineReminders({ prompt = false, test = false } = {}) {
  const LocalNotifications = getLocalNotifications();
  if (!LocalNotifications) {
    setRemindStatus("Уведомления работают только в приложении на телефоне.");
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        /* ignore */
      }
    }
    return { ok: false, reason: "no-plugin" };
  }

  try {
    const access = await ensureReminderPermissions(LocalNotifications, { promptExact: prompt });
    if (!access.ok) {
      setRemindStatus("Разреши уведомления для Pulse в настройках телефона.");
      return { ok: false, reason: access.reason };
    }

    await ensureReminderChannel(LocalNotifications);

    const pending = await LocalNotifications.getPending();
    if (pending?.notifications?.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications });
    }

    if (test) {
      const when = new Date(Date.now() + 3000);
      await LocalNotifications.schedule({
        notifications: [
          {
            id: 42,
            title: "Pulse",
            body: "Тест уведомления — если видишь это, напоминания работают",
            largeBody: "Тест уведомления — если видишь это, напоминания работают",
            channelId: REMIND_CHANNEL_ID,
            smallIcon: "ic_stat_pulse",
            iconColor: "#0a4a5c",
            schedule: { at: when.toISOString(), allowWhileIdle: true },
          },
        ],
      });
      setRemindStatus(
        access.exact
          ? "Тест через ~3 сек. Точные будильники: да."
          : "Тест через ~3 сек. Точные будильники выкл. — могут опаздывать.",
      );
      return { ok: true, test: true, exact: access.exact };
    }

    const reminders = habitsWithReminders();
    const notifications = reminders.flatMap((item) => buildHabitNotification(item));
    if (notifications.length) {
      await LocalNotifications.schedule({ notifications });
    }

    const exactNote = access.exact ? "точные будильники включены" : "точные будильники выкл. — могут опаздывать";
    setRemindStatus(
      reminders.length
        ? `Напоминания запланированы: ${reminders.length}. ${exactNote}.`
        : `Нет времён у привычек. Добавь ⌚ время — тогда придёт пуш. ${exactNote}.`,
    );
    return { ok: true, count: reminders.length, exact: access.exact };
  } catch (err) {
    console.warn("reminders", err);
    setRemindStatus(`Не удалось поставить напоминания: ${err?.message || err}`);
    return { ok: false, reason: "error", error: err };
  }
}

function scheduleRemindSync(options = {}) {
  clearTimeout(remindSyncTimer);
  remindSyncTimer = setTimeout(() => {
    syncRoutineReminders(options);
  }, 250);
}

function setupWebReminderTicker() {
  setInterval(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (window.Capacitor?.isNativePlatform?.()) return;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const dayKey = toISODate(now);
    habitsWithReminders().forEach(({ habit, remindAt, bucket }) => {
      if (remindAt !== hhmm) return;
      const key = `${dayKey}:${habit.id}:${hhmm}`;
      if (key === lastWebRemindKey || sessionStorage.getItem(`pulse-remind-${key}`)) return;
      lastWebRemindKey = key;
      sessionStorage.setItem(`pulse-remind-${key}`, "1");
      const bucketLabel = habitBucketLabel(bucket);
      try {
        new Notification("Pulse", { body: bucketLabel ? `${habit.name} · ${bucketLabel}` : habit.name });
      } catch {
        /* ignore */
      }
    });
  }, 30000);
}

function setupFocusTimerTicker() {
  setInterval(() => {
    const timer = ensureTimer();
    if (timer.phase === "idle") return;
    paintTimerDisplay();
  }, 250);
}

function setupNativeBack() {
  if (!isCapacitorNative()) return;
  const cap = window.Capacitor;
  try {
    const App = cap.registerPlugin("App");
    App.addListener("backButton", () => {
      handlePulseBack();
    });
    App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        scheduleTodayWidget();
        scheduleRemindSync();
        const timer = ensureTimer();
        if (timer.phase !== "idle" && timer.endsAt) {
          if (timerRemainingMs(timer) <= 0) {
            advanceTimerPhase();
            render();
          } else {
            scheduleTimerAlarm();
          }
        }
      }
    });
  } catch (err) {
    console.warn("backButton listener", err);
  }
}

function setupTimerAlarmListener() {
  const LocalNotifications = getLocalNotifications();
  if (!LocalNotifications?.addListener) return;
  try {
    LocalNotifications.addListener("localNotificationReceived", (notification) => {
      const extra = notification?.extra || {};
      const id = Number(notification?.id);
      if (extra.kind !== "timer" && id !== TIMER_ALARM_ID) return;
      // System notification already played the channel sound; only chime if app is open
      // and phase hasn't advanced yet from the ticker.
      const timer = ensureTimer();
      if (timer.phase === "idle") return;
      if (timer.endsAt && timerRemainingMs(timer) <= 1500) {
        advanceTimerPhase();
        render();
      } else if (extra.chime) {
        playTimerChime(extra.chime);
      }
    });
    LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
      const notification = event?.notification || {};
      const extra = notification?.extra || {};
      const id = Number(notification?.id);
      if (extra.kind !== "timer" && id !== TIMER_ALARM_ID) return;
      const timer = ensureTimer();
      if (timer.phase !== "idle" && timer.endsAt && timerRemainingMs(timer) <= 1500) {
        advanceTimerPhase();
        render();
      }
    });
  } catch (err) {
    console.warn("timer listener", err);
  }
}

setupNativeBack();
setupTimerAlarmListener();
setupWebReminderTicker();
setupFocusTimerTicker();
scheduleRemindSync();
scheduleTodayWidget();
scheduleTimerAlarm();

function openPlusPanel() {
  const alreadySettings = state.view === "settings";
  const savedScroll = alreadySettings ? captureScroll() : null;
  state.view = "settings";
  state.sidebarOpen = false;
  render();
  if (alreadySettings && savedScroll) {
    restoreScroll(savedScroll);
    requestAnimationFrame(() => restoreScroll(savedScroll));
    root.querySelector("#settings-plus .settings-section-title")?.classList.add("plus-nudge");
    return;
  }
  root.querySelector("#settings-plus")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

window.PulseCloud?.init?.({
  allowSync: () => hasPlus(),
  getSnapshot: () => snapshotPlanner(state),
  getUpdatedAt: () => Number(state.updatedAt) || 0,
  applySnapshot: (parsed) => {
    cloudApplying = true;
    try {
      if (!applyPlannerSnapshot(parsed, { bumpTime: false })) return;
      lastDataFingerprint = plannerFingerprint(state);
      closeEditor();
      render();
      scheduleRemindSync();
    } finally {
      cloudApplying = false;
    }
  },
});

window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    const parsed = JSON.parse(event.newValue);
    const remoteAt = Number(parsed.updatedAt) || 0;
    const localAt = Number(state.updatedAt) || 0;
    if (remoteAt < localAt) return;
    const nextTheme = isThemeId(parsed.theme) ? parsed.theme : state.theme;
    if (nextTheme === state.theme && remoteAt === localAt) return;
    state.theme = nextTheme;
    state.updatedAt = remoteAt || localAt;
    applyTheme(displayedTheme());
    if (state.view === "settings") render();
  } catch {
    /* ignore broken peer writes */
  }
});

restorePhoneCopy().finally(() => {
  phoneCopyReady = true;
  render();
  scheduleTodayWidget();
  scheduleRemindSync();
});

if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}
