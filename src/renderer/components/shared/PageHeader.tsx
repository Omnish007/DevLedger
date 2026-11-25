import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps) {
  return (
    <header className="workspace-page-header">
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="workspace-page-eyebrow">{eyebrow}</p>}
        <h1 className="workspace-page-title">{title}</h1>
        {description && <p className="workspace-page-description">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
