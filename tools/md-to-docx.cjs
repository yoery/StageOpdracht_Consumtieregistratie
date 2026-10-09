// Zet een Markdown-document om naar een Word-bestand (.docx) in de TVB-huisstijl.
// Basis is het TVB-sjabloon (tvbsjabloon.docx; dat staat niet in de repository, vraag het op bij TVB):
// voorblad, stijlen (Verdana, turquoise koppen),
// kop- en voetteksten ("Pagina X van Y"), zeshoek-opsommingstekens en de inhoudsopgave.
//
// Gebruik: node md-to-docx.cjs <uitgepakt-sjabloon-map> <invoer.md> <uitvoer-map> "<titel>" "<ondertitel>"
// Het resultaat is een map met alle onderdelen van het .docx-bestand. Daarna maakt
// tools/word-bijwerken.ps1 er met Word een .docx en .pdf van, met bijgewerkte inhoudsopgave.
//
// Voorbeeld voor het TO (PowerShell, vanuit de projectmap; $w is een tijdelijke map buiten OneDrive):
//   $w = "$env:TEMP\tvb-docs"; New-Item -ItemType Directory -Force $w
//   Add-Type -AssemblyName System.IO.Compression.FileSystem
//   [System.IO.Compression.ZipFile]::ExtractToDirectory("<pad naar>\tvbsjabloon.docx", "$w\sjabloon")
//   node tools\md-to-docx.cjs "$w\sjabloon" docs\TO-BLIKJESREGISTRATIE.md "$w\to" "Technisch ontwerp" "Blikjesregistratie TVB"
//   & .\tools\word-bijwerken.ps1 -Map "$w\to" -Docx "$w\TO-BLIKJESREGISTRATIE.docx" -Pdf "$w\TO-BLIKJESREGISTRATIE.pdf"
//   Copy-Item "$w\TO-BLIKJESREGISTRATIE.*" docs\
// Voor de documentatie: docs\DOCUMENTATIE.md met titel "Documentatie" en ondertitel "Consumptieregistratie TVB".
// Let op: de .md is de bron; een wijziging die alleen in de .docx staat, is weg na de volgende keer maken.
const fs = require("fs");
const path = require("path");

const [templateDir, input, outDir, coverTitle, coverSubtitle] = process.argv.slice(2);
if (!templateDir || !input || !outDir || !coverTitle || !coverSubtitle) {
  throw new Error('Gebruik: node md-to-docx.cjs <sjabloon-map> <invoer.md> <uitvoer-map> "<titel>" "<ondertitel>"');
}
const mdDir = path.resolve(path.dirname(input));
// De uitvoermap wordt eerst leeggemaakt. Weiger daarom een map waarin de bron (of het sjabloon) staat,
// zodat bijvoorbeeld docs/ nooit per ongeluk wordt gewist als de argumenten zijn verwisseld.
const resolvedOut = path.resolve(outDir);
const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);
if (inside(mdDir, resolvedOut) || inside(path.resolve(templateDir), resolvedOut)) {
  throw new Error(`Uitvoermap ${outDir} bevat de bron of het sjabloon; kies een aparte (tijdelijke) map.`);
}
const md = fs.readFileSync(input, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

// ---------------------------------------------------------------- hulpfuncties

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (t) => t.toLowerCase().replace(/`/g, "").replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().replace(/\s/g, "-");
const PAGE_WIDTH = 9638; // A4 (11906) min marges links en rechts (2 × 1134), in twips
const TEAL = "38B5A8";

// Kopieert het sjabloon naar de uitvoermap (zonder het voorbeelddocument zelf).
fs.rmSync(outDir, { recursive: true, force: true });
fs.cpSync(templateDir, outDir, { recursive: true });

const templateXml = fs.readFileSync(path.join(templateDir, "word", "document.xml"), "utf8");
const relsPath = path.join(outDir, "word", "_rels", "document.xml.rels");
let rels = fs.readFileSync(relsPath, "utf8");
let relCounter = 100;
const addRel = (type, target, external = false) => {
  const id = `rId${relCounter++}`;
  rels = rels.replace("</Relationships>",
    `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${esc(target)}"${external ? ' TargetMode="External"' : ""}/></Relationships>`);
  return id;
};

// ---------------------------------------------------------------- afbeeldingen

// Leest breedte en hoogte uit een PNG- of JPEG-bestand (nodig voor de afmetingen in Word).
function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
    }
    i += 2 + len;
  }
  throw new Error(`Afmetingen onbekend: ${file}`);
}

