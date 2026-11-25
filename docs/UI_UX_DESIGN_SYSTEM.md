# DevLedger UI/UX design system

**Revision:** 25 November 2026  
**Applies to:** Electron application shell, all primary renderer routes, Quick Capture, shared feature compositions and shadcn/Radix primitives.

## Product design intent

DevLedger is a local-first developer workspace used for sustained desktop work. The interface should help users move between project context, technical knowledge, execution, people, files and operational records without losing orientation. The design is desktop-first and responsive, information-dense without being cramped, and consistent without forcing every route into the same layout.

The system takes transferable principles from the public design guidance of Apple, Google, Netflix, Uber and Spotify. It does not copy their brand styling or import patterns that do not suit this product. The research record and source links are in `DEVLEDGER_DEEP_DESIGN_RESEARCH.md`.

## Visual foundations

### Color

The semantic source of truth is in `design-system/tokens/semantic/light.json` and `dark.json`. Do not hand-edit `src/renderer/styles/generated-tokens.css`; regenerate it with `npm run tokens:build`.

The current palette is a cool neutral foundation with a restrained blue-indigo primary. Semantic status roles remain separate:

- `background` / `foreground`: global workspace surface and default text.
- `card` / `card-foreground`: meaningful work areas and their text.
- `surface`, `surface-subtle`, `surface-hover`: nested surfaces and interaction feedback.
- `primary`, `secondary`, `accent`, `muted`: action and hierarchy roles.
- `success`, `warning`, `danger`, `info`: status semantics; never use color as the only status cue.
- `border`, `input`, `ring`: boundaries, input edges and keyboard focus.
- `sidebar-*`: app navigation surfaces and states.

Light and dark themes implement the same semantic contract. Contrast should be measured in the running app before release; source tokens alone are not a contrast-conformance result.

### Typography

- UI font stack: Inter where available, then system UI fallbacks.
- Code and technical identifiers: `--font-code` monospace stack.
- Page title: clamp-based large title, with a clear weight and tight tracking.
- Section title: consistent semibold role.
- Body/help text: 14 px desktop renderer baseline. Dense utility metadata is raised to approximately 11.5–12.5 px; page and note body text retain a larger scale.
- Metadata: secondary to content; use only where it supports a real decision or workflow.

Do not use low-contrast tiny labels to create visual density. Avoid placeholder copy when an empty field can simply remain empty.

### Spacing, sizing and surfaces

- Prefer the existing 4 px-compatible Tailwind spacing scale.
- Use `--workspace-gutter` for responsive page gutters.
- Use `--workspace-radius` for meaningful work surfaces.
- Use borders to communicate boundaries and grouping, not as decoration around every element.
- Use `--workspace-shadow` only to separate important surfaces subtly.
- Tables and dense record lists may be compact, but titles and primary actions must remain readable.
- Width and minimum-size rules must follow content needs; avoid arbitrary fixed widths that break when the application window changes.

### Focus, motion and scrolling

- Keep the global `:focus-visible` ring and keyboard access to all actions.
- Respect `prefers-reduced-motion` for nonessential transitions.
- Keep scroll regions deliberate. Use a single primary scroll area per workspace where practical; isolate scroll only where a list/editor split or large dataset needs it.
- Avoid clipping content. For wide tabular data, scroll the table surface horizontally rather than hiding columns.

## Application shell

The shell has a shallow, collapsible primary sidebar, separate workspace and utility groups, a predictable top action bar, and a main content region. Global actions remain grouped and discoverable: command palette/search, Quick Capture, refresh and Settings. The existing Ctrl/Cmd+K command palette, navigation, Quick Capture shortcut, persisted sidebar preference and page navigation behavior are retained.

Page titles belong to the page heading, not duplicated in the app chrome. The shell does not repeat a local-storage footer label; local-first behavior is explained where it affects actual settings, file handling and recovery decisions.

## Page compositions

The foundation is shared; the workspaces are intentionally different.

