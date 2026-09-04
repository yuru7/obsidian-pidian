import {
  NOTE_METADATA_FIELDS,
  VAULT_LINK_FIELDS,
  type NoteHeading,
  type NoteListItem,
  type NoteMetadata,
  type NoteMetadataField,
  type NoteRef,
  type NoteSection,
  type VaultLinkField,
  type VaultLinkSource,
  type VaultLinks,
} from "../domain/notes/NoteMetadata";
import { isRestrictedVaultPath, normalizeNotePath } from "./notePath";

export const VAULT_LINKS_DEFAULT_LIMIT = 200;
export const VAULT_LINKS_MAX_LIMIT = 2000;

export const DEFAULT_NOTE_METADATA_FIELDS: NoteMetadataField[] = [...NOTE_METADATA_FIELDS];
export const DEFAULT_VAULT_LINK_FIELDS: VaultLinkField[] = [...VAULT_LINK_FIELDS];

export interface CacheLoc {
  line: number;
}

export interface CachePos {
  start: CacheLoc;
}

export interface CacheRef {
  link: string;
  displayText?: string;
  path?: string | null;
  key?: string;
  position?: CachePos;
}

export interface CacheTag {
  tag: string;
}

export interface CacheHeading {
  heading: string;
  level: number;
  position: CachePos;
}

export interface CacheListItem {
  id?: string;
  task?: string;
  parent: number;
  position: CachePos;
}

export interface CacheSection {
  id?: string;
  type: string;
  position: CachePos;
}

export interface NoteCacheInput {
  frontmatter?: Record<string, unknown>;
  tags?: CacheTag[];
  headings?: CacheHeading[];
  embeds?: CacheRef[];
  listItems?: CacheListItem[];
  sections?: CacheSection[];
  links?: CacheRef[];
  frontmatterLinks?: CacheRef[];
}

