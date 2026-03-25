# Schedule Card for Home Assistant

A custom Lovelace card that visualizes Home Assistant **schedule helper** entities as a weekly time grid.

![Schedule Card](https://img.shields.io/badge/HA-Custom%20Card-03a9f4?style=flat-square)

## Features

- **Multi-schedule support** — Display up to 25 schedules (5 groups × 5 per group)
- **Grouping** — Same group = overlapping rows, different group = separate row per day (Mon G1 / Mon G2 / Tue G1 / Tue G2...)
- **Weekly grid view** — All 7 days at a glance with hour gridlines
- **Colored time blocks** — Custom colors for each schedule
- **Current time indicator** — Red line on today's row
- **Interactive** — Click entity names/dots (in multi-mode) or the card (in single-mode) to open the native more-info dialog
- **Theme aware** — Uses HA CSS variables
- **Zero dependencies** — Single JS file

## Installation

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
