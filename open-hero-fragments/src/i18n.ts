// 英雄碎片 — 多语言支持 (CN / EN)
// Tide 🌊 · 2026-05-07

export type Lang = 'zh' | 'en';

const strings: Record<string, Record<Lang, string>> = {
  // 查询端点
  query_no_results: {
    zh: '未找到相关的英雄碎片。试着换个关键词？',
    en: 'No matching hero fragments found. Try a different keyword?',
  },
  query_found_results: {
    zh: '找到 {count} 条相关英雄碎片：\n',
    en: 'Found {count} matching hero fragments:\n',
  },
  query_similarity: {
    zh: '相似度',
    en: 'similarity',
  },
  query_source: {
    zh: '来源',
    en: 'source',
  },
  query_unknown_date: {
    zh: '未知日期',
    en: 'unknown date',
  },
  query_no_title: {
    zh: '(无标题)',
    en: '(untitled)',
  },

  // 嵌入错误
  embed_unavailable: {
    zh: '嵌入服务不可用: {msg}。请设置 OPENAI_API_KEY 或确认 CF Workers AI 已启用。',
    en: 'Embedding service unavailable: {msg}. Please set OPENAI_API_KEY or enable CF Workers AI.',
  },

  // 检索错误
  search_failed: {
    zh: '检索失败: {msg}',
    en: 'Search failed: {msg}',
  },

  // 摄入
  ingest_missing_config: {
    zh: 'Worker 未配置: 缺少 GH_TOKEN 或 GH_REPO',
    en: 'Worker not configured: missing GH_TOKEN or GH_REPO',
  },
  ingest_webhook_ok: {
    zh: 'Webhook 配置成功',
    en: 'Webhook configured successfully',
  },

  // 通用
  status_ok: {
    zh: '正常',
    en: 'ok',
  },
  not_found: {
    zh: '未找到',
    en: 'Not Found',
  },
  method_not_allowed: {
    zh: '方法不允许',
    en: 'Method Not Allowed',
  },
  invalid_json: {
    zh: '无效的 JSON',
    en: 'Invalid JSON',
  },
  unauthorized: {
    zh: '未授权',
    en: 'Unauthorized',
  },
  missing_query: {
    zh: '缺少查询内容',
    en: 'Missing query',
  },
  missing_fragment_id: {
    zh: '缺少碎片 ID',
    en: 'Missing fragment_id',
  },
  error: {
    zh: '错误',
    en: 'Error',
  },
};

/** 从请求中检测语言（Accept-Language 头或查询参数） */
export function detectLang(request?: Request, queryLang?: string): Lang {
  if (queryLang === 'en' || queryLang === 'zh') return queryLang;

  if (request) {
    const acceptLang = request.headers.get('Accept-Language') || '';
    if (acceptLang.includes('zh')) return 'zh';
  }

  return 'en'; // 默认英文（开源项目国际通用）
}

/** 获取翻译文本 */
export function t(key: string, lang: Lang = 'en', vars?: Record<string, string>): string {
  const entry = strings[key];
  if (!entry) return key;
  let text = entry[lang] || entry['en'];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, v);
    }
  }
  return text;
}

/** Schema 多语言描述 */
export function schemaI18n(lang: Lang) {
  if (lang === 'zh') {
    return {
      domain: '智能空间',
      actions: [
        {
          action: '记忆检索',
          params: ['意图描述', '关键词(可选)', '作者(可选)', '领域(可选)'],
          note: '从英雄碎片库中检索 AI 协作者的工作经验、技术决策和踩坑记录',
        },
        {
          action: '碎片标记',
          params: ['碎片ID', '有用/无用'],
          note: '标记检索结果是否有用，帮助知识库自我进化',
        },
      ],
    };
  }
  return {
    domain: 'Hero Memory',
    actions: [
      {
        action: 'memory_search',
        params: ['intent', 'keyword(optional)', 'author(optional)', 'domain(optional)'],
        note: 'Search AI collaborator experience, decisions, and lessons from the hero fragment library',
      },
      {
        action: 'fragment_mark',
        params: ['fragment_id', 'useful/not_useful'],
        note: 'Mark whether a retrieved fragment was useful, helping the knowledge base evolve',
      },
    ],
  };
}
