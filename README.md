# ini-lint

A linter for INI files. It parses the file, checks it against a small set of
rules, and reports every finding with a line number, a column number, and the
offending source line printed with a caret under the exact character.

## why

INI has no real specification, so every implementation makes its own
decisions, and most of them fail quietly instead of loudly:

- a duplicate key silently overwrites the earlier one, and whichever parser
  reads the file next might pick the other one
- a duplicate section header just gets merged, so `[server]` appearing twice
  looks intentional until it isn't
- a missing `]` on a section header turns the rest of the file into garbage
  for parsers that don't validate it
- trailing whitespace after a value is invisible in most editors and can
  silently become part of the value

`ini-lint` does not try to fix any of this. It just tells you exactly where
the problem is so you can fix it yourself.

## usage

```
npx ts-node src/cli.ts config.ini
```

or, after `npm run build`:

```
node dist/cli.js config.ini
```

Given a file like this:

```ini
[server]
host = localhost
port = 8080
port = 8081

[server]
timeout = 30

[client
retries = 3
```

`ini-lint` reports:

```
config.ini:4:1: error: key "port" was already defined in section "server" at line 3 [duplicate-key]
4 | port = 8081
  | ^

config.ini:6:2: error: section "server" was already defined at line 1 [duplicate-section]
6 | [server]
  |  ^

config.ini:9:1: error: section header is missing its closing "]" [unclosed-section]
9 | [client
  | ^
```

## quoted and multi-line values

A value can be wrapped in double or single quotes to keep leading/trailing
whitespace that would otherwise be trimmed:

```ini
greeting = "  hello, world  "
path = 'C:\tools\bin'
```

Double-quoted values understand the usual escape sequences (`\n`, `\t`,
`\r`, `\\`, `\"`, `\0`); single-quoted values are taken literally, which
makes them a better fit for paths and anything else full of backslashes.
An unterminated quote is reported as `unterminated-quoted-value`.

An unquoted value can also span several lines: any line indented further
than the key it belongs to is folded into the value, joined with `\n`.

```ini
[server]
motd = welcome to the server
       please read the rules
       before you say anything
```

`motd` above parses as `"welcome to the server\nplease read the rules\nbefore you say anything"`.
Continuation stops at a blank line, a line indented no further than the
key, a comment, or a new section header.

## rules

| rule | severity |
| --- | --- |
| `duplicate-section` | error |
| `duplicate-key` | error |
| `unclosed-section` | error |
| `empty-section-name` | error |
| `empty-key` | error |
| `malformed-line` | error |
| `unterminated-quoted-value` | error |
| `trailing-content-after-section` | warning |
| `trailing-content-after-value` | warning |
| `unknown-escape-sequence` | warning |
| `trailing-whitespace` | warning |

## library use

`src/lint.ts` exports `lint(text: string): Finding[]` independently of the
CLI, so it can be run against in-memory strings (for example, in a test or an
editor plugin) without touching the filesystem.

## known limitations

Inline comments after a value (`key = value ; note`) are treated as part of
the value, since not every INI dialect agrees that `;` starts a comment
mid-line. See the roadmap for where this is headed next.

## status

Quoted and multi-line values are supported. No config file for
enabling/disabling rules yet, and no inline-comment handling after an
unquoted value.
