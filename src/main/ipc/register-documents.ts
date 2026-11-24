import { app, BrowserWindow, dialog, shell } from 'electron';
import { z } from 'zod';
import type { PageRequest } from '../../shared/contracts.ts';
import type { IpcHandlerContext, IpcRegistrar } from './contracts.ts';
import { idInput, pageRequest } from './schemas.ts';

export function registerDocumentHandlers(register: IpcRegistrar, context: IpcHandlerContext): void {
  const { documents } = context;
  register('documents:listPage', pageRequest, (input) => documents.listPage((input ?? {}) as PageRequest));
  register('documents:import', z.tuple([z.string().uuid().nullable(), z.boolean()]), async ([projectId, protectWithVault], event) => {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const options = { title: 'Import project document', properties: ['openFile'] as Array<'openFile'>, filters: [{ name: 'Supported documents', extensions: ['pdf', 'docx', 'xlsx', 'csv', 'txt', 'md'] }] };
    const selection = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (selection.canceled || selection.filePaths.length === 0) return null;
    return documents.importFromPath(selection.filePaths[0]!, projectId ?? null, protectWithVault);
  });
  register('documents:open', idInput, async (id) => {
    const opened = await documents.resolveDocumentForOpen(id, app.getPath('temp'));
    const openError = await shell.openPath(opened.path);
    if (openError) {
      if (opened.temporary) await documents.removeTemporaryFile(opened.path);
      throw new Error(`The document could not be opened: ${openError}`);
    }
  });
}
