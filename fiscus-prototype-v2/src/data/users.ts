import type { User } from "../types.js";

// Kept apart from seed.ts so the server can resolve actors without importing
// the seed dataset (which runs the scoring engine at module load).
export const USERS: User[] = [
  { id: "u-alice", name: "Alice Chen" },
  { id: "u-ben", name: "Ben Osei" },
  { id: "u-priya", name: "Priya Nair" },
];
export const DEFAULT_USER_ID = "u-alice";
