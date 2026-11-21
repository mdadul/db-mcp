import { useMemo, useRef, useState } from "react";
import { parseChartSpec, transformChartData, transformHeatmapData, type ChartDatum, type ChartPoint, type ChartSpec } from "./chartHelpers";

const WIDTH = 720;
const HEIGHT = 360;
const MARGIN = { top: 20, right: 24, bottom: 56, left: 64 };

export function ChartRenderer({ rows, spec: rawSpec, large = false }: { rows: ChartDatum[]; spec: unknown; large?: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [exportError, setExportError] = useState("");
  const spec = parseChartSpec(rawSpec);
  const points = useMemo(() => spec ? transformChartData(rows, spec) : [], [rows, spec]);
  const heatCells = useMemo(() => spec?.mark === "rect" ? transformHeatmapData(rows, spec) : [], [rows, spec]);
  const colors = useMemo(() => Array.from({ length: 6 }, (_, index) => getComputedStyle(document.documentElement).getPropertyValue(`--chart-${index + 1}`).trim() || `var(--primary)`), []);
  const groups = useMemo(() => unique(points.map((point) => point.color)), [points]);
  const series = useMemo(() => new Map(groups.map((group) => [group, points.filter((point) => point.color === group)])), [groups, points]);
  const plot = { width: WIDTH - MARGIN.left - MARGIN.right, height: HEIGHT - MARGIN.top - MARGIN.bottom };
  const min = Math.min(0, ...points.map((point) => point.y));
  const max = Math.max(0, ...points.map((point) => point.y));
  const heatMin = Math.min(0, ...heatCells.map((cell) => cell.value));
  const heatMax = Math.max(0, ...heatCells.map((cell) => cell.value));
  const range = (spec?.mark === "rect" ? heatMax - heatMin : max - min) || 1;
  const yPos = (value: number) => MARGIN.top + (max - value) / range * plot.height;
  const dimension = spec?.encoding.x ?? (spec?.mark === "arc" ? spec.encoding.color : undefined);
  const categorical = spec?.mark === "bar" || spec?.mark === "rect" || spec?.mark === "tick" || spec?.mark === "arc";
  const labels = unique(points.map((point) => point.x));
  const categoryWidth = plot.width / Math.max(1, labels.length);
  const groupWidth = categoryWidth / Math.max(1, groups.length);
  const xPos = (point: ChartPoint) => categorical
    ? MARGIN.left + (labels.indexOf(point.x) + 0.5) * categoryWidth
    : MARGIN.left + (points.indexOf(point) / Math.max(1, points.length - 1)) * plot.width;
  const colorFor = (point: ChartPoint) => colors[Math.max(0, groups.indexOf(point.color)) % colors.length] ?? "var(--primary)";
  const zeroY = yPos(0);

  function exportSvg() {
    setExportError("");
    const svg = svgRef.current;
    if (!svg) return;
    const blob = new Blob([serializeSvg(svg)], { type: "image/svg+xml;charset=utf-8" });
    download(blob, "analyst-chart.svg");
  }

  async function exportPng() {
    setExportError("");
    const svg = svgRef.current;
    if (!svg) return;
    try {
      const source = serializeSvg(svg);
      const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
      try {
        const image = new Image();
        await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("The chart image could not be rendered.")); image.src = url; });
        const canvas = document.createElement("canvas");
        canvas.width = WIDTH * 2; canvas.height = HEIGHT * 2;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("PNG export is unavailable in this window.");
        context.scale(2, 2); context.drawImage(image, 0, 0, WIDTH, HEIGHT);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG export failed.")), "image/png"));
        download(blob, "analyst-chart.png");
      } finally { URL.revokeObjectURL(url); }
    } catch (error) { setExportError(error instanceof Error ? error.message : "PNG export failed."); }
  }

  if (!spec) return <p role="status" className="p-4 text-secondary text-muted-foreground">This chart uses an unsupported chart specification.</p>;
  if (!points.length && !heatCells.length) return <p role="status" className="p-4 text-secondary text-muted-foreground">No chartable data is available.</p>;
  const title = spec.encoding.y?.title ?? spec.encoding.theta?.title ?? spec.encoding.x?.title ?? spec.encoding.y?.field ?? spec.encoding.theta?.field ?? "Value";

  return <div className={`flex min-w-0 flex-col ${large ? "h-full" : "h-[280px]"}`}>
    <div className="flex shrink-0 justify-end gap-1"><button type="button" className="rounded px-2 py-1 text-caption text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" onClick={exportSvg}>Export SVG</button><button type="button" className="rounded px-2 py-1 text-caption text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" onClick={() => void exportPng()}>Export PNG</button></div>
    <svg ref={svgRef} role="img" aria-label={`${spec.mark} chart of ${title}`} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="min-h-0 w-full flex-1" preserveAspectRatio="xMidYMid meet" style={{ fontFamily: "var(--font-ui)", fontSize: "var(--font-size-caption)" }}>
      <style>{`:root{color:var(--foreground)}`}</style>
      {spec.mark !== "arc" && <>
        {spec.mark !== "rect" && [0, 0.25, 0.5, 0.75, 1].map((fraction) => { const value = min + range * fraction; const y = yPos(value); return <g key={fraction}><line x1={MARGIN.left} y1={y} x2={WIDTH - MARGIN.right} y2={y} stroke="var(--border)" strokeDasharray="2 4"/><text x={MARGIN.left - 8} y={y + 4} textAnchor="end" fill="var(--muted-foreground)">{formatTick(value)}</text></g>; })}
        <line x1={MARGIN.left} y1={zeroY} x2={WIDTH - MARGIN.right} y2={zeroY} stroke="var(--border)" />
        {labels.map((label, index) => <text key={label} x={MARGIN.left + (index + 0.5) * categoryWidth} y={HEIGHT - MARGIN.bottom + 18} textAnchor="middle" fill="var(--muted-foreground)">{truncate(label, Math.max(8, Math.floor(categoryWidth / 6)))}</text>)}
        <text transform={`translate(16 ${MARGIN.top + plot.height / 2}) rotate(-90)`} textAnchor="middle" fill="var(--muted-foreground)">{title}</text>
        <text x={MARGIN.left + plot.width / 2} y={HEIGHT - 8} textAnchor="middle" fill="var(--muted-foreground)">{dimension?.title ?? dimension?.field ?? ""}</text>
      </>}
      {spec.mark === "bar" && points.map((point, index) => { const start = point.y0 ?? 0; const height = Math.abs(yPos(start) - yPos(point.y)); const x = xPos(point) - categoryWidth / 2 + groups.indexOf(point.color) * groupWidth + groupWidth * 0.1; return <rect key={`${point.x}-${point.color}-${index}`} x={x} y={Math.min(yPos(start), yPos(point.y))} width={Math.max(1, groupWidth * 0.8)} height={Math.max(1, height)} fill={colorFor(point)} rx="2"><title>{`${point.x} · ${point.color}: ${formatTick(point.y - start)}${point.tooltip ? ` · ${point.tooltip}` : ""}`}</title></rect>; })}
      {spec.mark === "rect" && heatCells.map((cell, index) => { const xs = unique(heatCells.map((item) => item.x)); const ys = unique(heatCells.map((item) => item.y)); const normalized = (cell.value - heatMin) / range; return <g key={`${cell.x}-${cell.y}-${index}`}><rect x={MARGIN.left + xs.indexOf(cell.x) * (plot.width / Math.max(1, xs.length))} y={MARGIN.top + ys.indexOf(cell.y) * (plot.height / Math.max(1, ys.length))} width={plot.width / Math.max(1, xs.length)} height={plot.height / Math.max(1, ys.length)} fill={colors[0] ?? "var(--primary)"} opacity={0.18 + normalized * 0.82}><title>{`${cell.x} · ${cell.y}: ${formatTick(cell.value)}`}</title></rect><text x={MARGIN.left + (xs.indexOf(cell.x) + 0.5) * (plot.width / Math.max(1, xs.length))} y={MARGIN.top + (ys.indexOf(cell.y) + 0.5) * (plot.height / Math.max(1, ys.length)) + 4} textAnchor="middle" fill="var(--foreground)">{formatTick(cell.value)}</text></g>; })}
      {spec.mark === "line" && groups.map((group) => { const data = series.get(group) ?? []; const first = data[0]; return first ? <g key={group}><polyline points={data.map((point) => `${xPos(point)},${yPos(point.y)}`).join(" ")} fill="none" stroke={colorFor(first)} strokeWidth="2" strokeLinejoin="round"/>{data.map((point, index) => <circle key={`${point.x}-${index}`} cx={xPos(point)} cy={yPos(point.y)} r="7" fill="transparent"><title>{`${point.x} · ${point.color}: ${formatTick(point.y)}`}</title></circle>)}</g> : null; })}
      {spec.mark === "area" && groups.map((group) => { const data = series.get(group) ?? []; if (!data.length) return null; const first = data[0]!; const last = data.at(-1)!; const areaBase = first.y0 === undefined ? zeroY : yPos(first.y0); return <g key={group}><path d={`M ${xPos(first)},${areaBase} L ${data.map((point) => `${xPos(point)},${yPos(point.y)}`).join(" L ")} L ${xPos(last)},${areaBase} Z`} fill={colorFor(first)} opacity="0.24"/><polyline points={data.map((point) => `${xPos(point)},${yPos(point.y)}`).join(" ")} fill="none" stroke={colorFor(first)} strokeWidth="2"/></g>; })}
      {(spec.mark === "point" || spec.mark === "tick") && points.map((point, index) => <g key={`${point.x}-${point.color}-${index}`}>{spec.mark === "point" ? <circle cx={xPos(point)} cy={yPos(point.y)} r={Math.max(3, Math.min(11, point.size === undefined ? 5 : Math.sqrt(Math.abs(point.size))))} fill={colorFor(point)}><title>{`${point.x} · ${point.color}: ${formatTick(point.y)}${point.tooltip ? ` · ${point.tooltip}` : ""}`}</title></circle> : <line x1={xPos(point)} x2={xPos(point)} y1={yPos(point.y) - 7} y2={yPos(point.y) + 7} stroke={colorFor(point)} strokeWidth="2"><title>{`${point.x} · ${point.color}: ${formatTick(point.y)}${point.tooltip ? ` · ${point.tooltip}` : ""}`}</title></line>}</g>)}
      {spec.mark === "arc" && renderArcs(points, colorFor)}
      {groups.length > 1 && <g transform={`translate(${MARGIN.left},${HEIGHT - MARGIN.bottom + 34})`}>{groups.map((group, index) => <g key={group} transform={`translate(${index * 130},0)`}><circle r="4" cy="-3" fill={colors[index % colors.length] ?? "var(--primary)"}/><text x="8" fill="var(--muted-foreground)">{truncate(group, 18)}</text></g>)}</g>}
    </svg>
    {exportError && <p role="alert" className="px-2 text-caption text-danger">{exportError}</p>}
    <div className="sr-only" aria-live="polite">Chart is rendered from {points.length} grouped data points.</div>
  </div>;
}

