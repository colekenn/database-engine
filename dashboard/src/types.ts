export type ApiRecord = {
  key: string;
  value: string;
};

export type Stats = {
  totalRecords: number;
  databaseSizeBytes: number;
  pageSizeBytes: number;
  pageCount: number;
  metadataPages: number;
  internalPages: number;
  leafPages: number;
  overflowPages: number;
  treeHeight: number;
  treeUsedBytes: number;
  treeAllocatedBytes: number;
  pageUtilization: number;
  bufferCapacity: number;
  bufferResidentPages: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  cacheMissRate: number;
  readOperations: number;
  writeOperations: number;
};

export type TreeNode = {
  id: string;
  pageId: number;
  type: 'internal' | 'leaf';
  parentId: number | null;
  nextLeaf: number | null;
  prevLeaf: number | null;
  usedBytes: number;
  keys: string[];
  children: number[];
};

export type TreeSnapshot = {
  rootPageId: number | null;
  height: number;
  nodes: TreeNode[];
  searchPath: number[];
};

export type Health = {
  status: 'ok';
  engine: string;
  databasePath: string;
  records: number;
};

export type RangeResponse = {
  count: number;
  records: ApiRecord[];
};
