// Beveiligingstests voor de configuratie: geen externe bronnen, een kloppende
// Content-Security-Policy, zelf gehoste lettertypes en face-api, en een veilige CI-workflow.
// Deze tests lezen alleen bestanden; ze starten geen browser.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), "utf8");
const exists = (relative) => fs.existsSync(new URL(relative, import.meta.url));

// Browsers zetten regeleinden (\r\n) om naar \n voordat ze de hash van een inline script berekenen.
// Door hier hetzelfde te doen, maakt het niet uit hoe Git de regeleinden heeft opgeslagen.
const indexHtml = () => read("../index.html").replace(/\r\n?/g, "\n");

// Geeft alle http(s)-adressen in een tekst terug, behalve XML-naamruimtes (xmlns), want die
// worden niet geladen.
const externalUrls = (text) =>
  (text.match(/https?:\/\/[^\s"'()<>]+/g) || []).filter((url) => !url.startsWith("http://www.w3.org/"));

const cspContent = (html) => {
  const match = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i);
  return match ? match[1] : null;
};

const sha256 = (text) => `'sha256-${crypto.createHash("sha256").update(text, "utf8").digest("base64")}'`;

test("index.html laadt niets van externe servers (geen Google Fonts of CDN)", () => {
  assert.deepEqual(externalUrls(indexHtml()), []);
});

test("config.js en styles.css verwijzen niet naar externe servers", () => {
  assert.deepEqual(externalUrls(read("../assets/js/config.js")), []);
  assert.deepEqual(externalUrls(read("../assets/css/styles.css")), []);
});

test("index.html stuurt geen referrer mee", () => {
  assert.match(indexHtml(), /<meta\s+name="referrer"\s+content="no-referrer">/);
});

test("de Content-Security-Policy staat in de head en staat alleen de eigen server toe", () => {
  const html = indexHtml();
  const csp = cspContent(html);
  assert.ok(csp, "CSP-meta ontbreekt");
  assert.ok(html.indexOf("Content-Security-Policy") < html.indexOf("<body"), "CSP moet in de head staan");

  const directives = Object.fromEntries(csp.split(";").map((part) => {
    const [name, ...values] = part.trim().split(/\s+/);
    return [name, values];
  }));
  assert.deepEqual(directives["default-src"], ["'self'"]);
  assert.deepEqual(directives["object-src"], ["'none'"]);
  assert.deepEqual(directives["base-uri"], ["'none'"]);
  assert.deepEqual(directives["font-src"], ["'self'"]);
  assert.deepEqual(directives["connect-src"], ["'self'"]);
  // Geen eval en geen willekeurige inline scripts: alleen eigen bestanden en vaste hashes.
  assert.ok(!csp.includes("'unsafe-eval'"), "unsafe-eval is niet nodig");
  assert.ok(!directives["script-src"].includes("'unsafe-inline'"), "inline scripts alleen via hash");
});

test("de script-hashes in de CSP horen precies bij de inline scripts van index.html", () => {
  const html = indexHtml();
  const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.equal(inlineScripts.length, 2, "verwacht twee inline scripts (thema en file://-melding)");

  const expected = inlineScripts.map(sha256).sort();
  const actual = cspContent(html).split(";")
    .find((part) => part.trim().startsWith("script-src"))
    .trim().split(/\s+/)
    .filter((value) => value.startsWith("'sha256-"))
    .sort();
  assert.deepEqual(actual, expected,
    "Een inline script is gewijzigd: werk de sha256-hash in de CSP van index.html bij");
});

test("alle lettertypes uit @font-face bestaan en zijn echte woff2-bestanden", () => {
  const css = read("../assets/css/styles.css");
  const fontFaces = css.match(/@font-face\s*\{[^}]*\}/g) || [];
  assert.ok(fontFaces.length >= 2, "verwacht @font-face-regels voor DM Sans en Space Grotesk");

  const families = new Set();
  for (const rule of fontFaces) {
    families.add(rule.match(/font-family:\s*"([^"]+)"/)[1]);
    const urls = [...rule.matchAll(/url\("?([^")]+)"?\)/g)].map((match) => match[1]);
    assert.ok(urls.length > 0, "@font-face zonder bestand");
    for (const url of urls) {
      const relative = `../assets/css/${url}`;
      assert.ok(exists(relative), `lettertype ontbreekt: ${url}`);
      const start = fs.readFileSync(new URL(relative, import.meta.url)).subarray(0, 4).toString("latin1");
      assert.equal(start, "wOF2", `${url} is geen woff2-bestand`);
    }
  }
  assert.deepEqual([...families].sort(), ["DM Sans", "Space Grotesk"]);
});

test("face-api en alle modelbestanden staan lokaal in assets/vendor/face-api", async () => {
  const { FACE_DEMO } = await import("../assets/js/config.js");
  const libraryUrl = new URL(FACE_DEMO.libraryUrl);
  const modelUrl = new URL(FACE_DEMO.modelUrl);
  assert.equal(libraryUrl.protocol, "file:", "bibliotheek moet een lokaal pad zijn");
  assert.equal(modelUrl.protocol, "file:", "modellen moeten een lokaal pad zijn");
  assert.ok(fs.existsSync(libraryUrl), "face-api.esm.js ontbreekt");
  assert.ok(fs.existsSync(new URL("LICENSE", modelUrl)), "licentie van face-api ontbreekt");

  for (const model of ["tiny_face_detector_model", "face_landmark_68_tiny_model", "face_recognition_model"]) {
    const manifestUrl = new URL(`${model}-weights_manifest.json`, modelUrl);
    assert.ok(fs.existsSync(manifestUrl), `manifest ontbreekt: ${model}`);
    const shards = JSON.parse(fs.readFileSync(manifestUrl, "utf8")).flatMap((group) => group.paths);
    assert.ok(shards.length > 0, `manifest zonder gewichten: ${model}`);
    for (const shard of shards) {
      assert.ok(fs.existsSync(new URL(shard, modelUrl)), `modelbestand ontbreekt: ${shard}`);
    }
  }
});

test("de lokale face-api laadt geen andere bestanden via import", () => {
  const library = read("../assets/vendor/face-api/face-api.esm.js");
  assert.doesNotMatch(library, /(^|[;\n])\s*import\s*[\w{*][^;]*from\s*["']/);
});

test("de CI-workflow heeft alleen leesrechten en bewaart het token niet", () => {
  const workflow = read("../.github/workflows/ci.yml");
  assert.match(workflow, /^permissions:\s*\n\s+contents:\s*read/m);
  assert.match(workflow, /persist-credentials:\s*false/);
  assert.match(workflow, /branches: \["main", "development"\]/);
  assert.match(workflow, /timeout-minutes:/);
});

test("de meegeleverde face-api-bestanden hebben de controlegetallen uit de README", () => {
  const folder = new URL("../assets/vendor/face-api/", import.meta.url);
  const readme = fs.readFileSync(new URL("README.md", folder), "utf8");
  const rows = [...readme.matchAll(/\| `([^`]+)` \| `([0-9a-f]{64})` \|/g)];

  assert.ok(rows.length >= 8, "de README noemt alle bestanden");
  for (const [, file, expected] of rows) {
    const actual = crypto.createHash("sha256").update(fs.readFileSync(new URL(file, folder))).digest("hex");
    assert.equal(actual, expected, file);
  }
});
