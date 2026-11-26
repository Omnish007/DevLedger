import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { ConfirmProvider } from '@/components/shared/ConfirmProvider';
import { RendererErrorBoundary } from '@/components/shared/RendererErrorBoundary';
import { TooltipProvider } from '@/components/ui/tooltip';
import '@/styles/globals.css';

createRoot(document.getElementById('root')!).render(
    <RendererErrorBoundary>
        <TooltipProvider>
            <ConfirmProvider>
                <App />
            </ConfirmProvider>
        </TooltipProvider>
    </RendererErrorBoundary>,
);
