// Tests voor ThemeManager: welk thema hoort bij welke instelling en welk tijdstip.
import test from "node:test";
import assert from "node:assert/strict";

import { ThemeManager } from "../assets/js/ThemeManager.js";
import { fakeLocalStorage } from "./helpers.js";

// Datums in lokale tijd: new Date(jaar, maand (0 = januari), dag, uur, minuut).
const januaryEvening = new Date(2026, 0, 15, 17, 30);
const juneEvening = new Date(2026, 5, 15, 17, 30);

test("zonder opgeslagen instelling volgt het thema het systeem", () => {
  fakeLocalStorage();

  assert.equal(new ThemeManager().loadMode(), "system");
});

test("een ongeldige opgeslagen instelling wordt 'system'", () => {
  fakeLocalStorage();
  localStorage.setItem(ThemeManager.STORAGE_KEY, "paars");

  assert.equal(new ThemeManager().loadMode(), "system");
});

test("de gekozen instelling wordt onthouden", () => {
  fakeLocalStorage();
  const theme = new ThemeManager();

  theme.mode = "auto";
  theme.saveMode();

  assert.equal(new ThemeManager().loadMode(), "auto");
});

test("opslaan zonder toegang tot de opslag geeft geen fout", () => {
  fakeLocalStorage({ failSet: true });
  const theme = new ThemeManager();
  theme.mode = "dark";

  assert.doesNotThrow(() => theme.saveMode());
});

test("systeem: het thema volgt de instelling van het apparaat", () => {
  const theme = new ThemeManager();

  assert.equal(theme.resolveTheme("system", true, juneEvening), "dark");
  assert.equal(theme.resolveTheme("system", false, januaryEvening), "light");
});

test("licht en donker (slider) negeren systeem en tijdstip", () => {
  const theme = new ThemeManager();

  assert.equal(theme.resolveTheme("light", true, januaryEvening), "light");
  assert.equal(theme.resolveTheme("dark", false, juneEvening), "dark");
});

test("auto: om half zes is het in januari donker en in juni licht", () => {
  const theme = new ThemeManager();

  assert.equal(theme.resolveTheme("auto", false, januaryEvening), "dark");
  assert.equal(theme.resolveTheme("auto", true, juneEvening), "light");
});

test("auto: 's nachts en vroeg in de ochtend is het donker", () => {
  const theme = new ThemeManager();

  assert.equal(theme.isDarkOutside(new Date(2026, 5, 15, 23, 0)), true);
  assert.equal(theme.isDarkOutside(new Date(2026, 5, 15, 4, 30)), true);
  assert.equal(theme.isDarkOutside(new Date(2026, 5, 15, 12, 0)), false);
});

test("auto: precies op het moment van zonsondergang wordt het donker", () => {
  const theme = new ThemeManager();

  // In september is zonsondergang volgens de tabel om 19:55.
  assert.equal(theme.isDarkOutside(new Date(2026, 8, 15, 19, 54)), false);
  assert.equal(theme.isDarkOutside(new Date(2026, 8, 15, 19, 55)), true);
});

test("toMinutes zet een tijd om naar minuten na middernacht", () => {
  const theme = new ThemeManager();

  assert.equal(theme.toMinutes("00:00"), 0);
  assert.equal(theme.toMinutes("18:45"), 1125);
});
