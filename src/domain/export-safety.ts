/** Quote CSV cells and neutralize values that spreadsheet software could evaluate as formulas. */
export function csvCell(value: unknown): string {
    const text = value === null || value === undefined ? '' : String(value);
    const safeText = /^[\t\r ]*[=+@-]/.test(text) ? `'${text}` : text;
    return `"${safeText.replace(/"/g, '""')}"`;
}
