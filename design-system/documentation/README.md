# DevLedger design system

DevLedger uses a restrained premium-neutral visual language: cool neutral surfaces, strong readable foregrounds, restrained semantic status colors, modest radii, compact typography and visible keyboard focus. Tailwind CSS v4 is the utility layer; shadcn/ui New York with the Radix base is the shared primitive direction.

## Foundations

- **Color:** DTCG-style semantic light/dark tokens in `tokens/semantic`, generated into `src/renderer/styles/generated-tokens.css`.
- **Spacing:** Tailwind's 4px-based spacing scale by default.
- **Typography:** UI sans for application UI; monospace for code and technical identifiers.
- **Interaction:** visible focus, hover and disabled states; labels and keyboard paths for controls.
- **Icons:** Lucide React.
- **Components:** source-owned shadcn files under `src/renderer/components/ui`, plus DevLedger compositions under `components/shared` and feature folders.

## Semantic token contract

The light and dark token files define the standard shadcn semantic surfaces and text colors: `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, and the `sidebar-*` family. In particular, `muted` is a quiet surface color; `muted-foreground` is the text color. This distinction is tested.

Run `npm run tokens:build` after token changes. Do not edit the generated CSS by hand. New component colors must use these semantic tokens rather than one-off hex values.

## Component inventory and governance

The official shadcn CLI is pinned to the current 4.23.x line and configured in `components.json` for New York, Radix, Tailwind v4 and DevLedger aliases. The full 49-component source inventory is specified in the `shadcn:add:required` script and checked by `npm run shadcn:check`. At the 23 November 2026 source snapshot, the local inventory check reports all 49/49 required component files present. This verifies file presence, not byte-for-byte upstream parity; continue to reconcile source-owned components with the official registry before production release.

`table.tsx` is sourced from the official New York v4 Table registry and adapted to use DevLedger's `cn()` alias and spacing choices. Existing wrappers for Button, Badge, Card, Dialog, Input, Separator, Tabs and Textarea predate the official-source refresh and must be reconciled with their current upstream versions before production release.

## Component development

Storybook 10.6 for React/Vite is configured in `.storybook`. Nineteen stories cover base components and selected workflow patterns. Run `npm run storybook` or `npm run build-storybook` after dependencies are installed. Storybook has not been executed in this environment. Visual regression and WCAG 2.2 AA checks remain release gates.

## Official references

- [shadcn Vite installation](https://ui.shadcn.com/docs/installation/vite)
- [shadcn CLI](https://ui.shadcn.com/docs/cli)
- [shadcn components.json](https://ui.shadcn.com/docs/components-json)
- [Storybook React + Vite](https://storybook.js.org/docs/get-started/frameworks/react-vite)
