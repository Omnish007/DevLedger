import type { UseFormReturn } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { SmartDateField } from '@/components/shared/SmartDateField';
import type { CreateTaskForm } from './task-form-schema';

interface Props {
    open: boolean;
    form: UseFormReturn<CreateTaskForm>;
    busy: boolean;
    error: string;
    selectedProject: string;
    selectedProjectLabel?: string | undefined;
    selectedParentLabel?: string | undefined;
    onProjectChange: (projectId: string, label?: string) => void;
    onClose: () => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function TaskCreateDialog({
    open,
    form,
    busy,
    error,
    selectedProject,
    selectedProjectLabel,
    selectedParentLabel,
    onProjectChange,
    onClose,
    onSubmit,
}: Props) {
    const parentId = form.watch('parentId');
    const dueAt = form.watch('dueAt');

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DialogContent className="w-[min(94vw,640px)] p-6">
                <DialogHeader>
                    <DialogTitle>New task</DialogTitle>
                    <DialogDescription>Add a task to your project.</DialogDescription>
                </DialogHeader>
                <form onSubmit={onSubmit} noValidate className="space-y-4">
                    <div className="space-y-2.5">
                        <label className="block space-y-1.5 text-xs font-medium">
                            <span>Title</span>
                            <Input
                                autoFocus
                                {...form.register('title')}
                                placeholder="What needs to be done?"
                                maxLength={240}
                                className="h-10 text-sm font-medium"
                                aria-invalid={Boolean(form.formState.errors.title)}
                            />
                            {form.formState.errors.title && (
                                <p className="text-[11px] text-danger" role="alert">
                                    {form.formState.errors.title.message}
                                </p>
                            )}
                        </label>
                        <label className="block space-y-1.5 text-xs font-medium">
                            <span>
                                Description{' '}
                                <span className="font-normal text-muted-foreground">(optional)</span>
                            </span>
                            <Textarea
                                aria-label="Task description"
                                {...form.register('description')}
                                placeholder="Add context, links or acceptance notes…"
                                rows={3}
                            />
                            {form.formState.errors.description && (
                                <p className="text-[11px] text-danger" role="alert">
                                    {form.formState.errors.description.message}
                                </p>
                            )}
                        </label>
                    </div>

                    <div className="grid gap-3 border-t border-border pt-3.5 sm:grid-cols-2">
                        <div className="space-y-1.5 text-xs font-medium">
                            <span>Project</span>
                            <RemoteRecordPicker
                                entityType="project"
                                value={selectedProject}
                                onValueChange={(value) => onProjectChange(value)}
                                onChoiceChange={(choice) => onProjectChange(choice?.id ?? '', choice?.label)}
                                placeholder="Choose project"
                                selectedLabel={selectedProjectLabel}
                            />
                            {form.formState.errors.projectId && (
                                <p className="text-[11px] text-danger" role="alert">
                                    {form.formState.errors.projectId.message}
                                </p>
                            )}
                        </div>

                        <label className="block space-y-1.5 text-xs font-medium">
                            <span>Priority</span>
                            <NativeSelect
                                aria-label="Priority"
                                {...form.register('priority')}
                                className="h-9 w-full text-xs"
                            >
                                <NativeSelectOption value="low">Low</NativeSelectOption>
                                <NativeSelectOption value="medium">Medium</NativeSelectOption>
                                <NativeSelectOption value="high">High</NativeSelectOption>
                                <NativeSelectOption value="urgent">Urgent</NativeSelectOption>
                            </NativeSelect>
                        </label>

                        <div className="sm:col-span-2">
                            <SmartDateField
                                label="Due date & time"
                                value={dueAt}
                                onChange={(next) =>
                                    form.setValue('dueAt', next, { shouldDirty: true, shouldValidate: true })
                                }
                                compact
                            />
                            {form.formState.errors.dueAt && (
                                <p className="mt-1 text-[11px] text-danger" role="alert">
                                    {form.formState.errors.dueAt.message}
                                </p>
                            )}
                        </div>

                        <label className="block space-y-1.5 text-xs font-medium">
                            <span>
                                Estimate <span className="font-normal text-muted-foreground">(optional)</span>
                            </span>
                            <div className="relative">
                                <Input
                                    type="number"
                                    min="0"
                                    max="525600"
                                    {...form.register('estimate')}
                                    placeholder="e.g. 45"
                                    className="pr-11"
                                    aria-invalid={Boolean(form.formState.errors.estimate)}
                                />
                                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                    min
                                </span>
                            </div>
                            {form.formState.errors.estimate && (
                                <p className="text-[11px] text-danger" role="alert">
                                    {form.formState.errors.estimate.message}
                                </p>
                            )}
                        </label>

                        <div className="space-y-1.5 text-xs font-medium">
                            <span>
                                Parent task{' '}
                                <span className="font-normal text-muted-foreground">(optional)</span>
                            </span>
                            <RemoteRecordPicker
                                entityType="task"
                                value={parentId}
                                onValueChange={(value) => form.setValue('parentId', value)}
                                projectId={selectedProject || null}
                                includeCompleted={false}
                                disabled={!selectedProject}
                                placeholder={selectedProject ? 'Top-level task' : 'Select a project first'}
                                selectedLabel={selectedParentLabel}
                            />
                        </div>
                    </div>

                    {(form.formState.errors.root?.message || error) && (
                        <Alert variant="destructive" className="py-2">
                            <AlertDescription>
                                {form.formState.errors.root?.message || error}
                            </AlertDescription>
                        </Alert>
                    )}
                    <div className="flex justify-end gap-2 border-t border-border pt-3">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={busy}>
                            {busy ? 'Creating…' : 'Create task'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
