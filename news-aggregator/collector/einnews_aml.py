"""moneylaundering.einnews.com RSS (general AML news)."""
import re
from calendar import timegm
from datetime import datetime, timezone

import feedparser

from collector.common import clean, get, iso_utc

SOURCE = "einnews_aml"
FEED_URL = "https://moneylaundering.einnews.com/all_rss"

# Jurisdiction only when the title makes it unambiguous. (pattern, ISO code)
JURISDICTION_HINTS = [
    (r"\bsingapore\b|\bMAS\b", "SG"), (r"\bU\.?S\.?\b|\bUnited States\b|\bOFAC\b|\bFinCEN\b", "US"),
    (r"\bU\.?K\.?\b|\bBritain\b|\bBritish\b|\bFCA\b", "GB"), (r"\bAustralia", "AU"),
    (r"\bHong Kong\b", "HK"), (r"\bCanad", "CA"), (r"\bIndia\b", "IN"), (r"\bEU\b|\bEuropean Union\b", "EU"),
]


def infer_jurisdiction(title):
    for pattern, code in JURISDICTION_HINTS:
        if re.search(pattern, title, flags=re.I if code not in ("SG", "US") else 0):
            return code
    return None


def parse(feed_bytes):
    feed = feedparser.parse(feed_bytes)
    if not feed.entries:
        raise ValueError(f"einnews feed has no entries (bozo={feed.bozo}: {feed.get('bozo_exception')})")
    items = []
    for e in feed.entries:
        url, title = e.get("link"), clean(e.get("title"))
        if not url or not title:
            continue
        ts = e.get("published_parsed") or e.get("updated_parsed")
        published = iso_utc(datetime.fromtimestamp(timegm(ts), tz=timezone.utc)) if ts else None
        items.append({
            "source": SOURCE,
            "source_type": "news_rss",
            "regulator": None,
            "jurisdiction": infer_jurisdiction(title),
            "category": "news",
            "title": title,
            "summary": clean(re.sub(r"<[^>]+>", " ", e.get("summary", ""))) or None,
            "url": url,
            "natural_key": url,
            "published_at": published,
            "raw_payload": {k: e.get(k) for k in ("id", "title", "link", "summary", "published", "author", "tags")},
            "entity_names": None,
        })
    return items


def fetch():
    return parse(get(FEED_URL).content)
