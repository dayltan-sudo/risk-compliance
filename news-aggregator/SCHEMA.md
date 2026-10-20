# R&C News Aggregator — Data Schema (draft for review)

Status: DRAFT, pending your sign-off before this becomes the Claude Code build brief.
Repo: dayltan-sudo/risk-compliance, subfolder: news-aggregator/

## Design constraint

Must stay source-agnostic and consumer-agnostic (per 2026-10-19 decisions):
- generic enough that Sentinel/Atlas/credit-assessment could consume it later without a schema change
- one table/model, not per-source tables, so the digest/query/feed logic doesn't special-case sources

## Core table: `items`

| field          | type          | notes |
|----------------|---------------|-------|
| id             | TEXT (PK)     | sha256(source_id + canonical_url or natural key) — stable dedupe key |
| source         | TEXT          | enum: `mas_enforcement`, `mas_news`, `opensanctions_consolidated`, `opensanctions_sg_terrorists`, `opensanctions_sg_mas_enforcement`, `einnews_aml`, `sanctionsexpert` |
| source_type    | TEXT          | enum: `regulatory_page`, `sanctions_list`, `news_rss` — lets digest/query group without knowing every source |
| regulator      | TEXT, nullable| e.g. `MAS`, `OFAC`, `UN`, `UK-OFSI`, `null` for general news |
| jurisdiction   | TEXT, nullable| ISO country code or `GLOBAL`, e.g. `SG`, `US`, `GB`, `GLOBAL` |
| category       | TEXT          | enum: `enforcement_action`, `sanctions_designation`, `sanctions_delisting`, `circular_notice`, `news` |
| title          | TEXT          | |
| summary        | TEXT, nullable| short summary if source provides one; else null, filled later by digest formatter if needed |
| url            | TEXT          | canonical source URL |
| published_at   | TIMESTAMP     | source's stated date; fall back to `first_seen_at` if source has none |
| first_seen_at  | TIMESTAMP     | when our collector first saw it (always set, used for "new since last run") |
| raw_payload    | TEXT (JSON)   | the original scraped/parsed record, untouched — so we can re-derive fields later without re-scraping |
| entity_names   | TEXT (JSON array), nullable | for sanctions items: names of designated persons/entities, if present — this is the field Sentinel-style consumers would actually want |

## Dedupe

- Primary key `id` = `sha256(source + natural_key)`.
  - natural_key for regulatory pages / news = canonical URL
  - natural_key for OpenSanctions bulk datasets = their own entity/record ID (stable across daily refreshes)
- Collector does an upsert: if `id` exists, update `raw_payload`/`summary` if changed, never duplicate.
- "New since last digest" = `first_seen_at` > last digest run timestamp, not `published_at` (sources backdate).

## Secondary table: `collector_runs`

| field        | type      | notes |
|--------------|-----------|-------|
| id           | INTEGER PK autoincrement | |
| source       | TEXT      | which collector ran |
| started_at   | TIMESTAMP | |
| finished_at  | TIMESTAMP, nullable | null if crashed |
| items_seen   | INTEGER   | |
| items_new    | INTEGER   | |
| error        | TEXT, nullable | |

Purpose: diagnosing a silent source failure (e.g. OpenSanctions changes its file format) without digging through logs, and the "owner approve cron schedule" task will want this to judge frequency.

## Storage choice

SQLite file on disk (per 2026-10-19 decision: DB-on-disk, no API). Two tables above. Direct query = `sqlite3` CLI or a thin Python helper module for the digest/feed code to import — no HTTP layer.

## Decisions (confirmed 2026-10-20)

1. `entity_names` stays a JSON array in-row for v1 (no normalized `entities` table). Revisit only if a real consumer needs name-level queries.
2. No free-text `tags` field for v1. Items that don't cleanly fit the `category` enum default to `news`. Revisit only if miscategorization proves to be a real problem once real digests are reviewed.
3. Retention: keep every item (including `raw_payload`) forever. No age-out job.

SCHEMA FINAL — ready to hand to Claude Code as the build brief.
