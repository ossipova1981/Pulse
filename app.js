const STORAGE_KEY = "planer-local-v1";
const PALETTE = ["#3d4a5c", "#c45c26", "#4a7c59", "#3d6b8a", "#8b3d55", "#b0892c", "#5c4f3a", "#6b4c7a"];

const DEFAULT_LEVELS = [
  { id: "level-work", name: "Работа", color: "#3d4a5c", visible: true, order: 0 },
  { id: "level-home", name: "Дом", color: "#c45c26", visible: true, order: 1 },
  { id: "level-family", name: "Семья", color: "#4a7c59", visible: true, order: 2 },
  { id: "level-vacation", name: "Отпуска", color: "#3d6b8a", visible: true, order: 3 },
];

const LIFE_SPANS = [5, 10, 15, 20, 30, 40, 50, 70, 100];
const GOAL_YEAR_PRESETS = [1, 3, 5, 10, 15, 20, 30, 50, 70, 100];
const VIEWS = ["day", "week", "year", "span", "habit", "goals"];
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
    composing: null,
    editingId: null,
    levelDraftId: null,
    levelDraftName: "",
    routineTasks: [],
    theme: "turquoise",
    goals: [],
    selectedGoalId: "",
    goalYearsDraft: 5,
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
      cells,
    };
  });
}

function ensureWorkLevel(levels) {
  const hasWork = levels.some((level) => level.id === "level-work" || /^работа$/i.test(level.name));
  if (hasWork) return levels;
  return [
    { id: "level-work", name: "Работа", color: "#3d4a5c", visible: true, order: 0 },
    ...levels,
  ];
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
      habits: normalizeHabits(parsed.habits),
      selectedHabitId: parsed.selectedHabitId ?? "",
      dailies: parsed.dailies && typeof parsed.dailies === "object" ? parsed.dailies : {},
      routineTasks: normalizeRoutineTasks(parsed.routineTasks),
      theme: isThemeId(parsed.theme) ? parsed.theme : fallback.theme,
      goals: normalizeGoals(parsed.goals),
      selectedGoalId: parsed.selectedGoalId ?? "",
      goalYearsDraft: Math.min(120, Math.max(1, Number(parsed.goalYearsDraft) || 5)),
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
    routineTasks: current.routineTasks,
    theme: current.theme,
    goals: current.goals,
    selectedGoalId: current.selectedGoalId,
    goalYearsDraft: current.goalYearsDraft,
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
  state.habits = normalizeHabits(parsed.habits);
  state.selectedHabitId = parsed.selectedHabitId || "";
  state.dailies = parsed.dailies && typeof parsed.dailies === "object" ? parsed.dailies : {};
  state.routineTasks = normalizeRoutineTasks(parsed.routineTasks);
  state.goals = normalizeGoals(parsed.goals);
  state.selectedGoalId = parsed.selectedGoalId || "";
  state.goalYearsDraft = Math.min(120, Math.max(1, Number(parsed.goalYearsDraft) || state.goalYearsDraft || 5));
  state.theme = isThemeId(parsed.theme) ? parsed.theme : state.theme;
  state.updatedAt = bumpTime ? Date.now() : Number(parsed.updatedAt) || Date.now();
  applyTheme(state.theme);
  return true;
}

function persist(state) {
  try {
    const fingerprint = plannerFingerprint(state);
    if (!cloudApplying && lastDataFingerprint && fingerprint !== lastDataFingerprint) {
      state.updatedAt = Date.now();
      window.PulseCloud?.schedulePush?.();
    }
    lastDataFingerprint = fingerprint;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotPlanner(state)));
  } catch (err) {
    console.warn("Не удалось сохранить данные", err);
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

function defaultRemindAt(bucket) {
  if (bucket === "morning") return "09:00";
  if (bucket === "day") return "13:00";
  if (bucket === "evening") return "19:00";
  return "09:00";
}

function normalizeRemindAt(value, bucket) {
  const raw = String(value || "").trim();
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [h, m] = raw.split(":").map(Number);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  return defaultRemindAt(bucket);
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
  },
  turquoise: {
    "--paper": "#0a4866",
    "--paper-2": "#0e5678",
    "--ink": "#f0fffb",
    "--muted": "#c5e8ef",
    "--line": "#2a7690",
    "--today": "#3a96b4",
    "--weekend": "#1a5a78",
    "--danger": "#b85a5a",
    "--focus": "#5bb4d0",
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
  },
};

