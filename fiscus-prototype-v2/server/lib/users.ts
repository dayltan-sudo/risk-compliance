import { USERS } from "../../src/data/users.js";

export function findUser(userId: unknown) {
  return typeof userId === "string" ? USERS.find((u) => u.id === userId) : undefined;
}
