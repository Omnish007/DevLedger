import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DatePicker } from './date-picker';

const meta = { title: 'Forms/DatePicker', component: DatePicker } satisfies Meta<typeof DatePicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const DueDate: Story = { render: () => { const [date, setDate] = useState<Date | undefined>(); return <div className="w-72"><DatePicker value={date} onChange={setDate} placeholder="Set task due date"/></div>; } };
