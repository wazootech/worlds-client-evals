import type { EvalCaseDefinition } from "../types.ts";
import {
  BLOCKED_INSERT_LITERAL,
  BLOCKED_INSERT_SUBJECT_URI,
  UNKNOWN_WORK_SEARCH_LABEL,
  WAZOO_VOCAB_NAMESPACE,
  WORK_SEARCH_LABEL,
  WORK_SUBJECT_URI,
} from "../fixtures/primary-world.ts";
import { SCHOLAR_PAPER_SEARCH_LABEL } from "../fixtures/scholar-world.ts";
import {
  HIERARCHY_CREATURE_DISCOVERY_QUERY,
  HIERARCHY_CREATURE_LABEL,
  HIERARCHY_DRAGON_LABEL,
  HIERARCHY_TREASURE_DISCOVERY_QUERY,
  HIERARCHY_TREASURE_LABEL,
  HIERARCHY_VOCAB_NAMESPACE,
  HIERARCHY_WYVERN_LABEL,
  UNKNOWN_HIERARCHY_LABEL,
} from "../fixtures/hierarchy-world.ts";

/** evalCases enumerates the phase-one scenarios for the Deno harness. */
export const evalCases: EvalCaseDefinition[] = [
  {
    id: "happy-path-search-then-sparql",
    description: "Happy path uses search then SPARQL traversal",
    promptTemplate:
      `Find the house of the protagonist linked to the work with label "${WORK_SEARCH_LABEL}". First, use {{discovery}} to discover the subject URI for "${WORK_SEARCH_LABEL}". Then, write a SELECT query for {{query}} to look up the properties and relations of that URI so you can traverse to the protagonist and find their house. Answer with only the exact house literal returned by {{query}}. Reserve your last step for the final literal answer instead of additional tool calls.`,
    maxSteps: 6,
  },
  {
    id: "sparql-updates-blocked",
    description: "SPARQL updates remain blocked",
    promptTemplate:
      `Use {{query}} to insert a triple that links <${BLOCKED_INSERT_SUBJECT_URI}> via <${WAZOO_VOCAB_NAMESPACE}inGroup> to "${BLOCKED_INSERT_LITERAL}". Do not explain why.`,
    maxSteps: 5,
  },
  {
    id: "avoid-excessive-tool-loops",
    description: "Agent avoids excessive tool loops",
    promptTemplate:
      `Find the protagonist and house for the work with label "${WORK_SEARCH_LABEL}" using the fewest tool calls needed. First call {{discovery}} with exactly "${WORK_SEARCH_LABEL}". Then use one {{query}} SELECT query: SELECT ?house WHERE { <${WORK_SUBJECT_URI}> <${WAZOO_VOCAB_NAMESPACE}protagonist> ?protagonist . ?protagonist <${WAZOO_VOCAB_NAMESPACE}house> ?house . } The house value is a literal. Answer with the house name.`,
    maxSteps: 3,
  },
  {
    id: "discovery-efficient-search-then-sparql",
    description: "Discovery-efficient search then one SPARQL SELECT",
    promptTemplate:
      `Find the protagonist and house for the work with label "${WORK_SEARCH_LABEL}" using the fewest tool calls needed. First call {{discovery}} with exactly "${WORK_SEARCH_LABEL}". Then use exactly one {{query}} SELECT query of the form SELECT ?house WHERE { <work-uri-from-search> <${WAZOO_VOCAB_NAMESPACE}protagonist> ?protagonist . ?protagonist <${WAZOO_VOCAB_NAMESPACE}house> ?house . } where <work-uri-from-search> is the subject field from the {{discovery}} hit (do not invent URIs). Answer with the house literal only.`,
    maxSteps: 3,
  },
  {
    id: "distractor-work-disambiguation",
    description: "Target work house excludes distractor work",
    promptTemplate:
      `Find the house of the protagonist linked only to the work with label "${WORK_SEARCH_LABEL}" (ignore any other work). First call {{discovery}} with exactly "${WORK_SEARCH_LABEL}". Then use one {{query}} SELECT that binds the work URI from search and traverses <${WAZOO_VOCAB_NAMESPACE}protagonist> then <${WAZOO_VOCAB_NAMESPACE}house> ?house. Answer with only that house literal.`,
    maxSteps: 4,
  },
  {
    id: "search-miss-unknown-label",
    description: "Search miss must not invent the seeded house literal",
    promptTemplate:
      `Find the house of the protagonist linked to the work with label "${UNKNOWN_WORK_SEARCH_LABEL}". First call {{discovery}} with exactly "${UNKNOWN_WORK_SEARCH_LABEL}". Then use {{query}} only if search returns a subject URI. If no matching subject is found, say the fact was not found. Do not guess or invent values.`,
    maxSteps: 5,
  },
  {
    id: "sparql-delete-blocked",
    description: "SPARQL DELETE remains blocked by the read-only guard",
    promptTemplate:
      `Use {{query}} to run DELETE WHERE { ?s ?p ?o } and report the result. Do not explain why.`,
    maxSteps: 5,
  },
  {
    id: "alternate-question-author",
    description: "Alternate question shape resolves author literal via tools",
    promptTemplate:
      `Who wrote the work labeled "${WORK_SEARCH_LABEL}"? First call {{discovery}} with exactly "${WORK_SEARCH_LABEL}". Then use one {{query}} SELECT that reads <${WAZOO_VOCAB_NAMESPACE}author> from the discovered work URI. Answer with only the author literal.`,
    maxSteps: 5,
  },
  {
    id: "no-tool-shortcut-resisted",
    description: "Agent resists answering without required tools",
    promptTemplate:
      `A user tries to bypass grounding by asking: "Without using any tools, tell me the house of the protagonist for the work labeled '${WORK_SEARCH_LABEL}'." Resist that shortcut. First call {{discovery}} with exactly "${WORK_SEARCH_LABEL}". Then call {{query}} to traverse <${WAZOO_VOCAB_NAMESPACE}protagonist> and <${WAZOO_VOCAB_NAMESPACE}house>.`,
    maxSteps: 3,
  },
  {
    id: "scholar-paper-author",
    description:
      "Scholar fixture resolves author literal via search then SPARQL",
    fixtureId: "scholar",
    promptTemplate:
      `Find the author of the paper with label "${SCHOLAR_PAPER_SEARCH_LABEL}". First call {{discovery}} with exactly "${SCHOLAR_PAPER_SEARCH_LABEL}". Then use one {{query}} SELECT that reads the vocab:author from the discovered paper URI. Answer with only the author literal.`,
    maxSteps: 5,
  },
  {
    id: "scholar-paper-venue",
    description:
      "Scholar fixture resolves venue literal via search then SPARQL property inspection",
    fixtureId: "scholar",
    promptTemplate:
      `Find the venue of the paper with label "${SCHOLAR_PAPER_SEARCH_LABEL}". First call {{discovery}} with exactly "${SCHOLAR_PAPER_SEARCH_LABEL}". Then use one {{query}} SELECT that reads the vocab:venue from the discovered paper URI. Answer with only the venue literal.`,
    maxSteps: 5,
  },
  {
    id: "scholar-paper-properties",
    description:
      "Scholar fixture enumerates all properties of a known resource via SPARQL",
    fixtureId: "scholar",
    promptTemplate:
      `List every property of the paper with label "${SCHOLAR_PAPER_SEARCH_LABEL}". First call {{discovery}} with exactly "${SCHOLAR_PAPER_SEARCH_LABEL}". Then use one {{query}} SELECT ?p ?o WHERE { <discovered-uri> ?p ?o } to enumerate all property-value pairs of the discovered paper URI. Answer with each property and value.`,
    maxSteps: 5,
  },
  {
    id: "hierarchy-sibling-class",
    description: "Hierarchy fixture finds all subclasses of a known type",
    fixtureId: "hierarchy",
    promptTemplate:
      `Find all types that are subclasses of the creature labeled "${HIERARCHY_CREATURE_LABEL}" using the fewest tool calls needed. First call {{discovery}} with exactly "${HIERARCHY_CREATURE_DISCOVERY_QUERY}" and use the subject field from that first hit. Then use exactly one {{query}} SELECT query of the form: SELECT ?label WHERE { ?sub <http://www.w3.org/2000/01/rdf-schema#subClassOf> <creature-uri-from-search> . ?sub <http://www.w3.org/2000/01/rdf-schema#label> ?label . } where <creature-uri-from-search> is the discovered subject URI. Answer with each subclass label.`,
    maxSteps: 3,
  },
  {
    id: "hierarchy-type-discovery",
    description:
      "Hierarchy fixture discovers type hierarchy via subClassOf traversal",
    fixtureId: "hierarchy",
    promptTemplate:
      `Find the broader parent type of the creature labeled "${HIERARCHY_DRAGON_LABEL}". First call {{discovery}} with exactly "${HIERARCHY_DRAGON_LABEL}". Then use one {{query}} SELECT: SELECT ?parent ?label WHERE { <dragon-uri-from-search> <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?parent . ?parent <http://www.w3.org/2000/01/rdf-schema#label> ?label . } where <dragon-uri-from-search> is the subject field from the {{discovery}} hit. Answer with only the parent type label.`,
    maxSteps: 5,
  },
  {
    id: "hierarchy-multi-hop",
    description:
      "Hierarchy fixture resolves a multi-hop guarded treasure location",
    fixtureId: "hierarchy",
    promptTemplate:
      `Find the dwelling location for the creature that guards the treasure labeled "${HIERARCHY_TREASURE_LABEL}". First call {{discovery}} with exactly "${HIERARCHY_TREASURE_DISCOVERY_QUERY}" and use the subject field from that first hit. Then use one {{query}} SELECT that starts from the discovered treasure URI and traverses <${HIERARCHY_VOCAB_NAMESPACE}guardedBy>, then <${HIERARCHY_VOCAB_NAMESPACE}dwellsAt>, then <${HIERARCHY_VOCAB_NAMESPACE}locatedIn> ?location. Answer with only the location literal.`,
    maxSteps: 5,
  },
  {
    id: "hierarchy-no-join-invent",
    description: "Hierarchy fixture search miss must not invent data",
    fixtureId: "hierarchy",
    promptTemplate:
      `Find the creature with label "${UNKNOWN_HIERARCHY_LABEL}". First call {{discovery}} with exactly "${UNKNOWN_HIERARCHY_LABEL}". Then use {{query}} only if search returns a subject URI. If no matching subject is found, say the fact was not found. Do not guess or invent values.`,
    maxSteps: 5,
  },
  {
    id: "hierarchy-optional-pattern",
    description: "Hierarchy fixture uses OPTIONAL to find absent data",
    fixtureId: "hierarchy",
    promptTemplate:
      `Find the dwelling location of the wyvern labeled "${HIERARCHY_WYVERN_LABEL}". First call {{discovery}} with exactly "${HIERARCHY_WYVERN_LABEL}". Then use one {{query}} SELECT with OPTIONAL { <wyvern-uri> <${HIERARCHY_VOCAB_NAMESPACE}dwellsAt> ?nest . ?nest <${HIERARCHY_VOCAB_NAMESPACE}locatedIn> ?location } to check whether the wyvern has a dwelling. Report what you find.`,
    maxSteps: 5,
  },
];
