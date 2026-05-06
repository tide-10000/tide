// 英雄碎片 — Markdown 分块引擎
// 按 §三 五条规则实现
// Tide 🌊 · 2026-05-06

import { ChunkMeta } from './types';

const MAX_CHARS = 800;
const MIN_CHARS = 50;

/**
 * 解析 Markdown 为碎片块列表
 * @param markdown 原始 Markdown 文本
 * @param source 来源文件路径
 * @param author AI 协作者
 * @param domain 领域标签
 * @param created_at 笔记日期（从文件名提取或手动指定）
 */
export function chunkMarkdown(
  markdown: string,
  source: string,
  author: string,
  domain: string = '',
  created_at: string = ''
): ChunkMeta[] {
  // 自动提取日期（从文件名如 memory/2026-05-06.md）
  if (!created_at) {
    const dateMatch = source.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) created_at = dateMatch[0];
  }

  // Step 1: 按 ## 级别分块
  const rawChunks = splitByH2(markdown);

  // Step 2: 应用规则 2-5
  const processed: ChunkMeta[] = [];
  let chunkIndex = 0;

  for (const raw of rawChunks) {
    const subChunks = processChunk(raw, source);
    for (const sc of subChunks) {
      processed.push({
        ...sc,
        source,
        author,
        domain,
        chunk_index: chunkIndex,
        total_chunks: 0, // 稍后更新
        created_at,
      });
      chunkIndex++;
    }
  }

  // 更新 total_chunks
  const total = processed.length;
  for (const c of processed) c.total_chunks = total;

  return processed;
}

/** 按 ## 分割 */
function splitByH2(md: string): RawChunk[] {
  const lines = md.split('\n');
  const chunks: RawChunk[] = [];
  let currentHeading = '';
  let currentLines: string[] = [];
  let parentHeadings: string[] = [];

  for (const line of lines) {
    if (/^##\s/.test(line) && !/^###/.test(line)) {
      // 遇到二级标题 → 保存上一个块
      if (currentLines.length > 0) {
        chunks.push({
          heading: currentHeading,
          parent_headings: [...parentHeadings],
          content: currentLines.join('\n').trim(),
        });
      }
      currentHeading = line.trim();
      currentLines = [];
    } else if (/^#\s/.test(line) && !/^##/.test(line)) {
      // 一级标题 → 记录为父级上下文
      parentHeadings.push(line.trim());
      // 保留一级标题下的内容（可能是二级标题的前导文字）
      if (currentLines.length > 0 && !currentHeading) {
        // 前导文字合并到即将到来的第一个 ## 块
      }
    } else if (/^###\s/.test(line)) {
      // 三级标题 → 保留在块内（后续超长时用作二次拆分边界）
      currentLines.push(line);
    } else {
      currentLines.push(line);
    }
  }

  // 最后一个块
  if (currentLines.length > 0) {
    chunks.push({
      heading: currentHeading,
      parent_headings: parentHeadings,
      content: currentLines.join('\n').trim(),
    });
  }

  // 如果没有任何 ## 块，整篇作为一个块
  if (chunks.length === 0 && md.trim()) {
    chunks.push({
      heading: '',
      parent_headings: [],
      content: md.trim(),
    });
  }

  // 过滤空块
  return chunks.filter(c => c.content.length > 0);
}

/** 处理单个块：规则 2-5 */
function processChunk(raw: RawChunk, source: string): Omit<ChunkMeta, 'chunk_index' | 'total_chunks' | 'source' | 'author' | 'domain' | 'created_at'>[] {
  const content = raw.content;

  // 规则 5：代码块检测
  if (isCodeBlock(content)) {
    return [{
      content: trimToMax(content),
      content_hash: '',
      heading: raw.heading,
      parent_headings: raw.parent_headings,
      content_type: 'code',
    }];
  }

  // 规则 2：超长块按 ### 二次拆分
  if (content.length > MAX_CHARS) {
    const subChunks = splitByH3(content);
    const result = subChunks.map(sc => ({
      content: trimToMax(sc),
      content_hash: '',
      heading: raw.heading,
      parent_headings: raw.parent_headings,
      content_type: 'text' as const,
    }));

    // 规则 2 续：如果三级标题拆分后还超长 → 按段落拆
    return result.flatMap(r => {
      if (r.content.length > MAX_CHARS) {
        return splitByParagraph(r.content).map(p => ({
          ...r,
          content: trimToMax(p),
        }));
      }
      return [r];
    });
  }

  // 规则 3：超短块 → 先保留，后续合并
  // （在当前实现中，超短块保持独立，由上层决定是否合并。
  //   合并逻辑复杂（需要前后文判断），MVP 阶段暂不实现，
  //   选择保留短块以保证不丢失知识。检索时可通过 min_similarity 过滤）
  if (content.length < MIN_CHARS && content.trim().length > 0) {
    // 仍保留，只是标记未来可优化
  }

  return [{
    content: trimToMax(content),
    content_hash: '',
    heading: raw.heading,
    parent_headings: raw.parent_headings,
    content_type: 'text',
  }];
}

/** 按 ### 分割 */
function splitByH3(content: string): string[] {
  const lines = content.split('\n');
  const chunks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^###\s/.test(line) && current.length > 0) {
      chunks.push(current.join('\n').trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    chunks.push(current.join('\n').trim());
  }
  return chunks.length > 0 ? chunks : [content];
}

/** 按段落（双换行）分割 */
function splitByParagraph(content: string): string[] {
  return content
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/** 检测是否主要是代码块 */
function isCodeBlock(content: string): boolean {
  // 三个反引号包裹
  if (/^```[\s\S]*```$/.test(content.trim())) return true;
  // 或超过 60% 的行以缩进开头（代码风格）
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return false;
  const codeLines = lines.filter(l => /^\s{2,}/.test(l) || /^[#$]>/.test(l));
  return codeLines.length / lines.length > 0.6;
}

/** 裁剪到最大长度（保留完整句子） */
function trimToMax(text: string, max: number = MAX_CHARS): string {
  if (text.length <= max) return text;
  // 在最后一个句号/换行处截断
  const truncated = text.substring(0, max);
  const lastPeriod = Math.max(
    truncated.lastIndexOf('。'),
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('\n'),
  );
  if (lastPeriod > max * 0.5) {
    return truncated.substring(0, lastPeriod + 1);
  }
  return truncated + '…';
}

/** 计算内容的 SHA256 哈希（简化版，Worker 中用 Web Crypto） */
export async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 生成碎片 ID */
export function fragmentId(content: string, source: string, chunkIndex: number): string {
  // 使用内容+来源+序号的组合
  return `${source}#${chunkIndex}`;
}

interface RawChunk {
  heading: string;
  parent_headings: string[];
  content: string;
}
