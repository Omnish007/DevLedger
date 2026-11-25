import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowRight, Plus, Search } from 'lucide-react';
import { Button } from './button';

const meta = {
    title: 'Foundation/Button',
    component: Button,
    args: { children: 'Button' },
    parameters: { layout: 'centered' },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
    render: () => (
        <div className="flex flex-wrap items-center gap-2">
            <Button>Primary action</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Text link</Button>
        </div>
    ),
};

export const IconActions: Story = {
    render: () => (
        <div className="flex items-center gap-2">
            <Button>
                <Plus /> New project
            </Button>
            <Button variant="outline">
                <Search /> Search
            </Button>
            <Button variant="secondary">
                Continue <ArrowRight />
            </Button>
            <Button variant="outline" size="icon" aria-label="Search">
                <Search />
            </Button>
        </div>
    ),
};
