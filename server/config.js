// Limits shared by the routes and prompts.
const MAX_SOURCE_CHARS = 60000;
// A backstop against runaway output only; the prompt asks for a few main conclusions per source.
const MAX_CARDS = 12;
const MAX_QUOTES = 3;
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

module.exports = { MAX_SOURCE_CHARS, MAX_CARDS, MAX_QUOTES, MAX_DOWNLOAD_BYTES };
