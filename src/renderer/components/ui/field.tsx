import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

const fieldVariants = cva('group/field flex w-full gap-2', { variants: { orientation: { vertical: 'flex-col [&>*]:w-full', horizontal: 'flex-row items-center', responsive: 'flex-col sm:flex-row sm:items-center' } }, defaultVariants: { orientation: 'vertical' } });
function FieldSet({ className, ...props }: React.ComponentProps<'fieldset'>) { return <fieldset data-slot="field-set" className={cn('flex flex-col gap-5', className)} {...props}/>; }
function FieldLegend({ className, variant = 'legend', ...props }: React.ComponentProps<'legend'> & { variant?: 'legend' | 'label' }) { return <legend data-slot="field-legend" data-variant={variant} className={cn('mb-2 font-medium data-[variant=legend]:text-base data-[variant=label]:text-sm', className)} {...props}/>; }
function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) { return <div data-slot="field-group" className={cn('flex w-full flex-col gap-5', className)} {...props}/>; }
function Field({ className, orientation, ...props }: React.ComponentProps<'div'> & VariantProps<typeof fieldVariants>) { return <div data-slot="field" data-orientation={orientation ?? 'vertical'} className={cn(fieldVariants({ orientation }), className)} {...props}/>; }
function FieldContent({ className, ...props }: React.ComponentProps<'div'>) { return <div data-slot="field-content" className={cn('flex min-w-0 flex-1 flex-col gap-1.5', className)} {...props}/>; }
function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) { return <Label data-slot="field-label" className={cn('text-sm font-medium leading-none', className)} {...props}/>; }
function FieldTitle({ className, ...props }: React.ComponentProps<'div'>) { return <div data-slot="field-title" className={cn('text-sm font-medium leading-none', className)} {...props}/>; }
function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) { return <p data-slot="field-description" className={cn('text-xs leading-relaxed text-muted-foreground', className)} {...props}/>; }
function FieldError({ className, children, ...props }: React.ComponentProps<'p'>) { return <p role="alert" data-slot="field-error" className={cn('text-xs font-medium text-destructive', className)} {...props}>{children}</p>; }
function FieldSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) { return <Separator data-slot="field-separator" className={cn('my-1', className)} {...props}/>; }
export { FieldSet, FieldLegend, FieldGroup, Field, FieldContent, FieldLabel, FieldTitle, FieldDescription, FieldError, FieldSeparator };
