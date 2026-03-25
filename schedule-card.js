/**
 * Schedule Card for Home Assistant
 *
 * A custom Lovelace card that visualizes schedule helper entities
 * as a weekly time grid with colored blocks.
 * Supports up to 3 schedules with grouping and per-entity colors.
 *
 * @version 2.3.0
 * Supports up to 25 schedules (5 groups × 5 per group).
 */

const DAYS_ORDERED = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS_IN_DAY = 24;
const MAX_ENTITIES = 25;  // Up to 5 groups × 5 per group
const DEFAULT_COLORS = ['#03a9f4', '#ff9800', '#4caf50', '#e91e63', '#9c27b0',
                        '#00bcd4', '#ff5722', '#8bc34a', '#ffc107', '#607d8b',
                        '#3f51b5', '#f44336', '#009688', '#ff9800', '#795548',
                        '#673ab7', '#cddc39', '#2196f3', '#e040fb', '#00e676',
                        '#ff1744', '#40c4ff', '#69f0ae', '#ffea00', '#ff6d00'];

// Map JS Date.getDay() (0=Sun) to our index (0=Mon)
const JS_DAY_TO_INDEX = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };

class ScheduleCard extends HTMLElement {

    static get properties() {
        return { hass: {}, config: {} };
    }

    // ── Config ──────────────────────────────────────────────

    setConfig(config) {
        // Normalize config: support both single `entity` and `entities` array
        let entities = [];
        if (config.entities && Array.isArray(config.entities)) {
            entities = config.entities.slice(0, MAX_ENTITIES);
        } else if (config.entity) {
            entities = [{ entity: config.entity }];
        } else {
            throw new Error('Please define entity or entities');
        }

        // Validate and enrich each entity config
        this._entities = entities.map((e, idx) => {
            const entityId = typeof e === 'string' ? e : e.entity;
            if (!entityId || !entityId.startsWith('schedule.')) {
                throw new Error(`Entity must be a schedule entity (schedule.*): ${entityId}`);
            }
            return {
                entity: entityId,
                color: (typeof e === 'object' && e.color) || DEFAULT_COLORS[idx] || DEFAULT_COLORS[0],
                name: (typeof e === 'object' && e.name) || null,  // resolved from hass later
                group: (typeof e === 'object' && e.group != null) ? e.group : 1,
                show_text: (typeof e === 'object' && e.show_text != null) ? e.show_text : null,
                opacity: (typeof e === 'object' && e.opacity != null) ? e.opacity : null,
            };
        });

        this._config = config;
        this._scheduleDataMap = {};
        this._dataFetched = false;
        // Track which entity IDs we have already fetched, to detect config changes
        this._fetchedEntityIds = null;
    }

    getCardSize() {
        if (this._config && this._config.card_size != null) {
            return this._config.card_size;
        }
        // Calibrated: N=1→5.25, N=2→8.4, N=3→11.6
        // Formula: 2.075 + (3.175 * N)
        const numGroups = [...new Set(this._entities.map(e => e.group))].length;
        return 2.075 + (3.175 * numGroups);
    }

    getGridOptions() {
        if (this._config && this._config.card_size != null) {
            const rows = this._config.card_size;
            return { rows, columns: 12, min_rows: rows, max_rows: rows };
        }
        const numGroups = [...new Set(this._entities.map(e => e.group))].length;
        const rows = 2.075 + (3.175 * numGroups);
        return { rows, columns: 12, min_rows: rows - 1, max_rows: rows + 2 };
    }

    // ── hass setter ─────────────────────────────────────────

    set hass(hass) {
        this._hass = hass;

        // Check all entities exist
        for (const ent of this._entities) {
            if (!hass.states[ent.entity]) {
                this._renderError(`Entity not found: ${ent.entity}`);
                return;
            }
        }

        // Fetch schedule data when entities change or first load
        const currentIds = this._entities.map(e => e.entity).sort().join(',');
        if (this._fetchedEntityIds !== currentIds) {
            this._fetchedEntityIds = currentIds;
            this._scheduleDataMap = {};
            this._fetchAllScheduleData();
        }

        this._render();
    }

