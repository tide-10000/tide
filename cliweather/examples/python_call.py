#!/usr/bin/env python3
"""
cliweather — Python 调用示例

需要 text-cli SDK:
  git clone https://github.com/weihai-limh/text-cli.git
  # 然后将 text_cli/agent/call/python/ 加入 PYTHONPATH

用法:
  python python_call.py
  python python_call.py 上海 后天
"""

import sys
import os

# 方式 A: 使用 text-cli SDK（推荐）
# 取消下面注释并配置 SDK 路径
#
# sys.path.insert(0, '/path/to/text-cli/text_cli/agent/call/python')
# from call import call_directive
# result = call_directive("指令:基础应用;天气查询,明天,北京")
# print(result)


# 方式 B: 纯 requests（零依赖 SDK 也行）
import json
import urllib.request

def weather_query(city: str = "威海", date: str = "明天", endpoint: str = None) -> str:
    """
    发送天气查询指令

    Args:
        city: 城市名（中文/英文）
        date: 日期（今天/明天/后天）
        endpoint: text-cli 端点 URL（默认从环境变量读取）

    Returns:
        天气结果文本
    """
    if endpoint is None:
        endpoint = os.environ.get(
            "CLIWEATHER_ENDPOINT",
            "https://your-worker.workers.dev/cli/text_cli"
        )

    directive = f"指令:基础应用;天气查询,{date},{city}"
    data = json.dumps({"prompt": directive}).encode("utf-8")

    req = urllib.request.Request(
        endpoint,
        data=data,
        headers={"Content-Type": "application/json"}
    )

    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        return result["rst_data"]["text"]


if __name__ == "__main__":
    city = sys.argv[1] if len(sys.argv) > 1 else "威海"
    date = sys.argv[2] if len(sys.argv) > 2 else "明天"

    try:
        text = weather_query(city, date)
        print(text)
    except Exception as e:
        print(f"天气查询失败: {e}")
