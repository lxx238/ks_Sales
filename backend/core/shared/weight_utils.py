import re
from decimal import Decimal

from backend.core.shared.price_utils import round_to_2_decimal

WEIGHT_BY_LENGTH_ATTRIBUTES = {'A', 'F', 'TX'}


def extract_length_from_spec(spec_str):
    if not spec_str:
        return None

    spec_str = str(spec_str)

    length_patterns = [
        (r'(\d+(?:\.\d+)?)\s*mm', 1),
        (r'(\d+(?:\.\d+)?)\s*MM', 1),
        (r'(\d+(?:\.\d+)?)\s*毫米', 1),
        (r'长度[：:]?\s*(\d+(?:\.\d+)?)', 1),
        (r'长[：:]?\s*(\d+(?:\.\d+)?)', 1),
        (r'L[=:]?\s*(\d+(?:\.\d+)?)', 1),
        (r'(\d+(?:\.\d+)?)\s*米', 1000),
        (r'(\d+(?:\.\d+)?)\s*m\b', 1000),
        (r'(\d+(?:\.\d+)?)\s*M\b', 1000),
        (r'(\d+(?:\.\d+)?)\s*M$', 1000),
        (r'(\d+(?:\.\d+)?)\s*米$', 1000),
        (r'(\d+(?:\.\d+)?)\s*mm$', 1),
        (r'长度[：:]?\s*(\d+(?:\.\d+)?)\s*mm', 1),
        (r'(\d+(?:\.\d+)?)\s*mm长度', 1),
        (r'(\d+(?:\.\d+)?)\s*$', 1),
    ]

    for pattern, multiplier in length_patterns:
        match = re.search(pattern, spec_str, re.IGNORECASE)
        if match:
            try:
                length = float(match.group(1))
                length_mm = length * multiplier
                if length_mm > 10000 and multiplier == 1:
                    pass
                return length_mm
            except (ValueError, TypeError):
                continue

    return None


def calculate_bom_total_weight(product, quantity):
    if product['weight'] > 0 and quantity > 0:
        return (
            product['weight'] * Decimal(str(quantity)),
            product.get('weight_has_unit', False),
            product.get('weight_unit', 'kg'),
        )
    return None, False, ''


def log_weight_formula(
        row_number,
        product,
        formula_name,
        quantity,
        price_info,
        total_weight,
        extra_detail='',
        log_buffer=None,
):
    code = str(product.get('code') or '').strip()
    name = str(product.get('name') or '').strip()
    spec = str(product.get('spec') or '').strip()
    code_attribute = str((price_info or {}).get('code_attribute') or '').strip().upper()
    db_weight = (price_info or {}).get('db_weight')
    result_text = ''
    if total_weight is not None:
        result_text = str(round_to_2_decimal(total_weight))

    detail_text = f' {extra_detail}' if extra_detail else ''
    message = (
        f"[WEIGHT] row={row_number} code={code} name={name} attr={code_attribute or '-'} "
        f"qty={quantity} spec={spec or '-'} db_weight={db_weight if db_weight not in (None, '') else '-'} "
        f"formula={formula_name} result={result_text or '-'}{detail_text}"
    )
    if log_buffer is not None:
        log_buffer.append(message)
        return

    print(message, flush=True)


