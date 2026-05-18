# Monobank Fixtures

This directory contains sanitized Monobank-shaped fixtures for offline
development, tests, screenshots, and local demo databases.

The fixture shapes follow the personal Monobank API surfaces used by the
product:

- `client-info.json` mirrors `GET /personal/client-info`.
- `currency-rates.json` mirrors `GET /bank/currency`.
- `statements/*.json` mirror `GET /personal/statement/{account}/{from}/{to}`.
  - `statements/uah-main-2026-04-large.json` is a 120-item fixture designed to
    drive pagination, filters, chart inputs, rule categorization checks, and
    export/report smoke coverage.
- `webhooks/statement-item.json` mirrors a personal webhook `StatementItem`
  event.
- `errors/*.json` are local test envelopes for invalid access, rate limits, and
  upstream failures.

## Sanitizer Rules

Fixtures must never contain real tokens, real account identifiers, real card
numbers, real IBANs, or raw personal statement data.

- Use `fixture-` prefixes for account, statement, receipt, invoice, send, and
  jar identifiers.
- Use synthetic people, merchants, balances, timestamps, and descriptions.
- Keep `maskedPan` values zero-filled, for example `000000******0000`.
- Do not include real `X-Token` values, authorization headers, screenshots, or
  copied bank responses.
- Do not include real IBANs. If a counterparty IBAN-shaped field is needed for
  parser coverage, use a clearly invalid synthetic value such as
  `UA00SANITIZEDLOCALIBAN0000`.
- Do not include real EDRPOU, TIN, phone, email, or counterparty identifiers.
  Use obvious placeholders such as `00000000`.
- Prefer rounded synthetic balances and amounts that still cover income,
  expenses, holds, subscriptions, transfers, multi-currency operations, empty
  statements, and error handling.

All fixture timestamps are synthetic Unix seconds in April 2026. They are not
copied from a real account history.

## Expected Shapes

`client-info.json` must include a synthetic client, at least one account, and
may include jars or managed clients. Account objects should keep Monobank field
names such as `id`, `sendId`, `currencyCode`, `balance`, `creditLimit`, `type`,
`cashbackType`, and `maskedPan`.

Statement fixtures must be arrays of statement items with stable synthetic
`id`, Unix `time`, `description`, `mcc`, `originalMcc`, `amount`,
`operationAmount`, `currencyCode`, `commissionRate`, `cashbackAmount`,
`balance`, and `hold` fields. Optional fields such as `receiptId`, `invoiceId`,
`comment`, `counterEdrpou`, `counterIban`, and `counterName` may be included
only when they remain synthetic.

Webhook fixtures must use the personal webhook event shape:

```json
{
  "type": "StatementItem",
  "data": {
    "account": "fixture-account-uah-main",
    "statementItem": {}
  }
}
```

Error fixtures should be small local envelopes with `statusCode`, `code`,
`message`, and optional `retryAfterSeconds`. They are for adapter and UI tests,
not a record of a real bank response.
