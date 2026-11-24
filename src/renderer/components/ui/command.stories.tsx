import type { Meta, StoryObj } from '@storybook/react-vite';
import { Folder, Search } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './command';

const meta = { title: 'Navigation/Command', component: Command } satisfies Meta<typeof Command>;
export default meta;
type Story = StoryObj<typeof meta>;
export const WorkspaceActions: Story = { render: () => <Command className="max-w-md border shadow-sm"><CommandInput placeholder="Search workspace actions…"/><CommandList><CommandEmpty>No command found.</CommandEmpty><CommandGroup heading="Navigate"><CommandItem><Folder/>Projects</CommandItem><CommandItem><Search/>Search knowledge</CommandItem></CommandGroup></CommandList></Command> };
