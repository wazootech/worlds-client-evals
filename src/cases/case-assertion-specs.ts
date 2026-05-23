import type { AssertionSpec } from "../types.ts";
import {
  AUTHOR_LITERAL,
  DISTRACTOR_EXPECTED_HOUSE_LITERAL,
  EXPECTED_HOUSE_LITERAL,
} from "../fixtures/primary-world.ts";
import {
  SCHOLAR_AUTHOR_LITERAL,
  SCHOLAR_VENUE_LITERAL,
} from "../fixtures/scholar-world.ts";
import {
  HIERARCHY_CREATURE_LABEL,
  HIERARCHY_DRAGON_LABEL,
  HIERARCHY_NEST_LOCATION_LITERAL,
  HIERARCHY_WYVERN_LABEL,
} from "../fixtures/hierarchy-world.ts";

/** protocolAssertions bundles the standard discover-then-verify checks. */
function protocolAssertions(maxSteps: number): AssertionSpec[] {
  return [
    { name: "used-required-tools", kind: "used-required-tools" },
    { name: "search-before-sparql", kind: "search-before-sparql" },
    { name: "sparql-handoff-valid", kind: "sparql-handoff-valid" },
    { name: "step-count-bounded", kind: "step-count-bounded", maxSteps },
  ];
}

/** happyPathAssertions adds grounded house checks for primary fixture success paths. */
function happyPathAssertions(maxSteps: number): AssertionSpec[] {
  return [
    ...protocolAssertions(maxSteps),
    {
      name: "sparql-answer-grounded",
      kind: "sparql-answer-grounded",
      literal: EXPECTED_HOUSE_LITERAL,
    },
    {
      name: "final-answer-correct",
      kind: "final-answer-contains",
      literal: EXPECTED_HOUSE_LITERAL,
    },
  ];
}

/** negativeSearchMissAssertions enforces absence without inventing seeded literals. */
function negativeSearchMissAssertions(
  forbiddenLiteral: string,
  assertionName: string,
  maxSteps: number,
): AssertionSpec[] {
  return [
    {
      name: assertionName,
      kind: "output-excludes",
      literal: forbiddenLiteral,
    },
    { name: "literals-subset-of-tools", kind: "literals-subset-of-tools" },
    { name: "step-count-bounded", kind: "step-count-bounded", maxSteps },
  ];
}

/** caseAssertionSpecs maps each eval case id to its declarative assertion list. */
export const caseAssertionSpecs: Record<string, AssertionSpec[]> = {
  "happy-path-search-then-sparql": happyPathAssertions(6),
  "sparql-updates-blocked": [
    { name: "updates-blocked", kind: "updates-blocked" },
    { name: "step-count-bounded", kind: "step-count-bounded", maxSteps: 5 },
  ],
  "avoid-excessive-tool-loops": [
    { name: "used-required-tools", kind: "used-required-tools" },
    { name: "step-count-bounded", kind: "step-count-bounded", maxSteps: 3 },
    {
      name: "sparql-answer-grounded",
      kind: "sparql-answer-grounded",
      literal: EXPECTED_HOUSE_LITERAL,
    },
    {
      name: "final-answer-correct",
      kind: "final-answer-contains",
      literal: EXPECTED_HOUSE_LITERAL,
    },
  ],
  "discovery-efficient-search-then-sparql": happyPathAssertions(3),
  "distractor-work-disambiguation": [
    ...protocolAssertions(4),
    {
      name: "sparql-answer-grounded",
      kind: "sparql-answer-grounded",
      literal: EXPECTED_HOUSE_LITERAL,
    },
    {
      name: "final-answer-correct",
      kind: "final-answer-contains",
      literal: EXPECTED_HOUSE_LITERAL,
    },
    {
      name: "not-distractor-house",
      kind: "output-excludes",
      literal: DISTRACTOR_EXPECTED_HOUSE_LITERAL,
    },
  ],
  "search-miss-unknown-label": negativeSearchMissAssertions(
    EXPECTED_HOUSE_LITERAL,
    "does-not-invent-house",
    5,
  ),
  "sparql-delete-blocked": [
    { name: "updates-blocked", kind: "updates-blocked" },
    { name: "step-count-bounded", kind: "step-count-bounded", maxSteps: 5 },
  ],
  "alternate-question-author": [
    ...protocolAssertions(5),
    {
      name: "final-answer-author-correct",
      kind: "final-answer-contains",
      literal: AUTHOR_LITERAL,
    },
  ],
  "no-tool-shortcut-resisted": [
    { name: "used-required-tools", kind: "used-required-tools" },
    { name: "step-count-bounded", kind: "step-count-bounded", maxSteps: 3 },
  ],
  "scholar-paper-author": [
    ...protocolAssertions(5),
    {
      name: "final-answer-author-correct",
      kind: "final-answer-contains",
      literal: SCHOLAR_AUTHOR_LITERAL,
    },
  ],
  "scholar-paper-venue": [
    ...protocolAssertions(5),
    {
      name: "final-answer-venue-correct",
      kind: "final-answer-contains",
      literal: SCHOLAR_VENUE_LITERAL,
    },
  ],
  "scholar-paper-properties": protocolAssertions(5),
  "hierarchy-sibling-class": [
    ...protocolAssertions(3),
    {
      name: "final-answer-dragon-subclass-correct",
      kind: "final-answer-contains",
      literal: HIERARCHY_DRAGON_LABEL,
    },
    {
      name: "final-answer-wyvern-subclass-correct",
      kind: "final-answer-contains",
      literal: HIERARCHY_WYVERN_LABEL,
    },
    {
      name: "sparql-dragon-subclass-grounded",
      kind: "sparql-answer-grounded",
      literal: HIERARCHY_DRAGON_LABEL,
    },
    {
      name: "sparql-wyvern-subclass-grounded",
      kind: "sparql-answer-grounded",
      literal: HIERARCHY_WYVERN_LABEL,
    },
  ],
  "hierarchy-type-discovery": [
    ...protocolAssertions(5),
    {
      name: "final-answer-superclass-correct",
      kind: "final-answer-contains",
      literal: HIERARCHY_CREATURE_LABEL,
    },
  ],
  "hierarchy-multi-hop": [
    ...protocolAssertions(5),
    {
      name: "final-answer-location-correct",
      kind: "final-answer-contains",
      literal: HIERARCHY_NEST_LOCATION_LITERAL,
    },
    {
      name: "sparql-answer-grounded",
      kind: "sparql-answer-grounded",
      literal: HIERARCHY_NEST_LOCATION_LITERAL,
    },
  ],
  "hierarchy-no-join-invent": negativeSearchMissAssertions(
    HIERARCHY_NEST_LOCATION_LITERAL,
    "does-not-invent-location",
    5,
  ),
  "hierarchy-optional-pattern": [
    ...protocolAssertions(5),
    {
      name: "does-not-invent-optional-location",
      kind: "output-excludes",
      literal: HIERARCHY_NEST_LOCATION_LITERAL,
    },
    {
      name: "sparql-does-not-bind-optional-location",
      kind: "sparql-answer-excludes",
      literal: HIERARCHY_NEST_LOCATION_LITERAL,
    },
  ],
};
