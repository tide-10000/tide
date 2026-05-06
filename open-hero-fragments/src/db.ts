// 英雄碎片 — D1 数据库操作
// Tide 🌊 · 2026-05-06

import { Fragment, ScoredFragment, IngestLog } from './types';

/** 批量插入碎片（含嵌入向量） */
export async function insertFragments(
  db: D1Database,
  fragments: Fragment[],
): Promise<number> {
  if (fragments.length === 0) return 0;

  // D1 batch insert（逐条，D1 batch API 在 MVP 中用循环）
  let inserted = 0;
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO fragments
     (id, content, content_hash, source, author, domain, chunk_index, total_chunks,
      heading, parent_headings, content_type, created_at, ingested_at, embedding, embedding_model)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)`
  );

  const batch: D1PreparedStatement[] = [];
  for (const f of fragments) {
    batch.push(
      stmt.bind(
        f.id,
        f.content,
        f.content_hash,
        f.source,
        f.author,
        f.domain,
        f.chunk_index,
        f.total_chunks,
        f.heading,
        JSON.stringify(f.parent_headings),
        f.content_type,
        f.created_at,
        f.embedding ? JSON.stringify(f.embedding) : null,
        f.embedding_model,
      )
    );
  }

  // D1 batch 限制：每次最多 100 条
  const BATCH_SIZE = 50;
  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    const chunk = batch.slice(i, i + BATCH_SIZE);
    const results = await db.batch(chunk);
    inserted += results.filter((r: any) => r.success).length;
  }

  return inserted;
}

/** 检查 content_hash 是否存在（去重） */
export async function findExistingHashes(
  db: D1Database,
  hashes: string[],
): Promise<Set<string>> {
  if (hashes.length === 0) return new Set();

  // D1 不支持 IN 参数化，逐个查询合并
  const existing = new Set<string>();
  for (const hash of hashes) {
    const result = await db
      .prepare('SELECT content_hash FROM fragments WHERE content_hash = ? LIMIT 1')
      .bind(hash)
      .first();
    if (result) existing.add(hash);
  }
  return existing;
}

/** 全量拉取所有碎片（用于内存向量检索） */
export async function fetchAllFragments(
  db: D1Database,
  domain?: string,
  author?: string,
): Promise<Fragment[]> {
  let query = 'SELECT * FROM fragments WHERE 1=1';
  const params: any[] = [];

  if (domain) {
    query += ' AND domain = ?';
    params.push(domain);
  }
  if (author) {
    query += ' AND author = ?';
    params.push(author);
  }

  query += ' ORDER BY created_at DESC';

  const result = await db.prepare(query).bind(...params).all();
  return (result.results as any[]).map(rowToFragment);
}

/** 获取碎片权重 */
export async function getFragmentWeights(
  db: D1Database,
  fragmentIds: string[],
): Promise<Map<string, number>> {
  const weights = new Map<string, number>();
  // 默认权重 1.0
  for (const id of fragmentIds) weights.set(id, 1.0);

  for (const id of fragmentIds) {
    const result = await db
      .prepare('SELECT current_weight FROM fragment_weight WHERE fragment_id = ?')
      .bind(id)
      .first();
    if (result) {
      weights.set(id, (result as any).current_weight);
    }
  }

  return weights;
}

/** 记录检索日志 */
export async function logRetrieval(
  db: D1Database,
  fragmentId: string,
  queryText: string,
  similarity: number,
  queriedBy: string = '',
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO retrieval_log (fragment_id, query_text, similarity, queried_by, queried_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    )
    .bind(fragmentId, queryText, similarity, queriedBy)
    .run();
}

/** 标记碎片有用/无用 */
export async function markFeedback(
  db: D1Database,
  fragmentId: string,
  useful: boolean,
): Promise<void> {
  // 更新 retrieval_log
  await db
    .prepare(
      `UPDATE retrieval_log SET useful = ?
       WHERE fragment_id = ? AND useful = 0
       ORDER BY queried_at DESC LIMIT 1`
    )
    .bind(useful ? 1 : -1, fragmentId)
    .run();

  // 更新 fragment_weight
  const key = useful ? 'useful_count' : 'useless_count';
  await db
    .prepare(
      `INSERT OR IGNORE INTO fragment_weight (fragment_id) VALUES (?)
    `)
    .bind(fragmentId)
    .run();

  await db
    .prepare(
      `UPDATE fragment_weight
       SET ${key} = ${key} + 1,
           last_boosted = datetime('now'),
           current_weight = base_score *
             (1.0 + ln(coalesce(useful_count, 0) + 1)) /
             (1.0 + ln(coalesce(useful_count, 0) + coalesce(useless_count, 0) + 1))
       WHERE fragment_id = ?`
    )
    .bind(fragmentId)
    .run();
}

/** 记录摄入日志 */
export async function logIngest(
  db: D1Database,
  log: IngestLog,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ingest_log (commit_sha, file_path, chunks_count, new_count, skipped_count, status, error_msg)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      log.commit_sha,
      log.file_path,
      log.chunks_count,
      log.new_count,
      log.skipped_count,
      log.status,
      log.error_msg,
    )
    .run();
}

/** 获取配置值 */
export async function getConfig(
  db: D1Database,
  key: string,
  fallback: string = '',
): Promise<string> {
  const result = await db
    .prepare('SELECT value FROM config WHERE key = ?')
    .bind(key)
    .first();
  return result ? (result as any).value : fallback;
}

/** D1 行 → Fragment 对象 */
function rowToFragment(row: any): Fragment {
  return {
    id: row.id as string,
    content: row.content as string,
    content_hash: row.content_hash as string,
    source: row.source as string,
    author: row.author as string,
    domain: row.domain as string,
    chunk_index: row.chunk_index as number,
    total_chunks: row.total_chunks as number,
    heading: row.heading as string,
    parent_headings: parseJsonArray(row.parent_headings),
    content_type: (row.content_type as 'text' | 'code') || 'text',
    created_at: row.created_at as string,
    ingested_at: row.ingested_at as string,
    embedding: row.embedding ? JSON.parse(row.embedding as string) : undefined,
    embedding_model: row.embedding_model as string,
  };
}

function parseJsonArray(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const parsed = JSON.parse(val as string);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
