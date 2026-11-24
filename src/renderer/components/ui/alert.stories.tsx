import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlertCircle, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './alert';

const meta = { title: 'Feedback/Alert', component: Alert, parameters: { layout: 'padded' } } satisfies Meta<typeof Alert>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Information: Story = {
  render: () => <Alert><Info/><AlertTitle>Indexing is running</AlertTitle><AlertDescription>New document content will become searchable after background extraction completes.</AlertDescription></Alert>,
};

export const Destructive: Story = {
  render: () => <Alert variant="destructive"><AlertCircle/><AlertTitle>Backup verification failed</AlertTitle><AlertDescription>The archive was preserved, but it is not marked as a verified recovery point.</AlertDescription></Alert>,
};
