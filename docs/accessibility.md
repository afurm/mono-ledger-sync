# Accessibility baseline

The v1 browser UI targets keyboard and screen-reader operation across all 13
top-level routes.

## Implemented baseline

- A keyboard-visible skip link moves focus to the main workspace.
- Route changes update a polite live region with the new route title.
- Interactive icon-only controls have accessible names.
- Forms use labels or `aria-label`; token fields preserve password-manager
  profile context.
- Dialogs and drawers use titled Radix/shadcn primitives with trapped focus and
  Escape dismissal.
- Data tables use header cells; status is expressed in text as well as color.
- Semantic theme tokens preserve light/dark contrast and focus rings.
- Destructive actions require a labeled confirmation dialog and exact profile
  or database context.

`npm run smoke:web` checks every route for unnamed controls, unlabeled form
fields, duplicate IDs, missing image alternatives, runtime errors, overlays,
and route headings. Manual release testing still verifies logical Tab order,
visible focus, Escape behavior, zoom at 200%, and screen-reader announcements.

Accessibility regressions are product bugs. New controls must use the existing
shadcn primitives and pass the same route smoke checks.
