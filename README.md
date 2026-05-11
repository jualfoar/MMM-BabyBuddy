# MMM-BabyBuddy

A [MagicMirror²](https://magicmirror.builders/) module that displays real-time baby tracking data from [Baby Buddy](https://github.com/babybuddy/babybuddy).

## What It Shows

| Card | Info displayed |
|---|---|
| 🍼 Last Feeding | Time elapsed, feeding type, method/side |
| 😴 Last Sleep | Time since woke up, duration (or "Sleeping now") |
| 💧 Last Change | Time elapsed, type (Wet / Solid / Wet + Solid), color |
| ⏱ Active Timers | Live countdown for any running Baby Buddy timers |

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
  position: "top_right",
  config: {
    babyBuddyUrl: "http://localhost:8000",  // URL of your Baby Buddy instance
    apiKey: "your-api-key-here",
    updateInterval: 60000,                  // refresh every 60 seconds
    childName: ""                           // optional: filter by child's first name
  }
}
```

## Configuration Options

| Option | Default | Description |
|---|---|---|
| `babyBuddyUrl` | `"http://localhost:8000"` | URL of your Baby Buddy instance |
| `apiKey` | `""` | Baby Buddy API token |
| `updateInterval` | `60000` | Data refresh interval in milliseconds |
| `childName` | `""` | Filter to a specific child by first name. Leave empty to show data for all children |

## Requirements

- MagicMirror² v2.x
- Baby Buddy instance with API access
- Node.js ≥ 14

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
