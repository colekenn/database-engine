# database-engine

This database engine stores key-value pairs on disk using a B+ tree, which means range scans are fast because the leaf nodes are linked together. Reads and writes go through a buffer pool that keeps hot pages in memory so you're not hitting disk constantly.

## what's in here

The core is written in C++. The main pieces are:

- **B+ tree** — the index structure. handles inserts, lookups, deletes, and range scans
- **Buffer pool** — LRU page cache that sits between the tree and disk. tracks hit/miss stats
- **Page manager** — handles reading and writing fixed-size pages to the database file
- **Overflow manager** — deals with values that are too large to fit in a single page
- **HTTP API** — a small REST server so you can talk to the database over HTTP

There's also a web dashboard built with React/Vite that lets you interact with the database and visualize the B+ tree structure as you insert and delete keys. That part was mostly for making the internals less abstract to look at.

## running it

```bash
cmake -B build && cmake --build build
./build/minidb_server
```

The dashboard runs separately:

```bash
cd dashboard && npm install && npm run dev
```

## why

I wanted to understand buffer pools, page-based storage, and tree rebalancing at a level where I actually had to implement them. Reading about it only goes so far.
