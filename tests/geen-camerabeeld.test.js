// Tests voor gezichtsherkenning zonder camerabeeld (besluit van de administratie van 25 november 2026,
// punt 1 en 2): het camerabeeld is nooit te zien, en er staat een vaste zin dat er wordt gescand voor
// de consumptieregistratie.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { StandbyController } from "../assets/js/controllers/StandbyController.js";
import { readAllCss } from "./helpers.js";

const NOTICE = "Deze tablet scant gezichten voor de consumptieregistratie. Het camerabeeld wordt niet getoond en niet bewaard.";
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

// Alle CSS-regels met hun selector en inhoud.
const rules = () => [...readAllCss().replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, body]) => ({ selector: selector.trim(), body: body.replace(/\s+/g, "") }));

test("geen camerabeeld: de video op het startscherm en in het cameravenster is altijd onzichtbaar", () => {
  const all = rules();
  const startVideo = all.find((rule) => rule.selector === ".start-oval video");
  const faceVideo = all.find((rule) => rule.selector === ".face-frame video");

  assert.ok(startVideo.body.includes("opacity:0"), startVideo.body);
  assert.ok(faceVideo.body.includes("opacity:0"), faceVideo.body);
  // Geen enkele regel maakt een video weer zichtbaar, ook niet als de camera aan staat.
  for (const rule of all.filter((item) => /video/.test(item.selector))) {
    assert.ok(!/opacity:(?!0[;}]|0$)/.test(rule.body), `${rule.selector} maakt de video zichtbaar: ${rule.body}`);
    assert.ok(!/visibility:visible/.test(rule.body), rule.selector);
  }
  assert.ok(!all.some((rule) => rule.selector.includes("has-camera") && rule.selector.includes("video")), "een regel voor has-camera raakt de video");
});

test("geen camerabeeld: in het ovaal en in het cameravenster staat altijd een icoon", () => {
  const all = rules();
  const hiddenIcon = all.find((rule) => rule.selector.includes(".start-oval-icon") && rule.body.includes("display:none"));

  assert.equal(hiddenIcon, undefined, "het icoon in het ovaal verdwijnt als de camera aan staat");
  assert.ok(/<span class="face-frame-icon" aria-hidden="true" data-icon="faceScan"><\/span>/.test(html));
  assert.ok(/<video id="faceVideo" autoplay muted playsinline aria-hidden="true"><\/video>/.test(html));
  assert.ok(/<video id="startVideo" autoplay muted playsinline aria-hidden="true"><\/video>/.test(html));
});

test("vaste zin: op het startscherm en in het cameravenster staat dat er wordt gescand voor de consumptieregistratie", () => {
  assert.equal(StandbyController.TEXTS.scanNotice, NOTICE);
  assert.equal(StandbyController.TEXTS.privacyAuto, NOTICE);
  assert.ok(html.includes(`<p class="face-notice" id="faceNotice">${NOTICE}</p>`));
});
