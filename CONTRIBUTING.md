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
- Run the relevant validation command before opening a pull request.
