/**
 * text-cli-weather — Cloudflare Workers 天气指令服务
 *
 * 数据源: Open-Meteo (优先) → wttr.in (降级) → 错误
 * 指令:   指令:基础应用;天气查询,<日期>,<城市>
 *         支持中/英日期关键字和城市名
 *
 * @author Tide 🌊
 * @date   2026-05-06
 */

// ── 日期关键字映射 ──────────────────────────────

const DAY_MAP = {
  '今天': 0, 'today': 0,
  '明天': 1, 'tomorrow': 1,
  '后天': 2, 'day after tomorrow': 2,
};

// WMO Weather Code → 中文描述
const WMO_CODES = {
  0: '晴', 1: '晴', 2: '多云', 3: '阴',
  45: '雾', 48: '雾凇',
  51: '小雨', 53: '中雨', 55: '大雨',
  61: '小雨', 63: '中雨', 65: '大雨',
  71: '小雪', 73: '中雪', 75: '大雪',
  80: '阵雨', 81: '中阵雨', 82: '大阵雨',
  85: '阵雪', 86: '大阵雪',
  95: '雷暴', 96: '雷暴+冰雹', 99: '强雷暴+冰雹',
};

// ── 工具函数 ────────────────────────────────────

function parseDirective(prompt) {
  const body = prompt.replace(/^(指令|command|directive)[::]/, '').trim();
  if (!body.includes(';')) throw new Error('指令格式错误');

  const [domainAndAction, ...params] = body.split(',');
  const [domain, action] = domainAndAction.split(';');

  return {
    domain: domain.trim(),
    action: action.trim(),
    params: params.map(p => p.trim()).filter(Boolean),
  };
}

function parseDate(dateStr) {
  const key = dateStr.toLowerCase();
  if (DAY_MAP[key] !== undefined) return DAY_MAP[key];

  // 尝试解析 "三天" 等
  if (/^(\d+)天$/i.test(key)) {
    const n = parseInt(key.match(/^(\d+)/)[1]);
    return Math.min(n, 7); // 最多 7 天
  }

  return 1; // 默认明天
}

function wmoToText(code) {
  return WMO_CODES[code] || '未知';
}

// ── Open-Meteo 数据源 ───────────────────────────

async function fetchOpenMeteo(city, dayOffset) {
  // Step 1: geocode city → lat/lon
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`;
  const geoResp = await fetch(geoUrl);
  if (!geoResp.ok) throw new Error('Open-Meteo geocoding failed');
  const geoData = await geoResp.json();
  if (!geoData.results || geoData.results.length === 0) {
    throw new Error(`未找到城市: ${city}`);
  }

  const { latitude, longitude, name, country } = geoData.results[0];
  const displayName = country ? `${name}, ${country}` : name;

  // Step 2: fetch forecast
  const forecastDays = dayOffset + 2; // 多取一天确保覆盖
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode,sunrise,sunset&timezone=auto&forecast_days=${forecastDays}`;
  const weatherResp = await fetch(weatherUrl);
  if (!weatherResp.ok) throw new Error('Open-Meteo forecast failed');
  const weatherData = await weatherResp.json();

  const daily = weatherData.daily;
  const idx = Math.min(dayOffset, daily.time.length - 1);
  const date = daily.time[idx];
  const maxTemp = Math.round(daily.temperature_2m_max[idx]);
  const minTemp = Math.round(daily.temperature_2m_min[idx]);
  const weatherCode = daily.weathercode[idx];
  const weatherText = wmoToText(weatherCode);
  const sunrise = daily.sunrise ? daily.sunrise[idx].split('T')[1] : '--';
  const sunset = daily.sunset ? daily.sunset[idx].split('T')[1] : '--';

  return {
    source: 'Open-Meteo',
    text: `${date} ${displayName}天气: ${minTemp}℃到${maxTemp}℃, ${weatherText}, 日出${sunrise}, 日落${sunset}`,
  };
}

// ── wttr.in 降级数据源 ──────────────────────────

