import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return 'No date';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
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
  while (value >= 1_000 && index < units.length - 1) { value /= 1_000; index += 1; }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

export function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