const media = new Map(); // bronpad → { rel, name }
let drawingId = 1;
function imageParagraph(src, alt) {
  // Alleen PNG- en JPEG-bestanden uit de map van het document (of een submap daarvan), zodat een
  // pad als ../../geheim.png geen bestand van elders in het Word-bestand kan zetten.
  const file = path.resolve(mdDir, src);
  if (!inside(file, mdDir) || !/\.(png|jpe?g)$/i.test(file)) throw new Error(`Afbeelding niet toegestaan: ${src}`);
  if (!fs.existsSync(file)) throw new Error(`Afbeelding ontbreekt: ${src}`);
  const { w, h } = imageSize(file); // eerst controleren dat het echt een afbeelding is
  if (!media.has(file)) {
    const name = `img${media.size + 1}${path.extname(file).toLowerCase()}`;
    fs.copyFileSync(file, path.join(outDir, "word", "media", name));
    media.set(file, { rel: addRel("image", `media/${name}`), name });
  }
  const { rel, name } = media.get(file);
  // Zo breed mogelijk (17 cm), maar niet hoger dan 13 cm, zodat er tekst bij op de pagina past.
  const maxW = 6120000, maxH = 4680000;
  let cx = maxW, cy = Math.round((maxW * h) / w);
  if (cy > maxH) { cy = maxH; cx = Math.round((maxH * w) / h); }
  const id = drawingId++;
  const drawing = `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Afbeelding ${id}" descr="${esc(alt)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="6350"><a:solidFill><a:srgbClr val="D0DCDA"/></a:solidFill></a:ln></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
  // Geen extra bijschrift: in het document staat boven of onder een afbeelding al een kop of
  // een eigen bijschrift. De alt-tekst staat wel in de afbeelding (voor schermlezers).
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="200"/></w:pPr><w:r>${drawing}</w:r></w:p>`;
}

// ---------------------------------------------------------------- tekst binnen een alinea

// Bladwijzers voor koppen, zodat interne links ([tekst](#anker)) in Word ook werken.
const bookmarks = new Map(); // anker → naam
let bookmarkId = 1;

