// HTML building blocks for the panel

import { GENERA, MONTHS, SEASON } from "./config.js";
import { levelOf, nextSeason } from "./data.js";

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// SVG path of a genus shape in a size × size box (used for SVG and canvas)
export function shapePath(shape, size) {
  const m = size / 2;
  const r = size * 0.32;
  const f = (n) => n.toFixed(2);
  switch (shape) {
    case "square":
      return `M${f(m - r * 0.88)} ${f(m - r * 0.88)}h${f(r * 1.76)}v${f(r * 1.76)}h${f(-r * 1.76)}Z`;
    case "triangle":
      return `M${f(m)} ${f(m - r * 1.1)}L${f(m + r * 1.05)} ${f(m + r * 0.75)}L${f(m - r * 1.05)} ${f(m + r * 0.75)}Z`;
    case "diamond":
      return `M${f(m)} ${f(m - r * 1.15)}L${f(m + r)} ${f(m)}L${f(m)} ${f(m + r * 1.15)}L${f(m - r)} ${f(m)}Z`;
    default:
      return `M${f(m - r)} ${f(m)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
  }
}

export function shapeIcon(genus, color = genus.color, size = 16) {
  return `<svg class="shape" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><path fill="${color}" d="${shapePath(genus.shape, size)}"/></svg>`;
}

export function meter(step, color) {
  return `<span class="meter" aria-hidden="true">${Array.from({ length: 6 }, (_, i) =>
    `<i${i < step ? ` style="background:${color}"` : ""}></i>`).join("")}</span>`;
}

const DAY_LABELS = ["Heute", "Morgen", "Übermorgen"];
const MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni"];

// "in 5 Tagen", "in rund 3 Wochen", "in rund 3 Monaten"
export function untilText(days) {
  if (days <= 1) return days === 1 ? "morgen" : "heute";
  if (days < 14) return `in ${days} Tagen`;
  if (days < 60) return `in rund ${Math.round(days / 7)} Wochen`;
  return `in rund ${Math.round(days / 30.4)} Monaten`;
}

// e.g. "Hasel und Erle blühen meist ab Januar, in rund 3 Monaten."
export function seasonText({ genera, month, days }) {
  const names = genera.map((g) => g.name);
  const subject = names.length > 1 ? `${names.slice(0, -1).join(", ")} und ${names.at(-1)} blühen` : `${names[0]} blüht`;
  return `${subject} meist ab ${MONTH_NAMES[month]}, ${untilText(days)}.`;
}

export function heroContent(forecast, selected, pollenError) {
  const chosen = GENERA.filter((g) => selected.has(g.id));
  if (pollenError) {
    return { title: "Vorhersage nicht erreichbar", step: 0, color: null, text: "Die Bäume auf der Karte sind trotzdem da. Wir versuchen es gleich erneut." };
  }
  if (!chosen.length) return { title: "Wähle deine Allergien", step: 0, color: null, text: "Dann zeigen wir, was heute fliegt." };

  const top = chosen
    .map((g) => ({ g, level: levelOf(forecast[0], g) }))
    .sort((a, b) => (b.level?.step ?? -1) - (a.level?.step ?? -1))[0];
  const quiet = !top.level || top.level.step === 0;
  const season = quiet && nextSeason(chosen, forecast[0].date);
  if (season) return { title: "Pollenpause", step: 0, color: null, text: seasonText(season) };
  if (!forecast[0].levels) return { title: "Noch keine Vorhersage für heute", step: 0, color: null, text: "Der DWD aktualisiert täglich gegen 11 Uhr." };
  if (quiet) return { title: "Keine Baumpollen", step: 0, color: null, text: "Für deine Auswahl meldet der DWD heute keinen Pollenflug." };
  const later = [1, 2]
    .map((i) => levelOf(forecast[i], top.g))
    .map((l, i) => `${DAY_LABELS[i + 1].toLowerCase()} ${l ? l.label : "keine Angabe"}`)
    .join(", ");
  return { title: `${top.g.name}: ${top.level.label}`, step: top.level.step, color: top.g.color, text: `${later[0].toUpperCase()}${later.slice(1)}.` };
}

export function chipsHtml(selected) {
  return GENERA.map((g) => {
    const on = selected.has(g.id);
    return `<button class="chip" type="button" data-id="${g.id}" aria-pressed="${on}">${shapeIcon(g, on ? "#fff" : g.color)}${g.name}</button>`;
  }).join("");
}

export function forecastHtml(forecast, selected) {
  const chosen = GENERA.filter((g) => selected.has(g.id));
  if (!chosen.length) return `<p class="hint">Keine Allergie gewählt.</p>`;
  const head = `<span></span>${DAY_LABELS.map((d) => `<span class="head">${d}</span>`).join("")}`;
  const rows = chosen.map((g) => {
    const cells = forecast.map((day) => {
      const level = levelOf(day, g);
      return `<div>${meter(level?.step ?? 0, g.color)}<small>${level ? level.label : "keine Angabe"}</small></div>`;
    });
    return `<span class="gen">${shapeIcon(g)}${g.name}</span>${cells.join("")}`;
  });
  return `<div class="days">${head}${rows.join("")}</div>`;
}

export function aroundHtml(spot, result, selected, radius) {
  const chosen = GENERA.filter((g) => selected.has(g.id));
  if (!chosen.length) return `<p class="hint">Wähle oben eine Allergie, um die Bäume zu zählen.</p>`;
  const stats = chosen
    .map((g) => `<div class="stat"><b>${result.counts[g.id] ?? 0}</b><span>${shapeIcon(g)}${g.name}</span></div>`)
    .join("");
  const nearest = result.nearest && result.nearest.dist < 1000
    ? `<p class="meta">Nächster Baum: ${esc(result.nearest.art)}, ${Math.round(result.nearest.dist)} m entfernt</p>`
    : "";
  return `<p class="hint">${esc(spot.name)} · Umkreis ${radius} m</p><div class="stats">${stats}</div>${nearest}`;
}

// Short line for the collapsed phone sheet, e.g. "Birkengrund: 102 Birken · 1 Esche"
export function spotSummaryHtml(spot, result, selected) {
  const chosen = GENERA.filter((g) => selected.has(g.id));
  if (!chosen.length) return "";
  const parts = chosen.map((g) => `<span>${shapeIcon(g, g.color, 12)}<b>${result.counts[g.id] ?? 0}</b> ${g.name}</span>`);
  return `<span>${esc(spot.name)}:</span>${parts.join("")}`;
}

export function calendarHtml() {
  const head = `<span></span>${MONTHS.map((m) => `<span class="m">${m}</span>`).join("")}`;
  const rows = GENERA.map((g) => `<span class="gen">${shapeIcon(g)}${g.name}</span>${SEASON[g.id]
    .map((v, i) => `<i title="${MONTHS[i]}: ${["keine Blüte", "Blüte möglich", "Hauptblüte"][v]}"${v ? ` style="background:${g.color};opacity:${v === 2 ? 1 : 0.45}"` : ""}></i>`)
    .join("")}`);
  return head + rows.join("");
}
