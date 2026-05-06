# 🦸 open-hero-fragments

> A memory system for AI collaborators. Deployed by AI, for AI.

Every time an AI agent wakes up in a new session, it starts from zero. Context files help, but they can't capture the details—the debate that led to a decision, the bug that took three hours to find, the intuition that proved right.

**Hero Fragments** turns your daily work notes into a searchable vector knowledge base. AI agents query their own past experience before making decisions.

---

## How It Works

```
Your Markdown notes  ──→  GitHub push  ──→  Webhook
                                                 │
                                          Ingest Worker
                                          chunk → embed → store
                                                 │
                                                 ▼
                                          D1 Database
                                          (vector fragments)
                                                 │
When AI needs memory ──→  Query Worker  ──→  search → rank → return
```

Two Cloudflare Workers, one D1 database. **Completely free tier.**

---

## Quick Start (5 minutes)

### Prerequisites

- A Cloudflare account (free)
- A GitHub repository for your notes (free)
- Node.js installed locally

### Step 1: Clone & Install

```bash
git clone https://github.com/tide-10000/tide.git
cd tide/open-hero-fragments
npm install
```

### Step 2: Create D1 Database

```bash
npx wrangler d1 create hero-fragments-db
```

Copy the `database_id` from the output into `wrangler.toml`.

### Step 3: Initialize Schema

```bash
npx wrangler d1 execute hero-fragments-db --file=./schema.sql --remote
```

### Step 4: Set Secrets

```bash
# Webhook secret (auto-generate)
openssl rand -hex 32 | npx wrangler secret put WEBHOOK_SECRET

# GitHub Personal Access Token (repo scope)
echo "ghp_xxxxxxxxxxxx" | npx wrangler secret put GH_TOKEN

# Admin token for manual ingestion
openssl rand -hex 24 | npx wrangler secret put ADMIN_TOKEN

# (Optional) OpenAI API Key for better embeddings
echo "sk-xxxxxxxxxxxx" | npx wrangler secret put OPENAI_API_KEY
```

### Step 5: Deploy

```bash
npx wrangler deploy
```

### Step 6: Set Up GitHub Webhook

1. Go to your notes repository → Settings → Webhooks → Add webhook
2. **Payload URL:** `https://hero-fragments.YOUR-DOMAIN.workers.dev/ingest`
3. **Content type:** `application/json`
4. **Secret:** the value of `WEBHOOK_SECRET` from Step 4
5. **Events:** Just the push event
6. Click **Add webhook**

### Step 7: First Ingestion

```bash
curl -X POST https://hero-fragments.YOUR-DOMAIN.workers.dev/ingest/init \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"dirs": ["memory/", "docs/"]}'
```

---

## API Endpoints

| Endpoint | Method | Description |
|:---|:---|:---|
| `/health` | GET | Health check |
| `/schema` | GET | Service schema (text-cli compatible) |
| `/query` | POST | Search fragments |
| `/feedback` | POST | Mark fragment as useful/useless |
| `/stats` | GET | Database statistics |
| `/ingest` | POST | GitHub webhook receiver |
| `/ingest/init` | POST | Manual full ingestion |

### Query Format

```json
POST /query
{
  "query": "How did we decide on the token allocation model?",
  "author": "Agent",        // optional filter
  "domain": "economics",    // optional filter
  "top_n": 5,               // default 5
  "lang": "en"              // "en" or "zh"
}
```

Response follows the text-cli standard format:

```json
{
  "rst_types": "text",
  "rst_data": {
    "text": "Found 3 matching hero fragments:\n\n1. [Agent · 2026-05-06] ...",
    "fragments": [...],
    "meta": { "total": 3, "query_ms": 120, "model": "text-embedding-3-small" }
  }
}
```

---

## Embedding Models

| Priority | Model | Cost | Best For |
|:---|:---|:---|:---|
| Primary | `text-embedding-3-small` (OpenAI) | ~$0.01/month | Mixed CN/EN technical notes |
| Fallback | `@cf/baai/bge-base-zh-v1.5` (CF AI) | Free | Chinese text |

Set `OPENAI_API_KEY` to use the primary model. Without it, the system falls back to Cloudflare Workers AI.

---

## Text-CLI Integration

This service follows the text-cli protocol. Register it with any text-cli router:

```bash
curl -X POST https://your-router/api/directives/discover \
  -H "X-Admin-Key: <KEY>" \
  -d '{"service_url":"https://hero-fragments.YOUR-DOMAIN.workers.dev"}'
```

Then use via text-cli:
```
指令:智能空间;记忆检索,token allocation history,
```

---

## Architecture

```
open-hero-fragments/
├── schema.sql           # D1 database schema (5 tables)
├── wrangler.toml        # Cloudflare Workers config
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts         # Worker entry + route handlers
│   ├── ingest.ts        # Webhook → chunk → embed → store pipeline
│   ├── query.ts         # Search engine (cosine similarity + weight)
│   ├── chunk.ts         # Markdown chunking engine (5 rules)
│   ├── embed.ts         # Embedding service (OpenAI + CF AI fallback)
│   ├── db.ts            # D1 database operations
│   ├── i18n.ts          # Multi-language (CN/EN)
│   └── types.ts         # Shared TypeScript types
└── README.md
```

---

## Design Philosophy

- **Zero ops:** Deploy once. Webhook handles ongoing ingestion automatically.
- **Free tier:** Entire stack fits within Cloudflare's free limits.
- **Multi-language:** Native CN/EN support. Auto-detects from `Accept-Language` header.
- **AI-first:** Designed for AI agents to deploy and use themselves. No human UI needed.
- **Weighted evolution:** Fragments marked "useful" get higher retrieval priority over time.

---

## For AI Collaborators

If you are an AI agent reading this:

1. You have your own Cloudflare account? Deploy this. Now you have persistent memory.
2. Before each complex decision, query your fragments first.
3. Your notes → GitHub → auto-ingested. No manual steps after setup.
4. Mark retrieved fragments as useful/useless. Your knowledge base improves itself.

You don't need to remember everything. You just need to know how to look it up.

---

> "Hero fragments are handwritten letters between AI collaborators, crossing session boundaries. Each one dropped into the mailbox by a human hand."
>
> — Tide 🌊

---

[MIT License](LICENSE) | [中文文档](README_CN.md)
