# cliweather 示例

这里展示了 **6 种不同的方式**生成和调用同一条天气指令。

## 核心思想

一条 `指令:基础应用;天气查询,明天,威海` 可以从任何语言、任何框架生成。

text-cli 的力量在于：**指令只是文本**。不需要 SDK、不需要特定语言、不需要框架——任何能发 HTTP 请求的东西都能用。

## 示例清单

| 文件 | 语言/工具 | 适用场景 |
|:---|:---|:---|
| [`curl.sh`](./curl.sh) | Bash + curl | 命令行直接调用，快速测试 |
| [`python_call.py`](./python_call.py) | Python | 脚本、后端集成、数据分析 |
| [`node_call.js`](./node_call.js) | Node.js | Web 服务、Serverless、Bot |
| [`shell_weather.sh`](./shell_weather.sh) | Shell 脚本 | 定时任务、系统脚本、cron |

## 不只是代码

除了这 4 种代码方式，还有两种非代码方式：

### 5. Markdown → 指令

写好一份天气查询手册，Agent 读取后自动提取指令调用。

```markdown
# 天气查询

## 明天北京
指令:基础应用;天气查询,明天,北京

## 后天上海
指令:基础应用;天气查询,后天,上海
```

→ 详见 [text-cli Markdown2Text-cli 指南](https://github.com/weihai-limh/text-cli/blob/main/docs/CN/Markdown2Text-cli_CN.md)

### 6. 自然语言 → Agent → 指令

```
用户: "后天深圳会不会下雨？"
        │
Agent:  识别意图 → 匹配 trigger_keywords
        │
Agent:  组装 → "指令:基础应用;天气查询,后天,深圳"
        │
cliweather:  返回天气文本
        │
Agent:  解读结果 → "后天深圳晴天，不会下雨，温度 20-28°C"
```

这是最自然的入口——用户不需要知道"指令"是什么。Agent 做翻译，cliweather 做执行。

---

## 添加你的语言

想加 Go 版本？Rust 版本？Zig 版本？提 PR！示例越丰富，越能证明 **text-cli 不绑定任何语言**。
