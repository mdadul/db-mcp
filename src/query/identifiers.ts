import type { DbEngineType } from "../api/routes/databases/types.ts";
import { BadRequestError } from "../errors.ts";

export function quoteIdentifier(value: string, engine: DbEngineType): string {
  if (!value)
    throw new BadRequestError(
      "Identifier cannot be empty",
      "Choose a schema, table, or column name from the schema tree.",
    );
  const quote = engine === "mysql" ? "`" : '"';
  return `${quote}${value.replaceAll(quote, quote + quote)}${quote}`;
}
