export type SourceEntry           = { type: "source";    source_id: string };
export type SnapshotEntry         = { type: "snapshot";  sync_id:   string };
export type DirectoryEntry        = { type: "directory"; sync_id:   string; prefix: string };
export type FileEntry             = { type: "file";      file_id:   string };
export type CommunityEntry        = { type: "community"; cache_key: string; community_index: number };
export type NodeNeighborhoodEntry = {
  type: "node_neighborhood";
  node_id:    string;
  depth:      1 | 2 | 3;
  edge_types: ("DEPENDS_ON" | "CALLS" | "USED_BY")[];
};

export type Entry =
  | SourceEntry | SnapshotEntry | DirectoryEntry
  | FileEntry   | CommunityEntry | NodeNeighborhoodEntry;

export type ThreadContext = {
  entries:   Entry[];
  frozen_at: string | null;
};

export type ChatSettings = {
  history_turns: number;
};
