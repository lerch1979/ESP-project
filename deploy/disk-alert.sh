#!/usr/bin/env bash
# Disk / resource alert for the single-VM prod box (P0-4, scale-readiness).
# Checks root-FS usage and (optionally) memory, and raises an alert when a
# threshold is crossed. Detection + logging always work; notification delivery
# is pluggable via OPS_ALERT_WEBHOOK (Slack-compatible incoming webhook) — set
# it in ~/hr-erp/backup.env (sourced below) to activate Slack posting, same
# pattern as the offsite-backup config. Without a webhook it still logs loudly
# to ~/hr-erp/backups/disk-alert.log so a human/cron-mail path can catch it.
#
# Install (hourly):  0 * * * * /home/deploy/hr-erp/disk-alert.sh
set -euo pipefail
cd "$HOME/hr-erp"

DISK_THRESHOLD="${DISK_THRESHOLD:-80}"   # percent
MEM_THRESHOLD="${MEM_THRESHOLD:-90}"     # percent
LOG="$HOME/hr-erp/backups/disk-alert.log"
[ -f "$HOME/hr-erp/backup.env" ] && . "$HOME/hr-erp/backup.env"

mkdir -p "$(dirname "$LOG")"

disk_pct=$(df --output=pcent / | tail -1 | tr -dc '0-9')
mem_pct=$(free | awk '/^Mem:/ {printf "%d", ($2-$7)/$2*100}')

alerts=()
[ "$disk_pct" -ge "$DISK_THRESHOLD" ] && alerts+=("DISK ${disk_pct}% (>=${DISK_THRESHOLD}%)")
[ "$mem_pct"  -ge "$MEM_THRESHOLD"  ] && alerts+=("MEM ${mem_pct}% (>=${MEM_THRESHOLD}%)")

if [ ${#alerts[@]} -eq 0 ]; then
  # healthy — no noise; uncomment for a heartbeat line
  # echo "$(date '+%F %T') OK: disk ${disk_pct}% mem ${mem_pct}%" >> "$LOG"
  exit 0
fi

# Actionable context: biggest disk consumers on the box.
top_dirs=$(du -sh backups uploads 2>/dev/null | sort -rh | head -3 | tr '\n' ' ' || true)
docker_sz=$(docker system df --format '{{.Type}} {{.Size}}' 2>/dev/null | tr '\n' ';' || true)
msg="⚠️ hr-erp-prod resource alert: ${alerts[*]} | root ${disk_pct}% used | top: ${top_dirs}| docker: ${docker_sz}"

echo "$(date '+%F %T') $msg" >> "$LOG"

# Optional Slack delivery (Slack-compatible incoming webhook).
if [ -n "${OPS_ALERT_WEBHOOK:-}" ]; then
  curl -sS -m 10 -X POST -H 'Content-Type: application/json' \
    --data "$(printf '{"text":%s}' "$(printf '%s' "$msg" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")" \
    "$OPS_ALERT_WEBHOOK" >/dev/null 2>&1 \
    && echo "$(date '+%F %T') alert delivered to Slack" >> "$LOG" \
    || echo "$(date '+%F %T') WARN: Slack delivery failed" >> "$LOG"
fi
