import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './alert-dialog';

const meta = { title: 'Overlays/AlertDialog', component: AlertDialog } satisfies Meta<typeof AlertDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ConfirmArchive: Story = { render: () => <AlertDialog><AlertDialogTrigger asChild><Button variant="outline">Archive project</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Archive this project?</AlertDialogTitle><AlertDialogDescription>The project will leave the active list. You can restore it later.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction>Archive project</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> };
