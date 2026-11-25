import type { Editor } from '@tiptap/core';
import type { ChangeEvent } from 'react';
import { friendlyError } from '@/lib/utils';

export async function importMarkdownIntoEditor(
  event: ChangeEvent<HTMLInputElement>,
  editor: Editor | null,
  confirmReplace: () => Promise<boolean>,
  onLoaded: (html: string) => void,
  onError: (msg: string) => void,
): Promise<void> {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || !editor) return;
  if (editor.getText().trim() && !(await confirmReplace())) return;
  if (file.size > 2 * 1024 * 1024) { onError('Markdown files must be 2 MB or smaller.'); return; }
  try {
    editor.commands.setContent(await file.text(), { contentType: 'markdown', emitUpdate: false });
    onLoaded(editor.getHTML());
    onError('');
  } catch (caught) {
    onError(friendlyError(caught, 'Markdown import failed.'));
  }
}

export function exportMarkdownFromEditor(editor: Editor | null, title: string, onError: (msg: string) => void): void {
  if (!editor) return;
  try {
    const url = URL.createObjectURL(new Blob([editor.getMarkdown()], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || 'note').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 60) || 'note'}.md`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (caught) {
    onError(friendlyError(caught, 'Markdown export failed.'));
  }
}
