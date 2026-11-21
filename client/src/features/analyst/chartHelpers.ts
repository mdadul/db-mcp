export type ChartAggregate = "sum" | "mean" | "count" | "min" | "max" | "median";
export type ChartTimeUnit = "year" | "yearmonth" | "yearmonthdate" | "yearmonthdatehours" | "yearmonthdatehoursminutes" | "hours" | "hoursminutes" | "month" | "date" | "day" | "week" | "quarter";

export interface ChartEncoding {
  field: string;
  type?: "quantitative" | "temporal" | "nominal" | "ordinal";
  aggregate?: ChartAggregate;
  bin?: boolean | { maxbins: number };
  timeUnit?: ChartTimeUnit;
  sort?: "ascending" | "descending" | "x" | "y" | { field: string; order: "ascending" | "descending"; op?: ChartAggregate };
  stack?: "zero" | "normalize" | "center" | null;
  title?: string;
}

export interface ChartSpec {
  mark: "bar" | "line" | "area" | "point" | "arc" | "rect" | "tick";
  encoding: { x?: ChartEncoding; y?: ChartEncoding; color?: ChartEncoding; size?: ChartEncoding; theta?: ChartEncoding; tooltip?: ChartEncoding | ChartEncoding[] };
}

export interface ChartDatum { [field: string]: unknown; }
export interface ChartPoint { x: string; y: number; y0?: number; color: string; label: string; rawX: unknown; size?: number; tooltip: string; }
export interface HeatmapCell { x: string; y: string; value: number; }

export function parseChartSpec(value: unknown): ChartSpec | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!isChartMark(record.mark) || !record.encoding || typeof record.encoding !== "object" || Array.isArray(record.encoding)) return null;
  const source = record.encoding as Record<string, unknown>;
  const encoding: ChartSpec["encoding"] = {};
  for (const key of ["x", "y", "color", "size", "theta"] as const) {
    const parsed = parseEncoding(source[key]);
    if (parsed) encoding[key] = parsed;
  }
  const tooltip = source.tooltip;
  if (Array.isArray(tooltip)) encoding.tooltip = tooltip.map(parseEncoding).filter((item): item is ChartEncoding => item !== null);
  else encoding.tooltip = parseEncoding(tooltip) ?? undefined;
  return { mark: record.mark, encoding };
}

export function transformChartData(rows: ChartDatum[], spec: ChartSpec): ChartPoint[] {
  const { x, y, color } = spec.encoding;
  const dimension = x ?? (spec.mark === "arc" ? color : undefined);
  if (!dimension || (!y && spec.mark !== "arc")) return [];
  const metric = y ?? spec.encoding.theta ?? dimension;
  const xBins = dimension.bin ? createBinScale(rows.map((row) => row[dimension.field]), typeof dimension.bin === "object" ? dimension.bin.maxbins : 10) : undefined;
  const colorBins = color?.bin ? createBinScale(rows.map((row) => row[color.field]), typeof color.bin === "object" ? color.bin.maxbins : 10) : undefined;
  const tooltipEncodings = spec.encoding.tooltip ? Array.isArray(spec.encoding.tooltip) ? spec.encoding.tooltip : [spec.encoding.tooltip] : [];
  const sizeEncoding = spec.encoding.size;
  const grouped = new Map<string, { x: string; color: string; values: number[]; sizes: number[]; rawX: unknown; tooltips: string[] }>();
  for (const row of rows) {
    const rawX = row[dimension.field];
    const rawColor = color ? row[color.field] : "Series";
    const xValue = applyDimension(rawX, dimension, xBins);
    const colorValue = color ? applyDimension(rawColor, color, colorBins) : spec.mark === "arc" ? xValue : "Series";
    const key = `${xValue}\u0000${colorValue}`;
    const group = grouped.get(key) ?? { x: xValue, color: colorValue, values: [], sizes: [], rawX, tooltips: [] };
    const rawMetric = row[metric.field];
    const number = rawMetric === null || rawMetric === undefined ? NaN : Number(rawMetric);
    if (metric.aggregate === "count") group.values.push(1);
    else if (Number.isFinite(number)) group.values.push(number);
    if (sizeEncoding) { const size = Number(row[sizeEncoding.field]); if (Number.isFinite(size)) group.sizes.push(size); }
    for (const tooltip of tooltipEncodings) group.tooltips.push(`${tooltip.title ?? tooltip.field}: ${String(row[tooltip.field] ?? "(empty)")}`);
    grouped.set(key, group);
  }
  let points = [...grouped.values()].map(({ x: xValue, color: colorValue, values, sizes, rawX, tooltips }) => ({
    x: xValue,
    y: aggregateValues(values, metric.aggregate),
    color: colorValue,
    label: xValue,
    rawX,
    ...(sizes.length ? { size: aggregateValues(sizes, sizeEncoding?.aggregate) } : {}),
    tooltip: [...new Set(tooltips)].join(" · "),
  })).filter((point) => Number.isFinite(point.y));
  if (dimension.sort === "ascending" || (typeof dimension.sort === "object" && dimension.sort.order === "ascending")) points = sortByX(points, 1);
  else if (dimension.sort === "descending" || (typeof dimension.sort === "object" && dimension.sort.order === "descending")) points = sortByX(points, -1);
  else if (y?.sort === "x") points = sortByX(points, 1);
  else if (typeof dimension.sort === "object") {
    const field = dimension.sort.field;
    const rowOrder = new Map<string, number>();
    for (const row of rows) { const label = applyDimension(row[dimension.field], dimension, xBins); if (!rowOrder.has(label)) rowOrder.set(label, Number(row[field])); }
    points = [...points].sort((a, b) => (rowOrder.get(a.x) ?? 0) - (rowOrder.get(b.x) ?? 0));
    if (dimension.sort.order === "descending") points.reverse();
  }
  else if (y?.sort === "y") points = [...points].sort((a, b) => a.y - b.y);
  return stackPoints(points, dimension, y, spec.mark === "bar" || spec.mark === "area");
}

