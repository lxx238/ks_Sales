import json
import re
from typing import Any, Dict, List, Optional, Tuple
from urllib import error as urllib_error
from urllib import request as urllib_request

from backend.config.settings import SILICONFLOW_API_KEY, SILICONFLOW_API_URL, SILICONFLOW_MODEL, SILICONFLOW_VISION_MODEL


SYSTEM_PROMPT_QUOTATION = """你是一个专业的采购报价信息提取助手。
你的任务是从供应商回复的报价邮件内容中，提取结构化的物料报价信息。

规则：
1. 严格按照给定的 JSON 格式输出，不要输出任何其他内容。
2. 如果某个字段在内容中找不到，填空字符串 "" 或 0。
3. 售价必须是数字（浮点数），不能包含货币符号，保留完整小数位数，不要截断或四舍五入。

4. 【币种判断 — 最重要】
   你必须综合以下所有线索判断每一行价格的币种：
   a) 价格单元格中的货币符号：$ → 美元，￥ 或 ¥ → 人民币，€ → 欧元
   b) 价格列前一列的符号（很多表格把币种符号放在价格的左侧列）
   c) 单位列中的文字：如"欧元/"、"美元/套"、"元/个"、"EUR/pc" 等
      - "元/" 或 "元/个" 等表示人民币
      - "美元/" 或 "USD" 表示美元
      - "欧元/" 或 "EUR" 表示欧元
   d) 列头名称：如"售价(欧元)"、"单价(USD)"、"人民币价" 等
   e) 邮件正文或表格标题中的上下文：如"以下报价单位为欧元"、"Unit Price (EUR)" 等

   判断后按以下规则填写：
   - 如果是美元 → "售价-美元" 填价格数值，"售价-人民币" 和 "售价-欧元" 填 0
   - 如果是人民币 → "售价-人民币" 填价格数值，"售价-美元" 和 "售价-欧元" 填 0
   - 如果是欧元 → "售价-欧元" 填价格数值，"售价-美元" 和 "售价-人民币" 填 0
   - 如果无法确定币种 → 三个都填 0，把原始数值填入"售价(原值)"

5. "单位"字段必须如实填写原始内容，不要省略币种部分。例如：
   - 如果原文是"欧元/" → 单位填"欧元/"
   - 如果原文是"美元/套" → 单位填"美元/套"
   - 如果原文是"元/个" → 单位填"元/个"
   - 如果原文是"pcs" → 单位填"pcs"

6. 日期统一格式为 YYYY-MM-DD。
7. 如果有效期是"30天""60天"这样的描述，根据报价日期计算截止日期。
8. 参考折扣保留原始描述，如"9.5折""95%""95"。
9. 即使只有一行报价，也要输出 JSON 数组格式。
10. 多行报价输出多个数组元素。
11. 数量字段必须提取，不同数量对应不同价格。

输出格式（严格 JSON）：
{
  "items": [
    {
      "询价人": "",
      "物料编码": "",
      "名称": "",
      "规格": "",
      "类别": "",
      "数量": 0,
      "售价-美元": 0.00,
      "售价-人民币": 0.00,
      "售价-欧元": 0.00,
      "售价(原值)": 0.00,
      "单位": "",
      "报价日期": "",
      "有效期": "",
      "参考折扣": ""
    }
  ]
}"""


