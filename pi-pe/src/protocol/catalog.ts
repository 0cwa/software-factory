import type { ProtocolFabric, ProvideSnapshot } from "@kybernetria/pi-protocol/core";
import { CATALOG_DEFAULT_LIMIT, CATALOG_MAX_LIMIT } from "../config.ts";
import { parseTarget } from "../schemas.ts";
import type { ResolvedTarget, TargetResolver } from "../types.ts";
import { fingerprintTarget } from "../pipeline/fingerprints.ts";

export interface CatalogFilter {
  query?: string;
  nodeId?: string;
  tags?: string[];
  executionType?: "handler" | "agent";
  effects?: string[];
  generated?: boolean;
  limit?: number;
}

export interface CatalogCard {
  target: string;
  nodeId: string;
  provide: string;
  description: string;
  purpose: string;
  version?: string;
  tags: string[];
  executionType: "handler" | "agent";
  effects: string[];
  generated: boolean;
  management: boolean;
}

export function createFabricTargetResolver(fabric: ProtocolFabric, derived?: ReadonlyMap<string, ResolvedTarget>): TargetResolver {
  return (target) => {
    const staged = derived?.get(target);
    if (staged) return staged;
    const parsed = parseTarget(target);
    if (!parsed) return undefined;
    const provide = fabric.describeProvide(parsed.nodeId, parsed.provide);
    const node = fabric.describeNode(parsed.nodeId);
    if (!provide || !node) return undefined;
    return { provide };
  };
}

export function catalogProvides(fabric: ProtocolFabric, managementNodeId: string, filter: CatalogFilter = {}): { items: CatalogCard[]; total: number; truncated: boolean } {
  const snapshot = fabric.registry();
  const nodes = new Map(snapshot.nodes.map((node) => [node.nodeId, node]));
  const query = filter.query?.trim().toLowerCase();
  const requestedTags = filter.tags?.map((tag) => tag.toLowerCase()) ?? [];
  const requestedEffects = filter.effects?.map((effect) => effect.toLowerCase()) ?? [];
  const limit = Math.min(Math.max(filter.limit ?? CATALOG_DEFAULT_LIMIT, 1), CATALOG_MAX_LIMIT);

  const matches = snapshot.provides.map((provide) => {
    const node = nodes.get(provide.nodeId)!;
    const generated = (node.tags ?? []).includes("generated");
    const tags = [...new Set([...(node.tags ?? []), ...(provide.tags ?? [])])];
    const effects = [...new Set(provide.effects ?? [])].sort();
    const card: CatalogCard = {
      target: provide.globalId,
      nodeId: provide.nodeId,
      provide: provide.name,
      description: provide.description,
      purpose: node.purpose,
      tags,
      executionType: provide.execution.type,
      effects,
      generated,
      management: provide.nodeId === managementNodeId,
    };
    return card;
  }).filter((card) => {
    if (filter.nodeId && card.nodeId !== filter.nodeId) return false;
    if (filter.executionType && card.executionType !== filter.executionType) return false;
    if (filter.generated !== undefined && card.generated !== filter.generated) return false;
    if (requestedTags.length > 0 && !requestedTags.every((tag) => card.tags.some((candidate) => candidate.toLowerCase() === tag))) return false;
    if (requestedEffects.length > 0 && !requestedEffects.every((effect) => card.effects.some((candidate) => candidate.toLowerCase() === effect))) return false;
    if (query) {
      const searchable = `${card.target} ${card.description} ${card.purpose} ${card.tags.join(" ")} ${card.effects.join(" ")}`.toLowerCase();
      if (!query.split(/\s+/).every((term) => searchable.includes(term))) return false;
    }
    return true;
  }).sort((left, right) => left.target.localeCompare(right.target));

  return { items: matches.slice(0, limit), total: matches.length, truncated: matches.length > limit };
}

export function describeTarget(fabric: ProtocolFabric, managementNodeId: string, target: string): {
  target: string;
  node: { nodeId: string; purpose: string; tags: string[] };
  provide: ProvideSnapshot;
  fingerprint: string;
  generated: boolean;
  management: boolean;
} | undefined {
  const parsed = parseTarget(target);
  if (!parsed) return undefined;
  const provide = fabric.describeProvide(parsed.nodeId, parsed.provide);
  const node = fabric.describeNode(parsed.nodeId);
  if (!provide || !node) return undefined;
  const resolved = { provide };
  return {
    target,
    node: {
      nodeId: node.nodeId,
      purpose: node.purpose,
      tags: node.tags ?? [],
    },
    provide,
    fingerprint: fingerprintTarget(resolved),
    generated: (node.tags ?? []).includes("generated"),
    management: node.nodeId === managementNodeId,
  };
}
