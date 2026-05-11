# 0005 Fixtures-first development

Date: 2026-05-11

Status: Accepted

## Context

The project needs reliable tests, demos, screenshots, and local development flows before users configure real Monobank credentials. Live API tests would be slow, privacy-sensitive, and brittle because personal API endpoints have strict rate limits.

The local web UI should be useful from the first run, so fixture data must be good enough to drive real app pages, charts, filters, empty states, and export previews without a token.

## Decision

Development starts with sanitized Monobank-shaped fixtures and a `FixtureMonobankAdapter`.

The fixture adapter and future HTTP adapter must implement the same `MonobankAdapter` boundary. Core sync, storage, the Vite web UI, CLI launcher, rules, reports, and exports should work against fixture data before live API calls are required.

Fixtures should cover client info, statement pages, currency rates, personal webhook events, empty states, invalid token responses, rate limits, and server errors. Fixture data should include representative Ukrainian merchants, income, card payments, transfers, subscriptions, cashback, multiple accounts, jars, and mixed currencies without using real personal data.

CI and default tests must not call the real Monobank API. Any integration test that needs live credentials must be opt-in, documented, and safe to skip.

## Consequences

Fixtures make the project contributor-friendly and protect user privacy. The tradeoff is that fixture quality becomes part of product quality, so fixture coverage and sanitization rules must be maintained as permanent project assets.
