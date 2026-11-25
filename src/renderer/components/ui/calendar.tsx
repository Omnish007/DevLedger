import * as React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { DayPicker, getDefaultClassNames } from '@daypicker/react';
import type { ButtonProps } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: ButtonProps['variant'];
};

/**
 * DevLedger's DayPicker v10 calendar, based on the current shadcn New York
 * composition and updated for @daypicker/react's v10 class-name API.
 */
function Calendar({
  className,
  classNames,
  components,
  showOutsideDays = true,
  buttonVariant = 'ghost',
  ...props
}: CalendarProps) {
  const defaults = getDefaultClassNames();
  const navButton = buttonVariants({ variant: buttonVariant, size: 'icon' });

  return (
    <div
      data-slot="calendar"
      className={cn(
        'relative w-fit rounded-lg bg-popover p-3 text-popover-foreground [--cell-size:2.25rem]',
        className,
      )}
    >
      <DayPicker
        showOutsideDays={showOutsideDays}
        components={{
          Chevron: ({ orientation, className: iconClass }) => {
            if (orientation === 'right') return <ChevronRight className={cn('size-4', iconClass)} />;
            if (orientation === 'up') return <ChevronUp className={cn('size-4', iconClass)} />;
            if (orientation === 'down') return <ChevronDown className={cn('size-3.5 opacity-70', iconClass)} />;
            return <ChevronLeft className={cn('size-4', iconClass)} />;
          },
          ...components,
        }}
        classNames={{
          ...defaults,
          ...classNames,
          root: cn(defaults.root, 'w-fit', classNames?.root),
          months: cn(defaults.months, 'relative flex flex-col gap-4 sm:flex-row', classNames?.months),
          month: cn(defaults.month, 'flex w-full flex-col gap-3', classNames?.month),
          month_caption: cn(defaults.month_caption, 'flex h-8 items-center justify-center px-9', classNames?.month_caption),
          caption_label: cn(defaults.caption_label, 'inline-flex select-none items-center gap-1 text-sm font-medium', classNames?.caption_label),
          dropdowns: cn(defaults.dropdowns, 'inline-flex items-center gap-1.5', classNames?.dropdowns),
          dropdown_root: cn(defaults.dropdown_root, 'relative inline-flex h-7 items-center rounded-md border border-input bg-background px-2 text-xs font-medium transition-colors hover:bg-accent/60', classNames?.dropdown_root),
          dropdown: cn(defaults.dropdown, 'absolute inset-0 z-10 cursor-pointer opacity-0', classNames?.dropdown),
          months_dropdown: cn(defaults.months_dropdown, 'relative', classNames?.months_dropdown),
          years_dropdown: cn(defaults.years_dropdown, 'relative', classNames?.years_dropdown),
          nav: cn(defaults.nav, 'pointer-events-none absolute inset-x-0 top-0 z-20 flex h-8 items-center justify-between', classNames?.nav),
          button_previous: cn(defaults.button_previous, navButton, 'pointer-events-auto relative z-20 size-8 p-0 text-muted-foreground hover:text-foreground', classNames?.button_previous),
          button_next: cn(defaults.button_next, navButton, 'pointer-events-auto relative z-20 size-8 p-0 text-muted-foreground hover:text-foreground', classNames?.button_next),
          chevron: cn(defaults.chevron, 'shrink-0', classNames?.chevron),
          month_grid: cn(defaults.month_grid, 'w-full border-collapse', classNames?.month_grid),
          weekdays: cn(defaults.weekdays, 'flex', classNames?.weekdays),
          weekday: cn(defaults.weekday, 'w-[var(--cell-size)] rounded-md text-center text-[0.7rem] font-medium text-muted-foreground', classNames?.weekday),
          week: cn(defaults.week, 'mt-1 flex w-full', classNames?.week),
          day: cn(defaults.day, 'relative h-[var(--cell-size)] w-[var(--cell-size)] flex-1 p-0 text-center text-sm', classNames?.day),
          day_button: cn(
            defaults.day_button,
            'inline-flex size-[calc(var(--cell-size)-4px)] items-center justify-center rounded-md p-0 font-normal text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover disabled:pointer-events-none disabled:opacity-40 aria-selected:bg-primary aria-selected:text-primary-foreground',
            classNames?.day_button,
          ),
          today: cn(defaults.today, 'rounded-md bg-accent text-accent-foreground', classNames?.today),
          outside: cn(defaults.outside, 'text-muted-foreground/45 aria-selected:text-muted-foreground/70', classNames?.outside),
          disabled: cn(defaults.disabled, 'text-muted-foreground/40 opacity-40', classNames?.disabled),
          hidden: cn(defaults.hidden, 'invisible', classNames?.hidden),
          selected: cn(defaults.selected, 'bg-primary text-primary-foreground', classNames?.selected),
          range_start: cn(defaults.range_start, 'rounded-s-md bg-accent', classNames?.range_start),
          range_middle: cn(defaults.range_middle, 'rounded-none bg-accent text-accent-foreground', classNames?.range_middle),
          range_end: cn(defaults.range_end, 'rounded-e-md bg-accent', classNames?.range_end),
          week_number: cn(defaults.week_number, 'w-[var(--cell-size)] text-center text-xs text-muted-foreground', classNames?.week_number),
          footer: cn(defaults.footer, 'pt-2 text-center text-xs text-muted-foreground', classNames?.footer),
        }}
        {...props}
      />
    </div>
  );
}

export { Calendar, type CalendarProps };
