import { useState } from 'react';
import type { DateRange } from '@daypicker/react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Calendar } from './calendar';

const meta = { title: 'Forms/Calendar', component: Calendar, parameters: { layout: 'centered' } } satisfies Meta<typeof Calendar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SingleDate: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>(new Date());
    return <Calendar mode="single" selected={date} onSelect={setDate} />;
  },
};

export const DateRange: Story = {
  render: () => {
    const [range, setRange] = useState<DateRange | undefined>();
    return <Calendar mode="range" selected={range} onSelect={setRange} numberOfMonths={2} />;
  },
};

export const MonthAndYearNavigation: Story = {
  render: () => <Calendar mode="single" captionLayout="dropdown" startMonth={new Date(2020, 0)} endMonth={new Date(2035, 11)} />,
};
