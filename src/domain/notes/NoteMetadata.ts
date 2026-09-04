export const NOTE_METADATA_FIELDS = [
  "frontmatter",
  "tags",
  "aliases",
  "headings",
  "embeds",
  "listItems",
  "sections",
  "links",
  "backlinks",
] as const;

export type NoteMetadataField = (typeof NOTE_METADATA_FIELDS)[number];

export const VAULT_LINK_FIELDS = ["resolvedLinks", "unresolvedLinks"] as const;

export type VaultLinkField = (typeof VAULT_LINK_FIELDS)[number];

export interface NoteHeading {
  heading: string;
  level: number;
  line: number;
}

export interface NoteRef {
  link: string;
  path?: string;
  displayText?: string;
  line?: number;
  key?: string;
}

export interface NoteListItem {
  line: number;
  parentLine: number | null;
  task?: string;
  id?: string;
}

export interface NoteSection {
  type: string;
  line: number;
  id?: string;
}

export interface NoteMetadata {
  path: string;
  frontmatter?: Record<string, unknown>;
  tags?: string[];
  aliases?: string[];
  headings?: NoteHeading[];
  embeds?: NoteRef[];
  listItems?: NoteListItem[];
  sections?: NoteSection[];
  links?: NoteRef[];
  backlinks?: NoteRef[];
}

export interface VaultLinkSource {
  path: string;
  links: Record<string, number>;
}

export interface VaultLinks {
  resolvedLinks?: VaultLinkSource[];
  unresolvedLinks?: VaultLinkSource[];
  truncated: boolean;
}

export interface VaultLinksQuery {
  fields: VaultLinkField[];
  path?: string;
  limit: number;
}

export interface NoteMetadataIndex {
  getNoteMetadata(path: string, fields: NoteMetadataField[]): Promise<NoteMetadata>;
  getVaultLinks(query: VaultLinksQuery): Promise<VaultLinks>;
}