function renderArcs(points: ChartPoint[], colorFor: (point: ChartPoint) => string) {
  const total = points.reduce((sum, point) => sum + Math.max(0, point.y), 0) || 1;
  let angle = -Math.PI / 2;
  const cx = WIDTH / 2; const cy = HEIGHT / 2; const radius = Math.min(WIDTH, HEIGHT) * 0.35;
  return points.map((point, index) => {
    const next = angle + Math.max(0, point.y) / total * Math.PI * 2;
    const startX = cx + radius * Math.cos(angle); const startY = cy + radius * Math.sin(angle);
    const endX = cx + radius * Math.cos(next); const endY = cy + radius * Math.sin(next);
    const largeArc = next - angle > Math.PI ? 1 : 0;
    const path = `M ${cx} ${cy} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY} Z`;
    angle = next;
    return <path key={`${point.x}-${index}`} d={path} fill={colorFor(point)} stroke="var(--background)" strokeWidth="2"><title>{`${point.x}: ${formatTick(point.y)}`}</title></path>;
  });
}

function unique(values: string[]): string[] { return [...new Set(values)]; }
function truncate(value: string, length: number): string { return value.length > length ? `${value.slice(0, Math.max(1, length - 1))}…` : value; }
function formatTick(value: number): string { return Number(value.toPrecision(4)).toLocaleString(); }
function serializeSvg(svg: SVGSVGElement): string {
  const variables = ["background", "foreground", "muted-foreground", "border", "primary", "chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6"];
  const resolved = Object.fromEntries(variables.map((name) => [name, getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()]));
  return new XMLSerializer().serializeToString(svg).replace(/var\(--([\w-]+)\)/g, (token, name: string) => resolved[name] || token);
}
function download(blob: Blob, filename: string): void { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
