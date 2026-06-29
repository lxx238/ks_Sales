"""吨价实时计算模块。

与「临时价格设置」和 inquiry_service 口径完全对齐：
- 吨价按「吨价类型 + 长度档 + 吨位档 + 包装」读取
- 人民币底价 = 单重 × 吨价 × 规格系数
- 外币单价 = 人民币底价 ÷ 汇率 ÷ 点数

供报价引擎在运行时直接计算，替代 temp_material_pricing 预计算表。
"""

from backend.config.settings import get_db_connection
from backend.core.shared.weight_utils import extract_length_from_spec
from backend.utils.converters import normalize_lookup_code


_TEMP_SETTINGS_TABLE = 'temp_price_settings'
_LEN_TIER_KEY = {'0-1': '01', '1-3': '13', '3+': '3'}
_WEIGHT_TIER_DISPLAY = {'05': '0-5', '550': '5-50', '50999': '50+'}
_RATE_CURS = ['usd', 'eur', 'rmb_fx']

RATE_CATEGORIES = [
    {'key': 'dizhuang', 'label': '地桩', 'attrs': ('D',)},
    {'key': 'lv', 'label': '铝', 'attrs': ('M',)},
    {'key': 'lvpj', 'label': '铝配件', 'attrs': ('F', 'Q')},
    {'key': 'tie', 'label': '铁', 'attrs': ('WTX', 'WTP')},
    {'key': 'waigou', 'label': '外购件', 'attrs': ('W',)},
]
_ATTR_TO_CAT = {a: c['key'] for c in RATE_CATEGORIES for a in c['attrs']}
_LVPJ_COEFF_KEY = 'lvpj_coefficient'
_LVPJ_COEFF_DEFAULT = 1.03

_PACK_KEYS = {'jybz', 'tietuo'}
_DEFAULT_PACK = 'jybz'

_RATE_CAT_KEYS = []
for _c in RATE_CATEGORIES:
    for _cur in _RATE_CURS:
        _RATE_CAT_KEYS.append(f'exchange_rate_{_c["key"]}_{_cur}')
        _RATE_CAT_KEYS.append(f'points_{_c["key"]}_{_cur}')


def _parse_float(value, default=0.0):
    try:
        return float(str(value).replace(',', '').strip())
    except (TypeError, ValueError):
        return default


def _normalize_pack(pack):
    pk = str(pack or '').strip().lower()
    return pk if pk in _PACK_KEYS else _DEFAULT_PACK


def _weight_tier_key(total_kg):
    ton = total_kg / 1000.0
    if ton <= 5:
        return '05'
    if ton <= 50:
        return '550'
    return '50999'


_WEIGHT_TIER_DISPLAY = {
    '05': '0-5',
    '550': '5-50',
    '50999': '50+',
}


def _determine_length_tier(length_mm):
    if length_mm is None or length_mm <= 0:
        return ''
    length_m = length_mm / 1000.0
    if length_m <= 1:
        return '0-1'
    if length_m < 3:
        return '1-3'
    return '3+'


def _ton_type_from_code(code, length_tier=None):
    code = str(code or '').strip()
    if not code:
        return ''
    if code.startswith('FEPJ'):
        return code.replace('-', '_')
    idx = code.find('-')
    if idx > 0:
        return code[:idx]
    return code


def _ton_setting_key(ton_type, length_tier, total_kg, pack=None, require_length=False):
    """构造吨价设置键。

    默认返回不带长度档的键（如 ton_FEC027_int_05_jybz），这是最常见保存方式；
    只有当调用方明确要求或需要带长度档回退时，才返回带长度档的键。
    """
    if not ton_type:
        return ''
    pk = _normalize_pack(pack)
    wk = _weight_tier_key(total_kg)
    lt = str(length_tier or '').strip()
    if not lt or require_length:
        return f'ton_{ton_type}_int_{wk}_{pk}'
    len_key = _LEN_TIER_KEY.get(lt, '3')
    return f'ton_{ton_type}_int_{len_key}_{wk}_{pk}'


def _category_for_attr(pricing_attr):
    return _ATTR_TO_CAT.get(str(pricing_attr or '').strip().upper())


def _ensure_setting_cols(connection, keys):
    cols = {r[1] for r in connection.execute(f'PRAGMA table_info({_TEMP_SETTINGS_TABLE})').fetchall()}
    if not cols:
        cols_def = ', '.join(f'"{k}" REAL' for k in keys)
        connection.execute(
            f'CREATE TABLE IF NOT EXISTS {_TEMP_SETTINGS_TABLE} '
            f'(id INTEGER PRIMARY KEY DEFAULT 1, {cols_def}, updated_at TEXT)'
        )
    else:
        for k in keys:
            if k and k not in cols:
                connection.execute(f'ALTER TABLE {_TEMP_SETTINGS_TABLE} ADD COLUMN "{k}" REAL')
    connection.execute(f'INSERT OR IGNORE INTO {_TEMP_SETTINGS_TABLE} (id) VALUES (1)')
    connection.commit()


