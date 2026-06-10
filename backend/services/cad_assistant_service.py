from __future__ import annotations

import base64
import json
import re
import threading
import uuid
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple
from urllib import error as urllib_error
from urllib import request as urllib_request

from werkzeug.utils import secure_filename

from backend.config.settings import (
    CAD_ASSISTANT_UPLOAD_FOLDER,
    SILICONFLOW_API_KEY,
    SILICONFLOW_API_URL,
    SILICONFLOW_MODEL,
)
from backend.utils.file_utils import cleanup_file


IMAGE_MIME_TYPES = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
}
TEXT_EXTENSIONS = {'dxf', 'txt', 'csv'}
GUIDED_BUT_UNSUPPORTED_EXTENSIONS = {'dwg', 'pdf'}
SUPPORTED_EXTENSIONS = set(IMAGE_MIME_TYPES) | TEXT_EXTENSIONS | GUIDED_BUT_UNSUPPORTED_EXTENSIONS
SESSION_TTL = timedelta(hours=12)
MAX_HISTORY_MESSAGES = 8
MAX_TEXT_CHARS = 12000
MAX_DXF_PAIRS = 120000

_SESSION_LOCK = threading.Lock()
_SESSIONS: Dict[str, Dict[str, Any]] = {}


SYSTEM_PROMPT = """你是 CAD 阵列识别助手。
你的任务是根据用户上传的 CAD 图纸截图、导出图或 DXF 结构摘要，判断图中的阵列/重复排布情况。

规则：
1. 只能依据图中可见标注、文字说明、阵列参数、重复块统计和用户补充信息作答。
2. 不确定时必须明确说明“无法确认”或“证据不足”，不要猜测数量。
3. 优先给出“行 x 列 = 总数”或“组数 x 每组数量 = 总数”。
4. 如果图中有多组阵列，要分别列出。
5. 输出必须是 JSON 对象，不要 Markdown，不要代码块。

JSON 结构：
{
  "answer": "给用户看的中文结论",
  "array_summary": [
    {
      "name": "阵列名称或对象",
      "count_expression": "6 x 4",
      "total": 24,
      "evidence": "来自标注、块统计或文字说明"
    }
  ],
  "uncertainties": ["不确定点，没有可返回空数组"],
  "confidence": "high|medium|low",
  "next_question": "如果需要补图或补信息，用一句话说明下一步"
}"""


class CadAssistantError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def create_cad_session(file_storage) -> Tuple[Dict[str, Any], int]:
    saved_path: Path | None = None
    try:
        _cleanup_expired_sessions()
        file_id, filename, extension, saved_path = _save_source_file(file_storage)
        source_mode, source_payload, preview_lines = _prepare_source_payload(saved_path, filename, extension)
        session_id = str(uuid.uuid4())
        created_at = datetime.now().isoformat()
        session = {
            'session_id': session_id,
            'file_id': file_id,
            'filename': filename,
            'extension': extension,
            'filepath': str(saved_path),
            'source_mode': source_mode,
            'source_payload': source_payload,
            'history': [],
            'created_at': created_at,
            'updated_at': created_at,
        }

        with _SESSION_LOCK:
            _SESSIONS[session_id] = session

        return {
            'success': True,
            'session_id': session_id,
            'file': {
                'file_id': file_id,
                'filename': filename,
                'extension': extension,
                'analysis_mode': source_mode,
                'size_bytes': saved_path.stat().st_size,
            },
            'preview_lines': preview_lines,
            'message': _build_upload_ready_message(source_mode, extension),
        }, 200
    except CadAssistantError as exc:
        if saved_path:
            cleanup_file(saved_path)
        return {'success': False, 'message': str(exc)}, exc.status_code
    except Exception as exc:
        if saved_path:
            cleanup_file(saved_path)
        return {'success': False, 'message': f'CAD 图纸处理失败: {exc}'}, 500


