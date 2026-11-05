"""Parser tests on small inline fixtures (no network)."""
import pytest

from collector import mas_enforcement, mas_news, opensanctions, sanctionsexpert

MAS_HTML = """<table><thead><tr><th>Issue Date</th><th>Person/Company</th><th>Action Type</th><th>Title</th></tr></thead>
<tbody><tr><td> 14 October 2026 </td><td>Sir Money Changer Pte Ltd</td><td> Revocation </td>
<td><a href="/regulation/enforcement/enforcement-actions/2026/x"> MAS Revokes Licence </a></td></tr></tbody></table>"""


def test_mas_enforcement_parse():
    (item,) = mas_enforcement.parse(MAS_HTML)
    assert item["url"] == "https://www.mas.gov.sg/regulation/enforcement/enforcement-actions/2026/x"
    assert item["published_at"] == "2026-10-14T00:00:00Z"
    assert (item["regulator"], item["jurisdiction"], item["category"]) == ("MAS", "SG", "enforcement_action")


def test_mas_enforcement_structure_change_raises():
    with pytest.raises(ValueError):
        mas_enforcement.parse("<html><body>no table</body></html>")
    with pytest.raises(ValueError):
        mas_enforcement.parse("<table><thead><tr><th>Other</th></tr></thead><tbody></tbody></table>")


def test_mas_news_parse_and_category():
    payload = {"response": {"docs": [
        {"page_url_s": "/news/media-releases/2026/a", "document_title_string_s": "A",
         "mas_date_tdt": "2026-10-20T10:30:00Z", "mas_contenttype_s": "Media Releases"},
        {"page_url_s": "/news/letters/2026/b", "document_title_string_s": "B",
         "mas_date_tdt": "2026-10-19T10:30:00Z", "mas_contenttype_s": "Letters"},
    ]}}
    a, b = mas_news.parse(payload)
    assert (a["category"], b["category"]) == ("news", "circular_notice")
    assert a["published_at"] == "2026-10-20T10:30:00Z"
    with pytest.raises(ValueError):
        mas_news.parse({"unexpected": 1})


def test_sanctionsexpert_categorise():
    c = sanctionsexpert.categorise
    assert c("x", "Designation") == "sanctions_designation"
    assert c("OFAC Removes 125 Individuals and Entities from Sanctions Lists", "Update") == "sanctions_delisting"
    assert c("OFAC Removes Duplicative Penalty Provisions", "Update") == "news"
    assert c("OFAC issues GL 131S", "General License") == "news"


ROW = {"id": "NK-1", "schema": "Person", "name": "Jane Doe", "aliases": "J Doe;Jane D", "countries": "ru",
       "sanctions": "", "program_ids": "US-RUSSIA", "dataset": "US OFAC Specially Designated Nationals (SDN) List",
       "first_seen": "2025-01-02T03:04:05", "last_seen": "", "last_change": ""}


def test_opensanctions_row_to_item():
    item = opensanctions.row_to_item(ROW, "opensanctions_consolidated", derive_issuer=True)
    assert (item["regulator"], item["jurisdiction"]) == ("OFAC", "US")
    assert item["entity_names"] == ["Jane Doe", "J Doe", "Jane D"]
    assert item["natural_key"] == "NK-1" and item["published_at"] == "2025-01-02T03:04:05Z"


def test_opensanctions_issuer_fallbacks():
    assert opensanctions.issuer("Canadian Consolidated Autonomous Sanctions List", "CA-SEMA") == (None, "CA")
    assert opensanctions.issuer("Swiss SECO Sanctions/Embargoes", "SECO") == (None, "CH")
    assert opensanctions.issuer("Something", "") == (None, "GLOBAL")
