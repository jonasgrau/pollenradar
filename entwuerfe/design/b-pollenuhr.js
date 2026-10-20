// Draft B: a year ring after the DWD's phenological clock. One ring per chosen pollen type,
// its flowering months in the type's colour, a hand pointing at today.

import { MONTHS, POLLEN, SEASON, startDraft } from "./shared.js";

const OUTER = 88;
const f = (n) => n.toFixed(2);
const point = (r, deg) => {
  const t = ((deg - 90) * Math.PI) / 180;
  return [r * Math.cos(t), r * Math.sin(t)];
};
function arc(r, a0, a1) {
  const [x0, y0] = point(r, a0);
  const [x1, y1] = point(r, a1);
  return `M${f(x0)} ${f(y0)}A${r} ${r} 0 0 1 ${f(x1)} ${f(y1)}`;
}

function dayAngle(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const days = (Date.UTC(d.getUTCFullYear() + 1, 0, 1) - start) / 86_400_000;
  return (((d - start) / 86_400_000) / days) * 360;
}

function clockSvg(model) {
  const chosen = model.chosen.length ? model.chosen : POLLEN.filter((g) => g.id === "birke");
  const n = chosen.length;
  const width = n <= 2 ? 11 : n <= 4 ? 8 : 5.5;
  const gap = n <= 4 ? 3 : 2;
  const rings = chosen.map((g, i) => {
    const r = OUTER - width / 2 - i * (width + gap);
    const months = SEASON[g.id].map((v, m) => {
      const style = v ? `stroke="${g.color}" stroke-opacity="${v === 2 ? 1 : 0.38}"` : `class="track"`;
      return `<path d="${arc(r, m * 30 + 1.2, (m + 1) * 30 - 1.2)}" stroke-width="${width}" fill="none" ${style}/>`;
    });
    return months.join("");
  });
  const inner = OUTER - n * (width + gap);
  const day = model.date ? Number(model.date.slice(8, 10)) : "";
  const month = model.date ? MONTHS[Number(model.date.slice(5, 7)) - 1] : "";
  const face = inner > 34 && model.date
    ? `<text class="face-day" y="6">${day}</text><text class="face-month" y="24">${month}</text>`
    : "";
  const angle = model.date ? dayAngle(model.date) : 0;
  const seasons = chosen.map((g) => {
    const months = SEASON[g.id].map((v, i) => (v ? MONTHS[i] : null)).filter(Boolean);
    return `${g.name} ${months[0]} bis ${months.at(-1)}`;
  });
  return `<svg class="clock" viewBox="-100 -100 200 200" role="img" aria-label="Blühzeiten im Jahreslauf: ${seasons.join(", ")}. Der Zeiger steht auf heute.">
    ${Array.from({ length: 12 }, (_, m) => {
      const [x1, y1] = point(OUTER + 3, m * 30);
      const [x2, y2] = point(OUTER + (m % 3 ? 6 : 9), m * 30);
      return `<path class="tick" d="M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}"/>`;
    }).join("")}
    ${rings.join("")}
    ${face}
    <g class="hand" style="--angle:${f(angle)}deg">
      <path d="M0 ${-(face ? inner - 3 : 0)}L0 ${-(OUTER + 9)}"/>
      <circle cy="${-(OUTER + 9)}" r="3.2"/>
    </g>
    <circle class="hub" r="${inner > 34 ? 0 : 4}"/>
  </svg>`;
}

function renderHero(el, model, { first }) {
  const flying = model.kind === "flying";
  const name = flying ? model.top.g.name : model.title;
  const level = flying ? model.top.level.label : "";
  const others = flying ? model.ranked.slice(1).filter((x) => (x.level?.step ?? 0) > 0) : [];
  el.innerHTML = `
    <div class="dial">
      ${clockSvg(model)}
      <span class="q q-jan">Jan</span><span class="q q-apr">Apr</span><span class="q q-jul">Jul</span><span class="q q-okt">Okt</span>
    </div>
    <div class="hero-copy">
      <h1>${name}</h1>
      ${level ? `<p class="level">${level}</p>` : ""}
      <p class="hero-text">${model.text}</p>
      ${others.length ? `<p class="also">Dazu ${others.map((x) => `${x.g.name} ${x.level.label}`).join(", ")}.</p>` : ""}
    </div>`;
  const hand = el.querySelector(".hand");
  if (first && hand && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    // One sweep from January to today when the forecast arrives
    hand.classList.add("from-jan");
    requestAnimationFrame(() => requestAnimationFrame(() => hand.classList.remove("from-jan")));
  }
}

startDraft({ renderHero });