def chat_with_cad_session(data: Dict[str, Any] | None) -> Tuple[Dict[str, Any], int]:
    try:
        if data is None:
            raise CadAssistantError('请求体不能为空，请发送 JSON 数据。')

        session_id = str(data.get('session_id') or '').strip()
        user_message = str(data.get('message') or '').strip()
        if not session_id:
            raise CadAssistantError('缺少 session_id。')
        if not user_message:
            raise CadAssistantError('请输入问题。')

        session = _get_session(session_id)
        messages = _build_chat_messages(session, user_message)
        raw_reply, usage = _call_siliconflow(messages)
        parsed_reply = _parse_reply_json(raw_reply)
        assistant_context = _build_assistant_context(parsed_reply, raw_reply)

        session['history'].append({'role': 'user', 'content': user_message})
        session['history'].append({'role': 'assistant', 'content': assistant_context})
        session['updated_at'] = datetime.now().isoformat()

        return {
            'success': True,
            'session_id': session_id,
            'reply': parsed_reply['answer'],
            'parsed': parsed_reply,
            'model': SILICONFLOW_MODEL,
            'usage': usage,
        }, 200
    except CadAssistantError as exc:
        return {'success': False, 'message': str(exc)}, exc.status_code
    except Exception as exc:
        return {'success': False, 'message': f'CAD 对话失败: {exc}'}, 500


def delete_cad_session(session_id: str) -> Tuple[Dict[str, Any], int]:
    try:
        if not session_id:
            raise CadAssistantError('缺少 session_id。')

        with _SESSION_LOCK:
            session = _SESSIONS.pop(session_id, None)

        if not session:
            return {'success': True, 'message': '会话已不存在。'}, 200

        cleanup_file(session.get('filepath'))
        return {'success': True, 'message': 'CAD 会话已清理。'}, 200
    except CadAssistantError as exc:
        return {'success': False, 'message': str(exc)}, exc.status_code
    except Exception as exc:
        return {'success': False, 'message': f'清理 CAD 会话失败: {exc}'}, 500


def _save_source_file(file_storage) -> Tuple[str, str, str, Path]:
    if file_storage is None:
        raise CadAssistantError('请选择 CAD 图纸文件。')
    if not file_storage.filename:
        raise CadAssistantError('文件名不能为空。')

    original_name = file_storage.filename
    extension = original_name.rsplit('.', 1)[-1].lower() if '.' in original_name else ''
    if not extension:
        raise CadAssistantError('无法识别文件扩展名。')
    if extension not in SUPPORTED_EXTENSIONS:
        raise CadAssistantError('当前仅支持 PNG/JPG/WEBP/BMP、DXF、TXT、CSV。DWG/PDF 请先导出为图片或 DXF。')
    if extension in GUIDED_BUT_UNSUPPORTED_EXTENSIONS:
        raise CadAssistantError(f'当前版本暂不直接解析 .{extension}，请先导出为 PNG/JPG 图片或 DXF 再上传。')

    filename = secure_filename(original_name) or f'cad_source.{extension}'
    file_id = str(uuid.uuid4())
    saved_path = CAD_ASSISTANT_UPLOAD_FOLDER / f'{file_id}.{extension}'
    file_storage.save(str(saved_path))
    return file_id, filename, extension, saved_path


def _prepare_source_payload(saved_path: Path, filename: str, extension: str) -> Tuple[str, Dict[str, Any], List[str]]:
    if extension in IMAGE_MIME_TYPES:
        data_uri = _image_to_data_uri(saved_path, IMAGE_MIME_TYPES[extension])
        preview_lines = [
            f'文件: {filename}',
            '识别方式: 视觉模型直接读图',
            '建议问题: 请统计图中的阵列数量，并说明判断依据。',
        ]
        return 'image', {
            'role': 'user',
            'content': [
                {
                    'type': 'text',
                    'text': (
                        f'用户上传了一张 CAD 图纸导出图，文件名是 {filename}。'
                        '请先阅读图纸，再根据用户问题判断阵列数量、排布方式和总数。'
                    ),
                },
                {
                    'type': 'image_url',
                    'image_url': {'url': data_uri},
                },
            ],
        }, preview_lines

    if extension == 'dxf':
        dxf_context, preview_lines = _build_dxf_context(saved_path, filename)
        return 'dxf_summary', {
            'role': 'user',
            'content': dxf_context,
        }, preview_lines

    text_context, preview_lines = _build_text_context(saved_path, filename)
    return 'text_summary', {
        'role': 'user',
        'content': text_context,
    }, preview_lines


