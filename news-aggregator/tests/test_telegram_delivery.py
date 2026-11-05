from unittest import mock

import pytest
import requests

from digest import telegram_delivery as td


def test_short_text_not_split():
    assert td.split_message("a\nb\n") == ["a\nb\n"]


def test_long_text_splits_at_line_boundaries():
    lines = [f"line {i:04d} " + "x" * 40 + "\n" for i in range(300)]
    text = "".join(lines)
    chunks = td.split_message(text)
    assert len(chunks) > 1
    assert all(len(c) <= td.MAX_LEN for c in chunks)
    assert "".join(chunks) == text
    assert all(c.endswith("\n") for c in chunks)


def test_oversized_single_line_is_wrapped_not_dropped():
    text = "y" * (td.MAX_LEN * 2 + 5)
    chunks = td.split_message(text)
    assert all(len(c) <= td.MAX_LEN for c in chunks)
    assert "".join(chunks) == text


@pytest.fixture
def creds(monkeypatch):
    monkeypatch.setattr(td, "load_dotenv", lambda *a, **k: None)
    monkeypatch.setenv("NEWS_AGGREGATOR_TELEGRAM_BOT_TOKEN", "tok")
    monkeypatch.setenv("NEWS_AGGREGATOR_TELEGRAM_CHAT_ID", "123")


def test_send_posts_one_request_per_chunk(creds):
    text = "".join(f"{i:04d} " + "z" * 90 + "\n" for i in range(100))
    ok = mock.Mock(status_code=200)
    with mock.patch.object(td.requests, "post", return_value=ok) as post:
        assert td.send_digest(text) is True
    assert post.call_count == len(td.split_message(text)) > 1


def test_send_error_hides_token(creds):
    with mock.patch.object(td.requests, "post", side_effect=requests.ConnectionError("https://x/bottok/send")):
        with pytest.raises(RuntimeError) as e:
            td.send_digest("hi")
    assert "tok" not in str(e.value)


def test_missing_credentials_raises(monkeypatch):
    monkeypatch.setattr(td, "load_dotenv", lambda *a, **k: None)
    monkeypatch.delenv("NEWS_AGGREGATOR_TELEGRAM_BOT_TOKEN", raising=False)
    with pytest.raises(RuntimeError):
        td.send_digest("hi")
