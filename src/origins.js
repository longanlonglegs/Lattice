// Where an idea came from. Defined once so the card list and (later) the web look the same.
// Colours mirror --origin-* in tokens.css (test/tokens.test.js keeps them in step).
export const origins = {
  external: { label: "External source", short: "Source", colour: "#6e56cf", shape: "circle" },
  experiment: { label: "My experiment", short: "Experiment", colour: "#14ae5c", shape: "square" },
  hypothesis: { label: "My hypothesis", short: "Hypothesis", colour: "#e03e8c", shape: "diamond" }
};

// The origins a user can pick when adding evidence (hypothesis ideas come from Part 5).
export const pickableOrigins = ["external", "experiment"];

export const originOf = key => origins[key] || origins.external;

// Extraction prompt per origin; links always use the link prompt.
export const extractionMode = origin => (origin === "experiment" ? "experiment" : "content");