def _image_to_data_uri(path: Path, mime_type: str) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode('ascii')
    return f'data:{mime_type};base64,{encoded}'


def _build_text_context(path: Path, filename: str) -> Tuple[str, List[str]]:
    text = _decode_text_bytes(path.read_bytes())
    snippet = _normalize_whitespace(text)[:MAX_TEXT_CHARS]
    preview_lines = [
        f'文件: {filename}',
        '识别方式: 文本摘要',
        f'摘要长度: {len(snippet)} 字符',
    ]
    context = (
        f'用户上传的是文本类 CAD 辅助文件，文件名是 {filename}。\n'
        '请根据下面的内容识别阵列、重复对象和数量。\n'
        '如果证据不足，请明确说明。\n\n'
        f'{snippet}'
    )
    return context, preview_lines


def _build_dxf_context(path: Path, filename: str) -> Tuple[str, List[str]]:
    raw_text = _decode_text_bytes(path.read_bytes())
    pair_count, insert_lines, text_lines = _extract_dxf_insights(raw_text)
    preview_lines = [
        f'文件: {filename}',
        f'DXF 结构对数: {pair_count}',
        f'重复块统计: {len(insert_lines)} 条',
        f'文字标注样本: {len(text_lines)} 条',
    ]

    insert_block = '未提取到明显的块插入统计。'
    if insert_lines:
        insert_block = '\n'.join(f'- {line}' for line in insert_lines)

    text_block = '未提取到明确的图纸文字。'
    if text_lines:
        text_block = '\n'.join(f'- {line}' for line in text_lines)

    context = (
        f'用户上传的是 DXF 图纸，文件名是 {filename}。\n'
        '注意：这里提供的是 DXF 结构摘要，不是渲染后的图片。\n'
        '请优先依据块插入统计、阵列参数、图纸文字样本判断阵列数量；如果无法确认，请直接说明。\n\n'
        f'DXF code/value 对数量: {pair_count}\n\n'
        f'块插入统计:\n{insert_block}\n\n'
        f'图纸文字样本:\n{text_block}\n'
    )
    return context[:MAX_TEXT_CHARS], preview_lines


def _extract_dxf_insights(raw_text: str) -> Tuple[int, List[str], List[str]]:
    lines = raw_text.splitlines()
    if len(lines) > MAX_DXF_PAIRS * 2:
        lines = lines[: MAX_DXF_PAIRS * 2]

    pair_count = len(lines) // 2
    insert_summary: Dict[str, Dict[str, Any]] = {}
    text_samples: List[str] = []

    current_type = ''
    current_values: Dict[str, Any] = {}

    def flush_current() -> None:
        nonlocal current_type, current_values
        if not current_type:
            return

        entity_type = current_type.upper()
        if entity_type in {'INSERT', 'MINSERT'}:
            block_name = str(current_values.get('2') or '未命名块').strip() or '未命名块'
            columns = max(_safe_int(current_values.get('70')), 1)
            rows = max(_safe_int(current_values.get('71')), 1)
            expanded_total = columns * rows
            item = insert_summary.setdefault(block_name, {
                'instances': 0,
                'expanded_total': 0,
                'examples': [],
            })
            item['instances'] += 1
            item['expanded_total'] += expanded_total
            if expanded_total > 1 and len(item['examples']) < 3:
                item['examples'].append(f'{columns} x {rows} = {expanded_total}')

        for sample in current_values.get('_texts', []):
            cleaned = _clean_dxf_text(sample)
            if cleaned and cleaned not in text_samples and len(text_samples) < 24:
                text_samples.append(cleaned)

        current_type = ''
        current_values = {}

    for index in range(0, len(lines) - 1, 2):
        code = lines[index].strip()
        value = lines[index + 1].strip()
        if code == '0':
            flush_current()
            current_type = value
            current_values = {'_texts': []}
            continue

        if not current_type:
            continue

        if code in {'1', '3'}:
            current_values['_texts'].append(value)
        elif code in {'2', '70', '71'} and code not in current_values:
            current_values[code] = value

    flush_current()

    ranked_inserts = sorted(
        insert_summary.items(),
        key=lambda item: (item[1]['expanded_total'], item[1]['instances']),
        reverse=True,
    )[:12]

    insert_lines = []
    for name, stats in ranked_inserts:
        line = f'{name}: 插入 {stats["instances"]} 次，推测展开总数 {stats["expanded_total"]}'
        if stats['examples']:
            line += f'，阵列参数示例 {", ".join(stats["examples"])}'
        insert_lines.append(line)

    text_lines = text_samples[:18]
    return pair_count, insert_lines, text_lines


