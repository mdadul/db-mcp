import {
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type SVGProps,
} from "react";
import { ChevronRight, LoaderCircle } from "lucide-react";

export interface TreeNode {
  id: string;
  label: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  children?: readonly TreeNode[];
  loadChildren?: () => Promise<readonly TreeNode[]>;
  selectable?: boolean;
}

interface VisibleTreeNode {
  node: TreeNode;
  depth: number;
  parentId: string | null;
  hasChildren: boolean;
}

/** Accessible, keyboard-navigable tree for a database schema and object hierarchy. */
export function TreeView({
  nodes,
  selectedId,
  onSelect,
  ariaLabel = "Tree",
  className = "",
}: {
  nodes: readonly TreeNode[];
  selectedId?: string;
  onSelect?: (node: TreeNode) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loadedChildren, setLoadedChildren] = useState<Map<string, readonly TreeNode[]>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | undefined>(selectedId ?? nodes[0]?.id);
  const [query, setQuery] = useState("");
  const typeahead = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visible = useMemo(() => {
    const result: VisibleTreeNode[] = [];
    const walk = (items: readonly TreeNode[], depth: number, parentId: string | null) => {
      for (const node of items) {
        const children = loadedChildren.get(node.id) ?? node.children ?? [];
        const hasChildren = Boolean(node.loadChildren || children.length);
        result.push({ node, depth, parentId, hasChildren });
        if (expanded.has(node.id) && children.length) walk(children, depth + 1, node.id);
      }
    };
    walk(nodes, 1, null);
    return result;
  }, [expanded, loadedChildren, nodes]);

  const toggle = async (item: VisibleTreeNode) => {
    if (!item.hasChildren) return;
    if (expanded.has(item.node.id)) {
      setExpanded((current) => new Set([...current].filter((id) => id !== item.node.id)));
      return;
    }
    setExpanded((current) => new Set(current).add(item.node.id));
    if (!loadedChildren.has(item.node.id) && item.node.loadChildren) {
      setLoading((current) => new Set(current).add(item.node.id));
      try {
        const children = await item.node.loadChildren();
        setLoadedChildren((current) => new Map(current).set(item.node.id, children));
      } finally {
        setLoading((current) => new Set([...current].filter((id) => id !== item.node.id)));
      }
    }
  };

  const focusItem = (id: string) => {
    setActiveId(id);
    document.getElementById(`tree-${id}`)?.focus();
  };

  const onKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    item: VisibleTreeNode,
    index: number,
  ) => {
    const children = loadedChildren.get(item.node.id) ?? item.node.children ?? [];
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(visible[Math.min(index + 1, visible.length - 1)].node.id);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(visible[Math.max(index - 1, 0)].node.id);
    } else if (event.key === "Home") {
      event.preventDefault();
      if (visible[0]) focusItem(visible[0].node.id);
    } else if (event.key === "End") {
      event.preventDefault();
      const last = visible[visible.length - 1];
      if (last) focusItem(last.node.id);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      if (item.hasChildren && !expanded.has(item.node.id)) void toggle(item);
      else if (children[0]) focusItem(children[0].id);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (expanded.has(item.node.id)) void toggle(item);
      else if (item.parentId) focusItem(item.parentId);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (item.node.selectable !== false) onSelect?.(item.node);
      else if (item.hasChildren) void toggle(item);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const next = `${query}${event.key}`.toLocaleLowerCase();
      setQuery(next);
      if (typeahead.current) clearTimeout(typeahead.current);
      typeahead.current = setTimeout(() => setQuery(""), 650);
      const start = (index + 1) % visible.length;
      const candidates = [...visible.slice(start), ...visible.slice(0, start)];
      const match = candidates.find(({ node }) => node.label.toLocaleLowerCase().startsWith(next));
      if (match) focusItem(match.node.id);
    }
  };

  return (
    <div
      role="tree"
      aria-label={ariaLabel}
      className={`min-h-0 overflow-auto outline-none ${className}`}
    >
      {visible.map((item, index) => {
        const Icon = item.node.icon;
        const isExpanded = expanded.has(item.node.id);
        const isSelected = selectedId === item.node.id;
        return (
          <div
            key={item.node.id}
            id={`tree-${item.node.id}`}
            role="treeitem"
            aria-level={item.depth}
            aria-expanded={item.hasChildren ? isExpanded : undefined}
            aria-selected={isSelected}
            tabIndex={activeId === item.node.id ? 0 : -1}
            className={`flex h-7 min-w-0 items-center gap-1 rounded px-1 text-ui-sm outline-none focus-visible:bg-accent-subtle ${isSelected ? "bg-accent-subtle text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            style={{ paddingInlineStart: `${8 + (item.depth - 1) * 14}px` }}
            onFocus={() => setActiveId(item.node.id)}
            onClick={() => item.node.selectable !== false && onSelect?.(item.node)}
            onKeyDown={(event) => onKeyDown(event, item, index)}
          >
            <button
              type="button"
              tabIndex={-1}
              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${item.node.label}`}
              disabled={!item.hasChildren}
              onClick={(event) => {
                event.stopPropagation();
                void toggle(item);
              }}
              className="flex size-4 shrink-0 items-center justify-center rounded text-text-subtle disabled:opacity-0"
            >
              {loading.has(item.node.id) ? (
                <LoaderCircle className="size-3 animate-spin" />
              ) : (
                <ChevronRight
                  className={`size-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                />
              )}
            </button>
            {Icon && <Icon aria-hidden="true" className="size-3.5 shrink-0" />}
            <span className="min-w-0 flex-1 truncate" title={item.node.label}>
              {item.node.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
