#!/usr/bin/env bash
# Collect, then build + deliver the digest. Exits non-zero if either step fails outright.
set -euo pipefail
cd "$(dirname "$0")/.."
source .venv/bin/activate
python3 collector/run_all.py
python3 digest/run_digest.py
