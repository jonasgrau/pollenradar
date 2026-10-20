// HTML building blocks for the panel

import { GENERA, HERBS, MONTHS, POLLEN, SEASON } from "./config.js";
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
    case "grass": {
      const p = (x, y) => `${f((x * size) / 16)} ${f((y * size) / 16)}`;
      return `M${p(2.5, 14)}Q${p(3, 8)} ${p(1, 3)}Q${p(5.5, 7)} ${p(5.5, 14)}Z`
        + `M${p(6.5, 14)}Q${p(6.5, 6)} ${p(8, 1)}Q${p(9.5, 6)} ${p(9.5, 14)}Z`
        + `M${p(10.5, 14)}Q${p(10.5, 7)} ${p(15, 3)}Q${p(13, 8)} ${p(13.5, 14)}Z`;
    }
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
const MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

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
  const subject = names.length > 1 ? `${names.slice(0, -1).join(", ")} und ${names.at(-1)} blühen` : `${names[0]} ${genera[0].plural ? "blühen" : "blüht"}`;
  return `${subject} meist ab ${MONTH_NAMES[month]}, ${untilText(days)}.`;
}

export function heroContent(forecast, selected, pollenError, loading = false) {
  const chosen = POLLEN.filter((g) => selected.has(g.id));
  if (loading) return { title: "Pollenflug heute", step: 0, color: null, text: "Vorhersage wird geladen …" };
  if (pollenError) {
    return { title: "Vorhersage nicht erreichbar", step: 0, color: null, text: "Die Bäume auf der Karte sind trotzdem da. Lade die Seite in ein paar Minuten neu." };
  }
  if (!chosen.length) return { title: "Wähle deine Allergien", step: 0, color: null, text: "Dann zeigen wir, was heute fliegt." };

  const top = chosen
    .map((g) => ({ g, level: levelOf(forecast[0], g) }))
    .sort((a, b) => (b.level?.step ?? -1) - (a.level?.step ?? -1))[0];
  const quiet = !top.level || top.level.step === 0;
  const season = quiet && nextSeason(chosen, forecast[0].date);
  if (season) return { title: "Pollenpause", step: 0, color: null, text: seasonText(season) };
  if (!forecast[0].levels) return { title: "Noch keine Vorhersage für heute", step: 0, color: null, text: "Der DWD aktualisiert täglich gegen 11 Uhr." };
  if (quiet) return { title: "Kein Pollenflug", step: 0, color: null, text: "Für deine Auswahl meldet der DWD heute keine Pollen." };
  const later = [1, 2]
    .map((i) => levelOf(forecast[i], top.g))
    .map((l, i) => `${DAY_LABELS[i + 1].toLowerCase()} ${l ? l.label : "keine Angabe"}`)
    .join(", ");
  return {
    title: `${top.g.name}: ${top.level.label}`,
    name: top.g.name,
    level: top.level.label,
    step: top.level.step,
    color: top.g.color,
    text: `${later[0].toUpperCase()}${later.slice(1)}.`,
  };
}

// Other chosen pollen in the air today, e.g. "Dazu Esche gering bis mittel."
export function alsoText(forecast, selected) {
  const flying = POLLEN.filter((g) => selected.has(g.id))
    .map((g) => ({ g, level: levelOf(forecast[0], g) }))
    .filter((x) => (x.level?.step ?? 0) > 0)
    .sort((a, b) => b.level.step - a.level.step)
    .slice(1);
  return flying.length ? `Dazu ${flying.map((x) => `${x.g.name} ${x.level.label}`).join(", ")}.` : "";
}

// Pollen clock: one ring per chosen pollen type with its flowering months, a hand on today.
// After the phenological clock of the DWD.
const CLOCK_OUTER = 88;
const clockPoint = (r, deg) => {
  const t = ((deg - 90) * Math.PI) / 180;
  return [r * Math.cos(t), r * Math.sin(t)];
};
const n2 = (n) => n.toFixed(2);
function clockArc(r, a0, a1) {
  const [x0, y0] = clockPoint(r, a0);
  const [x1, y1] = clockPoint(r, a1);
  return `M${n2(x0)} ${n2(y0)}A${r} ${r} 0 0 1 ${n2(x1)} ${n2(y1)}`;
}

// Position of a date on the year ring, 0° = 1 January at the top, clockwise
export function dayAngle(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const start = Date.UTC(y, 0, 1);
  const length = (Date.UTC(y + 1, 0, 1) - start) / 86_400_000;
  return ((Date.UTC(y, m - 1, d) - start) / 86_400_000 / length) * 360;
}

