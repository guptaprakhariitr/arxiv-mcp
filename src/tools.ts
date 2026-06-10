import { Tool } from "./mcp-server";
import { ArxivClient, ArxivEnv } from "./arxiv";

export function buildTools(): Tool[] {
  return [
    {
      name: "arxiv_search",
      description:
        "Search arXiv preprints by free-text query, author, and/or category (e.g. 'cs.AI', 'stat.ML', 'q-fin.MF'). Returns up to 100 papers with title, abstract, authors, categories, publication date, DOI when available, PDF URL.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Free-text search across all fields." },
          author: { type: "string", description: "Author name; quoted internally for exact match." },
          category: { type: "string", description: "arXiv category code, e.g. 'cs.AI'." },
          limit: { type: "integer", default: 25, minimum: 1, maximum: 100 },
          sort_by: { type: "string", enum: ["relevance", "lastUpdatedDate", "submittedDate"], default: "lastUpdatedDate" },
        },
        required: [],
      },
      handler: async (args, ctx) => {
        const c = new ArxivClient(ctx.env as unknown as ArxivEnv);
        const papers = await c.search({
          query: args.query, author: args.author, category: args.category,
          limit: args.limit ?? 25, sortBy: args.sort_by,
        });
        return { count: papers.length, papers };
      },
    },

    {
      name: "arxiv_get_paper",
      description: "Fetch a single arXiv paper's metadata + abstract by id (e.g. '2024.04567' or 'arXiv:2024.04567v2').",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
      handler: async (args, ctx) => {
        const c = new ArxivClient(ctx.env as unknown as ArxivEnv);
        const p = await c.getPaper(args.id);
        return p ?? { error: "Paper not found" };
      },
    },

    {
      name: "arxiv_daily_digest",
      description: "Recently-submitted papers in an arXiv category. Use for daily catch-up on a research area. E.g. category='cs.AI' for new AI papers.",
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", description: "arXiv category code." },
          limit: { type: "integer", default: 25, minimum: 1, maximum: 100 },
        },
        required: ["category"],
      },
      handler: async (args, ctx) => {
        const c = new ArxivClient(ctx.env as unknown as ArxivEnv);
        const papers = await c.dailyDigest({ category: args.category, limit: args.limit ?? 25 });
        return { count: papers.length, papers };
      },
    },

    {
      name: "arxiv_author_graph",
      description:
        "Premium tool. Build a collaborator graph rooted at an author. Returns the set of co-authors reachable in N hops (depth 1 = direct co-authors, depth 2 = co-authors of co-authors), plus the papers connecting them. The differentiator vs other arXiv MCPs.",
      inputSchema: {
        type: "object",
        properties: {
          author: { type: "string" },
          depth: { type: "integer", enum: [1, 2], default: 1 },
          limit_per_level: { type: "integer", default: 25, minimum: 1, maximum: 50 },
        },
        required: ["author"],
      },
      premium: true,
      handler: async (args, ctx) => {
        const c = new ArxivClient(ctx.env as unknown as ArxivEnv);
        return await c.authorGraph({ author: args.author, depth: args.depth ?? 1, limit_per_level: args.limit_per_level ?? 25 });
      },
    },
  ];
}
