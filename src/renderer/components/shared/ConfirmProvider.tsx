import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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

export interface ConfirmOptions {
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
}

type ConfirmRequest = ConfirmOptions & { id: number };
type ConfirmFunction = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFunction | null>(null);

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
                            <AlertDialogTitle>{request.title}</AlertDialogTitle>
                            <AlertDialogDescription>{request.description}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>{request.cancelLabel ?? 'Cancel'}</AlertDialogCancel>
                            <AlertDialogAction
                                className={
                                    request.destructive
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

export function useConfirm(): ConfirmFunction {
    const confirm = useContext(ConfirmContext);
    if (!confirm) throw new Error('useConfirm must be used inside ConfirmProvider.');
    return confirm;
}
