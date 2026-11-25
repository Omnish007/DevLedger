import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  description?: string | undefined;
  eyebrow?: string | undefined;
  actions?: ReactNode | undefined;
};

export function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps) {
  return (
    <header className="workspace-page-header">
      <div className="min-w-0 flex-1 space-y-0.5">
        {eyebrow && <p className="workspace-page-eyebrow">{eyebrow}</p>}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1 className="workspace-page-title">{title}</h1>
          {description && <p className="workspace-page-description">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
