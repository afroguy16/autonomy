// Unified application data shape (merged designer + CPM model).
// Field comments describe how CPM fields map in; see normalize.ts.

export type NodeType = "person" | "organization" | "agent";

export type Confidence = "high" | "medium" | "low";

export type EdgeKind =
  | "engagement" // X reply/quote discovery path; not collaboration by itself
  | "affiliation"
  | "built"
  | "collaboration"
  | "shared_topic"
  | "cluster"; // Retained for existing data; don't create until its meaning is defined

export type GraphMap = {
  meta: {
    name: string;
    version: number;
    updated: string;
    is_sample?: boolean;
    confidence_levels?: Partial<Record<Confidence, string>>;
    legend?: Record<NodeType, string>;

    // Research process state from the CPM shape.
    seeds?: string[];
    expanded?: string[];
    frozen?: string[];
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
  id: string;
  url: string; // Can be an X post, project page, paper, etc.
  title?: string;
  publisher?: string;
  date?: string;
  accessed?: string;
};

export type Node = {
  id: string; // Stable account ID, usually the handle without "@"
  type: NodeType; // CPM "human" maps to "person"; "org" maps to "organization"
  handle?: string; // CPM account handle
  name?: string; // Designer's display name; CPM's "label" maps here
  profiles: {
    x?: string | null;
    linkedin?: string | null;
  };
  avatarUrl?: string;

  summary?: string; // What this account builds or why its work matters
  notes?: string; // Research notes; kept separate from the public-facing summary
  primary_topic?: string;
  topics: string[];
  projects: Project[];

  inclusion_source_ids: string[]; // Evidence for including this account in the map
  claims: Claim[]; // Sources for specific statements about the account
  confidence?: Confidence | null;
  confidence_note?: string | null;
  added_at?: string;
};

export type Project = {
  id: string;
  name: string;
  description?: string;
  url?: string;
  source_ids: string[];
};

export type Claim = {
  field: string; // For example, "summary" or "role"
  source_ids: string[];
};

export type Edge = {
  id: string;
  source: string; // CPM "from" maps here
  target: string; // CPM "to" maps here
  kind: EdgeKind; // CPM "kind" maps here; includes the new "engagement" kind
  label?: string;
  detail?: string | null;
  period?: {
    start?: string | null;
    end?: string | null;
  } | null;
  project_id?: string;
  topic_ids?: string[];

  source_ids: string[]; // CPM evidence URLs become source records referenced here
  confidence?: Confidence | null;
  note?: string | null;
};

export const NODE_TYPES: NodeType[] = ["person", "organization", "agent"];
export const EDGE_KINDS: EdgeKind[] = ["engagement", "affiliation", "built", "collaboration", "shared_topic", "cluster"];
