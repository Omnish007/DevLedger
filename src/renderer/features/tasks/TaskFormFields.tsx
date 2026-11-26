import type { ReactNode } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';

interface TaskTextFieldsProps {
    titleProps: UseFormRegisterReturn;
    descriptionProps: UseFormRegisterReturn;
    titleError?: string | undefined;
    descriptionError?: string | undefined;
    autoFocusTitle?: boolean;
    titlePlaceholder?: string;
    descriptionAriaLabel?: string;
    descriptionPlaceholder?: string;
    descriptionMaxLength?: number;
}

export function TaskTextFields({
    titleProps,
    descriptionProps,
    titleError,
    descriptionError,
    autoFocusTitle = false,
    titlePlaceholder,
    descriptionAriaLabel,
    descriptionPlaceholder,
    descriptionMaxLength,
}: TaskTextFieldsProps) {
    return (
        <div className="space-y-3">
            <label className="block space-y-1.5 text-xs font-medium">
                <span>Title</span>
                <Input
                    autoFocus={autoFocusTitle}
                    {...titleProps}
                    placeholder={titlePlaceholder}
                    maxLength={240}
                    className="h-10 text-sm font-medium"
                    aria-invalid={Boolean(titleError)}
                />
                {titleError && (
                    <p className="text-[11px] text-danger" role="alert">
                        {titleError}
                    </p>
                )}
            </label>
            <label className="block space-y-1.5 text-xs font-medium">
                <span>
                    Description <span className="font-normal text-muted-foreground">(optional)</span>
                </span>
                <Textarea
                    aria-label={descriptionAriaLabel}
                    {...descriptionProps}
                    placeholder={descriptionPlaceholder}
                    maxLength={descriptionMaxLength}
                    rows={3}
                    className="resize-y"
                />
                {descriptionError && (
                    <p className="text-[11px] text-danger" role="alert">
                        {descriptionError}
                    </p>
                )}
            </label>
        </div>
    );
}

interface TaskScheduleFieldsProps {
    leadingField: ReactNode;
    priorityProps: UseFormRegisterReturn;
    priorityAriaLabel?: string;
    dueDateField: ReactNode;
    estimateProps: UseFormRegisterReturn;
    estimateError?: string | undefined;
    estimatePlaceholder?: string;
    parentId: string;
    parentProjectId: string | null;
    parentDisabled?: boolean;
    parentPlaceholder: string;
    selectedParentLabel?: string | undefined;
    onParentChange: (value: string) => void;
    excludeParentTaskId?: string | undefined;
}

export function TaskScheduleFields({
    leadingField,
    priorityProps,
    priorityAriaLabel,
    dueDateField,
    estimateProps,
    estimateError,
    estimatePlaceholder,
    parentId,
    parentProjectId,
    parentDisabled = false,
    parentPlaceholder,
    selectedParentLabel,
    onParentChange,
    excludeParentTaskId,
}: TaskScheduleFieldsProps) {
    return (
        <div className="space-y-3.5 rounded-xl border border-border/80 bg-surface-subtle/30 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Schedule & properties
            </p>
            <div className="grid gap-3.5 sm:grid-cols-2">
                {leadingField}

                <label className="block space-y-1.5 text-xs font-medium">
                    <span>Priority</span>
                    <NativeSelect
                        aria-label={priorityAriaLabel}
                        {...priorityProps}
                        className="h-9 w-full text-xs"
                    >
                        <NativeSelectOption value="low">Low</NativeSelectOption>
                        <NativeSelectOption value="medium">Medium</NativeSelectOption>
                        <NativeSelectOption value="high">High</NativeSelectOption>
                        <NativeSelectOption value="urgent">Urgent</NativeSelectOption>
                    </NativeSelect>
                </label>

                <div className="sm:col-span-2">{dueDateField}</div>

                <label className="block space-y-1.5 text-xs font-medium">
                    <span>
                        Estimate <span className="font-normal text-muted-foreground">(optional)</span>
                    </span>
                    <div className="relative">
                        <Input
                            type="number"
                            min="0"
                            max="525600"
                            {...estimateProps}
                            placeholder={estimatePlaceholder}
                            className="pr-11"
                            aria-invalid={Boolean(estimateError)}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            min
                        </span>
                    </div>
                    {estimateError && (
                        <p className="text-[11px] text-danger" role="alert">
                            {estimateError}
                        </p>
                    )}
                </label>

                <div className="space-y-1.5 text-xs font-medium">
                    <span>
                        Parent task <span className="font-normal text-muted-foreground">(optional)</span>
                    </span>
                    <RemoteRecordPicker
                        entityType="task"
                        value={parentId}
                        onValueChange={onParentChange}
                        projectId={parentProjectId}
                        includeCompleted={false}
                        excludeId={excludeParentTaskId}
                        disabled={parentDisabled}
                        placeholder={parentPlaceholder}
                        selectedLabel={selectedParentLabel}
                    />
                </div>
            </div>
        </div>
    );
}

interface TaskFormFooterProps {
    errorMessage?: string | undefined;
    busy: boolean;
    submitLabel: string;
    onClose: () => void;
}

export function TaskFormDialogFooter({ errorMessage, busy, submitLabel, onClose }: TaskFormFooterProps) {
    return (
        <>
            {errorMessage && (
                <Alert variant="destructive" className="py-2.5">
                    <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
            )}
            <div className="flex items-center justify-end gap-2 border-t border-border/75 bg-surface-subtle/45 px-6 py-3.5">
                <Button type="button" variant="outline" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                    {submitLabel}
                </Button>
            </div>
        </>
    );
}
