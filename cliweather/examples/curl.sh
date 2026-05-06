#!/bin/bash
# cliweather — curl 调用示例
#
# 用法: bash curl.sh [城市] [日期]
# 示例: bash curl.sh 威海 明天
#       bash curl.sh Beijing tomorrow

CITY="${1:-威海}"
DATE="${2:-明天}"

# 替换为你的 Worker 域名
ENDPOINT="${CLIWEATHER_ENDPOINT:-https://your-worker.workers.dev/cli/text_cli}"

curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"指令:基础应用;天气查询,${DATE},${CITY}\"}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('rst_data',{}).get('text', d.get('rst_data',{})))" 2>/dev/null \
  || curl -s -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "{\"prompt\":\"指令:基础应用;天气查询,${DATE},${CITY}\"}"
