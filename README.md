# MMM-BabyBuddy

A [MagicMirror²](https://magicmirror.builders/) module that displays real-time baby tracking data from [Baby Buddy](https://github.com/babybuddy/babybuddy).

## What It Shows

| Card | Info displayed |
|---|---|
| 🍼 Last Feeding | Time elapsed, feeding type, method, amount |
| 😴 Last Sleep | Time since woke up, duration (or "Sleeping now" with elapsed) |
| 💧 Last Change | Time elapsed, type (Wet / Solid / Wet + Solid / Dry), color |
| ⏱ Active Timers | Live countup for any running Baby Buddy timers |

When multiple children are tracked, the display automatically cycles through each child with a name header and dot indicators.

## Languages Supported

English (`en`) · Spanish (`es`) · French (`fr`)

Language is picked up automatically from MagicMirror²'s global `language` setting.

## Installation

### 1. Clone into your MagicMirror modules folder

```bash
cd ~/MagicMirror/modules
git clone https://github.com/jualfoar/MMM-BabyBuddy.git
cd MMM-BabyBuddy
npm install
```

### 2. Docker install

```bash
# Copy module into your running MagicMirror² container
docker cp MMM-BabyBuddy <container>:/opt/magic_mirror/modules/MMM-BabyBuddy

# Install dependency inside the container
docker exec -it <container> bash -c \
  "cd /opt/magic_mirror/modules/MMM-BabyBuddy && npm install"

docker restart <container>
```

### 3. Get your Baby Buddy API key

In Baby Buddy → **User Settings** → **API Key** → copy the token.

### 4. Add to MagicMirror² config

```js
// config/config.js
{
  module: "MMM-BabyBuddy",
  position: "middle_center",
  config: {
    babyBuddyUrl: "http://localhost:8000",  // URL of your Baby Buddy instance
    apiKey: "your-api-key-here",
    updateInterval: 60000,                  // refresh every 60 seconds (in ms)
    cycleInterval: 10000,                   // seconds per child slide (multi-child)
    childName: ""                           // optional: pin to one child, disables cycling
  }
}
```

## Configuration Options

| Option | Default | Description |
|---|---|---|
| `babyBuddyUrl` | `"http://localhost:8000"` | URL of your Baby Buddy instance |
| `apiKey` | `""` | Baby Buddy API token |
| `updateInterval` | `60000` | Data refresh interval in **milliseconds** (e.g. `60000` = 1 min) |
| `cycleInterval` | `10000` | Time in **milliseconds** between child slides when multiple children are tracked (e.g. `10000` = 10 sec) |
| `childName` | `""` | Pin to a single child by first name. Leave empty to cycle through all children automatically |
| `debug` | `false` | Enable verbose debug logging (browser DevTools + server console) |

## Multi-Child Support

With multiple children in Baby Buddy, the module automatically:

1. Fetches all children from `/api/children/`
2. Loads each child's feeding, sleep, diaper, and timer data in parallel
3. Cycles through children every `cycleInterval` milliseconds, showing their name and a dot indicator

To show only one specific child (no cycling), set `childName: "Alice"` in the config.

## Credentials via Environment Variables

API credentials can be provided via environment variables instead of (or to override) `config.js`. This keeps secrets out of your config file:

```bash
BABYBUDDY_HOST=https://baby.example.com
BABYBUDDY_API_KEY=your-token-here
```

Environment variables take precedence over `babyBuddyUrl` / `apiKey` in config.

## Debugging

Set `debug: true` in the module config to enable detailed logging:

- **Browser side** — logs appear in the browser's DevTools console
- **Server side** — logs appear in `docker logs <container>` or the MagicMirror² terminal

The logger never outputs the API key or raw response bodies.

## Requirements

- MagicMirror² v2.x
- Baby Buddy instance with API access
- Node.js ≥ 14 (≥ 17 recommended for Docker deployments — IPv4 DNS fix)

## Adding More Languages

1. Copy `translations/en.json` → `translations/<lang>.json`
2. Translate all values (keep the keys unchanged)
3. Register the new file in `MMM-BabyBuddy.js`:

```js
getTranslations() {
  return {
    en: "translations/en.json",
    es: "translations/es.json",
    fr: "translations/fr.json",
    de: "translations/de.json",  // your new language
  };
}
```

Pull requests for new languages are welcome!

## License

MIT