function run(text, f) {
  if (!text) return "";
  const props = [
    f.link ? '<w:rStyle w:val="Hyperlink"/>' : "",
    f.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : "",
    f.b ? "<w:b/><w:bCs/>" : "",
    f.i ? "<w:i/><w:iCs/>" : "",
    f.color ? `<w:color w:val="${f.color}"/>` : "",
    f.code ? `<w:sz w:val="${(f.sz || 20) - 2}"/>` : f.sz ? `<w:sz w:val="${f.sz}"/><w:szCs w:val="${f.sz}"/>` : "",
    f.code && !f.block ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF4F2"/>' : ""
  ].join("");
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

// Inline Markdown: `code`, [link](doel), **vet** en *cursief* (ook genest).
function runs(text, f = {}) {
  const re = /(`[^`]+`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*(.+?)\*\*)|((?<![\w*])\*([^*\n]+?)\*(?![\w*]))/g;
  let out = "", last = 0, m;
  while ((m = re.exec(text))) {
    out += run(text.slice(last, m.index), f);
    if (m[1]) out += run(m[1].slice(1, -1), { ...f, code: true });
    else if (m[2]) out += link(m[3], m[4], f);
    else if (m[5]) out += runs(m[6], { ...f, b: true });
    else if (m[7]) out += runs(m[8], { ...f, i: true });
    last = m.index + m[0].length;
  }
  return out + run(text.slice(last), f);
}

function link(label, target, f) {
  if (target.startsWith("#")) {
    const name = bookmarks.get(target.slice(1));
    if (!name) return runs(label, f);
    return `<w:hyperlink w:anchor="${name}" w:history="1">${runs(label, { ...f, link: true })}</w:hyperlink>`;
  }
  // Alleen webadressen en e-mail worden een link. Een verwijzing naar een bestand (zoals
  // ./DATABASE-SCHEMA.sql) wordt gewone tekst: Word maakte er anders bij het opslaan een lokaal
  // pad van (file:///C:\Users\…), en dat werkt bij de lezer niet en verraadt de mappen.
  if (!/^(https?:|mailto:)/i.test(target)) return runs(label, f);
  return `<w:hyperlink r:id="${addRel("hyperlink", target, true)}" w:history="1">${runs(label, { ...f, link: true })}</w:hyperlink>`;
}

// ---------------------------------------------------------------- blokken

function headingText(raw, level) {
  // Nummers als "4.2" of "1." weghalen: Word nummert de koppen zelf.
  let text = raw.replace(/^\d+(\.\d+)*\.?\s+/, "");
  if (level === 1) text = text.replace(/[.:]$/, "") + ".";
  // Kop 1 en kop 2 in hoofdletters, zoals in het sjabloon; code tussen backticks blijft zoals het is.
  if (level <= 2) text = text.split(/(`[^`]+`)/).map((part) => (part.startsWith("`") ? part : part.toUpperCase())).join("");
  return text;
}

function heading(level, raw, numbered) {
  const style = `Kop${level}`;
  // Lijst 37 is de koppennummering van het sjabloon (1., 1.1, 1.1.1). Met lijst 39 begon kop 2
  // bij .2, omdat kop 1 dan ook als kop 2 meetelde.
  const num = numbered ? `<w:numPr><w:ilvl w:val="${level - 1}"/><w:numId w:val="37"/></w:numPr>` : '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="0"/></w:numPr>';
  const name = bookmarks.get(slug(raw));
  const id = bookmarkId++;
  const pageBreak = level === 1 ? "<w:pageBreakBefore/>" : "";
  const keep = "<w:keepNext/>";
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/>${keep}${pageBreak}${num}</w:pPr>` +
    (name ? `<w:bookmarkStart w:id="${id}" w:name="${name}"/>` : "") +
    runs(headingText(raw, level)) +
    (name ? `<w:bookmarkEnd w:id="${id}"/>` : "") + "</w:p>";
}

const paragraph = (text, extra = "") => `<w:p>${extra ? `<w:pPr>${extra}</w:pPr>` : ""}${runs(text)}</w:p>`;

// Na het laatste punt van een lijst komt de gewone witruimte, zodat de volgende alinea vrij staat.
function bullet(text, last) {
  return `<w:p><w:pPr><w:pStyle w:val="Lijstalinea"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr><w:contextualSpacing w:val="0"/><w:spacing w:after="${last ? 160 : 60}"/></w:pPr>${runs(text)}</w:p>`;
}

function numbered(number, text, last) {
  return `<w:p><w:pPr><w:pStyle w:val="Lijstalinea"/><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs><w:contextualSpacing w:val="0"/><w:spacing w:after="${last ? 160 : 60}"/><w:ind w:left="720" w:hanging="360"/></w:pPr>${run(`${number}.`, { color: TEAL, b: true })}<w:r><w:tab/></w:r>${runs(text)}</w:p>`;
}

function codeBlock(lines) {
  return lines.map((line, i) => {
    const spacing = `<w:spacing w:before="${i === 0 ? 120 : 0}" w:after="${i === lines.length - 1 ? 200 : 0}" w:line="240" w:lineRule="auto"/>`;
    return `<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F1F5F4"/>${spacing}<w:ind w:left="170" w:right="170"/></w:pPr>${run(line || " ", { code: true, block: true, sz: 18 })}</w:p>`;
  }).join("");
}

