"""Build the markdown digest from the SQLite store. Local only: nothing here sends anything.

"New since last digest" = items.first_seen_at > the previous digest's run_at (SCHEMA.md).
The marker lives in a small `digest_runs` table in the same DB (created here, not in
storage/db.py, so the collector schema is untouched).
"""
import re

from storage import connect, utcnow_iso

SANCTIONS_CAP = 20

# (source_type, heading, label used in the "No new ... items." line)
GROUPS = [
    ("regulatory_page", "Regulatory pages", "regulatory page"),
    ("sanctions_list", "Sanctions lists", "sanctions"),
    ("news_rss", "News", "news"),
]

DIGEST_RUNS_SCHEMA = """
CREATE TABLE IF NOT EXISTS digest_runs (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    run_at  TIMESTAMP NOT NULL,
    items   INTEGER NOT NULL
);
"""


def ensure_digest_table(conn):
    conn.executescript(DIGEST_RUNS_SCHEMA)


def last_digest_run(conn):
    """run_at of the most recent digest, or None if none has ever run."""
    row = conn.execute("SELECT run_at FROM digest_runs ORDER BY id DESC LIMIT 1").fetchone()
    return row["run_at"] if row else None


def record_digest_run(conn, run_at, items):
    conn.execute("INSERT INTO digest_runs (run_at, items) VALUES (?, ?)", (run_at, items))
    conn.commit()


def _line(text):
    return re.sub(r"\s+", " ", text or "").strip()


def _bullet(row):
    where = "/".join(dict.fromkeys(v for v in (row["regulator"], row["jurisdiction"]) if v))
    parts = [_line(row["title"])]
    if where:
        parts.append(where)
    parts.append(row["url"])
    return "- " + " — ".join(parts)


def latest_source_errors(conn):
    """[(source, error, started_at)] for sources whose most recent collector_run errored."""
    rows = conn.execute(
        """SELECT r.source, r.error, r.started_at FROM collector_runs r
           WHERE r.id = (SELECT MAX(id) FROM collector_runs WHERE source = r.source)
             AND r.error IS NOT NULL ORDER BY r.source"""
    ).fetchall()
    return [(r["source"], r["error"], r["started_at"]) for r in rows]


def build_digest(conn, since, now, cap=SANCTIONS_CAP):
    """Return (markdown, total_new). `since` is None on the first run (everything is new)."""
    where, args = "first_seen_at <= ?", [now]
    if since:
        where += " AND first_seen_at > ?"
        args.append(since)

    counts = {r["source_type"]: r["n"] for r in conn.execute(
        f"SELECT source_type, COUNT(*) AS n FROM items WHERE {where} GROUP BY source_type", args)}
    total = sum(counts.values())

    out = [f"# R&C digest {now}", f"- {total} new items since {since or 'the beginning (first run)'}"]

    for source_type, heading, label in GROUPS:
        n = counts.get(source_type, 0)
        out += ["", f"## {heading}"]
        if n == 0:
            out.append(f"No new {label} items.")
            continue
        limit = cap if source_type == "sanctions_list" else -1
        rows = conn.execute(
            f"""SELECT title, regulator, jurisdiction, url FROM items
                WHERE source_type = ? AND {where}
                ORDER BY published_at DESC, title LIMIT ?""",
            [source_type, *args, limit]).fetchall()
        out += [_bullet(r) for r in rows]
        if n > len(rows):
            out.append(f"- ...and {n - len(rows)} more, see DB")

    out += ["", "## Collector status"]
    errors = latest_source_errors(conn)
    if errors:
        out += [f"- {s}: last run failed ({started}) — {_line(e)[:200]}" for s, e, started in errors]
    else:
        out.append("No collector errors.")
    return "\n".join(out) + "\n", total


def make_digest(db_path=None, cap=SANCTIONS_CAP):
    """Query the DB and return (markdown, total_new, now). Does not advance the marker."""
    conn = connect(db_path)
    try:
        ensure_digest_table(conn)
        now = utcnow_iso()
        md, total = build_digest(conn, last_digest_run(conn), now, cap)
        return md, total, now
    finally:
        conn.close()
