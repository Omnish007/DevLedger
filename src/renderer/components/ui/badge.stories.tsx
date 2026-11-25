import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './badge';

const meta = {
    title: 'Foundation/Badge',
    component: Badge,
    parameters: { layout: 'centered' },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Statuses: Story = {
    render: () => (
        <div className="flex flex-wrap items-center gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">In progress</Badge>
            <Badge variant="outline">Ongoing</Badge>
            <Badge variant="destructive">Blocked</Badge>
        </div>
    ),
};