def _read_temp_settings(keys):
    if not keys:
        return {}
    conn = get_db_connection()
    try:
        _ensure_setting_cols(conn, list(keys))
        row = conn.execute(f'SELECT * FROM {_TEMP_SETTINGS_TABLE} WHERE id=1').fetchone()
        d = dict(row) if row else {}
    finally:
        conn.close()
    result = {}
    for k in keys:
        try:
            result[k] = float(d.get(k)) if d.get(k) not in (None, '') else None
        except (TypeError, ValueError):
            result[k] = None
    return result


def _spec_factor(unit, spec):
    """每件重量/价格系数：米单位 = 规格(mm)/1000；非米单位 = 1。"""
    if str(unit or '').strip() not in {'米', 'm', 'M'}:
        return 1.0
    length_mm = extract_length_from_spec(str(spec or ''))
    if length_mm and length_mm > 0:
        return length_mm / 1000.0
    return 1.0


def _determine_pricing_currency(group, sale_type='export'):
    """临时询价来源的展示币种。"""
    if sale_type == 'domestic':
        return 'rmb'
    if group == '英语组' and sale_type == 'euro':
        return 'eur'
    return 'usd'


def _collect_products_weight(products, unit_weight, is_meter):
    """按编码聚合所有 products 计算总重量(kg)。"""
    total = 0.0
    for p in products:
        qty = _parse_float(p.get('quantity'), 0.0)
        if qty <= 0:
            continue
        if is_meter:
            p_len_mm = extract_length_from_spec(p.get('spec'))
            if p_len_mm and p_len_mm > 0:
                total += unit_weight * (p_len_mm / 1000.0) * qty
        else:
            total += unit_weight * qty
    return total


def compute_ton_price_record(
    code,
    spec,
    unit_weight,
    pricing_unit,
    pricing_attr,
    code_attr,
    group='韩语组',
    sale_type='export',
    pack=None,
    products_for_weight=None,
    settings=None,
):
    """根据吨价模型计算单个物料的价格记录。

    返回 price_info 风格的字典（与 material_mapping 记录兼容），包含：
    - price: 最终外币单价（已按长度折算，不含预装调整）
    - ton_price_rmb: 原始人民币底价（单重×吨价×规格系数）
    - exchange_rate / points: 实际使用的汇率/点数
    - rate_category: 汇率类别
    - temp_inquiry: True
    若无法计算返回 None。
    """
    code = str(code or '').strip()
    if not code:
        return None

    length_mm = extract_length_from_spec(str(spec or ''))
    length_tier = _determine_length_tier(length_mm)
    factor = _spec_factor(pricing_unit, spec)

    products_for_weight = products_for_weight or []
    is_meter = str(pricing_unit or '').strip() in {'米', 'm', 'M'}
    total_weight_kg = _collect_products_weight(products_for_weight, unit_weight, is_meter)
    if total_weight_kg <= 0:
        total_weight_kg = unit_weight * factor * _parse_float(
            (products_for_weight[0] if products_for_weight else {}).get('quantity', 1), 1.0
        ) if products_for_weight else (unit_weight * factor)

    ton_type = _ton_type_from_code(code, length_tier)
    skey = _ton_setting_key(ton_type, length_tier, total_weight_kg, pack)
    fallback_skey = _ton_setting_key(ton_type, length_tier, total_weight_kg, pack, require_length=True)
    if not skey:
        return None

    needed_keys = [skey, fallback_skey] + _RATE_CAT_KEYS + [_LVPJ_COEFF_KEY]
    settings = settings or _read_temp_settings(needed_keys)

    ton_price = _parse_float(settings.get(skey), 0.0)
    if ton_price <= 0 and fallback_skey and fallback_skey != skey:
        ton_price = _parse_float(settings.get(fallback_skey), 0.0)
    if ton_price <= 0:
        return None

    cat = _category_for_attr(pricing_attr) or 'lv'
    currency = _determine_pricing_currency(group, sale_type)

    ex_key = f'exchange_rate_{cat}_{currency}'
    pt_key = f'points_{cat}_{currency}'
    exchange_rate = _parse_float(settings.get(ex_key), 0.0)
    points = _parse_float(settings.get(pt_key), 0.0)

    rmb_base = unit_weight * ton_price * factor
    if cat == 'lvpj':
        coeff = _parse_float(settings.get(_LVPJ_COEFF_KEY), _LVPJ_COEFF_DEFAULT)
        if coeff > 0:
            rmb_base *= coeff

    if sale_type == 'domestic':
        final_price = round(rmb_base, 6)
    elif cat == 'dizhuang':
        final_price = round(rmb_base / exchange_rate, 6) if exchange_rate > 0 else 0.0
    else:
        final_price = round(rmb_base / exchange_rate / points, 6) if exchange_rate > 0 and points > 0 else 0.0

    if final_price <= 0:
        return None

    return {
        'db_code': code,
        'unit': str(pricing_unit or '').strip(),
        'price': final_price,
        'ton_price': round(ton_price, 6),
        'ton_price_rmb': round(rmb_base, 6),
        'exchange_rate': exchange_rate,
        'points': points,
        'rate_category': cat,
        'code_attribute': str(code_attr or '').strip(),
        'pricing_attribute': str(pricing_attr or '').strip(),
        'attribute': '',
        'db_weight': unit_weight,
        'db_material': '',
        'image_status': 'none',
        'image_bytes': None,
        'image_ext': None,
        'issue_reason': None,
        'source': 'temp_material_pricing',
        'temp_inquiry': True,
        '_spec_prices': {
            _normalize_spec_for_compare(spec): {
                'price': final_price,
                'unit': str(pricing_unit or '').strip(),
                'ton_price_rmb': round(rmb_base, 6),
                'exchange_rate': exchange_rate,
                'points': points,
                'rate_category': cat,
                'temp_inquiry': True,
            },
        },
    }


