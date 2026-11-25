import type { Meta, StoryObj } from '@storybook/react-vite';
import { FolderOpen, Plus } from 'lucide-react';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './empty';
import { Button } from './button';

const meta = {
    title: 'Patterns/Empty State',
    component: Empty,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Empty>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NoProjects: Story = {
    render: () => (
        <Empty className="min-h-72 border bg-card">
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <FolderOpen />
                </EmptyMedia>
                <EmptyTitle>Your project space is ready</EmptyTitle>
                <EmptyDescription>
                    Create a project to connect tasks, notes, files and decisions in one place.
                </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
                <Button>
                    <Plus /> Create project
                </Button>
            </EmptyContent>
        </Empty>
    ),
};
