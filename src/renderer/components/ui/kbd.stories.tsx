import type { Meta, StoryObj } from '@storybook/react-vite';
import { Kbd, KbdGroup } from './kbd';

const meta = {
    title: 'Foundation/Keyboard Shortcut',
    component: Kbd,
    parameters: { layout: 'centered' },
} satisfies Meta<typeof Kbd>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CommandPalette: Story = {
    render: () => (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>Open command search</span>
            <KbdGroup>
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
            </KbdGroup>
        </div>
    ),
};
