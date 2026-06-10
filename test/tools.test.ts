import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArxivClient, parseArxivAtom } from "../src/arxiv";
import { McpServer, ToolContext } from "../src/mcp-server";
import { buildTools } from "../src/tools";

class FakeKv {
  store = new Map<string, string>();
  async get(key: string, type?: "text" | "json"): Promise<any> {
    const v = this.store.get(key); if (v === undefined) return null;
    if (type === "json") return JSON.parse(v); return v;
  }
  async put(key: string, value: string): Promise<void> { this.store.set(key, value); }
  async delete(key: string): Promise<void> { this.store.delete(key); }
}

const env = {
  CACHE: new FakeKv() as unknown as KVNamespace,
  USAGE: new FakeKv() as unknown as KVNamespace,
  ARXIV_BASE: "http://export.arxiv.org/api/query",
  USER_AGENT: "test/0.1",
  UPGRADE_URL: "x",
};

const SAMPLE_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/2024.04567v2</id>
    <published>2024-04-15T00:00:00Z</published>
    <updated>2024-04-20T00:00:00Z</updated>
    <title>Attention Is All You Need (Revisited)</title>
    <summary>Transformer architecture for sequence modeling.</summary>
    <author><name>Ashish Vaswani</name></author>
    <author><name>Noam Shazeer</name></author>
    <author><name>Niki Parmar</name></author>
    <arxiv:primary_category term="cs.LG"/>
    <category term="cs.LG"/>
    <category term="cs.CL"/>
    <arxiv:doi>10.5555/transformer.2024</arxiv:doi>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2024.99999v1</id>
    <published>2024-12-01T00:00:00Z</published>
    <updated>2024-12-01T00:00:00Z</updated>
    <title>Some Other Paper</title>
    <summary>Other work.</summary>
    <author><name>Geoffrey Hinton</name></author>
    <author><name>Ashish Vaswani</name></author>
    <arxiv:primary_category term="cs.AI"/>
    <category term="cs.AI"/>
  </entry>
</feed>`;

describe("parseArxivAtom", () => {
  it("extracts two entries with correct fields", () => {
    const papers = parseArxivAtom(SAMPLE_ATOM);
    expect(papers.length).toBe(2);
    expect(papers[0].id).toBe("2024.04567");
    expect(papers[0].url).toBe("https://arxiv.org/abs/2024.04567");
    expect(papers[0].title).toContain("Attention Is All You Need");
    expect(papers[0].authors).toEqual(["Ashish Vaswani", "Noam Shazeer", "Niki Parmar"]);
    expect(papers[0].primary_category).toBe("cs.LG");
    expect(papers[0].categories).toContain("cs.CL");
    expect(papers[0].doi).toBe("10.5555/transformer.2024");
    expect(papers[0].pdf_url).toBe("https://arxiv.org/pdf/2024.04567");
  });
  it("strips version suffix from id", () => {
    const papers = parseArxivAtom(SAMPLE_ATOM);
    expect(papers[0].id).not.toMatch(/v\d+$/);
  });
});

beforeEach(() => {
  (env.CACHE as any).store = new Map();
  vi.stubGlobal("fetch", async () => new Response(SAMPLE_ATOM, { status: 200 }));
});
afterEach(() => vi.unstubAllGlobals());

describe("ArxivClient.search", () => {
  it("returns parsed papers", async () => {
    const c = new ArxivClient(env as any);
    const out = await c.search({ query: "attention" });
    expect(out.length).toBe(2);
  });
});

describe("ArxivClient.authorGraph", () => {
  it("builds depth-1 graph from co-authors of an author", async () => {
    const c = new ArxivClient(env as any);
    const g = await c.authorGraph({ author: "Ashish Vaswani", depth: 1 });
    // Sample returns 2 papers; Vaswani has co-authors Shazeer, Parmar in paper 1; Hinton in paper 2.
    expect(g.nodes).toContain("Noam Shazeer");
    expect(g.nodes).toContain("Geoffrey Hinton");
    expect(g.edges.length).toBeGreaterThan(0);
    expect(g.edges.every((e) => e.from === "Ashish Vaswani")).toBe(true);
  });
});

describe("MCP protocol", () => {
  const server = new McpServer({ name: "arxiv-mcp", version: "0.1.0" });
  for (const t of buildTools()) server.register(t);
  const ctx: ToolContext = { env: env as any, apiKey: null, tier: "free", callsRemaining: 100 };

  it("free tier hides arxiv_author_graph (premium)", async () => {
    const r = await server.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ctx);
    const names = (r!.result as any).tools.map((t: any) => t.name) as string[];
    expect(names).toContain("arxiv_search");
    expect(names).toContain("arxiv_daily_digest");
    expect(names).not.toContain("arxiv_author_graph");
  });
  it("team tier sees author_graph", async () => {
    const teamCtx = { ...ctx, tier: "team" as const };
    const r = await server.handle({ jsonrpc: "2.0", id: 2, method: "tools/list" }, teamCtx);
    const names = (r!.result as any).tools.map((t: any) => t.name) as string[];
    expect(names).toContain("arxiv_author_graph");
  });
  it("arxiv_search end-to-end", async () => {
    const r = await server.handle(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "arxiv_search", arguments: { query: "transformers" } } }, ctx
    );
    const out = JSON.parse((r!.result as any).content[0].text);
    expect(out.count).toBe(2);
  });
});
