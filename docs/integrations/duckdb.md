# DuckDB Workflow

This workflow is local-file only. Do not expose the SQLite database, snapshots,
or DuckDB shell through a hosted notebook or shared BI server.

## Read The Local SQLite Database

Install DuckDB locally, then load the SQLite extension:

```sql
INSTALL sqlite;
LOAD sqlite;
ATTACH '/absolute/path/to/profile.sqlite' AS mono (TYPE SQLITE);
```

Query the v0.4 BI views:

```sql
SELECT month, currency_code, category_name, spending_amount_major
FROM mono.v_monthly_spending
ORDER BY month DESC, spending_amount DESC;

SELECT transaction_date, account_id, balance_major
FROM mono.v_daily_balance
ORDER BY transaction_date DESC, account_id;
```

Available views:

- `v_transactions_long`
- `v_monthly_spending`
- `v_daily_balance`
- `v_recurring_commitments`
- `v_budget_progress`

## Read Parquet Exports

Generate a Parquet export from the local Exports flow or API:

```bash
curl -o ledger.parquet 'http://127.0.0.1:<port>/api/exports/ledger?format=parquet'
```

Then query it:

```sql
SELECT posted_month, currency_code, category_name, SUM(amount_minor) / 100.0 AS net
FROM read_parquet('ledger.parquet')
GROUP BY posted_month, currency_code, category_name
ORDER BY posted_month DESC;
```

## Safe Snapshot Input

For accountant or BI handoff, prefer a redacted SQLite snapshot:

```bash
curl -o mono-ledger-redacted.sqlite \
  'http://127.0.0.1:<port>/api/exports/ledger?format=sqlite&redacted=true'
```

The redacted snapshot keeps normalized ledger rows and BI views, but removes raw
statement payload rows, webhook event rows, raw Monobank account JSON, masked PAN
JSON, local export paths, and export-directory settings.
