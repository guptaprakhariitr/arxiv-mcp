# arxiv-mcp

> ArXiv preprint search + daily category digest + **author-collaborator graph** for AI agents. The author-graph is the differentiator vs the dozen other ArXiv MCPs in the wild.

**Endpoint:** `https://arxiv-mcp.prakhar-cognizance.workers.dev/mcp`

## Tools

| Tool | Example |
|---|---|
| `arxiv_search(query?, author?, category?, sort_by?)` | `query="attention is all you need"` |
| `arxiv_get_paper(id)` | `"2024.04567"` |
| `arxiv_daily_digest(category)` | `category="cs.AI"` |
| `arxiv_author_graph(author, depth)` *(premium)* | `author="Geoffrey Hinton" depth=1` |

## Pricing

| Tier | Price | Calls/mo |
|---|---|---|
| Free | $0 | 100 |
| Solo | $9/mo | 2,000 |
| Team | $29/mo | 10,000 (incl. author_graph) |
| Pro | $79/mo | 50,000 |
