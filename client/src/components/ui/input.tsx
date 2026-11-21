import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "min-h-(--control-h) w-full min-w-0 rounded-md border border-input bg-surface-raised px-2 py-1 text-body transition-colors outline-none shadow-[inset_0_1px_1px_rgb(0_0_0/0.04)] file:inline-flex file:min-h-(--control-h-sm) file:border-0 file:bg-transparent file:text-secondary file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-55 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
