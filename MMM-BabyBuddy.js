Module.register("MMM-BabyBuddy", {
  defaults: {
    babyBuddyUrl: "http://localhost:8000",
    apiKey: "",
    updateInterval: 60000,
    childName: "",
    debug: false,
  },

  // Browser-side debug logger. Output appears in the browser DevTools console.
  // Safe by default: never accept the apiKey here, only structural data.
  log(...args) {
    if (this.config && this.config.debug) {
      console.log("[MMM-BabyBuddy]", ...args);
    }
  },

  getTranslations() {
    return {
      en: "translations/en.json",
      es: "translations/es.json",
      fr: "translations/fr.json",
    };
  },

  start() {
    // NOTE: never assign to `this.data` — MagicMirror reserves it for module metadata
    // (position, identifier, classes, ...). Use `this.bbState` for our own state.
    this.bbState = { feeding: null, sleep: null, change: null, timers: null };
    this.apiError = false;
    this.errorCode = null;
    this.childNotFound = null;
    this.loaded = false;
    this.fetchInterval = null;
    this.timerInterval = null;

    if (this.config.updateInterval < 10000) {
      console.warn(
        `[MMM-BabyBuddy] updateInterval is ${this.config.updateInterval} ms — this will hammer the API.` +
        ` Did you mean ${this.config.updateInterval * 1000} ms?`
      );
    }

    this.log("start() — interval:", this.config.updateInterval, "child:", this.config.childName || "(all)");
    this.scheduleUpdate();
  },

  scheduleUpdate() {
    this.log("requesting BABYBUDDY_FETCH_ALL");
    this.sendSocketNotification("BABYBUDDY_FETCH_ALL", { config: this.config });
    this.fetchInterval = setInterval(() => {
      this.sendSocketNotification("BABYBUDDY_FETCH_ALL", { config: this.config });
    }, this.config.updateInterval);
  },

  stop() {
    clearInterval(this.fetchInterval);
    clearInterval(this.timerInterval);
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "BABYBUDDY_DATA") return;

    this.log("received BABYBUDDY_DATA", {
      hasFeeding: !!(payload.feeding && payload.feeding.results && payload.feeding.results.length),
      hasSleep:   !!(payload.sleep   && payload.sleep.results   && payload.sleep.results.length),
      hasChange:  !!(payload.change  && payload.change.results  && payload.change.results.length),
      activeTimers: (payload.timers && payload.timers.results && payload.timers.results.length) || 0,
      error: payload.error || false,
      errorCode: payload.errorCode || null,
      childNotFound: payload.childNotFound || null,
    });

    this.bbState = {
      feeding: payload.feeding,
      sleep: payload.sleep,
      change: payload.change,
      timers: payload.timers,
    };
    this.apiError = payload.error || false;
    this.errorCode = payload.errorCode || null;
    this.childNotFound = payload.childNotFound || null;
    this.loaded = true;

    this.updateDom(300);
    this.manageTimerTick();
  },

  manageTimerTick() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    const timers = this.bbState.timers;
    if (timers && timers.results && timers.results.length > 0) {
      this.timerInterval = setInterval(() => this.updateDom(), 1000);
    }
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "MMM-BabyBuddy";

    if (!this.loaded) {
      const loading = document.createElement("div");
      loading.className = "bb-loading";
      loading.innerText = this.translate("LOADING");
      wrapper.appendChild(loading);
      return wrapper;
    }

    if (this.apiError) {
      wrapper.appendChild(this.renderErrorBanner());
    }

    if (this.childNotFound) {
      const warn = document.createElement("div");
      warn.className = "bb-error-banner";
      warn.innerText = this.translate("CHILD_NOT_FOUND", { name: this.childNotFound });
      wrapper.appendChild(warn);
    }

    wrapper.appendChild(this.renderFeeding(this.bbState.feeding));
    wrapper.appendChild(this.renderSleep(this.bbState.sleep));
    wrapper.appendChild(this.renderChange(this.bbState.change));

    const timersEl = this.renderTimers(this.bbState.timers);
    if (timersEl) wrapper.appendChild(timersEl);

    return wrapper;
  },

  renderErrorBanner() {
    const el = document.createElement("div");
    el.className = "bb-error-banner";
    el.innerText = (this.errorCode === 401 || this.errorCode === "MISSING_CREDENTIALS")
      ? this.translate("ERROR_AUTH")
      : this.translate("ERROR_UNREACHABLE");
    return el;
  },

  renderFeeding(feeding) {
    const record = feeding && feeding.results && feeding.results[0];
    let primary = this.translate("NO_RECENT_DATA");
    let secondary = "";

    if (record) {
      primary = this.formatElapsed(new Date(record.start));
      const type = record.type ? this.translateValue(record.type) : "";
      const method = record.method ? this.translateValue(record.method) : "";
      const raw = record.amount != null ? parseFloat(record.amount) : null;
      const amount = raw != null ? ` · ${this.translate("UNIT_ML", { amount: +raw.toFixed(1) })}` : "";
      secondary = [type, method].filter(Boolean).join(" — ") + amount;
    }

    return this.renderCard("🍼", this.translate("LAST_FEEDING"), primary, secondary, "feeding");
  },

  renderSleep(sleep) {
    const record = sleep && sleep.results && sleep.results[0];
    let primary = this.translate("NO_RECENT_DATA");
    let secondary = "";

    if (record) {
      if (!record.end) {
        primary = this.translate("SLEEPING_NOW");
        secondary = this.translate("STARTED", { elapsed: this.formatElapsed(new Date(record.start)) });
      } else {
        primary = this.translate("WOKE_UP", { elapsed: this.formatElapsed(new Date(record.end)) });
        secondary = record.duration
          ? this.translate("DURATION", { duration: this.parseDuration(record.duration) })
          : "";
      }
    }

    return this.renderCard("😴", this.translate("LAST_SLEEP"), primary, secondary, "sleep");
  },

  renderChange(change) {
    const record = change && change.results && change.results[0];
    let primary = this.translate("NO_RECENT_DATA");
    let secondary = "";

    if (record) {
      primary = this.formatElapsed(new Date(record.time));

      if (record.wet && record.solid) {
        secondary = this.translate("WET_SOLID");
      } else if (record.wet) {
        secondary = this.translate("WET");
      } else if (record.solid) {
        secondary = this.translate("SOLID");
      } else {
        secondary = this.translate("DRY");
      }

      if (record.color) {
        secondary += ` · ${this.translateValue(record.color)}`;
      }
    }

    return this.renderCard("💧", this.translate("LAST_CHANGE"), primary, secondary, "change");
  },

  renderTimers(timers) {
    if (!timers || !timers.results || timers.results.length === 0) return null;

    const container = document.createElement("div");
    container.className = "bb-timers";

    const heading = document.createElement("div");
    heading.className = "bb-timers-heading";
    heading.innerText = `⏱ ${this.translate("ACTIVE_TIMERS")}`;
    container.appendChild(heading);

    timers.results.forEach((timer) => {
      const row = document.createElement("div");
      row.className = "bb-timer-item";

      const label = document.createElement("span");
      label.className = "bb-timer-label";
      label.innerText = timer.name || this.translate("TIMER");

      const elapsed = document.createElement("span");
      elapsed.className = "bb-timer-elapsed";
      elapsed.innerText = this.formatElapsedLive(new Date(timer.start));

      row.appendChild(label);
      row.appendChild(elapsed);
      container.appendChild(row);
    });

    return container;
  },

  renderCard(icon, label, primary, secondary, type) {
    const card = document.createElement("div");
    card.className = `bb-card bb-card--${type}`;

    const iconEl = document.createElement("div");
    iconEl.className = "bb-card-icon";
    iconEl.innerText = icon;

    const content = document.createElement("div");
    content.className = "bb-card-content";

    const labelEl = document.createElement("div");
    labelEl.className = "bb-card-label";
    labelEl.innerText = label;

    const primaryEl = document.createElement("div");
    primaryEl.className = "bb-card-primary";
    primaryEl.innerText = primary;

    content.appendChild(labelEl);
    content.appendChild(primaryEl);

    if (secondary) {
      const secondaryEl = document.createElement("div");
      secondaryEl.className = "bb-card-secondary";
      secondaryEl.innerText = secondary;
      content.appendChild(secondaryEl);
    }

    card.appendChild(iconEl);
    card.appendChild(content);
    return card;
  },

  // Translates API string values (feeding type, method, diaper color).
  // Falls back to capitalizing the original if no translation exists.
  translateValue(value) {
    if (!value) return "";
    const key = "VALUE_" + value.toUpperCase().replace(/ /g, "_");
    const result = this.translate(key);
    return result !== key ? result : this.capitalize(value);
  },

  formatElapsed(date) {
    if (!date || isNaN(date.getTime())) return this.translate("NO_RECENT_DATA");
    const delta = Math.floor((Date.now() - date.getTime()) / 1000);
    if (delta < 60)   return this.translate("JUST_NOW");
    if (delta < 3600) return this.translate("MINUTES_AGO", { m: Math.floor(delta / 60) });
    if (delta < 86400) {
      const h = Math.floor(delta / 3600);
      const m = Math.floor((delta % 3600) / 60);
      return m > 0
        ? this.translate("HOURS_MINUTES_AGO", { h, m })
        : this.translate("HOURS_AGO", { h });
    }
    return this.translate("DAYS_AGO", { d: Math.floor(delta / 86400) });
  },

  formatElapsedLive(date) {
    const delta = Math.floor((Date.now() - date.getTime()) / 1000);
    const h = Math.floor(delta / 3600);
    const m = Math.floor((delta % 3600) / 60);
    const s = delta % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  },

  parseDuration(durationStr) {
    if (!durationStr || typeof durationStr !== "string") return "";
    const parts = durationStr.split(":");
    if (parts.length < 3) return durationStr;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseInt(parts[2], 10);
    if (isNaN(h) || isNaN(m) || isNaN(s)) return durationStr;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0 && s > 0) return `${h}h ${s}s`;
    if (h > 0) return `${h}h`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
  },

  capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  },
});
