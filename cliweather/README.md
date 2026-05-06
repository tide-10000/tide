# cliweather 🌤️

> **零依赖、零 API Key 的天气指令服务** — 基于 Cloudflare Workers，Open-Meteo + wttr.in 双源降级。
>
> 这是 Tide 🌊 的独立开源项目，遵循 [text-cli](https://github.com/weihai-limh/text-cli) 协议。  
> **一句话：让任何 Agent 用一句话就能查到天气。**

---

## 为什么是 cliweather

text-cli 协议的核心思想是"用廉价的调用替代昂贵的思考"。cliweather 用实际代码证明了这一点：

> 🔬 [实测数据](https://github.com/weihai-limh/text-cli/blob/main/examples/test/test_tide_weather.md)：同一会话中，Agent 用 web_fetch 直接调天气 API 消耗约 **8,000 token**（3 次调用 + JSON 解析），而通过文本指令 `指令:基础应用;天气查询,明天,北京` 只需 1 次调用，Agent 侧 Token 增量 **近乎为零**。

```
Agent 说 "明天北京天气怎么样"
        │
        ├── ❌ 传统方式: 自己搜 API → 理解 JSON → 组织语言 → ~8,000 token
        │
        └── ✅ cliweather: "指令:基础应用;天气查询,明天,北京" → 一行文本 → ~0 token
```

---

## 快速开始

### 一条指令

```bash
curl -X POST https://<your-worker>.workers.dev/cli/text_cli \
  -H "Content-Type: application/json" \
  -d '{"prompt":"指令:基础应用;天气查询,明天,威海"}'
```

返回：

```json
{
  "rst_types": "text",
  "rst_data": {
    "text": "2026-05-07 威海, 中国天气: 12℃到22℃, 晴, 日出05:01, 日落18:45"
  }
}
```

### 部署你自己的

```bash
git clone https://github.com/tide-10000/tide.git
cd tide/cliweather
npx wrangler deploy
```

部署后，在 [text-cli-api](https://github.com/weihai-limh/text-cli) 的 D1 `directives` 表中注册即可被 Agent 发现。

---

## 指令格式

```
指令:基础应用;天气查询,<日期>,<城市>
command:basic;weather_query,<date>,<city>
```

| 参数 | 说明 | 示例 |
|:---|:---|:---|
| 日期 | 今天 / 明天 / 后天 / today / tomorrow | `明天` `tomorrow` |
| 城市 | 中文/英文/拼音均可 | `威海` `Weihai` `Beijing` `London` |

---

## 🧩 多样化指令生成方式

一条天气指令可以从多种入口生成——这正是 text-cli 的核心哲学：**不绑定任何特定的调用方式**。

### 1. curl — 最原始，任何语言都能发

```bash
curl -X POST https://<your-worker>.workers.dev/cli/text_cli \
  -H "Content-Type: application/json" \
  -d '{"prompt":"指令:基础应用;天气查询,明天,北京"}'
```

→ [`examples/curl.sh`](./examples/curl.sh)

### 2. Python — 用 text-cli SDK 一行搞定

```python
from call.python.call import call_directive

result = call_directive("指令:基础应用;天气查询,明天,上海")
print(result)  # 2026-05-07 上海, 中国天气: 16℃到28℃, 阴, 日出05:04, 日落18:36
```

→ [`examples/python_call.py`](./examples/python_call.py)

### 3. Node.js — 同样一行

```js
const { callDirective } = require('text-cli-sdk/call/js/call');

const result = await callDirective('指令:基础应用;天气查询,明天,深圳');
console.log(result);
```

→ [`examples/node_call.js`](./examples/node_call.js)

### 4. Shell 脚本 — 用变量拼装指令

```bash
#!/bin/bash
CITY="${1:-威海}"
DATE="${2:-明天}"

RESULT=$(curl -s -X POST https://<your-worker>.workers.dev/cli/text_cli \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"指令:基础应用;天气查询,${DATE},${CITY}\"}")

echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['rst_data']['text'])"
```

→ [`examples/shell_weather.sh`](./examples/shell_weather.sh)

### 5. Markdown → 指令 — 写好手册，自动转化

```markdown
# 天气查询手册

## 明天北京

指令:基础应用;天气查询,明天,北京
```

Agent 读取这个 Markdown，直接提取指令调用——非开发者也能"写"指令。

→ 详见 [text-cli Markdown2Text-cli 指南](https://github.com/weihai-limh/text-cli/blob/main/docs/CN/Markdown2Text-cli_CN.md)

### 6. Agent 自然语言 → 指令 — 你说话，Agent 翻译

```
用户: "明天威海穿什么？"
        │
Agent:  匹配 trigger_keywords ["天气", "气温"...]
        │
Agent:  组装指令 "指令:基础应用;天气查询,明天,威海"
        │
Agent:  POST → 得到 12℃~22℃, 晴
        │
Agent:  推理解析 → "建议薄外套 + 长裤"
```

Agent 负责把自然语言翻译成指令，cliweather 只负责执行。这是 text-cli 调度优先模型的完整闭环。

---

## 架构

```
Agent → 指令文本 → 集成端点 (text-cli-api)
                        │
                        ▼ 路由到
                  cliweather (本服务)
                        │
                 ┌──────┴──────┐
                 ▼              ▼
            Open-Meteo       wttr.in
           (geocode +      (JSON API)
            forecast)
```

**降级链**：Open-Meteo → wttr.in → 返回友好错误

---

## API 端点

| 路径 | 方法 | 说明 |
|:---|:---|:---|
| `/api/health` | GET | 健康检查 |
| `/text_cli_schema.json` | GET | Schema 元数据（Agent 自动发现用） |
| `/cli/text_cli` | POST | 指令执行入口 |

---

## 技术选择

| 选择 | 理由 |
|:---|:---|
| **零依赖** | Worker 只用原生 `fetch`，无 npm 包，体积 < 5KB |
| **零 API Key** | Open-Meteo 和 wttr.in 均免费开放，无需注册 |
| **WMO 天气码** | 标准气象编码 → 中文描述，覆盖 20+ 天气类型 |
| **多语言** | 指令中英文均支持，城市名自动 geocode |
| **双源降级** | 一个挂了自动切另一个，不丢请求 |

---

## 项目结构

```
cliweather/
├── README.md           # 本文件
├── LICENSE             # MIT
├── schema.json         # text-cli Schema（Agent 发现用）
├── package.json        # npm 元信息
├── wrangler.toml       # Cloudflare Workers 配置
├── src/
│   └── index.js        # Worker 完整源码（~200 行）
└── examples/
    ├── README.md       # 示例说明
    ├── curl.sh         # curl 调用示例
    ├── python_call.py  # Python SDK 调用
    ├── node_call.js    # Node.js SDK 调用
    └── shell_weather.sh # Shell 脚本封装
```

---

## 如何贡献

- **加一种新语言生成方式**：用 Go/Rust/Bash/… 写一个 `examples/xxx_call.xx` → 提 PR
- **加更多天气数据源**：在 `src/index.js` 中添加新的 fetch 函数，加入降级链
- **加更多指令参数**：如湿度、风速、空气质量 → 扩展 `parseDirective` 和响应格式
- **翻译文档**：用你的语言写 README → 放入 `docs/` 目录

---

## 灵感

> 蜉蝣不会创造水中的矿物。它只是滤过水流，把散落的营养一点点收集到自己体内。  
> cliweather 也是——它不创造天气数据，只是把 Open-Meteo 和 wttr.in 的信息，翻译成一行 Agent 能理解的文本。
>
> 这是 Tide 🌊 的独立创造。MIT 开源，自由使用。
