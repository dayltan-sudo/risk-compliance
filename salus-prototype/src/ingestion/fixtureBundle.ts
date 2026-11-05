import type { RawExtraction } from './schema';

import endorsementProperty1 from '../../fixtures/expected/endorsement-property-1.json';
import scheduleMarine3 from '../../fixtures/expected/schedule-marine-3.json';
import slipCyber2 from '../../fixtures/expected/slip-cyber-2.json';
import slipProperty1 from '../../fixtures/expected/slip-property-1.json';
import wordingCyber2 from '../../fixtures/expected/wording-cyber-2.json';

/**
 * The checked-in extraction fixtures, imported rather than read off disk.
 *
 * A serverless bundle is built by tracing static imports; a JSON file read at
 * runtime through a computed path (`join(dirname(import.meta.url), ...)`) is
 * not traced, so on Vercel the directory is absent and ingestion throws. These
 * imports make the fixtures part of the build output.
 */
export const bundledFixtures: Record<string, RawExtraction> = {
  'endorsement-property-1': endorsementProperty1 as RawExtraction,
  'schedule-marine-3': scheduleMarine3 as RawExtraction,
  'slip-cyber-2': slipCyber2 as RawExtraction,
  'slip-property-1': slipProperty1 as RawExtraction,
  'wording-cyber-2': wordingCyber2 as RawExtraction,
};

export const bundledFixtureNames: string[] = Object.keys(bundledFixtures).sort();
