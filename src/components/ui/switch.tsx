"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-[#E5A93C] data-[state=checked]:to-[#B5582D] data-[state=unchecked]:bg-[#E2D6C5] dark:data-[state=unchecked]:bg-[#2C1F15] focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-[#D49A24]/30 p-0.5 shadow-[inset_0_2px_4px_rgba(24,18,12,0.22),0_1px_1px_rgba(255,255,255,0.65)] dark:shadow-[inset_0_2px_5px_rgba(0,0,0,0.65)] transition-all duration-200 outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "bg-gradient-to-b from-[#FFFFFF] to-[#F7EFE2] dark:from-[#FFF8EC] dark:to-[#E5D3B8] pointer-events-none block size-4.5 rounded-full shadow-[0_2px_5px_rgba(24,18,12,0.28),inset_0_1.5px_1.5px_#FFFFFF] ring-0 transition-transform duration-200 data-[state=checked]:translate-x-[20px] data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
