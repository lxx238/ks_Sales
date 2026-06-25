import hashlib
import os
import random
import re

import requests

_BAIDU_API_URL = 'https://fanyi-api.baidu.com/api/trans/vip/translate'

_translate_cache = {}

_KANA_RE = re.compile(r'[\u3040-\u309f\u30a0-\u30ff]')
_HAS_WORD_RE = re.compile(r'[a-zA-Z\u4e00-\u9fff\u3400-\u4dbf]')


def _get_credentials():
    appid = os.environ.get('KS_BAIDU_TRANSLATE_APPID', '').strip()
    secret = os.environ.get('KS_BAIDU_TRANSLATE_SECRET', '').strip()
    return appid, secret


def _is_likely_japanese(text):
    return bool(_KANA_RE.search(text))


def _baidu_translate(text, from_lang='auto', to_lang='jp'):
    appid, secret = _get_credentials()
    if not appid or not secret:
        return None
    salt = str(random.randint(32768, 65536))
    sign = hashlib.md5((appid + text + salt + secret).encode('utf-8')).hexdigest()
    params = {
        'q': text,
        'from': from_lang,
        'to': to_lang,
        'appid': appid,
        'salt': salt,
        'sign': sign,
    }
    try:
        resp = requests.get(_BAIDU_API_URL, params=params, timeout=10)
        data = resp.json()
        if data.get('error_code'):
            print(f"[翻译] 百度翻译错误 {data.get('error_code')}: {data.get('error_msg')}")
            return None
        result = data.get('trans_result')
        if result:
            return '\n'.join(item.get('dst', '') for item in result)
    except Exception as e:
        print(f"[翻译] 百度翻译请求失败: {e}")
    return None


def translate_to_ja(text):
    if not text:
        return text
    text = str(text).strip()
    if not text:
        return text
    if text in _translate_cache:
        return _translate_cache[text]
    if _is_likely_japanese(text) or not _HAS_WORD_RE.search(text):
        _translate_cache[text] = text
        return text
    result = _baidu_translate(text)
    if not result:
        result = text
    _translate_cache[text] = result
    return result


def translate_notes_in_details(detail_results):
    for detail in (detail_results or []):
        ai = detail.get('array_info')
        if isinstance(ai, dict) and ai.get('note'):
            ai['note'] = translate_to_ja(ai['note'])
        if detail.get('inv_note'):
            detail['inv_note'] = translate_to_ja(detail['inv_note'])
