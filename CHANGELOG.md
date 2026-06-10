# Changelog

## [0.1.0] — 2026-06-10

### Added
- Four tools: `arxiv_search`, `arxiv_get_paper`, `arxiv_daily_digest`, `arxiv_author_graph` (premium).
- The author-graph tool is the differentiator. BFS over co-authors up to depth 2 (with per-level cap to fit Worker CPU budget). Returns the set of nodes + the papers connecting them.
- Atom XML parsing via regex — no DOM/XML deps in Workers.
- 1-hour cache on search results, 24-hour on individual papers.
