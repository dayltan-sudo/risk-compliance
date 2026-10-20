"""MAS enforcement actions: the server-rendered HTML table on the enforcement-actions page."""
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from collector.common import clean, get, parse_date

SOURCE = "mas_enforcement"
PAGE_URL = "https://www.mas.gov.sg/regulation/enforcement/enforcement-actions"
EXPECTED_HEADERS = ["issue date", "person/company", "action type", "title"]


def parse(html, base_url=PAGE_URL):
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    if table is None:
        raise ValueError("MAS enforcement page: no <table> found (page structure changed?)")
    headers = [clean(th.get_text(" ")).lower() for th in table.find_all("th")]
    if headers != EXPECTED_HEADERS:
        raise ValueError(f"MAS enforcement table headers changed: {headers}")

    items = []
    for tr in table.find("tbody").find_all("tr"):
        cells = tr.find_all("td")
        if len(cells) != 4:
            continue
        date_s, person, action_type = (clean(c.get_text(" ")) for c in cells[:3])
        link = cells[3].find("a", href=True)
        if link is None:
            continue
        url = urljoin(base_url, link["href"])
        title = clean(link.get_text(" "))
        items.append({
            "source": SOURCE,
            "source_type": "regulatory_page",
            "regulator": "MAS",
            "jurisdiction": "SG",
            "category": "enforcement_action",
            "title": title,
            "summary": f"{action_type}: {person}" if person else action_type or None,
            "url": url,
            "natural_key": url,
            "published_at": parse_date(date_s),
            "raw_payload": {"issue_date": date_s, "person_company": person,
                            "action_type": action_type, "title": title, "url": url},
            "entity_names": [n.strip() for n in person.split(",") if n.strip()] or None,
        })
    if not items:
        raise ValueError("MAS enforcement table parsed but contained no rows")
    return items


def fetch():
    return parse(get(PAGE_URL).text)
