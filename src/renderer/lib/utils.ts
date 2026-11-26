import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}

export function formatDate(value: string | null | undefined): string {
    if (!value) return 'No date';
    const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
    if (Number.isNaN(date.getTime())) return 'Invalid date';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(
        date,
    );
}

export function formatRelative(value: string): string {
    const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
    const delta = date.getTime() - Date.now();
    const days = Math.round(delta / 86_400_000);
    if (Math.abs(days) < 1) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days === -1) return 'Yesterday';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

export function formatBytes(bytes: number): string {
    if (bytes < 1_000) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1_000;
    let index = 0;
    while (value >= 1_000 && index < units.length - 1) {
        value /= 1_000;
        index += 1;
    }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

export function toDateTimeLocalInput(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function contactInitials(name: string): string {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('');
}

export function friendlyError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
    const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    const cleaned = raw
        .replace(/^(?:Error:\s*)?Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '')
        .trim();
    return cleaned || fallback;
}
