import type { UseFormReturn } from 'react-hook-form';
import { ListPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import { SmartDateField } from '@/components/shared/SmartDateField';
import type { CreateTaskForm } from './task-form-schema';
import { TaskFormDialogFooter, TaskScheduleFields, TaskTextFields } from './TaskFormFields';

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
    const errorMessage = form.formState.errors.root?.message || error;

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DialogContent className="w-[min(94vw,660px)] gap-0 overflow-hidden rounded-xl p-0">
                <DialogHeader className="border-b border-border/75 bg-surface-subtle/35 px-6 py-4 pr-12">
                    <div className="flex items-center gap-3">
                        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                            <ListPlus className="size-4.5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                            <DialogTitle>New task</DialogTitle>
                            <DialogDescription>Add a task to your project.</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <form onSubmit={onSubmit} noValidate>
                    <div className="space-y-5 px-6 py-5">
                        <TaskTextFields
                            autoFocusTitle
                            titleProps={form.register('title')}
                            titlePlaceholder="What needs to be done?"
                            titleError={form.formState.errors.title?.message}
                            descriptionProps={form.register('description')}
                            descriptionAriaLabel="Task description"
                            descriptionPlaceholder="Add context, links or acceptance notes…"
                            descriptionError={form.formState.errors.description?.message}
                        />

                        <TaskScheduleFields
                            leadingField={
                                <div className="space-y-1.5 text-xs font-medium">
                                    <span>Project</span>
                                    <RemoteRecordPicker
                                        entityType="project"
                                        value={selectedProject}
                                        onValueChange={(value) => onProjectChange(value)}
                                        onChoiceChange={(choice) =>
                                            onProjectChange(choice?.id ?? '', choice?.label)
                                        }
                                        placeholder="Choose project"
                                        ariaLabel={selectedProjectLabel || 'Choose project'}
                                        selectedLabel={selectedProjectLabel}
                                    />
                                    {form.formState.errors.projectId && (
                                        <p className="text-[11px] text-danger" role="alert">
                                            {form.formState.errors.projectId.message}
                                        </p>
                                    )}
                                </div>
                            }
                            priorityProps={form.register('priority')}
                            priorityAriaLabel="Priority"
                            dueDateField={
                                <>
                                    <SmartDateField
                                        label="Due date & time"
                                        value={dueAt}
                                        onChange={(next) =>
                                            form.setValue('dueAt', next, {
                                                shouldDirty: true,
                                                shouldValidate: true,
                                            })
                                        }
                                        compact
                                    />
                                    {form.formState.errors.dueAt && (
                                        <p className="mt-1 text-[11px] text-danger" role="alert">
                                            {form.formState.errors.dueAt.message}
                                        </p>
                                    )}
                                </>
                            }
                            estimateProps={form.register('estimate')}
                            estimatePlaceholder="e.g. 45"
                            estimateError={form.formState.errors.estimate?.message}
                            parentId={parentId}
                            parentProjectId={selectedProject || null}
                            parentDisabled={!selectedProject}
                            parentPlaceholder={selectedProject ? 'Top-level task' : 'Select a project first'}
                            selectedParentLabel={selectedParentLabel}
                            onParentChange={(value) => form.setValue('parentId', value)}
                        />
                    </div>

                    <TaskFormDialogFooter
                        errorMessage={errorMessage}
                        busy={busy}
                        submitLabel={busy ? 'Creating…' : 'Create task'}
                        onClose={onClose}
                    />
                </form>
            </DialogContent>
        </Dialog>
    );
}