export function clockSvg(selected, date) {
  const chosen = POLLEN.filter((g) => selected.has(g.id));
  const n = chosen.length;
  const width = n <= 2 ? 11 : n <= 4 ? 8 : 5.5;
  const gap = n <= 4 ? 3 : 2;
  const rings = chosen.map((g, i) => {
    const r = CLOCK_OUTER - width / 2 - i * (width + gap);
    return SEASON[g.id].map((v, m) => {
      const paint = v ? `stroke="${g.color}" stroke-opacity="${v === 2 ? 1 : 0.38}"` : `class="track"`;
      return `<path d="${clockArc(r, m * 30 + 1.2, (m + 1) * 30 - 1.2)}" stroke-width="${width}" fill="none" ${paint}/>`;
    }).join("");
  });
  const inner = CLOCK_OUTER - n * (width + gap);
  const face = inner > 34 && date;
  const ticks = Array.from({ length: 12 }, (_, m) => {
    const [x1, y1] = clockPoint(CLOCK_OUTER + 3, m * 30);
    const [x2, y2] = clockPoint(CLOCK_OUTER + (m % 3 ? 6 : 9), m * 30);
    return `<path class="tick" d="M${n2(x1)} ${n2(y1)}L${n2(x2)} ${n2(y2)}"/>`;
  });
  const seasons = chosen.map((g) => {
    const months = SEASON[g.id].map((v, i) => (v ? MONTH_NAMES[i] : null)).filter(Boolean);
    return `${g.name} von ${months[0]} bis ${months.at(-1)}`;
  });
  const label = seasons.length ? `Blühzeiten im Jahreslauf: ${seasons.join(", ")}. Der Zeiger steht auf heute.` : "Jahreslauf, keine Pollenart gewählt.";
  const hand = date
    ? `<g class="hand" style="--angle:${n2(dayAngle(date))}deg"><path d="M0 ${-(face ? inner - 3 : 0)}L0 ${-(CLOCK_OUTER + 9)}"/><circle cy="${-(CLOCK_OUTER + 9)}" r="3.2"/></g>`
    : "";
  return `<svg class="clock" viewBox="-100 -100 200 200" role="img" aria-label="${label}">
    ${ticks.join("")}${rings.join("")}
    ${face ? `<text class="face-day" y="6">${Number(date.slice(8, 10))}</text><text class="face-month" y="24">${MONTHS[Number(date.slice(5, 7)) - 1]}</text>` : ""}
    ${hand}${!face && date ? `<circle class="hub" r="4"/>` : ""}
  </svg>`;
}

// The pressed state (and the white icon that goes with it) is set by aria-pressed and CSS,
// so toggling a chip never rebuilds the row: focus and scroll position stay put.
function chipHtml(g, selected) {
  return `<button class="chip" type="button" data-id="${g.id}" aria-pressed="${selected.has(g.id)}">${shapeIcon(g)}${g.name}</button>`;
}

export function chipsHtml(selected) {
  const trees = GENERA.map((g) => chipHtml(g, selected)).join("");
  const herbs = HERBS.map((g) => chipHtml(g, selected)).join("");
  return `<span class="chips-label">Bäume, auch auf der Karte</span>${trees}<span class="chips-label">Gräser und Kräuter, nur Vorhersage</span>${herbs}`;
}

export function forecastHtml(forecast, selected) {
  const chosen = POLLEN.filter((g) => selected.has(g.id));
  if (!chosen.length) return `<p class="hint">Wähle oben, worauf du reagierst.</p>`;
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

// Plural names for sentences like "102 Birken und 1 Esche"
const PLURAL = { birke: "Birken", erle: "Erlen", hasel: "Haseln", esche: "Eschen" };
export const countName = (g, n) => (n === 1 ? g.name : PLURAL[g.id] || g.name);

function joinAnd(parts) {
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} und ${parts.at(-1)}` : parts[0];
}

// e.g. "Im Umkreis von 250 m um deinen Standort stehen 102 Birken und 1 Esche."
export function aroundHtml(spot, result, selected, radius) {
  const chosen = GENERA.filter((g) => selected.has(g.id));
  if (!chosen.length) return `<p class="hint">Wähle oben eine Baumart, um die Bäume in der Nähe zu zählen.</p>`;
  const tally = chosen.map((g) => {
    const n = result.counts[g.id] ?? 0;
    return `<span class="tally">${shapeIcon(g)}<b>${n}</b> ${countName(g, n)}</span>`;
  });
  const nearest = result.nearest && result.nearest.dist < 1000
    ? ` Der nächste ist eine ${esc(result.nearest.art)}, ${Math.round(result.nearest.dist)} m entfernt.`
    : "";
  return `<p class="around-text">Im Umkreis von ${radius} m um ${esc(spot.phrase)} stehen ${joinAnd(tally)}.${nearest}</p>`;
}

// Short line for the collapsed phone sheet, e.g. "Dein Standort: 102 Birken, 1 Esche"
export function spotSummaryHtml(spot, result, selected) {
  const chosen = GENERA.filter((g) => selected.has(g.id));
  if (!chosen.length) return "";
  const parts = chosen.map((g) => {
    const n = result.counts[g.id] ?? 0;
    return `<span>${shapeIcon(g, g.color, 12)}<b>${n}</b> ${countName(g, n)}</span>`;
  });
  return `<span>${esc(spot.name)}:</span>${parts.join("")}`;
}

// "2026-10-20 11:00 Uhr" -> "heute, 11 Uhr", "gestern, 11 Uhr" or "Montag, 19. Oktober, 11 Uhr"
export function updatedText(updated, today) {
  const m = /^(\d{4}-\d{2}-\d{2})\D+(\d{1,2}):(\d{2})/.exec(updated || "");
  if (!m) return updated || "";
  const hour = m[3] === "00" ? `${Number(m[2])} Uhr` : `${Number(m[2])}.${m[3]} Uhr`;
  const shift = (iso, n) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  if (m[1] === today) return `heute, ${hour}`;
  if (m[1] === shift(today, -1)) return `gestern, ${hour}`;
  const day = new Date(`${m[1]}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return `${day}, ${hour}`;
}
