# DevLedger design system

DevLedger's design system is a desktop-first local productivity system: calm cool-neutral surfaces, a restrained blue-indigo primary, readable typographic hierarchy, semantic status colors, modest radius/elevation, visible keyboard focus and information-dense but deliberate workspaces.

The design is intentionally consistent at the foundation level and different at the workflow level. Overview, Projects, Notes, Tasks, Documents, Contacts, Operations, Search, Settings and Quick Capture do not share one generic page template. Each route has a composition suited to the task it supports.

## Source of truth

- Deep research and public references: `docs/DEVLEDGER_DEEP_DESIGN_RESEARCH.md`.
- Product-specific page and component rules: `docs/UI_UX_DESIGN_SYSTEM.md`.
- Audit, preservation boundary and verification: `docs/UI_UX_AUDIT_AND_REDESIGN.md`.
- Final status and remaining release gates: `docs/UI_UX_FINAL_REPORT.md`.
- Semantic token sources: `design-system/tokens/semantic/light.json` and `dark.json`.
- Generated output: `src/renderer/styles/generated-tokens.css`.

Run `npm run tokens:build` after editing semantic token sources. Do not edit generated CSS by hand.

## Foundations

- **Color:** shared semantic light/dark tokens; no page-specific arbitrary palette.
- **Typography:** Inter/system UI for interface copy; monospace for code and technical values.
- **Spacing:** existing 4 px-compatible Tailwind spacing scale.
- **Layout:** responsive page gutters, content-dependent min/max sizing, explicit overflow and resize behavior.
- **Surfaces:** background, card and subtle nested surfaces; borders and shadows are used to clarify work areas, not decorate every item.
- **Accessibility:** visible focus, keyboard paths, programmatic names/states, non-color status, reduced-motion support and reflow review.
- **Icons:** Lucide React.
- **Components:** source-owned shadcn New York + Radix primitives with DevLedger shared/feature compositions.

## Semantic token contract

The light and dark token files define the shared shadcn roles for backgrounds, text, cards, popovers, surfaces, primary/secondary/accent/muted actions, destructive states, borders, inputs, focus rings, sidebar and status colors. `muted` is a surface token; `muted-foreground` is text. Tests cover that distinction and generated Tailwind theme entries.

Always use semantic roles instead of hard-coded one-off colors. Status must never rely on color alone. The current tokens have not been independently measured for every WCAG contrast combination in a rendered runtime; that remains a release gate.

## Components and patterns

The full required inventory is specified by the `shadcn:add:required` script and validated by `npm run shadcn:check`; the current source inventory reports 49/49 files.

Use existing components for buttons, forms, labels, tables, menus, dialogs, tabs, pagination, empty states, loading and error feedback. Extend components only where shared consistency or accessibility benefits. Avoid a parallel component library or unnecessary abstractions.

Page-level composition classes and shared primitives live in `src/renderer/styles/globals.css`, `src/renderer/components/shared/PageHeader.tsx` and `src/renderer/components/shared/AppShell.tsx`. Feature-specific structures live with their route components.

## Verification and maintenance

After design changes, run at minimum:

```bash
npm run tokens:build
npm run check:all
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Then inspect Electron screenshots and keyboard interactions at the viewport matrix documented in `docs/UI_UX_DESIGN_SYSTEM.md`. Source checks/builds alone do not sign off rendered design quality.

The local component inventory check establishes file presence, not byte-for-byte upstream parity. Reconcile source-owned component implementations with the current official shadcn registry before release.
