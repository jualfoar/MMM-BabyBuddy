# MMM-BabyBuddy

MagicMirror2 module that displays real-time baby tracking data from a [Baby Buddy](https://github.com/babybuddy/babybuddy) instance.

## Project Structure

```
MMM-BabyBuddy/
├── MMM-BabyBuddy.js        # Browser-side module (MagicMirror2 frontend)
├── node_helper.js           # Node.js backend — all Baby Buddy API calls live here
├── MMM-BabyBuddy.css       # Card-based styles with per-category accent colors
├── package.json             # Single dependency: node-fetch@^2
├── test-api.js              # Standalone API connectivity test script
├── translations/
│   ├── en.json              # English
│   ├── es.json              # Spanish
│   └── fr.json              # French
└── .claude/
    ├── settings.json        # SessionStart hook registration
    └── hooks/
        └── session-start.sh # Runs npm install on web session start
```

## Architecture

Data flow:
1. `MMM-BabyBuddy.js` sends `BABYBUDDY_FETCH_ALL` socket notification to `node_helper.js`
2. `node_helper.js` calls Baby Buddy REST API using `node-fetch` (avoids browser CORS)
3. `node_helper.js` replies with `BABYBUDDY_DATA` payload
4. `MMM-BabyBuddy.js` re-renders via `getDom()`

Active timers refresh every second via `setInterval` in the browser. All other data refreshes on `updateInterval` (default 60s).

## Baby Buddy API Endpoints Used

All requests use `Authorization: Token <apiKey>`.

| Data | Endpoint |
|---|---|
| Last feeding | `GET /api/feedings/?limit=1&ordering=-start` |
| Last sleep | `GET /api/sleep/?limit=1&ordering=-start` |
| Last diaper change | `GET /api/changes/?limit=1&ordering=-time` |
| Active timers | `GET /api/timers/?active=true` |
| Children (optional filter) | `GET /api/children/` |

### Verified API Field Names (from live instance)

**Feedings:** `type` = feeding type (e.g. `"breast milk"`), `method` = detail (e.g. `"right breast"`), no separate `side` field.

**Changes:** `wet` (bool), `solid` (bool), `color` (string, e.g. `"green"`), `time` (ISO timestamp).

**Sleep:** `start`, `end` (null if ongoing), `duration` (HH:MM:SS string).

## Environment Variables

| Variable | Description |
|---|---|
| `BABYBUDDY_API_KEY` | Baby Buddy API token (from User Settings in Baby Buddy) |
| `BABYBUDDY_HOST` | Baby Buddy base URL (e.g. `https://baby.example.com`) |

These are set in `~/.claude/settings.json` under `env` for web sessions.

## MagicMirror2 Config

```js
{
  module: "MMM-BabyBuddy",
  position: "top_right",
  config: {
    babyBuddyUrl: "https://baby.example.com",
    apiKey: "your-api-key-here",
    updateInterval: 60000,   // ms, default 60s
    childName: ""            // optional: filter by child's first name
  }
}
```

Language is picked up from MagicMirror2's global `language` setting (`en`, `es`, `fr` supported).

## Docker Deployment

```bash
# Copy module into running MagicMirror2 container
docker cp /path/to/MMM-BabyBuddy <container>:/opt/magic_mirror/modules/MMM-BabyBuddy

# Install dependency inside container
docker exec -it <container> bash -c \
  "cd /opt/magic_mirror/modules/MMM-BabyBuddy && npm install"

# Edit config.js then restart
docker restart <container>
```

## Testing

```bash
# Install deps
npm install

# Test all 5 API endpoints against live Baby Buddy
BABYBUDDY_API_KEY=<key> BABYBUDDY_HOST=<url> node test-api.js
```

## Dependencies

- `node-fetch@^2` — v2 required (v3 is ESM-only, incompatible with MagicMirror2's CommonJS node_helper)

## Known Behaviours

- **IPv4 DNS preference**: `node_helper.js` calls `dns.setDefaultResultOrder("ipv4first")` at startup (Node 17+). This is a process-global setting that affects all MagicMirror2 modules in the same Node process — required because Docker's default bridge network has no IPv6 egress, causing `fetch()` to fail with ENOTFOUND when IPv6 is tried first. Hosts with full IPv6 connectivity are unaffected (A records still resolve).

## Adding More Languages

1. Copy `translations/en.json` to `translations/<lang>.json`
2. Translate all values (keep keys unchanged)
3. Add the language to `getTranslations()` in `MMM-BabyBuddy.js`:
   ```js
   getTranslations() {
     return {
       en: "translations/en.json",
       es: "translations/es.json",
       fr: "translations/fr.json",
       de: "translations/de.json",  // new
     };
   }
   ```
