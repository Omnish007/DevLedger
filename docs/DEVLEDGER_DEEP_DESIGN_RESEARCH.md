# DevLedger — Deep UI/UX Design Research & Product-Specific Design Strategy

**Research date:** 25 November 2026  
**Product:** DevLedger — local-first developer project management and knowledge desktop application  
**Purpose:** Establish evidence-based design decisions before a full renderer redesign. This document is a design-reasoning artifact, not a claim that implementation or visual verification is complete.

---

## 1. Research scope, evidence and limitations

The research follows the requested public design guidance from Apple, Google, Netflix, Uber and Spotify, then cross-checks the resulting decisions against W3C WCAG 2.2 and Nielsen Norman Group's usability heuristics.

The sources are public official documentation, design-system material and engineering/product articles. They do **not** reveal confidential internal design reviews, proprietary experiments, or private company workflows. No such processes are inferred here.

The DevLedger repository provides evidence about available pages, components and existing workflows. No user interviews, production analytics, support-ticket corpus, or moderated usability-study recordings were supplied. Therefore, this is repository-informed product design research and a heuristic strategy—not a claim of completed user research with DevLedger customers.

The goal is not to make DevLedger look like five unrelated products. It is to derive a consistent desktop productivity experience suited to DevLedger's real information architecture, workflows and Electron/macOS/Windows/Linux environment.

## 2. Company-by-company findings and transfer to DevLedger

### 2.1 Apple — Human Interface Guidelines and macOS productivity patterns

**What the public guidance says**

- Apple's macOS guidance describes desktop use as extended, in-depth work with large displays, keyboard and pointer input, multiple apps and frequent context switching.
- It recommends using available display area for more content with comfortable information density, supporting window resizing and full-screen work, making commands available through familiar menus, and using keyboard shortcuts to accelerate expert workflows.
- Apple's layout guidance places important information early in reading order, uses alignment and grouping to communicate relationships, and recommends progressive disclosure to prevent too many controls and choices competing at once.
- Sidebar guidance recommends keeping hierarchy understandable, generally limiting the sidebar to two levels, and allowing it to be hidden when the user needs more room.
- Toolbar guidance separates location/navigation, common actions and overflow; it warns against overcrowding and encourages consistent grouping.

**Why it matters to DevLedger**

DevLedger is a desktop workbench, not a mobile-first feed. Users may spend long sessions switching among projects, notes, tasks, documents and operational records. The application should optimize for sustained focus, keyboard navigation, resizable workspaces and fast scanning—not oversized mobile-style cards or excessive nested navigation.

**Design decisions**

1. Use a stable application shell with primary navigation clearly separated from page content.
2. Keep navigation hierarchy shallow; use a content list/detail split where a third level would otherwise be forced into the sidebar.
3. Keep global and page-specific commands in predictable, compact toolbar groups; move infrequent commands to existing overflow/menu affordances.
4. Support hiding/collapsing navigation and secondary panes when the window becomes constrained, without losing the current selection or context.
5. Provide page-specific keyboard affordances while preserving existing shortcuts; do not invent new shortcut behavior during a visual-only redesign.
6. Design wide windows for useful density, and smaller windows for graceful collapse/reflow rather than uniformly shrinking all controls.

**What not to copy**

Do not imitate Apple's macOS appearance literally, use platform-exclusive visual materials that conflict with Electron cross-platform behavior, or add a macOS-only interaction that breaks Windows/Linux parity.

### 2.2 Google — Material Design 3 foundations and components

**What the public guidance says**

- Material describes a design system as reusable design decisions and guidance expressed through foundations, components and patterns.
- Its foundations cover accessibility, content design, design tokens, interaction states, layout and customization.
- Google's published guidance emphasizes semantic color roles, typography scales, spacing/layout structure, component state feedback, contrast and adaptive layouts.
- Material components are grouped by purpose (for example, navigation, containment, action, selection and text input), which encourages a system rather than individually styled controls.

