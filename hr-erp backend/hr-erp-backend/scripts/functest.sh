#!/usr/bin/env bash
# One-command automated functional test suite — SANDBOX ONLY.
#
#   npm run functest                     reset → seed → run every scenario → write docs/FUNCTEST_REPORT.md
#   npm run functest -- --no-reset       reuse the current sandbox (fast iteration)
#   npm run functest -- --only=BILLING   one area
#   npm run functest -- --case=BILL-09   one scenario
#   npm run functest -- --keep           leave the fixture in the DB afterwards
#
# The target is pinned here and re-checked inside the runner (env-level AND on the live
# connection). Prod and the dev DB are unreachable from this script by construction.
set -euo pipefail
cd "$(dirname "$0")/.."

export DB_NAME="${SANDBOX_DB:-hr_erp_sandbox}"
export DB_HOST="${DB_HOST:-localhost}"
export NODE_ENV=test
# Pin the timezone: the app runs in Europe/Budapest, pg returns DATE as local-midnight,
# and one scenario asserts a UTC-vs-local boundary. A drifting TZ would make it flaky.
export TZ="${TZ:-Europe/Budapest}"

case "$DB_NAME" in
  *sandbox*) ;;
  *) echo "✋ functest refuses to run against DB_NAME='$DB_NAME' (must contain 'sandbox')"; exit 1 ;;
esac

exec node tests/functest/run.js "$@"
