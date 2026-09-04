import { describe, expect, it } from "vitest";
import { bindConfigDir } from "./notePath";
import {
  aliasesFromFrontmatter,
  buildNoteMetadata,
  buildVaultLinks,
  parseNoteMetadataFields,
  parseVaultLinkFields,
  parseVaultLinksLimit,
  VAULT_LINKS_DEFAULT_LIMIT,
  VAULT_LINKS_MAX_LIMIT,
  type NoteCacheInput,
} from "./noteMetadata";

bindConfigDir(() => "vault-config");

function pos(line: number) {
  return { start: { line } };
}

const FULL_CACHE: NoteCacheInput = {
  frontmatter: {
    title: "Hello",
    tags: ["alpha", "beta"],
    aliases: ["Hi", "Greeting"],
    draft: true,
  },
  tags: [{ tag: "#gamma" }],
  headings: [
    { heading: "Intro", level: 1, position: pos(4) },
    { heading: "Details", level: 2, position: pos(8) },
  ],
  embeds: [{ link: "pic.png", displayText: "pic", path: "img/pic.png", position: pos(6) }],
  listItems: [
    { parent: -5, task: " ", position: pos(10) },
    { id: "item", parent: 10, task: "x", position: pos(11) },
  ],
  sections: [
    { type: "yaml", position: pos(0) },
    { type: "heading", id: "intro", position: pos(4) },
  ],
  links: [{ link: "Other", displayText: "see other", path: "notes/Other.md", position: pos(12) }],
  frontmatterLinks: [{ link: "Person", path: "people/Person.md", key: "author" }],
};

describe("buildNoteMetadata", () => {
  it("returns frontmatter, tags, and aliases", () => {
    const result = buildNoteMetadata("notes/a.md", FULL_CACHE, [], ["frontmatter", "tags", "aliases"]);
    expect(result).toEqual({
      path: "notes/a.md",
      frontmatter: {
        title: "Hello",
        tags: ["alpha", "beta"],
        aliases: ["Hi", "Greeting"],
        draft: true,
      },
      tags: ["#alpha", "#beta", "#gamma"],
      aliases: ["Hi", "Greeting"],
    });
  });

  it("returns headings, embeds, listItems, and sections", () => {
    const result = buildNoteMetadata("notes/a.md", FULL_CACHE, [], [
      "headings",
      "embeds",
      "listItems",
      "sections",
    ]);
    expect(result.headings).toEqual([
      { heading: "Intro", level: 1, line: 5 },
      { heading: "Details", level: 2, line: 9 },
    ]);
    expect(result.embeds).toEqual([{ link: "pic.png", path: "img/pic.png", displayText: "pic", line: 7 }]);
    expect(result.listItems).toEqual([
      { line: 11, parentLine: null, task: " " },
      { line: 12, parentLine: 11, task: "x", id: "item" },
    ]);
    expect(result.sections).toEqual([
      { type: "yaml", line: 1 },
      { type: "heading", line: 5, id: "intro" },
    ]);
  });

  it("returns outgoing links from the body and frontmatter", () => {
    const result = buildNoteMetadata("notes/a.md", FULL_CACHE, [], ["links"]);
    expect(result.links).toEqual([
      { link: "Other", path: "notes/Other.md", displayText: "see other", line: 13 },
      { link: "Person", path: "people/Person.md", key: "author" },
    ]);
  });

  it("returns backlinks", () => {
    const result = buildNoteMetadata(
      "notes/a.md",
      FULL_CACHE,
      [{ link: "A", path: "notes/b.md", displayText: "to A", position: pos(2) }],
      ["backlinks"],
    );
    expect(result.backlinks).toEqual([{ link: "A", path: "notes/b.md", displayText: "to A", line: 3 }]);
  });

  it("omits keys that were not requested", () => {
    const result = buildNoteMetadata("notes/a.md", FULL_CACHE, [{ link: "A", path: "b.md" }], ["tags"]);
    expect(result).toEqual({ path: "notes/a.md", tags: ["#alpha", "#beta", "#gamma"] });
    expect(result).not.toHaveProperty("frontmatter");
    expect(result).not.toHaveProperty("backlinks");
  });

  it("returns empty collections when the note has no metadata", () => {
    const result = buildNoteMetadata("empty.md", null, [], [
      "frontmatter",
      "tags",
      "aliases",
      "headings",
      "embeds",
      "listItems",
      "sections",
      "links",
      "backlinks",
    ]);
    expect(result).toEqual({
      path: "empty.md",
      frontmatter: {},
      tags: [],
      aliases: [],
      headings: [],
      embeds: [],
      listItems: [],
      sections: [],
      links: [],
      backlinks: [],
    });
  });

  it("omits unresolved destination paths", () => {
    const result = buildNoteMetadata(
      "a.md",
      { links: [{ link: "Missing", path: null, position: pos(0) }] },
      [],
      ["links"],
    );
    expect(result.links).toEqual([{ link: "Missing", line: 1 }]);
  });
});

