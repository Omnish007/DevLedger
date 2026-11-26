import { useFieldArray, type UseFormReturn } from 'react-hook-form';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { RemoteRecordPicker } from '@/components/shared/RemoteRecordPicker';
import type { ContactFormValues } from './contact-form-schema';

const STANDARD_ROLES = [
    'client',
    'project_manager',
    'technical_manager',
    'developer',
    'designer',
    'vendor',
    'other',
];

interface ContactFormDialogProps {
    open: boolean;
    editing: boolean;
    busy: boolean;
    form: UseFormReturn<ContactFormValues>;
    projectNames: Record<string, string>;
    onOpenChange: (next: boolean) => void;
    onSubmit: (values: ContactFormValues) => Promise<void>;
}

export function ContactFormDialog({
    open,
    editing,
    busy,
    form,
    projectNames,
    onOpenChange,
    onSubmit,
}: ContactFormDialogProps) {
    const {
        fields: attributeFields,
        append: appendAttribute,
        remove: removeAttribute,
    } = useFieldArray({ control: form.control, name: 'customAttributes' });
    const [role, projectId] = form.watch(['role', 'projectId']);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{editing ? 'Edit contact' : 'Add a contact'}</DialogTitle>
                    <DialogDescription>Store local contact details and link to a project.</DialogDescription>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 text-xs font-medium">
                    <label className="block space-y-1">
                        Name
                        <Input
                            autoFocus
                            {...form.register('name')}
                            maxLength={160}
                            placeholder="Full name"
                            aria-invalid={Boolean(form.formState.errors.name)}
                        />
                        {form.formState.errors.name && (
                            <p role="alert" className="text-xs font-normal text-destructive">
                                {form.formState.errors.name.message}
                            </p>
                        )}
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="block space-y-1">
                            Role
                            <NativeSelect {...form.register('role')} className="h-9 w-full text-xs">
                                <NativeSelectOption value="client">Main client</NativeSelectOption>
                                <NativeSelectOption value="project_manager">
                                    Project manager
                                </NativeSelectOption>
                                <NativeSelectOption value="technical_manager">
                                    Technical manager
                                </NativeSelectOption>
                                <NativeSelectOption value="developer">Developer</NativeSelectOption>
                                <NativeSelectOption value="designer">Designer</NativeSelectOption>
                                <NativeSelectOption value="vendor">Vendor</NativeSelectOption>
                                <NativeSelectOption value="other">Other</NativeSelectOption>
                                {!STANDARD_ROLES.includes(role) && (
                                    <NativeSelectOption value={role}>
                                        {role.replaceAll('_', ' ')}
                                    </NativeSelectOption>
                                )}
                            </NativeSelect>
                        </label>
                        <label className="block space-y-1">
                            Project
                            <RemoteRecordPicker
                                entityType="project"
                                value={projectId}
                                onValueChange={(v) => form.setValue('projectId', v, { shouldDirty: true })}
                                placeholder="No project"
                                selectedLabel={projectNames[projectId]}
                            />
                        </label>
                    </div>
                    <label className="block space-y-1">
                        Company
                        <Input {...form.register('company')} maxLength={160} />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="block space-y-1">
                            Email
                            <Input type="email" {...form.register('email')} maxLength={254} />
                        </label>
                        <label className="block space-y-1">
                            Phone
                            <Input {...form.register('phone')} maxLength={80} />
                        </label>
                    </div>
                    <label className="block space-y-1">
                        Notes
                        <Textarea {...form.register('notes')} rows={2} maxLength={10000} />
                    </label>
                    <section className="space-y-2 rounded-md border border-border p-2.5">
                        <div className="flex items-center justify-between">
                            <span>Custom fields</span>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => appendAttribute({ key: '', value: '' })}
                                disabled={attributeFields.length >= 20}
                            >
                                <Plus className="size-3" />
                                Add
                            </Button>
                        </div>
                        {attributeFields.map((field, idx) => (
                            <div key={field.id} className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
                                <Input
                                    placeholder="Field"
                                    maxLength={40}
                                    {...form.register(`customAttributes.${idx}.key`)}
                                />
                                <Input
                                    placeholder="Value"
                                    maxLength={500}
                                    {...form.register(`customAttributes.${idx}.value`)}
                                />
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="size-8"
                                    aria-label={`Remove custom field ${idx + 1}`}
                                    onClick={() => removeAttribute(idx)}
                                >
                                    <X className="size-3.5" />
                                </Button>
                            </div>
                        ))}
                    </section>
                    {form.formState.errors.root?.message && (
                        <p role="alert" className="text-destructive">
                            {form.formState.errors.root.message}
                        </p>
                    )}
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={busy}>
                            {busy ? 'Saving…' : 'Save'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