**Why it matters to DevLedger**

The current renderer already uses Tailwind CSS v4, semantic CSS variables and shadcn/Radix-style controls. Replacing that foundation with another component library would add risk without solving the product's information architecture. Material's strongest contribution is systematic design: define roles once, apply them consistently, and let components inherit correct behavior and state styling.

**Design decisions**

1. Maintain semantic tokens for background, surface, elevated surface, primary text, secondary text, borders, focus, success, warning and destructive states.
2. Define typography by semantic role (page title, section title, body, supporting text, compact metadata) rather than arbitrary per-page pixel values.
3. Define spacing, control heights, radii, borders and elevations centrally; avoid scattered magic values.
4. Standardize default, hover, focus, active, selected, disabled, loading, success and error states for common controls.
5. Establish window-size classes/breakpoints for full, compact and narrow workspaces; choose layouts by content needs rather than only viewport width.
6. Reuse the existing UI primitives when their behavior is sound; improve wrappers, composition and tokens instead of adding a competing design system.

**What not to copy**

Do not apply Material's default rounded-card aesthetic everywhere. Do not force mobile navigation patterns onto a desktop workbench, and do not use color roles decoratively without semantic meaning.

### 2.3 Netflix — Discovery hierarchy, relevance and measured iteration

**What the public material says**

- Netflix's public product description identifies discovery, personalization and cross-device consistency as core product-design concerns.
- Netflix TechBlog's 2026 GenPage article describes the homepage as a structured two-dimensional experience: recommendation rows and the entities within them are selected and arranged together rather than treating the page as one flat ranked list.
- Netflix's public engineering accounts describe evaluation through online experiments/A-B tests and measurable product outcomes. This is evidence of publicly described practices for those systems, not evidence of a universal confidential process.

**Why it matters to DevLedger**

DevLedger also contains multiple kinds of records and destinations. A user should not have to understand internal tables or remember where information lives. The home/overview experience should reveal useful, real context and present meaningful groups of work. Search and discovery should help the user move from intent to the correct project, note, task or document.

**Design decisions**