def _normalize_spec_for_compare(spec):
    import html
    import re
    s = str(spec or '').strip()
    s = html.unescape(s)
    s = re.sub(r'\s+', '', s).lower()
    s = re.sub(r'_\([^)]*\)', '', s)
    s = re.sub(r'\.0+$', '', s)
    return s


def build_ton_price_info_for_products(
    products,
    material_attrs,
    group='韩语组',
    sale_type='export',
    pack=None,
    settings=None,
):
    """为一组产品构建按 (code, spec) 聚合的吨价计算记录。

    material_attrs: {norm_code: {'unit','unit_weight','pricing_attr','code_attr'}}
    返回 {norm_code: record, ...} 与 {norm_code: [products], ...} 的映射。
    """
    pack = _normalize_pack(pack)
    code_products_map = {}
    for p in products:
        code = str(p.get('code') or '').strip()
        if not code:
            continue
        norm = normalize_lookup_code(code)
        if not norm:
            continue
        code_products_map.setdefault(norm, []).append(p)

    needed_keys = set()
    candidate_meta = []
    for norm, prods in code_products_map.items():
        info = material_attrs.get(norm, {})
        unit_weight = _parse_float(info.get('unit_weight'), 0.0)
        if unit_weight <= 0:
            continue
        pricing_unit = str(info.get('unit') or '').strip()
        is_meter = pricing_unit in {'米', 'm', 'M'}
        total_weight_kg = _collect_products_weight(prods, unit_weight, is_meter)
        if total_weight_kg <= 0:
            continue
        # 米计价物料需按每种规格（长度）分别计价，收集不同规格对应的价格键
        distinct_specs = []
        for _p in prods:
            _sp = str(_p.get('spec') or '').strip()
            if _sp and _sp not in distinct_specs:
                distinct_specs.append(_sp)
        if not distinct_specs:
            distinct_specs = [str(prods[0].get('spec') or '').strip()]
        for _sp in distinct_specs:
            length_mm = extract_length_from_spec(_sp)
            length_tier = _determine_length_tier(length_mm)
            ton_type = _ton_type_from_code(norm, length_tier)
            skey = _ton_setting_key(ton_type, length_tier, total_weight_kg, pack)
            fallback_skey = _ton_setting_key(ton_type, length_tier, total_weight_kg, pack, require_length=True)
            if skey:
                needed_keys.add(skey)
            if fallback_skey and fallback_skey != skey:
                needed_keys.add(fallback_skey)
        candidate_meta.append({
            'norm': norm,
            'prods': prods,
            'unit_weight': unit_weight,
            'pricing_unit': pricing_unit,
            'pricing_attr': info.get('pricing_attr', ''),
            'code_attr': info.get('code_attr', ''),
            'distinct_specs': distinct_specs,
            'total_weight_kg': total_weight_kg,
        })

    if not candidate_meta:
        return {}, {}

    settings = settings or _read_temp_settings(list(needed_keys) + _RATE_CAT_KEYS + [_LVPJ_COEFF_KEY])

    records = {}
    for meta in candidate_meta:
        norm = meta['norm']
        is_meter = meta['pricing_unit'] in {'米', 'm', 'M'}
        specs_to_compute = meta['distinct_specs'] if is_meter else [meta['distinct_specs'][0]]
        merged_record = None
        for sp in specs_to_compute:
            record = compute_ton_price_record(
                code=norm,
                spec=sp,
                unit_weight=meta['unit_weight'],
                pricing_unit=meta['pricing_unit'],
                pricing_attr=meta['pricing_attr'],
                code_attr=meta['code_attr'],
                group=group,
                sale_type=sale_type,
                pack=pack,
                products_for_weight=meta['prods'],
                settings=settings,
            )
            if not record:
                continue
            if merged_record is None:
                merged_record = record
                merged_record['_spec_prices'] = dict(record.get('_spec_prices') or {})
            else:
                merged_record['_spec_prices'].update(record.get('_spec_prices') or {})
        if merged_record:
            records[norm] = merged_record

    return records, code_products_map
