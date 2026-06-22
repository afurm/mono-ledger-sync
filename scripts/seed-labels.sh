#!/usr/bin/env bash
# Seed the GitHub issue labels that map to the project's roadmap areas.
# Idempotent: re-running the script does not error. Requires the gh CLI
# authenticated against the target repository.
#
# Usage:
#   ./scripts/seed-labels.sh
#
# Or from CI:
#   - run: ./scripts/seed-labels.sh
#     env:
#       GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

set -euo pipefail

# label-name | color | description
LABELS=(
  "area:ui|1d76db|UI components, routes, and shadcn primitive coverage"
  "area:server|5319e7|Local API server, Fastify routes, and middleware"
  "area:storage|0e8a16|SQLite, migrations, query services, and write services"
  "provider|b60205|Monobank provider/corporate API adapter work (Milestone 16)"
  "acquiring|d93f0b|Monobank acquiring API adapter work (Milestone 16)"
  "blocked|c5def5|Cannot progress without external dependency or unblock"
  "wontfix-proper|ffffff|Decision made not to fix; documented reason required"
  "roadmap|cfd3d7|Long-running roadmap item; not a near-term target"
  "milestone-10|bfd4f2|Milestone 10 — sync and webhook settings UI"
  "milestone-16|f9d0c4|Milestone 16 — provider and acquiring adapters"
)

for entry in "${LABELS[@]}"; do
  IFS='|' read -r name color description <<< "$entry"

  if gh label list --limit 200 --json name 2>/dev/null | grep -q "\"name\": \"$name\""; then
    echo "label exists: $name"
  else
    # `gh label create` exits non-zero if the label already exists in some
    # race conditions. Tolerate the "already exists" stderr line; treat any
    # other error as a script failure.
    output=$(gh label create "$name" --color "$color" --description "$description" 2>&1) || {
      if echo "$output" | grep -q "already exists"; then
        echo "label exists (race): $name"
        continue
      fi
      echo "$output" >&2
      exit 1
    }
    echo "label created: $name"
  fi
done
