"use strict";

const NodeHelper = require("node_helper");
const fetch = require("node-fetch");

module.exports = NodeHelper.create({
  start() {
    this.fetching = false;
    console.log(`[MMM-BabyBuddy] node_helper started`);
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "BABYBUDDY_FETCH_ALL" && !this.fetching) {
      this.fetching = true;
      this.fetchAll(payload.config).finally(() => { this.fetching = false; });
    }
  },

  async fetchAll(config) {
    const base = config.babyBuddyUrl.replace(/\/$/, "");
    const headers = { Authorization: `Token ${config.apiKey}` };

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
