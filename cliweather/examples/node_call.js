#!/usr/bin/env node
/**
 * cliweather — Node.js 调用示例
 *
 * 用法:
 *   node node_call.js
 *   node node_call.js 上海 后天
 *   CLIWEATHER_ENDPOINT=https://your.workers.dev/cli/text_cli node node_call.js
 */

// 方式 A: 使用 text-cli SDK（推荐）
// const { callDirective } = require('text-cli-sdk/call/js/call');
// const result = await callDirective('指令:基础应用;天气查询,明天,北京');
// console.log(result);

// 方式 B: 纯 fetch（Node 18+ 内置）
async function weatherQuery(city = "威海", date = "明天", endpoint = null) {
  if (!endpoint) {
    endpoint = process.env.CLIWEATHER_ENDPOINT || "https://your-worker.workers.dev/cli/text_cli";
  }

  const directive = `指令:基础应用;天气查询,${date},${city}`;

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: directive }),
  });

  const data = await resp.json();
  return data.rst_data.text;
}

// ── main ──
const city = process.argv[2] || "威海";
const date = process.argv[3] || "明天";

weatherQuery(city, date)
  .then(console.log)
  .catch((e) => {
    console.error("天气查询失败:", e.message);
    process.exit(1);
  });
