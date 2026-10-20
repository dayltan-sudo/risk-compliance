import json

import pytest

from storage import connect, init_db, make_id, record_collector_run, upsert_item


@pytest.fixture
def db(tmp_path):
    path = str(tmp_path / "data" / "aggregator.db")  # data/ dir must be created by init_db
    init_db(path)
    return path


def make_item(**over):
    item = {
        "source": "mas_news", "source_type": "regulatory_page", "regulator": "MAS",
        "jurisdiction": "SG", "category": "news", "title": "T", "summary": "S",
        "url": "https://example.test/a", "published_at": "2026-10-01T00:00:00Z",
        "raw_payload": {"v": 1}, "entity_names": None,
    }
    item.update(over)
    return item


def rows(db, sql="SELECT * FROM items"):
    conn = connect(db)
    try:
        return conn.execute(sql).fetchall()
    finally:
        conn.close()


def test_init_db_creates_file_and_tables_idempotently(db):
    init_db(db)
    names = {r["name"] for r in rows(db, "SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"items", "collector_runs"} <= names


def test_fresh_insert(db):
    assert upsert_item(make_item(entity_names=["A", "B"]), db_path=db) is True
    (row,) = rows(db)
    assert row["id"] == make_id("mas_news", "https://example.test/a")
    assert row["first_seen_at"]
    assert json.loads(row["raw_payload"]) == {"v": 1}
    assert json.loads(row["entity_names"]) == ["A", "B"]


def test_duplicate_insert_creates_no_second_row(db):
    assert upsert_item(make_item(), db_path=db) is True
    assert upsert_item(make_item(), db_path=db) is False
    assert len(rows(db)) == 1


def test_updated_raw_payload_on_reseen_item(db):
    upsert_item(make_item(), db_path=db)
    first = rows(db)[0]
    assert upsert_item(make_item(raw_payload={"v": 2}, summary="S2"), db_path=db) is False
    (row,) = rows(db)
    assert json.loads(row["raw_payload"]) == {"v": 2}
    assert row["summary"] == "S2"
    assert row["first_seen_at"] == first["first_seen_at"]  # never touched on update


def test_natural_key_drives_identity_not_url(db):
    upsert_item(make_item(natural_key="rec-1", url="https://x/1"), db_path=db)
    assert upsert_item(make_item(natural_key="rec-1", url="https://x/other"), db_path=db) is False
    assert upsert_item(make_item(natural_key="rec-2", url="https://x/1"), db_path=db) is True
    assert len(rows(db)) == 2


def test_published_at_falls_back_to_first_seen(db):
    upsert_item(make_item(published_at=None), db_path=db)
    (row,) = rows(db)
    assert row["published_at"] == row["first_seen_at"]


def test_rejects_unknown_enum_values(db):
    with pytest.raises(ValueError):
        upsert_item(make_item(category="gossip"), db_path=db)
    assert rows(db) == []


def test_shared_connection_batches_until_caller_commits(db):
    conn = connect(db)
    upsert_item(make_item(), conn=conn)
    conn.rollback()
    assert rows(db) == []
    upsert_item(make_item(), conn=conn)
    conn.commit()
    conn.close()
    assert len(rows(db)) == 1


def test_record_collector_run(db):
    record_collector_run("mas_news", "2026-10-20T00:00:00Z", "2026-10-20T00:00:05Z", 3, 2, db_path=db)
    record_collector_run("einnews_aml", "2026-10-20T00:00:06Z", None, 0, 0, error="403", db_path=db)
    ok, bad = rows(db, "SELECT * FROM collector_runs ORDER BY id")
    assert (ok["items_seen"], ok["items_new"], ok["error"]) == (3, 2, None)
    assert (bad["finished_at"], bad["error"]) == (None, "403")
