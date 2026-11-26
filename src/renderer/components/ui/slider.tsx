import * as React from 'react';
import { Slider as SliderPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

function Slider({
    className,
    value,
    defaultValue,
    min = 0,
    max = 100,
    ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
    const values = React.useMemo(
        () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min]),
        [value, defaultValue, min],
    );
    return (
        <SliderPrimitive.Root
            data-slot="slider"
            value={value}
            defaultValue={defaultValue}
            min={min}
            max={max}
            className={cn(
                'relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50',
                className,
            )}
            {...props}
        >
            <SliderPrimitive.Track
                data-slot="slider-track"
                className="relative h-1.5 grow overflow-hidden rounded-full bg-muted"
            >
                <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-primary" />
            </SliderPrimitive.Track>
            {values.map((_, index) => (
                <SliderPrimitive.Thumb
                    data-slot="slider-thumb"
                    key={index}
                    className="block size-4 shrink-0 rounded-full border border-primary/70 bg-background shadow-sm outline-none transition-shadow focus-visible:ring-4 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50"
                />
            ))}
        </SliderPrimitive.Root>
    );
}
export { Slider };