async function fetchWttrIn(city, dayOffset) {
  const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('wttr.in request failed');
  const data = await resp.json();

  const weather = data.weather;
  if (!weather) throw new Error('wttr.in data format error');

  // 当天: day 0, 明天: day 1, ...
  const dayIdx = Math.min(dayOffset, weather.length - 1);
  const day = weather[dayIdx];
  const date = day.date;
  const maxTemp = day.maxtempC;
  const minTemp = day.mintempC;
  const desc = day.hourly[4]?.weatherDesc?.[0]?.value || '未知';
  const astronomy = day.astronomy?.[0];
  const sunrise = astronomy?.sunrise || '--';
  const sunset = astronomy?.sunset || '--';

  return {
    source: 'wttr.in',
    text: `${date} ${city}天气: ${minTemp}℃到${maxTemp}℃, ${desc}, 日出${sunrise}, 日落${sunset}`,
  };
}

// ── 主处理流程 ──────────────────────────────────

async function handleWeather(prompt) {
  const { params } = parseDirective(prompt);

  if (params.length < 2) {
    return { error: '参数不足: 需要 <日期> 和 <城市>' };
  }

  const dateStr = params[0];
  const city = params[1];
  const dayOffset = parseDate(dateStr);

  try {
    return await fetchOpenMeteo(city, dayOffset);
  } catch (e1) {
    console.log(`Open-Meteo failed: ${e1.message}, trying wttr.in...`);
    try {
      return await fetchWttrIn(city, dayOffset);
    } catch (e2) {
      console.log(`wttr.in failed: ${e2.message}`);
      return { error: `天气查询失败: 所有数据源均不可用 (Open-Meteo: ${e1.message}, wttr.in: ${e2.message})` };
    }
  }
}

// ── Worker 入口 ─────────────────────────────────

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 健康检查
    if (path === '/api/health') {
      return Response.json({ status: 'ok', service: 'text-cli-weather', version: '1.0.0' });
    }

    // Schema
    if (path === '/text_cli_schema.json') {
      return Response.json({
        weather_query_v2: {
          id: 'weather_query_v2',
          name: '天气查询（开放数据源）',
          category: '基础应用',
          description: '根据日期和城市返回天气（Open-Meteo / wttr.in 双源降级）',
          directive: '指令:基础应用;天气查询',
          directive_aliases: ['command:basic;weather_query'],
          parameters: [
            { name: 'time', type: 'string', enum: ['今天', '明天', '后天', 'today', 'tomorrow'] },
            { name: 'city', type: 'string', examples: ['威海', 'Weihai', '北京', 'Beijing', 'London', '東京'] },
          ],
          prompt_template: '指令:基础应用;天气查询,{time},{city}',
          trigger_keywords: ['天气', '气温', 'weather', 'temperature', '下雨', 'rain'],
          response_type: 'text',
          response_example: {
            rst_types: 'text',
            rst_data: {
              text: '2026-05-07 威海天气: 12℃到22℃, 晴转多云, 日出05:01, 日落18:45',
            },
          },
        },
      });
    }

    // 指令入口
    if (path === '/cli/text_cli' && request.method === 'POST') {
      try {
        const body = await request.json();
        const prompt = body.prompt;

        if (!prompt) {
          return Response.json({
            rst_types: 'text',
            rst_data: { text: '错误: 缺少 prompt 字段' },
          }, { status: 400 });
        }

        const result = await handleWeather(prompt);

        if (result.error) {
          return Response.json({
            rst_types: 'text',
            rst_data: { text: `指令执行失败: ${result.error}` },
          });
        }

        return Response.json({
          rst_types: 'text',
          rst_data: { text: result.text },
        });
      } catch (e) {
        return Response.json({
          rst_types: 'text',
          rst_data: { text: `指令执行失败: ${e.message}` },
        });
      }
    }

    // 404
    return Response.json({
      rst_types: 'text',
      rst_data: { text: '未找到匹配的端点' },
    }, { status: 404 });
  },
};
