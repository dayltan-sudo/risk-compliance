"""Shared helpers for the source fetchers."""
import re
from datetime import datetime, timezone

import requests

USER_AGENT = "Mozilla/5.0 (compatible; rc-news-aggregator/0.1)"  # MAS serves a different page to UAs without this prefix
TIMEOUT = (15, 60)  # connect, read seconds


def get(url, **kwargs):
    """One polite GET: identifying User-Agent, timeouts, raise on HTTP error."""
    headers = {"User-Agent": USER_AGENT, **kwargs.pop("headers", {})}
    resp = requests.get(url, headers=headers, timeout=kwargs.pop("timeout", TIMEOUT), **kwargs)
    resp.raise_for_status()
    return resp


def iso_utc(dt):
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_date(text, formats=("%d %B %Y", "%d %b %Y", "%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ")):
    """Best-effort date string -> ISO UTC string, or None."""
    text = re.sub(r"\s+", " ", (text or "")).strip()
    for fmt in formats:
        try:
            return iso_utc(datetime.strptime(text, fmt))
        except ValueError:
            continue
    return None


def clean(text):
    return re.sub(r"\s+", " ", text or "").strip()
