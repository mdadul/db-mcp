export interface SqlStatement {
  text: string;
  from: number;
  to: number;
}

const SQL_QUOTE_STARTS = new Set(["'", '"', "`"]);

/** Splits SQL on semicolons outside strings, quoted identifiers and comments. */
export function splitStatements(sql: string): SqlStatement[] {
  const result: SqlStatement[] = [];
  const push = (from: number, to: number) => {
    const text = sql.slice(from, to).trim().replace(/;\s*$/, "").trim();
    if (text) result.push({ text, from, to });
  };
  let start = 0;
  let quote: string | null = null;
  let index = 0;
  while (index < sql.length) {
    const char = sql[index]!;
    const next = sql[index + 1];
    if (quote) {
      if (char === quote) {
        if (sql[index + 1] === quote) {
          index += 2;
          continue;
        }
        quote = null;
      }
      index += 1;
      continue;
    }
    if (char === "-" && next === "-") {
      const end = sql.indexOf("\n", index);
      index = end === -1 ? sql.length : end;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = sql.indexOf("*/", index + 2);
      index = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (SQL_QUOTE_STARTS.has(char)) {
      quote = char;
      index += 1;
      continue;
    }
    if (char === ";") {
      push(start, index + 1);
      start = index + 1;
    }
    index += 1;
  }
  push(start, sql.length);
  return result;
}

/** The statement that contains the cursor, or the nearest one before it. */
export function statementAt(sql: string, cursor: number): SqlStatement | undefined {
  const statements = splitStatements(sql);
  return (
    statements.find((statement) => cursor >= statement.from && cursor <= statement.to) ??
    statements.filter((statement) => statement.to <= cursor).at(-1) ??
    statements[0]
  );
}

const WRITE_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|MERGE|REPLACE|ATTACH|PRAGMA)\b/i;

/** Returns the first data-changing keyword in a statement, if any. */
export function writeKeywordIn(sql: string): string | null {
  const match = WRITE_KEYWORDS.exec(sql);
  return match ? match[1]!.toUpperCase() : null;
}

const SQL_TOKEN =
  /'(?:''|[^'])*'|"(?:""|[^"])*"|`[^`]*`|--[^\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|<>|!=|<=|>=|::|\|\||\S/g;
const CLAUSE_WORDS = new Set([
  "SELECT",
  "FROM",
  "WHERE",
  "GROUP",
  "HAVING",
  "ORDER",
  "LIMIT",
  "OFFSET",
  "UNION",
  "VALUES",
  "SET",
  "WITH",
]);
const JOIN_PREFIXES = new Set(["LEFT", "RIGHT", "INNER", "FULL", "CROSS", "OUTER"]);
const KEYWORDS = new Set([
  ...CLAUSE_WORDS,
  ...JOIN_PREFIXES,
  "JOIN",
  "BY",
  "ALL",
  "AND",
  "OR",
  "ON",
  "AS",
  "IN",
  "NOT",
  "NULL",
  "IS",
  "LIKE",
  "BETWEEN",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "DISTINCT",
  "ASC",
  "DESC",
  "EXISTS",
  "INSERT",
  "UPDATE",
  "DELETE",
  "INTO",
  "DROP",
  "CREATE",
  "ALTER",
  "TABLE",
]);
const NO_SPACE_BEFORE = new Set([",", ")", ".", ";", "::"]);
const NO_SPACE_AFTER = new Set(["(", "."]);

/** Light SQL formatter. Uppercases keywords, starts a line at each major clause and indents AND/OR. Quoted text and comments are kept as written. */
export function formatSql(sql: string): string {
  const tokens = sql.match(SQL_TOKEN) ?? [];
  const lines: string[] = [];
  let line = "";
  const flush = () => {
    if (line.trim()) lines.push(line.trimEnd());
    line = "";
  };

  tokens.forEach((token, index) => {
    const isWord = /^[A-Za-z_]/.test(token);
    const upper = token.toUpperCase();
    const previous = index > 0 ? tokens[index - 1]! : "";
    const previousUpper = previous.toUpperCase();
    const nextUpper = tokens[index + 1]?.toUpperCase() ?? "";

    const startsJoin = isWord && JOIN_PREFIXES.has(upper) && nextUpper === "JOIN";
    const startsClause =
      isWord &&
      (CLAUSE_WORDS.has(upper) || (upper === "JOIN" && !JOIN_PREFIXES.has(previousUpper)));
    if (startsJoin || startsClause) flush();
    if (isWord && (upper === "AND" || upper === "OR")) {
      flush();
      line = "  ";
    }

    const word = isWord && KEYWORDS.has(upper) ? upper : token;
    const noSpace =
      NO_SPACE_BEFORE.has(token) ||
      NO_SPACE_AFTER.has(previous) ||
      (token === "(" && /^[A-Za-z_]/.test(previous) && !KEYWORDS.has(previousUpper));
    line = line.trim() === "" ? line + word : line + (noSpace ? "" : " ") + word;
    if (token.startsWith("--")) flush();
  });
  flush();
  return lines.join("\n");
}
