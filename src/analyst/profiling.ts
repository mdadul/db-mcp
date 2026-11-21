export type ProfileType = "number" | "integer" | "text" | "date" | "boolean" | "json";

export interface ColumnProfile {
  column: string;
  type: ProfileType;
  count: number;
  nulls: number;
  nullPercent: number;
  distinct: { value: number; approximate: boolean };
  min?: number | string;
  max?: number | string;
  mean?: number;
  median?: number;
  p25?: number;
  p75?: number;
  stddev?: number;
  topValues?: { value: unknown; count: number }[];
  histogram?: { start: number | string; end: number | string; count: number }[];
}

const DISTINCT_EXACT_LIMIT = 10_000;
const HISTOGRAM_BUCKET_LIMIT = 12;
const LOW_CARDINALITY_LIMIT = 100;

export function profileRows(
  columns: { name: string }[],
  rows: Record<string, unknown>[],
  selectedColumns?: string[],
): ColumnProfile[] {
  const selected = selectedColumns ? new Set(selectedColumns) : null;
  return columns.filter(({ name }) => !selected || selected.has(name)).map(({ name }) => profileColumn(name, rows.map((row) => row[name])));
}

export function profileColumn(column: string, values: unknown[]): ColumnProfile {
  const nonNull = values.filter((value) => value !== null && value !== undefined);
  const type = guessType(nonNull);
  const exactValues = new Set<string>();
  for (const value of nonNull) {
    exactValues.add(canonicalValue(value));
    if (exactValues.size > DISTINCT_EXACT_LIMIT) break;
  }
  const profile: ColumnProfile = {
    column,
    type,
    count: values.length,
    nulls: values.length - nonNull.length,
    nullPercent: values.length === 0 ? 0 : round((values.length - nonNull.length) / values.length * 100, 2),
    distinct: exactValues.size <= DISTINCT_EXACT_LIMIT
      ? { value: exactValues.size, approximate: false }
      : { value: estimateDistinct(nonNull), approximate: true },
  };

  if (type === "number" || type === "integer") {
    const numbers = nonNull.map(toNumber).filter((value): value is number => value !== null).sort((a, b) => a - b);
    if (numbers.length) {
      const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
      profile.min = numbers[0]!;
      profile.max = numbers.at(-1)!;
      profile.mean = round(mean);
      profile.median = percentile(numbers, 0.5);
      profile.p25 = percentile(numbers, 0.25);
      profile.p75 = percentile(numbers, 0.75);
      profile.stddev = round(Math.sqrt(numbers.reduce((sum, value) => sum + (value - mean) ** 2, 0) / numbers.length));
      profile.histogram = makeHistogram(numbers);
    }
  } else if (type === "date") {
    const dates = nonNull.map(toDate).filter((value): value is number => value !== null).sort((a, b) => a - b);
    if (dates.length) {
      profile.min = new Date(dates[0]!).toISOString();
      profile.max = new Date(dates.at(-1)!).toISOString();
      profile.histogram = makeHistogram(dates).map((bucket) => ({
        ...bucket,
        start: new Date(bucket.start).toISOString(),
        end: new Date(bucket.end).toISOString(),
      }));
    }
  } else if (type === "text" && exactValues.size <= LOW_CARDINALITY_LIMIT) {
    profile.topValues = topValues(nonNull);
  }
  return profile;
}

function guessType(values: unknown[]): ProfileType {
  if (values.length === 0) return "text";
  if (values.every((value) => typeof value === "boolean" || value === 0 || value === 1 || value === "true" || value === "false")) return "boolean";
  if (values.every((value) => typeof value === "number" && Number.isFinite(value) || typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))) {
    return values.every((value) => Number.isInteger(Number(value))) ? "integer" : "number";
  }
  if (values.every((value) => toDate(value) !== null)) return "date";
  if (values.every((value) => typeof value === "object" || typeof value === "string" && isJson(value))) return "json";
  return "text";
}

function isJson(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object";
  } catch {
    return false;
  }
}

function canonicalValue(value: unknown): string {
  if (value && typeof value === "object") {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return `${typeof value}:${String(value)}`;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function toDate(value: unknown): number | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:[T ][\s\S]*)?$/.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function percentile(sorted: number[], fraction: number): number {
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return round(sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower));
}

function makeHistogram(sorted: number[]): { start: number; end: number; count: number }[] {
  const min = sorted[0]!;
  const max = sorted.at(-1)!;
  const bucketCount = Math.min(HISTOGRAM_BUCKET_LIMIT, Math.max(1, Math.ceil(Math.sqrt(sorted.length))));
  if (min === max) return [{ start: min, end: max, count: sorted.length }];
  const width = (max - min) / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    start: round(min + index * width),
    end: index === bucketCount - 1 ? max : round(min + (index + 1) * width),
    count: 0,
  }));
  for (const value of sorted) {
    const index = Math.min(bucketCount - 1, Math.floor((value - min) / width));
    buckets[index]!.count += 1;
  }
  return buckets;
}

function topValues(values: unknown[]): { value: unknown; count: number }[] {
  const counts = new Map<string, { value: unknown; count: number }>();
  for (const value of values) {
    const key = canonicalValue(value);
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { value, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || canonicalValue(a.value).localeCompare(canonicalValue(b.value))).slice(0, 5);
}

function estimateDistinct(values: unknown[]): number {
  // A 1,024-register HyperLogLog estimate bounds memory independently of input size.
  const registers = new Uint8Array(1024);
  for (const value of values) {
    const hash = hashString(canonicalValue(value));
    const bucket = hash & 1023;
    const remaining = hash >>> 10;
    const rank = Math.min(23, Math.clz32(remaining) - 10 + 1);
    registers[bucket] = Math.max(registers[bucket]!, rank);
  }
  const alpha = 0.7213 / (1 + 1.079 / registers.length);
  const estimate = alpha * registers.length ** 2 / registers.reduce((sum, rank) => sum + 2 ** -rank, 0);
  return Math.round(estimate);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
