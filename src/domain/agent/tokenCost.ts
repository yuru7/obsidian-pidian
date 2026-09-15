import type { CatalogModelCost, CatalogModelCostRates, CatalogModelCostTier } from "./ModelCatalog";
import type { TokenUsage } from "./AgentEvent";

const MILLION = 1_000_000;

export interface TokenUsageCost {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCostRates(value: unknown): value is CatalogModelCostRates {
  return (
    isRecord(value) &&
    isFiniteNumber(value.input) &&
    isFiniteNumber(value.output) &&
    isFiniteNumber(value.cacheRead) &&
    isFiniteNumber(value.cacheWrite)
  );
}

function isCostTier(value: unknown): value is CatalogModelCostTier {
  return isRecord(value) && isFiniteNumber(value.inputTokensAbove) && isCostRates(value);
}

export function usableCatalogModelCost(cost: unknown): CatalogModelCost | undefined {
  if (!isRecord(cost) || !isCostRates(cost)) {
    return undefined;
  }
  const mapped: CatalogModelCost = {
    input: cost.input,
    output: cost.output,
    cacheRead: cost.cacheRead,
    cacheWrite: cost.cacheWrite,
  };
  if (!Array.isArray(cost.tiers)) {
    return mapped;
  }
  const tiers = cost.tiers.filter(isCostTier);
  return tiers.length > 0 ? { ...mapped, tiers } : mapped;
}

function selectRates(cost: CatalogModelCost, usage: TokenUsage): CatalogModelCostRates {
  const inputTokens = usage.input + usage.cacheRead + usage.cacheWrite;
  let rates: CatalogModelCostRates = cost;
  let matchedThreshold = -1;
  for (const tier of cost.tiers ?? []) {
    if (inputTokens > tier.inputTokensAbove && tier.inputTokensAbove > matchedThreshold) {
      rates = tier;
      matchedThreshold = tier.inputTokensAbove;
    }
  }
  return rates;
}

export function tokenUsageCost(
  usage: TokenUsage,
  cost: CatalogModelCost | undefined,
): TokenUsageCost | undefined {
  const usable = usableCatalogModelCost(cost);
  if (!usable) {
    return undefined;
  }
  const rates = selectRates(usable, usage);
  return {
    input: (rates.input / MILLION) * usage.input,
    output: (rates.output / MILLION) * usage.output,
    cacheRead: (rates.cacheRead / MILLION) * usage.cacheRead,
    cacheWrite: (rates.cacheWrite / MILLION) * usage.cacheWrite,
  };
}

export function sumTokenUsageCost(
  messages: readonly { usage?: TokenUsage }[],
  cost: CatalogModelCost | undefined,
): TokenUsageCost | undefined {
  if (!usableCatalogModelCost(cost)) {
    return undefined;
  }
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  for (const message of messages) {
    if (!message.usage) {
      continue;
    }
    const next = tokenUsageCost(message.usage, cost);
    if (!next) {
      continue;
    }
    input += next.input;
    output += next.output;
    cacheRead += next.cacheRead;
    cacheWrite += next.cacheWrite;
  }
  return { input, output, cacheRead, cacheWrite };
}