export function aggregateValues(values: number[], aggregate?: ChartAggregate): number {
  if (!values.length) return aggregate === "count" ? 0 : Number.NaN;
  switch (aggregate) {
    case "count": return values.length;
    case "sum": return values.reduce((sum, value) => sum + value, 0);
    case "mean": return values.reduce((sum, value) => sum + value, 0) / values.length;
    case "min": return Math.min(...values);
    case "max": return Math.max(...values);
    case "median": { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2; }
    default: return values[0]!;
  }
}

export function transformHeatmapData(rows: ChartDatum[], spec: ChartSpec): HeatmapCell[] {
  const { x, y, color } = spec.encoding;
  if (!x || !y || !color) return [];
  const xBins = x.bin ? createBinScale(rows.map((row) => row[x.field]), typeof x.bin === "object" ? x.bin.maxbins : 10) : undefined;
  const yBins = y.bin ? createBinScale(rows.map((row) => row[y.field]), typeof y.bin === "object" ? y.bin.maxbins : 10) : undefined;
  const groups = new Map<string, { x: string; y: string; values: number[] }>();
  for (const row of rows) {
    const xValue = applyDimension(row[x.field], x, xBins);
    const yValue = applyDimension(row[y.field], y, yBins);
    const key = `${xValue}\u0000${yValue}`;
    const group = groups.get(key) ?? { x: xValue, y: yValue, values: [] };
    const value = Number(row[color.field]);
    if (Number.isFinite(value)) group.values.push(value);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ x: xValue, y: yValue, values }) => ({ x: xValue, y: yValue, value: aggregateValues(values, color.aggregate) })).filter((cell) => Number.isFinite(cell.value));
}

export function createBinScale(values: unknown[], maxBins = 10): { start: number; step: number } | null {
  const numbers = values.filter((value) => value !== null && value !== undefined && value !== "").map(Number).filter(Number.isFinite);
  if (!numbers.length) return null;
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const bound = Math.max(1, Math.min(12, Math.floor(maxBins)));
  const step = niceStep((max - min || Math.abs(max) || 1) / bound);
  return { start: Math.floor(min / step) * step, step };
}

export function binValue(value: unknown, maxBins = 10, scale = createBinScale([value], maxBins)): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "(empty)");
  const start = scale ? scale.start + Math.floor((number - scale.start) / scale.step) * scale.step : number;
  const end = scale ? start + scale.step : start;
  return `${formatNumber(start)}–${formatNumber(end)}`;
}

