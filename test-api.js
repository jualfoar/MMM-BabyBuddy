#!/usr/bin/env node
/**
 * Test script for MMM-BabyBuddy API connection.
 * Run: node test-api.js
 */

const fetch = require("node-fetch");

const BASE_URL = process.env.BABYBUDDY_HOST || "http://localhost:8000";
const API_KEY  = process.env.BABYBUDDY_API_KEY || "";

if (!API_KEY) {
  console.error("Set BABYBUDDY_API_KEY env var before running:\n  BABYBUDDY_API_KEY=<your-key> node test-api.js");
  process.exit(1);
}

const headers = { Authorization: `Token ${API_KEY}` };

const endpoints = [
  { label: "Children",       path: "/api/children/" },
  { label: "Last Feeding",   path: "/api/feedings/?limit=1&ordering=-start" },
  { label: "Last Sleep",     path: "/api/sleep/?limit=1&ordering=-start" },
  { label: "Last Change",    path: "/api/changes/?limit=1&ordering=-time" },
  { label: "Active Timers",  path: "/api/timers/?active=true" },
];

async function test() {
  console.log(`\nTesting Baby Buddy at: ${BASE_URL}\n${"─".repeat(50)}`);

  for (const ep of endpoints) {
    const url = BASE_URL + ep.path;
    try {
      const res = await fetch(url, { headers, timeout: 8000 });
      if (!res.ok) {
        console.log(`❌ ${ep.label.padEnd(16)} HTTP ${res.status}`);
        continue;
      }
      const json = await res.json();
      const count = json.count !== undefined ? ` (${json.count} total)` : "";
      const first = json.results && json.results[0]
        ? "\n   " + JSON.stringify(json.results[0], null, 2).split("\n").join("\n   ")
        : json.results ? "   (no results)" : "";
      console.log(`✅ ${ep.label.padEnd(16)}${count}${first}`);
    } catch (e) {
      console.log(`❌ ${ep.label.padEnd(16)} ${e.message}`);
    }
    console.log();
  }
}

test();