def _call_siliconflow(messages: List[Dict[str, Any]], use_json_format: bool = True, use_vision: bool = False) -> Tuple[str, Dict[str, Any]]:
    if not SILICONFLOW_API_KEY:
        raise RuntimeError('未配置 SiliconFlow API Key')

    model = SILICONFLOW_VISION_MODEL if use_vision else SILICONFLOW_MODEL
    payload = {
        'model': model,
        'messages': list(messages),
        'temperature': 0.1,
        'max_tokens': 8192,
    }
    if use_json_format:
        payload['response_format'] = {'type': 'json_object'}
    request_body = json.dumps(payload).encode('utf-8')
    request_obj = urllib_request.Request(
        SILICONFLOW_API_URL,
        data=request_body,
        headers={
            'Authorization': f'Bearer {SILICONFLOW_API_KEY}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )

    try:
        with urllib_request.urlopen(request_obj, timeout=180) as response:
            response_text = response.read().decode('utf-8')
    except urllib_error.HTTPError as exc:
        body = exc.read().decode('utf-8', errors='ignore')
        raise RuntimeError(f'SiliconFlow 请求失败 (HTTP {exc.code}): {_extract_error(body)}')
    except urllib_error.URLError as exc:
        raise RuntimeError(f'无法连接 SiliconFlow: {exc.reason}')

    resp = json.loads(response_text)
    choices = resp.get('choices') or []
    if not choices:
        raise RuntimeError('SiliconFlow 未返回可用结果')

    message = choices[0].get('message') or {}
    content = message.get('content', '')
    if isinstance(content, list):
        text = ''.join(part.get('text', '') for part in content if isinstance(part, dict))
    else:
        text = str(content or '')

    if not text.strip():
        raise RuntimeError('SiliconFlow 返回为空')

    return text, resp.get('usage') or {}


def _extract_error(body: str) -> str:
    if body:
        try:
            payload = json.loads(body)
            if isinstance(payload, dict):
                err = payload.get('error')
                if isinstance(err, dict) and err.get('message'):
                    return err['message']
                if payload.get('message'):
                    return payload['message']
        except json.JSONDecodeError:
            pass
    return ''


def _parse_quotation_json(raw: str) -> List[Dict[str, Any]]:
    cleaned = raw.strip()
    if cleaned.startswith('```'):
        cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned)
        cleaned = re.sub(r'\s*```$', '', cleaned)

    if not cleaned.startswith('{'):
        match = re.search(r'\{.*\}', cleaned, re.S)
        if match:
            cleaned = match.group(0)

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        for fix in (']}', ']}', '}', ']'):
            try:
                parsed = json.loads(cleaned + fix)
                break
            except json.JSONDecodeError:
                continue
        else:
            brace_pos = cleaned.rfind('}')
            if brace_pos > 0:
                try:
                    inner = '[' + cleaned[:brace_pos + 1] + ']'
                    parsed = json.loads(inner)
                except json.JSONDecodeError:
                    print(f'[LLM] JSON repair failed, raw: {cleaned[:200]}')
                    return []
            else:
                print(f'[LLM] JSON parse failed, raw: {cleaned[:200]}')
                return []

    items = parsed.get('items') or []
    if isinstance(parsed, list):
        items = parsed

    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        raw_price = item.get('售价', 0)
        try:
            price = float(str(raw_price).replace(',', '').replace('￥', '').replace('¥', '').replace('$', '').replace('€', '').strip())
        except (TypeError, ValueError):
            price = 0.0

        def _parse_price_field(key):
            v = item.get(key, 0)
            try:
                val = float(str(v).replace(',', '').replace('￥', '').replace('¥', '').replace('$', '').replace('€', '').strip())
                return val if val > 0 else None
            except (TypeError, ValueError):
                return None

        usd = _parse_price_field('售价-美元')
        cny = _parse_price_field('售价-人民币')
        eur = _parse_price_field('售价-欧元')
        raw_val = _parse_price_field('售价(原值)')

        if usd is None and cny is None and eur is None:
            fallback_price = raw_val if raw_val is not None else price
            if fallback_price and fallback_price > 0:
                unit_text = str(item.get('单位', '') or '').strip()
                fallback_cur = _detect_currency_from_text(unit_text)
                if fallback_cur == 'USD':
                    usd = fallback_price
                elif fallback_cur == 'CNY':
                    cny = fallback_price
                elif fallback_cur == 'EUR':
                    eur = fallback_price
            price = fallback_price if fallback_price else price
        else:
            price = usd or cny or eur or 0.0

        raw_qty = item.get('数量', 0)
        try:
            qty = float(str(raw_qty).replace(',', '').strip())
        except (TypeError, ValueError):
            qty = 0.0

        result.append({
            'inquirer': str(item.get('询价人', '') or '').strip(),
            'material_code': str(item.get('物料编码', '') or '').strip(),
            'name': str(item.get('名称', '') or '').strip(),
            'spec': str(item.get('规格', '') or '').strip(),
            'category': str(item.get('类别', '') or '').strip(),
            'quantity': qty,
            'unit_price': price,
            'unit_price_usd': usd,
            'unit_price_cny': cny,
            'unit_price_eur': eur,
            'unit': str(item.get('单位', '') or '').strip(),
            'quotation_date': str(item.get('报价日期', '') or '').strip(),
            'valid_until': str(item.get('有效期', '') or '').strip(),
            'discount': str(item.get('参考折扣', '') or '').strip(),
        })

    return result


def _detect_currency_from_text(text: str) -> Optional[str]:
    t = str(text or '').strip()
    if not t:
        return None
    for sym, cur in [('€', 'EUR'), ('$', 'USD'), ('￥', 'CNY'), ('¥', 'CNY')]:
        if sym in t:
            return cur
    tl = t.lower()
    for kw, cur in [('人民币', 'CNY'), ('rmb', 'CNY'), ('cny', 'CNY'),
                     ('美元', 'USD'), ('usd', 'USD'), ('dollar', 'USD'),
                     ('欧元', 'EUR'), ('eur', 'EUR'), ('euro', 'EUR')]:
        if kw in tl:
            return cur
    if t == '元' or t.startswith('元/') or t.startswith('元\\') or t.startswith('元 '):
        return 'CNY'
    return None


def extract_quotation_from_text(text_content: str) -> List[Dict[str, Any]]:
    messages = [
        {'role': 'system', 'content': SYSTEM_PROMPT_QUOTATION},
        {
            'role': 'user',
            'content': f'请从以下报价内容中提取结构化信息：\n\n{text_content}',
        },
    ]
    raw_reply, usage = _call_siliconflow(messages, use_json_format=True)
    print(f'[LLM] Text extraction usage: {usage}')
    return _parse_quotation_json(raw_reply)


def extract_quotation_from_images(base64_images: List[Tuple[str, str]]) -> List[Dict[str, Any]]:
    user_content = [{'type': 'text', 'text': '请从以下报价图片中提取结构化信息：'}]
    for mime_type, b64_data in base64_images:
        user_content.append({
            'type': 'image_url',
            'image_url': {'url': f'data:{mime_type};base64,{b64_data}'},
        })

    messages = [
        {'role': 'system', 'content': SYSTEM_PROMPT_QUOTATION},
        {'role': 'user', 'content': user_content},
    ]
    raw_reply, usage = _call_siliconflow(messages, use_json_format=False, use_vision=True)
    print(f'[LLM] Image extraction usage: {usage}')
    return _parse_quotation_json(raw_reply)


def extract_quotation_mixed(text_content: str, base64_images: List[Tuple[str, str]]) -> List[Dict[str, Any]]:
    user_content = [{'type': 'text', 'text': f'请从以下报价内容中提取结构化信息：\n\n{text_content}'}]
    for mime_type, b64_data in base64_images:
        user_content.append({
            'type': 'image_url',
            'image_url': {'url': f'data:{mime_type};base64,{b64_data}'},
        })

    messages = [
        {'role': 'system', 'content': SYSTEM_PROMPT_QUOTATION},
        {'role': 'user', 'content': user_content},
    ]
    raw_reply, usage = _call_siliconflow(messages, use_json_format=False, use_vision=True)
    print(f'[LLM] Mixed extraction usage: {usage}')
    return _parse_quotation_json(raw_reply)
