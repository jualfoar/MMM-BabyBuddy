"use strict";

const NodeHelper = require("node_helper");
const dns = require("dns");
const fetch = require("node-fetch");

// Node 17+ defaults DNS result order to "verbatim", which can return IPv6
// records first. In container environments without IPv6 egress (e.g. the
// default Docker bridge network), this causes fetch() to fail with ENOTFOUND.
// Prefer IPv4 so HTTPS calls work in IPv4-only networks. Hosts with full
// IPv6 connectivity still work fine — A records still resolve first.
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

module.exports = NodeHelper.create({
  start() {
    this.fetching = false;
  },

  // Server-side debug logger. Output goes to `docker logs mm`.
  // Never accept apiKey, headers, or response bodies here — only structural data.
  log(config, ...args) {
    if (config && config.debug) {
      console.log("[MMM-BabyBuddy]", ...args);
    }
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "BABYBUDDY_FETCH_ALL" && !this.fetching) {
      this.fetching = true;
      this.log(payload.config, "BABYBUDDY_FETCH_ALL received");
      this.fetchAll(payload.config).finally(() => { this.fetching = false; });
    }
  },

  async fetchAll(config) {
    // Env vars take precedence over config.js so secrets stay out of the config file.
    const baseUrl = process.env.BABYBUDDY_HOST || config.babyBuddyUrl;
    const apiKey = process.env.BABYBUDDY_API_KEY || config.apiKey;

    if (!baseUrl || !apiKey) {
      console.error("[MMM-BabyBuddy] Missing BABYBUDDY_HOST or BABYBUDDY_API_KEY (env or config)");
      this.sendSocketNotification("BABYBUDDY_DATA", {
        feeding: null, sleep: null, change: null, timers: null,
        error: true, errorCode: "MISSING_CREDENTIALS", childNotFound: null,
      });
      return;
    }

    const base = baseUrl.replace(/\/$/, "");
    const headers = { Authorization: `Token ${apiKey}` };

    // Note: never log `apiKey`, `headers`, or full response bodies.
    this.log(config, "fetchAll →", base, "keySource:", process.env.BABYBUDDY_API_KEY ? "env" : "config");

    let childParam = "";
    let childLookupFailed = false;

    if (config.childName && config.childName.trim() !== "") {
      try {
        const children = await this.fetchEndpoint(base, "/api/children/", headers);
        const match = (children.results || []).find(
          (c) => (c.first_name || "").toLowerCase() === config.childName.trim().toLowerCase()
        );
        if (match) {
          childParam = `&child=${match.id}`;
        } else {
          console.warn(`[MMM-BabyBuddy] Child "${config.childName}" not found — showing all children`);
        }
      } catch (e) {
        childLookupFailed = true;
        console.error("[MMM-BabyBuddy] Failed to fetch children:", e.message);
      }
    }

    const [feedingResult, sleepResult, changeResult, timersResult] = await Promise.allSettled([
      this.fetchEndpoint(base, `/api/feedings/?limit=1&ordering=-start${childParam}`, headers),
      this.fetchEndpoint(base, `/api/sleep/?limit=1&ordering=-start${childParam}`, headers),
      this.fetchEndpoint(base, `/api/changes/?limit=1&ordering=-time${childParam}`, headers),
      this.fetchEndpoint(base, `/api/timers/?active=true${childParam}`, headers),
    ]);

    const extract = (result) => (result.status === "fulfilled" ? result.value : null);

    const anyError = [feedingResult, sleepResult, changeResult, timersResult].some(
      (r) => r.status === "rejected"
    );

    const errorCode = [feedingResult, sleepResult, changeResult, timersResult]
      .find((r) => r.status === "rejected" && r.reason && r.reason.code)
      ?.reason?.code || null;

    this.log(config, "fetchAll done", {
      feeding: feedingResult.status,
      sleep: sleepResult.status,
      change: changeResult.status,
      timers: timersResult.status,
      anyError,
      errorCode,
    });

    this.sendSocketNotification("BABYBUDDY_DATA", {
      feeding: extract(feedingResult),
      sleep: extract(sleepResult),
      change: extract(changeResult),
      timers: extract(timersResult),
      error: anyError,
      errorCode,
      childNotFound: !childLookupFailed && config.childName && childParam === "" ? config.childName : null,
    });
  },

  async fetchEndpoint(base, path, headers) {
    const url = base + path;
    const response = await fetch(url, { headers, timeout: 8000 });

    if (!response.ok) {
      const err = new Error(`HTTP ${response.status} for ${path}`);
      err.code = response.status;
      throw err;
    }

    return response.json();
  },
});
