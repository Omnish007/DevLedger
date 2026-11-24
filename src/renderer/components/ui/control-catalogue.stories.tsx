import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Check, Code2, ListTodo } from 'lucide-react';
import { Badge } from './badge';
import { Button } from './button';
import { ButtonGroup, ButtonGroupSeparator } from './button-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Checkbox } from './checkbox';
import { Field, FieldContent, FieldDescription, FieldLabel, FieldSet, FieldTitle } from './field';
import { Input } from './input';
import { Label } from './label';
import { NativeSelect, NativeSelectOption } from './native-select';
import { Progress } from './progress';
import { RadioGroup, RadioGroupItem } from './radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { Separator } from './separator';
import { Skeleton } from './skeleton';
import { Slider } from './slider';
import { Spinner } from './spinner';
import { Switch } from './switch';
import { Textarea } from './textarea';
import { Toggle } from './toggle';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';

const meta = {
  title: 'Design System/Control Catalogue',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function ControlCatalogue() {
  const [completed, setCompleted] = useState(true);
  const [notifications, setNotifications] = useState(false);
  const [density, setDensity] = useState('comfortable');
  const [priority, setPriority] = useState('normal');
  const [progress, setProgress] = useState([62]);
  const [format, setFormat] = useState('markdown');
  const [emphasis, setEmphasis] = useState('bold');

  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Task preferences</CardTitle>
            <Badge variant="secondary">Local settings</Badge>
          </div>
          <CardDescription>Shared form controls use the same semantic tokens in both themes.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldSet className="gap-4">
            <Field>
              <FieldContent>
                <FieldLabel htmlFor="catalogue-task-title">Task title</FieldLabel>
                <Input id="catalogue-task-title" defaultValue="Review project scope" />
                <FieldDescription>Use a short, action-oriented title.</FieldDescription>
              </FieldContent>
            </Field>
            <Field>
              <FieldContent>
                <FieldLabel htmlFor="catalogue-task-description">Description</FieldLabel>
                <Textarea id="catalogue-task-description" defaultValue="Confirm requirements and list open questions." />
              </FieldContent>
            </Field>
            <Field orientation="horizontal" className="items-center justify-between">
              <FieldContent>
                <FieldTitle>Completed</FieldTitle>
                <FieldDescription>Mark this example task as done.</FieldDescription>
              </FieldContent>
              <Checkbox checked={completed} onCheckedChange={(value) => setCompleted(value === true)} aria-label="Completed" />
            </Field>
            <Field orientation="horizontal" className="items-center justify-between">
              <FieldContent>
                <FieldTitle>Desktop reminders</FieldTitle>
                <FieldDescription>Show reminder notifications.</FieldDescription>
              </FieldContent>
              <Switch checked={notifications} onCheckedChange={setNotifications} aria-label="Desktop reminders" />
            </Field>
            <Separator />
            <Field>
              <FieldContent>
                <FieldLabel>Density</FieldLabel>
                <RadioGroup value={density} onValueChange={setDensity} className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="comfortable" />Comfortable</label>
                  <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="compact" />Compact</label>
                </RadioGroup>
              </FieldContent>
            </Field>
          </FieldSet>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Selection and formatting</CardTitle>
          <CardDescription>Searchable app selectors and compact editor controls.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="catalogue-format">Export format</Label>
            <NativeSelect id="catalogue-format" value={format} onChange={(event) => setFormat(event.target.value)}>
              <NativeSelectOption value="markdown">Markdown</NativeSelectOption>
              <NativeSelectOption value="csv">CSV</NativeSelectOption>
              <NativeSelectOption value="json">JSON</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue placeholder="Choose priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Editor emphasis</Label>
            <ToggleGroup type="single" value={emphasis} onValueChange={(value) => value && setEmphasis(value)} variant="outline" size="sm">
              <ToggleGroupItem value="bold" aria-label="Bold"><strong>B</strong></ToggleGroupItem>
              <ToggleGroupItem value="italic" aria-label="Italic"><em>I</em></ToggleGroupItem>
              <ToggleGroupItem value="code" aria-label="Code"><Code2 className="size-4" /></ToggleGroupItem>
            </ToggleGroup>
            <div><Toggle aria-label="Pin this format" defaultPressed><Check className="size-4" />Pinned</Toggle></div>
          </div>
          <ButtonGroup>
            <Button variant="outline" size="sm"><ListTodo className="size-4" />Tasks</Button>
            <ButtonGroupSeparator />
            <Button variant="outline" size="sm">Documents</Button>
          </ButtonGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Progress and loading</CardTitle>
          <CardDescription>Long-running work should always communicate its state.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-xs"><Label>Indexing progress</Label><span className="tabular-nums text-muted-foreground">{progress[0]}%</span></div>
            <Progress value={progress[0]} />
            <Slider value={progress} onValueChange={setProgress} min={0} max={100} step={1} aria-label="Progress demonstration" />
          </div>
          <div className="flex items-center gap-3"><Spinner /><span className="text-sm text-muted-foreground">Processing document…</span></div>
          <div className="space-y-2"><Skeleton className="h-4 w-2/5"/><Skeleton className="h-3 w-full"/><Skeleton className="h-3 w-4/5"/></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Record state</CardTitle>
          <CardDescription>Non-color labels communicate state and importance.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant="success">Indexed</Badge>
          <Badge variant="warning">Waiting</Badge>
          <Badge variant="destructive">Blocked</Badge>
          <Badge variant="outline">Draft</Badge>
          <Badge variant="secondary">{completed ? 'Completed' : 'In progress'}</Badge>
        </CardContent>
      </Card>
    </div>
  );
}

export const FormsAndFeedback: Story = { render: () => <ControlCatalogue /> };
