// 英雄碎片 — 共享类型定义
// Tide 🌊 · 2026-05-06

/** 知识碎片 */
export interface Fragment {
  id: string;
  content: string;
  content_hash: string;
  source: string;
  author: string;
  domain: string;
  chunk_index: number;
  total_chunks: number;
  heading: string;
  parent_headings: string[];
  content_type: 'text' | 'code';
  created_at: string;
  ingested_at: string;
  embedding?: number[];
  embedding_model: string;
}

/** 碎片元数据（从 Markdown 解析） */
export interface ChunkMeta {
  content: string;
  content_hash: string;
  source: string;
  author: string;
  domain: string;
  chunk_index: number;
  total_chunks: number;
  heading: string;
  parent_headings: string[];
  content_type: 'text' | 'code';
  created_at: string;
}

/** 检索结果（含相似度） */
export interface ScoredFragment extends Fragment {
  similarity: number;
  final_score: number;
}

/** 查询请求 */
export interface QueryRequest {
  instruction?: string;
  query: string;
  domain?: string;
  author?: string;
  top_n?: number;
  min_similarity?: number;
  lang?: 'zh' | 'en';
}

/** 查询响应（text-cli 格式） */
export interface QueryResponse {
  rst_types: string;
  rst_data: {
    text: string;
    fragments: ScoredFragment[];
    meta: {
      total: number;
      query_ms: number;
      model: string;
    };
  };
}

/** 摄入日志 */
export interface IngestLog {
  commit_sha: string;
  file_path: string;
  chunks_count: number;
  new_count: number;
  skipped_count: number;
  status: 'ok' | 'error';
  error_msg: string;
}

/** Webhook payload (GitHub push event) */
export interface GitHubPushEvent {
  ref: string;
  repository: {
    full_name: string;
    name: string;
  };
  commits: Array<{
    id: string;
    added: string[];
    modified: string[];
    removed: string[];
  }>;
}

/** 嵌入服务接口 */
export interface EmbeddingService {
  embed(texts: string[]): Promise<number[][]>;
  modelName(): string;
  dimension(): number;
}
