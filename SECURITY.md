# Security Policy

## Reporting

Please report security issues privately by emailing `furmanets.andriy@gmail.com`.

Do not open public issues for vulnerabilities that may expose tokens, account identifiers, or personal financial data.

## Secret handling

- Never commit Monobank tokens or raw personal financial exports.
- Redact tokens, authorization headers, account identifiers, and full raw payloads from logs.
- Treat personal webhooks as sync hints and reconcile with statement pulls.
- Prefer local secure storage for tokens when live sync is implemented.
- Use personal API tokens only for your own account data on your own machine.
- Do not run this project as a hosted token relay, shared team service, or workflow for other people's banking data.
