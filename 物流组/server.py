from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
import requests as http_requests
import json
import re
import os
import subprocess
import sys
import base64
import uuid
import time
import shutil
import pypdfium2
import pdfplumber
import zipfile
import xml.etree.ElementTree as ET
from io import BytesIO

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SESSIONS_DIR = os.path.join(BASE_DIR, 'sessions')

PROMPT_DOCX_PATH = os.path.join(BASE_DIR, 'input', '提示词_1.docx')

SESSION_EXPIRE_SECONDS = 3600


def get_session_dirs(session_id):
    base = os.path.join(SESSIONS_DIR, session_id)
    return {
        'base': base,
        'output': os.path.join(base, 'output'),
        'output_new': os.path.join(base, 'output_new'),
    }


def cleanup_expired_sessions():
    if not os.path.exists(SESSIONS_DIR):
        return
    now = time.time()
    for name in os.listdir(SESSIONS_DIR):
        path = os.path.join(SESSIONS_DIR, name)
        if not os.path.isdir(path):
            continue
        try:
            mtime = os.path.getmtime(path)
            if now - mtime > SESSION_EXPIRE_SECONDS:
                shutil.rmtree(path, ignore_errors=True)
        except Exception:
            pass


def copy_shared_files(session_output_dir):
    shared_dir = os.path.join(BASE_DIR, 'output')
    for fname in ['logo_en.png', 'logo_ja.png']:
        src = os.path.join(shared_dir, fname)
        if os.path.exists(src):
            os.makedirs(session_output_dir, exist_ok=True)
            shutil.copy2(src, os.path.join(session_output_dir, fname))


def load_prompt_from_docx():
    with zipfile.ZipFile(PROMPT_DOCX_PATH) as z:
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
        print(f"  Page {i+1}: {pil_img.width}x{pil_img.height}, {len(img_b64)} bytes base64")
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


def call_glm_api(api_base, api_key, model, pdf_bytes, prompt, images_b64=None, max_retries=2):
    if images_b64 is None:
        images_b64 = pdf_to_images_base64(pdf_bytes, scale=4)

    if 'moonshot' in api_base or 'kimi' in model.lower():
        api_func = _call_openai_api
    else:
        api_func = _call_anthropic_api

    last_error = None
    for attempt in range(max_retries + 1):
        t0 = time.time()
        try:
            result = api_func(api_base, api_key, model, prompt, images_b64)
            elapsed = round(time.time() - t0, 1)
            print(f"[API] {model} attempt {attempt+1} done in {elapsed}s")
            return result
        except Exception as e:
            elapsed = round(time.time() - t0, 1)
            last_error = e
            print(f"[API] {model} attempt {attempt+1} failed in {elapsed}s: {e}")
            if attempt < max_retries:
                print(f"[API] retrying in 3s...")
                time.sleep(3)
    raise last_error


def _call_anthropic_api(api_base, api_key, model, prompt, images_b64):
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
            'source': {
                'type': 'base64',
                'media_type': 'image/jpeg',
                'data': img_b64
            }
        })

    payload = {
        'model': model,
        'max_tokens': 16384,
        'messages': [{
            'role': 'user',
            'content': content
        }]
    }

    resp = http_requests.post(url, headers=headers, json=payload, timeout=300)
    if resp.status_code != 200:
        raise Exception(f"API {resp.status_code}: {resp.text}")

    data = resp.json()
    usage = data.get('usage', {})
    texts = [b.get('text', '') for b in data.get('content', []) if b.get('type') == 'text']
    ai_text = ''.join(texts)
    return ai_text, usage


