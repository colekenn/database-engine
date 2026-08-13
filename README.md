# database-engine

**[try it live](https://database-engine.vercel.app/)** — the backend sleeps when idle, so give it a minute to wake up

A small database written from scratch in C++. It stores key-value pairs in a single file and uses a B+ tree to find any key fast without scanning the whole file.

There's a web dashboard that shows the tree live — you can insert keys and watch pages fill up and split.

## the parts

- **B+ tree** — keeps keys sorted and finds any one of them in a couple of page reads
- **Buffer pool** — keeps recently used pages in memory so most reads never touch the disk
- **Page manager** — reads and writes the file in fixed 4 KB pages
- **Overflow pages** — for values too big to fit in one page
- **REST API** — a small HTTP server so the dashboard can talk to the engine
- **Dashboard** — React app that visualizes the tree and the engine's stats

## why

I wanted to understand how databases actually store things — buffer pools, pages, tree splits — and reading about it only goes so far, so I built one.
