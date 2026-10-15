import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[10px] border border-transparent bg-clip-padding text-xs font-medium whitespace-nowrap transition-all duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-[#0A0A0A]/20 active:not-aria-[haspopup]:scale-[0.99] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 cursor-pointer",
  {
    variants: {
      variant: {
        /* Corey.co primary: warm pale gray surface with dark text */
        default:
          "bg-[#E5E5E5] text-[#0A0A0A] hover:bg-[#DCDCDC] border border-transparent",
        /* Corey.co secondary: white surface with delicate border and subtle shadow */
        secondary:
          "bg-white text-[#4D4D4D] border border-[#EEEEEE] hover:border-[#CCCCCC] hover:text-[#0A0A0A] shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        outline:
          "border border-[#EEEEEE] bg-transparent text-[#4D4D4D] hover:bg-[#F8F8F8] hover:border-[#CCCCCC] hover:text-[#0A0A0A]",
        ghost:
          "bg-transparent text-[#4D4D4D] hover:bg-[#EEEEEE]/70 hover:text-[#0A0A0A]",
        destructive:
          "bg-[#D64545]/10 text-[#D64545] hover:bg-[#D64545]/20 border border-transparent",
        link:
          "text-[#4D4D4D] underline-offset-4 hover:underline hover:text-[#0A0A0A] p-0 h-auto",
      },
      size: {
        /* 56px height, 20px 28px padding as specified in Corey.co button-primary/secondary */
        hero: "h-[56px] px-7 text-base gap-2.5 rounded-[10px]",
        lg: "h-11 px-5 text-sm gap-2 rounded-[10px]",
        default: "h-9 px-4 text-xs font-normal gap-1.5 rounded-[10px]",
        sm: "h-8 px-3 text-xs gap-1.5 rounded-[8px]",
        xs: "h-7 px-2 text-xs gap-1 rounded-[6px]",
        icon: "size-9 rounded-[10px]",
        "icon-sm": "size-8 rounded-[8px]",
        "icon-xs": "size-7 rounded-[6px]",
        "icon-lg": "size-11 rounded-[10px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
