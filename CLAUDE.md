# Project entrypoint for Claude Code

You are working in the HR-ERP project (`/Users/lerchbalazs/Desktop/HR-ERP-PROJECT`).

**Before doing ANY work in this repo, read these three files in order:**

1. `PROJECT_STATE.md` — live architecture, active vs dormant systems, known overlaps, tech debt, current focus.
2. `CLAUDE_CODE_INSTRUCTIONS.md` — how to operate as a Claude Code agent in this repo.
3. Most recent entry in `SESSION_LOG.md` — what the previous session did, what's in flight, what's next.

Then run `git log --oneline -10` and `git status` and **briefly summarize** to the user what you understand before diving in.

**Open architectural decision:** see `docs/ARCH_COST_TRACKING_OPTIONS.md` — cost-tracking unification between old `cost_centers` pipeline and new `accommodation_expenses`. Awaiting user choice.

**Duplication is a real risk in this repo.** Before adding anything new, search for existing systems and check the "Known overlaps" section of `PROJECT_STATE.md`.

**🌐 Resident i18n guard (MANDATORY before committing resident-facing changes).** If a change touches resident-facing UI (the mobile resident screens) OR DB enums a resident can see (ticket categories / statuses / priorities), run:

```
node scripts/check-i18n-coverage.js     # must exit 0
```

It verifies every resident-visible enum slug has a key in all 5 locales (hu/en/uk/tl/de) and that the resident-only screens contain no hardcoded Hungarian. Do not commit such changes if it exits non-zero — fix the gaps it lists first. (Needs Postgres up; honors `$DATABASE_URL`.)
