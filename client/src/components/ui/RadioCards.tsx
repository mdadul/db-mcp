import type { ComponentType, SVGProps } from "react";
import { Check } from "lucide-react";

type CardOption<T extends string> = { value: T; title: string; description?: string; icon?: ComponentType<SVGProps<SVGSVGElement>> };

/** Select-one card group for visually meaningful options such as database engines. */
export function RadioCards<T extends string>({ value, options, onChange, ariaLabel, className = "" }: { value: T; options: readonly CardOption<T>[]; onChange: (value: T) => void; ariaLabel: string; className?: string }) {
  return <div role="radiogroup" aria-label={ariaLabel} className={`grid grid-cols-1 gap-2 @md:grid-cols-2 ${className}`}>{options.map(({ value: optionValue, title, description, icon: Icon }) => <button key={optionValue} type="button" role="radio" aria-checked={value === optionValue} onClick={() => onChange(optionValue)} className={`relative flex min-w-0 items-start gap-2.5 rounded-md border p-3 text-left transition-colors ${value === optionValue ? "border-primary bg-accent-subtle" : "border-border bg-surface hover:bg-muted"}`}><span className="flex size-7 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">{Icon && <Icon aria-hidden="true" className="size-4" />}</span><span className="min-w-0 flex-1"><span className="block text-ui font-medium">{title}</span>{description && <span className="mt-0.5 block text-ui-sm text-muted-foreground">{description}</span>}</span>{value === optionValue && <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />}</button>)}</div>;
}
