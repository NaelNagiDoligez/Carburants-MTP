import { test } from "node:test";
import assert from "node:assert/strict";
import { matchVehicle } from "../catalog.js";

test("reconnaît un modèle dans un nom libre", () => {
  assert.equal(matchVehicle("Ma MT-07", 2022).name, "Yamaha MT-07");
  assert.equal(matchVehicle("la clio de papa", 2016).tank, 45);
  assert.equal(matchVehicle("CFMoto 450MT", 2026).tank, 17.5);
});

test("l'année choisit la génération", () => {
  assert.equal(matchVehicle("Clio", 2021).tank, 42);
  assert.equal(matchVehicle("208", 2015).tank, 50);
  assert.equal(matchVehicle("208", 2015).yearUsed, true);
  const noYear = matchVehicle("MT-09", "");
  assert.equal(noYear.from, 2021);
  assert.equal(noYear.yearUsed, false);
});

test("ne confond pas les modèles proches", () => {
  assert.equal(matchVehicle("Peugeot 2008", 2022).name, "Peugeot 2008");
  assert.equal(matchVehicle("Honda CB500X", 2019).name, "Honda NX500");
  assert.equal(matchVehicle("Honda CB500F", 2019).name, "Honda CB500F");
  assert.equal(matchVehicle("Ma bécane", 2020), null);
  assert.equal(matchVehicle("", 2020), null);
});