def _call_openai_api(api_base, api_key, model, prompt, images_b64):
    url = f"{api_base}/chat/completions"
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}',
    }

    content = [{'type': 'text', 'text': prompt}]
    for img_b64 in images_b64:
        content.append({
            'type': 'image_url',
            'image_url': {
                'url': f'data:image/jpeg;base64,{img_b64}'
            }
        })

    payload = {
        'model': model,
        'max_tokens': 16384,
        'messages': [{
            'role': 'user',
            'content': content
        }]
    }

    resp = http_requests.post(url, headers=headers, json=payload, timeout=300)
    if resp.status_code != 200:
        raise Exception(f"API {resp.status_code}: {resp.text}")

    data = resp.json()
    usage = data.get('usage', {})
    choices = data.get('choices', [])
    ai_text = choices[0].get('message', {}).get('content', '') if choices else ''
    return ai_text, usage


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
            'source': {
                'type': 'base64',
                'media_type': 'image/jpeg',
                'data': img_b64
            }
        })

    payload = {
        'model': model,
        'max_tokens': 16384,
        'stream': True,
        'messages': [{
            'role': 'user',
            'content': content
        }]
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
            'image_url': {
                'url': f'data:image/jpeg;base64,{img_b64}'
            }
        })

    payload = {
        'model': model,
        'max_tokens': 16384,
        'stream': True,
        'stream_options': {'include_usage': True},
        'messages': [{
            'role': 'user',
            'content': content
        }]
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


def sse_pack(data):
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.route('/')
def index():
    return send_from_directory(BASE_DIR, 'AI物流表.html')


@app.route('/api/session', methods=['POST'])
def create_session():
    cleanup_expired_sessions()
    session_id = uuid.uuid4().hex[:12]
    dirs = get_session_dirs(session_id)
    os.makedirs(dirs['output'], exist_ok=True)
    os.makedirs(dirs['output_new'], exist_ok=True)
    copy_shared_files(dirs['output'])
    return jsonify({'ok': True, 'sessionId': session_id})


@app.route('/api/generate', methods=['POST'])
def generate():
    session_id = request.form.get('sessionId', '')
    if not session_id:
        return jsonify({'ok': False, 'error': '缺少sessionId'}), 400

    dirs = get_session_dirs(session_id)
    if not os.path.exists(dirs['base']):
        return jsonify({'ok': False, 'error': '会话不存在，请刷新页面'}), 400

    pdf_file = request.files.get('pdf')
    if not pdf_file:
        return jsonify({'ok': False, 'error': '请上传PDF文件'}), 400

    pallet_qty = int(request.form.get('palletQty', '0'))
    kit_qty = int(request.form.get('kitQty', '0'))
    chinese_qty = int(request.form.get('chineseQty', '0'))
    pallet_remarks = request.form.get('palletRemarks', '')
    kit_remarks = request.form.get('kitRemarks', '')
    chinese_remarks = request.form.get('chineseRemarks', '')
    api_base = request.form.get('apiBase', 'https://open.bigmodel.cn/api/anthropic').rstrip('/')
    api_key = request.form.get('apiKey', '')
    model = request.form.get('model', 'glm-5.1')
    send_mode = request.form.get('sendMode', 'both')

    if not api_key:
        return jsonify({'ok': False, 'error': '请填写API Key'}), 400

    pdf_bytes = pdf_file.read()

    pdf_save_path = os.path.join(dirs['base'], pdf_file.filename)
    with open(pdf_save_path, 'wb') as f:
        f.write(pdf_bytes)

    output_new_dir = dirs['output_new']

    def event_stream():
        try:
            if os.path.exists(output_new_dir):
                shutil.rmtree(output_new_dir)
            os.makedirs(output_new_dir, exist_ok=True)

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
            yield sse_pack({'type': 'status', 'msg': f'已从提示词_1.docx加载提示词 ({len(prompt_text)} 字)'})

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
            yield sse_pack({'type': 'send', 'label': f'>>> {send_label}', 'prompt': f'提示词文件: {len(prompt_text)}字\n用户参数: 托盘{pallet_qty}个, 套装{kit_qty}个, 清单{chinese_qty}个\nPDF文本: {len(pdf_text)}字\n图片: {len(images_b64)}张'})

            t_start = time.time()
            is_openai = 'moonshot' in api_base or 'kimi' in model.lower()
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
            yield sse_pack({'type': 'recv', 'label': f'<<< GLM回复 ({elapsed}s, in:{in_t} out:{out_t} tokens)', 'text': ai_text[:16000], 'tokens': {'input': in_t, 'output': out_t}})

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
            yield sse_pack({'type': 'parsed', 'msg': f'托盘清单: 提取到 {len(all_pallets)} 条（含范围）', 'ok': len(all_pallets) > 0})

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

            yield sse_pack({
                'type': 'done',
                'saved': saved,
                'pallet': all_pallets,
                'english': all_english,
                'chinese': all_chinese
            })

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

        except Exception as e:
            yield sse_pack({'type': 'error', 'msg': str(e)})

    return Response(event_stream(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.route('/api/save-json', methods=['POST'])
def save_json():
    session_id = request.json.get('sessionId', '')
    if not session_id:
        return jsonify({'ok': False, 'error': '缺少sessionId'}), 400

    dirs = get_session_dirs(session_id)
    output_new_dir = dirs['output_new']
    if not os.path.exists(output_new_dir):
        return jsonify({'ok': False, 'error': '会话不存在'}), 400

    data = request.json
    filename = data.get('filename', '')
    json_data = data.get('data')
    if not filename or json_data is None:
        return jsonify({'ok': False, 'error': '缺少参数'}), 400
    allowed = {'托盘清单.json', '英文单套预装明细.json', '中文包装清单参考.json'}
    if filename not in allowed:
        return jsonify({'ok': False, 'error': '不允许的文件名'}), 400
    filepath = os.path.join(output_new_dir, filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)
    return jsonify({'ok': True, 'saved': filename})


@app.route('/api/run-script', methods=['POST'])
def run_script():
    session_id = request.json.get('sessionId', '')
    if not session_id:
        return jsonify({'ok': False, 'error': '缺少sessionId'}), 400

    dirs = get_session_dirs(session_id)
    if not os.path.exists(dirs['base']):
        return jsonify({'ok': False, 'error': '会话不存在'}), 400

    lang = request.json.get('lang', 'en')
    if lang == 'en':
        script = os.path.join(BASE_DIR, '托盘展开版本_en.py')
    elif lang == 'ja':
        script = os.path.join(BASE_DIR, '托盘展开版本_ja.py')
    else:
        return jsonify({'ok': False, 'error': f'未知语言: {lang}'}), 400

    if not os.path.exists(script):
        return jsonify({'ok': False, 'error': f'脚本不存在: {script}'}), 400

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
            order_nos = []
            for item in pallet_data:
                on = str(item.get('订单号', '')).strip()
                if on:
                    order_nos.append(on)
            from collections import Counter
            order_counts = Counter(order_nos)
            if order_counts:
                parts = [f"{no}" for no, _ in order_counts.most_common()]
                date_str = time.strftime('%m%d')
                suffix = 'en' if lang == 'en' else 'ja'
                order_filename = '+'.join(parts) + f'_{date_str}_{suffix}.xlsx'
        except Exception as e:
            print(f"[WARN] 提取订单号失败: {e}")

    default_name = f'物流汇总表v10_{"en" if lang == "en" else "ja"}.xlsx'
    output_filename = order_filename or default_name

    try:
        env = os.environ.copy()
        env['SESSION_OUTPUT_DIR'] = dirs['output']
        env['OUTPUT_FILENAME'] = output_filename
        result = subprocess.run(
            [sys.executable, script],
            capture_output=True, text=True, timeout=120,
            cwd=BASE_DIR,
            env=env
        )
        return jsonify({
            'ok': result.returncode == 0,
            'returncode': result.returncode,
            'stdout': result.stdout[-2000:] if result.stdout else '',
            'stderr': result.stderr[-2000:] if result.stderr else '',
            'filename': output_filename
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@app.route('/api/extract-pages', methods=['POST'])
def extract_pages():
    session_id = request.json.get('sessionId', '')
    if not session_id:
        return jsonify({'ok': False, 'error': '缺少sessionId'}), 400

    dirs = get_session_dirs(session_id)
    if not os.path.exists(dirs['base']):
        return jsonify({'ok': False, 'error': '会话不存在'}), 400

    page_input = request.json.get('pages', '').strip()
    if not page_input:
        return jsonify({'ok': False, 'error': '请输入页码'}), 400

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
        return jsonify({'ok': False, 'error': '未找到PDF文件，请重新上传'}), 400

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
        return jsonify({'ok': False, 'error': '页码格式错误，示例: 4-6 或 1,3,5-7'}), 400

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
                    text_parts.append(f"=== 第{p}页 ===\n[文本提取为空，该页可能是扫描件或图片]")

    if not text_parts:
        return jsonify({'ok': False, 'error': '指定页面未提取到文本'}), 400

    result_text = '\n\n'.join(text_parts)
    return jsonify({'ok': True, 'text': result_text, 'pages': sorted(page_nums), 'total': total_pages})


@app.route('/api/download/<session_id>/<filename>')
def download_file(session_id, filename):
    dirs = get_session_dirs(session_id)
    return send_from_directory(dirs['output'], filename, as_attachment=True)


@app.route('/api/chat', methods=['POST'])
def chat():
    session_id = request.json.get('sessionId', '')
    if not session_id:
        return jsonify({'ok': False, 'error': '缺少sessionId'}), 400

    dirs = get_session_dirs(session_id)
    if not os.path.exists(dirs['base']):
        return jsonify({'ok': False, 'error': '会话不存在'}), 400

    message = request.json.get('message', '').strip()
    if not message:
        return jsonify({'ok': False, 'error': '消息不能为空'}), 400

    meta_path = os.path.join(dirs['base'], 'chat_meta.json')
    if not os.path.exists(meta_path):
        return jsonify({'ok': False, 'error': '请先执行AI分析'}), 400

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

    is_openai = 'moonshot' in api_base or 'kimi' in model.lower()

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

    print(f"[Chat] session={session_id} model={model} msgs={len(chat_msgs)} streaming=True")

    def event_stream():
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
                        if not isinstance(item, dict):
                            continue
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

                # 托盘清单：优先解析 ===托盘清单=== 标记块；若 AI 未带标记，
                # 自动从整段回复中检测含"托盘序号/托盘编码"的 JSON 并补充进托盘清单
                pallet_new = []
                if '托盘清单' in section_map:
                    pallet_new = extract_array(section_map['托盘清单'], '托盘序号')
                    if not pallet_new:
                        pallet_new = extract_array(section_map['托盘清单'], '托盘编码')
                if not pallet_new:
                    pallet_new = extract_array(full_reply, '托盘序号')
                    if not pallet_new:
                        pallet_new = extract_array(full_reply, '托盘编码')
                if pallet_new:
                    pallet = merge_json(
                        os.path.join(dirs['output_new'], '托盘清单.json'),
                        pallet_new, '托盘序号', '托盘编码')
                    with open(os.path.join(dirs['output_new'], '托盘清单.json'), 'w', encoding='utf-8') as f:
                        json.dump(pallet, f, ensure_ascii=False, indent=2)
                    updated = True

                if '英文单套预装明细' in section_map:
                    english_new = extract_array(section_map['英文单套预装明细'], '套装编码')
                    if english_new:
                        english = merge_json(
                            os.path.join(dirs['output_new'], '英文单套预装明细.json'),
                            english_new, '套装编码')
                        with open(os.path.join(dirs['output_new'], '英文单套预装明细.json'), 'w', encoding='utf-8') as f:
                            json.dump(english, f, ensure_ascii=False, indent=2)
                        updated = True

                if '中文包装清单参考' in section_map:
                    chinese_new = extract_array(section_map['中文包装清单参考'], '包装清单名称')
                    if chinese_new:
                        chinese = merge_json(
                            os.path.join(dirs['output_new'], '中文包装清单参考.json'),
                            chinese_new, '包装清单名称')
                        with open(os.path.join(dirs['output_new'], '中文包装清单参考.json'), 'w', encoding='utf-8') as f:
                            json.dump(chinese, f, ensure_ascii=False, indent=2)
                        updated = True

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

    return Response(event_stream(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


if __name__ == '__main__':
    os.makedirs(SESSIONS_DIR, exist_ok=True)
    print(f"[*] 服务启动: http://127.0.0.1:5000")
    print(f"[*] sessions目录: {SESSIONS_DIR}")
    app.run(host='0.0.0.0', port=5000, debug=False)
