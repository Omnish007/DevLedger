import { useState } from 'react';
import type { DateRange as DayPickerDateRange } from '@daypicker/react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Calendar } from './calendar';

const meta = {
    title: 'Forms/Calendar',
    component: Calendar,
    parameters: { layout: 'centered' },
} satisfies Meta<typeof Calendar>;
export default meta;
type Story = StoryObj;

function SingleDateDemo() {
    const [date, setDate] = useState<Date | undefined>(new Date());
    return <Calendar mode="single" selected={date} onSelect={setDate} />;
}

function DateRangeDemo() {
    const [range, setRange] = useState<DayPickerDateRange | undefined>();
    return <Calendar mode="range" selected={range} onSelect={setRange} numberOfMonths={2} />;
}

export const SingleDate: Story = { render: () => <SingleDateDemo /> };
export const DateRange: Story = { render: () => <DateRangeDemo /> };
export const MonthAndYearNavigation: Story = {
    render: () => (
        <Calendar
            mode="single"
            captionLayout="dropdown"
            startMonth={new Date(2020, 0)}
            endMonth={new Date(2035, 11)}
        />
    ),
};
