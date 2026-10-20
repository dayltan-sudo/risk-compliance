import pytest

from digest.formatter import build_digest, ensure_digest_table, last_digest_run, make_digest
from digest.run_digest import run
from storage import connect, init_db, record_collector_run, upsert_item



@pytest.fixture
def db(tmp_path):
    path = str(tmp_path / "data" / "aggregator.db")
    init_db(path)
    return path


def make_item(**over):
    item = {
        "source": "mas_news", "source_type": "regulatory_page", "regulator": "MAS",
        "jurisdiction": "SG", "category": "news", "title": "T", "summary": None,
        "url": "https://example.test/a", "published_at": "2026-10-01T00:00:00Z",
        "raw_payload": {"v": 1}, "entity_names": None,
    }
    item.update(over)
    return item

FAR_FUTURE = "2999-01-01T00:00:00Z"


def add(db, n, **over):
    conn = connect(db)
    for i in range(n):
        fields = {"url": f"https://example.test/{over.get('source', 'x')}/{i}", "title": f"Item {i}"}
        upsert_item(make_item(**{**fields, **over}), conn=conn)
    conn.commit()
    conn.close()


def sanctions(db, n):
    add(db, n, source="opensanctions_consolidated", source_type="sanctions_list",
        category="sanctions_designation", regulator="OFAC", jurisdiction="US")


def digest(db, since=None):
    conn = connect(db)
    try:
        return build_digest(conn, since, FAR_FUTURE)
    finally:
        conn.close()


def test_empty_db(db):
    md, total = digest(db)
    assert total == 0
    for line in ("No new regulatory page items.", "No new sanctions items.", "No new news items.",
                 "No collector errors."):
        assert line in md


def test_sanctions_cap_at_20(db):
    sanctions(db, 45)
    md, total = digest(db)
    assert total == 45
    assert sum(1 for l in md.splitlines() if l.startswith("- Item ")) == 20
    assert "- ...and 25 more, see DB" in md
    assert "No new sanctions items." not in md


def test_under_cap_has_no_more_line(db):
    sanctions(db, 3)
    md, _ = digest(db)
    assert "more, see DB" not in md


def test_bullet_one_line_with_regulator_and_link(db):
    add(db, 1, title="Multi\nline   title")
    md, _ = digest(db)
    assert "- Multi line title — MAS/SG — https://example.test/x/0" in md


def test_error_surfaced_only_if_latest_run_failed(db):
    conn = connect(db)
    record_collector_run("einnews_aml", "2026-10-20T09:00:00Z", None, 0, 0, error="HTTPError: 403", conn=conn)
    record_collector_run("mas_news", "2026-10-20T09:00:00Z", "2026-10-20T09:00:01Z", 0, 0, error="boom", conn=conn)
    record_collector_run("mas_news", "2026-10-20T10:00:00Z", "2026-10-20T10:00:01Z", 5, 0, conn=conn)
    conn.commit()
    conn.close()
    md, _ = digest(db)
    assert "- einnews_aml: last run failed" in md and "HTTPError: 403" in md
    assert "mas_news" not in md
    assert "No collector errors." not in md


def test_no_new_items_since_marker(db):
    add(db, 3)
    md, total = digest(db, since=FAR_FUTURE[:-1] + "Z")
    assert total == 0 and "No new regulatory page items." in md


def test_run_twice_second_is_empty_and_writes_file(db, tmp_path):
    add(db, 2)
    out = tmp_path / "out"
    md1, path1 = run(db, str(out))
    assert "- 2 new items since the beginning" in md1
    assert open(path1).read() == md1
    md2, _ = run(db, str(out))
    assert "- 0 new items" in md2
    conn = connect(db)
    ensure_digest_table(conn)
    assert last_digest_run(conn) is not None
    assert conn.execute("SELECT COUNT(*) FROM digest_runs").fetchone()[0] == 2
    conn.close()


def test_make_digest_does_not_advance_marker(db):
    make_digest(db)
    conn = connect(db)
    assert last_digest_run(conn) is None
    conn.close()
