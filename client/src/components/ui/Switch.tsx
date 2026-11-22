import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-colors duration-150 ease-out outline-none after:absolute after:-inset-x-2 after:-inset-y-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive data-[size=default]:h-[18px] data-[size=default]:w-8 data-[size=sm]:h-[14px] data-[size=sm]:w-6 data-checked:bg-primary data-unchecked:bg-border-strong data-disabled:cursor-not-allowed data-disabled:data-checked:bg-text-subtle data-disabled:data-unchecked:bg-border",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-surface-raised shadow-sm ring-0 transition-transform duration-150 group-data-[size=default]/switch:size-[14px] group-data-[size=sm]/switch:size-[10px] group-data-[disabled]/switch:data-checked:bg-border group-data-[disabled]/switch:data-unchecked:bg-text-subtle group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
