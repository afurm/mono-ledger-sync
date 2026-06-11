# 0007 Local API server

Date: 2026-05-11

Status: Accepted

## Context

The Vite UI needs an HTTP API to read and update local data, run sync jobs, validate tokens, trigger exports, and inspect diagnostics. That API exists to support the local product experience. It is not a hosted service, public developer API, MCP server, or integration layer.

The API server should be small, typed, fast to start, easy to test, and explicit about local-only binding and sensitive data handling.

## Decision

Use Fastify for the local app API server.

The local app should start a Fastify server, serve the production Vite build, and expose the product API under a local route prefix such as `/api`. Local development can run Vite separately while proxying product API calls to the same Fastify route handlers.

Fastify route handlers should stay thin. They can validate requests, map HTTP errors, and call core services, but sync, storage, export, categorization, and Monobank logic must live outside the HTTP layer.

Default server behavior:

- Bind to localhost by default.
- Require passcode authentication for public interface binds.
- Choose a safe available port or fail with clear instructions.
- Serve only the local UI and local product API.
- Disable hosted/team/multi-tenant behavior because it is not part of the product.
- Redact tokens, account identifiers, raw payloads, and other sensitive data from logs and errors.
- Use runtime request and response schemas for product API routes.
- Keep long-running sync and export jobs observable through local job state rather than blocking UI requests.

## Consequences

Fastify gives the local product a focused HTTP boundary without turning the package into a public API server. The Vite UI should use the same core services behind this boundary so local behavior stays consistent across the browser UI, tests, and API routes.
