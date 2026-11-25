export const QUICK_CAPTURE_SHORTCUTS = [
    'CommandOrControl+Shift+Space',
    'CommandOrControl+Alt+Space',
    'CommandOrControl+Shift+K',
    'Alt+Shift+N',
] as const;

export type QuickCaptureShortcut = (typeof QUICK_CAPTURE_SHORTCUTS)[number];

export function isQuickCaptureShortcut(value: unknown): value is QuickCaptureShortcut {
    return typeof value === 'string' && QUICK_CAPTURE_SHORTCUTS.includes(value as QuickCaptureShortcut);
}
