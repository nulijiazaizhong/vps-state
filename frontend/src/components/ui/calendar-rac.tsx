"use client"

import {
  RangeCalendar as RACRangeCalendar,
  CalendarGridHeader,
  Heading,
} from "react-aria-components"
import type {
  DateValue,
  RangeCalendarProps,
} from "react-aria-components"
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"
import type { CalendarDate } from "@internationalized/date"

import { Button } from "@/components/ui/button-rac"
import {
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarHeaderCell,
} from "@/components/ui/calendar-grid-rac"

function RangeCalendar<T extends DateValue>(props: RangeCalendarProps<T>) {
  return (
    <RACRangeCalendar {...props}>
      <header className="flex items-center justify-between px-1 pb-4">
        <Button slot="previous">
          <ChevronLeft size={16} />
        </Button>
        <Heading className="text-sm font-medium" />
        <Button slot="next">
          <ChevronRight size={16} />
        </Button>
      </header>
      <CalendarGrid>
        <CalendarGridHeader>
          {(day: string) => <CalendarHeaderCell>{day}</CalendarHeaderCell>}
        </CalendarGridHeader>
        <CalendarGridBody>
          {(date: CalendarDate) => <CalendarCell date={date} />}
        </CalendarGridBody>
      </CalendarGrid>
    </RACRangeCalendar>
  )
}

export { RangeCalendar }
