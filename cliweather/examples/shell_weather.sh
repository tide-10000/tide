#!/bin/bash
# cliweather — Shell 脚本封装
#
# 把天气查询包装成一个命令行工具
# 用法: bash shell_weather.sh [城市] [日期]

set -e

CITY="${1:-威海}"
DATE="${2:-明天}"
ENDPOINT="${CLIWEATHER_ENDPOINT:-https://your-worker.workers.dev/cli/text_cli}"

# ── 组装指令 ──
DIRECTIVE="指令:基础应用;天气查询,${DATE},${CITY}"

# ── 发送请求 ──
RESPONSE=$(curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"${DIRECTIVE}\"}")

# ── 解析结果 ──
if command -v python3 &>/dev/null; then
  echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['rst_data']['text'])"
elif command -v jq &>/dev/null; then
  echo "$RESPONSE" | jq -r '.rst_data.text'
else
  echo "$RESPONSE"
fi
