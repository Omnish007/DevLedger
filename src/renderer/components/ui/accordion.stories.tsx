import type { Meta, StoryObj } from '@storybook/react-vite';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './accordion';

const meta = {
    title: 'Foundations/Accordion',
    component: Accordion,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Accordion>;
export default meta;
type Story = StoryObj;
export const Single: Story = {
    render: () => (
        <Accordion type="single" collapsible className="w-full max-w-xl">
            <AccordionItem value="overview">
                <AccordionTrigger>Workspace overview</AccordionTrigger>
                <AccordionContent>
                    Projects, notes, tasks and documents remain stored locally on this device.
                </AccordionContent>
            </AccordionItem>
            <AccordionItem value="privacy">
                <AccordionTrigger>Privacy and security</AccordionTrigger>
                <AccordionContent>
                    Protected notes are encrypted before persistence. Normal search never indexes locked
                    content.
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    ),
};
