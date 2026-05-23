import type { Client } from "@worlds/client";
import { createSeededWorldClient } from "./primary-world.ts";
import { createSeededScholarWorldClient } from "./scholar-world.ts";
import { createSeededHierarchyWorldClient } from "./hierarchy-world.ts";

/** fixtureIds lists every seeded world identifier registered for eval cases. */
export const fixtureIds = ["primary", "scholar", "hierarchy"] as const;

/** FixtureId identifies a registered seeded world factory. */
export type FixtureId = (typeof fixtureIds)[number];

/** fixturesById maps fixture id to an async factory that returns a seeded world client. */
export const fixturesById: Record<FixtureId, () => Promise<Client>> = {
  primary: createSeededWorldClient,
  scholar: createSeededScholarWorldClient,
  hierarchy: createSeededHierarchyWorldClient,
};

/** resolveFixture returns the world client factory for a given fixture id. */
export function resolveFixture(
  fixtureId?: FixtureId | string,
): () => Promise<Client> {
  const resolvedFixtureId = (fixtureId ?? "primary") as FixtureId;
  const factory = fixturesById[resolvedFixtureId];
  if (!factory) {
    throw new Error(
      `Unknown fixtureId: "${fixtureId}". Available fixtures: ${
        fixtureIds.join(", ")
      }`,
    );
  }
  return factory;
}
