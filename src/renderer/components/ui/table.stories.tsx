import type { Meta, StoryObj } from '@storybook/react-vite';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from './table';

const meta = {
    title: 'Foundation/Table',
    component: Table,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CompactProjectList: Story = {
    render: () => (
        <div className="max-w-3xl rounded-lg border border-border bg-card p-2">
            <Table>
                <TableCaption>Recent projects in this workspace.</TableCaption>
                <TableHeader>
                    <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Open tasks</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow>
                        <TableCell className="font-medium">Retail POS</TableCell>
                        <TableCell>In progress</TableCell>
                        <TableCell className="text-right tabular-nums">8</TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell className="font-medium">Customer Portal</TableCell>
                        <TableCell>Planning</TableCell>
                        <TableCell className="text-right tabular-nums">3</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </div>
    ),
};
