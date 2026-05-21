# Claude Code Instructions for This Project

This file tells Claude Code agents how to operate in this repo. Read it before doing anything else.

> ⚠️ **Important about auto-loading:** Claude Code only auto-injects a file named `CLAUDE.md` into every session. That file exists at the repo root and is a short pointer to this one. If you rename/move this file, also update `CLAUDE.md`.

---

## ALWAYS DO ON SESSION START

1. **Read `PROJECT_STATE.md`** — full file. It is the source of truth for what exists.
2. **Read the most recent entry in `SESSION_LOG.md`** — what the previous session did, what's in flight, what's next.
3. **Run `git log --oneline -10`** to see recent commits.
4. **Run `git status`** to see uncommitted work.
5. **Briefly summarize** to the user what you understood from steps 1-4 and confirm the focus before diving in.

If the user asks a quick question and the context is obviously local (one file, one symbol), you can skip the full read. Use judgment.

---

## BEFORE BUILDING NEW FEATURES

Ask yourself, in this order:

1. **Does this exist?** Grep the codebase. Check `PROJECT_STATE.md` → "Active systems" and "Dormant systems".
2. **Is there a related system that already does part of it?** Check "Known overlaps".
3. **Will this overlap with something dormant?** Dormant ≠ removable. Surface it before duplicating.
4. **Ask the user** if uncertain. A 30-second "I found X already; do you want me to extend it or build fresh?" beats half a day of duplicate code.

When you make a non-trivial architectural choice, **add a row to the "Architectural decisions log"** in `PROJECT_STATE.md` with date, decision, reason, status.

---

## ON SESSION END (when user says "done", "handoff", or asks for a wrap-up)

1. **Append a new entry** at the TOP of `SESSION_LOG.md` (newest first) following the template at the bottom of that file's most recent entry.
2. **Update `PROJECT_STATE.md`** if the architecture changed: new active system, dormant promotion, resolved overlap, new tech debt.
3. **Suggest a commit** for both docs together — do not auto-commit unless the user asks.
4. **Don't write a victory lap.** The doc is for the next session, not a press release.

You can use `scripts/session-end.sh` as a guided prompt. It's optional.

---

## DUPLICATION PREVENTION

Real overlaps already exist in this repo. Before adding anything that touches expenses, invoices, cost tracking, billing, or accommodations:

- Read `docs/ARCH_COST_TRACKING_OPTIONS.md`.
- Read `PROJECT_STATE.md` → "Known overlaps".
- The pattern "I'll just add a small table for X" is the entry point to most duplication. Resist it.

---

## CODE CONVENTIONS (quick reference)

- **Backend tests:** `tests/<feature>.script.js` — pure Node, real DB, clean up after themselves. Run with `node tests/<file>.script.js`.
- **Frontend tests:** none wired yet; manual + `npm run build` smoke.
- **Backend services:** export a class instance from `src/services/<feature>.service.js`. Controllers stay thin.
- **Backend routes:** `src/routes/<feature>.routes.js`, mounted in `src/server.js`.
- **Admin pages:** `hr-erp-admin/src/pages/`. Tab pattern via `useSearchParams` for URL state.
- **Hungarian labels** in user-facing admin UI. English in code, comments, and these docs.
- **Money:** `${Number(n).toLocaleString('hu-HU')} Ft`.
- **Dates:** `YYYY.MM.DD.` style (with trailing period — Hungarian convention).
- **Categories on `accommodation_expenses`:** hardcoded CHECK constraint, not a separate table.

---

## WHAT THE HARNESS *CAN'T* DO FOR YOU

These instructions are advisory. Claude Code does not auto-run scripts, auto-read docs other than `CLAUDE.md`, or auto-update `SESSION_LOG.md`. You (the agent) are the enforcement. If you want hard enforcement of any rule, wire it as a hook in `.claude/settings.json` — and write down what the hook does in `PROJECT_STATE.md`.

If the user wants stricter onboarding behavior across sessions, the right primitives are:
- **`CLAUDE.md` at repo root** — auto-loaded into every conversation (already exists).
- **`.claude/settings.json` hooks** — `SessionStart` hook can echo content into the conversation, or trigger a Bash command.
- **Skills under `.claude/skills/`** — invocable by name to load specialized workflows.

Don't pretend the harness does something it doesn't.
