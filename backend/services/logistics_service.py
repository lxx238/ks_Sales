import json
import os
import re
import shutil
import time
import uuid
import zipfile
import base64
import xml.etree.ElementTree as ET
from io import BytesIO

import pdfplumber
import pypdfium2
import requests as http_requests

from backend.config.settings import BASE_DIR

LOGISTICS_SESSIONS_DIR = BASE_DIR / 'data' / 'logistics_sessions'
LOGISTICS_INPUT_DIR = BASE_DIR / 'input'
LOGISTICS_SHARED_OUTPUT_DIR = BASE_DIR / 'output' / 'logistics_shared'

PROMPT_DOCX_PATH = LOGISTICS_INPUT_DIR / '提示词_1.docx'
SESSION_EXPIRE_SECONDS = 3600


def _ensure_dirs():
    LOGISTICS_SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    LOGISTICS_SHARED_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def get_session_dirs(session_id):
    base = LOGISTICS_SESSIONS_DIR / session_id
    return {
        'base': str(base),
        'output': str(base / 'output'),
        'output_new': str(base / 'output_new'),
    }


def cleanup_expired_sessions():
    _ensure_dirs()
    now = time.time()
    for name in os.listdir(str(LOGISTICS_SESSIONS_DIR)):
        path = LOGISTICS_SESSIONS_DIR / name
        if not path.is_dir():
            continue
        try:
            mtime = os.path.getmtime(str(path))
            if now - mtime > SESSION_EXPIRE_SECONDS:
                shutil.rmtree(str(path), ignore_errors=True)
        except Exception:
            pass


def create_session():
    _ensure_dirs()
    cleanup_expired_sessions()
    session_id = uuid.uuid4().hex[:12]
    dirs = get_session_dirs(session_id)
    os.makedirs(dirs['output'], exist_ok=True)
    os.makedirs(dirs['output_new'], exist_ok=True)
    copy_shared_files(dirs['output'])
    return session_id


def copy_shared_files(session_output_dir):
    for fname in ['logo_en.png', 'logo_ja.png']:
        src = LOGISTICS_SHARED_OUTPUT_DIR / fname
        if src.exists():
            os.makedirs(session_output_dir, exist_ok=True)
            shutil.copy2(str(src), os.path.join(session_output_dir, fname))


BUILTIN_PROMPT = """你是一位专业的工业物流排柜图数据提取专家。你的任务是从用户提供的PDF排柜图中，精确提取所有物料信息，并按照规定的JSON格式输出三个数据集。

## 数据结构说明

### 1. 托盘清单
每个托盘对象包含：
- 托盘序号（string）：如 "001#"、"002#"...，按顺序编号
- 托盘编码（string）：如有则填，如 "P001"
- 订单号（string）：该托盘对应的订单编号
- 物料明细（array）：该托盘上装载的所有物料列表
  每个物料对象包含：
  - 物料编码（string）：如 "ASM-38160-01"、"KT-002" 等
  - 类型（string）：取值为 "中文名称"、"套装编码"、"英文物料" 之一
    * 若该编码在某中文包装清单的"包装清单名称"中出现 → "中文名称"
    * 若编码以 ASM- 开头且为套装 → "套装编码"
    * 其他 → "英文物料"
  - 数量（string）：如 "10"、"2套"、"5件"

### 2. 英文单套预装明细
每个套装对象包含：
- 套装编码（string）：如 "ASM-38160-01"
- 物料明细（array）：该套装包含的所有组成物料
  每个物料对象包含：
  - 物料编码（string）
  - 类型（string）：同上规则
  - 数量（string）

### 3. 中文包装清单参考
每个包装清单对象包含：
- 包装清单名称（string）：如 "主架包装清单"、"配件包装清单" 等
- 物料明细（array）：该包装清单包含的所有物料
  每个物料对象包含：
  - 物料编码（string）
  - 类型（string）：同上规则
  - 数量（string）

## 提取规则
1. 仔细阅读PDF排柜图中的每一页，提取所有可见的托盘、物料、编码、数量信息
2. 物料编码格式通常为 ASM-XXXXX-NN 或 KT-XXX 等
3. 数量尽量保留原始单位（如"套"、"件"等）
4. 如果信息不完整，仍然输出已知字段，缺失字段用空字符串""填充
5. 确保输出的JSON格式严格正确，所有键名和字符串值用双引号
6. 不要编造数据，只提取PDF中实际存在的信息"""


