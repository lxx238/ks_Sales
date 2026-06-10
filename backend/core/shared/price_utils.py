import re
import pandas as pd
from decimal import Decimal, ROUND_HALF_UP
from backend.excel.reader import read_excel_compat
from backend.core.shared.constants import (
    CARBON_STEEL_PRICING_ATTRS, PURCHASED_PRICING_ATTRS,
)


def _is_standard_priced(price_info):
    if not price_info:
        return False
    attr = str(price_info.get('pricing_attribute', '')).strip().upper()
    return bool(attr)


def _get_discount_category(price_info, product=None):
    if not price_info:
        if product:
            return _fallback_category(product)
        return 'standard'
    attr = str(price_info.get('pricing_attribute', '')).strip().upper()
    if not attr:
        if product:
            return _fallback_category(product)
        return 'standard'
    if attr in CARBON_STEEL_PRICING_ATTRS:
        return 'steel'
    if attr in PURCHASED_PRICING_ATTRS:
        return 'purchased'
    return 'standard'


def _fallback_category(product):
    return 'standard'


def _get_discount_rate(cat, ko_discount_rate, ko_steel_discount_rate, ko_purchased_discount_rate):
    if cat == 'steel':
        return ko_steel_discount_rate
    if cat == 'purchased':
        return ko_purchased_discount_rate
    return ko_discount_rate


def load_price_mapping(price_file_path):
    print(f"\n💰 正在加载价格表: {price_file_path}")

    price_mapping = {}

    try:
        df_price = read_excel_compat(price_file_path, sheet_name=0)

        code_col = None
        price_col = None
        unit_col = None

        for col in df_price.columns:
            col_str = str(col).strip()
            if '工程编码' in col_str or '编码' in col_str or 'Code' in col_str:
                code_col = col
            if '10u小氧化' in col_str or '美元' in col_str or 'price' in col_str.lower():
                price_col = col
            if '单位' in col_str or 'Unit' in col_str or 'unit' in col_str:
                unit_col = col

        if price_col is None and len(df_price.columns) >= 3:
            price_col = df_price.columns[2]
        if code_col is None:
            code_col = df_price.columns[0]

        for idx, row in df_price.iterrows():
            code = row[code_col]
            price = row[price_col]

            unit = ''
            if unit_col is not None:
                unit_val = row[unit_col]
                if pd.notna(unit_val):
                    unit = str(unit_val).strip()

            if pd.notna(code) and pd.notna(price):
                code_str = str(code).strip()
                try:
                    price_value = float(price)
                    price_mapping[code_str] = {
                        'price': price_value,
                        'unit': unit
                    }
                except:
                    pass

        print(f"   ✅ 成功加载 {len(price_mapping)} 个产品的价格信息")

        meter_count = sum(1 for v in price_mapping.values() if v['unit'] in ['米', 'm', 'M', 'meter', 'Meter'])
        piece_count = sum(1 for v in price_mapping.values() if v['unit'] in ['个', '套', '支', '件', 'PCS', 'pcs'])
        print(
            f"   📊 价格表单位统计: 米计价 {meter_count} 项, 个/套计价 {piece_count} 项, 其他 {len(price_mapping) - meter_count - piece_count} 项")

        sample_items = list(price_mapping.items())[:10]
        if sample_items:
            print(f"   📊 价格示例: {[(k, v['price'], v['unit']) for k, v in sample_items[:5]]}")

        return price_mapping

    except Exception as e:
        print(f"   ❌ 加载价格表失败: {e}")
        return {}


def normalize_lookup_code(code):
    if code is None:
        return ''

    text = str(code).strip()
    if not text:
        return ''

    return re.sub(r'\s+', '', text).upper()


def _normalize_spec_for_price(spec):
    import html as _html
    import re as _re
    s = str(spec or '').strip()
    s = _html.unescape(s)
    s = _re.sub(r'\s+', '', s).lower()
    s = _re.sub(r'_\([^)]*\)', '', s)
    s = _re.sub(r'\.0+$', '', s)
    return s


def resolve_price_info(price_mapping, product_code, spec=None, _cache=None):
    if not price_mapping or not product_code:
        return None

    cache_key = (product_code, _normalize_spec_for_price(spec)) if spec else product_code
    if _cache is not None and cache_key in _cache:
        return _cache[cache_key]

    if product_code in price_mapping:
        result = price_mapping[product_code]
    else:
        stripped = str(product_code).strip()
        if stripped and stripped in price_mapping:
            result = price_mapping[stripped]
        else:
            normalized = normalize_lookup_code(product_code)
            if normalized and normalized in price_mapping:
                result = price_mapping[normalized]
            else:
                result = None

    if result and spec and '_spec_prices' in result and result['_spec_prices']:
        norm_spec = _normalize_spec_for_price(spec)
        spec_entry = result['_spec_prices'].get(norm_spec)
        if spec_entry:
            result = {**result, **spec_entry}
        elif result.get('price') is not None:
            pass
        else:
            result = None

    if _cache is not None:
        _cache[cache_key] = result
    return result


def has_valid_price_info(price_info):
    if not price_info:
        return False

    value = price_info.get('price')
    if value is None:
        return False

    try:
        return float(value) > 0
    except (TypeError, ValueError):
        return False


def round_to_2_decimal(value):
    if isinstance(value, (int, float)):
        value = Decimal(str(value))
    elif not isinstance(value, Decimal):
        return value
    return value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
