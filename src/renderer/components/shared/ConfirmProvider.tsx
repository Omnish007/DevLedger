import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ShieldAlert, Trash2 } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ConfirmContext, type ConfirmFunction, type ConfirmOptions } from './confirm-context';

type ConfirmRequest = ConfirmOptions & { id: number };

export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [request, setRequest] = useState<ConfirmRequest | null>(null);
    const nextId = useRef(0);
    const settleRef = useRef<((value: boolean) => void) | null>(null);

    const settle = useCallback((confirmed: boolean) => {
        const resolve = settleRef.current;
        settleRef.current = null;
        setRequest(null);
        resolve?.(confirmed);
    }, []);

    const confirm = useCallback<ConfirmFunction>(
        (options) =>
            new Promise((resolve) => {
                // Only one modal confirmation may be active. Resolve a superseded request safely.
                settleRef.current?.(false);
                settleRef.current = resolve;
                setRequest({ ...options, id: ++nextId.current });
            }),
        [],
    );

    useEffect(() => () => settleRef.current?.(false), []);

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <AlertDialog
                open={Boolean(request)}
                onOpenChange={(open) => {
                    if (!open) settle(false);
                }}
            >
                {request && (
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <div className="flex items-start gap-3.5">
                                <div
                                    className={`grid size-10 shrink-0 place-items-center rounded-xl ring-1 ${
                                        request.destructive || request.tone === 'danger'
                                            ? 'bg-danger-subtle text-danger-foreground ring-danger/25'
                                            : request.tone === 'warning'
                                              ? 'bg-warning-subtle text-warning-foreground ring-warning/25'
                                              : 'bg-primary/10 text-primary ring-primary/20'
                                    }`}
                                >
                                    {request.destructive || request.tone === 'danger' ? (
                                        <Trash2 className="size-4.5" aria-hidden="true" />
                                    ) : request.tone === 'warning' ? (
                                        <AlertTriangle className="size-4.5" aria-hidden="true" />
                                    ) : (
                                        <ShieldAlert className="size-4.5" aria-hidden="true" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
                                    <AlertDialogTitle>{request.title}</AlertDialogTitle>
                                    <AlertDialogDescription>{request.description}</AlertDialogDescription>
                                </div>
                            </div>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>{request.cancelLabel ?? 'Cancel'}</AlertDialogCancel>
                            <AlertDialogAction
                                className={
                                    request.destructive || request.tone === 'danger'
                                        ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                                        : undefined
                                }
                                onClick={(event) => {
                                    event.preventDefault();
                                    settle(true);
                                }}
                            >
                                {request.confirmLabel ?? 'Continue'}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                )}
            </AlertDialog>
        </ConfirmContext.Provider>
    );
}