describe("aliasesFromFrontmatter", () => {
  it("reads alias and aliases as strings or arrays", () => {
    expect(aliasesFromFrontmatter({ alias: "One, Two", aliases: ["Three"] })).toEqual(["One", "Two", "Three"]);
  });
});

describe("parse fields", () => {
  it("defaults to every note metadata field", () => {
    expect(parseNoteMetadataFields(undefined)).toEqual([
      "frontmatter",
      "tags",
      "aliases",
      "headings",
      "embeds",
      "listItems",
      "sections",
      "links",
      "backlinks",
    ]);
  });

  it("rejects an unknown metadata field", () => {
    expect(() => parseNoteMetadataFields(["tags", "blocks"])).toThrow(/unknown value: blocks/);
  });

  it("defaults vault link fields to both maps", () => {
    expect(parseVaultLinkFields(undefined)).toEqual(["resolvedLinks", "unresolvedLinks"]);
  });

  it("caps vault link limits", () => {
    expect(parseVaultLinksLimit(undefined)).toBe(VAULT_LINKS_DEFAULT_LIMIT);
    expect(parseVaultLinksLimit(9)).toBe(9);
    expect(parseVaultLinksLimit(VAULT_LINKS_MAX_LIMIT + 10)).toBe(VAULT_LINKS_MAX_LIMIT);
    expect(() => parseVaultLinksLimit(0)).toThrow(/positive integer/);
  });
});

describe("buildVaultLinks", () => {
  const resolved = {
    "notes/a.md": { "notes/b.md": 2 },
    "notes/c.md": { "notes/b.md": 1 },
    "other/d.md": { "notes/a.md": 1 },
  };
  const unresolved = {
    "notes/a.md": { Missing: 1 },
    "notes/c.md": { Ghost: 3 },
  };

  it("returns resolved and unresolved maps", () => {
    const result = buildVaultLinks(resolved, unresolved, {
      fields: ["resolvedLinks", "unresolvedLinks"],
      limit: 200,
    });
    expect(result.truncated).toBe(false);
    expect(result.resolvedLinks).toEqual([
      { path: "notes/a.md", links: { "notes/b.md": 2 } },
      { path: "notes/c.md", links: { "notes/b.md": 1 } },
      { path: "other/d.md", links: { "notes/a.md": 1 } },
    ]);
    expect(result.unresolvedLinks).toEqual([
      { path: "notes/a.md", links: { Missing: 1 } },
      { path: "notes/c.md", links: { Ghost: 3 } },
    ]);
  });

  it("filters by path prefix and fields", () => {
    const result = buildVaultLinks(resolved, unresolved, {
      fields: ["resolvedLinks"],
      path: "notes",
      limit: 200,
    });
    expect(result).toEqual({
      truncated: false,
      resolvedLinks: [
        { path: "notes/a.md", links: { "notes/b.md": 2 } },
        { path: "notes/c.md", links: { "notes/b.md": 1 } },
      ],
    });
    expect(result).not.toHaveProperty("unresolvedLinks");
  });

  it("marks truncated when more sources remain", () => {
    const result = buildVaultLinks(resolved, unresolved, {
      fields: ["resolvedLinks"],
      limit: 1,
    });
    expect(result.truncated).toBe(true);
    expect(result.resolvedLinks).toEqual([{ path: "notes/a.md", links: { "notes/b.md": 2 } }]);
  });

  it("skips restricted vault paths", () => {
    const result = buildVaultLinks(
      { "vault-config/app.json": { "notes/a.md": 1 }, "notes/a.md": { "notes/b.md": 1 } },
      {},
      { fields: ["resolvedLinks"], limit: 200 },
    );
    expect(result.resolvedLinks).toEqual([{ path: "notes/a.md", links: { "notes/b.md": 1 } }]);
  });
});
