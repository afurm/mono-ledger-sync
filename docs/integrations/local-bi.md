# Local BI with Metabase or Grafana

Use external BI tools only against local files you control. The supported
workflow is:

1. Export a redacted SQLite snapshot or Parquet file.
2. Keep the file on the same machine or in an encrypted local folder.
3. Point the BI tool at that local file.
4. Do not expose the BI tool to the public internet.

## Metabase

Metabase can inspect SQLite through a community driver or query Parquet through
DuckDB-backed workflows. For this project, prefer importing the Parquet export
into DuckDB and connecting Metabase to that local DuckDB file.

Minimum safe setup:

- Bind Metabase to `127.0.0.1`.
- Disable public sharing.
- Use a local admin password.
- Load only redacted snapshots or Parquet exports.
- Delete old exports when they are no longer needed.

## Grafana

Grafana is useful for local time-series dashboards such as daily balances or
monthly spending. Use a local DuckDB/SQLite data source plugin against redacted
snapshots.

Minimum safe setup:

- Bind Grafana to `127.0.0.1`.
- Do not enable anonymous access.
- Do not install plugins from untrusted sources.
- Do not point Grafana at the live production database if a redacted snapshot
  is enough.

## Suggested Datasets

- `v_monthly_spending` for category spending trends.
- `v_daily_balance` for account balance charts.
- `v_budget_progress` for budget monitoring.
- Parquet `posted_month`, `category_name`, `currency_code`, and `amount_minor`
  columns for portable dashboard datasets.

## Security Warning

BI tools can easily turn a local finance file into a network-accessible data
source. Keep them on localhost, avoid public tunnels, and never upload raw or
redacted snapshots to third-party dashboards unless you have made a deliberate
privacy and compliance decision outside this project.
