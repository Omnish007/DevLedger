import type { UseFormReturn } from 'react-hook-form';
import { Pencil } from 'lucide-react';
import type { TaskRecord } from '@shared/contracts';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SmartDateField } from '@/components/shared/SmartDateField';
import { statuses, type EditTaskForm } from './task-form-schema';
import { TaskFormDialogFooter, TaskScheduleFields, TaskTextFields } from './TaskFormFields';

interface Props {
    task: TaskRecord | null;
    form: UseFormReturn<EditTaskForm>;
    busy: boolean;
    error: string;
    selectedParentLabel?: string | undefined;
    onClose: () => void;
    onSave: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function TaskEditDialog({ task, form, busy, error, selectedParentLabel, onClose, onSave }: Props) {
    const parentId = form.watch('parentId');
    const dueAt = form.watch('dueAt');
    const errorMessage = form.formState.errors.root?.message || error;

    return (
        <Dialog
            open={Boolean(task)}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DialogContent className="w-[min(94vw,660px)] gap-0 overflow-hidden rounded-xl p-0">
                <DialogHeader className="border-b border-border/75 bg-surface-subtle/35 px-6 py-4 pr-12">
                    <div className="flex items-center gap-3">
                        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                            <Pencil className="size-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                            <DialogTitle>Edit task</DialogTitle>
                            <DialogDescription>Update task details.</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>
                {task && (
                    <form onSubmit={onSave} noValidate>
                        <div className="space-y-5 px-6 py-5">
                            <TaskTextFields
                                titleProps={form.register('title')}
                                titleError={form.formState.errors.title?.message}
                                descriptionProps={form.register('description')}
                                descriptionMaxLength={20_000}
                                descriptionError={form.formState.errors.description?.message}
                            />

                            <TaskScheduleFields
                                leadingField={
                                    <label className="block space-y-1.5 text-xs font-medium">
                                        <span>Status</span>
                                        <NativeSelect
                                            {...form.register('status')}
                                            className="h-9 w-full text-xs"
                                        >
                                            {statuses.map((item) => (
                                                <NativeSelectOption key={item.value} value={item.value}>
                                                    {item.label}
                                                </NativeSelectOption>
                                            ))}
                                        </NativeSelect>
                                    </label>
                                }
                                priorityProps={form.register('priority')}
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
                                            <p role="alert" className="mt-1 text-[11px] text-danger">
                                                {form.formState.errors.dueAt.message}
                                            </p>
                                        )}
                                    </>
                                }
                                estimateProps={form.register('estimate')}
                                estimateError={form.formState.errors.estimate?.message}
                                parentId={parentId}
                                parentProjectId={task.projectId}
                                excludeParentTaskId={task.id}
                                parentPlaceholder="Top-level task"
                                selectedParentLabel={selectedParentLabel}
                                onParentChange={(value) =>
                                    form.setValue('parentId', value, {
                                        shouldDirty: true,
                                        shouldValidate: true,
                                    })
                                }
                            />
                        </div>

                        <TaskFormDialogFooter
                            errorMessage={errorMessage}
                            busy={busy}
                            submitLabel="Save changes"
                            onClose={onClose}
                        />
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
