#!/usr/bin/env node
import { readFileSync } from "fs";
import { Finding } from "./parser";
import { lint } from "./lint";

function splitSourceLines(text: string): string[] {
  const stripped = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return stripped.split(/\r\n|\r|\n/);
}

function formatFinding(filePath: string, finding: Finding, sourceLines: string[]): string {
  const header = `${filePath}:${finding.line}:${finding.column}: ${finding.severity}: ${finding.message} [${finding.rule}]`;
  const sourceLine = sourceLines[finding.line - 1] ?? "";
  const lineNumberStr = String(finding.line);
  const gutter = `${lineNumberStr} | `;
  const caretIndent = " ".repeat(Math.max(finding.column - 1, 0));
  const caretLine = `${" ".repeat(lineNumberStr.length)} | ${caretIndent}^`;
  return `${header}\n${gutter}${sourceLine}\n${caretLine}`;
}

function lintFile(filePath: string): { errorCount: number } {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (err) {
    process.stderr.write(`ini-lint: cannot read ${filePath}: ${(err as Error).message}\n`);
    return { errorCount: 1 };
  }

  const findings = lint(text);
  if (findings.length === 0) return { errorCount: 0 };

  const sourceLines = splitSourceLines(text);
  let errorCount = 0;
  for (const finding of findings) {
    process.stdout.write(formatFinding(filePath, finding, sourceLines) + "\n\n");
    if (finding.severity === "error") errorCount++;
  }
  return { errorCount };
}

function main(): number {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    process.stderr.write("usage: ini-lint <file.ini> [file2.ini ...]\n");
    return 2;
  }

  let totalErrors = 0;
  for (const filePath of files) {
    const { errorCount } = lintFile(filePath);
    totalErrors += errorCount;
  }

  return totalErrors > 0 ? 1 : 0;
}

process.exitCode = main();
