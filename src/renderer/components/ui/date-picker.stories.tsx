import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DatePicker } from './date-picker';

const meta = { title: 'Forms/DatePicker', component: DatePicker } satisfies Meta<typeof DatePicker>;
export default meta;
type Story = StoryObj;
function DueDateDemo() {
    const [date, setDate] = useState<Date | undefined>();
    return (
        <div className="w-72">
            <DatePicker
                {...(date ? { value: date } : {})}
                onChange={setDate}
                placeholder="Set task due date"
            />
        </div>
    );
}
export const DueDate: Story = { render: () => <DueDateDemo /> };
