"""Run every fetcher in sequence, upsert into SQLite, record a collector_runs row per source,
and print a summary table.

    cd news-aggregator && python3 collector/run_all.py
"""
import importlib
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENV_PYTHON = os.path.join(ROOT, ".venv", "bin", "python")


def _ensure_deps():
    """If bs4/feedparser/requests aren't importable but the project venv exists, re-exec in it."""
    try:
        import bs4, feedparser, requests  # noqa: F401
    except ImportError:
        if os.path.exists(VENV_PYTHON) and os.path.abspath(sys.executable) != os.path.abspath(VENV_PYTHON):
            os.execv(VENV_PYTHON, [VENV_PYTHON, os.path.abspath(__file__), *sys.argv[1:]])


if __name__ == "__main__":
    _ensure_deps()
sys.path.insert(0, ROOT)

from storage import connect, init_db, record_collector_run, upsert_item, utcnow_iso  # noqa: E402

# (source id, module, function). One entry per `source` in SCHEMA.md; a module may serve several.
FETCHERS = [
    ("mas_enforcement", "collector.mas_enforcement", "fetch"),
    ("mas_news", "collector.mas_news", "fetch"),
    ("opensanctions_consolidated", "collector.opensanctions", "fetch"),
    ("opensanctions_sg_terrorists", "collector.opensanctions_sg", "fetch_terrorists"),
    ("opensanctions_sg_mas_enforcement", "collector.opensanctions_sg", "fetch_mas_enforcement"),
    ("einnews_aml", "collector.einnews_aml", "fetch"),
    ("sanctionsexpert", "collector.sanctionsexpert", "fetch"),
]
COMMIT_EVERY = 5000


def run_source(conn, source, module_name, func_name):
    """Fetch + upsert one source. Never raises; returns (items_seen, items_new, error)."""
    started = utcnow_iso()
    seen = new = 0
    error = None
    try:
        fetch = getattr(importlib.import_module(module_name), func_name)
        for item in fetch():
            seen += 1
            if upsert_item(item, conn=conn):
                new += 1
            if seen % COMMIT_EVERY == 0:
                conn.commit()
        conn.commit()
    except Exception as exc:  # one source failing must not stop the run
        conn.rollback()
        error = f"{type(exc).__name__}: {exc}"[:500]
        seen = new = 0
    record_collector_run(source, started, utcnow_iso(), seen, new, error=error, conn=conn)
    conn.commit()
    return seen, new, error


def print_summary(rows):
    width = max(len(r[0]) for r in rows + [("source",)])
    print(f"{'source'.ljust(width)}  {'items_seen':>10}  {'items_new':>9}  status")
    print(f"{'-' * width}  {'-' * 10}  {'-' * 9}  {'-' * 6}")
    for source, seen, new, error in rows:
        print(f"{source.ljust(width)}  {seen:>10}  {new:>9}  {'OK' if error is None else 'ERROR: ' + error}")


def main():
    init_db()
    conn = connect()
    rows = []
    try:
        for source, module_name, func_name in FETCHERS:
            rows.append((source, *run_source(conn, source, module_name, func_name)))
    finally:
        conn.close()
    print_summary(rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())
