export const SECTIONS = [
  "data-types",
  "sites",
  "equipment",
  "variables",
  "apis",
  "plans",
  "reporting",
  "configurations",
  "system",
  "rights",
] as const;

export type Section = (typeof SECTIONS)[number];
export type AccessLevel = "read" | "write";

export const SECTION_LABELS: Record<Section, string> = {
  "data-types": "Type des données",
  sites: "Gestion des Sites",
  equipment: "Gestion du matériel",
  variables: "Gestion des variables",
  apis: "Gestion des API",
  plans: "Plans",
  reporting: "Reporting",
  configurations: "Gestion des configurations",
  system: "Système",
  rights: "Gestion des droits",
};