def load_prompt_from_docx():
    prompt_path = PROMPT_DOCX_PATH
    if not prompt_path.exists():
        prompt_alt = BASE_DIR / '物流组' / 'input' / '提示词_1.docx'
        if prompt_alt.exists():
            prompt_path = prompt_alt
        else:
            return BUILTIN_PROMPT
    try:
        with zipfile.ZipFile(str(prompt_path)) as z:
            xml_content = z.read('word/document.xml')
        tree = ET.fromstring(xml_content)
        lines = []
        for p in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
            line = ''
            for r in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'):
                if r.text:
                    line += r.text
            lines.append(line)
        return '\n'.join(lines)
    except Exception:
        return BUILTIN_PROMPT


def find_json_blocks(text, start_char='[', end_char=']'):
    blocks = []
    pos = 0
    while True:
        idx = text.find(start_char, pos)
        if idx == -1:
            break
        depth = 0
        in_str = False
        esc = False
        for i in range(idx, len(text)):
            ch = text[i]
            if esc:
                esc = False
                continue
            if ch == '\\' and in_str:
                esc = True
                continue
            if ch == '"':
                in_str = not in_str
                continue
            if in_str:
                continue
            if ch in '[{':
                depth += 1
            elif ch in ']}':
                depth -= 1
                if depth == 0:
                    blocks.append(text[idx:i + 1])
                    pos = i + 1
                    break
        else:
            pos = idx + 1
    return blocks


def try_parse(text):
    for attempt in [text, re.sub(r',\s*([}\]])', r'\1', text)]:
        try:
            return json.loads(attempt)
        except Exception:
            continue
    return None


def extract_array(text, marker):
    all_blocks = find_json_blocks(text, '[', ']')
    for block in all_blocks:
        if marker in block:
            result = try_parse(block)
            if result:
                return result
    obj_blocks = find_json_blocks(text, '{', '}')
    items = [b for b in obj_blocks if marker in b]
    if items:
        merged = '[' + ','.join(items) + ']'
        result = try_parse(merged)
        if result:
            return result
    return []


def pdf_to_images_base64(pdf_bytes, scale=4):
    images_b64 = []
    pdf = pypdfium2.PdfDocument(pdf_bytes)
    for i in range(len(pdf)):
        page = pdf[i]
        bitmap = page.render(scale=scale)
        pil_img = bitmap.to_pil()
        buf = BytesIO()
        pil_img.save(buf, format='JPEG', quality=95)
        img_b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
        images_b64.append(img_b64)
    pdf.close()
    return images_b64


def pdf_to_text(pdf_bytes):
    text_parts = []
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        for i, page in enumerate(pdf.pages):
            page_text = page.extract_text()
            if page_text:
                text_parts.append(f"=== 第{i+1}页 ===\n{page_text}")
    return '\n\n'.join(text_parts)