// Tabel: kolombreedte naar verhouding van de tekstlengte, kopregel turquoise met witte tekst.
function table(rows) {
  const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const [head, , ...body] = rows;
  const header = cells(head);
  const all = [header, ...body.map(cells)];
  const n = header.length;
  // Iedere kolom is minstens zo breed als het langste woord (geen afgebroken woorden zoals
  // "Versi-e"); de rest van de breedte gaat naar verhouding van de gemiddelde tekstlengte.
  const plain = (s) => (s || "").replace(/[`*]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  const CHAR = 100; // ongeveer de breedte van één teken in Verdana 8 pt, in twips
  const minWidths = header.map((_, c) => {
    const longestWord = Math.max(...all.map((r, i) => Math.max(0, ...plain(r[c]).split(/\s+/).map((w) => w.length * (i === 0 ? 1.1 : 1)))));
    return Math.min(Math.round(longestWord * CHAR + 220), Math.round(PAGE_WIDTH * 0.45));
  });
  const weights = header.map((_, c) => {
    const lengths = all.map((r) => plain(r[c]).length);
    return Math.max(lengths.reduce((a, b) => a + b, 0) / lengths.length, 1);
  });
  let widths = minWidths.slice();
  let rest = PAGE_WIDTH - widths.reduce((a, b) => a + b, 0);
  if (rest < 0) {
    widths = minWidths.map((w) => Math.round((w / (PAGE_WIDTH - rest)) * PAGE_WIDTH));
  } else {
    // De extra ruimte gaat naar kolommen met veel tekst; korte kolommen houden hun minimum.
    const extra = weights.map((w, c) => Math.max(w * CHAR - minWidths[c], 0));
    const extraTotal = extra.reduce((a, b) => a + b, 0) || 1;
    widths = widths.map((w, c) => w + Math.round((extra[c] / extraTotal) * rest));
  }
  widths[widths.length - 1] += PAGE_WIDTH - widths.reduce((a, b) => a + b, 0);
  const cell = (text, c, isHead) =>
    `<w:tc><w:tcPr><w:tcW w:w="${widths[c]}" w:type="dxa"/>${isHead ? `<w:shd w:val="clear" w:color="auto" w:fill="${TEAL}"/>` : ""}</w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/></w:pPr>${runs(text, isHead ? { b: true, color: "FFFFFF", sz: 16 } : { sz: 16 })}</w:p></w:tc>`;
  const border = (side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="C9D8D5"/>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${PAGE_WIDTH}" w:type="dxa"/><w:tblLayout w:type="fixed"/>` +
    `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")}</w:tblBorders>` +
    `<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
    `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${header.map((t, c) => cell(t, c, true)).join("")}</w:tr>` +
    body.map((r) => { const cs = cells(r); return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${header.map((_, c) => cell(cs[c] || "", c, false)).join("")}</w:tr>`; }).join("") +
    `</w:tbl><w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>`;
}

// ---------------------------------------------------------------- document opbouwen

const lines = md.split("\n");

