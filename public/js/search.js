// Address search as an accessible combobox

import { ADDRESS_SEARCH_URL, addressQuery, parseAddressHits } from "./data.js";
import { esc } from "./ui.js";

const DEBOUNCE_MS = 200;
const MIN_LENGTH = 3;

export function setupSearch({ input, list, onSelect }) {
  let results = [];
  let active = -1;
  let timer = null;
  let controller = null;

  function show(items, message) {
    results = items;
    active = -1;
    input.removeAttribute("aria-activedescendant");
    if (!items.length && !message) return close();
    list.innerHTML = items.length
      ? items.map((r, i) => `<li role="option" id="addr-${i}" class="option" data-index="${i}" aria-selected="false">
          <span>${esc(r.name)}</span><small>${r.type === "address" ? "Adresse" : "Straße"}</small></li>`).join("")
      : `<li class="message" role="presentation">${esc(message)}</li>`;
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  }

  function highlight(index) {
    const options = list.querySelectorAll(".option");
    if (!options.length) return;
    active = (index + options.length) % options.length;
    options.forEach((el, i) => el.setAttribute("aria-selected", String(i === active)));
    input.setAttribute("aria-activedescendant", options[active].id);
    options[active].scrollIntoView({ block: "nearest" });
  }

  async function search(query) {
    controller?.abort();
    controller = new AbortController();
    try {
      const res = await fetch(ADDRESS_SEARCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addressQuery(query)),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = parseAddressHits(await res.json(), query);
      if (input.value.trim() !== query) return; // typed on in the meantime
      show(items, items.length ? null : "Keine Straße oder Adresse in Hamburg gefunden");
    } catch (err) {
      if (err.name !== "AbortError") show([], "Suche gerade nicht möglich");
    }
  }

  function choose(index) {
    const result = results[index];
    if (!result) return;
    input.value = result.name;
    close();
    input.blur();
    onSelect(result);
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const query = input.value.trim();
    if (query.length < MIN_LENGTH) {
      controller?.abort();
      return close();
    }
    timer = setTimeout(() => search(query), DEBOUNCE_MS);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlight(active + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlight(active - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(active >= 0 ? active : 0);
    } else if (e.key === "Escape") {
      if (!list.hidden) close();
      else input.value = "";
    }
  });

  // mousedown would blur the input before the click lands
  list.addEventListener("mousedown", (e) => e.preventDefault());
  list.addEventListener("click", (e) => {
    const option = e.target.closest(".option");
    if (option) choose(Number(option.dataset.index));
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search")) close();
  });
}
