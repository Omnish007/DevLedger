# shadcn/ui component source and update policy

DevLedger uses the **New York** visual style, the **Radix** primitive base, Tailwind CSS v4, CSS variables and Lucide icons. Component source lives in `src/renderer/components/ui` and is committed as project-owned code. Product-specific variants follow the restrained premium-neutral design tokens.

## Official references checked

- Official project/docs: <https://ui.shadcn.com/docs/official>
- Current project configuration schema: <https://ui.shadcn.com/docs/components-json>
- Current CLI docs: <https://ui.shadcn.com/docs/cli>
- Official New York v4 registry item example (Accordion): <https://ui.shadcn.com/r/styles/new-york-v4/accordion.json>
- Official Radix component documentation: <https://ui.shadcn.com/docs/components/radix/accordion>

The checked New York v4 registry source uses the unified `radix-ui` package, `data-slot` attributes and semantic CSS variables. DevLedger follows those integration conventions. Its local source is customized; **the 49 files are not claimed to be byte-for-byte copies of every live registry file**. The actual shadcn CLI has not been run in this environment because npm registry DNS access is unavailable.

## Current CLI workflow

The project targets shadcn CLI `4.23.x`. `components.json` is the source of truth for style, Tailwind CSS file and aliases. Current initialization uses `--base radix`, `--yes` and `--cwd`; the obsolete `--style` flag is intentionally not used.

```bash
npm install
npm run shadcn:init
npm run shadcn:add:required
npm run shadcn:check
```

Review changes before overwriting any existing component. The CLI-generated files are project-owned source and must be customized/reviewed, not blindly regenerated on every setup.

## Intentional compositions

Two requested files are DevLedger compositions rather than independent primitives:

- `combobox.tsx` composes the Radix Popover and Command building blocks. This avoids introducing a Base UI combobox into a Radix-only app.
- `date-picker.tsx` composes the Radix Popover with the shared Calendar; the date parser and timezone semantics remain owned by DevLedger's domain layer.

Both appear in the 49-component inventory.

## Source inventory and validation

The required inventory is 49 component source files. Run:

```bash
npm run shadcn:check
npm run check:syntax
npm run check:source
```

These checks respectively verify component-file presence, TypeScript/TSX syntax and import resolution. They do not prove semantic type correctness, WCAG compliance, visual fidelity or successful runtime rendering. Use `npm run typecheck`, Storybook and packaged Electron tests when dependencies are installed.

## Customization rules

- Preserve upstream keyboard and accessibility behavior.
- Use semantic tokens; do not scatter arbitrary color values.
- Use `cn()` from `src/renderer/lib/utils.ts` for safe class merging.
- Keep Radix as the only primitive base.
- Keep product compositions in `components/shared` or feature folders.
- Review upstream changes before rerunning the CLI; never overwrite custom source without reviewing its diff.
- Prefer `AlertDialog` or the shared `useConfirm()` provider to browser `window.confirm()`.
- Use `data-slot` hooks consistently for inspectability and targeted styling.

## Known limitations

The local source inventory is complete at 49/49, and 19 Storybook stories exist. The CLI has not reconciled those files with the live registry in this environment. Storybook has not been built/launched, there is no screenshot-based visual regression pass, and no full accessibility audit has been run. npm registry access currently fails with `EAI_AGAIN`.

## Calendar and DayPicker v10

`calendar.tsx` uses the preferred `@daypicker/react` package and `getDefaultClassNames()` from DayPicker v10. Do not use removed compatibility class names such as `table`, `nav_button`, `day_selected` or `day_disabled`; use `month_grid`, `button_previous`, `button_next`, `selected` and `disabled` instead. The local component composes the current v10 class map with DevLedger Tailwind classes and semantic CSS variables, including the dropdown month/year layout and range-selection states.

References checked:

- <https://daypicker.dev/upgrading>
- <https://daypicker.dev/api/react>
- <https://daypicker.dev/api/react/enumerations/UI>
- <https://daypicker.dev/docs/styling>
- <https://ui.shadcn.com/docs/components/radix/calendar>

A syntax and source-contract test protects the local v10 class names. This does not replace a rendered calendar accessibility/visual review in Storybook and the packaged renderer.
