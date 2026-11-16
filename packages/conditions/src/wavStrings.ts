import type { Language } from "./strings";
import type {
  WavAvailability,
  WavFieldName,
  WavServiceType,
  WavTier,
  WavUsableAvailability,
} from "./wavTypes";

export interface WavStrings {
  heading: string;
  intro: string;
  unknown: string;
  sample: string;
  municipalityFilter: string;
  allMunicipalities: string;
  typeFilter: string;
  allTypes: string;
  availabilityLegend: string;
  availabilityHelp: string;
  resultCount: (count: number) => string;
  noRecords: string;
  stale: string;
  staleAvailability: string;
  datedSource: string;
  fields: Record<WavFieldName, string>;
  availability: Record<WavAvailability, string>;
  usableFilter: Record<WavUsableAvailability, string>;
  serviceTypes: Record<WavServiceType, string>;
  tiers: Record<WavTier, string>;
  source: string;
  licence: string;
  retrieved: string;
  tier: string;
  provenance: string;
}

export const wavStrings: Record<Language, WavStrings> = {
  en: {
    heading: "Accessible taxi and on-demand accessible vehicles",
    intro:
      "This list signposts services. It does not book rides, and it does not promise that a vehicle will come.",
    unknown: "Unknown",
    sample: "Sample data — not a real service",
    municipalityFilter: "Municipality",
    allMunicipalities: "All municipalities",
    typeFilter: "Service type",
    allTypes: "All types",
    availabilityLegend: "Show only services whose stated availability is",
    availabilityHelp:
      "Services with unknown or out-of-date availability are left out when a box is ticked.",
    resultCount: (count) =>
      count === 1 ? "1 service listed" : `${count} services listed`,
    noRecords:
      "No services in this list match. This means unknown — it does not mean that no service exists.",
    stale: "Out of date — needs review",
    staleAvailability: "Out of date — not a current statement",
    datedSource: "Source statement dated",
    fields: {
      municipality: "Municipality",
      service_name: "Service",
      service_type: "Service type",
      availability: "Availability",
      booking_phone: "Booking phone",
      booking_url: "Booking web address",
      service_hours: "Service hours",
    },
    availability: {
      on_demand: "Stated as available on demand",
      advance_booking_only: "Stated as advance booking only",
      limited: "Stated as limited",
      effectively_unavailable: "Effectively unavailable, according to a dated source",
      UNKNOWN: "Unknown",
    },
    usableFilter: {
      on_demand: "On demand",
      advance_booking_only: "Advance booking only",
      limited: "Limited",
    },
    serviceTypes: {
      accessible_taxi: "Accessible taxi",
      on_demand_wav: "On-demand accessible vehicle",
      UNKNOWN: "Unknown",
    },
    tiers: {
      0: "Tier 0 — open-data import, not verified",
      1: "Tier 1 — operator claim, not verified",
      2: "Tier 2 — peer verification",
      3: "Tier 3 — trained survey",
      4: "Tier 4 — live operator status",
    },
    source: "Source",
    licence: "Licence",
    retrieved: "Retrieved",
    tier: "Evidence tier",
    provenance: "Where each detail comes from",
  },
  fr: {
    heading: "Taxis accessibles et véhicules accessibles sur demande",
    intro:
      "Cette liste oriente vers des services. Elle ne réserve aucun déplacement et ne promet pas qu’un véhicule viendra.",
    unknown: "Inconnu",
    sample: "Données d’exemple — pas un service réel",
    municipalityFilter: "Municipalité",
    allMunicipalities: "Toutes les municipalités",
    typeFilter: "Type de service",
    allTypes: "Tous les types",
    availabilityLegend: "Afficher seulement les services dont la disponibilité déclarée est",
    availabilityHelp:
      "Les services dont la disponibilité est inconnue ou périmée sont exclus quand une case est cochée.",
    resultCount: (count) =>
      count <= 1 ? `${count} service affiché` : `${count} services affichés`,
    noRecords:
      "Aucun service de cette liste ne correspond. Cela signifie inconnu — cela ne signifie pas qu’aucun service n’existe.",
    stale: "Périmé — à réviser",
    staleAvailability: "Périmé — pas une déclaration actuelle",
    datedSource: "Déclaration de la source datée du",
    fields: {
      municipality: "Municipalité",
      service_name: "Service",
      service_type: "Type de service",
      availability: "Disponibilité",
      booking_phone: "Téléphone de réservation",
      booking_url: "Adresse Web de réservation",
      service_hours: "Heures de service",
    },
    availability: {
      on_demand: "Déclaré disponible sur demande",
      advance_booking_only: "Déclaré sur réservation à l’avance seulement",
      limited: "Déclaré limité",
      effectively_unavailable: "Pratiquement indisponible, selon une source datée",
      UNKNOWN: "Inconnu",
    },
    usableFilter: {
      on_demand: "Sur demande",
      advance_booking_only: "Réservation à l’avance seulement",
      limited: "Limité",
    },
    serviceTypes: {
      accessible_taxi: "Taxi accessible",
      on_demand_wav: "Véhicule accessible sur demande",
      UNKNOWN: "Inconnu",
    },
    tiers: {
      0: "Niveau 0 — données ouvertes importées, non vérifié",
      1: "Niveau 1 — déclaration de l’exploitant, non vérifié",
      2: "Niveau 2 — vérification par des pairs",
      3: "Niveau 3 — relevé par une personne formée",
      4: "Niveau 4 — état en direct de l’exploitant",
    },
    source: "Source",
    licence: "Licence",
    retrieved: "Consulté le",
    tier: "Niveau de preuve",
    provenance: "Provenance de chaque détail",
  },
};
