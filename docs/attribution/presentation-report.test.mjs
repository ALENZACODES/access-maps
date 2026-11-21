import test from "node:test";import assert from "node:assert/strict";import {reportText,reportHtml,reportJson,reportTsv} from "./presentation-report.mjs";import {fixture} from "./presentation-fixture.mjs";
test("English report title",()=>assert.ok(reportText(fixture(),"en").includes("Notice presentation report")));
test("French report uses NBSP colon",()=>assert.ok(reportText(fixture(),"fr").includes("Présentation\u00a0:")));
test("HTML report escapes title",()=>{const x=fixture();x.label="<script>";assert.ok(reportHtml(x).includes("&lt;script&gt;"));});
test("HTML report script free",()=>assert.ok(!/<script\b/iu.test(reportHtml(fixture()))));
test("HTML report restrictive CSP",()=>assert.ok(reportHtml(fixture()).includes("default-src 'none'")));
test("JSON contains audit and coverage",()=>{const x=JSON.parse(reportJson(fixture()));assert.ok(x.audit&&x.coverage);});
test("TSV includes expected header",()=>assert.ok(reportTsv(fixture()).startsWith("noticeId\tsourceId\tviewId")));
test("TSV neutralizes formula prefix",()=>{const x=fixture();x.notices[0].text="=SUM(1,2)";assert.ok(reportTsv(x).includes("'=SUM"));});
