# 0010 Parquet export

Date: 2026-06-18

## Status

Accepted.

## Context

The v0.4 portability slice needs a BI-friendly columnar export without turning
the app into a BI toolkit. The export must work from the local Node runtime,
avoid native build steps, keep the npm package reasonable, and be easy to verify
in CI.

## Options

- `hyparquet-writer`: MIT, TypeScript declarations, pure JavaScript, about 186
  KB unpacked plus `hyparquet` for reading. It writes Parquet buffers and pairs
  naturally with `hyparquet` metadata/row tests. It does not provide append-mode
  file mutation; exports are generated as complete files.
- `parquet-wasm`: MIT or Apache-2.0, TypeScript declarations, real reader/writer,
  but about 20 MB unpacked and adds a WebAssembly runtime surface.
- `parquetjs-lite`: MIT and pure JavaScript, but old maintenance state and weak
  type coverage for the current TypeScript codebase.
- `@dsnp/parquetjs`: MIT and more recently maintained than `parquetjs-lite`, but
  still follows the older ParquetJS API shape and is heavier than the hyparquet
  pair for this narrow export path.

## Decision

Use `hyparquet-writer` for ledger Parquet exports and `hyparquet` as an explicit
dev dependency for verification. The export is a full-file export, not append
mode. Row-count verification reads the generated Parquet metadata and rows in
tests.

The Parquet schema intentionally stays flat:

- normalized transaction identifiers and account/category/merchant fields;
- UTC date/month convenience columns;
- integer minor-unit money columns plus decimal major-unit helper columns;
- review state, local note, tags JSON, and split-plan JSON.

Raw Monobank statement payloads are not written to Parquet. Users who need raw
archive data should use the existing JSONL export deliberately.

## Consequences

- The npm runtime gains a small pure-JavaScript Parquet writer dependency.
- Parquet files are generated in memory like the existing CSV/JSON exports.
- Large append/incremental datasets remain out of scope until there is a proven
  need.