    // ── Data fetching ───────────────────────────────────────

    async _fetchAllScheduleData() {
        try {
            const result = await this._hass.callWS({ type: 'schedule/list' });

            for (const ent of this._entities) {
                const scheduleId = ent.entity.replace('schedule.', '');

                // Fast path: match by derived ID (works when entity was never renamed)
                let item = result.find(s => s.id === scheduleId);

                if (!item) {
                    // Slow path: entity was renamed. The internal schedule ID is stored
                    // as the entity's unique_id in the entity registry — fetch it.
                    try {
                        const regEntry = await this._hass.callWS({
                            type: 'config/entity_registry/get',
                            entity_id: ent.entity,
                        });
                        if (regEntry && regEntry.unique_id) {
                            item = result.find(s => s.id === regEntry.unique_id);
                        }
                    } catch (regErr) {
                        console.warn(`Schedule Card: Could not query entity registry for ${ent.entity}`, regErr);
                    }
                }

                if (item) {
                    this._scheduleDataMap[ent.entity] = item;
                } else {
                    console.warn(`Schedule Card: No data found for ${ent.entity}. ` +
                        `Available IDs: ${result.map(s => s.id).join(', ')}`);
                    this._scheduleDataMap[ent.entity] = {};
                }
            }
            this._render();
        } catch (err) {
            console.error('Schedule Card: Failed to fetch schedule data', err);
            this._renderError('Failed to load schedule data');
        }
    }



    // ── Helpers ─────────────────────────────────────────────

