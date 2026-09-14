export const EVAL_STARTED_AT_KEY = "__pidianLoadStartedAt";

export type LoadTimingField =
  | "evalMs"
  | "loadSettingsMs"
  | "initServicesMs"
  | "registerUiMs"
  | "onloadMs"
  | "pluginLoadMs"
  | "searchIndexMs"
  | "bootstrapMs"
  | "viewOpenMs";

export type LoadTimings = Partial<Record<LoadTimingField, number>>;

export const LOAD_TIMING_ORDER: readonly LoadTimingField[] = [
  "evalMs",
  "loadSettingsMs",
  "initServicesMs",
  "registerUiMs",
  "onloadMs",
  "pluginLoadMs",
  "searchIndexMs",
  "bootstrapMs",
  "viewOpenMs",
];

export function nowMs(): number {
  return performance.now();
}

export function roundMs(value: number): number {
  return Math.round(value);
}

export function readEvalStartedAt(store: object = globalThis): number | undefined {
  if (!(EVAL_STARTED_AT_KEY in store)) {
    return undefined;
  }
  const value = Reflect.get(store, EVAL_STARTED_AT_KEY);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function withDerivedTimings(timings: LoadTimings): LoadTimings {
  const next = { ...timings };
  if (next.evalMs !== undefined || next.onloadMs !== undefined) {
    next.pluginLoadMs = (next.evalMs ?? 0) + (next.onloadMs ?? 0);
  }
  return next;
}

export function formatLoadTimingText(
  timings: LoadTimings,
  label: (field: LoadTimingField) => string,
): string {
  const report = withDerivedTimings(timings);
  const lines: string[] = [];
  for (const field of LOAD_TIMING_ORDER) {
    const ms = report[field];
    if (typeof ms !== "number") {
      continue;
    }
    lines.push(`${label(field)}: ${ms}ms`);
  }
  return lines.join("\n");
}
