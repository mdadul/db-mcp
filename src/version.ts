import { readFileSync } from "node:fs";
import { join } from "node:path";

// package.json sits one level above both src/ and dist/
export const VERSION: string = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8")
).version;
