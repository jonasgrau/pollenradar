// Draft C: the name itself is the gauge. Each DWD step maps to one weight of a variable font,
// hairline for "keine", black for "hoch". The meter stays as a second encoding.

import { meter, startDraft } from "./shared.js";

const WEIGHTS = [100, 200, 300, 450, 600, 750, 900];
const SHOWN = 3;

function renderHero(el, model, { first }) {
  const animate = first && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (["loading", "error", "empty"].includes(model.kind)) {
    el.innerHTML = `<div class="hero-copy"><h1 class="state">${model.title}</h1><p class="hero-text">${model.text}</p></div>`;
    return;
  }
  const rows = model.ranked.slice(0, SHOWN);
  const rest = model.ranked.slice(SHOWN);
  const flying = model.kind === "flying";
  el.innerHTML = `
    <div class="words" role="list">
      ${rows
        .map(({ g, level }) => {
          const step = level?.step ?? 0;
          return `<div class="row" role="listitem">
            <span class="word" data-weight="${WEIGHTS[step]}" style="font-weight:${animate ? 100 : WEIGHTS[step]};letter-spacing:${(-0.005 - (0.03 * step) / 6).toFixed(3)}em">${g.name}</span>
            <span class="lv">${meter(step, g.color)}<span>${level ? level.label : "keine Angabe"}</span></span>
          </div>`;
        })
        .join("")}
    </div>
    ${rest.length ? `<p class="also">${rest.map(({ g, level }) => `${g.name} ${level ? level.label : "keine Angabe"}`).join(", ")}.</p>` : ""}
    <p class="hero-text">${flying ? `${model.top.g.name} ${model.text.charAt(0).toLowerCase()}${model.text.slice(1)}` : `${model.title}. ${model.text}`}</p>`;
  if (animate) {
    // The words gain weight once, as the forecast arrives
    requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const w of el.querySelectorAll(".word")) w.style.fontWeight = w.dataset.weight;
    }));
  }
}

startDraft({ renderHero });
