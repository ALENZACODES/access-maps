import { planJourney } from "@access-maps/journey";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { JourneyResult } from "../src/index.js";
import { demoPlanInput } from "./fixture.js";
import "../src/styles.css";
import "maplibre-gl/dist/maplibre-gl.css";

const locale = new URLSearchParams(window.location.search).get("lang") === "fr" ? "fr" : "en";
document.documentElement.lang = locale;

const PAGE = {
  en: {
    title: "Journey demo",
    intro: "Fixture data only. Nothing on this page is an operator status or a surveyed place.",
    switchLabel: "Language",
    other: "Français",
    otherHref: "?lang=fr",
    otherLang: "fr",
  },
  fr: {
    title: "Démonstration de trajet",
    intro: "Données d'essai seulement. Rien sur cette page n'est un état d'exploitant ni un lieu relevé sur place.",
    switchLabel: "Langue",
    other: "English",
    otherHref: "?lang=en",
    otherLang: "en",
  },
} as const;

const page = PAGE[locale];
document.title = page.title;
const plan = planJourney(demoPlanInput(locale));

const root = document.querySelector("#root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(
  <StrictMode>
    <main>
      <h1>{page.title}</h1>
      <p>{page.intro}</p>
      <nav aria-label={page.switchLabel}>
        <a href={page.otherHref} hrefLang={page.otherLang} lang={page.otherLang}>
          {page.other}
        </a>
      </nav>
      <JourneyResult plan={plan} />
    </main>
  </StrictMode>,
);
