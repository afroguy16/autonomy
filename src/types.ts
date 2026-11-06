// Unified application shape. The CPM's richer research model stays intact in
// its source file; normalize.ts maps its records into this viewer contract.

export type NodeType = "person" | "organization" | "agent";

export type EdgeKind =
  | "interaction" // X reply/quote discovery path; not collaboration by itself
  | "affiliation"
  | "built"
  | "collaboration"
  | "shared_topic"
  | "cluster" // Retained without a visual interpretation until defined
  | "bridge"; // Retained from the research model; not drawn until defined

export type GraphMap = {
  meta: {
    name: string;
    version: number;
    updated: string;
    is_sample?: boolean;
    legend?: Record<NodeType, string>;
  };
  topics: Topic[];
  sources: Source[];
  nodes: Node[];
  edges: Edge[];
};

export type Topic = {
  id: string;
  label: string;
  description?: string;
};

export type Source = {
  id: string; // Stable URL identifier; note and edge references must keep resolving
  url: string;
  title?: string;
  publisher?: string;
  date?: string;
  accessed?: string;
};

export type Node = {
  id: string; // Stable account ID, usually the handle without "@"
  type: NodeType;
  handle?: string;
  name?: string;
  profiles: {
    x?: string | null;
    linkedin?: string | null;
  };
  avatarUrl?: string;

  summary?: string;
  notes: string; // Researcher's account-selection note
  note_source_ids: string[]; // URLs supporting this note, attached to the note
  primary_topic?: string;
  topics: string[];
  projects: Project[];
  claims: Claim[];
  incomplete?: true;
  missing?: string[];
};

export type Project = {
  id: string;
  name: string;
  description?: string;
  url?: string;
  source_ids: string[];
};

export type Claim = {
  field: string;
  source_ids: string[];
};

export type Edge = {
  id: string; // Stable identity; parallel edges remain independently addressable
  source: string;
  target: string;
  kind: EdgeKind;
  label?: string;
  detail?: string | null;
  period?: {
    start?: string | null;
    end?: string | null;
  } | null;
  project_id?: string;
  topic_ids?: string[];

  source_ids: string[]; // Sources supporting this specific interaction/relationship
  incomplete?: true;
  missing?: string[];
  pendingDefinition?: true;
};

export const NODE_TYPES: NodeType[] = ["person", "organization", "agent"];
// Only defined relationship kinds are filterable/drawable; legacy cluster and
// research bridge records remain in the data until their visual meaning is set.
export const EDGE_KINDS: EdgeKind[] = ["interaction", "affiliation", "built", "collaboration", "shared_topic"];
