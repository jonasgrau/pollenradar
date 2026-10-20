// Draft A: today's pollen as grains in a microscope field of view.
// The number of grains follows the DWD level, the shapes follow the real pollen morphology.

import { startDraft } from "./shared.js";

const COUNT = [0, 2, 4, 6, 9, 13, 18]; // grains per DWD step
const MAX_GRAINS = 22;
const FIELD = 58; // usable radius inside the lens (viewBox units)
const SIZE = { birke: 8.5, hasel: 9, erle: 9, esche: 8.5, graeser: 10, roggen: 12, beifuss: 8, ambrosia: 8.5 };

function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

const f = (n) => n.toFixed(2);
const at = (r, t) => [r * Math.cos(t), r * Math.sin(t)];
const angles = (n, start = -Math.PI / 2) => Array.from({ length: n }, (_, i) => start + (i / n) * 2 * Math.PI);
function outline(radius, steps = 72) {
  const pts = Array.from({ length: steps }, (_, i) => {
    const t = (i / steps) * 2 * Math.PI;
    const [x, y] = at(radius(t), t);
    return `${f(x)} ${f(y)}`;
  });
  return `<path class="wall" d="M${pts.join("L")}Z"/>`;
}
const pore = (x, y, r) => `<circle class="pore" cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/>`;
const line = (r1, r2, t) => {
  const [x1, y1] = at(r1, t);
  const [x2, y2] = at(r2, t);
  return `<path class="furrow" d="M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}"/>`;
};

// Simplified polar views of the eight pollen types the DWD forecasts
export function grain(id, r) {
  switch (id) {
    case "birke": // triporate, pores sit on small bulges
      return outline((t) => r * (0.84 + 0.2 * Math.max(0, Math.cos(3 * (t + Math.PI / 2))) ** 3))
        + angles(3).map((t) => pore(...at(r * 0.9, t), r * 0.13)).join("");
    case "hasel": // triporate, rounder, pores not protruding
      return outline((t) => r * (0.94 + 0.05 * Math.cos(3 * (t + Math.PI / 2))))
        + angles(3).map((t) => pore(...at(r * 0.78, t), r * 0.1)).join("");
    case "erle": { // five pores joined by arcs (arci)
      const ps = angles(5).map((t) => at(r * 0.86, t));
      const arcs = ps.map(([x1, y1], i) => {
        const [x2, y2] = ps[(i + 1) % 5];
        const [cx, cy] = at(r * 0.5, angles(5)[i] + Math.PI / 5);
        return `<path class="furrow" d="M${f(x1)} ${f(y1)}Q${f(cx)} ${f(cy)} ${f(x2)} ${f(y2)}"/>`;
      });
      return outline((t) => r * (0.88 + 0.09 * Math.max(0, Math.cos(5 * (t + Math.PI / 2))) ** 2)) + arcs.join("")
        + ps.map(([x, y]) => pore(x, y, r * 0.11)).join("");
    }
    case "esche": { // three furrows, net-like surface
      const net = [];
      for (let x = -0.6; x <= 0.61; x += 0.3) for (let y = -0.6; y <= 0.61; y += 0.3) if (x * x + y * y < 0.42) net.push(`<circle class="net" cx="${f(x * r)}" cy="${f(y * r)}" r="${f(r * 0.06)}"/>`);
      return outline((t) => r * (0.92 + 0.06 * Math.cos(4 * t))) + net.join("") + angles(3, -Math.PI / 6).map((t) => line(r * 0.9, r * 0.45, t)).join("");
    }
    case "graeser": { // one pore with a ring (annulus)
      const [x, y] = at(r * 0.62, -0.7);
      return outline(() => r * 0.95) + `<circle class="ring" cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.2)}"/>` + pore(x, y, r * 0.08);
    }
    case "roggen": { // like grass, larger and oval
      const a = 1.12, b = 0.8;
      const [x, y] = [r * 0.72, 0];
      return outline((t) => r / Math.sqrt((Math.cos(t) / a) ** 2 + (Math.sin(t) / b) ** 2)) + `<circle class="ring" cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.18)}"/>` + pore(x, y, r * 0.07);
    }
    case "beifuss": // three furrows, each with a pore
      return outline(() => r * 0.9) + angles(3).map((t) => line(r * 0.88, r * 0.48, t) + pore(...at(r * 0.68, t), r * 0.09)).join("");
    case "ambrosia": { // spiny
      const spines = angles(16).map((t) => {
        const [x1, y1] = at(r * 0.7, t - 0.12);
        const [x2, y2] = at(r * 0.7, t + 0.12);
        const [x3, y3] = at(r, t);
        return `<path class="pore" d="M${f(x1)} ${f(y1)}L${f(x3)} ${f(y3)}L${f(x2)} ${f(y2)}Z"/>`;
      });
      return spines.join("") + outline(() => r * 0.72);
    }
    default:
      return outline(() => r);
  }
}

