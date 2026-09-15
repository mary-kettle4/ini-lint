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

const ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  "0": "\0",
  "\\": "\\",
  '"': '"',
};

// Parses a quoted value starting at rawValue[startIdx] (the opening quote).
// Only double-quoted values process escape sequences; single-quoted values
// are literal, which matches the common convention that single quotes are
// for values that need to keep backslashes intact (paths, regexes).
function parseQuotedValue(
  rawValue: string,
  startIdx: number,
  quote: string,
  lineNumber: number,
  valueColumn: number,
  findings: Finding[]
): { value: string; endIdx: number } {
  let value = "";
  let i = startIdx + 1;
  let closed = false;

  while (i < rawValue.length) {
    const c = rawValue[i];

    if (c === quote) {
      closed = true;
      i++;
      break;
    }

    if (quote === '"' && c === "\\") {
      const next = rawValue[i + 1];
      if (next === undefined) {
        findings.push({
          severity: "warning",
          rule: "unknown-escape-sequence",
          message: "backslash at end of quoted value has nothing to escape",
          line: lineNumber,
          column: valueColumn + (i - startIdx),
        });
        value += "\\";
        i++;
        continue;
      }
      const replacement = ESCAPES[next];
      if (replacement === undefined) {
        findings.push({
          severity: "warning",
          rule: "unknown-escape-sequence",
          message: `unknown escape sequence "\\${next}"`,
          line: lineNumber,
          column: valueColumn + (i - startIdx),
        });
        value += next;
      } else {
        value += replacement;
      }
      i += 2;
      continue;
    }

    value += c;
    i++;
  }

  if (!closed) {
    findings.push({
      severity: "error",
      rule: "unterminated-quoted-value",
      message: `quoted value is missing its closing ${quote}`,
      line: lineNumber,
      column: valueColumn,
    });
  }

  return { value, endIdx: i };
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
    const valueColumn = valueStart === -1 ? eqIdx + 2 : eqIdx + 2 + valueStart;

    let value: string;
    let quoted = false;

    if (valueStart !== -1 && (rawValue[valueStart] === '"' || rawValue[valueStart] === "'")) {
      quoted = true;
      const quote = rawValue[valueStart];
      const parsed = parseQuotedValue(rawValue, valueStart, quote, lineNumber, valueColumn, findings);
      value = parsed.value;

      const afterRaw = rawValue.slice(parsed.endIdx);
      const afterStart = afterRaw.search(/\S/);
      if (afterStart !== -1) {
        const after = afterRaw.trim();
        if (!after.startsWith(";") && !after.startsWith("#")) {
          findings.push({
            severity: "warning",
            rule: "trailing-content-after-value",
            message: `unexpected content after quoted value: "${after}"`,
            line: lineNumber,
            column: eqIdx + 2 + parsed.endIdx + afterStart,
          });
        }
      }
    } else {
      value = rawValue.trim();
    }

    // A value continues onto following lines as long as each one is
    // indented further than the key itself: this lets a value like a
    // multi-line certificate or list span several lines without needing
    // an escape character at the end of every one. Quoted values are
    // self-contained and never continue this way.
    if (!quoted) {
      let j = i + 1;
      const continuationLines: string[] = [];
      while (j < lines.length) {
        const nextRaw = lines[j];
        const nextFirstNonSpace = nextRaw.search(/\S/);
        if (nextFirstNonSpace === -1) break;
        if (nextFirstNonSpace <= keyStart) break;
        const nextCh = nextRaw[nextFirstNonSpace];
        if (nextCh === ";" || nextCh === "#" || nextCh === "[") break;
        continuationLines.push(nextRaw.slice(nextFirstNonSpace).replace(/\s+$/, ""));
        j++;
      }
      if (continuationLines.length > 0) {
        value = [value, ...continuationLines].join("\n");
        i = j - 1;
      }
    }

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
