"""Send the digest to Telegram. Credentials come from the root .env (load_dotenv() walks upward).

Needs NEWS_AGGREGATOR_TELEGRAM_BOT_TOKEN and NEWS_AGGREGATOR_TELEGRAM_CHAT_ID. Never logs either value.
"""
import os

import requests
from dotenv import load_dotenv

MAX_LEN = 4096
TIMEOUT = 30


def split_message(text, limit=MAX_LEN):
    """Split text into chunks of at most `limit` chars, breaking only at line boundaries.

    A single line longer than `limit` cannot be split at a line boundary; it is hard-wrapped
    so that no content is dropped.
    """
    chunks, cur = [], ""
    for line in text.splitlines(keepends=True):
        while len(line) > limit:
            if cur:
                chunks.append(cur)
                cur = ""
            chunks.append(line[:limit])
            line = line[limit:]
        if len(cur) + len(line) > limit:
            chunks.append(cur)
            cur = ""
        cur += line
    if cur:
        chunks.append(cur)
    return chunks


def send_digest(text: str) -> bool:
    """POST the digest to Telegram, one message per chunk. Returns True only if every chunk was accepted.

    Raises RuntimeError (with no secrets in the message) on missing config, network error, or API error.
    """
    load_dotenv()
    token = os.environ.get("NEWS_AGGREGATOR_TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("NEWS_AGGREGATOR_TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        raise RuntimeError("Telegram credentials not set (NEWS_AGGREGATOR_TELEGRAM_BOT_TOKEN / _CHAT_ID)")
    chunks = [c for c in split_message(text) if c.strip()]
    if not chunks:
        return True
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    for i, chunk in enumerate(chunks, 1):
        try:
            resp = requests.post(url, data={"chat_id": chat_id, "text": chunk}, timeout=TIMEOUT)
        except requests.RequestException as e:
            # str(e) can embed the URL (and so the token); report only the exception type.
            raise RuntimeError(f"network error sending part {i}/{len(chunks)}: {type(e).__name__}") from None
        if resp.status_code != 200:
            try:
                desc = resp.json().get("description", "")
            except ValueError:
                desc = ""
            raise RuntimeError(f"Telegram API HTTP {resp.status_code} on part {i}/{len(chunks)}: {desc}")
    return True