def calculate_report_total_weight(product, quantity, price_info, row_number=None, log_buffer=None):
    if quantity <= 0:
        log_weight_formula(
            row_number, product, 'skip_qty_non_positive', quantity, price_info, None, log_buffer=log_buffer
        )
        return None, False, ''

    fallback_weight, fallback_has_unit, fallback_unit = calculate_bom_total_weight(product, quantity)
    if not price_info:
        log_weight_formula(
            row_number,
            product,
            'bom_fallback_missing_db_match',
            quantity,
            price_info,
            fallback_weight,
            log_buffer=log_buffer,
        )
        return fallback_weight, fallback_has_unit, fallback_unit

    db_weight = _parse_decimal_number(price_info.get('db_weight'))
    if db_weight is None or db_weight <= 0:
        log_weight_formula(
            row_number,
            product,
            'bom_fallback_missing_db_weight',
            quantity,
            price_info,
            fallback_weight,
            log_buffer=log_buffer,
        )
        return fallback_weight, fallback_has_unit, fallback_unit

    code_attribute = str(price_info.get('code_attribute') or '').strip().upper()
    total_weight = db_weight * Decimal(str(quantity))

    if code_attribute in WEIGHT_BY_LENGTH_ATTRIBUTES:
        length_mm = extract_length_from_spec(product.get('spec'))
        if length_mm is None or length_mm <= 0:
            print(
                f"   ⚠️ 重量长度解析失败，回退 BOM 单重公式: {product.get('name', '')} "
                f"(编码: {product.get('code', '')}, 规格: {product.get('spec', '')}, 编码属性: {code_attribute})"
            )
            log_weight_formula(
                row_number,
                product,
                'bom_fallback_spec_parse_failed',
                quantity,
                price_info,
                fallback_weight,
                log_buffer=log_buffer,
            )
            return fallback_weight, fallback_has_unit, fallback_unit

        total_weight *= Decimal(str(length_mm)) / Decimal('1000')
        log_weight_formula(
            row_number,
            product,
            'db_weight_x_qty_x_spec_div_1000',
            quantity,
            price_info,
            total_weight,
            extra_detail=f'length_mm={length_mm}',
            log_buffer=log_buffer,
        )
        return total_weight, False, ''

    log_weight_formula(
        row_number,
        product,
        'db_weight_x_qty',
        quantity,
        price_info,
        total_weight,
        log_buffer=log_buffer,
    )
    return total_weight, False, ''


def lookup_unit_weight_from_material_db(code, spec, bom_weight=0):
    """查询物料库单重并按规格折算（长度属性按 米重×长度/1000）。

    查不到时回退使用 BOM 自带单重。返回 float 或 None。
    """
    try:
        from backend.repositories.material_repository import fetch_material_rows
        from backend.utils.converters import normalize_lookup_code as _norm
    except Exception:
        fetch_material_rows = None
        _norm = None

    norm = _norm(code) if _norm else None

    db_weight = 0.0
    attr = ''
    if norm and fetch_material_rows:
        try:
            rows = fetch_material_rows([norm], include_images=False)
        except Exception:
            rows = []
        for row in rows:
            row_norm = _norm(row.get('工程编码') or '') if _norm else None
            if row_norm and row_norm != norm:
                continue
            try:
                db_weight = float(str(row.get('重量') or '').replace(',', '').strip() or 0) or 0.0
            except (TypeError, ValueError):
                db_weight = 0.0
            attr = str(row.get('编码属性') or '').strip().upper()
            break

    unit_weight = db_weight
    if attr in WEIGHT_BY_LENGTH_ATTRIBUTES and db_weight:
        length_mm = extract_length_from_spec(spec)
        if length_mm and length_mm > 0:
            unit_weight = round(db_weight * (length_mm / 1000.0), 4)
        else:
            unit_weight = 0.0

    if not unit_weight:
        try:
            unit_weight = float(bom_weight or 0)
        except (TypeError, ValueError):
            unit_weight = 0.0

    return unit_weight if unit_weight else None


def calculate_report_unit_weight(product, price_info):
    if not price_info:
        bom_w = product.get('weight', 0)
        if bom_w and bom_w > 0:
            return Decimal(str(bom_w))
        return None

    db_weight = _parse_decimal_number(price_info.get('db_weight'))
    if db_weight is None or db_weight <= 0:
        bom_w = product.get('weight', 0)
        if bom_w and bom_w > 0:
            return Decimal(str(bom_w))
        return None

    code_attribute = str(price_info.get('code_attribute') or '').strip().upper()
    unit_weight = db_weight

    if code_attribute in WEIGHT_BY_LENGTH_ATTRIBUTES:
        length_mm = extract_length_from_spec(product.get('spec'))
        if length_mm is None or length_mm <= 0:
            return None
        unit_weight = db_weight * Decimal(str(length_mm)) / Decimal('1000')

    return unit_weight


def _parse_decimal_number(value):
    match = re.search(r'-?\d+(?:\.\d+)?', str(value))
    if not match:
        return None

    try:
        return Decimal(match.group())
    except (ArithmeticError, ValueError):
        return None
