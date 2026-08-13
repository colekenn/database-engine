import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Background, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react';
import { api } from '../api/client';
import type { TreeNode, TreeSnapshot } from '../types';
import { formatBytes } from '../lib/format';

import { Button } from './Button';

type TreeViewProps = {
  refreshToken: number;
  tracedKey: string | null;
  onSeed: () => void;
  seeding: boolean;
};

type FlowData = {
  label: ReactNode;
};

// Cap the key chips per node so a full leaf doesn't render as a giant tower.
const MAX_KEYS_SHOWN = 10;

function nodeLabel(node: TreeNode, highlighted: boolean) {
  return (
    <div
      className={`min-w-52 max-w-64 rounded-md border-2 bg-white px-3 py-3 text-left ${
        highlighted ? 'border-path' : node.type === 'leaf' ? 'border-leaf/50' : 'border-internal/50'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink2">
          <span className={`h-2 w-2 rounded-full ${highlighted ? 'bg-path' : node.type === 'leaf' ? 'bg-leaf' : 'bg-internal'}`} />
          {node.type}
        </span>
        <span className="font-mono text-xs text-muted">page {node.pageId}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {node.keys.length > 0 ? (
          <>
            {node.keys.slice(0, MAX_KEYS_SHOWN).map((key) => (
              <span key={key} className="max-w-28 truncate rounded border border-line bg-paper px-2 py-1 font-mono text-xs text-ink">
                {key}
              </span>
            ))}
            {node.keys.length > MAX_KEYS_SHOWN ? (
              <span className="rounded px-2 py-1 text-xs text-muted">+{node.keys.length - MAX_KEYS_SHOWN} more</span>
            ) : null}
          </>
        ) : (
          <span className="text-xs text-muted">empty</span>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">{formatBytes(node.usedBytes)} of 4 KB used</p>
    </div>
  );
}

function buildFlow(snapshot: TreeSnapshot): { nodes: Node<FlowData>[]; edges: Edge[] } {
  const byId = new Map(snapshot.nodes.map((node) => [node.pageId, node]));
  const levels = new Map<number, number>();
  const rows = new Map<number, TreeNode[]>();
  const root = snapshot.rootPageId ? byId.get(snapshot.rootPageId) : snapshot.nodes[0];
  const pending: Array<{ node: TreeNode; level: number }> = root ? [{ node: root, level: 0 }] : [];
  const seen = new Set<number>();

  for (let index = 0; index < pending.length; index += 1) {
    const { node, level } = pending[index];
    if (seen.has(node.pageId)) continue;
    seen.add(node.pageId);
    levels.set(node.pageId, level);
    rows.set(level, [...(rows.get(level) ?? []), node]);
    node.children.forEach((childId) => {
      const child = byId.get(childId);
      if (child) pending.push({ node: child, level: level + 1 });
    });
  }

  snapshot.nodes.forEach((node) => {
    if (!seen.has(node.pageId)) {
      const level = levels.size === 0 ? 0 : Math.max(...levels.values()) + 1;
      levels.set(node.pageId, level);
      rows.set(level, [...(rows.get(level) ?? []), node]);
    }
  });

  const highlighted = new Set(snapshot.searchPath);
  const nodes: Node<FlowData>[] = [];
  rows.forEach((row, level) => {
    row.forEach((treeNode, index) => {
      const width = 300;
      nodes.push({
        id: String(treeNode.pageId),
        type: 'default',
        data: { label: nodeLabel(treeNode, highlighted.has(treeNode.pageId)) },
        position: {
          x: index * width - ((row.length - 1) * width) / 2,
          y: level * 170,
        },
        draggable: true,
      });
    });
  });

  const edges: Edge[] = snapshot.nodes.flatMap((node) =>
    node.children.map((childId, index) => {
      const onPath = highlighted.has(node.pageId) && highlighted.has(childId);
      return {
        id: `${node.pageId}-${childId}-${index}`,
        source: String(node.pageId),
        target: String(childId),
        animated: onPath,
        style: {
          stroke: onPath ? '#4a3aa7' : '#c3c2b7',
          strokeWidth: onPath ? 2.5 : 1.5,
        },
      };
    }),
  );

  return { nodes, edges };
}

export function TreeView({ refreshToken, tracedKey, onSeed, seeding }: TreeViewProps) {
  const [tree, setTree] = useState<TreeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTree = useCallback(async () => {
    try {
      const snapshot = await api.tree(tracedKey ?? undefined);
      setTree(snapshot);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'request failed');
    }
  }, [tracedKey]);

  useEffect(() => {
    void loadTree();
    const id = window.setInterval(() => {
      void loadTree();
    }, 4000);
    return () => window.clearInterval(id);
  }, [loadTree, refreshToken]);

  const flow = useMemo(() => (tree ? buildFlow(tree) : { nodes: [], edges: [] }), [tree]);

  return (
    <div className="grid min-h-[520px] grid-rows-[auto_1fr] gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink2">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-leaf" /> leaf — holds data
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-internal" /> internal — routes lookups
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-path" /> search path
        </span>
        {tracedKey ? <span className="font-mono text-xs text-path">tracing “{tracedKey}”</span> : null}
      </div>

      {error ? (
        <div className="grid place-items-center rounded-md border border-line bg-surface text-sm text-danger">{error}</div>
      ) : !tree || tree.nodes.every((node) => node.keys.length === 0) ? (
        <div className="grid place-items-center rounded-md border border-dashed border-baseline bg-surface text-center">
          <div className="p-6">
            <p className="text-sm font-medium text-ink">the database is empty</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink2">
              load some sample data and watch the tree build itself — pages fill up, split, and grow a new level
            </p>
            <Button variant="primary" className="mt-4" onClick={onSeed} disabled={seeding}>
              {seeding ? 'inserting 260 records…' : 'load sample data'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-line bg-surface">
          <ReactFlow nodes={flow.nodes} edges={flow.edges} fitView minZoom={0.25} maxZoom={1.4} proOptions={{ hideAttribution: true }}>
            <Background color="#e1e0d9" gap={24} />
            <Controls />
          </ReactFlow>
        </div>
      )}
    </div>
  );
}
