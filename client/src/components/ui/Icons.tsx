import type { ComponentProps } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ActivityIcon,
  Alert02Icon,
  Cancel01Icon,
  CheckListIcon,
  CheckmarkCircle02Icon,
  CirclePlusIcon,
  ClipboardPasteIcon,
  Clock01Icon,
  CodeIcon,
  CompassIcon,
  Copy01Icon,
  CpuIcon,
  DatabaseIcon,
  Delete02Icon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  File01Icon,
  FilterIcon,
  GlobeIcon,
  GridTableIcon,
  HelpCircleIcon,
  HistoryIcon,
  KeyIcon,
  LayersIcon,
  LayoutGridIcon,
  LayoutTableIcon,
  LockIcon,
  MapPinCheckIcon,
  PencilEdit02Icon,
  PlayIcon,
  RadioIcon,
  RefreshIcon,
  SaleTag01Icon,
  Search01Icon,
  ServerStackIcon,
  Shield01Icon,
  ShieldKeyIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  TableColumnsSplitIcon,
  TerminalIcon,
  Tick02Icon,
  ZapIcon,
} from "@hugeicons/core-free-icons";

type IconProps = Omit<ComponentProps<typeof HugeiconsIcon>, "icon">;

const icon = (source: unknown) => {
  const WrappedIcon = ({ strokeWidth = 2, ...props }: IconProps) => (
    <HugeiconsIcon icon={source as never} strokeWidth={strokeWidth} {...props} />
  );
  return WrappedIcon;
};

export const Database = icon(DatabaseIcon);
export const Server = icon(ServerStackIcon);
export const Key = icon(KeyIcon);
export const ShieldCheck = icon(ShieldKeyIcon);
export const Search = icon(Search01Icon);
export const Copy = icon(Copy01Icon);
export const Check = icon(Tick02Icon);
export const Trash2 = icon(Delete02Icon);
export const Pencil = icon(PencilEdit02Icon);
export const Play = icon(PlayIcon);
export const Globe = icon(GlobeIcon);
export const Tag = icon(SaleTag01Icon);
export const Cpu = icon(CpuIcon);
export const Zap = icon(ZapIcon);
export const Lock = icon(LockIcon);
export const Sparkles = icon(SparklesIcon);
export const RefreshCw = icon(RefreshIcon);
export const SlidersHorizontal = icon(SlidersHorizontalIcon);
export const Plus = icon(CirclePlusIcon);
export const X = icon(Cancel01Icon);
export const Eye = icon(EyeIcon);
export const EyeOff = icon(EyeOffIcon);
export const LayoutGrid = icon(LayoutGridIcon);
export const List = icon(CheckListIcon);
export const Activity = icon(ActivityIcon);
export const Compass = icon(CompassIcon);
export const FileText = icon(File01Icon);
export const AlertTriangle = icon(Alert02Icon);
export const HelpCircle = icon(HelpCircleIcon);
export const ClipboardPaste = icon(ClipboardPasteIcon);
export const CheckCircle2 = icon(CheckmarkCircle02Icon);
export const Terminal = icon(TerminalIcon);
export const ExternalLink = icon(ExternalLinkIcon);
export const Pin = icon(MapPinCheckIcon);
export const Filter = icon(FilterIcon);
export const Table = icon(GridTableIcon);
export const Columns = icon(TableColumnsSplitIcon);
export const History = icon(HistoryIcon);
export const Code = icon(CodeIcon);
export const Clock = icon(Clock01Icon);
export const Radio = icon(RadioIcon);
export const Layers = icon(LayersIcon);
export const TableProperties = icon(LayoutTableIcon);
export const ShieldAlert = icon(Shield01Icon);
