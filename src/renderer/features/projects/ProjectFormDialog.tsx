import type { UseFormReturn } from 'react-hook-form';
import { ArrowUpRight } from 'lucide-react';
import type { ProjectInput } from '@shared/contracts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import type { ProjectFormValues } from './project-form-schema';

interface ProjectFormDialogProps {
    open: boolean;
    editing: boolean;
    saving: boolean;
    form: UseFormReturn<ProjectFormValues>;
    onOpenChange: (next: boolean) => void;
    onSubmit: (values: ProjectFormValues) => Promise<void>;
}

export function ProjectFormDialog({
    open,
    editing,
    saving,
    form,
    onOpenChange,
    onSubmit,
}: ProjectFormDialogProps) {
    const type = form.watch('type');

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{editing ? 'Edit project' : 'Create a project'}</DialogTitle>
                    <DialogDescription>
                        {editing ? 'Update project details.' : 'Start a new workspace project.'}
                    </DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
                    <label className="block space-y-1.5 text-xs font-medium">
                        <span>Project name</span>
                        <Input
                            autoFocus
                            {...form.register('name')}
                            placeholder="e.g. Retail POS"
                            maxLength={160}
                            aria-invalid={Boolean(form.formState.errors.name)}
                        />
                        {form.formState.errors.name && (
                            <p role="alert" className="text-xs text-destructive">
                                {form.formState.errors.name.message}
                            </p>
                        )}
                    </label>
                    <label className="block space-y-1.5 text-xs font-medium">
                        <span>
                            Description <span className="font-normal text-muted-foreground">(optional)</span>
                        </span>
                        <Textarea {...form.register('description')} rows={3} maxLength={10000} />
                    </label>
                    {!editing && (
                        <fieldset className="space-y-2">
                            <legend className="text-xs font-medium">Project type</legend>
                            <RadioGroup
                                value={type}
                                onValueChange={(value) =>
                                    form.setValue('type', value as ProjectInput['type'], {
                                        shouldDirty: true,
                                        shouldValidate: true,
                                    })
                                }
                                className="grid grid-cols-2 gap-2"
                            >
                                <label
                                    htmlFor="project-type-greenfield"
                                    data-selected={type === 'greenfield'}
                                    className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 text-xs data-[selected=true]:border-ring data-[selected=true]:bg-accent"
                                >
                                    <RadioGroupItem
                                        id="project-type-greenfield"
                                        value="greenfield"
                                        className="mt-0.5"
                                    />
                                    <span>
                                        <span className="block font-semibold">Greenfield</span>
                                        <span className="text-muted-foreground">Starting from scratch</span>
                                    </span>
                                </label>
                                <label
                                    htmlFor="project-type-ongoing"
                                    data-selected={type === 'ongoing'}
                                    className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 text-xs data-[selected=true]:border-ring data-[selected=true]:bg-accent"
                                >
                                    <RadioGroupItem
                                        id="project-type-ongoing"
                                        value="ongoing"
                                        className="mt-0.5"
                                    />
                                    <span>
                                        <span className="block font-semibold">Ongoing</span>
                                        <span className="text-muted-foreground">Existing maintenance</span>
                                    </span>
                                </label>
                            </RadioGroup>
                        </fieldset>
                    )}
                    {form.formState.errors.root?.message && (
                        <p role="alert" className="text-xs text-destructive">
                            {form.formState.errors.root.message}
                        </p>
                    )}
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create project'}{' '}
                            <ArrowUpRight className="size-3.5" />
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
