export interface ContactMentionReference { id: string; label: string; }

function escapeMarkdownLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
}

export function serializeContactMentionMarkdown(reference: ContactMentionReference): string {
  const id = encodeURIComponent(reference.id);
  const label = escapeMarkdownLabel(reference.label.replace(/^@/, '').trim() || 'contact');
  return `[@${label}](devledger-contact:${id})`;
}

export function parseContactMentionMarkdownLink(href: string, text: string): ContactMentionReference | null {
  const prefix = ['devledger-contact:', 'northstar-contact:'].find((candidate) => href.startsWith(candidate));
  if (!prefix) return null;
  try {
    const id = decodeURIComponent(href.slice(prefix.length));
    const label = text.replace(/^@/, '').trim();
    if (!id || id.length > 128 || /[\u0000-\u001f\u007f]/.test(id)) return null;
    return { id, label: label.slice(0, 120) || id };
  } catch {
    return null;
  }
}
