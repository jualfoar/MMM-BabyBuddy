Module.register("MMM-BabyBuddy", {
  defaults: {
    babyBuddyUrl: "http://localhost:8000",
    apiKey: "",
    updateInterval: 60000,
    childName: "",
  },

  start() {
    this.data = { feeding: null, sleep: null, change: null, timers: null };
    this.apiError = false;
    this.errorCode = null;
    this.childNotFound = null;
    this.loaded = false;
    this.timerInterval = null;

    this.scheduleUpdate();
  },

  scheduleUpdate() {
    this.sendSocketNotification("BABYBUDDY_FETCH_ALL", { config: this.config });
    setInterval(() => {
      this.sendSocketNotification("BABYBUDDY_FETCH_ALL", { config: this.config });
    }, this.config.updateInterval);
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "BABYBUDDY_DATA") return;

    this.data = payload;
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

    const timers = this.data.timers;
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
      loading.innerText = "Loading Baby Buddy…";
      wrapper.appendChild(loading);
      return wrapper;
    }

    if (this.apiError) {
      wrapper.appendChild(this.renderErrorBanner());
    }

    if (this.childNotFound) {
      const warn = document.createElement("div");
      warn.className = "bb-error-banner";
      warn.innerText = `⚠ Child not found: "${this.childNotFound}" — showing all`;
      wrapper.appendChild(warn);
    }

    wrapper.appendChild(this.renderFeeding(this.data.feeding));
    wrapper.appendChild(this.renderSleep(this.data.sleep));
    wrapper.appendChild(this.renderChange(this.data.change));

    const timersEl = this.renderTimers(this.data.timers);
    if (timersEl) wrapper.appendChild(timersEl);

    return wrapper;
  },

  renderErrorBanner() {
    const el = document.createElement("div");
    el.className = "bb-error-banner";

    if (this.errorCode === 401) {
      el.innerText = "⚠ Baby Buddy: authentication error — check API key";
    } else {
      el.innerText = "⚠ Baby Buddy unreachable — showing last known data";
    }

    return el;
  },

  renderFeeding(feeding) {
    const record = feeding && feeding.results && feeding.results[0];
    let primary = "No recent data";
    let secondary = "";

    if (record) {
      primary = this.formatElapsed(new Date(record.start));
      const method = record.method ? this.capitalize(record.method) : "";
      const side = record.side ? this.capitalize(record.side) : "";
      const amount = record.amount ? ` · ${record.amount} ml` : "";
      secondary = [method, side].filter(Boolean).join(" — ") + amount;
    }

    return this.renderCard("🍼", "Last Feeding", primary, secondary, "feeding");
  },

  renderSleep(sleep) {
    const record = sleep && sleep.results && sleep.results[0];
    let primary = "No recent data";
    let secondary = "";

    if (record) {
      if (!record.end) {
        primary = "Sleeping now";
        secondary = `Started ${this.formatElapsed(new Date(record.start))}`;
      } else {
        primary = `Woke up ${this.formatElapsed(new Date(record.end))}`;
        secondary = record.duration ? `Duration: ${this.parseDuration(record.duration)}` : "";
      }
    }

    return this.renderCard("😴", "Last Sleep", primary, secondary, "sleep");
  },

  renderChange(change) {
    const record = change && change.results && change.results[0];
    let primary = "No recent data";
    let secondary = "";

    if (record) {
      primary = this.formatElapsed(new Date(record.time));
      if (record.wet && record.solid) {
        secondary = "Wet + Solid";
      } else if (record.wet) {
        secondary = "Wet";
      } else if (record.solid) {
        secondary = "Solid";
      } else {
        secondary = "Dry";
      }
      if (record.color) secondary += ` · ${this.capitalize(record.color)}`;
    }

    return this.renderCard("💧", "Last Change", primary, secondary, "change");
  },

  renderTimers(timers) {
    if (!timers || !timers.results || timers.results.length === 0) return null;

    const container = document.createElement("div");
    container.className = "bb-timers";

    const heading = document.createElement("div");
    heading.className = "bb-timers-heading";
    heading.innerText = "⏱ Active Timers";
    container.appendChild(heading);

    timers.results.forEach((timer) => {
      const row = document.createElement("div");
      row.className = "bb-timer-item";

      const label = document.createElement("span");
      label.className = "bb-timer-label";
      label.innerText = timer.name || "Timer";

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

  // Formats elapsed time as "2h 15m ago", "45m ago", "just now"
  formatElapsed(date) {
    const delta = Math.floor((Date.now() - date.getTime()) / 1000);
    if (delta < 60) return "just now";
    if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
    if (delta < 86400) {
      const h = Math.floor(delta / 3600);
      const m = Math.floor((delta % 3600) / 60);
      return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
    }
    return `${Math.floor(delta / 86400)}d ago`;
  },

  // For active timers: shows elapsed as "1h 23m 45s"
  formatElapsedLive(date) {
    const delta = Math.floor((Date.now() - date.getTime()) / 1000);
    const h = Math.floor(delta / 3600);
    const m = Math.floor((delta % 3600) / 60);
    const s = delta % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
  },

  // Parses "02:30:00" → "2h 30m"
  parseDuration(durationStr) {
    const parts = durationStr.split(":");
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  },

  capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  },
});
