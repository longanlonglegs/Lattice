// Builds the demo PDFs from the plain-text files in ./content.
// Run with: node demo/vitamin-c/build-pdfs.cjs
// The PDFs are simple, text-based (Helvetica) so Lattice's PDF reader can extract them.
const fs = require("fs");
const path = require("path");

const here = __dirname;
const outputs = {
  "S1-okafor-2019-arrhenius.txt": "sources/S1-okafor-2019-arrhenius.pdf",
  "S2-haddad-2021-oxygen.txt": "sources/S2-haddad-2021-oxygen.pdf",
  "S3-sato-2020-biphasic.txt": "sources/S3-sato-2020-biphasic.pdf",
  "E-lab-notebook.txt": "your-work/lab-notebook-experiments-1-2.pdf"
};

const pageWidth = 612, pageHeight = 792, margin = 72, wrapAt = 88;

function escapePdf(text) {
  const map = { "°": "\\260", "–": "\\226", "—": "\\227", "’": "\\222", "‘": "\\221", "“": "\\223", "”": "\\224" };
  return text.replace(/[\\()]/g, char => `\\${char}`).replace(/[°–—’‘“”]/g, char => map[char]).replace(/[^\x20-\x7e\\]/g, "?");
}

function wrap(text, width) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line && (line + " " + word).length > width) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function layout(source) {
  const rawLines = source.replace(/\r/g, "").split("\n");
  const items = [];
  rawLines.forEach((raw, index) => {
    const text = raw.trim();
    if (!text) { items.push({ gap: true }); return; }
    const isTitle = index === 0;
    const isHeading = !isTitle && text.length < 70 && !/[.:,]$/.test(text) && /^([0-9]\.|[A-Z])/.test(text) && !/^Day \d/.test(text);
    const size = isTitle ? 15 : isHeading ? 11.5 : 10.5;
    const font = isTitle || isHeading ? "F2" : "F1";
    const width = isTitle ? 62 : wrapAt;
    wrap(text, width).forEach(line => items.push({ line, size, font, leading: size * 1.45 }));
  });
  const pages = [[]];
  let y = pageHeight - margin;
  for (const item of items) {
    const height = item.gap ? 7 : item.leading;
    if (y - height < margin) { pages.push([]); y = pageHeight - margin; if (item.gap) continue; }
    y -= height;
    if (!item.gap) pages.at(-1).push(`BT /${item.font} ${item.size} Tf ${margin} ${y.toFixed(1)} Td (${escapePdf(item.line)}) Tj ET`);
  }
  return pages.map((ops, index) => `${ops.join("\n")}\nBT /F1 9 Tf ${pageWidth / 2 - 10} 40 Td (${index + 1}) Tj ET`);
}

function buildPdf(pageStreams) {
  const objects = [];
  const add = body => { objects.push(body); return objects.length; };
  const catalog = add(null);
  const pagesId = add(null);
  const font1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const font2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const pageIds = pageStreams.map(stream => {
    const content = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >> /Contents ${content} 0 R >>`);
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, index) => { offsets.push(Buffer.byteLength(out, "latin1")); out += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

for (const [input, output] of Object.entries(outputs)) {
  const pages = layout(fs.readFileSync(path.join(here, "content", input), "utf8"));
  fs.writeFileSync(path.join(here, output), buildPdf(pages));
  console.log(`${output}: ${pages.length} page${pages.length === 1 ? "" : "s"}`);
}
