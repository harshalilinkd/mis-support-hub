import test from "node:test";
import assert from "node:assert/strict";

import { systemTypeFromUrl } from "./systems";

/**
 * Guardrail tests for the §13 system-type guess (P16). Pure — no DB.
 * Run with `npm test`.
 */

test("recognises the two Google surfaces MIS actually builds on", () => {
  assert.equal(
    systemTypeFromUrl("https://docs.google.com/spreadsheets/d/abc123/edit"),
    "SHEET"
  );
  assert.equal(
    systemTypeFromUrl("https://script.google.com/home/projects/xyz/edit"),
    "APPS_SCRIPT"
  );
  assert.equal(systemTypeFromUrl("https://po.example.com/app"), "WEB_APP");
});

test("docs.google.com is only a SHEET when it is actually a spreadsheet", () => {
  // docs.google.com also serves Docs, Slides and Forms — calling those a Sheet
  // would quietly mis-file them.
  assert.equal(systemTypeFromUrl("https://docs.google.com/document/d/a/edit"), "OTHER");
  assert.equal(
    systemTypeFromUrl("https://docs.google.com/forms/d/a/viewform"),
    "OTHER"
  );
});

test("matches on hostname, not substring", () => {
  // Regression: a naive url.includes("script.google.com") would classify these as
  // Google-hosted. The host is the only trustworthy part of a URL here.
  assert.equal(systemTypeFromUrl("https://evil.test/?x=script.google.com"), "WEB_APP");
  assert.equal(
    systemTypeFromUrl("https://docs.google.com.evil.test/spreadsheets/d/a"),
    "WEB_APP"
  );
  // A subdomain of the real host is still not the real host.
  assert.equal(systemTypeFromUrl("https://evil.docs.google.com/spreadsheets/d/a"), "WEB_APP");
});

test("returns null while the URL is still being typed", () => {
  // People type character by character; a half-URL must not churn the select.
  assert.equal(systemTypeFromUrl(""), null);
  assert.equal(systemTypeFromUrl("https:/"), null);
  assert.equal(systemTypeFromUrl("docs.google.com/spreadsheets"), null); // no scheme yet
  assert.equal(systemTypeFromUrl("   "), null);
});

test("is case- and whitespace-tolerant on the host", () => {
  assert.equal(
    systemTypeFromUrl("  HTTPS://DOCS.GOOGLE.COM/spreadsheets/d/a/edit  "),
    "SHEET"
  );
});
