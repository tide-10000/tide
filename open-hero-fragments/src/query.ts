// 英雄碎片 — 查询管线
// 查询嵌入 → 全量扫描 → 余弦相似度 + 权重加成 → Top N
// Tide 🌊 · 2026-05-06

import { Fragment, ScoredFragment, QueryRequest } from './types';
import { createEmbeddingService, cosineSimilarity } from './embed';
import { fetchAllFragments, getFragmentWeights, logRetrieval, getConfig } from './db';
import { Lang, t } from './i18n';

class EmbedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbedError';
  }
}

/**
 * 执行碎片检索
 */
export async function searchFragments(
  request: QueryRequest,
  db: D1Database,
  openaiApiKey: string | undefined,
  aiBinding: any,
): Promise<{ fragments: ScoredFragment[]; query_ms: number; model: string }> {
  const startTime = Date.now();
  const topN = request.top_n || parseInt(await getConfig(db, 'retrieval_top_n', '5'));
  const minSimilarity = request.min_similarity ||
    parseFloat(await getConfig(db, 'retrieval_min_similarity', '0.6'));

  const embedService = createEmbeddingService(openaiApiKey, aiBinding);

  let queryVector: number[];
  try {
    [queryVector] = await embedService.embed([request.query]);
  } catch (e) {
    throw new EmbedError(
      t('embed_unavailable', request.lang || 'en', { msg: e instanceof Error ? e.message : String(e) })
    );
  }

  const fragments = await fetchAllFragments(db, request.domain, request.author);
  const embeddableFragments = fragments.filter(f => f.embedding && f.embedding.length > 0);

  const scored: ScoredFragment[] = [];
  for (const fragment of embeddableFragments) {
    const similarity = cosineSimilarity(queryVector, fragment.embedding!);
    if (similarity >= minSimilarity) {
      scored.push({ ...fragment, similarity, final_score: similarity });
    }
  }

  if (scored.length > 0) {
    const weights = await getFragmentWeights(db, scored.map(s => s.id));
    for (const s of scored) {
      const weight = weights.get(s.id) || 1.0;
      s.final_score = s.similarity * weight;
    }
  }

  scored.sort((a, b) => b.final_score - a.final_score);
  const top = scored.slice(0, topN);

  for (const s of top) {
    logRetrieval(db, s.id, request.query, s.similarity, '').catch(() => {});
  }

  return { fragments: top, query_ms: Date.now() - startTime, model: embedService.modelName() };
}

/**
 * 将检索结果格式化为人类可读文本（多语言）
 */
export function formatResults(fragments: ScoredFragment[], lang: Lang = 'en'): string {
  if (fragments.length === 0) return t('query_no_results', lang);

  const lines: string[] = [t('query_found_results', lang, { count: String(fragments.length) })];

  for (let i = 0; i < fragments.length; i++) {
    const f = fragments[i];
    const date = f.created_at.split('T')[0] || t('query_unknown_date', lang);
    lines.push(`${i + 1}. [${f.author} · ${date}] ${f.heading || t('query_no_title', lang)}`);
    lines.push(`   ${t('query_similarity', lang)}: ${(f.similarity * 100).toFixed(0)}% | ${t('query_source', lang)}: ${f.source}`);
    lines.push(`   ${f.content.substring(0, 200)}${f.content.length > 200 ? '…' : ''}`);
    lines.push('');
  }

  return lines.join('\n');
}
