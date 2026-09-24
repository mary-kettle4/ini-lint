#!/usr/bin/env node
import { readFileSync } from "fs";
import { Finding } from "./parser";
import { lint } from "./lint";
import { Config, ConfigError, defaultConfigPath, loadConfig } from "./config";

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

function lintFile(filePath: string, config: Config | undefined): { errorCount: number } {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (err) {
    process.stderr.write(`ini-lint: cannot read ${filePath}: ${(err as Error).message}\n`);
    return { errorCount: 1 };
  }

  const findings = lint(text, config);
  if (findings.length === 0) return { errorCount: 0 };

  const sourceLines = splitSourceLines(text);
  let errorCount = 0;
  for (const finding of findings) {
    process.stdout.write(formatFinding(filePath, finding, sourceLines) + "\n\n");
    if (finding.severity === "error") errorCount++;
  }
  return { errorCount };
}

function parseArgs(argv: string[]): { files: string[]; configPath: string | undefined } | null {
  const files: string[] = [];
  let configPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--config") {
      configPath = argv[++i];
      if (configPath === undefined) {
        process.stderr.write("ini-lint: --config requires a path\n");
        return null;
      }
    } else {
      files.push(arg);
    }
  }

  return { files, configPath };
}

function main(): number {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed === null) return 2;
  const { files, configPath } = parsed;

  if (files.length === 0) {
    process.stderr.write("usage: ini-lint [--config <path>] <file.ini> [file2.ini ...]\n");
    return 2;
  }

  const resolvedConfigPath = configPath ?? defaultConfigPath(process.cwd()) ?? undefined;
  let config: Config | undefined;
  if (resolvedConfigPath !== undefined) {
    try {
      config = loadConfig(resolvedConfigPath);
    } catch (err) {
      if (err instanceof ConfigError) {
        process.stderr.write(`ini-lint: ${err.message}\n`);
        return 2;
      }
      throw err;
    }
  }

  let totalErrors = 0;
  for (const filePath of files) {
    const { errorCount } = lintFile(filePath, config);
    totalErrors += errorCount;
  }

  return totalErrors > 0 ? 1 : 0;
}

process.exitCode = main();
