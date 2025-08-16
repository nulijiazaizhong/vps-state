"use client"

import {
  CalendarCell as RACCalendarCell,
  CalendarGrid as RACCalendarGrid,
  CalendarGridBody as RACCalendarGridBody,
  CalendarHeaderCell as RACCalendarHeaderCell,
  CalendarGridHeader as RACCalendarGridHeader,
  Heading,
} from "react-aria-components"
import type {
  CalendarCellProps,
  CalendarGridBodyProps,
  CalendarGridHeaderProps,
  CalendarGridProps,
} from "react-aria-components"

function CalendarGrid({ className, ...props }: CalendarGridProps) {
  return <RACCalendarGrid className={className} {...props} />
}

function CalendarGridHeader({
  className,
  ...props
}: CalendarGridHeaderProps) {
  return (
    <RACCalendarGridHeader className={className} {...props}>
      {(day: string) => <CalendarHeaderCell>{day}</CalendarHeaderCell>}
    </RACCalendarGridHeader>
  )
}

function CalendarHeaderCell({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableCellElement>) {
  return (
    <RACCalendarHeaderCell
      className="text-muted-foreground w-9 text-center text-xs font-normal"
      {...props}
    />
  )
}

function CalendarGridBody({ className, ...props }: CalendarGridBodyProps) {
  return <RACCalendarGridBody className={className} {...props} />
}

function CalendarCell({ className, date, ...props }: CalendarCellProps) {
  return (
    <RACCalendarCell
      className="relative h-9 w-9 p-0 text-center text-sm outline-none data-focus-visible:ring-2 data-focus-visible:ring-ring data-focus-visible:ring-offset-2 data-outside-month:text-muted-foreground/50 data-selected:bg-accent data-selection-start:bg-primary data-selection-start:text-primary-foreground data-selection-end:bg-primary data-selection-end:text-primary-foreground data-selection-start:rounded-l-md data-selection-end:rounded-r-md data-selection-start:data-selection-end:rounded-md"
      date={date}
      {...props}
    />
  )
}

export {
  CalendarGrid,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarGridBody,
  CalendarCell,
  Heading as CalendarHeading,
}
