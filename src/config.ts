import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { Severity } from "./parser";
import { ALL_RULES } from "./lint";

export type RuleSetting = "off" | Severity;

export interface Config {
  rules: Record<string, RuleSetting>;
}

const CONFIG_FILE_NAME = ".ini-lintrc.json";
const VALID_SETTINGS: ReadonlySet<string> = new Set(["off", "warning", "error"]);

export class ConfigError extends Error {}

// Looks for .ini-lintrc.json directly in cwd. Deliberately does not walk up
// parent directories: this tool is meant to be run from the project root
// where the ini files live, and an implicit upward search makes it too easy
// to pick up a stray config from an unrelated ancestor directory.
export function defaultConfigPath(cwd: string): string | null {
  const candidate = join(cwd, CONFIG_FILE_NAME);
  return existsSync(candidate) ? candidate : null;
}

export function loadConfig(configPath: string): Config {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch (err) {
    throw new ConfigError(`cannot read ${configPath}: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`${configPath} is not valid JSON: ${(err as Error).message}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ConfigError(`${configPath} must contain a JSON object`);
  }

  const rulesValue = (parsed as Record<string, unknown>).rules;
  if (rulesValue === undefined) {
    return { rules: {} };
  }
  if (typeof rulesValue !== "object" || rulesValue === null || Array.isArray(rulesValue)) {
    throw new ConfigError(`${configPath}: "rules" must be an object`);
  }

  const rules: Record<string, RuleSetting> = {};
  for (const [ruleName, setting] of Object.entries(rulesValue as Record<string, unknown>)) {
    if (!ALL_RULES.includes(ruleName)) {
      throw new ConfigError(`${configPath}: unknown rule "${ruleName}"`);
    }
    if (typeof setting !== "string" || !VALID_SETTINGS.has(setting)) {
      throw new ConfigError(
        `${configPath}: rule "${ruleName}" must be set to "off", "warning", or "error"`
      );
    }
    rules[ruleName] = setting as RuleSetting;
  }

  return { rules };
}