export function timeUnitValue(value: unknown, unit: ChartTimeUnit): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value ?? "(empty)");
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  switch (unit) {
    case "year": return String(year);
    case "yearmonth": return `${year}-${month}`;
    case "yearmonthdate": return `${year}-${month}-${day}`;
    case "yearmonthdatehours": return `${year}-${month}-${day} ${hour}:00`;
    case "yearmonthdatehoursminutes": return `${year}-${month}-${day} ${hour}:${minute}`;
    case "hours": return `${hour}:00`;
    case "hoursminutes": return `${hour}:${minute}`;
    case "month": return month;
    case "date": return day;
    case "day": return String(date.getUTCDay());
    case "week": { const first = new Date(Date.UTC(year, 0, 1)); return `${year}-W${String(Math.ceil((((date.getTime() - first.getTime()) / 86400000) + first.getUTCDay() + 1) / 7)).padStart(2, "0")}`; }
    case "quarter": return `${year}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  }
}

function applyDimension(value: unknown, encoding?: ChartEncoding, binScale?: { start: number; step: number } | null): string {
  if (!encoding) return "Series";
  if (encoding.timeUnit) return timeUnitValue(value, encoding.timeUnit);
  if (encoding.bin) return binValue(value, typeof encoding.bin === "object" ? encoding.bin.maxbins : 10, binScale);
  if (value === null || value === undefined) return "(empty)";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function parseEncoding(value: unknown): ChartEncoding | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.field !== "string" || !record.field) return null;
  const encoding: ChartEncoding = { field: record.field };
  if (["quantitative", "temporal", "nominal", "ordinal"].includes(String(record.type))) encoding.type = record.type as ChartEncoding["type"];
  if (["sum", "mean", "count", "min", "max", "median"].includes(String(record.aggregate))) encoding.aggregate = record.aggregate as ChartAggregate;
  if (typeof record.bin === "boolean") encoding.bin = record.bin;
  else if (record.bin && typeof record.bin === "object" && "maxbins" in record.bin && typeof record.bin.maxbins === "number") encoding.bin = { maxbins: record.bin.maxbins };
  if (["year", "yearmonth", "yearmonthdate", "yearmonthdatehours", "yearmonthdatehoursminutes", "hours", "hoursminutes", "month", "date", "day", "week", "quarter"].includes(String(record.timeUnit))) encoding.timeUnit = record.timeUnit as ChartTimeUnit;
  if (record.sort === "ascending" || record.sort === "descending" || record.sort === "x" || record.sort === "y") encoding.sort = record.sort;
  else if (record.sort && typeof record.sort === "object" && "field" in record.sort && typeof record.sort.field === "string" && "order" in record.sort && (record.sort.order === "ascending" || record.sort.order === "descending")) encoding.sort = { field: record.sort.field, order: record.sort.order };
  if (record.stack === "zero" || record.stack === "normalize" || record.stack === "center" || record.stack === null) encoding.stack = record.stack;
  if (typeof record.title === "string") encoding.title = record.title;
  return encoding;
}

function isChartMark(value: unknown): value is ChartSpec["mark"] { return typeof value === "string" && ["bar", "line", "area", "point", "arc", "rect", "tick"].includes(value); }

function stackPoints(points: ChartPoint[], x: ChartEncoding, y: ChartEncoding | undefined, defaultStack: boolean): ChartPoint[] {
  if (!y || y.stack === null || (y.stack === undefined && !defaultStack) || !points.some((point) => point.color !== "Series")) return points;
  const totals = new Map<string, number>();
  for (const point of points) totals.set(point.x, (totals.get(point.x) ?? 0) + point.y);
  const offsets = new Map<string, number>();
  return points.map((point) => {
    const offset = offsets.get(point.x) ?? 0;
    offsets.set(point.x, offset + point.y);
    if (y.stack === "normalize") { const denominator = totals.get(point.x) || 1; return { ...point, y0: offset / denominator, y: (offset + point.y) / denominator }; }
    if (y.stack === "center") { const center = (totals.get(point.x) ?? 0) / 2; return { ...point, y0: offset - center, y: offset + point.y - center }; }
    return { ...point, y0: offset, y: offset + point.y };
  });
}

function sortByX(points: ChartPoint[], direction: 1 | -1): ChartPoint[] { return [...points].sort((a, b) => direction * compareValues(a.rawX, b.rawX)); }
function compareValues(a: unknown, b: unknown): number { const left = Number(a); const right = Number(b); if (Number.isFinite(left) && Number.isFinite(right)) return left - right; return String(a).localeCompare(String(b), undefined, { numeric: true }); }
function niceStep(value: number): number { const power = 10 ** Math.floor(Math.log10(Math.abs(value) || 1)); const fraction = Math.abs(value) / power; return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power; }
function formatNumber(value: number): string { return Number(value.toPrecision(4)).toLocaleString(); }
