import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import { ButtonGroup } from './button-group';
import { Checkbox } from './checkbox';
import { Field, FieldContent, FieldDescription, FieldLabel } from './field';
import { InputGroup, InputGroupAddon, InputGroupInput } from './input-group';
import { Progress } from './progress';
import { Switch } from './switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

function WorkflowControlsDemo() {
    const [enabled, setEnabled] = useState(false);
    const [checked, setChecked] = useState(false);
    const [tab, setTab] = useState('overview');
    return (
        <div className="grid w-full max-w-2xl gap-6">
            <Field>
                <FieldContent>
                    <FieldLabel htmlFor="story-search">Search field</FieldLabel>
                    <InputGroup>
                        <InputGroupAddon>⌕</InputGroupAddon>
                        <InputGroupInput id="story-search" placeholder="Search local project records…" />
                    </InputGroup>
                    <FieldDescription>Consistent labeling and inline controls.</FieldDescription>
                </FieldContent>
            </Field>
            <div className="flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                    <Switch checked={enabled} onCheckedChange={setEnabled} /> Enable semantic matching
                </label>
                <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={checked} onCheckedChange={(value) => setChecked(value === true)} />{' '}
                    Confirm backup destination
                </label>
            </div>
            <ButtonGroup>
                <Button size="sm" variant="outline">
                    Day
                </Button>
                <Button size="sm" variant="secondary">
                    Week
                </Button>
                <Button size="sm" variant="outline">
                    Month
                </Button>
            </ButtonGroup>
            <div className="space-y-2">
                <div className="flex justify-between text-xs">
                    <span>Indexing progress</span>
                    <span className="tabular-nums">68%</span>
                </div>
                <Progress value={68} />
            </div>
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="activity">Activity</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="text-sm text-muted-foreground">
                    A concise project overview.
                </TabsContent>
                <TabsContent value="activity" className="text-sm text-muted-foreground">
                    Chronological project activity.
                </TabsContent>
            </Tabs>
        </div>
    );
}

const meta = { title: 'Workflows/Shared controls', component: WorkflowControlsDemo } satisfies Meta<
    typeof WorkflowControlsDemo
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Controls: Story = { render: () => <WorkflowControlsDemo /> };