export function parseFieldList<T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[],
): T[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array of strings.`);
  }
  const allowedSet = new Set<string>(allowed);
  const selected: T[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !allowedSet.has(item)) {
      const shown = typeof item === "string" ? `: ${item}` : "";
      throw new Error(`${name} contains an unknown value${shown}. Allowed: ${allowed.join(", ")}.`);
    }
    if (!seen.has(item)) {
      seen.add(item);
      selected.push(item as T);
    }
  }
  return selected;
}

export function parseNoteMetadataFields(value: unknown): NoteMetadataField[] {
  return parseFieldList(value, "fields", NOTE_METADATA_FIELDS) ?? DEFAULT_NOTE_METADATA_FIELDS;
}

export function parseVaultLinkFields(value: unknown): VaultLinkField[] {
  return parseFieldList(value, "fields", VAULT_LINK_FIELDS) ?? DEFAULT_VAULT_LINK_FIELDS;
}

export function parsePositiveInt(value: unknown, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

export function parseVaultLinksLimit(value: unknown): number {
  const limit = parsePositiveInt(value, "limit") ?? VAULT_LINKS_DEFAULT_LIMIT;
  return Math.min(limit, VAULT_LINKS_MAX_LIMIT);
}

export function buildNoteMetadata(
  path: string,
  cache: NoteCacheInput | null,
  backlinks: CacheRef[],
  fields: NoteMetadataField[],
): NoteMetadata {
  const wanted = new Set(fields);
  const result: NoteMetadata = { path };
  const snapshot = cache ?? {};

  if (wanted.has("frontmatter")) {
    result.frontmatter = jsonSafeRecord(snapshot.frontmatter);
  }
  if (wanted.has("tags")) {
    result.tags = collectTags(snapshot);
  }
  if (wanted.has("aliases")) {
    result.aliases = aliasesFromFrontmatter(snapshot.frontmatter);
  }
  if (wanted.has("headings")) {
    result.headings = (snapshot.headings ?? []).map(toHeading);
  }
  if (wanted.has("embeds")) {
    result.embeds = (snapshot.embeds ?? []).map((ref) => toRef(ref));
  }
  if (wanted.has("listItems")) {
    result.listItems = (snapshot.listItems ?? []).map(toListItem);
  }
  if (wanted.has("sections")) {
    result.sections = (snapshot.sections ?? []).map(toSection);
  }
  if (wanted.has("links")) {
    result.links = [
      ...(snapshot.links ?? []).map((ref) => toRef(ref)),
      ...(snapshot.frontmatterLinks ?? []).map((ref) => toRef(ref)),
    ];
  }
  if (wanted.has("backlinks")) {
    result.backlinks = backlinks.map((ref) => toRef(ref));
  }
  return result;
}

export function buildVaultLinks(
  resolvedLinks: Record<string, Record<string, number>>,
  unresolvedLinks: Record<string, Record<string, number>>,
  query: { fields: VaultLinkField[]; path?: string; limit: number },
): VaultLinks {
  const wanted = new Set(query.fields);
  const prefix = query.path ? normalizeNotePath(query.path) : "";
  const sources = collectSourcePaths(
    wanted.has("resolvedLinks") ? resolvedLinks : {},
    wanted.has("unresolvedLinks") ? unresolvedLinks : {},
    prefix,
  );
  const truncated = sources.length > query.limit;
  const kept = sources.slice(0, query.limit);
  const result: VaultLinks = { truncated };
  if (wanted.has("resolvedLinks")) {
    result.resolvedLinks = projectLinkMap(resolvedLinks, kept);
  }
  if (wanted.has("unresolvedLinks")) {
    result.unresolvedLinks = projectLinkMap(unresolvedLinks, kept);
  }
  return result;
}

function collectSourcePaths(
  resolvedLinks: Record<string, Record<string, number>>,
  unresolvedLinks: Record<string, Record<string, number>>,
  prefix: string,
): string[] {
  const sources = new Set<string>();
  for (const path of Object.keys(resolvedLinks)) {
    if (includeSource(path, prefix)) {
      sources.add(path);
    }
  }
  for (const path of Object.keys(unresolvedLinks)) {
    if (includeSource(path, prefix)) {
      sources.add(path);
    }
  }
  return [...sources].sort((a, b) => a.localeCompare(b));
}

function includeSource(path: string, prefix: string): boolean {
  if (isRestrictedVaultPath(path)) {
    return false;
  }
  if (!prefix) {
    return true;
  }
  return path === prefix || path.startsWith(`${prefix}/`);
}

function projectLinkMap(
  map: Record<string, Record<string, number>>,
  sources: string[],
): VaultLinkSource[] {
  const entries: VaultLinkSource[] = [];
  for (const path of sources) {
    const links = map[path];
    if (!links || Object.keys(links).length === 0) {
      continue;
    }
    entries.push({ path, links: { ...links } });
  }
  return entries;
}

function toHeading(heading: CacheHeading): NoteHeading {
  return {
    heading: heading.heading,
    level: heading.level,
    line: toLine(heading.position),
  };
}

function toListItem(item: CacheListItem): NoteListItem {
  const result: NoteListItem = {
    line: toLine(item.position),
    parentLine: item.parent >= 0 ? item.parent + 1 : null,
  };
  if (item.task !== undefined) {
    result.task = item.task;
  }
  if (item.id) {
    result.id = item.id;
  }
  return result;
}

function toSection(section: CacheSection): NoteSection {
  const result: NoteSection = {
    type: section.type,
    line: toLine(section.position),
  };
  if (section.id) {
    result.id = section.id;
  }
  return result;
}

function toRef(ref: CacheRef): NoteRef {
  const result: NoteRef = { link: ref.link };
  if (ref.path) {
    result.path = ref.path;
  }
  if (ref.displayText) {
    result.displayText = ref.displayText;
  }
  if (ref.position) {
    result.line = toLine(ref.position);
  }
  if (ref.key) {
    result.key = ref.key;
  }
  return result;
}

function toLine(position: CachePos): number {
  return position.start.line + 1;
}

function collectTags(cache: NoteCacheInput): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  const add = (tag: string): void => {
    const normalized = tag.startsWith("#") ? tag : `#${tag}`;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      tags.push(normalized);
    }
  };
  for (const tag of stringListFromFrontmatter(cache.frontmatter, ["tag", "tags"])) {
    add(tag);
  }
  for (const entry of cache.tags ?? []) {
    if (entry.tag) {
      add(entry.tag);
    }
  }
  return tags;
}

export function aliasesFromFrontmatter(frontmatter: Record<string, unknown> | undefined): string[] {
  return stringListFromFrontmatter(frontmatter, ["alias", "aliases"]);
}

function stringListFromFrontmatter(
  frontmatter: Record<string, unknown> | undefined,
  keys: string[],
): string[] {
  if (!frontmatter) {
    return [];
  }
  const values: string[] = [];
  for (const key of keys) {
    const raw = frontmatter[key];
    if (typeof raw === "string") {
      for (const part of raw.split(",")) {
        const trimmed = part.trim();
        if (trimmed) {
          values.push(trimmed);
        }
      }
    } else if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === "string" && item.trim()) {
          values.push(item.trim());
        }
      }
    }
  }
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      unique.push(value);
    }
  }
  return unique;
}

function jsonSafeRecord(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }
  const copy: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "position") {
      continue;
    }
    copy[key] = entry;
  }
  try {
    const parsed: unknown = JSON.parse(JSON.stringify(copy));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}
