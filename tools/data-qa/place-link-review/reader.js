// @ts-check
(() => {
  const lang = document.documentElement.lang === "fr" ? "fr" : "en";
  const french = lang === "fr";
  const search = document.querySelector("#case-search");
  const filter = document.querySelector("#decision-filter");
  const status = document.querySelector("#ui-status");
  if (!(search instanceof HTMLInputElement) || !(filter instanceof HTMLSelectElement) ||
      !(status instanceof HTMLElement)) return;
  const summaries = Array.from(document.querySelectorAll("details[data-case]")).filter(
    (element) => element instanceof HTMLDetailsElement);
  const visibleStatus = status;
  const clear = document.getElementById("clear-filters");
  const download = document.getElementById("export-decisions");
  /** @param {string} value */
  function folded(value) {
    return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase(lang).trim();
  }
  /** @param {string} state */
  function stateName(state) {
    const opt = Array.from(filter instanceof HTMLSelectElement ? filter.options : []).find(opt => opt.value === state);
    return opt?.textContent ?? state;
  }
  /** @param {string} [announcement] */
  function apply(announcement = "") {
    const query = folded(search instanceof HTMLInputElement ? search.value : "");
    const selected = filter instanceof HTMLSelectElement ? filter.value : "";
    const tokens = query.split(/\s+/u).filter(Boolean);
    let visible = 0;
    for (const card of summaries) {
      const li = card.parentElement;
      if (!li) continue;
      const text = folded(card.dataset.search ?? "");
      const matches = (!selected || selected === card.dataset.state) && tokens.every(token => text.includes(token));
      // Hiding an active decision must leave the reviewer at an operable control.
      if (!matches && li.contains(document.activeElement) && filter instanceof HTMLSelectElement) filter.focus();
      li.hidden = !matches;
      if (matches) visible++;
    }
    const count = french ? `Dossiers affichés : ${visible} sur ${summaries.length}.`
      : `Cases shown: ${visible} of ${summaries.length}.`;
    visibleStatus.textContent = announcement ? announcement + " " + count : count;
  }
  search.addEventListener("input", () => apply());
  filter.addEventListener("change", () => apply());
  clear?.addEventListener("click", () => {
    search.value = "";
    filter.value = "";
    apply();
    search.focus();
  });
  for (const card of summaries) {
    const select = card.querySelector("select[data-decision]");
    if (!(select instanceof HTMLSelectElement)) continue;
    select.addEventListener("change", () => {
      const state = select.value;
      if (!["open", "follow-up", "reviewed"].includes(state)) return;
      card.dataset.state = state;
      const label = card.querySelector("[data-state-label]");
      if (label) label.textContent = stateName(state);
      apply(french ? "Décision modifiée." : "Decision updated.");
    });
  }
  download?.addEventListener("click", () => {
    const entries = summaries.flatMap(card => {
      const decision = card.dataset.state;
      const id = card.dataset.case;
      const fingerprint = card.dataset.fingerprint;
      return (decision === "reviewed" || decision === "follow-up") && id && fingerprint
        ? [{ id, fingerprint, decision }] : [];
    });
    entries.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const file = new Blob([JSON.stringify({schema:"place-link-decisions/v1",entries}, null, 2) + "\n"],
      { type: "application/json" });
    const address = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = address;
    link.download = "place-link-decisions.json";
    document.body.append(link);
    try { link.click(); }
    finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(address), 1000);
    }
    apply(french ? `Fichier de décisions préparé (${entries.length}).`
      : `Decision file prepared (${entries.length}).`);
  });
})();
