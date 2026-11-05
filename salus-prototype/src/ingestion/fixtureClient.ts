import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ExtractionClient, ExtractionRequest } from './client';
import { bundledFixtureNames, bundledFixtures } from './fixtureBundle';
import { rawExtractionSchema, type RawExtraction } from './schema';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

/** `fixtures/expected` next to `src/`, so the client works from any cwd. */
export const DEFAULT_FIXTURE_DIR = join(MODULE_DIR, '..', '..', 'fixtures', 'expected');

export interface FixtureClientOptions {
  /** Directory containing `<documentId>.json` files. Omit to use the bundled fixtures. */
  expectedDir?: string;
}

function listFixtureNames(dir: string): string[] {
  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => entry.slice(0, -'.json'.length))
    .sort();
}

function resolveName(documentId: string, available: string[]): string {
  const clean = documentId.trim().replace(/\.json$/i, '');
  const candidates = clean.startsWith('doc-') ? [clean, clean.slice('doc-'.length)] : [clean];
  const name = candidates.find((candidate) => available.includes(candidate));

  if (name === undefined) {
    throw new Error(
      `fixtureExtractionClient: no fixture for document "${documentId}". Available fixtures: ${available.join(', ')}`,
    );
  }

  return name;
}

function parseFixture(json: unknown, source: string): RawExtraction {
  const parsed = rawExtractionSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `fixtureExtractionClient: fixture ${source} does not match the extraction schema: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

/**
 * Replays the checked-in `fixtures/expected` extraction for a document id.
 *
 * This exists so the demo can run the whole pipeline without a model key. It is
 * opt-in: nothing constructs it automatically and there is no fallback to it
 * from `openAiExtractionClient` or the routes. An unknown id throws with the
 * list of fixtures that do exist, rather than quietly returning an empty
 * document or another fixture's fields.
 *
 * By default the fixtures are the statically imported bundle, so this works in
 * a serverless bundle where `fixtures/` is not on disk. Pass `expectedDir` to
 * read a directory instead.
 */
export function fixtureExtractionClient(options: FixtureClientOptions = {}): ExtractionClient {
  const expectedDir = options.expectedDir;
  const bundled = expectedDir === undefined;

  if (!bundled && (!existsSync(expectedDir) || !statSync(expectedDir).isDirectory())) {
    throw new Error(`fixtureExtractionClient: expected fixture directory not found: ${expectedDir}`);
  }

  const available = bundled ? bundledFixtureNames : listFixtureNames(expectedDir);
  if (available.length === 0) {
    throw new Error(
      bundled
        ? 'fixtureExtractionClient: no bundled fixtures'
        : `fixtureExtractionClient: no .json fixtures in ${expectedDir}`,
    );
  }

  const cache = new Map<string, RawExtraction>();

  function load(documentId: string): RawExtraction {
    const name = resolveName(documentId, available);

    const cached = cache.get(name);
    if (cached !== undefined) return structuredClone(cached);

    let loaded: RawExtraction;
    if (bundled) {
      loaded = parseFixture(structuredClone(bundledFixtures[name]), `bundle:${name}`);
    } else {
      const path = join(expectedDir as string, `${name}.json`);
      let json: unknown;
      try {
        json = JSON.parse(readFileSync(path, 'utf8'));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`fixtureExtractionClient: could not read fixture ${path}: ${reason}`);
      }
      loaded = parseFixture(json, path);
    }

    cache.set(name, loaded);
    return structuredClone(loaded);
  }

  return {
    async extract(req: ExtractionRequest): Promise<unknown> {
      return load(req.documentId);
    },
  };
}
