// One drawn icon set: 16px, 1.6 stroke, round caps (styled by .icon in styles.css). Decorative by default.
const paths = {
  plus: "M8 3.5v9M3.5 8h9",
  minus: "M3.5 8h9",
  settings: "M8 10.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4ZM13 8.9V7.1l-1.6-.4-.5-1.1.9-1.4-1.3-1.3-1.4.9-1.1-.5L7.1 2H8.9M7.1 2h1.8l.4 1.6 1.1.5 1.4-.9 1.3 1.3-.9 1.4.5 1.1 1.3.3v1.8l-1.6.4-.5 1.1.9 1.4-1.3 1.3-1.4-.9-1.1.5-.4 1.6H7.1l-.4-1.6-1.1-.5-1.4.9-1.3-1.3.9-1.4-.5-1.1L2 8.9V7.1l1.6-.4.5-1.1-.9-1.4 1.3-1.3 1.4.9 1.1-.5Z",
  download: "M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10",
  upload: "M8 10.5v-8M4.5 6 8 2.5 11.5 6M3 13.5h10",
  check: "M3.5 8.5 6.5 11.5 12.5 4.5",
  close: "M4 4l8 8M12 4l-8 8",
  edit: "M10.5 2.8l2.7 2.7L6 12.7l-3.3.6.6-3.3Z",
  note: "M3 2.5h10v8l-3 3H3ZM10 13.5v-3h3",
  flag: "M3.5 14V2.5M3.5 3h8l-1.6 3 1.6 3h-8",
  fit: "M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10",
  grid: "M2.5 2.5h4.5v4.5H2.5ZM9 2.5h4.5v4.5H9ZM2.5 9h4.5v4.5H2.5ZM9 9h4.5v4.5H9Z",
  web: "M8 4.2v0M4 11.5v0M12 11.5v0M8 4.2 4 11.5h8Z",
  library: "M3 2.5v11M6.5 2.5v11M10 3l3 10.3",
  lock: "M4 7h8v6.5H4ZM5.8 7V5a2.2 2.2 0 0 1 4.4 0v2",
  menu: "M2.5 4h11M2.5 8h11M2.5 12h11",
  help: "M6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4M8 11.6v.1M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z",
  external: "M9.5 2.5h4v4M13.5 2.5 7.5 8.5M11.5 9.5v4h-9v-9h4",
  spark: "M8 2v3M8 11v3M2 8h3M11 8h3M4 4l2 2M10 10l2 2M12 4l-2 2M6 10l-2 2",
  dot: "M8 9.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z",
  arrowUp: "M8 12.5v-9M4.5 7 8 3.5 11.5 7",
  undo: "M4.5 6.5h6a3 3 0 0 1 0 6H7M6.5 4 4 6.5 6.5 9",
  clock: "M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM8 4.5V8l2.2 1.4",
  spinner: "M8 1.5a6.5 6.5 0 1 1-6.5 6.5",
  alert: "M8 1.8 14.5 13.5h-13ZM8 6.2v3.2M8 11.4v.1",
  arrowDown: "M8 3.5v9M4.5 9 8 12.5 11.5 9"
};

export const icon = (name, label = "") => `<svg class="icon" viewBox="0 0 16 16" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}><path d="${paths[name] || paths.dot}"/></svg>`;
