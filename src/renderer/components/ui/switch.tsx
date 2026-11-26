import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

function Switch({
    className,
    size = 'default',
    ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & { size?: 'sm' | 'default' }) {
    return (
        <SwitchPrimitive.Root
            data-slot="switch"
            data-size={size}
            className={cn(
                'peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-input/60 p-0.5 shadow-[var(--shadow-xs)] transition-colors outline-none before:absolute before:-inset-1 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-6 data-[size=default]:w-11 data-[size=sm]:h-6 data-[size=sm]:w-10 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=unchecked]:bg-input/85',
                className,
            )}
            {...props}
        >
            <SwitchPrimitive.Thumb
                data-slot="switch-thumb"
                className="pointer-events-none block rounded-full bg-card shadow-xs ring-0 transition-transform group-data-[size=default]/switch:size-4.5 group-data-[size=sm]/switch:size-4.5 data-[state=checked]:translate-x-5 group-data-[size=sm]/switch:data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
            />
        </SwitchPrimitive.Root>
    );
}

export { Switch };
