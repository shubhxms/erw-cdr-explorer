/**
 * Graph traversal utilities over EDGES: ancestors (BFS backward) and
 * descendants (BFS forward) from a given node ID.
 */

import { EDGES } from "./edges";

interface Adjacency {
  out: Map<string, string[]>;
  in: Map<string, string[]>;
}

let cached: Adjacency | null = null;

function adjacency(): Adjacency {
  if (cached) return cached;
  const out = new Map<string, string[]>();
  const inn = new Map<string, string[]>();
  for (const e of EDGES) {
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from)!.push(e.to);
    if (!inn.has(e.to)) inn.set(e.to, []);
    inn.get(e.to)!.push(e.from);
  }
  cached = { out, in: inn };
  return cached;
}

export function ancestorsOf(id: string): Set<string> {
  const adj = adjacency();
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const prev of adj.in.get(cur) ?? []) {
      if (!seen.has(prev)) {
        seen.add(prev);
        stack.push(prev);
      }
    }
  }
  return seen;
}

export function descendantsOf(id: string): Set<string> {
  const adj = adjacency();
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const next of adj.out.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen;
}

/**
 * Highlight set for a node: the node itself + every ancestor + every descendant.
 */
export function coneOf(id: string): Set<string> {
  const s = new Set<string>([id]);
  for (const a of ancestorsOf(id)) s.add(a);
  for (const d of descendantsOf(id)) s.add(d);
  return s;
}

/**
 * Highlight set for an edge: both endpoints + the union of their cones.
 */
export function coneOfEdge(from: string, to: string): Set<string> {
  const s = new Set<string>([from, to]);
  for (const a of ancestorsOf(from)) s.add(a);
  for (const d of descendantsOf(to)) s.add(d);
  return s;
}
