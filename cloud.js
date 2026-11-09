(function (global) {
  const SETTINGS_KEY = "planer-cloud-v1";
  const BASE = "https://webdav.cloud.mail.ru";
  const DIR_PATH = "/Pulse";
  const FILE_PATH = "/Pulse/planer.json";
  /** Fallback if /Pulse cannot be created (Android has no MKCOL). */
  const ROOT_FILE_PATH = "/planer.json";
  const PUSH_DELAY_MS = 2500;
  const AUTO_SYNC_MS = 30 * 60 * 1000;
  let activeFilePath = FILE_PATH;

  let hooks = {
    getSnapshot: () => ({}),
    getUpdatedAt: () => 0,
    applySnapshot: () => {},
  };
  let pushTimer = 0;
  let pullTimer = 0;
  let syncing = false;
  let queued = false;
  let statusText = "";

  function loadMeta() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return {
        enabled: Boolean(parsed.enabled),
        autoEvery30: Boolean(parsed.autoEvery30),
        email: String(parsed.email || "").trim(),
        password: String(parsed.password || ""),
        lastSyncAt: Number(parsed.lastSyncAt) || 0,
        lastError: String(parsed.lastError || ""),
      };
    } catch {
      return { enabled: false, autoEvery30: false, email: "", password: "", lastSyncAt: 0, lastError: "" };
    }
  }

  function saveMeta(meta) {
    const current = loadMeta();
    const next = { ...current, ...meta };
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        enabled: Boolean(next.enabled),
        autoEvery30: Boolean(next.autoEvery30),
        email: String(next.email || "").trim(),
        password: String(next.password || ""),
        lastSyncAt: Number(next.lastSyncAt) || 0,
        lastError: String(next.lastError || ""),
      }),
    );
    return loadMeta();
  }

  function isNativeApp() {
    return Boolean(global.planerDesktop?.webdav) || Boolean(global.Capacitor?.isNativePlatform?.());
  }

  function formatStatus(meta) {
    if (statusText) return statusText;
    if (!meta.enabled) return "Выключена";
    if (meta.lastError) return meta.lastError;
    if (meta.lastSyncAt) {
      const at = new Date(meta.lastSyncAt);
      const when = `Синхронизировано ${at.toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}`;
      return meta.autoEvery30 ? `${when} · каждые 30 мин` : when;
    }
    return meta.autoEvery30 ? "Ожидает первую синхронизацию · каждые 30 мин" : "Ожидает первую синхронизацию";
  }

  function paintStatus(text) {
    statusText = text || "";
    const el = document.querySelector("[data-role=cloud-status]");
    if (el) el.textContent = text || formatStatus(loadMeta());
  }

  function explainError(err, status) {
    const message = String(err?.message || err || "");
    if (status === 401 || status === 403) {
      return "Неверный логин или пароль внешнего приложения";
    }
    if (status === 507) return "В Облаке недостаточно места";
    if (/MKCOL|Expected one of \[OPTIONS/i.test(message)) {
      return "Не удалось создать папку в Облаке. Создайте папку Pulse вручную или повторите синхронизацию";
    }
    if (/failed to fetch|network|cors|load failed/i.test(message)) {
      if (!isNativeApp()) {
        return "В браузере Mail.ru не пускает WebDAV. Откройте Pulse на телефоне или в десктоп-приложении";
      }
      return "Нет сети или Облако недоступно";
    }
    if (status) return `Облако ответило ${status}`;
    return message || "Не удалось связаться с Облаком";
  }

  function supportsMkcol() {
    return Boolean(global.planerDesktop?.webdav);
  }

  async function readPassword(meta) {
    if (global.planerDesktop?.loadSecret) {
      const secret = await global.planerDesktop.loadSecret();
      if (secret) return secret;
    }
    return meta.password || "";
  }

  async function writePassword(password) {
    if (global.planerDesktop?.saveSecret) {
      const ok = await global.planerDesktop.saveSecret(password);
      if (ok) {
        saveMeta({ password: "" });
        return;
      }
    }
    saveMeta({ password });
  }

  async function webdav(method, urlPath, body) {
    const meta = loadMeta();
    const password = await readPassword(meta);
    const email = meta.email;
    if (!email || !password) {
      const error = new Error("Нет логина или пароля");
      error.status = 401;
      throw error;
    }
    if (global.planerDesktop?.webdav) {
      const result = await global.planerDesktop.webdav({
        method,
        urlPath,
        body: body ?? null,
        user: email,
        pass: password,
      });
      return result;
    }
    const headers = {
      Authorization: `Basic ${btoa(`${email}:${password}`)}`,
      "User-Agent": "Pulse/0.4.8",
      Overwrite: "T",
    };
    if (body != null) headers["Content-Type"] = "application/json; charset=utf-8";
    const response = await fetch(BASE + urlPath, { method, headers, body: body ?? undefined });
    return { status: response.status, body: await response.text() };
  }

  async function ensureFolder() {
    // Capacitor/Android HttpURLConnection rejects WebDAV MKCOL.
    if (!supportsMkcol()) return;
    const result = await webdav("MKCOL", DIR_PATH, null);
    if ([201, 204, 405, 409, 301, 302].includes(result.status)) return;
    if (result.status >= 400 && result.status !== 405) {
      const error = new Error(explainError(null, result.status));
      error.status = result.status;
      throw error;
    }
  }

  async function putSnapshot(snapshot) {
    await ensureFolder();
    const body = JSON.stringify(snapshot);
    let result = await webdav("PUT", FILE_PATH, body);
    if (result.status >= 200 && result.status < 300) {
      activeFilePath = FILE_PATH;
      return;
    }
    // Folder /Pulse may be missing on Android — write to cloud root.
    if ([404, 409, 405].includes(result.status)) {
      result = await webdav("PUT", ROOT_FILE_PATH, body);
      if (result.status >= 200 && result.status < 300) {
        activeFilePath = ROOT_FILE_PATH;
        return;
      }
    }
    const error = new Error(explainError(null, result.status));
    error.status = result.status;
    throw error;
  }

  async function getSnapshot() {
    const paths = activeFilePath === ROOT_FILE_PATH ? [ROOT_FILE_PATH, FILE_PATH] : [FILE_PATH, ROOT_FILE_PATH];
    let lastStatus = 404;
    for (const path of paths) {
      const result = await webdav("GET", path, null);
      lastStatus = result.status;
      if (result.status === 404) continue;
      if (result.status < 200 || result.status >= 300) {
        const error = new Error(explainError(null, result.status));
        error.status = result.status;
        throw error;
      }
      try {
        activeFilePath = path;
        return { data: JSON.parse(result.body || "{}") };
      } catch {
        const error = new Error("В Облаке лежит битый файл");
        throw error;
      }
    }
    if (lastStatus === 404) return { missing: true };
    const error = new Error(explainError(null, lastStatus));
    error.status = lastStatus;
    throw error;
  }

  function contentWeight(data) {
    if (!data || typeof data !== "object") return 0;
    return (
      (Array.isArray(data.entries) ? data.entries.length : 0) * 10 +
      (Array.isArray(data.habits) ? data.habits.length : 0) * 5 +
      (Array.isArray(data.goals) ? data.goals.length : 0) * 5 +
      (Array.isArray(data.lists) ? data.lists.length : 0) * 5 +
      (Array.isArray(data.routineTasks) ? data.routineTasks.length : 0) * 2 +
      Object.keys(data.dailies && typeof data.dailies === "object" ? data.dailies : {}).length
    );
  }

  function syncAllowed() {
    return typeof hooks.allowSync !== "function" || hooks.allowSync();
  }

  async function runSync() {
    const meta = loadMeta();
    if (!meta.enabled || !syncAllowed()) return;
    if (!isNativeApp()) {
      const text = explainError(new Error("cors"));
      saveMeta({ lastError: text });
      paintStatus(text);
      return;
    }
    paintStatus("Синхронизация…");
    const remote = await getSnapshot();
    const local = hooks.getSnapshot();
    const localAt = Number(local.updatedAt || hooks.getUpdatedAt() || 0);
    const localW = contentWeight(local);

    if (remote.missing) {
      if (localW > 0) await putSnapshot(local);
    } else {
      const remoteAt = Number(remote.data?.updatedAt) || 0;
      const remoteW = contentWeight(remote.data);
      // Never let an empty snapshot wipe a non-empty one.
      if (localW > 0 && remoteW === 0) {
        await putSnapshot(local);
      } else if (remoteW > 0 && localW === 0) {
        hooks.applySnapshot(remote.data);
      } else if (remoteAt > localAt) {
        hooks.applySnapshot(remote.data);
      } else if (localAt > remoteAt) {
        await putSnapshot(local);
      } else if (localW > remoteW) {
        await putSnapshot(local);
      } else if (remoteW > localW) {
        hooks.applySnapshot(remote.data);
      }
    }
    saveMeta({ lastSyncAt: Date.now(), lastError: "" });
    paintStatus("");
    paintStatus(formatStatus(loadMeta()));
  }

  async function syncNow() {
    if (syncing) {
      queued = true;
      return;
    }
    syncing = true;
    try {
      await runSync();
    } catch (err) {
      const text = explainError(err, err.status);
      saveMeta({ lastError: text });
      paintStatus(text);
    } finally {
      syncing = false;
      if (queued) {
        queued = false;
        syncNow();
      }
    }
  }

  function schedulePush() {
    const meta = loadMeta();
    if (!meta.enabled || !syncAllowed()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      syncNow();
    }, PUSH_DELAY_MS);
  }

  function restartAutoSync() {
    clearInterval(pullTimer);
    pullTimer = 0;
    const meta = loadMeta();
    if (!syncAllowed() || !meta.enabled || !meta.autoEvery30) return;
    pullTimer = setInterval(() => {
      if (document.visibilityState === "visible") syncNow();
    }, AUTO_SYNC_MS);
  }

  function init(nextHooks) {
    hooks = { ...hooks, ...nextHooks };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") syncNow();
    });
    restartAutoSync();
    setTimeout(() => syncNow(), 800);
  }

  async function saveFromForm({ email, password, enabled, autoEvery30 }) {
    const turnOn = Boolean(enabled) && syncAllowed();
    saveMeta({
      email,
      enabled: turnOn,
      autoEvery30: Boolean(autoEvery30),
      lastError: "",
    });
    if (password) await writePassword(password);
    restartAutoSync();
    paintStatus(turnOn ? "Подключаю Облако…" : "Выключена");
    if (turnOn) await syncNow();
    else paintStatus("Выключена");
  }

  global.PulseCloud = {
    init,
    schedulePush,
    syncNow,
    loadMeta,
    formatStatus,
    isNativeApp,
    saveFromForm,
    restartAutoSync,
  };
})(window);
