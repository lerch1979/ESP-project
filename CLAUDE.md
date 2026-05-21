# Project entrypoint for Claude Code

You are working in the HR-ERP project (`/Users/lerchbalazs/Desktop/HR-ERP-PROJECT`).

**Before doing ANY work in this repo, read these three files in order:**

1. `PROJECT_STATE.md` — live architecture, active vs dormant systems, known overlaps, tech debt, current focus.
2. `CLAUDE_CODE_INSTRUCTIONS.md` — how to operate as a Claude Code agent in this repo.
3. Most recent entry in `SESSION_LOG.md` — what the previous session did, what's in flight, what's next.

Then run `git log --oneline -10` and `git status` and **briefly summarize** to the user what you understand before diving in.

**Open architectural decision:** see `docs/ARCH_COST_TRACKING_OPTIONS.md` — cost-tracking unification between old `cost_centers` pipeline and new `accommodation_expenses`. Awaiting user choice.

**Duplication is a real risk in this repo.** Before adding anything new, search for existing systems and check the "Known overlaps" section of `PROJECT_STATE.md`.
