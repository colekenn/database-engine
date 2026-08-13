import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Background, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react';
import { Search } from 'lucide-react';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { Field } from '../components/Input';
import { Panel } from '../components/Panel';
import { EmptyBlock, LoadingBlock } from '../components/StatusBlock';
import { useToast } from '../components/ToastProvider';
import type { TreeNode, TreeSnapshot } from '../types';
import { formatBytes } from '../lib/format';

type TreePageProps = {
  refreshToken: number;
};

type FlowData = {
  label: ReactNode;
};

// leaf = blue, internal = orange, search path = violet — same identity
// colors as the overview and metrics pages.
const legend = [
  { color: 'bg-leaf', label: 'Leaf page', blurb: 'holds the actual key-value data' },
  { color: 'bg-internal', label: 'Internal page', blurb: 'routes lookups toward the right leaf' },
  { color: 'bg-path', label: 'Search path', blurb: 'pages visited to find your key' },
];

// Cap the key chips per node so a full leaf doesn't render as a giant tower.
const MAX_KEYS_SHOWN = 10;

function nodeLabel(node: TreeNode, highlighted: boolean) {
  return (
    <div
      className={`min-w-52 max-w-64 rounded-md border-2 bg-white px-3 py-3 text-left shadow-card ${
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

export function TreePage({ refreshToken }: TreePageProps) {
  const { push } = useToast();
  const [tree, setTree] = useState<TreeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchKey, setSearchKey] = useState('');
  const [submittedKey, setSubmittedKey] = useState('');

  const loadTree = useCallback(async () => {
    try {
      const snapshot = await api.tree(submittedKey.trim() || undefined);
      setTree(snapshot);
    } catch (err) {
      push({ title: 'Tree snapshot failed', message: err instanceof Error ? err.message : 'Request failed', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [push, submittedKey]);

  useEffect(() => {
    setLoading(true);
    void loadTree();
  }, [loadTree, refreshToken]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadTree();
    }, 4000);
    return () => window.clearInterval(id);
  }, [loadTree]);

  const flow = useMemo(() => (tree ? buildFlow(tree) : { nodes: [], edges: [] }), [tree]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmittedKey(searchKey);
  }

  return (
    <div className="grid gap-6">
      <Panel
        title="Live tree structure"
        description="Each box is a real 4 KB page from the database file. Drag to pan, scroll to zoom — the view refreshes every few seconds."
        action={
          <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={submit}>
            <Field label="Find a key" placeholder="e.g. user:0142" value={searchKey} onChange={(event) => setSearchKey(event.target.value)} />
            <Button variant="primary" icon={<Search className="h-4 w-4" />}>
              Trace lookup
            </Button>
          </form>
        }
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {legend.map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
              <span className="font-medium text-ink">{item.label}</span>
              <span className="text-muted">— {item.blurb}</span>
            </div>
          ))}
        </div>
      </Panel>

      {loading && !tree ? (
        <LoadingBlock title="Loading tree" />
      ) : !tree || tree.nodes.length === 0 ? (
        <EmptyBlock
          title="The tree is empty"
          message="Click “Load sample data” in the header (or insert keys on the Records page) and watch pages appear and split here."
        />
      ) : (
        <section className="h-[640px] overflow-hidden rounded-lg border border-line bg-surface shadow-card">
          <ReactFlow nodes={flow.nodes} edges={flow.edges} fitView minZoom={0.25} maxZoom={1.4} proOptions={{ hideAttribution: true }}>
            <Background color="#e1e0d9" gap={24} />
            <Controls />
          </ReactFlow>
        </section>
      )}
    </div>
  );
}
