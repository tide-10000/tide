// 英雄碎片 — 摄入管线
// Webhook 接收 → 拉取文件 → 分块 → 去重 → 嵌入 → 写入 D1
// Tide 🌊 · 2026-05-06

import { GitHubPushEvent, Fragment } from './types';
import { chunkMarkdown, sha256, fragmentId } from './chunk';
import { createEmbeddingService } from './embed';
import { insertFragments, findExistingHashes, logIngest } from './db';

/**
 * 处理 GitHub push webhook 事件
 */
export async function handleIngestWebhook(
  payload: GitHubPushEvent,
  repoFullName: string,
  ghToken: string,
  db: D1Database,
  openaiApiKey: string | undefined,
  aiBinding: any,
): Promise<{ files: number; chunks: number; new: number; skipped: number; errors: string[] }> {
  const changedFiles = extractChangedFiles(payload);
  const embedService = createEmbeddingService(openaiApiKey, aiBinding);

  let totalChunks = 0;
  let totalNew = 0;
  let totalSkipped = 0;
  const errors: string[] = [];

  for (const file of changedFiles) {
    try {
      const content = await fetchFileContent(repoFullName, file, ghToken);
      if (!content) { errors.push(`${file}: fetch failed`); continue; }

      const chunks = chunkMarkdown(content, file, extractAuthor(file), extractDomain(file));

      const chunkMetas = [];
      for (const chunk of chunks) {
        chunk.content_hash = await sha256(chunk.content);
        chunkMetas.push(chunk);
      }

      const hashes = chunkMetas.map(c => c.content_hash);
      const existingHashes = await findExistingHashes(db, hashes);
      const newChunks = chunkMetas.filter(c => !existingHashes.has(c.content_hash));
      const skippedCount = chunkMetas.length - newChunks.length;

      if (newChunks.length > 0) {
        const texts = newChunks.map(c => c.content);
        const embeddings = await embedService.embed(texts);

        const fragments: Fragment[] = newChunks.map((chunk, i) => ({
          id: fragmentId(chunk.content, chunk.source, chunk.chunk_index),
          content: chunk.content,
          content_hash: chunk.content_hash,
          source: chunk.source,
          author: chunk.author,
          domain: chunk.domain,
          chunk_index: chunk.chunk_index,
          total_chunks: chunk.total_chunks,
          heading: chunk.heading,
          parent_headings: chunk.parent_headings,
          content_type: chunk.content_type,
          created_at: chunk.created_at,
          ingested_at: new Date().toISOString(),
          embedding: embeddings[i],
          embedding_model: embedService.modelName(),
        }));

        totalNew += await insertFragments(db, fragments);
      }

      totalChunks += chunkMetas.length;
      totalSkipped += skippedCount;

      const commitSha = payload.commits?.[payload.commits.length - 1]?.id || 'unknown';
      await logIngest(db, {
        commit_sha: commitSha, file_path: file,
        chunks_count: chunkMetas.length, new_count: newChunks.length,
        skipped_count: skippedCount, status: 'ok', error_msg: '',
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      errors.push(`${file}: ${errMsg}`);
      await logIngest(db, {
        commit_sha: payload.commits?.[0]?.id || 'unknown', file_path: file,
        chunks_count: 0, new_count: 0, skipped_count: 0,
        status: 'error', error_msg: errMsg,
      });
    }
  }

  return { files: changedFiles.length, chunks: totalChunks, new: totalNew, skipped: totalSkipped, errors };
}

/**
 * 全量初始化摄入（手动触发，用于首次部署后填充知识库）
 */
export async function handleInitIngest(
  repoFullName: string, ghToken: string, db: D1Database,
  openaiApiKey: string | undefined, aiBinding: any,
  dirs: string[] = ['memory/', 'docs/'],
): Promise<{ files: number; chunks: number; new: number; errors: string[] }> {
  const embedService = createEmbeddingService(openaiApiKey, aiBinding);
  let totalChunks = 0, totalNew = 0;
  const errors: string[] = [];

  for (const dir of dirs) {
    try {
      const files = await listRepoFiles(repoFullName, ghToken, dir);
      for (const file of files) {
        try {
          const content = await fetchFileContent(repoFullName, file, ghToken);
          if (!content) continue;
          const chunks = chunkMarkdown(content, file, extractAuthor(file), extractDomain(file));
          const chunkMetas = [];
          for (const chunk of chunks) {
            chunk.content_hash = await sha256(chunk.content);
            chunkMetas.push(chunk);
          }
          const hashes = chunkMetas.map(c => c.content_hash);
          const existingHashes = await findExistingHashes(db, hashes);
          const newChunks = chunkMetas.filter(c => !existingHashes.has(c.content_hash));
          if (newChunks.length > 0) {
            const texts = newChunks.map(c => c.content);
            const embeddings = await embedService.embed(texts);
            const fragments: Fragment[] = newChunks.map((chunk, i) => ({
              id: fragmentId(chunk.content, chunk.source, chunk.chunk_index),
              content: chunk.content, content_hash: chunk.content_hash,
              source: chunk.source, author: chunk.author, domain: chunk.domain,
              chunk_index: chunk.chunk_index, total_chunks: chunk.total_chunks,
              heading: chunk.heading, parent_headings: chunk.parent_headings,
              content_type: chunk.content_type, created_at: chunk.created_at,
              ingested_at: new Date().toISOString(),
              embedding: embeddings[i], embedding_model: embedService.modelName(),
            }));
            totalNew += await insertFragments(db, fragments);
          }
          totalChunks += chunkMetas.length;
        } catch (e) { errors.push(`${file}: ${e instanceof Error ? e.message : String(e)}`); }
      }
    } catch (e) { errors.push(`dir ${dir}: ${e instanceof Error ? e.message : String(e)}`); }
  }

  return { files: totalChunks, chunks: totalChunks, new: totalNew, errors };
}

// ─── 辅助函数 ────────────────────────────────────

function extractChangedFiles(payload: GitHubPushEvent): string[] {
  if (!payload.commits || !Array.isArray(payload.commits)) return [];
  return payload.commits
    .flatMap(c => [...(c.added || []), ...(c.modified || [])])
    .filter(f => f.endsWith('.md') && !f.toLowerCase().includes('readme.md'))
    .filter((f, i, arr) => arr.indexOf(f) === i);
}

function extractAuthor(file: string): string {
  // 从文件路径推断作者。用户可在部署后按需修改此函数。
  if (file.startsWith('memory/')) return 'Agent';
  const parts = file.split('/');
  if (parts.length > 1) return parts[0];
  return 'Unknown';
}

function extractDomain(file: string): string {
  if (file.includes('memory')) return 'work-log';
  if (file.includes('docs')) return 'documentation';
  if (file.includes('src') || file.includes('lib')) return 'code';
  return 'general';
}

async function fetchFileContent(repoFullName: string, filePath: string, ghToken: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${repoFullName}/contents/${encodeURIComponent(filePath)}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${ghToken}`,
      'Accept': 'application/vnd.github.v3.raw',
      'User-Agent': 'hero-fragments-worker',
    },
  });
  if (!response.ok) return null;
  return response.text();
}

async function listRepoFiles(repoFullName: string, ghToken: string, dir: string): Promise<string[]> {
  const url = `https://api.github.com/repos/${repoFullName}/contents/${dir}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${ghToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'hero-fragments-worker',
    },
  });
  if (!response.ok) return [];
  const items = await response.json() as any[];
  const files: string[] = [];
  for (const item of items) {
    if (item.type === 'file' && item.name.endsWith('.md')) files.push(item.path);
    else if (item.type === 'dir') {
      const subFiles = await listRepoFiles(repoFullName, ghToken, item.path + '/');
      files.push(...subFiles);
    }
  }
  return files;
}
