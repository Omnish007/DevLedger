import { basename } from 'node:path';

/** Deterministic, per-profile test labels. No global application data is used. */
export class TestDataFactory {
  private sequence = 0;
  private readonly prefix: string;

  constructor(profileDirectory: string) {
    this.prefix = basename(profileDirectory).replace(/[^a-zA-Z0-9]/g, '').slice(-12) || 'isolated';
  }

  label(kind: string, description: string): string {
    this.sequence += 1;
    return `E2E-${this.prefix}-${kind}-${this.sequence}-${description}`;
  }

  project(description = 'Project'): string { return this.label('project', description); }
  task(description = 'Task'): string { return this.label('task', description); }
  note(description = 'Note'): string { return this.label('note', description); }
  contact(description = 'Contact'): string { return this.label('contact', description); }
  tag(description = 'Tag'): string { return this.label('tag', description); }
}
