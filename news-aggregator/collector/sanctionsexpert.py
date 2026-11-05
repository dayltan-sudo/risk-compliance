"""Sanctions Expert Feed (feed.sanctionsexpert.com).

Despite the host name, https://feed.sanctionsexpert.com/feed is an HTML page (a Next.js reader),
not RSS, and no feed alternate link or /rss, /feed.xml etc. exists (all 404). We still try
feedparser first, in case an RSS/Atom document is ever served at that URL, and otherwise parse
the server-rendered article cards (authority, item type, action date, title, link).
"""
import re
from calendar import timegm
from datetime import datetime, timezone
from urllib.parse import urljoin

import feedparser
from bs4 import BeautifulSoup

from collector.common import clean, get, iso_utc, parse_date

SOURCE = "sanctionsexpert"
FEED_URL = "https://feed.sanctionsexpert.com/feed"

# Site's authority label -> (regulator, jurisdiction). Labels are copied as the site spells them
# (including its typos, e.g. "EU Commision"). Unknown authorities keep their raw label.
AUTHORITIES = {
    "OFAC": ("OFAC", "US"), "OFSI": ("UK-OFSI", "GB"), "OTSI": ("UK-OTSI", "GB"),
    "ECJU": ("UK-ECJU", "GB"), "EU Council": ("EU", "EU"), "EU Commision": ("EU", "EU"),
    "EU Commission": ("EU", "EU"), "DOJ": ("DOJ", "US"), "FinCEN": ("FinCEN", "US"),
    "State Deparment": ("US-State", "US"), "State Department": ("US-State", "US"),
    "DGT": ("FR-DGT", "FR"),
}

DELISTING_RE = re.compile(
    r"\bdelist\w*|\bremov(es|ed|al of)\b[\w ,]*?\b(individuals?|entities|persons?|vessels?|listings?|designations?)\b", re.I)
DESIGNATION_RE = re.compile(r"\b(designates?|sanctions \d+|sanctions (one|two|three|individuals?|entities))\b", re.I)


def categorise(title, item_type=None):
    """Site's own type label first, then title keywords, else news."""
    t = (item_type or "").lower()
    if t == "designation":
        return "sanctions_designation"
    if t in ("removal", "delisting"):
        return "sanctions_delisting"
    if t == "enforcement action":
        return "enforcement_action"
    if DELISTING_RE.search(title):
        return "sanctions_delisting"
    if DESIGNATION_RE.search(title):
        return "sanctions_designation"
    return "news"


def _item(title, url, published, authority=None, item_type=None, summary=None, raw=None):
    regulator, jurisdiction = AUTHORITIES.get(authority, (authority, None))
    return {
        "source": SOURCE,
        "source_type": "news_rss",
        "regulator": regulator,
        "jurisdiction": jurisdiction,
        "category": categorise(title, item_type),
        "title": title,
        "summary": summary,
        "url": url,
        "natural_key": url,
        "published_at": published,
        "raw_payload": raw or {},
        "entity_names": None,
    }


def parse_feed(content):
    feed = feedparser.parse(content)
    items = []
    for e in feed.entries:
        url, title = e.get("link"), clean(e.get("title"))
        if not url or not title:
            continue
        ts = e.get("published_parsed") or e.get("updated_parsed")
        published = iso_utc(datetime.fromtimestamp(timegm(ts), tz=timezone.utc)) if ts else None
        summary = clean(re.sub(r"<[^>]+>", " ", e.get("summary", ""))) or None
        items.append(_item(title, url, published, summary=summary,
                           raw={k: e.get(k) for k in ("id", "title", "link", "summary", "published")}))
    return items


def parse_html(html, base_url=FEED_URL):
    soup = BeautifulSoup(html, "html.parser")
    items = []
    for art in soup.find_all("article"):
        link = art.find("a", href=re.compile(r"/feed/item/"))
        if link is None:
            continue
        blocks = link.find_all("div", recursive=False)  # [meta line, title, tag chips]
        if len(blocks) < 2:
            continue
        spans = [clean(s.get_text(" ")) for s in blocks[0].find_all("span", recursive=False)]
        spans = [s for s in spans if s]
        title = clean(blocks[1].get_text(" "))
        if not title or len(spans) < 3:
            continue
        authority, item_type, date_s = spans[0], spans[1], spans[2]
        url = urljoin(base_url, link["href"])
        items.append(_item(title, url, parse_date(date_s), authority, item_type,
                           raw={"authority": authority, "type": item_type,
                                "action_date": date_s, "title": title, "url": url}))
    if not items:
        raise ValueError("sanctionsexpert: no RSS entries and no article cards found (format changed?)")
    return items


def fetch():
    content = get(FEED_URL).content
    return parse_feed(content) or parse_html(content)
