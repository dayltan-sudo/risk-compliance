"""MAS news. The /news page renders its list client-side from the site's own JSON search
endpoint (/api/v1/search, Solr-style), so we call that endpoint with the same query the page
makes instead of scraping HTML (the static HTML contains no article list)."""
from urllib.parse import urljoin

from collector.common import clean, get, parse_date

SOURCE = "mas_news"
API_URL = "https://www.mas.gov.sg/api/v1/search"
ROWS = 50
PARAMS = {
    "json.nl": "map", "q": "*:*", "start": "0", "rows": str(ROWS),
    "fq": 'mas_mastercontenttypes_sm:"News"', "sort": "mas_date_tdt desc",
}

# MAS content types -> our category. "Letters" are MAS letters to industry (closest thing to
# circulars); everything else defaults to news.
CATEGORY_BY_CONTENT_TYPE = {
    "Letters": "circular_notice",
    "Enforcement Actions Media Releases": "enforcement_action",
}


def parse(payload):
    try:
        docs = payload["response"]["docs"]
    except (KeyError, TypeError) as exc:
        raise ValueError("MAS search API: unexpected response shape") from exc
    if not docs:
        raise ValueError("MAS search API returned no documents")

    items = []
    for d in docs:
        path = d.get("page_url_s")
        title = clean(d.get("document_title_string_s") or d.get("navigation_title_string_s"))
        if not path or not title:
            continue
        url = urljoin("https://www.mas.gov.sg", path)
        summary = clean((d.get("document_shortsummary_t") or [""])[0]) or None
        content_type = d.get("mas_contenttype_s")
        items.append({
            "source": SOURCE,
            "source_type": "regulatory_page",
            "regulator": "MAS",
            "jurisdiction": "SG",
            "category": CATEGORY_BY_CONTENT_TYPE.get(content_type, "news"),
            "title": title,
            "summary": summary,
            "url": url,
            "natural_key": url,
            "published_at": parse_date(d.get("mas_date_tdt")),
            "raw_payload": {k: v for k, v in d.items() if k != "score"},  # score varies per query
            "entity_names": None,
        })
    return items


def fetch():
    return parse(get(API_URL, params=PARAMS, headers={"Accept": "application/json"}).json())
