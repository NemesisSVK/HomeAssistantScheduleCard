# Schedule Card for Home Assistant

A custom Lovelace card that visualizes Home Assistant **schedule helper** entities as a weekly time grid.

[![HACS](https://img.shields.io/badge/HACS-Custom-orange?style=flat-square)](https://github.com/hacs/integration)
![Version](https://img.shields.io/badge/version-2.3.6-blue?style=flat-square)
![HA](https://img.shields.io/badge/HA-2023.9%2B-03a9f4?style=flat-square)

## Features

- **Multi-schedule support** — Display up to 25 schedules (5 groups × 5 per group)
- **Grouping** — Same group = overlapping rows, different group = separate row per day (Mon G1 / Mon G2 / Tue G1 / Tue G2...)
- **Weekly grid view** — All 7 days at a glance with hour gridlines
- **Colored time blocks** — Custom colors per entity, with 25 auto-assigned defaults
- **Transparency control** — Per-entity `opacity` (0.0 – 1.0)
- **Current time indicator** — Red line on today's row
- **Interactive legend** — Click entity names to open the native more-info dialog
- **Renamed entity support** — Resolves schedule data even after entity rename
- **Native Auto-sizing** — Adapts flawlessly to both Lovelace Masonry and Section layouts out-of-the-box (no manual `card_size` tuning needed)
- **Theme aware** — Uses HA CSS variables
- **Zero dependencies** — Single JS file

## Installation

### HACS (Recommended)

1. Open **HACS** in your Home Assistant sidebar
2. Click **⋮ → Custom repositories**
3. Add `https://github.com/NemesisSVK/HomeAssistantScheduleCard` as category **Dashboard**
4. Search for **Schedule Card** in HACS and install it
5. Add the card to your dashboard via the YAML editor

> Once the repository is submitted to the HACS default store, you'll be able to search for it directly without adding a custom repository.

### Manual

1. Copy `schedule-card.js` to your Home Assistant config directory:
   ```
   <config>/www/community/schedule-card/schedule-card.js
   ```
2. Go to **Settings → Dashboards → ⋮ → Resources**
3. Add resource:
   - **URL**: `/local/community/schedule-card/schedule-card.js`
   - **Type**: JavaScript Module
4. Refresh your browser

## Usage

Add to your dashboard via the YAML card editor.

### Single Entity (Simple)

```yaml
type: custom:schedule-card
entity: schedule.heating_weekday
title: "Heating Schedule"
```

### Multiple Entities (Advanced)

```yaml
type: custom:schedule-card
title: "Climate Schedules"
show_text: true  # Global default
entities:
  - entity: schedule.floor_heating
    name: "Floor (Solid)"
    color: "#03a9f4"
    group: 1        # Overlaps with Radiator
    opacity: 1.0    # Fully opaque
    show_text: false # Hide text for this one

  - entity: schedule.radiator
    name: "Radiator (Transparent)"
    color: "#ff9800"
    group: 1
    opacity: 0.6    # Semi-transparent

  - entity: schedule.water_heater
    name: "Hot Water"
    color: "#4caf50"
    group: 2        # Separate row

```

### Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `entities` | list | — | List of entity objects (see below) |
| `entity` | string | — | *Legacy* single entity ID |
| `title` | string | — | Card title |
| `show_text` | boolean | `true` | Global default for showing time labels |
| `card_size` | number | Auto | Override HA grid row count (tune if there's extra space or clipping) |

**Entity Object:**

| Option | Type | Default | Description |
|---|---|---|---|
| `entity` | string | **Required** | The `schedule.*` entity ID |
| `name` | string | Friendly name | Display name for the legend |
| `color` | string | Auto | CSS color (hex, rgb, etc.) for blocks/dot |
| `group` | number | `1` | Entities in the same group overlap. Different groups get separate rows per day. Max 5 distinct groups. |
| `opacity` | number | Auto | (0.0 – 1.0) Block transparency. Default: `0.6` (overlap), `0.75` (single). |
| `show_text`| boolean | Global | Override the global `show_text` setting for this entity. |

## Troubleshooting

- **"Entity not found"** — Verify the entity exists in Developer Tools → States
- **Schedule shows empty rows** — The entity's internal ID may differ (e.g. after renaming). The card resolves this automatically via the entity registry; if it still fails, check the browser console for the available IDs and ensure the entity is a `schedule.*` helper
- **Changes not showing** — Clear browser cache after updating the card file; also ensure the resource URL version is being loaded fresh