1. Organize Overview by real work context (for example, the user's actual active/recent records and existing summaries), not by arbitrary decorative metric tiles.
2. Make grouped content scannable and distinguishable; one undifferentiated stream is not sufficient for heterogeneous developer records.
3. Order content by current relevance only when that ordering is supported by existing data and current product behavior.
4. Ensure every discovery surface has clear labels, useful preview information and a predictable destination.
5. Do not invent recommendations, activity, statistics, personalization or “AI insights” merely to make the page appear dynamic.
6. Evaluate competing page structures with repeatable tasks and observable usability checks; if real user telemetry becomes available, use it to validate whether navigation/search success improves.

**What not to copy**

Do not import entertainment-style carousels, autoplay, artwork-heavy shelves, ranking systems, or algorithmic personalization into a developer productivity app. The transferable lesson is contextual relevance and structured discovery—not Netflix's visual language or recommendation machinery.

### 2.4 Uber — Base as a unified, extensible design system

**What the public Base material says**

- Uber describes Base as a unified framework across its product ecosystem.
- The public system is organized around foundations/principles, design language, components, patterns and extensions, with usage, interaction and accessibility guidance.
- The public System Principles page describes human-centered guidelines; the page also indicates that its detailed design-principles content is still forthcoming. This research does not claim knowledge beyond what Uber publicly documents.

**Why it matters to DevLedger**

DevLedger has distinct work areas, but users should experience one product. Shared conventions reduce relearning and make future maintenance safer. At the same time, a Notes editor and an Operations table have genuinely different jobs and should not be forced into one identical page template.

**Design decisions**

1. Establish shared foundations (tokens, typography, spacing, focus, icon sizing and motion) before changing individual pages.
2. Define standard components and interaction patterns for tables, record lists, filters, dialogs, forms, toolbars and empty/error states.
3. Document component intent and appropriate use, not just class names.
4. Permit feature-specific composition on top of shared foundations; consistency means coherent behavior and visual language, not identical layouts.
5. Give accessibility and error behavior first-class component requirements, not a final polish step.

**What not to copy**

Do not create a large abstraction layer for its own sake or re-architect DevLedger's product/domain layers to imitate an enterprise design-system organization.

### 2.5 Spotify — Encore, shared foundations and local systems

**What the public material says**

- Spotify Engineering describes Encore's “local system” approach: shared foundations support distinct product areas (such as Creator, Ads and Consumer), while those product areas can tailor their local experience to their users.
- Spotify also describes centralizing shared masthead components and context to prevent duplicated implementations and experience drift across applications.

**Why it matters to DevLedger**

There is a balance between shared consistency and page-specific needs. A single global page template would make Notes, Documents and Operations feel artificially identical. Fully independent pages, on the other hand, create visual drift and inconsistent interactions.

**Design decisions**

1. Share the shell, page-header rules, tokens, menus, buttons, form fields, dialogs, status indicators and common list/table primitives.
2. Give each feature an appropriate composition: Notes gets an editor-first split workspace; Projects gets a project discovery/list/detail model; Tasks gets a task-management hierarchy; Documents gets a file-oriented browse/preview model; Operations gets a dense operational table/history model.
3. Keep shared components in one source of truth so a correction to button, focus, menu or dialog behavior propagates consistently.
4. Allow local feature patterns only when they solve a real workflow need and are documented in the same design language.

**What not to copy**

Do not duplicate page-specific versions of the same button, status pill or menu. Do not flatten all local patterns into generic cards just to claim consistency.

## 3. Cross-cutting usability and accessibility requirements

### 3.1 Nielsen Norman Group usability heuristics

The ten heuristics are used as an inspection checklist:

1. Visibility of system status — clearly show saving, loading, completion and failure.
2. Match between system and real world — use developer/product vocabulary users understand, not internal implementation labels.
3. User control and freedom — preserve cancellation, back navigation and safe exits from dialogs or flows.
4. Consistency and standards — keep common actions and controls consistent across pages.
5. Error prevention — validate before destructive or invalid operations and make consequences clear.
6. Recognition rather than recall — expose the context and available actions users need instead of forcing memory.
7. Flexibility and efficiency — preserve existing shortcuts and support experienced users without confusing first-time users.
8. Aesthetic and minimalist design — remove information that does not help the current task.
9. Error recognition and recovery — errors should state what failed and how the user can recover.
10. Help and documentation — explain genuinely non-obvious workflows in context.

### 3.2 WCAG 2.2

The renderer should be evaluated against the relevant WCAG 2.2 criteria, including:

- Keyboard access to all functionality; no keyboard traps.
- Visible, understandable keyboard focus and focus that is not hidden behind author-created overlays.
- Text and non-text contrast for the applicable controls and states.
- Reflow/adaptation at supported window widths without loss of content or functionality.
- Adequate target sizes and spacing for pointer/touch use where applicable.
- Programmatic names, roles and states for controls, dialogs, menus, tabs and status feedback.
- Reduced-motion consideration for nonessential transitions.

Passing automated accessibility checks alone is not proof of conformance; keyboard and assistive-technology checks remain necessary.

## 4. DevLedger-specific design strategy by page

This section translates research into page-level design intent while explicitly preserving existing features and workflows.

| Area | Primary user question | Design direction | Avoid |
|---|---|---|---|
| Application shell | Where am I, and how do I move to another work area? | Stable, shallow primary navigation; predictable title/toolbar; collapsible navigation; global actions grouped consistently. | Duplicate titles, deep navigation trees, oversized brand chrome, decorative counters. |
| Overview | What work is relevant to me now? | A useful work-oriented overview based only on existing, real records; clear hierarchy between key work areas and recent/active context. | Fake KPIs, invented activity, decorative charts, generic marketing hero content. |
| Projects | Which project should I open, and what is its current context? | Scannable project list/table with meaningful status/context; clear project selection and detail workspace using existing fields/actions. | Dense unexplained metadata, truncated identifiers as primary labels, cards for every row. |
| Notes | Which note am I working on, and can I focus on editing it? | Notes navigation/list plus generous editor canvas; reliable resizing; predictable search/category context; clear save state; keyboard-friendly editor. | Compressed panes, accidental nested scrollbars, competing toolbars, arbitrary panel percentages. |
| Tasks | What needs doing, and what is its state? | Task-first hierarchy with clear completion/status/priority and due context where already supported; preserve existing grouping and editing behavior. | Status represented by color alone, too many equal-emphasis actions, noisy metadata. |
| Documents | Which document do I need, and how can I inspect it? | File-oriented browse/list/detail or preview structure; meaningful type/date/context; robust table/list scrolling. | Unhelpful file IDs, icons without labels, clipped columns, fake thumbnails. |
| Contacts | Who is this record, and how is it related to my work? | Readable identity/contact details and existing related-record context; consistent forms and validation. | Decorative profile blocks, duplicated fields, unexplained relationship labels. |
| Operations | What is happening, what needs attention, and what can I safely do? | Information-dense but legible operational layout, real status/history, clear filtering and action consequences. | Fake health metrics, color-only state, unexplained technical abbreviations, excessive cards. |
| Search | How do I find the correct item across the workspace? | Clear query/result hierarchy, recognizable result types, concise context snippets, consistent selection/open behavior and existing filters. | A flat ambiguous result list, artificial relevance claims, filters unrelated to current capability. |
| Settings | Where is a particular preference or maintenance control? | Group related settings by user mental model; concise descriptions; consistent input alignment; dangerous actions separated and confirmed. | One long undifferentiated form, decorative category labels, ambiguous destructive buttons. |

## 5. Proposed shared design system

The complete redesign should define and document these foundations before page-specific styling:

### Visual foundations

- Semantic light and dark color roles with tested text/control contrast.
- Typography ramp for page titles, section headings, body, supporting text, labels and compact metadata.
- A single spacing scale and predictable content gutters.
- Density levels appropriate for desktop work (comfortable/default/compact only where justified).
- Layout widths and minimum dimensions by content type, not arbitrary fixed page widths.
- Consistent control heights, corner radii, border weights, dividers, elevation and icon sizes.
- Focus rings, selection states, status semantics and non-color cues.
- Motion tokens with purposeful, brief transitions and reduced-motion fallback.

### Component foundations

- Buttons, icon buttons and button groups.
- Inputs, text areas, search, comboboxes, selects and date fields.
- Tables, record lists, tree/list hierarchies and pagination.
- Tabs, breadcrumbs, sidebars and toolbars.
- Badges/status indicators, progress, skeletons and loading states.
- Popovers, tooltips, menus, context menus, dialogs, drawers and confirmation flows.
- Empty, no-results, error, offline/local-data and success states where applicable to existing product behavior.

Each component specification must include purpose, anatomy, variants, size/density, states, keyboard behavior, accessibility requirements and examples of appropriate use.

## 6. Visual and functional evaluation plan

The redesigned application should not be signed off from source review or a successful build alone.

### Viewport/window matrix

Inspect at least these Electron window sizes, adjusting to the app's supported minimum if different:

- 1600 × 1000 — spacious desktop workspace.
- 1440 × 900 — common desktop.
- 1280 × 800 — constrained laptop workspace.
- 1024 × 768 — compact window/layout transition.
- 800 × 700 — narrow supported window, where applicable.

At every size, inspect clipping, horizontal overflow, pane collapse, toolbar wrapping, readable table behavior, dialogs and focus visibility.

### Page task matrix

For each route: open page; identify primary action; inspect loading/empty/error states; use its primary action; edit/create/delete where the existing feature supports it; use search/filter/selection where supported; test dialogs and menus; verify navigation away and back; confirm persistence where applicable.

### Interaction matrix

- Keyboard-only traversal and shortcuts.
- Tab order and focus visibility.
- Dialog focus entry, containment and return.
- Menus/popovers opened and dismissed by keyboard.
- Pointer hover/active/disabled states.
- Resizing Notes and other resizable panes.
- Long names, large datasets, empty datasets and long text.
- Light and dark themes.
- Reduced-motion setting.

### Verification gates

1. TypeScript checks and lint pass without suppressions or `any` shortcuts.
2. Production build and packaging succeed within the available environment.
3. Existing unit, integration and performance tests pass.
4. E2E tests cover each major route and its critical actions.
5. Runtime console is inspected for exceptions and relevant warnings.
6. Screenshots are captured at the window matrix sizes and manually reviewed.
7. No database schema, domain behavior, persistence, IPC contract or existing workflow changes are introduced by the UI redesign unless a genuine bug is separately documented and tested.

No score (including the prompt's 90/100 target) should be self-awarded without evidence from this evaluation.

## 7. Research conclusion

The strongest combined direction for DevLedger is:

- **Apple:** desktop-first focus, resizable workspaces, shallow navigation and keyboard efficiency.
- **Google:** semantic tokens, accessible component states and adaptive layout foundations.
- **Netflix:** relevant, structured discovery and evidence-led iteration, without importing entertainment UI or fabricating recommendations.
- **Uber:** one coherent, documented design system across the whole product.
- **Spotify:** shared foundations with deliberately different feature-specific compositions.
- **NN/g + WCAG:** usability, recoverability, keyboard operation, contrast and visible feedback as acceptance requirements.

This strategy demands a true page-by-page redesign, not a global CSS pass. Shared foundations should be consistent, but every major route must be reconsidered around its actual user task and existing workflow. The prior first-iteration source changes do not, by themselves, meet that standard.

---

## 8. Authoritative public references

### Apple
- [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [Designing for macOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-macos)
- [Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
- [Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)
- [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)

### Google
- [Material Design 3 foundations](https://m3.material.io/foundations)
- [Material Design 3 components](https://m3.material.io/components)
- [Google Android Developers — Material Components overview](https://developer.android.com/design/ui/mobile/guides/components/material-overview)
- [Material 3 accessible theming codelab](https://developer.android.com/codelabs/m3-design-theming)
- [Material 3 in Compose — accessibility and large screens](https://developer.android.com/develop/ui/compose/designsystems/material3)

### Netflix
- [Netflix Product organization and Experience Design](https://jobs.netflix.com/careers/product)
- [Netflix TechBlog — GenPage: Towards End-to-End Generative Homepage Construction](https://netflixtechblog.com/genpage-towards-end-to-end-generative-homepage-construction-at-netflix-77146fba8a08)
- [Netflix TechBlog — MAPS: Multimodal Asset Personalization at Scale](https://netflixtechblog.com/maps-netflixs-multimodal-asset-personalization-at-scale-32f96320785e)
- [Netflix TechBlog — Engineering AI Discover](https://netflixtechblog.com/engineering-ai-discover-e244944cdc38)

### Uber
- [Base Design System](https://base.uber.com/)
- [Base System Principles](https://base.uber.com/6d2425e9f/n/00369d)

### Spotify
- [Spotify Engineering — Applying the Facade Pattern on Spotify for Artists](https://engineering.atspotify.com/2024/02/applying-the-facade-pattern-on-spotify-for-artists)
- [Spotify Encore design system](https://spotify.design/article/can-i-get-an-encore-spotifys-design-system-three-years-on)

### Accessibility and usability
- [W3C Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG/)
- [Nielsen Norman Group — 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
