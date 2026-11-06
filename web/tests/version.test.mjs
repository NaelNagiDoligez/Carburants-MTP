import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("la version inscrite dans app.js est celle du service worker", () => {
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8").match(/CACHE\s*=\s*"([^"]+)"/)?.[1];
  const app = readFileSync(new URL("../app.js", import.meta.url), "utf8").match(/const BUILD\s*=\s*"([^"]+)"/)?.[1];
  assert.ok(sw && app);
  assert.equal(app, sw);
});