// Places the grains of all flying chosen pollen without overlap, the same way every time for one day
function placeGrains(ranked, date) {
  const flying = ranked.filter((x) => (x.level?.step ?? 0) > 0);
  let wanted = flying.map((x) => ({ id: x.g.id, n: COUNT[x.level.step] }));
  const total = wanted.reduce((s, w) => s + w.n, 0);
  if (total > MAX_GRAINS) wanted = wanted.map((w) => ({ ...w, n: Math.max(1, Math.round((w.n * MAX_GRAINS) / total)) }));
  const rand = random(hash(date + wanted.map((w) => w.id).join()));
  // Shrink all grains when the field gets crowded, so every type finds room (about 40 % coverage)
  const area = wanted.reduce((sum, w) => sum + w.n * Math.PI * (1.06 * SIZE[w.id]) ** 2, 0);
  const scale = Math.min(1, Math.sqrt((0.4 * Math.PI * FIELD ** 2) / area));
  const placed = [];
  for (const w of [...wanted].sort((a, b) => SIZE[b.id] - SIZE[a.id])) { // big grains first
    const r = SIZE[w.id] * scale;
    for (let i = 0; i < w.n; i++) {
      for (let tries = 0; tries < 300; tries++) {
        const d = Math.sqrt(rand()) * (FIELD - r);
        const t = rand() * 2 * Math.PI;
        const [x, y] = at(d, t);
        if (placed.every((p) => Math.hypot(p.x - x, p.y - y) > (p.r + r) * 1.06)) {
          placed.push({ id: w.id, x, y, r, rot: rand() * 360 });
          break;
        }
      }
    }
  }
  return placed;
}

function fieldSvg(model) {
  const grains = model.kind === "flying" ? placeGrains(model.ranked, model.date) : [];
  const counts = {};
  for (const g of grains) counts[g.id] = (counts[g.id] || 0) + 1;
  const names = model.ranked.filter((x) => counts[x.g.id]).map((x) => `${counts[x.g.id]} ${x.g.name}`);
  const label = grains.length ? `Sichtfeld mit ${grains.length} Pollenkörnern: ${names.join(", ")}` : "Leeres Sichtfeld, keine Pollen";
  return `<svg class="field" viewBox="-64 -64 128 128" role="img" aria-label="${label}">
    <defs>
      <radialGradient id="lens" cx="45%" cy="40%" r="65%">
        <stop offset="0" stop-color="#fbfcfd"/><stop offset="0.72" stop-color="#f1f5f6"/><stop offset="1" stop-color="#d9e1e5"/>
      </radialGradient>
      <clipPath id="lens-clip"><circle r="61"/></clipPath>
    </defs>
    <circle r="62" fill="url(#lens)" class="lens"/>
    <g clip-path="url(#lens-clip)"><g class="grains">${grains
      .map((g) => `<g transform="translate(${f(g.x)} ${f(g.y)}) rotate(${f(g.rot)})">${grain(g.id, g.r)}</g>`)
      .join("")}</g></g>
  </svg>`;
}

function renderHero(el, model, { first }) {
  const flying = model.kind === "flying";
  const others = flying ? model.ranked.slice(1).filter((x) => (x.level?.step ?? 0) > 0) : [];
  const name = flying ? model.top.g.name : model.title;
  const level = flying ? model.top.level.label : "";
  el.innerHTML = `
    <div class="sight${first && flying ? " focus-in" : ""}">${fieldSvg(model)}</div>
    <div class="hero-copy">
      <h1>${name}</h1>
      ${level ? `<p class="level">${level}</p>` : ""}
      <p class="hero-text">${model.text}</p>
      ${others.length ? `<p class="also">Dazu ${others.map((x) => `${x.g.name} ${x.level.label}`).join(", ")}.</p>` : ""}
    </div>`;
}

startDraft({ renderHero });