def _clean_dxf_text(value: str) -> str:
    cleaned = value.replace('\\P', ' / ')
    cleaned = re.sub(r'%%[a-zA-Z]', ' ', cleaned)
    cleaned = re.sub(r'\\[A-Za-z0-9]+;?', ' ', cleaned)
    cleaned = _normalize_whitespace(cleaned)
    if len(cleaned) < 2 or len(cleaned) > 120:
        return ''
    if not re.search(r'[\u4e00-\u9fffA-Za-z0-9]', cleaned):
        return ''
    return cleaned


def _decode_text_bytes(data: bytes) -> str:
    for encoding in ('utf-8', 'gbk', 'utf-16', 'latin-1'):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode('utf-8', errors='ignore')


def _normalize_whitespace(text: str) -> str:
    return re.sub(r'\s+', ' ', text).strip()


def _safe_int(value: Any) -> int:
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return 0


def _get_session(session_id: str) -> Dict[str, Any]:
    _cleanup_expired_sessions()
    with _SESSION_LOCK:
        session = _SESSIONS.get(session_id)

    if not session:
        raise CadAssistantError('会话不存在或已过期，请重新上传图纸。', 404)

    return session


def _cleanup_expired_sessions() -> None:
    deadline = datetime.now() - SESSION_TTL
    expired_ids: List[str] = []

    with _SESSION_LOCK:
        for session_id, session in _SESSIONS.items():
            updated_at = session.get('updated_at') or session.get('created_at')
            try:
                updated_dt = datetime.fromisoformat(updated_at)
            except (TypeError, ValueError):
                updated_dt = datetime.min
            if updated_dt < deadline:
                expired_ids.append(session_id)

        expired_paths = [Path(_SESSIONS[session_id]['filepath']) for session_id in expired_ids if session_id in _SESSIONS]
        for session_id in expired_ids:
            _SESSIONS.pop(session_id, None)

    for path in expired_paths:
        cleanup_file(path)


def _build_chat_messages(session: Dict[str, Any], user_message: str) -> List[Dict[str, Any]]:
    messages: List[Dict[str, Any]] = [{'role': 'system', 'content': SYSTEM_PROMPT}]
    messages.append(session['source_payload'])
    history = session.get('history') or []
    if history:
        messages.extend(history[-MAX_HISTORY_MESSAGES:])
    messages.append({'role': 'user', 'content': user_message})
    return messages


