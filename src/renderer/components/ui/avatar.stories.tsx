import type { Meta, StoryObj } from '@storybook/react-vite';
import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup } from './avatar';

const meta = { title: 'Data display/Avatar', component: Avatar } satisfies Meta<typeof Avatar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ContactGroup: Story = {
    render: () => (
        <AvatarGroup>
            <Avatar>
                <AvatarFallback>AS</AvatarFallback>
                <AvatarBadge />
            </Avatar>
            <Avatar>
                <AvatarFallback>MK</AvatarFallback>
            </Avatar>
            <Avatar size="sm">
                <AvatarFallback>JD</AvatarFallback>
            </Avatar>
        </AvatarGroup>
    ),
};
