"""SQLite store for the news aggregator. Implements SCHEMA.md (items + collector_runs)."""
import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone

DEFAULT_DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "aggregator.db"
)

SOURCES = {
    "mas_enforcement", "mas_news", "opensanctions_consolidated",
    "opensanctions_sg_terrorists", "opensanctions_sg_mas_enforcement",
    "einnews_aml", "sanctionsexpert",
}
SOURCE_TYPES = {"regulatory_page", "sanctions_list", "news_rss"}
CATEGORIES = {
    "enforcement_action", "sanctions_designation", "sanctions_delisting",
    "circular_notice", "news",
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS items (
    id            TEXT PRIMARY KEY,
    source        TEXT NOT NULL,
    source_type   TEXT NOT NULL,
    regulator     TEXT,
    jurisdiction  TEXT,
    category      TEXT NOT NULL,
    title         TEXT NOT NULL,
    summary       TEXT,
    url           TEXT NOT NULL,
    published_at  TIMESTAMP NOT NULL,
    first_seen_at TIMESTAMP NOT NULL,
    raw_payload   TEXT NOT NULL,
    entity_names  TEXT
);
CREATE INDEX IF NOT EXISTS idx_items_first_seen ON items(first_seen_at);
CREATE INDEX IF NOT EXISTS idx_items_source ON items(source);

CREATE TABLE IF NOT EXISTS collector_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source      TEXT NOT NULL,
    started_at  TIMESTAMP NOT NULL,
    finished_at TIMESTAMP,
    items_seen  INTEGER NOT NULL,
    items_new   INTEGER NOT NULL,
    error       TEXT
);
"""


def utcnow_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def make_id(source, natural_key):
    """sha256(source + natural_key), per SCHEMA.md."""
    return hashlib.sha256((source + natural_key).encode("utf-8")).hexdigest()


def connect(db_path=None):
    path = db_path or DEFAULT_DB_PATH
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path=None):
    """Create the DB file, data/ dir and both tables if missing. Idempotent."""
    conn = connect(db_path)
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def _as_json(value):
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


def upsert_item(item, conn=None, db_path=None):
    """Insert or refresh one item. Returns True if new, False if it already existed.

    `item` carries the SCHEMA.md fields plus `natural_key` (canonical URL for pages/news,
    the dataset's own record id for OpenSanctions); it defaults to `url`. `id` is derived
    as sha256(source + natural_key) unless supplied. On a re-seen item only raw_payload and
    summary are updated; first_seen_at is never touched.

    Pass `conn` to batch many upserts in one transaction (the caller commits).
    Without it, a connection is opened and committed per call.
    """
    own = conn is None
    if own:
        conn = connect(db_path)
    try:
        source = item["source"]
        if source not in SOURCES:
            raise ValueError(f"unknown source: {source!r}")
        if item["source_type"] not in SOURCE_TYPES:
            raise ValueError(f"unknown source_type: {item['source_type']!r}")
        if item["category"] not in CATEGORIES:
            raise ValueError(f"unknown category: {item['category']!r}")

        item_id = item.get("id") or make_id(source, item.get("natural_key") or item["url"])
        raw = _as_json(item["raw_payload"])
        summary = item.get("summary")

        row = conn.execute(
            "SELECT raw_payload, summary FROM items WHERE id = ?", (item_id,)
        ).fetchone()
        if row is not None:
            if row["raw_payload"] != raw or row["summary"] != summary:
                conn.execute(
                    "UPDATE items SET raw_payload = ?, summary = ? WHERE id = ?",
                    (raw, summary, item_id),
                )
            if own:
                conn.commit()
            return False

        first_seen = utcnow_iso()
        entity_names = item.get("entity_names")
        conn.execute(
            """INSERT INTO items (id, source, source_type, regulator, jurisdiction, category,
                                  title, summary, url, published_at, first_seen_at,
                                  raw_payload, entity_names)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                item_id, source, item["source_type"], item.get("regulator"),
                item.get("jurisdiction"), item["category"], item["title"], summary,
                item["url"], item.get("published_at") or first_seen, first_seen, raw,
                None if entity_names is None else _as_json(entity_names),
            ),
        )
        if own:
            conn.commit()
        return True
    finally:
        if own:
            conn.close()


def record_collector_run(source, started_at, finished_at, items_seen, items_new,
                         error=None, conn=None, db_path=None):
    """Append one collector_runs row. finished_at may be None (crashed run)."""
    own = conn is None
    if own:
        conn = connect(db_path)
    try:
        cur = conn.execute(
            """INSERT INTO collector_runs (source, started_at, finished_at, items_seen,
                                           items_new, error)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (source, started_at, finished_at, items_seen, items_new, error),
        )
        if own:
            conn.commit()
        return cur.lastrowid
    finally:
        if own:
            conn.close()
