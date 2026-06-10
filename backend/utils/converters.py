import re


def normalize_lookup_code(code):
    """Normalize product codes for cross-source matching."""
    if code is None:
        return ''

    text = str(code).strip()
    if not text:
        return ''

    return re.sub(r'\s+', '', text).upper()


def parse_price_value(value):
    """Convert a price-like value into float."""
    if value is None:
        return None

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)

    text = str(value).strip()
    if not text or text.lower() in {'nan', 'none', 'null'}:
        return None

    text = text.replace('US$', '').replace('$', '').replace(',', '')
    match = re.search(r'-?\d+(?:\.\d+)?', text)
    if not match:
        return None

    try:
        return float(match.group())
    except ValueError:
        return None


def extract_numeric_value(value, field_name):
    """Extract a numeric value from matrix cell text."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)

    text = str(value).replace(',', '').strip()
    match = re.search(r'-?\d+(?:\.\d+)?', text)
    if not match:
        raise ValueError(f'阵列表中的{field_name}不是有效数字')
    return float(match.group())


def coerce_bool(value, default=False):
    """Convert mixed bool/string values into bool."""
    if value is None:
        return default
    if isinstance(value, str):
        return value.strip().lower() in {'1', 'true', 'yes', 'y', 'on'}
    return bool(value)
