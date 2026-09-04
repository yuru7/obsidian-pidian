const LATIN_TOKEN = /[a-z0-9_]+/g;
const CJK_RUN = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]+/g;

/** Split Latin on word characters; index CJK as overlapping bigrams so Japanese notes are searchable. */
export function tokenizeSearchText(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  const latin = lower.match(LATIN_TOKEN);
  if (latin) {
    tokens.push(...latin);
  }
  const cjkRuns = lower.match(CJK_RUN);
  if (!cjkRuns) {
    return tokens;
  }
  for (const run of cjkRuns) {
    if (run.length === 1) {
      tokens.push(run);
      continue;
    }
    for (let i = 0; i < run.length - 1; i++) {
      tokens.push(run.slice(i, i + 2));
    }
  }
  return tokens;
}