def sse_pack(data):
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _stream_anthropic_api(api_base, api_key, model, prompt, images_b64):
    url = f"{api_base}/v1/messages"
    headers = {
        'Content-Type': 'application/json',
        'x-api-key': api_key,
        'anthropic-version': '2023-06-01',
    }
    content = [{'type': 'text', 'text': prompt}]
    for img_b64 in images_b64:
        content.append({
            'type': 'image',
            'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': img_b64}
        })
    payload = {
        'model': model,
        'max_tokens': 16384,
        'stream': True,
        'messages': [{'role': 'user', 'content': content}]
    }
    resp = http_requests.post(url, headers=headers, json=payload, timeout=300, stream=True)
    if resp.status_code != 200:
        raise Exception(f"API {resp.status_code}: {resp.text[:500]}")
    full_text = ''
    usage = {}
    for line in resp.iter_lines(decode_unicode=True):
        if not line or not line.startswith('data: '):
            continue
        data_str = line[6:]
        try:
            chunk = json.loads(data_str)
        except Exception:
            continue
        if chunk.get('type') == 'content_block_delta':
            token = chunk.get('delta', {}).get('text', '')
            if token:
                full_text += token
                yield token, None
        if chunk.get('type') == 'message_delta':
            u = chunk.get('usage', {})
            if u:
                usage.update(u)
            delta = chunk.get('delta', {})
            if delta.get('stop_reason'):
                yield None, usage
    if not usage:
        yield None, usage


def _stream_openai_api(api_base, api_key, model, prompt, images_b64):
    url = f"{api_base}/chat/completions"
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}',
    }
    content = [{'type': 'text', 'text': prompt}]
    for img_b64 in images_b64:
        content.append({
            'type': 'image_url',
            'image_url': {'url': f'data:image/jpeg;base64,{img_b64}'}
        })
    payload = {
        'model': model,
        'max_tokens': 16384,
        'stream': True,
        'stream_options': {'include_usage': True},
        'messages': [{'role': 'user', 'content': content}]
    }
    resp = http_requests.post(url, headers=headers, json=payload, timeout=300, stream=True)
    if resp.status_code != 200:
        raise Exception(f"API {resp.status_code}: {resp.text[:500]}")
    full_text = ''
    usage = {}
    for line in resp.iter_lines(decode_unicode=True):
        if not line or not line.startswith('data: '):
            continue
        data_str = line[6:]
        if data_str.strip() == '[DONE]':
            break
        try:
            chunk = json.loads(data_str)
        except Exception:
            continue
        choices = chunk.get('choices', [])
        if choices:
            delta = choices[0].get('delta', {})
            token = delta.get('content', '')
            if token:
                full_text += token
                yield token, None
        u = chunk.get('usage')
        if u:
            usage.update(u)
            yield None, usage
    if not usage:
        yield None, usage


def _is_openai_api(api_base, model):
    return 'moonshot' in api_base or 'kimi' in model.lower()


