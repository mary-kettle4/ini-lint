export type Severity = "error" | "warning";

export interface Position {
  line: number; // 1-based
  column: number; // 1-based
}

export interface Finding {
  severity: Severity;
  rule: string;
  message: string;
  line: number;
  column: number;
}

export interface SectionEntry {
  name: string;
  pos: Position;
}

export interface KeyEntry {
  key: string;
  keyPos: Position;
  value: string;
  valuePos: Position;
  section: string | null;
}

export interface ParseResult {
  sections: SectionEntry[];
  keys: KeyEntry[];
  findings: Finding[];
}

function splitLines(text: string): string[] {
  // A leading BOM is common in INI files saved by Windows editors and
  // would otherwise shift every column on line 1 by one character.
  const stripped = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return stripped.split(/\r\n|\r|\n/);
}

export function parseIni(text: string): ParseResult {
  const findings: Finding[] = [];
  const sections: SectionEntry[] = [];
  const keys: KeyEntry[] = [];
  const lines = splitLines(text);

  let currentSection: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const raw = lines[i];
    const firstNonSpace = raw.search(/\S/);

    if (firstNonSpace === -1) continue; // blank line

    const trailingMatch = raw.match(/\s+$/);
    if (trailingMatch) {
      findings.push({
        severity: "warning",
        rule: "trailing-whitespace",
        message: "line has trailing whitespace",
        line: lineNumber,
        column: raw.length - trailingMatch[0].length + 1,
      });
    }

    const ch = raw[firstNonSpace];

    if (ch === ";" || ch === "#") continue; // comment line

    if (ch === "[") {
      const closeIdx = raw.indexOf("]", firstNonSpace);
      if (closeIdx === -1) {
        findings.push({
          severity: "error",
          rule: "unclosed-section",
          message: 'section header is missing its closing "]"',
          line: lineNumber,
          column: firstNonSpace + 1,
        });
        continue;
      }

      const name = raw.slice(firstNonSpace + 1, closeIdx).trim();
      const after = raw.slice(closeIdx + 1).trim();

      if (name.length === 0) {
        findings.push({
          severity: "error",
          rule: "empty-section-name",
          message: "section name is empty",
          line: lineNumber,
          column: firstNonSpace + 1,
        });
      }

      if (after.length > 0 && !after.startsWith(";") && !after.startsWith("#")) {
        findings.push({
          severity: "warning",
          rule: "trailing-content-after-section",
          message: `unexpected content after section header: "${after}"`,
          line: lineNumber,
          column: closeIdx + 2,
        });
      }

      sections.push({ name, pos: { line: lineNumber, column: firstNonSpace + 2 } });
      currentSection = name;
      continue;
    }

    const eqIdx = raw.indexOf("=");
    if (eqIdx === -1) {
      findings.push({
        severity: "error",
        rule: "malformed-line",
        message: "line is not a comment, section header, or key=value pair",
        line: lineNumber,
        column: firstNonSpace + 1,
      });
      continue;
    }

    const rawKey = raw.slice(0, eqIdx);
    const keyTrimmed = rawKey.trim();
    if (keyTrimmed.length === 0) {
      findings.push({
        severity: "error",
        rule: "empty-key",
        message: "key is empty",
        line: lineNumber,
        column: eqIdx + 1,
      });
      continue;
    }
    const keyStart = rawKey.search(/\S/);

    const rawValue = raw.slice(eqIdx + 1);
    const valueStart = rawValue.search(/\S/);
    const value = rawValue.trim();
    const valueColumn = valueStart === -1 ? eqIdx + 2 : eqIdx + 2 + valueStart;

    keys.push({
      key: keyTrimmed,
      keyPos: { line: lineNumber, column: keyStart + 1 },
      value,
      valuePos: { line: lineNumber, column: valueColumn },
      section: currentSection,
    });
  }

  return { sections, keys, findings };
}
