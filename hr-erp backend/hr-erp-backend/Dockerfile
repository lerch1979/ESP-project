FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Production image
FROM node:20-alpine

WORKDIR /app

# Install wget for healthcheck
RUN apk add --no-cache wget tini

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Copy source
COPY src ./src

# Ops/maintenance scripts (backfills, one-off migrations, health tooling). Without these
# in the image every operation has to be docker cp'd onto a running container by hand —
# which is exactly how the 2026-08-08 accommodation-history backfill had to be run.
COPY scripts ./scripts

# Numbered migrations + the legacy .sql set. The migration runner discovers these from
# disk, so WITHOUT them in the image `npm run db:migrate` inside a deployed container
# silently finds zero numbered migrations and reports "nothing to do" — which is why
# prod's ledger had drifted 45 rows behind reality and every migration since 093 was
# applied by hand via psql. Same class of gap as the scripts/ one above.
#
# Safe to ship only because migration 093 is now intercepted by OBSOLETE_MIGRATIONS in
# src/database/migrate.js and can never execute (its DELETE FROM employees WHERE
# contractor_id IS NULL would remove every real employee — see the decisions log).
COPY migrations ./migrations

# Create required directories
RUN mkdir -p logs uploads

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3001

# Tini as PID 1 for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "src/server.js"]
