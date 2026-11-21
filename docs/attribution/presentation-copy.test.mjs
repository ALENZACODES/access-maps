import test from "node:test";import assert from "node:assert/strict";import {COPY,localeFromSearch,localizedLabel} from "./presentation-copy.mjs";
test("English and French key sets match",()=>assert.deepEqual(Object.keys(COPY.en).sort(),Object.keys(COPY.fr).sort()));
test("French locale accepted",()=>assert.equal(localeFromSearch("?lang=fr"),"fr"));
test("unsupported locale falls back",()=>assert.equal(localeFromSearch("?lang=fr-CA"),"en"));
test("French label has NBSP",()=>assert.equal(localizedLabel("Licence","ODbL","fr"),"Licence\u00a0: ODbL"));
test("English label has ASCII colon",()=>assert.equal(localizedLabel("Licence","ODbL","en"),"Licence: ODbL"));
test("French curly apostrophe",()=>assert.ok(COPY.fr.intro.includes("l’échelle")));
test("prohibited phrases absent",()=>assert.ok(!/vérif|verify|real-time|partnership|guarantee/iu.test(JSON.stringify(COPY))));