// Eerste ronde: alle koppen krijgen een bladwijzer, zodat links naar verderop ook werken.
let inCode = false;
for (const line of lines) {
  if (line.startsWith("```")) inCode = !inCode;
  const h = !inCode && line.match(/^(#{2,4}) (.+)$/);
  if (h && !bookmarks.has(slug(h[2]))) bookmarks.set(slug(h[2]), `k${bookmarks.size + 1}`);
}

// Gegevens voor het voorblad: de regels **Auteur:**, **Versie:** en **Datum:** bovenaan het document.
const meta = {};
for (const line of lines.slice(0, 15)) {
  const m = line.match(/^\*\*(Auteur|Versie|Datum):\*\*\s*(.+)$/);
  if (m) meta[m[1]] = m[2].trim();
}

const body = [];
let numberedChapters = false; // pas vanaf de eerste genummerde kop 1 ("## 1. …")
let skipSection = false; // de Markdown-inhoudsopgave vervalt; Word maakt er een
let introOpen = false;
for (let i = 0; i < lines.length; ) {
  const line = lines[i];
  if (/^# /.test(line) || /^\*\*(Auteur|Versie|Datum):\*\*/.test(line) || /^<!--/.test(line)) { i++; continue; }

  const h = line.match(/^(#{2,4}) (.+)$/);
  if (h) {
    const level = h[1].length - 1;
    const text = h[2].trim();
    if (level === 1) {
      skipSection = /^inhoudsopgave$/i.test(text);
      if (skipSection) { i++; continue; }
      numberedChapters = /^\d+\.\s/.test(text);
    }
    if (skipSection) { i++; continue; }
    // Tekst vóór het eerste hoofdstuk komt onder een eigen kop "Over dit document".
    if (!introOpen && level > 1 && !numberedChapters && body.length === 0) {
      body.push(heading(1, "Over dit document", false));
      introOpen = true;
    }
    body.push(heading(level, text, numberedChapters));
    i++;
    continue;
  }
  if (skipSection) { i++; continue; }

  if (!introOpen && body.length === 0 && line.trim() !== "") {
    body.push(heading(1, "Over dit document", false));
    introOpen = true;
  }

  if (line.startsWith("```")) {
    const code = [];
    for (i++; i < lines.length && !lines[i].startsWith("```"); i++) code.push(lines[i]);
    i++;
    body.push(codeBlock(code));
    continue;
  }
  if (line.startsWith("|")) {
    const rows = [];
    for (; i < lines.length && lines[i].startsWith("|"); i++) rows.push(lines[i]);
    body.push(table(rows));
    continue;
  }
  const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
  if (img) { body.push(imageParagraph(img[2], img[1])); i++; continue; }
  if (/^- /.test(line)) {
    for (; i < lines.length && /^- /.test(lines[i]); i++) body.push(bullet(lines[i].slice(2), !/^- /.test(lines[i + 1] || "")));
    continue;
  }
  if (/^\d+\. /.test(line)) {
    for (; i < lines.length && /^\d+\. /.test(lines[i]); i++) {
      const m = lines[i].match(/^(\d+)\. (.*)$/);
      body.push(numbered(m[1], m[2], !/^\d+\. /.test(lines[i + 1] || "")));
    }
    continue;
  }
  if (line.trim() === "") { i++; continue; }
  const para = [];
  for (; i < lines.length && lines[i].trim() !== "" && !/^(#{1,6} |```|\||- |\d+\. |!\[)/.test(lines[i]); i++) para.push(lines[i].trim());
  body.push(paragraph(para.join(" ")));
}

// Voorblad uit het sjabloon (alles vóór de kop "INLEIDING."), met titel en ondertitel ingevuld.
const bodyStart = templateXml.indexOf("<w:body>") + "<w:body>".length;
const inleiding = templateXml.indexOf("INLEIDING.");
const coverEnd = Math.max(templateXml.lastIndexOf("<w:p ", inleiding), templateXml.lastIndexOf("<w:p>", inleiding));
let cover = templateXml.slice(bodyStart, coverEnd);
if (!cover.includes("<w:t>TEKST</w:t>") || !cover.includes("SUBTITEL")) throw new Error("Voorblad van het sjabloon niet herkend");
cover = cover.replace("<w:t>TEKST</w:t>", `<w:t>${esc(coverTitle.toUpperCase())}</w:t>`)
  .replace(/<w:t xml:space="preserve">SUBTITEL <\/w:t>/, `<w:t xml:space="preserve">${esc(coverSubtitle.toUpperCase())}</w:t>`);
// Na de ondertitel staan in het sjabloon alleen lege alinea's die het voorblad opvullen. Die
// vallen weg (het logo staat in de koptekst van de eerste pagina); anders kunnen ze doorlopen
// naar een lege tweede pagina. Daarna de auteur (wit, vet) en versie en datum (wit, kleiner),
// als het document die bovenaan noemt.
const subtitleEnd = cover.indexOf("</w:p>", cover.indexOf(esc(coverSubtitle.toUpperCase()))) + "</w:p>".length;
cover = cover.slice(0, subtitleEnd);
if (meta.Auteur) {
  cover += `<w:p><w:pPr><w:spacing w:before="120" w:line="360" w:lineRule="auto"/></w:pPr>${run(meta.Auteur, { color: "FFFFFF", sz: 28, b: true })}</w:p>`;
}
if (meta.Versie || meta.Datum) {
  const metaText = [meta.Versie && `Versie ${meta.Versie}`, meta.Datum].filter(Boolean).join("  ·  ");
  cover += `<w:p><w:pPr><w:spacing w:before="120" w:line="360" w:lineRule="auto"/></w:pPr>${run(metaText, { color: "FFFFFF", sz: 24 })}</w:p>`;
}

const tocHeading = `<w:p><w:pPr><w:pStyle w:val="Kop1"/><w:pageBreakBefore/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="0"/></w:numPr></w:pPr>${run("INHOUDSOPGAVE.", {})}</w:p>`;
const toc = `<w:p><w:pPr><w:pStyle w:val="Inhopg1"/><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${PAGE_WIDTH}"/></w:tabs></w:pPr>` +
  `<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r>` +
  `<w:r><w:fldChar w:fldCharType="separate"/></w:r>${run("De inhoudsopgave wordt bijgewerkt als het document in Word wordt geopend.", { i: true })}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;

const sectPr = templateXml.slice(templateXml.lastIndexOf("<w:sectPr"), templateXml.indexOf("</w:body>"));
const documentXml = templateXml.slice(0, bodyStart) + cover + tocHeading + toc + body.join("") + sectPr + templateXml.slice(templateXml.indexOf("</w:body>"));
fs.writeFileSync(path.join(outDir, "word", "document.xml"), documentXml);
fs.writeFileSync(relsPath, rels);

// Het sjabloon verwijst naar het interne bedrijfssjabloon op SharePoint (attachedTemplate). Die
// verwijzing is niet nodig (alle stijlen zitten al in het document) en hoort niet in een document
// dat buiten TVB wordt gedeeld; daarom gaat hij eruit.
const settingsPath = path.join(outDir, "word", "settings.xml");
fs.writeFileSync(settingsPath, fs.readFileSync(settingsPath, "utf8").replace(/<w:attachedTemplate [^>]*\/>/g, ""));
const settingsRelsPath = path.join(outDir, "word", "_rels", "settings.xml.rels");
if (fs.existsSync(settingsRelsPath)) {
  fs.writeFileSync(settingsRelsPath, fs.readFileSync(settingsRelsPath, "utf8").replace(/<Relationship [^>]*attachedTemplate[^>]*\/>/g, ""));
}

// Afbeeldingstypes aanmelden en de titel in de documenteigenschappen zetten.
const ctPath = path.join(outDir, "[Content_Types].xml");
let ct = fs.readFileSync(ctPath, "utf8");
for (const [ext, type] of [["png", "image/png"], ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"]]) {
  if (!new RegExp(`Extension="${ext}"`, "i").test(ct)) ct = ct.replace("<Types", "<Types").replace(/(<Types[^>]*>)/, `$1<Default Extension="${ext}" ContentType="${type}"/>`);
}
fs.writeFileSync(ctPath, ct);
const corePath = path.join(outDir, "docProps", "core.xml");
let core = fs.readFileSync(corePath, "utf8");
const docTitle = `${coverTitle} – ${coverSubtitle}`;
core = /<dc:title>/.test(core) ? core.replace(/<dc:title>[^<]*<\/dc:title>/, `<dc:title>${esc(docTitle)}</dc:title>`)
  : core.replace("</cp:coreProperties>", `<dc:title>${esc(docTitle)}</dc:title></cp:coreProperties>`);
fs.writeFileSync(corePath, core);

console.log(JSON.stringify({ blokken: body.length, afbeeldingen: media.size, bladwijzers: bookmarks.size }));
