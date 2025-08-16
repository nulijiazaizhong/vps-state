"use client"

import type {
  DateInputProps,
  DateSegmentProps,
} from "react-aria-components"
import {
  DateInput as RACDateInput,
  DateSegment as RACDateSegment,
} from "react-aria-components"

import { cn } from "@/lib/utils"

const dateInputStyle =
  "bg-background text-foreground border-input placeholder:text-muted-foreground/70 focus-visible:ring-ring/50 flex h-10 w-full items-center rounded-md border px-3 py-2 text-sm outline-none transition-shadow focus-visible:ring-[3px]"

function DateInput(props: DateInputProps) {
  return <RACDateInput className={cn(dateInputStyle, props.className)} {...props} />
}

function DateSegment(props: DateSegmentProps) {
  return (
    <RACDateSegment
      className="data-placeholder:text-muted-foreground/70 caret-transparent rounded-sm px-0.5 outline-none transition-colors data-focus-visible:bg-accent"
      {...props}
    />
  )
}

export { DateInput, DateSegment, dateInputStyle }