def _call_siliconflow(messages: Iterable[Dict[str, Any]]) -> Tuple[str, Dict[str, Any]]:
    if not SILICONFLOW_API_KEY:
        raise CadAssistantError('未配置 SiliconFlow API Key，请在 .env.local 中设置 KS_SILICONFLOW_API_KEY。', 500)

    payload = {
        'model': SILICONFLOW_MODEL,
        'messages': list(messages),
        'temperature': 0.1,
        'max_tokens': 1500,
        'response_format': {'type': 'json_object'},
    }
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
        raise CadAssistantError(_extract_remote_error_message(body, exc.code), 502)
    except urllib_error.URLError as exc:
        raise CadAssistantError(f'无法连接 SiliconFlow 接口: {exc.reason}', 502)

    try:
        payload = json.loads(response_text)
    except json.JSONDecodeError as exc:
        raise CadAssistantError(f'SiliconFlow 返回了无法解析的内容: {exc}', 502)

    choices = payload.get('choices') or []
    if not choices:
        raise CadAssistantError('SiliconFlow 未返回可用结果。', 502)

    message = choices[0].get('message') or {}
    content = message.get('content', '')
    if isinstance(content, list):
        text = ''.join(part.get('text', '') for part in content if isinstance(part, dict))
    else:
        text = str(content or '')

    if not text.strip():
        raise CadAssistantError('SiliconFlow 返回为空。', 502)

    return text, payload.get('usage') or {}


def _extract_remote_error_message(body: str, status_code: int) -> str:
    if body:
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {}

        if isinstance(payload, dict):
            error_obj = payload.get('error')
            if isinstance(error_obj, dict):
                message = error_obj.get('message')
                if message:
                    return f'SiliconFlow 请求失败: {message}'
            message = payload.get('message')
            if message:
                return f'SiliconFlow 请求失败: {message}'

    return f'SiliconFlow 请求失败，HTTP {status_code}。'


def _parse_reply_json(raw_reply: str) -> Dict[str, Any]:
    cleaned = raw_reply.strip()
    if cleaned.startswith('```'):
        cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned)
        cleaned = re.sub(r'\s*```$', '', cleaned)

    candidate = cleaned
    if not candidate.startswith('{'):
        match = re.search(r'\{.*\}', candidate, re.S)
        if match:
            candidate = match.group(0)

    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        return {
            'answer': cleaned,
            'array_summary': [],
            'uncertainties': [],
            'confidence': 'low',
            'next_question': '',
        }

    answer = str(parsed.get('answer') or '').strip()
    if not answer:
        answer = cleaned

    array_summary = []
    for item in parsed.get('array_summary') or []:
        if not isinstance(item, dict):
            continue
        total = item.get('total')
        normalized_item = {
            'name': str(item.get('name') or '未命名阵列').strip(),
            'count_expression': str(item.get('count_expression') or '').strip(),
            'total': _safe_int(total) if total is not None else 0,
            'evidence': str(item.get('evidence') or '').strip(),
        }
        array_summary.append(normalized_item)

    uncertainties = [str(item).strip() for item in (parsed.get('uncertainties') or []) if str(item).strip()]
    confidence = str(parsed.get('confidence') or 'low').strip().lower()
    if confidence not in {'high', 'medium', 'low'}:
        confidence = 'low'

    return {
        'answer': answer,
        'array_summary': array_summary,
        'uncertainties': uncertainties,
        'confidence': confidence,
        'next_question': str(parsed.get('next_question') or '').strip(),
    }


def _build_assistant_context(parsed_reply: Dict[str, Any], raw_reply: str) -> str:
    parts = [parsed_reply.get('answer') or raw_reply.strip()]
    for item in parsed_reply.get('array_summary') or []:
        summary = item.get('name') or '阵列'
        count_expression = item.get('count_expression') or ''
        total = item.get('total') or 0
        evidence = item.get('evidence') or ''
        parts.append(f'{summary}: {count_expression} = {total}。依据: {evidence}')
    for item in parsed_reply.get('uncertainties') or []:
        parts.append(f'不确定点: {item}')
    return '\n'.join(part for part in parts if part).strip()


def _build_upload_ready_message(source_mode: str, extension: str) -> str:
    if source_mode == 'image':
        return '图纸上传完成，已按视觉模式准备好，可以直接提问阵列数量。'
    if extension == 'dxf':
        return 'DXF 上传完成，已提取结构摘要，可以继续追问阵列统计和判断依据。'
    return '文件上传完成，已生成文本摘要，可以开始对话。'
