// ArXiv API client.
// API: http://export.arxiv.org/api/query
// Returns Atom XML — we parse with regex (no XML deps in Workers).
//
// Differentiator vs other ArXiv MCPs: author-graph (find collaborators / co-authors)
// + paper-graph (find related papers by shared authors). Reserved as the premium tool.

import { KvCache, stableKey } from "./cache";

export interface ArxivEnv {
  CACHE: KVNamespace;
  ARXIV_BASE: string;          // http://export.arxiv.org/api/query
  USER_AGENT: string;
}

export interface ArxivPaper {
  id: string;                  // e.g. "2026.04567"
  url: string;                 // canonical abs URL
  title: string;
  summary: string;             // abstract
  authors: string[];
  published: string;           // ISO date
  updated: string;
  categories: string[];        // e.g. "cs.AI", "stat.ML"
  primary_category: string;
  doi?: string;
  pdf_url: string;
}

const POLITE = (ua: string) => ({ "User-Agent": ua, "Accept": "application/atom+xml" });

export class ArxivClient {
  private cache: KvCache;
  constructor(private env: ArxivEnv) { this.cache = new KvCache(env.CACHE, "arxiv"); }

  async search(opts: { query?: string; author?: string; category?: string; limit?: number; sortBy?: "relevance" | "lastUpdatedDate" | "submittedDate" }): Promise<ArxivPaper[]> {
    const limit = Math.min(opts.limit ?? 25, 100);
    const clauses: string[] = [];
    if (opts.query)    clauses.push(`all:${encodeURIComponent(opts.query)}`);
    if (opts.author)   clauses.push(`au:${encodeURIComponent('"' + opts.author + '"')}`);
    if (opts.category) clauses.push(`cat:${opts.category}`);
    const q = clauses.length ? clauses.join("+AND+") : "all:*";
    const sortBy = opts.sortBy ?? "lastUpdatedDate";
    const url = `${this.env.ARXIV_BASE}?search_query=${q}&max_results=${limit}&sortBy=${sortBy}&sortOrder=descending`;
    const key = `search:${stableKey({ q, sortBy, limit })}`;
    return this.cache.memoize(key, 60 * 60, async () => {
      const r = await fetch(url, { headers: POLITE(this.env.USER_AGENT) });
      if (!r.ok) throw new Error(`ArXiv ${r.status}`);
      const xml = await r.text();
      return parseArxivAtom(xml);
    });
  }

  async getPaper(id: string): Promise<ArxivPaper | null> {
    const cleaned = id.replace(/^arxiv:/i, "").replace(/v\d+$/, "");
    const url = `${this.env.ARXIV_BASE}?id_list=${cleaned}`;
    const key = `paper:${cleaned}`;
    return this.cache.memoize(key, 60 * 60 * 24, async () => {
      const r = await fetch(url, { headers: POLITE(this.env.USER_AGENT) });
      if (!r.ok) return null;
      const xml = await r.text();
      const papers = parseArxivAtom(xml);
      return papers[0] ?? null;
    });
  }

  /** Premium: author-graph BFS. Find collaborators of an author, up to depth 2. */
  async authorGraph(opts: { author: string; depth?: number; limit_per_level?: number }): Promise<{ nodes: string[]; edges: Array<{ from: string; to: string; via_paper: string }> }> {
    const depth = Math.min(opts.depth ?? 1, 2);
    const cap = Math.min(opts.limit_per_level ?? 25, 50);
    const seenAuthors = new Set<string>([opts.author]);
    const edges: Array<{ from: string; to: string; via_paper: string }> = [];
    let frontier = [opts.author];
    for (let d = 0; d < depth; d++) {
      const next: string[] = [];
      for (const a of frontier.slice(0, cap)) {
        const papers = await this.search({ author: a, limit: 20 });
        for (const p of papers) {
          for (const co of p.authors) {
            if (co === a) continue;
            if (!seenAuthors.has(co)) {
              seenAuthors.add(co);
              next.push(co);
            }
            edges.push({ from: a, to: co, via_paper: p.id });
          }
        }
      }
      frontier = next;
    }
    return { nodes: [...seenAuthors], edges: edges.slice(0, 500) };
  }

  /** Daily digest: list newly-submitted papers in a category. */
  async dailyDigest(opts: { category: string; limit?: number }): Promise<ArxivPaper[]> {
    return this.search({ category: opts.category, limit: opts.limit ?? 25, sortBy: "submittedDate" });
  }
}

// ── Atom parser (regex-based — Workers don't ship a DOM) ────────────────────

export function parseArxivAtom(xml: string): ArxivPaper[] {
  const entries: ArxivPaper[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const idMatch = e.match(/<id>http:\/\/arxiv\.org\/abs\/([^<]+)<\/id>/);
    const id = idMatch ? idMatch[1].replace(/v\d+$/, "") : "";
    if (!id) continue;
    const title = extractTag(e, "title").replace(/\s+/g, " ").trim();
    const summary = extractTag(e, "summary").trim();
    const published = extractTag(e, "published");
    const updated = extractTag(e, "updated");
    const authors = [...e.matchAll(/<name>([^<]+)<\/name>/g)].map((m) => m[1]);
    const categories = [...e.matchAll(/<category[^>]+term="([^"]+)"/g)].map((m) => m[1]);
    const primaryMatch = e.match(/<arxiv:primary_category[^>]+term="([^"]+)"/);
    const doi = extractTag(e, "arxiv:doi") || undefined;
    entries.push({
      id,
      url: `https://arxiv.org/abs/${id}`,
      title, summary,
      authors, published, updated,
      categories,
      primary_category: primaryMatch?.[1] ?? categories[0] ?? "",
      doi,
      pdf_url: `https://arxiv.org/pdf/${id}`,
    });
  }
  return entries;
}

function extractTag(s: string, tag: string): string {
  const m = s.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return m?.[1]?.trim() ?? "";
}
