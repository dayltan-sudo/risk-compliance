# News Aggregator

Risk & Compliance news aggregator. A standalone pipeline that feeds:

- a scheduled digest
- a queryable SQLite store
- a future generic feed for other projects in this repo

There is no API layer yet.

## v1 sources

- MAS enforcement actions and news pages (scrape + diff)
- OpenSanctions consolidated dataset, covering OFAC / UN / UK / SG sanctions
- OpenSanctions `sg_terrorists` and `sg_mas_enforcement_actions` datasets
- moneylaundering.einnews.com RSS
- feed.sanctionsexpert.com RSS

## Data model

See [SCHEMA.md](SCHEMA.md).

## Layout

- `collector/`: source fetchers
- `storage/`: SQLite store
- `digest/`: digest generation
- `cron/`: scheduled run scripts
- `tests/`: test harness

## Status

Collector + storage implemented (`python3 collector/run_all.py`). Digest formatter and cron wiring not built yet.
