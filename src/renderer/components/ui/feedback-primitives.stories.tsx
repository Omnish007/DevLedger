import type { Meta, StoryObj } from '@storybook/react-vite';
import { Progress } from './progress';
import { Skeleton } from './skeleton';
import { Spinner } from './spinner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';

function FeedbackDemo() {
  return (
    <div className="grid max-w-xl gap-4">
      <Card>
        <CardHeader><CardTitle>Document extraction</CardTitle><CardDescription>Extracting searchable text from a local file.</CardDescription></CardHeader>
        <CardContent className="space-y-3"><div className="flex items-center gap-2 text-xs"><Spinner className="size-3.5"/> Processing pages 8 of 12</div><Progress value={67}/></CardContent>
      </Card>
      <div className="space-y-2"><Skeleton className="h-4 w-40"/><Skeleton className="h-3 w-full"/><Skeleton className="h-3 w-4/5"/></div>
    </div>
  );
}

const meta = { title: 'Workflows/Feedback primitives', component: FeedbackDemo } satisfies Meta<typeof FeedbackDemo>;
export default meta;
type Story = StoryObj<typeof meta>;
export const LoadingAndProgress: Story = { render: () => <FeedbackDemo /> };
