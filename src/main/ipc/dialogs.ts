import {
    BrowserWindow,
    dialog,
    type IpcMainInvokeEvent,
    type OpenDialogOptions,
    type OpenDialogReturnValue,
    type SaveDialogOptions,
    type SaveDialogReturnValue,
} from 'electron';

/** Open a modal file/directory picker attached to the invoking BrowserWindow when available. */
export async function showOpenDialogForEvent(
    event: IpcMainInvokeEvent,
    options: OpenDialogOptions,
): Promise<OpenDialogReturnValue> {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    return owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options);
}

/** Open a modal save picker attached to the invoking BrowserWindow when available. */
export async function showSaveDialogForEvent(
    event: IpcMainInvokeEvent,
    options: SaveDialogOptions,
): Promise<SaveDialogReturnValue> {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    return owner ? dialog.showSaveDialog(owner, options) : dialog.showSaveDialog(options);
}
