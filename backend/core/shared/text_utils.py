import os
import re
from decimal import Decimal

try:
    import pandas as pd
    _HAS_PD = True
except ImportError:
    _HAS_PD = False

_CJK_RE = re.compile(
    r'[\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef]'
    r'|[\u3400-\u4dbf\U00020000-\U0002a6df]'
)


def _strip_cjk_spec(spec):
    if not spec:
        return spec
    s = str(spec)
    s = re.sub(r'\([^)\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef]*'
               r'[\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef][^)]*\)', '', s)
    s = _CJK_RE.sub('', s)
    return s.strip()


def extract_main_name(filename):
    name_without_ext = os.path.splitext(filename)[0]
    parts = name_without_ext.split('_')

    if len(parts) >= 2:
        main_name = '_'.join(parts[:2])
        return main_name
    else:
        return name_without_ext


def normalize_lookup_code(code):
    if code is None:
        return ''

    text = str(code).strip()
    if not text:
        return ''

    return re.sub(r'\s+', '', text).upper()


def parse_decimal_number(value):
    if value is None or value == '':
        return None

    if isinstance(value, Decimal):
        return value

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return Decimal(str(value))

    text = str(value).replace(',', '').strip()
    if not text:
        return None

    match = re.search(r'-?\d+(?:\.\d+)?', text)
    if not match:
        return None

    try:
        return Decimal(match.group())
    except (ArithmeticError, ValueError):
        return None


def normalize_excel_cell_text(value):
    if _HAS_PD and pd.isna(value):
        return ''

    text = str(value).replace('\r', ' ').replace('\n', ' ').strip()
    if not text or text.lower() == 'nan':
        return ''
    return text


def normalize_lookup_token(text):
    normalized = normalize_excel_cell_text(text)
    compact = (
        normalized
        .replace('：', ':')
        .replace('（', '(')
        .replace('）', ')')
        .replace('×', 'x')
        .replace('*', 'x')
    )
    compact = re.sub(r'\s+', '', compact).lower()
    return re.sub(r'[^0-9a-z\u4e00-\u9fff]+', '', compact)


def normalize_angle(raw_angle):
    if not raw_angle:
        return ''
    text = str(raw_angle).replace('°', '').replace('℃', '').strip()
    m = re.search(r'(\d+(?:\.\d+)?)', text)
    if not m:
        return ''
    num = float(m.group(1))
    if num == int(num):
        return f"{int(num)}°"
    return f"{num}°"


def format_number_text(number_text):
    try:
        value = float(number_text)
    except (TypeError, ValueError):
        return str(number_text).strip()

    if value.is_integer():
        return str(int(value))
    return str(number_text).rstrip('0').rstrip('.')


def parse_numeric_cell_text(text):
    normalized = normalize_excel_cell_text(text).replace(',', '').replace('㎜', 'mm')
    if not normalized:
        return None

    match = re.fullmatch(r'(-?\d+(?:\.\d+)?)\s*(?:mm|MM)?', normalized)
    if not match:
        return None
    return format_number_text(match.group(1))
