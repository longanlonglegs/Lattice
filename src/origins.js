// Where an idea came from. Defined once so the card list and (later) the web look the same.
export const origins = {
  external: { label: "External source", short: "SOURCE", colour: "#4b6ca6", shape: "circle" },
  experiment: { label: "My experiment", short: "EXPERIMENT", colour: "#3f7a63", shape: "square" },
  draft: { label: "My draft", short: "DRAFT", colour: "#c98a2e", shape: "rounded" },
  hypothesis: { label: "My hypothesis", short: "HYPOTHESIS", colour: "#d95d39", shape: "diamond" }
};

// The origins a user can pick when adding evidence (hypothesis ideas come from Part 5).
export const pickableOrigins = ["external", "experiment", "draft"];

export const originOf = key => origins[key] || origins.external;

// Extraction prompt per origin; links always use the link prompt.
export const extractionMode = origin => ({ experiment: "experiment", draft: "draft" }[origin] || "content");
