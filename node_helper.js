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
        children: [], error: true, errorCode: "MISSING_CREDENTIALS", childNotFound: null,
      });
      return;
    }

    const base = baseUrl.replace(/\/$/,  "");
    const headers = { Authorization: `Token ${apiKey}` };

    // Note: never log `apiKey`, `headers`, or full response bodies.
    this.log(config, "fetchAll →", base, "keySource:", process.env.BABYBUDDY_API_KEY ? "env" : "config");

    let childrenList = [];
    let childNotFound = null;

    try {
      const childrenData = await this.fetchEndpoint(base, "/api/children/", headers);
      childrenList = childrenData.results || [];

      if (config.childName && config.childName.trim() !== "") {
        const match = childrenList.find(
          (c) => (c.first_name || "").toLowerCase() === config.childName.trim().toLowerCase()
        );
        if (match) {
          childrenList = [match];
        } else {
          console.warn(`[MMM-BabyBuddy] Child "${config.childName}" not found — showing all children`);
          childNotFound = config.childName;
        }
      }
    } catch (e) {
      console.error("[MMM-BabyBuddy] Failed to fetch children:", e.message);
      this.sendSocketNotification("BABYBUDDY_DATA", {
        children: [], error: true, errorCode: e.code || null, childNotFound: null,
      });
      return;
    }

    const results = await Promise.allSettled(
      childrenList.map((child) => this.fetchChildData(base, headers, child))
    );

    const children = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      console.error(`[MMM-BabyBuddy] Failed to fetch data for ${childrenList[i].first_name}:`, r.reason && r.reason.message);
      return {
        id: childrenList[i].id,
        name: childrenList[i].first_name || `Child ${i + 1}`,
        feeding: null, sleep: null, change: null, timers: null,
      };
    });

    const anyError = results.some((r) => r.status === "rejected");
    const errorCode = results
      .find((r) => r.status === "rejected" && r.reason && r.reason.code)
      ?.reason?.code || null;

    this.log(config, "fetchAll done", {
      children: children.map((c) => c.name),
      anyError,
      errorCode,
    });

    this.sendSocketNotification("BABYBUDDY_DATA", {
      children,
      error: anyError,
      errorCode,
      childNotFound,
    });
  },

  async fetchChildData(base, headers, child) {
    const childParam = `&child=${child.id}`;
    const [feedingResult, sleepResult, changeResult, timersResult] = await Promise.allSettled([
      this.fetchEndpoint(base, `/api/feedings/?limit=1&ordering=-start${childParam}`, headers),
      this.fetchEndpoint(base, `/api/sleep/?limit=1&ordering=-start${childParam}`, headers),
      this.fetchEndpoint(base, `/api/changes/?limit=1&ordering=-time${childParam}`, headers),
      this.fetchEndpoint(base, `/api/timers/?active=true${childParam}`, headers),
    ]);

    const extract = (r) => (r.status === "fulfilled" ? r.value : null);

    return {
      id: child.id,
      name: child.first_name || `Child ${child.id}`,
      feeding: extract(feedingResult),
      sleep: extract(sleepResult),
      change: extract(changeResult),
      timers: extract(timersResult),
    };
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
