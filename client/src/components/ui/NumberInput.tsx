import { useId } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";

/** Numeric input with bounded step buttons for configuration values. */
export function NumberInput({ value, onChange, min, max, step = 1, disabled = false, className = "", ...props }: Omit<React.ComponentProps<"input">, "type" | "value" | "onChange" | "min" | "max" | "step"> & { value: number | string; onChange: (value: string) => void; min?: number; max?: number; step?: number }) {
  const id = useId();
  const numericValue = Number(value);
  const canDecrement = Number.isFinite(numericValue) && (min === undefined || numericValue - step >= min);
  const canIncrement = Number.isFinite(numericValue) && (max === undefined || numericValue + step <= max);
  return <div className={`flex items-center gap-1 ${className}`}><Input {...props} id={props.id ?? id} type="number" min={min} max={max} step={step} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="font-mono" /><div className="flex flex-col gap-0.5"><Button type="button" variant="outline" size="icon-xs" aria-label="Increase value" disabled={disabled || !canIncrement} onClick={() => onChange(String(Math.min(max ?? Number.MAX_SAFE_INTEGER, numericValue + step)))}><Plus /></Button><Button type="button" variant="outline" size="icon-xs" aria-label="Decrease value" disabled={disabled || !canDecrement} onClick={() => onChange(String(Math.max(min ?? Number.MIN_SAFE_INTEGER, numericValue - step)))}><Minus /></Button></div></div>;
}
