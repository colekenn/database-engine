import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from '@xyflow/react';
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

function nodeLabel(node: TreeNode, highlighted: boolean) {
  return (
    <div
      className={`min-w-52 max-w-64 rounded-md border px-3 py-3 text-left shadow-panel ${
        highlighted ? 'border-mint bg-mint/10' : node.type === 'leaf' ? 'border-skyline/30 bg-panel' : 'border-amberline/30 bg-panel2'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className={`text-xs font-semibold uppercase tracking-[0.12em] ${node.type === 'leaf' ? 'text-skyline' : 'text-amberline'}`}>
          {node.type}
        </span>
        <span className="font-mono text-xs text-slate-500">p{node.pageId}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {node.keys.length > 0 ? (
          node.keys.map((key) => (
            <span key={key} className="max-w-28 truncate rounded bg-ink px-2 py-1 font-mono text-xs text-slate-200">
              {key}
            </span>
          ))
        ) : (
          <span className="text-xs text-slate-500">empty</span>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">{formatBytes(node.usedBytes)} used</p>
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
    node.children.map((childId, index) => ({
      id: `${node.pageId}-${childId}-${index}`,
      source: String(node.pageId),
      target: String(childId),
      animated: highlighted.has(node.pageId) && highlighted.has(childId),
      style: {
        stroke: highlighted.has(node.pageId) && highlighted.has(childId) ? '#2dd4bf' : '#334155',
        strokeWidth: highlighted.has(node.pageId) && highlighted.has(childId) ? 2.5 : 1.5,
      },
    })),
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
        title="B+ Tree Visualization"
        eyebrow="GET /tree"
        action={
          <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={submit}>
            <Field label="Search path" value={searchKey} onChange={(event) => setSearchKey(event.target.value)} />
            <Button variant="primary" icon={<Search className="h-4 w-4" />}>
              Highlight
            </Button>
          </form>
        }
      >
        <div className="grid gap-3 text-sm text-slate-400 sm:grid-cols-3">
          <div className="rounded-md border border-line bg-ink/40 p-3">
            <span className="text-slate-500">Height</span>
            <p className="mt-1 text-xl font-semibold text-slate-100">{tree?.height ?? 0}</p>
          </div>
          <div className="rounded-md border border-line bg-ink/40 p-3">
            <span className="text-slate-500">Nodes</span>
            <p className="mt-1 text-xl font-semibold text-slate-100">{tree?.nodes.length ?? 0}</p>
          </div>
          <div className="rounded-md border border-line bg-ink/40 p-3">
            <span className="text-slate-500">Highlighted pages</span>
            <p className="mt-1 text-xl font-semibold text-slate-100">{tree?.searchPath.length ?? 0}</p>
          </div>
        </div>
      </Panel>

      {loading && !tree ? (
        <LoadingBlock title="Loading tree" />
      ) : !tree || tree.nodes.length === 0 ? (
        <EmptyBlock title="No tree pages found" />
      ) : (
        <section className="h-[640px] overflow-hidden rounded-lg border border-line bg-ink shadow-panel">
          <ReactFlow nodes={flow.nodes} edges={flow.edges} fitView minZoom={0.25} maxZoom={1.4} proOptions={{ hideAttribution: true }}>
            <Background color="#263244" gap={24} />
            <Controls />
            <MiniMap
              pannable
              zoomable
              nodeColor={(node) => {
                const treeNode = tree.nodes.find((item) => String(item.pageId) === node.id);
                if (!treeNode) return '#64748b';
                if (tree.searchPath.includes(treeNode.pageId)) return '#2dd4bf';
                return treeNode.type === 'leaf' ? '#38bdf8' : '#f59e0b';
              }}
            />
          </ReactFlow>
        </section>
      )}

    </div>
  );
}
