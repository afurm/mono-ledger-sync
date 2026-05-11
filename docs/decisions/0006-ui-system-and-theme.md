# 0006 UI system and theme

Date: 2026-05-11

Status: Accepted

## Context

The local web UI is the primary product surface. It needs to feel like a focused personal finance workspace: fast to scan, useful with dense financial data, and clearly local-first. The reference direction uses a white workspace, dark ink text, restrained slate borders, Monobank-green primary actions, soft green selected states, and compact tables/cards.

## Decision

Use Vite for the local web app and shadcn/ui as the app component library.

The UI should be built by composing shadcn primitives and installed shadcn registry components before creating local components. Local components should stay as thin feature wrappers around data loading, domain behavior, and shadcn composition.

Use the following theme direction through semantic shadcn/Tailwind tokens, not one-off raw color classes in feature code:

- `background`: clean white app canvas, approximately `#ffffff`.
- `foreground`: dark navy ink for primary text, approximately `#111722`.
- `muted-foreground`: slate secondary text, approximately `#5c626b`.
- `border`: light cool slate dividers, approximately `#dfe4ec`.
- `primary`: Monobank green for primary actions and active states, approximately `#05962f`.
- `primary-foreground`: white text on green actions, `#ffffff`.
- `accent`: soft green selected navigation and panels, approximately `#eef8f1`.
- `success`: green badges and positive values, aligned with `primary`.
- `destructive`: clear red for failed syncs and expenses, approximately `#ef4444`.
- `warning`: amber/orange for partial syncs and pending work, approximately `#f59e0b`.
- `info`: blue for informational category badges and neutral highlights, approximately `#3b82f6`.

The app shell should use:

- Persistent sidebar navigation for Overview, Transactions, Rules & Mappings, Sync & Webhooks, Accounts, Exports, Logs, Settings, and Help.
- Top bar with the current primary action, theme toggle, profile/avatar, and local status.
- shadcn `Sidebar`, `Button`, `Card`, `Table`, `Tabs`, `Badge`, `Input`, `Select`, `Switch`, `Checkbox`, `DropdownMenu`, `Dialog`, `Drawer`, `Tooltip`, `Pagination`, `Avatar`, `Skeleton`, `sonner`, and chart composition where applicable.
- Compact finance-first layout with dense tables, clear filters, status badges, realistic local data labels, and masked sensitive values.

Do not introduce a second component system or bespoke visual primitives for standard UI elements. Avoid dashboard-template decoration, oversized marketing composition, decorative gradients, and custom controls when shadcn components cover the need.

## Consequences

Vite keeps the local app lightweight and fast to develop. shadcn keeps component source in the repository, which fits the need for a controlled local product while still providing accessible primitives and a consistent design system. Theme changes should happen through semantic tokens and component variants so the screenshots can be reproduced consistently across routes without scattering raw color values through feature code.
