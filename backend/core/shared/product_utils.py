import re

from backend.core.shared.constants import EXCLUDE_ITEM_GROUPS
from backend.core.shared.price_utils import resolve_price_info


def normalize_preinstall(value):
    """将 BOM 预装标记归一化为规范值。

    碳钢物料的「预装情况」列在 BOM 中为「不预装」或留空（默认预装）。
    统一归一化为「预装」/「非预装」，便于展示与入库。日韩询价未特别标注
    不预装的，默认按「预装」处理。
    """
    text = str(value or '').strip()
    if '不预装' in text or '非预装' in text:
        return '非预装'
    return '预装'


def _is_valid_product_code(code):
    if not code:
        return False
    code = str(code).strip()
    if not code:
        return False
    return bool(re.match(r'^[A-Za-z]', code) and any(c.isdigit() for c in code))


def _get_product_name_candidates(product, price_mapping):
    price_info = resolve_price_info(price_mapping, product.get('code', ''), spec=product.get('spec', ''))
    candidates = []
    if price_info:
        for k in ('name_ko', 'name_en', 'name'):
            v = str(price_info.get(k) or '').strip()
            if v:
                candidates.append(v.lower())
    bom_name = str(product.get('name', '') or '').strip()
    if bom_name:
        candidates.append(bom_name.lower())
    return ' '.join(candidates)


def _match_exclude_group(product, price_mapping, exclude_options, prefix_only=False):
    if not exclude_options or not any(exclude_options.values()):
        return None
    code = str(product.get('code', '') or '').strip().upper()
    combined = _get_product_name_candidates(product, price_mapping)
    for group_key, group_info in EXCLUDE_ITEM_GROUPS.items():
        if not exclude_options.get(group_key):
            continue
        if not prefix_only:
            if any(kw in combined for kw in group_info['keywords']):
                return group_key
        for prefix in group_info.get('code_prefixes', []):
            pfx = prefix.upper()
            if pfx.endswith('-'):
                if code.startswith(pfx):
                    return group_key
            else:
                if code.startswith(pfx) and len(code) > len(pfx) and code[len(pfx)].isdigit():
                    return group_key
    return None


def _is_pile_product(product, price_mapping, include_dz=False):
    code = str(product.get('code', '') or '').strip().upper()
    if code.startswith('FN-D') or code.startswith('FN-YG'):
        return True
    if include_dz and code.startswith('DZ-'):
        return True
    price_info = price_mapping.get(code) if price_mapping else None
    attr = (price_info.get('attribute', '') if price_info else '') or ''
    if attr.strip() in ('地桩', '地盤杭'):
        return True
    return False


def _split_pile_products(products, price_mapping, include_dz=False):
    bracket_products = []
    pile_products = []
    for p in products:
        if _is_pile_product(p, price_mapping, include_dz=include_dz):
            pile_products.append(p)
        else:
            bracket_products.append(p)
    return bracket_products, pile_products
