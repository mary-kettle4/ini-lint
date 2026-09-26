import test from "node:test";
import assert from "node:assert/strict";
import { lint, Finding } from "./lint";
import type { Config } from "./config";

function findRule(findings: Finding[], rule: string): Finding | undefined {
  return findings.find((f) => f.rule === rule);
}

test("a well-formed file produces no findings", () => {
  const text = ["[server]", "host = localhost", "port = 8080"].join("\n");
  assert.deepEqual(lint(text), []);
});

test("duplicate-key: reports the second definition of a key in the same section", () => {
  const text = ["[server]", "port = 8080", "port = 8081"].join("\n");
  const finding = findRule(lint(text), "duplicate-key");
  assert.ok(finding);
  assert.equal(finding!.severity, "error");
  assert.equal(finding!.line, 3);
  assert.equal(finding!.column, 1);
  assert.match(finding!.message, /already defined.*line 2/);
});

test("duplicate-section: section names are compared case-insensitively", () => {
  const text = ["[Server]", "[server]"].join("\n");
  const finding = findRule(lint(text), "duplicate-section");
  assert.ok(finding);
  assert.equal(finding!.severity, "error");
  assert.equal(finding!.line, 2);
  assert.equal(finding!.column, 2);
});

test("unclosed-section: missing closing bracket", () => {
  const finding = findRule(lint("[client"), "unclosed-section");
  assert.ok(finding);
  assert.equal(finding!.severity, "error");
  assert.equal(finding!.line, 1);
  assert.equal(finding!.column, 1);
});

test("empty-section-name: brackets with nothing between them", () => {
  const finding = findRule(lint("[]"), "empty-section-name");
  assert.ok(finding);
  assert.equal(finding!.severity, "error");
  assert.equal(finding!.line, 1);
  assert.equal(finding!.column, 1);
});

test("empty-key: a bare = with nothing before it", () => {
  const finding = findRule(lint("= value"), "empty-key");
  assert.ok(finding);
  assert.equal(finding!.severity, "error");
  assert.equal(finding!.line, 1);
  assert.equal(finding!.column, 1);
});

test("malformed-line: a line that is neither a comment, section, nor key=value", () => {
  const finding = findRule(lint("just some text"), "malformed-line");
  assert.ok(finding);
  assert.equal(finding!.severity, "error");
  assert.equal(finding!.line, 1);
  assert.equal(finding!.column, 1);
});

test("unterminated-quoted-value: opening quote never closes", () => {
  const finding = findRule(lint('key = "unterminated'), "unterminated-quoted-value");
  assert.ok(finding);
  assert.equal(finding!.severity, "error");
  assert.equal(finding!.line, 1);
  assert.equal(finding!.column, 7);
});

test("trailing-content-after-section: text after the closing bracket", () => {
  const finding = findRule(lint("[server]extra"), "trailing-content-after-section");
  assert.ok(finding);
  assert.equal(finding!.severity, "warning");
  assert.equal(finding!.line, 1);
  assert.equal(finding!.column, 9);
});

test("trailing-content-after-value: text after a closed quoted value", () => {
  const finding = findRule(lint('key = "value"extra'), "trailing-content-after-value");
  assert.ok(finding);
  assert.equal(finding!.severity, "warning");
  assert.equal(finding!.line, 1);
  assert.equal(finding!.column, 14);
});

test("unknown-escape-sequence: a backslash followed by a letter with no meaning", () => {
  const finding = findRule(lint('key = "\\q"'), "unknown-escape-sequence");
  assert.ok(finding);
  assert.equal(finding!.severity, "warning");
  assert.equal(finding!.line, 1);
  assert.equal(finding!.column, 8);
  assert.match(finding!.message, /\\q/);
});

test("trailing-whitespace: whitespace after the last non-space character", () => {
  const finding = findRule(lint("key = value  "), "trailing-whitespace");
  assert.ok(finding);
  assert.equal(finding!.severity, "warning");
  assert.equal(finding!.line, 1);
  assert.equal(finding!.column, 12);
});

test("config: a rule set to off is dropped from the results", () => {
  const config: Config = { rules: { "trailing-whitespace": "off" } };
  assert.equal(findRule(lint("key = value  ", config), "trailing-whitespace"), undefined);
});

test("config: a rule's severity can be overridden", () => {
  const config: Config = { rules: { "unknown-escape-sequence": "error" } };
  const finding = findRule(lint('key = "\\q"', config), "unknown-escape-sequence");
  assert.ok(finding);
  assert.equal(finding!.severity, "error");
});