| Route | Composition | Design reason |
|---|---|---|
| Overview | Date-led introduction, four real summary metrics, upcoming work and active projects in a two-column work view, then a notes entry point and factual secondary summary | Answer “what is relevant now?” without invented charts, activity or recommendations. |
| Projects | Filter/archive toolbar and a readable directory table with project name/context, type, open-task count, notes count, update date and row actions | Compare projects quickly; preserve project create/edit/import/export/archive/restore actions. |
| Notes | Resizable note list and editor. A 260 px desktop list minimum and 420 px editor minimum; below 1040 px the split becomes vertical with 180 px / 380 px minimums. Editor content has a readable max-width and one deliberate scroll region. | Editing and note selection are the core task; the editor must receive usable space. |
| Tasks | Dedicated task composer, active/interrupted timer context, task filters and a virtualized hierarchical queue. At constrained widths, status/priority/due context moves into the task row rather than disappearing. | Prioritize execution and retain the existing parent/child task hierarchy, timer recovery, editing and completion actions. |
| Documents | File-browser style rows with type/title, project, size, extraction status and added date; horizontal scroll preserves wide data; import/vault controls stay with the directory. | Make document identity and processing status scannable without fake thumbnails. |
| Contacts | Two-column directory on normal desktop widths; single column at narrow widths; identity, role, company, contact methods, project associations and custom attributes remain directly readable. | Treat contacts as work records and relationships, not decorative profiles. |
| Operations | Sticky, horizontally scrollable tab switcher for Inbox, Tags, Links, Dependencies, Blockers, Reminders, Time, Activity and Background Jobs. Each tab retains its existing actions and record density. | This is a utility/operations console; predictable tabs and clear action feedback matter more than cards. |
| Search | Primary query field, project scope, visible query syntax, separately grouped optional semantic search and AI summary controls, typed results and pagination. | Put finding the correct record first; make optional/local AI behavior and its privacy boundary explicit. |
| Settings | Two-column grouping for appearance, shortcuts, local data, optional local AI and security; encrypted backup/recovery spans the full reading width. Single column at constrained widths. | Settings are reference/control tasks; group by mental model and isolate high-risk recovery actions. |
| Quick Capture | Separate compact focused capture window with title, optional project, content and save feedback. | Capture should be fast and distraction-free; do not turn it into a mini dashboard. |

## Component rules

The existing 49-file shadcn/Radix component inventory remains the implementation base. Prefer those existing components and the shared compositions in `src/renderer/components/shared`; do not add a parallel component library.

- Buttons: one clear primary action per local task area; all icon-only controls require accessible names. The command-palette trigger is labelled “Command menu” because it opens navigation/actions rather than running record search.
- Inputs: visible labels when practical, validation adjacent to the field and error state announced to assistive technology.
- Tables/lists: real content first, row actions grouped consistently, loading/empty/error states explicit.
- Badges: semantic status only; do not use decorative badges to fill space.
- Dialogs/menus/popovers: keep the existing focus, keyboard and confirmation behavior; destructive actions remain explicit.
- Loading/empty/error: explain what is happening and the next useful action; do not fabricate data to fill the screen.

## Responsive review matrix

These are required review sizes, not a claim that rendered screenshots were verified in this environment:

- 1600 × 1000 — wide desktop.
- 1440 × 900 — standard desktop.
- 1280 × 800 — laptop workspace.
- 1024 × 768 — compact layout transition.
- 800 × 700 — narrow supported window, where applicable.

Check long project/note/document/contact names, empty and populated states, keyboard-only operation, tab and dialog focus, resizing, theme changes and reduced motion.

## Governance

1. Change semantic tokens in the JSON token sources; regenerate CSS.
2. Keep component styles aligned with semantic roles rather than one-off colors.
3. Reuse patterns only when they improve consistency; retain distinct route composition when workflow differs.
4. Do not change domain behavior, persistence, IPC contracts or data structures for a visual task.
5. Verify the rendered application at supported window sizes before release; successful syntax checks or builds alone do not sign off visual quality.
