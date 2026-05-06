// 英雄碎片 — 嵌入服务
// 主路径：OpenAI text-embedding-3-small（中英混杂最优）
// 降级：Cloudflare Workers AI bge-base-zh-v1.5
// Tide 🌊 · 2026-05-06

import { EmbeddingService } from './types';

const OPENAI_EMBEDDING_URL = 'https://api.openai.com/v1/embeddings';
const OPENAI_MODEL = 'text-embedding-3-small';
const OPENAI_DIMENSION = 512;

const CF_MODEL = '@cf/baai/bge-base-zh-v1.5';
const CF_DIMENSION = 768;

/** 创建嵌入服务（优先 OpenAI，降级 CF AI） */
export function createEmbeddingService(
  openaiApiKey: string | undefined,
  aiBinding: any, // CF Workers AI binding
): EmbeddingService {
  if (openaiApiKey) {
    return new OpenAIEmbeddingService(openaiApiKey, aiBinding);
  }
  return new CFEmbeddingService(aiBinding);
}

/** OpenAI 嵌入 */
class OpenAIEmbeddingService implements EmbeddingService {
  private fallback: CFEmbeddingService;
  private lastUsedModel: string = OPENAI_MODEL;

  constructor(
    private apiKey: string,
    aiBinding: any,
  ) {
    this.fallback = new CFEmbeddingService(aiBinding);
  }

  modelName(): string {
    return this.lastUsedModel;
  }

  dimension(): number {
    return this.lastUsedModel === OPENAI_MODEL ? OPENAI_DIMENSION : CF_DIMENSION;
  }

  async embed(texts: string[]): Promise<number[][]> {
    try {
      const response = await fetch(OPENAI_EMBEDDING_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          input: texts,
          encoding_format: 'float',
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI embedding failed: ${response.status} ${err}`);
      }

      const data = await response.json() as any;
      this.lastUsedModel = OPENAI_MODEL;
      return data.data.map((d: any) => d.embedding as number[]);
    } catch (e) {
      console.log(`OpenAI embedding failed, falling back to CF AI: ${e}`);
      this.lastUsedModel = CF_MODEL;
      return this.fallback.embed(texts);
    }
  }
}

/** Cloudflare Workers AI 嵌入 */
class CFEmbeddingService implements EmbeddingService {
  constructor(private ai: any) {}

  modelName(): string {
    return CF_MODEL;
  }

  dimension(): number {
    return CF_DIMENSION;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    for (const text of texts) {
      const result = await this.ai.run(CF_MODEL, { text });
      results.push(result.data[0] as number[]);
    }

    return results;
  }
}

/**
 * 计算两个向量的余弦相似度
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}
