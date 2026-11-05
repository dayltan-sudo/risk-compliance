"""Build the digest, write it to digest/output/digest_<timestamp>.md, print it, advance the marker.

    cd news-aggregator && python3 digest/run_digest.py [--db PATH] [--out-dir DIR]

Writes the local file, then sends the digest to Telegram. A failed send is reported but does not
change the exit code.
"""
import argparse
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from digest.formatter import ensure_digest_table, make_digest, record_digest_run  # noqa: E402
from digest.telegram_delivery import send_digest  # noqa: E402
from storage import connect  # noqa: E402

DEFAULT_OUT_DIR = os.path.join(ROOT, "digest", "output")


def run(db_path=None, out_dir=None):
    """Returns (markdown, output_path). Marker is advanced only after the file is written."""
    md, total, now = make_digest(db_path)
    out_dir = out_dir or DEFAULT_OUT_DIR
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "digest_" + now.replace(":", "") + ".md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(md)
    conn = connect(db_path)
    try:
        ensure_digest_table(conn)
        record_digest_run(conn, now, total)
    finally:
        conn.close()
    return md, path


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--db", default=None, help="SQLite path (default: data/aggregator.db)")
    ap.add_argument("--out-dir", default=None, help="output dir (default: digest/output)")
    args = ap.parse_args(argv)
    md, path = run(args.db, args.out_dir)
    print(md, end="")
    print(f"\n(written to {path})", file=sys.stderr)
    try:
        send_digest(md)
        print("Telegram: digest sent", file=sys.stderr)
    except Exception as e:
        print(f"Telegram delivery FAILED: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
