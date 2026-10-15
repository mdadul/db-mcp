import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border px-2.5 py-0.5 text-xs font-normal whitespace-nowrap transition-all select-none [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "bg-[#EEEEEE] text-[#4D4D4D] border-[#E5E5E5]",
        secondary:
          "bg-white text-[#4D4D4D] border-[#EEEEEE] shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
        accent:
          "bg-[#22C55E]/10 text-[#15803D] border-[#22C55E]/25",
        destructive:
          "bg-[#D64545]/10 text-[#D64545] border-[#D64545]/20",
        outline:
          "border-[#EEEEEE] text-[#4D4D4D] bg-transparent",
        ghost:
          "border-transparent text-[#4D4D4D] bg-transparent",
        link:
          "border-transparent text-[#4D4D4D] underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
