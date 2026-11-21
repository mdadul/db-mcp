export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const output: string[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: string[] | null = null;
  let table: string[][] | null = null;
  const flushParagraph = () => { if (paragraph.length) output.push(`<p>${paragraph.map(renderInline).join("<br>")}</p>`); paragraph = []; };
  const flushList = () => { if (list) { const tag = list.ordered ? "ol" : "ul"; output.push(`<${tag}>${list.items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${tag}>`); list = null; } };
  const flushTable = () => { if (table) { const [header = [], ...rows] = table; output.push(`<div class="markdown-table-wrap"><table><thead><tr>${header.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${header.map((_, index) => `<td>${renderInline(row[index] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`); table = null; } };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith("```")) {
      flushParagraph(); flushList(); flushTable();
      if (code) { output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`); code = null; }
      else code = [];
      continue;
    }
    if (code) { code.push(line); continue; }
    const cells = splitTableRow(line);
    if (cells && isTableDivider(lines[index + 1] ?? "")) { flushParagraph(); flushList(); table = [...(table ?? []), cells]; index += 1; continue; }
    if (table && cells) { table.push(cells); continue; }
    if (table && !line.trim()) { flushTable(); continue; }
    if (table) flushTable();
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { flushParagraph(); flushList(); const level = heading[1]?.length ?? 1; output.push(`<h${level}>${renderInline(heading[2] ?? "")}</h${level}>`); continue; }
    const item = /^\s*([-*+] |\d+\. )(.*)$/.exec(line);
    if (item) { flushParagraph(); const ordered = /^\s*\d+\./.test(line); if (list && list.ordered !== ordered) flushList(); if (!list) list = { ordered, items: [] }; list.items.push(item[2] ?? ""); continue; }
    flushList(); paragraph.push(line);
  }
  if (code) output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  flushParagraph(); flushList(); flushTable();
  return output.join("");
}

function renderInline(text: string): string {
  const tokens: string[] = [];
  const hold = (html: string) => `\u0000${tokens.push(html) - 1}\u0000`;
  let escaped = escapeHtml(text);
  escaped = escaped.replace(/`([^`]+)`/g, (_, value: string) => hold(`<code>${value}</code>`));
  escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label: string, url: string) => hold(`<a href="${url.replaceAll("&amp;", "&").replaceAll('"', "%22")}" target="_blank" rel="noopener noreferrer">${label}</a>`));
  escaped = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
  return escaped.replace(/\u0000(\d+)\u0000/g, (_, index: string) => tokens[Number(index)] ?? "");
}

function splitTableRow(line: string): string[] | null {
  const value = line.trim();
  if (!value.includes("|") || !value.startsWith("|")) return null;
  return value.slice(1, value.endsWith("|") ? -1 : undefined).split("|").map((cell) => cell.trim());
}
function isTableDivider(line: string): boolean { return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line); }
function escapeHtml(text: string): string { return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
