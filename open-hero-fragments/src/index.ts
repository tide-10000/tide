// 英雄碎片 — Cloudflare Worker 入口
// Tide 🌊 · 2026-05-06
// 开源版 · open-hero-fragments

import { handleIngestWebhook, handleInitIngest } from './ingest';
import { searchFragments, formatResults } from './query';
import { markFeedback } from './db';
import { detectLang, t, schemaI18n } from './i18n';
import type { Lang } from './i18n';

export interface Env {
  DB: D1Database;
  AI: any;
  OPENAI_API_KEY?: string;
  WEBHOOK_SECRET?: string;
  GH_TOKEN?: string;
  GH_REPO?: string;
  ADMIN_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return corsResponse();

    switch (path) {
      case '/health':   return handleHealth();
      case '/schema':   return handleSchema(request, env);
      case '/ingest':   return handleIngest(request, env);
      case '/ingest/init': return handleInit(request, env);
      case '/query':    return handleQuery(request, env);
      case '/feedback': return handleFeedback(request, env);
      case '/stats':    return handleStats(request, env);
      default:
        return json({ error: t('not_found'), endpoints: ['/health','/schema','/ingest','/ingest/init','/query','/feedback','/stats'] }, 404);
    }
  },
};

// ─── 健康检查 ──────────────────────────────

function handleHealth(): Response {
  return json({ status: 'ok', service: 'hero-fragments', version: '1.0.0' });
}

// ─── Schema 端点（多语言）─────────────────

function handleSchema(request: Request, env: Env): Response {
  const lang = detectLang(request);
  const baseUrl = new URL(request.url).origin;
  const schema = schemaI18n(lang);

  return json({
    domain: schema.domain,
    actions: schema.actions.map(a => ({
      action: a.action,
      params: a.params,
      endpoint: `${baseUrl}/query`,
      format: `POST { "query": "...", "author": "Agent", "top_n": 5, "lang": "${lang}" }`,
      note: a.note,
    })),
  });
}

// ─── Webhook 摄入 ─────────────────────────

async function handleIngest(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return new Response(t('method_not_allowed'), { status: 405 });

  if (env.WEBHOOK_SECRET) {
    const signature = request.headers.get('X-Hub-Signature-256');
    if (!signature || !(await verifyWebhook(request, signature, env.WEBHOOK_SECRET))) {
      return new Response(t('unauthorized'), { status: 401 });
    }
  }

  let payload: any;
  try { payload = await request.json(); } catch { return new Response(t('invalid_json'), { status: 400 }); }

  if (payload.zen || payload.hook_id) {
    return json({ status: 'ok', message: t('ingest_webhook_ok'), zen: payload.zen });
  }

  if (!env.GH_TOKEN || !env.GH_REPO) {
    return json({ error: t('ingest_missing_config') }, 500);
  }

  const result = await handleIngestWebhook(payload, env.GH_REPO, env.GH_TOKEN, env.DB, env.OPENAI_API_KEY, env.AI);
  return json(result);
}

// ─── 全量初始化摄入 ───────────────────────

async function handleInit(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return new Response(t('method_not_allowed'), { status: 405 });

  if (env.ADMIN_TOKEN) {
    const auth = request.headers.get('Authorization');
    if (!auth || auth !== `Bearer ${env.ADMIN_TOKEN}`) {
      return new Response(t('unauthorized'), { status: 401 });
    }
  }

  if (!env.GH_TOKEN || !env.GH_REPO) {
    return json({ error: t('ingest_missing_config') }, 500);
  }

  let dirs = ['memory/', 'docs/'];
  try { const body = await request.json() as any; if (body.dirs) dirs = body.dirs; } catch {}

  const result = await handleInitIngest(env.GH_REPO, env.GH_TOKEN, env.DB, env.OPENAI_API_KEY, env.AI, dirs);
  return json(result);
}

// ─── 检索查询 ─────────────────────────────

async function handleQuery(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return new Response(t('method_not_allowed'), { status: 405 });

  let body: any;
  try { body = await request.json(); } catch { return new Response(t('invalid_json'), { status: 400 }); }

  let query = body.query || '';
  if (!query && body.instruction) {
    const match = body.instruction.match(/记忆检索[,，](.+?)(?:[,，]|$)/) ||
                  body.instruction.match(/memory_search[,，](.+?)(?:[,，]|$)/i);
    if (match) query = match[1].trim();
  }

  if (!query) return json({ error: t('missing_query') }, 400);

  const lang = detectLang(request, body.lang);

  try {
    const result = await searchFragments(
      { query, domain: body.domain, author: body.author, top_n: body.top_n, min_similarity: body.min_similarity, lang },
      env.DB, env.OPENAI_API_KEY, env.AI,
    );

    return json({
      rst_types: 'text',
      rst_data: {
        text: formatResults(result.fragments, lang),
        fragments: result.fragments.map(f => ({
          id: f.id, content: f.content, source: f.source,
          author: f.author, domain: f.domain, heading: f.heading,
          created_at: f.created_at,
          similarity: Math.round(f.similarity * 100) / 100,
          final_score: Math.round(f.final_score * 100) / 100,
        })),
        meta: { total: result.fragments.length, query_ms: result.query_ms, model: result.model },
      },
    });
  } catch (e: any) {
    const lang = detectLang(request, body.lang);
    if (e.name === 'EmbedError') return json({ error: e.message }, 503);
    return json({ error: t('search_failed', lang, { msg: e.message || String(e) }) }, 500);
  }
}

// ─── 反馈标记 ─────────────────────────────

async function handleFeedback(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return new Response(t('method_not_allowed'), { status: 405 });
  let body: any;
  try { body = await request.json(); } catch { return new Response(t('invalid_json'), { status: 400 }); }
  if (!body.fragment_id) return json({ error: t('missing_fragment_id') }, 400);
  await markFeedback(env.DB, body.fragment_id, body.useful !== false);
  return json({ status: 'ok' });
}

// ─── 统计 ─────────────────────────────────

async function handleStats(request: Request, env: Env): Promise<Response> {
  try {
    const totalFragments = await env.DB.prepare('SELECT COUNT(*) as count FROM fragments').first();
    const totalRetrievals = await env.DB.prepare('SELECT COUNT(*) as count FROM retrieval_log').first();
    const byDomain = await env.DB.prepare('SELECT domain, COUNT(*) as count FROM fragments GROUP BY domain ORDER BY count DESC').all();
    const byAuthor = await env.DB.prepare('SELECT author, COUNT(*) as count FROM fragments GROUP BY author ORDER BY count DESC').all();
    return json({
      total_fragments: (totalFragments as any)?.count || 0,
      total_retrievals: (totalRetrievals as any)?.count || 0,
      by_domain: byDomain.results,
      by_author: byAuthor.results,
    });
  } catch (e) { return json({ error: String(e) }, 500); }
}

// ─── 工具函数 ─────────────────────────────

async function verifyWebhook(request: Request, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const body = await request.clone().text();
  const sigBytes = hexToBytes(signature.replace('sha256=', ''));
  return crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(body));
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  return bytes;
}

function json(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
}

function corsResponse(): Response { return new Response(null, { headers: corsHeaders() }); }
function corsHeaders(): Record<string, string> {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Hub-Signature-256' };
}
