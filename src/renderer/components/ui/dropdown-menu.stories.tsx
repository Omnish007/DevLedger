import type { Meta, StoryObj } from '@storybook/react-vite';
import { MoreHorizontal, Pencil, Archive } from 'lucide-react';
import { Button } from './button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from './dropdown-menu';

const meta = { title: 'Overlays/DropdownMenu', component: DropdownMenu } satisfies Meta<typeof DropdownMenu>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ProjectActions: Story = {
    render: () => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                    <MoreHorizontal />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem>
                    <Pencil />
                    Edit project
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                    <Archive />
                    Archive project
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    ),
};
