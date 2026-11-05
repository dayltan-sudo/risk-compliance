# risk-compliance (Keppel R&C agentic prototypes) - CONFIDENTIAL

Rules in `/home/dayltan/AGENTS.md` still apply. Repo is `dayltan-sudo/risk-compliance`.

## Layout
- `salus-prototype/`: Salus code (React + Hono, TypeScript). Has its own `CLAUDE.md`; build work goes there, not in `insurance-dashboard/`.
- `news-aggregator/`: Python pipeline. `collector/`, `storage/`, `digest/`, `cron/`, `tests/`, `SCHEMA.md`, `requirements.txt`, own `.venv`.
- `credit-assessment/` (Fiscus), `third-party-onboarding/` (Census), `insurance-dashboard/` (Salus planning only): PRDs, planning docs, prototypes. Treat as documents; do not restructure folders or rename numbered subfolders.
- `fiscus-prototype-v2/`: Node prototype.

## news-aggregator
- Activate first: `source /home/dayltan/risk-compliance/news-aggregator/.venv/bin/activate`. A missing module usually means the venv was not activated (a past cron failure was `ModuleNotFoundError: dotenv`).
- Tests: `cd /home/dayltan/risk-compliance/news-aggregator && python -m pytest tests -q`
- Schema changes must update `SCHEMA.md` in the same change.
- Collectors: no secrets in code; read keys from the environment. Do not run collectors against live sources or send Telegram messages to verify; use fixtures.

## Rules
- Documents here may contain internal Keppel material. Do not copy content to external services, and do not paste it into code comments or tests.
- One change at a time; leave changes uncommitted unless told. Never push.