const THEME_IDS = ["classic", "dark", "swamp", "turquoise", "orange", "candy", "citrus"];

function isThemeId(value) {
  return THEME_IDS.includes(value);
}

function applyTheme(themeName) {
  const theme = THEMES[themeName] || THEMES.turquoise;
  for (const [k, v] of Object.entries(theme)) document.documentElement.style.setProperty(k, v);
  document.documentElement.dataset.theme = THEMES[themeName] ? themeName : "turquoise";
}

const state = loadState();
const root = document.getElementById("app");
let cloudApplying = false;
let lastDataFingerprint = plannerFingerprint(state);
applyTheme(state.theme);

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

const ROUTINE_BUCKETS = [
  ["morning", "Утро", "09:00"],
  ["day", "День", "13:00"],
  ["evening", "Вечер", "19:00"],
];

function routineBucketMeta(bucket) {
  return ROUTINE_BUCKETS.find((item) => item[0] === bucket) || [bucket, "Задача", ""];
}

function habitMarkDisplay(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (v === "1" || /^[xX✓✔]$/.test(v)) return "✓";
  return v.slice(0, 2);
}

function routineChip(task, iso, showTime) {
  const habit = state.habits.find((h) => h.id === task.habitId);
  if (!habit) return "";
  const done = Boolean(String(habit.cells?.[iso] || "").trim());
  const level = levelById(task.levelId);
  const color = level?.color || "#7a7166";
  const [, bucketLabel, time] = routineBucketMeta(task.bucket);
  const remindAt = normalizeRemindAt(task.remindAt, task.bucket);
  const meta = [showTime && (remindAt || time), bucketLabel, level?.name].filter(Boolean).join(" · ");
  return `
    <div class="chip routine-chip${done ? " done" : ""}">
      <span class="chip-bar" style="background:${color}"></span>
      <span class="chip-body">
        <div class="chip-title">${escapeHtml(habit.name)}</div>
        <div class="chip-meta-row">
          <div class="chip-meta">${escapeHtml(meta)}</div>
          <label class="chip-toggle${done ? " active" : ""}" data-action="toggle-routine-task" data-task-id="${task.id}" data-date="${iso}">
            <input type="checkbox" ${done ? "checked" : ""} />
            <span>сделано</span>
          </label>
        </div>
      </span>
    </div>
  `;
}

function routineChipsForDay(iso, bucket) {
  return state.routineTasks
    .filter((task) => (bucket ? task.bucket === bucket : true))
    .map((task) => routineChip(task, iso, true))
    .join("");
}