def generate_stream(pdf_bytes, pdf_filename, pallet_qty, kit_qty, chinese_qty,
                    pallet_remarks, kit_remarks, chinese_remarks,
                    api_base, api_key, model, send_mode, session_id):
    dirs = get_session_dirs(session_id)
    output_new_dir = dirs['output_new']

    if os.path.exists(output_new_dir):
        shutil.rmtree(output_new_dir)
    os.makedirs(output_new_dir, exist_ok=True)

    pdf_save_path = os.path.join(dirs['base'], pdf_filename)
    with open(pdf_save_path, 'wb') as f:
        f.write(pdf_bytes)

    yield sse_pack({'type': 'status', 'msg': f'开始处理: 托盘{pallet_qty}个, 英文套装{kit_qty}个, 中文清单{chinese_qty}个, 模型={model}'})

    non_vision_models = ['glm-4', 'glm-3', 'chatglm']
    is_vision = 'v' in model.lower() or 'flash' not in model.lower()
    for nv in non_vision_models:
        if nv in model.lower() and 'v' not in model.lower().split(nv)[0][-1:]:
            is_vision = False
            break

    actual_mode = send_mode
    if send_mode in ('both', 'image') and not is_vision:
        actual_mode = 'text'
        yield sse_pack({'type': 'status', 'msg': f'模型 {model} 不支持图片输入，已自动切换为仅文本模式', 'warn': True})

    mode_labels = {'both': '图片+文本', 'image': '仅图片', 'text': '仅文本'}
    yield sse_pack({'type': 'status', 'msg': f'发送模式: {mode_labels.get(actual_mode, actual_mode)}'})

    images_b64 = []
    if actual_mode in ('both', 'image'):
        images_b64 = pdf_to_images_base64(pdf_bytes, scale=4)
        yield sse_pack({'type': 'status', 'msg': f'PDF已转为 {len(images_b64)} 张放大图片'})

    pdf_text = ''
    if actual_mode in ('both', 'text'):
        pdf_text = pdf_to_text(pdf_bytes)
        yield sse_pack({'type': 'status', 'msg': f'PDF已提取文本 ({len(pdf_text)} 字)'})

    prompt_text = load_prompt_from_docx()
    prompt_source = '内置' if len(prompt_text) > 100 and not PROMPT_DOCX_PATH.exists() else '提示词文件'
    yield sse_pack({'type': 'status', 'msg': f'已加载提示词 ({len(prompt_text)} 字, 来源: {prompt_source})'})

    user_input = f"""麻烦根据上面提示词帮我生成3个json

输入参数
- 托盘数量：共约{pallet_qty}个
- 托盘备注：{pallet_remarks or '无'}
- 英文套装数量：共{kit_qty}个
- 英文套装备注：{kit_remarks or '无'}
- 中文清单数量：共{chinese_qty}个
- 中文清单备注：{chinese_remarks or '无'}

请严格按以下格式输出3个JSON数组，用明确的分隔标记分开：
===托盘清单===
[JSON数组]
===英文单套预装明细===
[JSON数组]
===中文包装清单参考===
[JSON数组]"""

    prompt = prompt_text + '\n\n' + user_input
    if pdf_text.strip():
        prompt += f'\n\n以下是PDF提取的文本内容，结合上面的排柜图图片一起分析：\n\n{pdf_text}'

    parts = []
    if images_b64:
        parts.append(f'图片({len(images_b64)}张)')
    if pdf_text:
        parts.append(f'文本({len(pdf_text)}字)')
    send_label = ' + '.join(parts) + ' + 提示词文件 → AI' if parts else '提示词文件 → AI'
    yield sse_pack({'type': 'send', 'label': f'>>> {send_label}'})

    t_start = time.time()
    is_openai = _is_openai_api(api_base, model)
    if is_openai:
        stream_gen = _stream_openai_api(api_base, api_key, model, prompt, images_b64)
    else:
        stream_gen = _stream_anthropic_api(api_base, api_key, model, prompt, images_b64)

    ai_text = ''
    final_usage = {}
    for token_text, usage_chunk in stream_gen:
        if token_text:
            ai_text += token_text
            yield sse_pack({'type': 'token', 'text': token_text})
        if usage_chunk:
            final_usage.update(usage_chunk)

    elapsed = round(time.time() - t_start, 1)
    in_t = final_usage.get('input_tokens', 0)
    out_t = final_usage.get('output_tokens', 0)
    yield sse_pack({'type': 'recv', 'label': f'<<< AI回复 ({elapsed}s, in:{in_t} out:{out_t} tokens)', 'text': ai_text[:16000], 'tokens': {'input': in_t, 'output': out_t}})

    all_pallets = []
    all_english = []
    all_chinese = []

    sections = re.split(r'===\s*(托盘清单|英文单套预装明细|中文包装清单参考)\s*===', ai_text)
    section_map = {}
    for i in range(1, len(sections), 2):
        key = sections[i]
        val = sections[i + 1] if i + 1 < len(sections) else ''
        section_map[key] = val.strip()

    if '托盘清单' in section_map:
        all_pallets = extract_array(section_map['托盘清单'], '托盘序号')
        if not all_pallets:
            all_pallets = extract_array(section_map['托盘清单'], '托盘编码')
    else:
        all_pallets = extract_array(ai_text, '托盘序号')
        if not all_pallets:
            all_pallets = extract_array(ai_text, '托盘编码')
    yield sse_pack({'type': 'parsed', 'msg': f'托盘清单: 提取到 {len(all_pallets)} 条', 'ok': len(all_pallets) > 0})

    if '英文单套预装明细' in section_map:
        all_english = extract_array(section_map['英文单套预装明细'], '套装编码')
    elif kit_qty > 0:
        all_english = extract_array(ai_text, '套装编码')
    if kit_qty > 0:
        yield sse_pack({'type': 'parsed', 'msg': f'英文单套预装明细: 提取到 {len(all_english)} 个套装', 'ok': len(all_english) > 0})

    if '中文包装清单参考' in section_map:
        all_chinese = extract_array(section_map['中文包装清单参考'], '包装清单名称')
    elif chinese_qty > 0:
        all_chinese = extract_array(ai_text, '包装清单名称')
    if chinese_qty > 0:
        yield sse_pack({'type': 'parsed', 'msg': f'中文包装清单参考: 提取到 {len(all_chinese)} 个清单', 'ok': len(all_chinese) > 0})

    saved = {'pallet': 0, 'english': 0, 'chinese': 0}
    if all_pallets:
        with open(os.path.join(output_new_dir, '托盘清单.json'), 'w', encoding='utf-8') as f:
            json.dump(all_pallets, f, ensure_ascii=False, indent=2)
        saved['pallet'] = len(all_pallets)
    if all_english:
        with open(os.path.join(output_new_dir, '英文单套预装明细.json'), 'w', encoding='utf-8') as f:
            json.dump(all_english, f, ensure_ascii=False, indent=2)
        saved['english'] = len(all_english)
    if all_chinese:
        with open(os.path.join(output_new_dir, '中文包装清单参考.json'), 'w', encoding='utf-8') as f:
            json.dump(all_chinese, f, ensure_ascii=False, indent=2)
        saved['chinese'] = len(all_chinese)

    meta = {
        'api_base': api_base,
        'api_key': api_key,
        'model': model,
        'initial_messages': [
            {'role': 'user', 'content': prompt},
            {'role': 'assistant', 'content': ai_text}
        ]
    }
    with open(os.path.join(dirs['base'], 'chat_meta.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    with open(os.path.join(dirs['base'], 'chat_history.json'), 'w', encoding='utf-8') as f:
        json.dump(meta['initial_messages'], f, ensure_ascii=False, indent=2)

    yield sse_pack({
        'type': 'done',
        'saved': saved,
        'pallet': all_pallets,
        'english': all_english,
        'chinese': all_chinese
    })


def save_json(session_id, filename, json_data):
    dirs = get_session_dirs(session_id)
    output_new_dir = dirs['output_new']
    if not os.path.exists(output_new_dir):
        return False, '会话不存在'
    allowed = {'托盘清单.json', '英文单套预装明细.json', '中文包装清单参考.json'}
    if filename not in allowed:
        return False, '不允许的文件名'
    filepath = os.path.join(output_new_dir, filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)
    return True, filename


def extract_pages(session_id, page_input):
    dirs = get_session_dirs(session_id)
    if not os.path.exists(dirs['base']):
        return False, '会话不存在', None

    pdf_path = None
    for fname in os.listdir(dirs['base']):
        if fname.lower().endswith('.pdf'):
            pdf_path = os.path.join(dirs['base'], fname)
            break
    if not pdf_path:
        for fname in os.listdir(dirs['output']):
            if fname.lower().endswith('.pdf'):
                pdf_path = os.path.join(dirs['output'], fname)
                break
    if not pdf_path:
        return False, '未找到PDF文件，请重新上传', None

    try:
        page_nums = set()
        for part in page_input.split(','):
            part = part.strip()
            if '-' in part:
                a, b = part.split('-', 1)
                start, end = int(a.strip()), int(b.strip())
                for p in range(start, end + 1):
                    page_nums.add(p)
            else:
                page_nums.add(int(part))
    except Exception:
        return False, '页码格式错误，示例: 4-6 或 1,3,5-7', None

    pdf_bytes = open(pdf_path, 'rb').read()
    text_parts = []
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        total_pages = len(pdf.pages)
        for p in sorted(page_nums):
            idx = p - 1
            if 0 <= idx < total_pages:
                page_text = pdf.pages[idx].extract_text()
                if page_text:
                    text_parts.append(f"=== 第{p}页 ===\n{page_text}")
                else:
                    text_parts.append(f"=== 第{p}页 ===\n[文本提取为空]")

    if not text_parts:
        return False, '指定页面未提取到文本', None

    result_text = '\n\n'.join(text_parts)
    return True, None, {'text': result_text, 'pages': sorted(page_nums), 'total': total_pages}


def run_script(session_id, lang):
    dirs = get_session_dirs(session_id)
    if not os.path.exists(dirs['base']):
        return False, '会话不存在', None

    if lang == 'en':
        script = str(BASE_DIR / 'backend' / 'excel' / 'logistics_en.py')
    elif lang == 'ja':
        script = str(BASE_DIR / 'backend' / 'excel' / 'logistics_ja.py')
    else:
        return False, f'未知语言: {lang}', None

    if not os.path.exists(script):
        return False, f'脚本不存在: {script}', None

    for json_file in ['托盘清单.json', '英文单套预装明细.json', '中文包装清单参考.json']:
        src = os.path.join(dirs['output_new'], json_file)
        dst = os.path.join(dirs['output'], json_file)
        if os.path.exists(src):
            os.makedirs(dirs['output'], exist_ok=True)
            shutil.copy2(src, dst)

    copy_shared_files(dirs['output'])

    order_filename = None
    pallet_json_path = os.path.join(dirs['output'], '托盘清单.json')
    if os.path.exists(pallet_json_path):
        try:
            with open(pallet_json_path, 'r', encoding='utf-8') as f:
                pallet_data = json.load(f)
            from collections import Counter
            order_nos = []
            for item in pallet_data:
                on = str(item.get('订单号', '')).strip()
                if on:
                    order_nos.append(on)
            order_counts = Counter(order_nos)
            if order_counts:
                parts_list = [f"{no}" for no, _ in order_counts.most_common()]
                date_str = time.strftime('%m%d')
                suffix = 'en' if lang == 'en' else 'ja'
                order_filename = '+'.join(parts_list) + f'_{date_str}_{suffix}.xlsx'
        except Exception as e:
            print(f"[WARN] 提取订单号失败: {e}")

    default_name = f'物流汇总表v10_{"en" if lang == "en" else "ja"}.xlsx'
    output_filename = order_filename or default_name

    import subprocess
    import sys
    try:
        env = os.environ.copy()
        env['SESSION_OUTPUT_DIR'] = dirs['output']
        env['OUTPUT_FILENAME'] = output_filename
        result = subprocess.run(
            [sys.executable, script],
            capture_output=True, text=True, timeout=120,
            cwd=str(BASE_DIR),
            env=env
        )
        ok = result.returncode == 0
        return ok, {
            'returncode': result.returncode,
            'stdout': result.stdout[-2000:] if result.stdout else '',
            'stderr': result.stderr[-2000:] if result.stderr else '',
        }, output_filename
    except Exception as e:
        return False, str(e), None


def chat_stream(session_id, message):
    dirs = get_session_dirs(session_id)
    if not os.path.exists(dirs['base']):
        yield sse_pack({'type': 'error', 'msg': '会话不存在'})
        return

    meta_path = os.path.join(dirs['base'], 'chat_meta.json')
    if not os.path.exists(meta_path):
        yield sse_pack({'type': 'error', 'msg': '请先执行AI分析'})
        return

    with open(meta_path, 'r', encoding='utf-8') as f:
        meta = json.load(f)

    history_path = os.path.join(dirs['base'], 'chat_history.json')
    if os.path.exists(history_path):
        with open(history_path, 'r', encoding='utf-8') as f:
            history = json.load(f)
    else:
        history = meta.get('initial_messages', [])

    history.append({'role': 'user', 'content': message})

    api_base = meta['api_base']
    api_key = meta['api_key']
    model = meta['model']

    system_msg = '你是一位工业物流数据处理专家。你之前已经从PDF排柜图中提取数据并生成了JSON。用户每次消息都会附带当前的完整JSON数据。你的任务：1.根据用户要求修改或补充JSON；2.如果用户要求生成你确实没有原始数据的托盘，请明确告知"原始PDF中没有该托盘数据"；3.不要编造或使用占位数据；4.输出修改后的完整JSON时用 ===托盘清单=== / ===英文单套预装明细=== / ===中文包装清单参考=== 标记分隔。'

    chat_msgs = []
    for m in history[-6:]:
        if m['role'] not in ('user', 'assistant'):
            continue
        content = m['content']
        if len(content) > 24000:
            if m['role'] == 'assistant':
                content = content[:2000] + '\n...(过长已省略前文)...\n' + content[-20000:]
            else:
                content = content[:12000] + '\n...(过长已省略)...\n' + content[-11000:]
        chat_msgs.append({'role': m['role'], 'content': content})

    is_openai = _is_openai_api(api_base, model)

    if is_openai:
        url = f"{api_base}/chat/completions"
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}',
        }
        payload = {
            'model': model,
            'max_tokens': 16384,
            'stream': True,
            'messages': [{'role': 'system', 'content': system_msg}] + chat_msgs
        }
    else:
        url = f"{api_base}/v1/messages"
        headers = {
            'Content-Type': 'application/json',
            'x-api-key': api_key,
            'anthropic-version': '2023-06-01',
        }
        payload = {
            'model': model,
            'max_tokens': 16384,
            'stream': True,
            'system': system_msg,
            'messages': chat_msgs
        }

    full_reply = ''
    chat_input_tokens = 0
    chat_output_tokens = 0
    try:
        resp = http_requests.post(url, headers=headers, json=payload, timeout=300, stream=True)
        if resp.status_code != 200:
            yield sse_pack({'type': 'error', 'msg': f'API {resp.status_code}: {resp.text[:500]}'})
            return

        for line in resp.iter_lines(decode_unicode=True):
            if not line:
                continue
            if is_openai:
                if not line.startswith('data: '):
                    continue
                data_str = line[6:]
                if data_str.strip() == '[DONE]':
                    break
                try:
                    chunk = json.loads(data_str)
                except Exception:
                    continue
                usage = chunk.get('usage')
                if usage:
                    chat_input_tokens = usage.get('prompt_tokens', chat_input_tokens)
                    chat_output_tokens = usage.get('completion_tokens', chat_output_tokens)
                delta = chunk.get('choices', [{}])[0].get('delta', {})
                token = delta.get('content', '')
                if token:
                    full_reply += token
                    yield sse_pack({'type': 'token', 'text': token})
            else:
                if line.startswith('event: '):
                    continue
                if not line.startswith('data: '):
                    continue
                data_str = line[6:]
                try:
                    chunk = json.loads(data_str)
                except Exception:
                    continue
                evt_type = chunk.get('type', '')
                if evt_type == 'message_start':
                    u = chunk.get('message', {}).get('usage', {})
                    chat_input_tokens = u.get('input_tokens', chat_input_tokens)
                elif evt_type == 'message_delta':
                    u = chunk.get('usage', {})
                    chat_output_tokens = u.get('output_tokens', chat_output_tokens)
                elif evt_type == 'content_block_delta':
                    token = chunk.get('delta', {}).get('text', '')
                    if token:
                        full_reply += token
                        yield sse_pack({'type': 'token', 'text': token})

        history.append({'role': 'assistant', 'content': full_reply})
        with open(history_path, 'w', encoding='utf-8') as f:
            json.dump(history, f, ensure_ascii=False, indent=2)

        updated = False
        pallet = english = chinese = None
        json_update_prompt = message.lower()
        if any(k in json_update_prompt for k in ['托盘', '套装', '清单', 'json', '修改', '更新', '增加', '删除', '改', '补充', '生成']):
            sections = re.split(r'===\s*(托盘清单|英文单套预装明细|中文包装清单参考)\s*===', full_reply)
            section_map = {}
            for i in range(1, len(sections), 2):
                key = sections[i]
                val = sections[i + 1] if i + 1 < len(sections) else ''
                section_map[key] = val.strip()

            def merge_json(filepath, new_items, key_field, alt_key_field=None):
                existing = []
                if os.path.exists(filepath):
                    try:
                        with open(filepath, 'r', encoding='utf-8') as f:
                            existing = json.load(f)
                    except Exception:
                        existing = []
                if not isinstance(existing, list):
                    existing = []
                existing_keys = set()
                for item in existing:
                    for kf in [key_field, alt_key_field]:
                        if kf and kf in item:
                            val = str(item[kf]).strip()
                            if val:
                                existing_keys.add(val)
                for item in new_items:
                    matched = False
                    for kf in [key_field, alt_key_field]:
                        if kf and kf in item:
                            val = str(item[kf]).strip()
                            if val and val in existing_keys:
                                matched = True
                                break
                    if not matched:
                        existing.append(item)
                return existing

            output_new_dir = dirs['output_new']

            print(f"[CHAT] section_map keys: {list(section_map.keys())}")

            if '托盘清单' in section_map:
                pallet_new = extract_array(section_map['托盘清单'], '托盘序号')
                if not pallet_new:
                    pallet_new = extract_array(section_map['托盘清单'], '托盘编码')
                print(f"[CHAT] pallet_new count: {len(pallet_new) if pallet_new else 0}")
                if pallet_new:
                    pallet = merge_json(
                        os.path.join(output_new_dir, '托盘清单.json'),
                        pallet_new, '托盘序号', '托盘编码')
                    print(f"[CHAT] merged pallet count: {len(pallet)}")
                    with open(os.path.join(output_new_dir, '托盘清单.json'), 'w', encoding='utf-8') as f:
                        json.dump(pallet, f, ensure_ascii=False, indent=2)
                    updated = True

            if '英文单套预装明细' in section_map:
                english_new = extract_array(section_map['英文单套预装明细'], '套装编码')
                if english_new:
                    english = merge_json(
                        os.path.join(output_new_dir, '英文单套预装明细.json'),
                        english_new, '套装编码')
                    with open(os.path.join(output_new_dir, '英文单套预装明细.json'), 'w', encoding='utf-8') as f:
                        json.dump(english, f, ensure_ascii=False, indent=2)
                    updated = True

            if '中文包装清单参考' in section_map:
                chinese_new = extract_array(section_map['中文包装清单参考'], '包装清单名称')
                if chinese_new:
                    chinese = merge_json(
                        os.path.join(output_new_dir, '中文包装清单参考.json'),
                        chinese_new, '包装清单名称')
                    with open(os.path.join(output_new_dir, '中文包装清单参考.json'), 'w', encoding='utf-8') as f:
                        json.dump(chinese, f, ensure_ascii=False, indent=2)
                    updated = True

        print(f"[CHAT] done: updated={updated}, pallet={len(pallet) if pallet else 'None'}, english={len(english) if english else 'None'}, chinese={len(chinese) if chinese else 'None'}")
        yield sse_pack({
            'type': 'done',
            'reply': full_reply,
            'updated': updated,
            'pallet': pallet,
            'english': english,
            'chinese': chinese,
            'tokens': {'input': chat_input_tokens, 'output': chat_output_tokens}
        })

    except Exception as e:
        yield sse_pack({'type': 'error', 'msg': str(e)})
