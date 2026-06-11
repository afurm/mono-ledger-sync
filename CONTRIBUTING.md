# Contributing

Thanks for considering a contribution.

## Setup

```sh
npm install
npm run typecheck
npm test
```

## Expectations

- Keep changes small and reviewable.
- Prefer fixture-backed tests over live Monobank API calls.
- Do not commit real tokens, account identifiers, raw personal statements, or unredacted financial payloads.
- Preserve the local-first privacy model.
- For UI changes, check the shadcn/ui registry and existing `src/components/ui` primitives before creating a new component; prefer composition over bespoke primitives.
- Keep local UI components as thin feature wrappers around shadcn primitives, data loading, and event handlers.
- Run the relevant validation command before opening a pull request.