function renderDayRoutinesPanel(iso, options = {}) {
  const tasks = state.routineTasks.filter((task) => state.habits.some((h) => h.id === task.habitId));
  if (!tasks.length) return "";
  const open = Boolean(state.dayRoutinesOpenByDate?.[iso]);
  const done = tasks.filter((task) => {
    const habit = state.habits.find((h) => h.id === task.habitId);
    return Boolean(String(habit?.cells?.[iso] || "").trim());
  }).length;
  const compact = options.compact ? " compact" : "";
  return `
    <section class="day-routines${open ? " open" : ""}${compact}">
      <button
        type="button"
        class="day-routines-toggle"
        data-action="toggle-day-routines"
        data-date="${iso}"
        aria-expanded="${open ? "true" : "false"}"
      >
        <span>Ежедневные задачи</span>
        <span class="day-routines-meta">${done}/${tasks.length}${open ? " ▾" : " ▸"}</span>
      </button>
      <div class="day-routines-body" data-open="${open ? "true" : "false"}">
        ${tasks.map((task) => routineChip(task, iso, !options.compact)).join("")}
      </div>
    </section>
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

function renderCloudSettings() {
  const meta = window.PulseCloud?.loadMeta?.() || { enabled: false, email: "", lastError: "" };
  const nativeOk = window.PulseCloud?.isNativeApp?.();
  const status = window.PulseCloud?.formatStatus?.(meta) || "";
  return `
        <div class="theme-settings" data-role="cloud-settings" data-open="false">
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
          <p class="cloud-status" data-role="cloud-status">${escapeHtml(status)}</p>
          <div class="file-row" style="margin-top:8px">
            <button type="button" class="ghost" data-action="cloud-save">Сохранить</button>
            <button type="button" class="ghost" data-action="cloud-sync-now">Синхронизировать</button>
          </div>
        </div>
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
                  `<button type="button" class="${color === level.color ? "selected" : ""}" style="background:${color}" data-action="level-color" data-id="${level.id}" data-color="${color}"></button>`,
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
      ${renderRoutineTasksNav()}
      <div class="levels-block">
        <div class="section-head">
          <div class="section-label">На доске</div>
          <button type="button" class="ghost" data-action="show-all">Все</button>
        </div>
        <div class="level-list">${rows}</div>
        <input class="add-level" data-role="new-level" placeholder="Новый уровень…" />
      </div>
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
      <div class="local-note">
        Записи живут на устройстве. Облако Mail.ru можно включить ниже.
        <button type="button" class="ghost" style="margin-top:8px; width: 100%; text-align: left" data-action="toggle-cloud-settings">
          Облако Mail.ru
        </button>
        ${renderCloudSettings()}
        <button type="button" class="ghost" style="margin-top:8px; width: 100%; text-align: left" data-action="toggle-theme-settings">
          Настройки цвета
        </button>
        <div class="theme-settings" data-role="theme-settings" data-open="false">
          <div class="theme-settings-row">
            <button
              type="button"
              class="${state.theme === "classic" ? "solid" : "ghost"}"
              data-action="set-theme"
              data-theme="classic"
            >
              Классика
            </button>
            <button
              type="button"
              class="${state.theme === "dark" ? "solid" : "ghost"}"
              data-action="set-theme"
              data-theme="dark"
            >
              Тёмная
            </button>
            <button
              type="button"
              class="${state.theme === "swamp" ? "solid" : "ghost"}"
              data-action="set-theme"
              data-theme="swamp"
            >
              Болотный
            </button>
            <button
              type="button"
              class="${state.theme === "turquoise" ? "solid" : "ghost"}"
              data-action="set-theme"
              data-theme="turquoise"
            >
              Бирюзовый
            </button>
            <button
              type="button"
              class="${state.theme === "orange" ? "solid" : "ghost"}"
              data-action="set-theme"
              data-theme="orange"
            >
              Кожаный
            </button>
            <button
              type="button"
              class="${state.theme === "citrus" ? "solid" : "ghost"}"
              data-action="set-theme"
              data-theme="citrus"
            >
              Сочный
            </button>
            <button
              type="button"
              class="${state.theme === "candy" ? "solid" : "ghost"}"
              data-action="set-theme"
              data-theme="candy"
            >
              Жвачка
            </button>
          </div>
        </div>
        <div class="file-row" style="margin-top:8px">
          <button type="button" class="ghost" data-action="export">Экспорт</button>
          <button type="button" class="ghost" data-action="import">Импорт</button>
          <input type="file" accept="application/json,.json" data-role="import-file" hidden />
        </div>
      </div>
    </aside>
  `;
}

function addRoutineTask(name, bucket) {
  const text = String(name || "").trim();
  if (!text) return false;
  if (bucket !== "morning" && bucket !== "day" && bucket !== "evening") return false;

  const existingHabit = state.habits.find((h) => h.name.toLowerCase() === text.toLowerCase());
  const habit =
    existingHabit ||
    ({
      id: uid(),
      name: text,
      cells: {},
    });
  if (!existingHabit) state.habits.push(habit);

  const workLevel =
    state.levels.find((level) => level.id === "level-work" || /^работа$/i.test(level.name)) || state.levels[0];

  state.routineTasks.push({
    id: uid(),
    bucket,
    habitId: habit.id,
    levelId: workLevel?.id || state.lastLevelId || "",
    remindAt: defaultRemindAt(bucket),
  });
  state.selectedHabitId = habit.id;
  state.routinesOpen = true;
  return true;
}

function renderRoutineTasksNav() {
  const morning = state.routineTasks.filter((t) => t.bucket === "morning");
  const day = state.routineTasks.filter((t) => t.bucket === "day");
  const evening = state.routineTasks.filter((t) => t.bucket === "evening");
  const open = Boolean(state.routinesOpen);
  const total = morning.length + day.length + evening.length;

  function row(task) {
    const habit = state.habits.find((h) => h.id === task.habitId);
    const name = habit?.name || "Задача";
    const remindAt = normalizeRemindAt(task.remindAt, task.bucket);
    return `
      <div class="routine-row">
        <span class="routine-name">${escapeHtml(name)}</span>
        <input
          class="routine-time"
          type="text"
          inputmode="numeric"
          placeholder="09:00"
          maxlength="5"
          data-role="routine-remind"
          data-id="${task.id}"
          value="${remindAt}"
          title="Время напоминания, например 09:00"
          aria-label="Время напоминания"
        />
        <button type="button" class="ghost" data-action="delete-routine-task" data-id="${task.id}">×</button>
      </div>
    `;
  }

  function addRow(bucket, placeholder) {
    return `<input class="add-level" data-role="new-routine" data-bucket="${bucket}" placeholder="${placeholder}" />`;
  }

  return `
    <div class="routine-block">
      <button
        type="button"
        class="routine-toggle${open ? " open" : ""}"
        data-action="toggle-routines"
        aria-expanded="${open ? "true" : "false"}"
      >
        <span>Ежедневные задачи</span>
        <span class="routine-toggle-meta">${total ? total : ""}${open ? " ▾" : " ▸"}</span>
      </button>
      <div class="routine-panel" data-open="${open ? "true" : "false"}">
        <p class="routine-hint">У каждой задачи своё время в формате 09:00.</p>
        <div class="routine-column">
          <div class="routine-head">Утро</div>
          <div class="routine-list">${morning.map(row).join("")}</div>
          ${addRow("morning", "Новая утренняя задача…")}
        </div>

        <div class="routine-column">
          <div class="routine-head">День</div>
          <div class="routine-list">${day.map(row).join("")}</div>
          ${addRow("day", "Новая дневная задача…")}
        </div>

        <div class="routine-column">
          <div class="routine-head">Вечер</div>
          <div class="routine-list">${evening.map(row).join("")}</div>
          ${addRow("evening", "Новая вечерняя задача…")}
        </div>
      </div>
    </div>
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

function renderHabitNav() {
  const year = parseISODate(state.cursor).getFullYear();
  const size = daysInYear(year);
  return `
    <div class="habits-block">
      <div class="section-label">Привычки</div>
      <div class="habit-list">
      ${state.habits
        .map((habit) => {
          const done = filledHabitCount(habit, year);
          return `
            <div class="habit-row${state.selectedHabitId === habit.id ? " active" : ""}">
              <button type="button" class="habit-name" data-action="select-habit" data-id="${habit.id}">${escapeHtml(habit.name)}</button>
              <span class="habit-count">${done}/${size}</span>
              <button type="button" class="ghost" data-action="delete-habit" data-id="${habit.id}">×</button>
            </div>
          `;
        })
        .join("")}
      </div>
      <input class="add-level" data-role="new-habit" placeholder="Новая привычка…" />
    </div>
  `;
}

function renderHabitBoard() {
  const habit = selectedHabit();
  if (!habit) {
    return `<p class="hint">Выберите привычку слева или добавьте новую. Таблица — дни года: в ячейку можно вписать число или букву.</p>`;
  }
  const year = parseISODate(state.cursor).getFullYear();
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
      const cls = [iso === today ? "today" : "", value ? "filled" : "", value === "✓" ? "checked" : ""].filter(Boolean).join(" ");
      return `<td class="${cls}"><input data-role="habit-cell" data-id="${habit.id}" data-date="${iso}" maxlength="2" value="${escapeHtml(value)}" title="${value === "✓" ? "Сделано" : ""}" /></td>`;
    }).join("");
    return `<tr><th>${escapeHtml(label)}</th>${cells}</tr>`;
  }).join("");
  return `
    <div class="habit-board">
      <div class="habit-board-head">
        <p class="hint">${done} из ${daysInYear(year)} · в ячейку — число или буква</p>
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
    </div>
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
        ${state.view === "habit" || state.view === "goals" ? "" : `<button type="button" class="solid" data-action="compose" data-horizon="${state.view === "span" ? "span" : state.view}" data-date="${state.cursor}" data-year="${state.view === "year" || state.view === "span" ? "1" : ""}" data-span="${state.spanYears || ""}">Запись</button>`}
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
          ${renderDayRoutinesPanel(iso, { compact: true })}
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

  return `
    <section class="week-banner" data-action="compose" data-horizon="week" data-date="${monday}">
      <div class="banner-title">План недели</div>
      ${weekItems.length ? `<div class="chip-row">${weekItems.map((entry) => chip(entry)).join("")}</div>` : `<div class="empty">Нажмите, чтобы задать намерение недели — дом, семья, отпуск</div>`}
    </section>
    <div class="week-tabs">${tabs}</div>
    <section class="week-tab-panel day-col${activeIso === today ? " today" : ""}${activeWeekend ? " weekend" : ""}">
      ${renderDayRoutinesPanel(activeIso)}
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

  return `
    <div class="day-page">
    <div class="day-layout">
      <section class="day-context">
        <div class="banner-title">Контекст · ${escapeHtml(formatWeekRange(date))}</div>
        ${context.length ? `<div class="chip-row">${context.map((entry) => chip(entry)).join("")}</div>` : `<div class="empty">Сначала можно наметить год или неделю</div>`}
      </section>
      ${renderDayRoutinesPanel(iso)}
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
    <aside class="daily-panel">
      <div class="daily-head">
        <div class="banner-title">Дейли</div>
        <button type="button" class="ghost" data-action="reset-daily" data-date="${iso}">Собрать заново</button>
      </div>
      <textarea data-role="daily-text" data-date="${iso}" spellcheck="true">${escapeHtml(dailyText)}</textarea>
      <p class="daily-hint">Только задачи уровня «Работа». Без ежедневных, дома, семьи и отпуска. «Собрать заново» обновит текст.</p>
    </aside>
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

function render() {
  const viewHtml =
    state.view === "habit"
      ? renderHabitBoard()
      : state.view === "goals"
        ? renderGoalsBoard()
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
  `;
  persist(state);
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

  if (action === "delete-routine-task") {
    event.stopPropagation();
    state.routineTasks = state.routineTasks.filter((t) => t.id !== target.dataset.id);
    render();
    scheduleRemindSync();
    return;
  }

  if (action === "toggle-routine-task") {
    event.preventDefault();
    event.stopPropagation();
    const task = state.routineTasks.find((t) => t.id === target.dataset.taskId);
    const date = target.dataset.date;
    if (!task || !date) return;
    const habit = state.habits.find((h) => h.id === task.habitId);
    if (!habit) return;
    if (!habit.cells) habit.cells = {};
    const existing = String(habit.cells[date] || "").trim();
    if (existing) delete habit.cells[date];
    else habit.cells[date] = "✓";
    state.selectedHabitId = habit.id;
    render();
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

  if (action === "export") {
    exportFile();
    return;
  }

  if (action === "import") {
    root.querySelector("[data-role=import-file]").click();
    return;
  }

  if (action === "toggle-theme-settings") {
    const panel = root.querySelector("[data-role=theme-settings]");
    if (!panel) return;
    panel.dataset.open = panel.dataset.open === "true" ? "false" : "true";
    return;
  }

  if (action === "toggle-cloud-settings") {
    const panel = root.querySelector("[data-role=cloud-settings]");
    if (!panel) return;
    panel.dataset.open = panel.dataset.open === "true" ? "false" : "true";
    return;
  }

  if (action === "cloud-save") {
    const email = root.querySelector("[data-role=cloud-email]")?.value || "";
    const password = root.querySelector("[data-role=cloud-password]")?.value || "";
    const enabled = Boolean(root.querySelector("[data-role=cloud-enabled]")?.checked);
    window.PulseCloud?.saveFromForm?.({ email, password, enabled }).then(() => {
      render();
      const panel = root.querySelector("[data-role=cloud-settings]");
      if (panel) panel.dataset.open = "true";
    });
    return;
  }

  if (action === "cloud-sync-now") {
    window.PulseCloud?.syncNow?.();
    return;
  }

  if (action === "toggle-routines") {
    state.routinesOpen = !state.routinesOpen;
    if (state.routinesOpen) {
      state.view = "day";
      if (!state.dayRoutinesOpenByDate) state.dayRoutinesOpenByDate = {};
      state.dayRoutinesOpenByDate[state.cursor] = true;
      state.sidebarOpen = false;
    }
    render();
    return;
  }

  if (action === "toggle-day-routines") {
    event.stopPropagation();
    const date = target.dataset.date;
    if (!date) return;
    if (!state.dayRoutinesOpenByDate) state.dayRoutinesOpenByDate = {};
    state.dayRoutinesOpenByDate[date] = !state.dayRoutinesOpenByDate[date];
    render();
    return;
  }

  if (action === "voice-routine") {
    return;
  }

  if (action === "set-theme") {
    const next = target.dataset.theme;
    if (isThemeId(next)) state.theme = next;
    applyTheme(state.theme);
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

  if (action === "delete-habit") {
    state.habits = state.habits.filter((habit) => habit.id !== target.dataset.id);
    if (state.selectedHabitId === target.dataset.id) {
      state.selectedHabitId = state.habits[0]?.id || "";
      if (!state.selectedHabitId && state.view === "habit") state.view = "week";
    }
    render();
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
  if (event.target.dataset.role === "new-level" && event.key === "Enter") {
    const name = event.target.value.trim();
    if (!name) return;
    const used = new Set(state.levels.map((level) => level.color));
    const color = PALETTE.find((item) => !used.has(item)) || PALETTE[state.levels.length % PALETTE.length];
    const level = { id: uid(), name, color, visible: true, order: state.levels.length };
    state.levels.push(level);
    state.lastLevelId = level.id;
    event.target.value = "";
    render();
  }

  if (event.target.dataset.role === "new-habit" && event.key === "Enter") {
    const name = event.target.value.trim();
    if (!name) return;
    const habit = {
      id: uid(),
      name,
      cells: {},
    };
    state.habits.push(habit);
    state.selectedHabitId = habit.id;
    state.view = "habit";
    event.target.value = "";
    render();
  }

  if (event.target.dataset.role === "new-editor-check" && event.key === "Enter") {
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
  }

  if (event.target.dataset.role === "new-goal-item" && event.key === "Enter") {
    const text = event.target.value.trim();
    if (!text) return;
    const goal = selectedGoal();
    if (!goal) return;
    goal.items.push({ id: uid(), text, done: false });
    event.target.value = "";
    render();
    const next = root.querySelector("[data-role=new-goal-item]");
    if (next) next.focus();
  }

  if (event.target.dataset.role === "new-goal-list" && event.key === "Enter") {
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
  }

  if (event.target.dataset.role === "new-routine" && event.key === "Enter") {
    const name = event.target.value.trim();
    const bucket = event.target.dataset.bucket;
    if (!addRoutineTask(name, bucket)) return;
    event.target.value = "";
    render();
    scheduleRemindSync();
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
  if (event.target.dataset.role !== "habit-cell") return;
  const habit = state.habits.find((item) => item.id === event.target.dataset.id);
  if (!habit) return;
  if (!habit.cells) habit.cells = {};
  const value = event.target.value.trim().slice(0, 2);
  const date = event.target.dataset.date;
  if (value) habit.cells[date] = value;
  else delete habit.cells[date];
  event.target.parentElement.classList.toggle("filled", Boolean(value));
  const year = parseISODate(state.cursor).getFullYear();
  const count = root.querySelector(".habit-row.active .habit-count");
  if (count) count.textContent = `${filledHabitCount(habit, year)}/${daysInYear(year)}`;
  const hint = root.querySelector(".habit-board .hint");
  if (hint) hint.textContent = `${filledHabitCount(habit, year)} из ${daysInYear(year)} · в ячейку — число или буква`;
  persist(state);
});

root.addEventListener("change", (event) => {
  if (event.target.dataset.role === "routine-remind") {
    const task = state.routineTasks.find((item) => item.id === event.target.dataset.id);
    if (!task) return;
    task.remindAt = normalizeRemindAt(event.target.value, task.bucket);
    event.target.value = task.remindAt;
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
  const cap = window.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return null;
  try {
    return cap.registerPlugin("LocalNotifications");
  } catch {
    return null;
  }
}

let remindSyncTimer = null;
let lastWebRemindKey = "";

async function syncRoutineReminders() {
  const tasks = normalizeRoutineTasks(state.routineTasks);
  state.routineTasks = tasks;

  const LocalNotifications = getLocalNotifications();
  if (LocalNotifications) {
    try {
      let perm = await LocalNotifications.checkPermissions();
      if (perm.display !== "granted") {
        perm = await LocalNotifications.requestPermissions();
      }
      if (perm.display !== "granted") return;

      const pending = await LocalNotifications.getPending();
      if (pending?.notifications?.length) {
        await LocalNotifications.cancel({ notifications: pending.notifications });
      }

      const notifications = tasks
        .map((task) => {
          const habit = state.habits.find((h) => h.id === task.habitId);
          if (!habit) return null;
          const [hour, minute] = normalizeRemindAt(task.remindAt, task.bucket).split(":").map(Number);
          const [, bucketLabel] = routineBucketMeta(task.bucket);
          return {
            id: notificationIdForTask(task.id),
            title: "Pulse",
            body: `${habit.name} · ${bucketLabel}`,
            schedule: {
              on: { hour, minute },
              repeats: true,
              allowWhileIdle: true,
            },
            extra: { taskId: task.id },
          };
        })
        .filter(Boolean);

      if (notifications.length) {
        await LocalNotifications.schedule({ notifications });
      }
    } catch (err) {
      console.warn("reminders", err);
    }
    return;
  }

  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      /* ignore */
    }
  }
}

function scheduleRemindSync() {
  clearTimeout(remindSyncTimer);
  remindSyncTimer = setTimeout(() => {
    syncRoutineReminders();
  }, 250);
}

function setupWebReminderTicker() {
  setInterval(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (window.Capacitor?.isNativePlatform?.()) return;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const dayKey = toISODate(now);
    state.routineTasks.forEach((task) => {
      if (normalizeRemindAt(task.remindAt, task.bucket) !== hhmm) return;
      const key = `${dayKey}:${task.id}:${hhmm}`;
      if (key === lastWebRemindKey || sessionStorage.getItem(`pulse-remind-${key}`)) return;
      const habit = state.habits.find((h) => h.id === task.habitId);
      if (!habit) return;
      lastWebRemindKey = key;
      sessionStorage.setItem(`pulse-remind-${key}`, "1");
      try {
        new Notification("Pulse", { body: `${habit.name} · ${routineBucketMeta(task.bucket)[1]}` });
      } catch {
        /* ignore */
      }
    });
  }, 30000);
}

function setupNativeBack() {
  const cap = window.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return;
  try {
    const App = cap.registerPlugin("App");
    App.addListener("backButton", () => {
      handlePulseBack();
    });
  } catch (err) {
    console.warn("backButton listener", err);
  }
}

setupNativeBack();
setupWebReminderTicker();
scheduleRemindSync();

window.PulseCloud?.init?.({
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

render();

if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}
