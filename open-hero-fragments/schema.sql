-- 英雄碎片 D1 Schema
-- 设计：Tide 🌊 · 2026-05-06
-- 引擎：SQLite (Cloudflare D1)

-- 核心表：知识碎片
CREATE TABLE IF NOT EXISTS fragments (
  id            TEXT PRIMARY KEY,              -- hash(content + source + chunk_index)
  content       TEXT NOT NULL,                 -- 碎片正文（100-500字）
  content_hash  TEXT NOT NULL,                 -- SHA256(content)，用于去重
  source        TEXT NOT NULL,                 -- 来源文件路径
  author        TEXT NOT NULL,                 -- AI 协作者
  domain        TEXT DEFAULT '',               -- 领域标签
  chunk_index   INTEGER NOT NULL,             -- 分块序号
  total_chunks  INTEGER DEFAULT 1,            -- 源文件总块数
  heading       TEXT DEFAULT '',               -- Markdown 标题
  parent_headings TEXT DEFAULT '[]',           -- 父级标题 JSON 数组
  content_type  TEXT DEFAULT 'text',           -- text | code
  created_at    TEXT NOT NULL,                -- 源笔记日期
  ingested_at   TEXT NOT NULL DEFAULT (datetime('now')),
  embedding     TEXT,                          -- F32 数组 JSON 序列化（D1 无 BLOB 原生支持）
  embedding_model TEXT DEFAULT ''
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_fragments_author ON fragments(author);
CREATE INDEX IF NOT EXISTS idx_fragments_domain ON fragments(domain);
CREATE INDEX IF NOT EXISTS idx_fragments_created ON fragments(created_at);
CREATE INDEX IF NOT EXISTS idx_fragments_content_hash ON fragments(content_hash);

-- 检索日志
CREATE TABLE IF NOT EXISTS retrieval_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  fragment_id   TEXT NOT NULL,
  query_text    TEXT NOT NULL,
  similarity    REAL NOT NULL,
  useful        INTEGER DEFAULT 0,           -- 0=未评分, 1=有用, -1=无用
  queried_at    TEXT NOT NULL DEFAULT (datetime('now')),
  queried_by    TEXT DEFAULT '',
  FOREIGN KEY (fragment_id) REFERENCES fragments(id)
);

CREATE INDEX IF NOT EXISTS idx_retrieval_fragment ON retrieval_log(fragment_id);
CREATE INDEX IF NOT EXISTS idx_retrieval_useful ON retrieval_log(useful);

-- 碎片权重
CREATE TABLE IF NOT EXISTS fragment_weight (
  fragment_id   TEXT PRIMARY KEY,
  base_score    REAL DEFAULT 1.0,
  useful_count  INTEGER DEFAULT 0,
  useless_count INTEGER DEFAULT 0,
  last_boosted  TEXT,
  current_weight REAL DEFAULT 1.0,
  FOREIGN KEY (fragment_id) REFERENCES fragments(id)
);

-- 摄入日志（追踪每次 webhook 触发）
CREATE TABLE IF NOT EXISTS ingest_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  commit_sha    TEXT NOT NULL,
  file_path     TEXT NOT NULL,
  chunks_count  INTEGER DEFAULT 0,
  new_count     INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  status        TEXT DEFAULT 'ok',            -- ok | error
  error_msg     TEXT DEFAULT '',
  ingested_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 管理配置
CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 默认配置
INSERT OR IGNORE INTO config (key, value) VALUES ('version', '1');
INSERT OR IGNORE INTO config (key, value) VALUES ('chunk_max_chars', '800');
INSERT OR IGNORE INTO config (key, value) VALUES ('chunk_min_chars', '50');
INSERT OR IGNORE INTO config (key, value) VALUES ('retrieval_top_n', '5');
INSERT OR IGNORE INTO config (key, value) VALUES ('retrieval_min_similarity', '0.6');
