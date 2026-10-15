import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-10 sm:h-[46px] w-full min-w-0 rounded-[10px] border border-[#EEEEEE] bg-white px-3.5 py-2 text-sm text-[#4D4D4D] placeholder:text-[#999999] transition-all duration-150 outline-none hover:border-[#CCCCCC] focus-visible:border-[#CCCCCC] focus-visible:text-[#0A0A0A] focus-visible:ring-2 focus-visible:ring-[#0A0A0A]/5 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[#FAFAFA] disabled:opacity-50 aria-invalid:border-[#D64545] aria-invalid:ring-2 aria-invalid:ring-[#D64545]/15",
        className
      )}
      {...props}
    />
  )
}

export { Input }