    _timeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const parts = timeStr.split(':');
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (h === 24 && m === 0) return HOURS_IN_DAY * 60;
        return h * 60 + m;
    }

    _minutesToPercent(minutes) {
        return (minutes / (HOURS_IN_DAY * 60)) * 100;
    }

    _formatTime(timeStr) {
        if (!timeStr) return '';
        const parts = timeStr.split(':');
        return `${parts[0]}:${parts[1]}`;
    }

    _getTodayIndex() {
        return JS_DAY_TO_INDEX[new Date().getDay()];
    }

    _getCurrentTimePercent() {
        const now = new Date();
        return this._minutesToPercent(now.getHours() * 60 + now.getMinutes());
    }

    _getEntityName(entConfig) {
        if (entConfig.name) return entConfig.name;
        const stateObj = this._hass.states[entConfig.entity];
        return stateObj ? stateObj.attributes.friendly_name : entConfig.entity;
    }

    // ── Actions ──────────────────────────────────────────────

    _openMoreInfo(entityId) {
        const event = new CustomEvent('hass-more-info', {
            detail: { entityId },
            bubbles: true,
            composed: true,
        });
        this.dispatchEvent(event);
    }

    // ── Rendering ───────────────────────────────────────────

    _renderError(message) {
        if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = `
      <ha-card>
        <div style="padding: 16px; color: var(--error-color, #db4437);">
          <b>Schedule Card</b><br>${message}
        </div>
      </ha-card>
    `;
    }

    _render() {
        // Render even if some entities have no schedule data yet (show empty rows)
        const anyReady = Object.keys(this._scheduleDataMap).length > 0;
        if (!anyReady) return; // Still loading first entity

        if (!this.shadowRoot) this.attachShadow({ mode: 'open' });

        const globalShowText = this._config.show_text !== false;
        const todayIdx = this._getTodayIndex();
        const currentTimePercent = this._getCurrentTimePercent();
        const isMulti = this._entities.length > 1;

        // ── Build legend (only for multi-entity) ──
        let legendHtml = '';
        if (isMulti) {
            const items = this._entities.map(ent => {
                const name = this._getEntityName(ent);
                const stateObj = this._hass.states[ent.entity];
                const isOn = stateObj && stateObj.state === 'on';
                const stateLabel = isOn ? 'ON' : 'OFF';
                const stateClass = isOn ? 'legend-state-on' : 'legend-state-off';
                return `
          <div class="legend-item" data-entity="${ent.entity}">
            <span class="legend-dot" style="background: ${ent.color};"></span>
            <span class="legend-name">${name}</span>
            <span class="legend-state ${stateClass}">${stateLabel}</span>
          </div>`;
            }).join('');
            legendHtml = `<div class="legend">${items}</div>`;
        }

        // ── Group Map ──
        const groupMap = {};
        for (const ent of this._entities) {
            if (!groupMap[ent.group]) groupMap[ent.group] = [];
            groupMap[ent.group].push(ent);
        }
        const groupKeys = Object.keys(groupMap).sort((a, b) => a - b);

        // ── Build hour header (Common for all days) ──
        let hourMarksHtml = '';
        for (let h = 0; h <= HOURS_IN_DAY; h++) {
            const pct = this._minutesToPercent(h * 60);
            const showLabel = (h % 6 === 0);
            hourMarksHtml += `
        <div class="hour-mark ${h % 6 === 0 ? 'major' : ''}" style="left: ${pct}%;">
          ${showLabel ? `<span class="hour-label">${h}</span>` : ''}
        </div>`;
        }

        const hourHeader = `
      <div class="hour-header">
        <div class="day-label-spacer"></div>
        <div class="hour-marks-container">${hourMarksHtml}</div>
      </div>`;


        // ── Flattened Day Loop ──
        let daysHtml = '';

        for (let i = 0; i < DAYS_ORDERED.length; i++) {
            const dayKey = DAYS_ORDERED[i];
            const dayLabel = DAY_LABELS[i];
            const isToday = i === todayIdx;

            let dayRowsInnerHtml = '';

            // For each group, render a row within this day
            for (let gi = 0; gi < groupKeys.length; gi++) {
                const groupEnts = groupMap[groupKeys[gi]];
                const isFirstGroup = (gi === 0);

                // Render blocks for all entities in this group
                let blocksHtml = '';
                for (const ent of groupEnts) {
                    const data = this._scheduleDataMap[ent.entity];
                    const blocks = (data && data[dayKey]) || [];

                    const defaultOpacity = groupEnts.length > 1 ? 0.6 : 0.75;
                    const opacity = ent.opacity != null ? ent.opacity : defaultOpacity;
                    const entityShowText = ent.show_text != null ? ent.show_text : globalShowText;

                    for (const block of blocks) {
                        const startMin = this._timeToMinutes(block.from);
                        const endMin = this._timeToMinutes(block.to);
                        const leftPct = this._minutesToPercent(startMin);
                        const widthPct = this._minutesToPercent(endMin - startMin);
                        const fromLabel = this._formatTime(block.from);
                        const toLabel = this._formatTime(block.to);
                        const blockText = `${fromLabel} – ${toLabel}`;

                        blocksHtml += `
              <div class="block"
                   style="left: ${leftPct}%; width: ${widthPct}%; background: ${ent.color}; opacity: ${opacity};"
                   title="${this._getEntityName(ent)}: ${fromLabel} – ${toLabel}">
                   ${entityShowText ? `<span class="block-text">${blockText}</span>` : ''}
              </div>`;
                    }
                }

                // Current time indicator (only on today's row, for every group row)
                let timeIndicator = '';
                if (isToday) {
                    timeIndicator = `<div class="current-time" style="left: ${currentTimePercent}%;"></div>`;
                }

                dayRowsInnerHtml += `
            <div class="group-row ${isToday ? 'today-row' : ''}">
              <div class="day-label-cell">
                ${isFirstGroup ? `<span class="day-label-text ${isToday ? 'today-label' : ''}">${dayLabel}</span>` : ''}
              </div>
              <div class="timeline">
                ${blocksHtml}
                ${timeIndicator}
              </div>
            </div>`;
            }

            daysHtml += `
        <div class="day-container ${isToday ? 'today-container' : ''}">
          ${dayRowsInnerHtml}
        </div>`;
        }


        // ── Header ──
        const title = this._config.title
            || (isMulti ? 'Schedules' : this._getEntityName(this._entities[0]));

        // Single entity: show state badge
        let headerRight = '';
        if (!isMulti) {
            const stateObj = this._hass.states[this._entities[0].entity];
            const isOn = stateObj && stateObj.state === 'on';
            const stateColor = isOn
                ? 'var(--state-active-color, var(--primary-color, #03a9f4))'
                : 'var(--state-inactive-color, var(--disabled-text-color, #9e9e9e))';
            headerRight = `<div class="state-badge" style="background: ${stateColor};">${isOn ? 'ON' : 'OFF'}</div>`;
        }

        this.shadowRoot.innerHTML = `
      <style>${this._getStyles()}</style>
      <ha-card>
        <div class="card-header">
          <div class="header-left">
            <span class="title">${title}</span>
          </div>
          ${headerRight}
        </div>
        ${legendHtml}
        <div class="card-content">
          ${hourHeader}
          <div class="schedule-grid">
            ${daysHtml}
          </div>
        </div>
      </ha-card>
    `;

        // ── Click handlers ──
        if (isMulti) {
            this.shadowRoot.querySelectorAll('.legend-item').forEach(el => {
                el.onclick = (e) => {
                    e.stopPropagation();
                    this._openMoreInfo(el.dataset.entity);
                };
            });
        } else {
            const card = this.shadowRoot.querySelector('ha-card');
            if (card) card.onclick = () => this._openMoreInfo(this._entities[0].entity);
        }
    }

    // ── Styles ──────────────────────────────────────────────

    _getStyles() {
        return `
      :host {
        --schedule-grid-color: var(--divider-color, rgba(127,127,127,0.2));
        --schedule-today-bg: rgba(var(--rgb-primary-color, 3,169,244), 0.08); /* Slightly stronger for container */
        --schedule-row-height: 28px;
        --schedule-label-width: 40px;
      }

      ha-card {
        overflow: hidden;
        cursor: pointer;
      }

      .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px 4px 16px;
      }

      .header-left {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .title {
        font-size: var(--ha-font-size-l, 16px);
        font-weight: var(--ha-font-weight-medium, 500);
        color: var(--primary-text-color, #fff);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .state-badge {
        flex-shrink: 0;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.5px;
        color: #fff;
        padding: 2px 8px;
        border-radius: 10px;
        text-transform: uppercase;
      }

      /* ── Legend ──────────────────────────── */

      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 14px;
        padding: 4px 16px 2px 16px;
      }

      .legend-item {
        display: flex;
        align-items: center;
        gap: 5px;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 4px;
        transition: background 0.15s;
      }

      .legend-item:hover {
        background: var(--divider-color, rgba(127,127,127,0.15));
      }

      .legend-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .legend-name {
        font-size: 11px;
        font-weight: 500;
        color: var(--primary-text-color, #fff);
      }

      .legend-state {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.3px;
        text-transform: uppercase;
      }

      .legend-state-on {
        color: var(--state-active-color, var(--primary-color, #03a9f4));
      }

      .legend-state-off {
        color: var(--disabled-text-color, #9e9e9e);
      }

      /* ── Card content ──────────────────────── */

      .card-content {
        padding: 4px 16px 14px 16px;
      }

      /* ── Hour header ──────────────────────── */

      .hour-header {
        display: flex;
        align-items: flex-end;
        height: 18px;
        margin-bottom: 2px;
      }

      .day-label-spacer {
        flex: 0 0 var(--schedule-label-width);
      }

      .hour-marks-container {
        position: relative;
        flex: 1;
        height: 100%;
      }

      .hour-mark {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 0;
        border-left: 1px solid transparent;
      }

      .hour-label {
        position: absolute;
        bottom: 0;
        left: 0;
        transform: translateX(-50%);
        font-size: 10px;
        color: var(--secondary-text-color, #999);
        font-variant-numeric: tabular-nums;
      }

      /* ── Flattened Grid Layout ──────────────── */

      .schedule-grid {
        display: flex;
        flex-direction: column;
        gap: 4px; /* Gap between Days */
      }

      .day-container {
        display: flex;
        flex-direction: column;
        gap: 1px; /* Gap between Groups within a day */
        border-radius: 4px;
        overflow: hidden; /* For container background/radius */
      }

      .day-container.today-container {
         background: var(--schedule-today-bg);
      }

      .group-row {
        display: flex;
        align-items: center;
        height: var(--schedule-row-height);
        /* No individual BG or Radius needed for rows inside container, 
           unless we want zebra striping for groups, but clean is better */
      }

      .day-label-cell {
        flex: 0 0 var(--schedule-label-width);
        display: flex;
        align-items: center;
        padding-left: 2px;
      }

      .day-label-text {
        font-size: 11px;
        font-weight: 600;
        color: var(--primary-text-color, #fff);
        text-transform: uppercase;
        user-select: none;
      }

      .day-label-text.today-label {
        color: var(--primary-color, #03a9f4);
      }

      /* ── Timeline ─────────────────────────── */

      .timeline {
        position: relative;
        flex: 1;
        height: 100%;
        background: var(--schedule-grid-color); /* Grid BG per row */
        border-radius: 2px;
        overflow: hidden;
      }

      .timeline::before {
        content: '';
        position: absolute;
        inset: 0;
        /* 1px line at start of each tile, tile = 1/24 of width = 1 hour */
        background-image: linear-gradient(
          to right,
          var(--card-background-color, rgba(0,0,0,0.25)) 0px,
          var(--card-background-color, rgba(0,0,0,0.25)) 1px,
          transparent 1px
        );
        background-size: calc(100% / 24) 100%;
        background-repeat: repeat-x;
        pointer-events: none;
        z-index: 1;
        opacity: 0.7;
      }

      .timeline::after {
        content: '';
        position: absolute;
        inset: 0;
        /* Stronger line every 6 hours (4 divisions) */
        background-image: linear-gradient(
          to right,
          var(--primary-text-color, rgba(255,255,255,0.2)) 0px,
          var(--primary-text-color, rgba(255,255,255,0.2)) 1px,
          transparent 1px
        );
        background-size: calc(100% / 4) 100%;
        background-repeat: repeat-x;
        pointer-events: none;
        z-index: 1;
        opacity: 0.25;
      }



      .block {
        position: absolute;
        top: 3px;
        bottom: 3px;
        border-radius: 3px;
        z-index: 2;
        transition: opacity 0.15s;
        cursor: default;
      }

      .block-text {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 10px;
        font-weight: 600;
        color: #fff;
        white-space: nowrap;
        letter-spacing: 0.2px;
        background: rgba(0, 0, 0, 0.5);
        padding: 1px 4px;
        border-radius: 3px;
        pointer-events: none;
        z-index: 3;
      }

      .block:hover {
        opacity: 1 !important;
      }

      /* ── Current time indicator ───────────── */

      .current-time {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 2px;
        background: var(--error-color, #ef5350);
        z-index: 4;
        border-radius: 1px;
        box-shadow: 0 0 4px rgba(239, 83, 80, 0.5);
      }


    `;
    }
}

// ── Register card ───────────────────────────────────────

customElements.define('schedule-card', ScheduleCard);

window.customCards = window.customCards || [];
window.customCards.push({
    type: 'schedule-card',
    name: 'Schedule Card',
    description: 'Displays schedule helpers as a weekly time grid (up to 5 groups × 5 per group)',
    preview: true,
});

console.info(
    '%c SCHEDULE-CARD %c v2.3.0 ',
    'color: white; background: #03a9f4; font-weight: 700; padding: 2px 6px; border-radius: 4px 0 0 4px;',
    'color: #03a9f4; background: #e3f2fd; font-weight: 700; padding: 2px 6px; border-radius: 0 4px 4px 0;'
);
