from collections import OrderedDict
from datetime import datetime
from pathlib import Path
from time import perf_counter

from backend.config.settings import DATABASE_PATH, get_db_connection
from backend.core.bom_parser import collect_bom_products
from backend.core.statistics import build_bom_analysis
from backend.image.processor import decode_image_base64
from backend.repositories.material_repository import auto_create_missing_records, fetch_material_rows
from backend.utils.constants import (
    DB_CODE_COLUMN,
    DB_CODE_ATTRIBUTE_COLUMN,
    DB_ATTRIBUTE_COLUMN,
    DB_IMAGE_BASE64_COLUMN,
    DB_IMAGE_COLUMN,
    DB_MATERIAL_COLUMN,
    DB_NAME_COLUMN,
    DB_NAME_KO_COLUMN,
    DB_NAME_EN_COLUMN,
    DB_NAME_FR_COLUMN,
    DB_NAME_ES_COLUMN,
    DB_NAME_ZH_COLUMN,
    DB_NAME_JA_COLUMN,
    DB_PILE_15_18UM_TABLE,
    DB_PRICE_COLUMN,
    DB_PRICE_COLUMN_EN,
    DB_PRICING_ATTRIBUTE_COLUMN,
    DB_UNIT_COLUMN,
    DB_WEIGHT_COLUMN,
)
from backend.utils.converters import normalize_lookup_code, parse_price_value
from backend.core.shared.product_utils import normalize_preinstall


def log_match(message):
    print(f'[MATCH] {message}', flush=True)


def _normalize_spec_for_compare(spec):
    import html
    import re
    s = str(spec or '').strip()
    s = html.unescape(s)
    s = re.sub(r'\s+', '', s).lower()
    s = re.sub(r'_\([^)]*\)', '', s)
    s = re.sub(r'\.0+$', '', s)
    return s


def _is_pure_numeric_spec(spec):
    import re as _re
    s = _re.sub(r'[\s\.\-+,/\\]', '', str(spec or '').strip())
    if not s:
        return True
    try:
        float(s)
        return True
    except (ValueError, TypeError):
        return False


def _calc_spec_similarity(a, b):
    from difflib import SequenceMatcher
    return SequenceMatcher(None, a, b).ratio()


def _is_purchased_item(material_mapping, code, normalized):
    from backend.core.shared.constants import PURCHASED_PRICING_ATTRS
    rec = material_mapping.get(normalized) or material_mapping.get(code)
    if not rec:
        return False
    attr = str(rec.get('pricing_attribute', '')).strip().upper()
    return attr in PURCHASED_PRICING_ATTRS


_FUZZY_SPEC_THRESHOLD = 0.8

_BOM_CONTEXT_CACHE = OrderedDict()
_BOM_CONTEXT_CACHE_LIMIT = 8


def build_bom_context_cache_key(bom_file, selected_bom_keys=None, group=None):
    bom_path = Path(bom_file).resolve()
    bom_stat = bom_path.stat()
    database_path = Path(DATABASE_PATH).resolve()
    database_stat = database_path.stat()
    if isinstance(selected_bom_keys, str):
        selected_bom_keys = [selected_bom_keys]

    selected_key_tuple = tuple(sorted(str(key).strip() for key in (selected_bom_keys or []) if str(key).strip()))
    return (
        str(bom_path),
        bom_stat.st_mtime_ns,
        bom_stat.st_size,
        str(database_path),
        database_stat.st_mtime_ns,
        database_stat.st_size,
        selected_key_tuple,
        group or '',
    )


def get_cached_bom_material_context(bom_file, selected_bom_keys=None, group=None):
    try:
        cache_key = build_bom_context_cache_key(bom_file, selected_bom_keys=selected_bom_keys, group=group)
    except OSError:
        return None

    cached = _BOM_CONTEXT_CACHE.get(cache_key)
    if cached is None:
        return None

    _BOM_CONTEXT_CACHE.move_to_end(cache_key)
    log_match(f'context cache hit: {bom_file}')
    return cached


def store_cached_bom_material_context(bom_file, context, selected_bom_keys=None, group=None):
    try:
        cache_key = build_bom_context_cache_key(bom_file, selected_bom_keys=selected_bom_keys, group=group)
    except OSError:
        return

    _BOM_CONTEXT_CACHE[cache_key] = context
    _BOM_CONTEXT_CACHE.move_to_end(cache_key)

    while len(_BOM_CONTEXT_CACHE) > _BOM_CONTEXT_CACHE_LIMIT:
        _BOM_CONTEXT_CACHE.popitem(last=False)


def fetch_material_mapping(material_codes, group=None, sale_type='export', coating_thickness=10, load_images=True):
    normalized_codes = [normalize_lookup_code(code) for code in material_codes if normalize_lookup_code(code)]
    unique_codes = list(dict.fromkeys(normalized_codes))
    log_match(f'loading material rows for {len(unique_codes)} unique BOM codes (load_images={load_images})')

    started_at = perf_counter()
    price_col = DB_PRICE_COLUMN_EN if group == '英语组' else None
    if group == '英语组' and sale_type == 'domestic':
        from backend.utils.constants import DB_PRICE_COLUMN_EN_RMB
        price_col = DB_PRICE_COLUMN_EN_RMB
    elif group == '英语组' and sale_type == 'euro':
        from backend.utils.constants import DB_PRICE_COLUMN_EN_EUR
        price_col = DB_PRICE_COLUMN_EN_EUR
    elif group == '韩语组' and sale_type == 'domestic':
        from backend.utils.constants import DB_PRICE_COLUMN_RMB
        price_col = DB_PRICE_COLUMN_RMB
    elif group == '韩语组' and coating_thickness == 15:
        from backend.utils.constants import DB_PRICE_COLUMN_15U
        price_col = DB_PRICE_COLUMN_15U
    elif group == '韩语组' and coating_thickness == 18:
        from backend.utils.constants import DB_PRICE_COLUMN_18U
        price_col = DB_PRICE_COLUMN_18U
    effective_price_col = price_col or DB_PRICE_COLUMN
    rows = fetch_material_rows(material_codes, price_column=price_col, include_images=load_images)
    material_mapping = {}

    for row in rows:
        db_code = str(row.get(DB_CODE_COLUMN) or '').strip()
        normalized_code = normalize_lookup_code(db_code)
        if not normalized_code:
            continue

        price_value = parse_price_value(row.get(effective_price_col))

        if load_images:
            image_bytes, image_ext, image_status = decode_image_base64(
                row.get(DB_IMAGE_BASE64_COLUMN) or row.get(DB_IMAGE_COLUMN)
            )
        else:
            image_bytes, image_ext, image_status = None, None, 'deferred'

        record = {
            'db_code': db_code,
            'name': str(row.get(DB_NAME_COLUMN) or '').strip(),
            'name_ko': str(row.get(DB_NAME_KO_COLUMN) or '').strip(),
            'name_en': str(row.get(DB_NAME_EN_COLUMN) or '').strip(),
            'name_fr': str(row.get(DB_NAME_FR_COLUMN) or '').strip(),
            'name_es': str(row.get(DB_NAME_ES_COLUMN) or '').strip(),
            'name_zh': str(row.get(DB_NAME_ZH_COLUMN) or '').strip(),
            'name_ja': str(row.get(DB_NAME_JA_COLUMN) or '').strip(),
            'unit': str(row.get(DB_UNIT_COLUMN) or '').strip(),
            'price': price_value,
            'code_attribute': str(row.get(DB_CODE_ATTRIBUTE_COLUMN) or '').strip(),
            'pricing_attribute': str(row.get(DB_PRICING_ATTRIBUTE_COLUMN) or '').strip(),
            'attribute': str(row.get(DB_ATTRIBUTE_COLUMN) or '').strip(),
            'db_weight': parse_price_value(row.get(DB_WEIGHT_COLUMN)),
            'db_material': str(row.get(DB_MATERIAL_COLUMN) or '').strip(),
            'image_status': image_status,
            'image_bytes': image_bytes,
            'image_ext': image_ext,
            'issue_reason': None if price_value is not None else '数据库缺少价格',
        }

        material_mapping[normalized_code] = record
        if db_code:
            material_mapping[db_code] = record

    elapsed = perf_counter() - started_at
    unique_db_records = len({id(record) for record in material_mapping.values()})
    log_match(
        f'material rows loaded: raw_rows={len(rows)}, '
        f'unique_db_records={unique_db_records}, elapsed={elapsed:.2f}s'
    )

    if coating_thickness in (15, 18):
        try:
            from backend.repositories.material_repository import fetch_pile_15_18um_prices
            pile_prices = fetch_pile_15_18um_prices()
            if pile_prices:
                overridden = 0
                seen = set()
                for key, record in material_mapping.items():
                    rec_id = id(record)
                    if rec_id in seen:
                        continue
                    seen.add(rec_id)
                    attr = str(record.get('attribute', '')).strip()
                    if attr not in ('地桩', '地盤杭'):
                        continue
                    db_code = record.get('db_code', '')
                    norm_code = normalize_lookup_code(db_code)
                    pile_entry = pile_prices.get(norm_code) or pile_prices.get(db_code)
                    if not pile_entry:
                        continue
                    if group == '韩语组' and sale_type == 'domestic':
                        new_price = pile_entry.get('price_rmb')
                    elif group == '英语组' and sale_type == 'domestic':
                        new_price = pile_entry.get('price_rmb')
                    elif group == '英语组' and sale_type == 'euro':
                        new_price = pile_entry.get('price_eur')
                    elif group == '英语组':
                        new_price = pile_entry.get('price_usd')
                    elif group == '日语组':
                        new_price = pile_entry.get('price_usd')
                    else:
                        new_price = pile_entry.get('price_usd')
                    if new_price is not None:
                        record['price'] = new_price
                        record['issue_reason'] = None
                        overridden += 1
                if overridden > 0:
                    log_match(f'pile 15/18um price override: {overridden} records updated from {DB_PILE_15_18UM_TABLE}')
        except Exception as e:
            log_match(f'pile 15/18um price override skipped: {e}')

    return material_mapping


def load_images_for_codes(material_mapping, codes):
    from backend.repositories.material_repository import fetch_material_images as _fetch_images

    normalized_codes = list({normalize_lookup_code(c) for c in codes if normalize_lookup_code(c)})
    if not normalized_codes:
        return 0

    log_match(f'lazy loading images for {len(normalized_codes)} codes')
    started_at = perf_counter()

    raw_image_data = _fetch_images(normalized_codes)

    enriched_count = 0
    for code in normalized_codes:
        if code not in material_mapping:
            continue
        record = material_mapping[code]
        if record.get('image_status') != 'deferred':
            continue

        img_row = raw_image_data.get(code)
        if img_row:
            image_bytes, image_ext, image_status = decode_image_base64(
                img_row.get(DB_IMAGE_BASE64_COLUMN) or img_row.get(DB_IMAGE_COLUMN)
            )
        else:
            image_bytes, image_ext, image_status = None, None, 'missing'

        record['image_bytes'] = image_bytes
        record['image_ext'] = image_ext
        record['image_status'] = image_status
        if image_status == 'ready':
            enriched_count += 1

    elapsed = perf_counter() - started_at
    log_match(f'lazy images loaded: {enriched_count}/{len(normalized_codes)} ready, elapsed={elapsed:.2f}s')
    return enriched_count


def auto_register_missing_codes(products, material_mapping):
    missing_items = []
    seen_normalized = set()

    for product in products:
        raw_code = str(product.get('code') or '').strip()
        if not raw_code:
            continue

        normalized = normalize_lookup_code(raw_code)
        if not normalized or normalized in seen_normalized:
            continue
        seen_normalized.add(normalized)

        if normalized not in material_mapping and raw_code not in material_mapping:
            missing_items.append({
                'code': raw_code,
                'name': str(product.get('name') or '').strip(),
                'spec': str(product.get('spec') or '').strip(),
            })

    if not missing_items:
        return []

    inserted_count = auto_create_missing_records(missing_items)
    if inserted_count > 0:
        codes_preview = ', '.join(item['code'] for item in missing_items[:10])
        suffix = ' ...' if len(missing_items) > 10 else ''
        log_match(f'auto registered {inserted_count} new codes: {codes_preview}{suffix}')

    return [item['code'] for item in missing_items]


def _filter_image_needed_codes(products, material_mapping):
    from backend.core.shared.weight_utils import calculate_report_total_weight
    from backend.core.shared.price_utils import resolve_price_info

    needed_codes = set()
    for product in products:
        code = str(product.get('code') or '').strip()
        if not code:
            continue
        qty = product.get('quantity', 0)
        if not qty or qty <= 0:
            continue
        pi = resolve_price_info(material_mapping, code, spec=product.get('spec', ''))
        attr = (pi.get('attribute', '') if pi else '') or ''
        if attr.strip() in ('地桩', '地盤杭'):
            needed_codes.add(normalize_lookup_code(code))
            continue
        tw, _, _ = calculate_report_total_weight(product, qty, pi)
        if tw is not None and tw > 0:
            needed_codes.add(normalize_lookup_code(code))
    return list(needed_codes)


def build_bom_material_context(bom_file, selected_bom_keys=None, group=None, sale_type='export', coating_thickness=10, load_images=True, lazy_image_filter=False, module_wattage=None):
    if load_images and not lazy_image_filter:
        cached_context = get_cached_bom_material_context(bom_file, selected_bom_keys=selected_bom_keys, group=group)
        if cached_context is not None:
            return cached_context

    started_at = perf_counter()
    log_match(f'start parsing BOM: {bom_file}')

    parse_started_at = perf_counter()
    if group == '日语组':
        from backend.core.ja_EST.quotation_builder import _build_products_by_key as ja_build
        from backend.core.quotation_engine import get_bom_processing_rules, normalize_selected_bom_keys

        col_map, skip_kw, non_bom_kw = get_bom_processing_rules()
        sel_set = normalize_selected_bom_keys(selected_bom_keys)
        products_by_key, _bom_info_by_key, _xls, inverter_products_all, _bom_configs = ja_build(
            bom_file, sel_set, col_map, skip_kw, non_bom_kw,
        )
        products = []
        for prods in products_by_key.values():
            products.extend(prods)
        if inverter_products_all:
            products.extend(inverter_products_all)
        read_results_map = {}
        _bom_struct_meta = None
    else:
        products, read_results_map, _bom_struct_meta = collect_bom_products(bom_file, selected_bom_keys=selected_bom_keys)
    parse_elapsed = perf_counter() - parse_started_at

    material_codes = [product.get('code') for product in products]
    valid_product_count = len([code for code in material_codes if str(code or '').strip()])
    unique_code_count = len({normalize_lookup_code(code) for code in material_codes if normalize_lookup_code(code)})
    log_match(
        f'BOM parsed: total_rows={len(products)}, '
        f'valid_product_count={valid_product_count}, unique_code_count={unique_code_count}, '
        f'elapsed={parse_elapsed:.2f}s'
    )

    material_mapping = fetch_material_mapping(material_codes, group=group, sale_type=sale_type, coating_thickness=coating_thickness, load_images=load_images)

    newly_registered = auto_register_missing_codes(products, material_mapping)
    if newly_registered:
        new_mapping = fetch_material_mapping(newly_registered, group=group, sale_type=sale_type, coating_thickness=coating_thickness, load_images=load_images)
        material_mapping.update(new_mapping)

    if lazy_image_filter and products and group == '韩语组':
        needed_codes = _filter_image_needed_codes(products, material_mapping)
        loaded_count = load_images_for_codes(material_mapping, needed_codes)
        log_match(f'lazy image loading: {loaded_count} images loaded for {len(needed_codes)} codes (filtered by weight)')

    analysis_started_at = perf_counter()
    analysis = build_bom_analysis(products, material_mapping)
    analysis_elapsed = perf_counter() - analysis_started_at
    total_elapsed = perf_counter() - started_at
    log_match(
        'analysis summary: '
        f"matched_count={analysis.get('matched_count', 0)}, "
        f"unmatched_items_count={analysis.get('unmatched_items_count', 0)}, "
        f"missing_price_count={analysis.get('missing_price_count', 0)}, "
        f"missing_image_count={analysis.get('missing_image_count', 0)}, "
        f"analysis_elapsed={analysis_elapsed:.2f}s, total_elapsed={total_elapsed:.2f}s"
    )

    unmatched_codes = analysis.get('unmatched_codes') or []
    if unmatched_codes:
        preview = ', '.join(unmatched_codes[:10])
        suffix = ' ...' if len(unmatched_codes) > 10 else ''
        log_match(f'unmatched code preview: {preview}{suffix}')

    context = (products, material_mapping, analysis)
    if group != '日语组':
        context = (products, material_mapping, analysis, read_results_map, _bom_struct_meta)
    if not lazy_image_filter:
        store_cached_bom_material_context(bom_file, context, selected_bom_keys=selected_bom_keys, group=group)

    return context


def _select_cache_price(entry, group=None, sale_type='export'):
    price = entry.get('unit_price')
    usd = entry.get('unit_price_usd')
    cny = entry.get('unit_price_cny')
    eur = entry.get('unit_price_eur')
    if group == '韩语组' and sale_type == 'domestic':
        return cny or None
    if group == '韩语组' and sale_type != 'domestic':
        return usd or None
    if group == '英语组' and sale_type == 'domestic':
        return cny or None
    if group == '英语组' and sale_type == 'euro':
        return eur or None
    if group == '英语组':
        return usd or price
    return usd or cny or eur or price


def fetch_temp_code_fallback(products, material_mapping, group=None, sale_type='export'):
    from backend.repositories.inquiry_repository import ensure_price_cache_schema

    unmatched_products = []
    seen = set()
    for product in products:
        code = str(product.get('code') or '').strip()
        if not code:
            continue
        normalized = normalize_lookup_code(code)
        if not normalized:
            continue
        spec = str(product.get('spec') or '').strip()
        dedup_key = (normalized, _normalize_spec_for_compare(spec))
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        price_info = material_mapping.get(normalized) or material_mapping.get(code)
        spec_already_matched = False
        if price_info and price_info.get('_spec_prices'):
            norm_spec = _normalize_spec_for_compare(spec)
            if norm_spec in price_info['_spec_prices']:
                spec_already_matched = True
        if not spec_already_matched and (
            price_info is None or price_info.get('price') is None
        ):
            unmatched_products.append({
                'code': code,
                'normalized': normalized,
                'spec': spec,
                'name': str(product.get('name') or '').strip(),
                'quantity': product.get('quantity', 0),
                'preinstall': normalize_preinstall(product.get('preinstall')),
            })

    _pi_override = {}
    for _p in products:
        _n = normalize_lookup_code(str(_p.get('code') or '').strip())
        if not _n:
            continue
        _s = _normalize_spec_for_compare(str(_p.get('spec') or '').strip())
        if normalize_preinstall(_p.get('preinstall')) == '非预装':
            _pi_override[(_n, _s)] = '非预装'
    for _ui in unmatched_products:
        _k = (_ui['normalized'], _normalize_spec_for_compare(_ui['spec']))
        if _k in _pi_override:
            _ui['preinstall'] = '非预装'

    if not unmatched_products:
        return [], []

    ensure_price_cache_schema()
    conn = get_db_connection()
    try:
        all_codes = list({t[0] for t in seen})
        placeholders = ','.join('?' for _ in all_codes)
        now_str = datetime.now().strftime('%Y-%m-%d')
        rows = conn.execute(
            f'SELECT material_code, spec, quantity, name, unit_price, '
            f'unit_price_usd, unit_price_cny, unit_price_eur, unit, '
            f'quotation_date, valid_until, preinstall '
            f'FROM ks_inquiry_price_cache '
            f'WHERE material_code IN ({placeholders}) '
            f"AND (valid_until IS NULL OR valid_until = '' OR valid_until >= ?)",
            [*all_codes, now_str]
        ).fetchall()
        expired_rows = conn.execute(
            f'SELECT material_code FROM ks_inquiry_price_cache '
            f'WHERE material_code IN ({placeholders}) '
            f"AND valid_until != '' AND valid_until < ?",
            [*all_codes, now_str]
        ).fetchall()
        expired_count = len(expired_rows)
        if expired_count:
            log_match(f'temp cache: skipped {expired_count} expired entries (before {now_str})')
    finally:
        conn.close()

    cache_by_code = {}
    for row in rows:
        d = dict(row)
        cache_code = str(d.get('material_code') or '').strip()
        norm_cache_code = normalize_lookup_code(cache_code)
        for key in (cache_code, norm_cache_code):
            if key and key not in cache_by_code:
                cache_by_code[key] = []
            if key:
                cache_by_code[key].append(d)

    auto_matched = []
    spec_mismatch = []
    temp_matched_codes = []

    log_match(f'temp fallback: {len(unmatched_products)} unmatched products, {len(cache_by_code)} codes in cache')
    for ui in unmatched_products[:5]:
        log_match(f'  unmatched: code={ui["code"]!r} spec={ui["spec"]!r} type_spec={type(ui["spec"]).__name__}')

    match_results = []
    for item in unmatched_products:
        code = item['code']
        normalized = item['normalized']
        bom_spec = item['spec']
        bom_qty = item.get('quantity', 0)

        seen_entries = set()
        candidates = []
        for key in (code, normalized):
            for entry in (cache_by_code.get(key) or []):
                entry_id = (entry.get('spec', ''), entry.get('quantity', 0))
                if entry_id not in seen_entries:
                    seen_entries.add(entry_id)
                    candidates.append(entry)

        if not candidates:
            continue

        exact_match = None
        partial_matches = []

        for c in candidates:
            cache_spec = str(c.get('spec') or '').strip()
            cache_qty = c.get('quantity', 0)

            norm_bom_spec = _normalize_spec_for_compare(bom_spec)
            norm_cache_spec = _normalize_spec_for_compare(cache_spec)

            try:
                qty_diff = abs(float(bom_qty or 0) - float(cache_qty or 0))
            except (TypeError, ValueError):
                qty_diff = 999

            if norm_bom_spec == norm_cache_spec and (qty_diff < 0.01 or float(cache_qty or 0) == 0):
                exact_match = c
                log_match(f'temp MATCH: {code} bom_spec={bom_spec!r}({norm_bom_spec!r}) == cache_spec={cache_spec!r}({norm_cache_spec!r})')
                break
            else:
                partial_matches.append(c)

        fuzzy_match = None
        if not exact_match and partial_matches:
            log_match(f'temp MISMATCH: {code} bom_spec={bom_spec!r}({norm_bom_spec!r}) != cache_specs=[{_normalize_spec_for_compare(str(c.get("spec","") or ""))!r} for c in partial_matches[:3]]')
            if (not _is_pure_numeric_spec(bom_spec)
                    and _is_purchased_item(material_mapping, code, normalized)):
                norm_bom = _normalize_spec_for_compare(bom_spec)
                best_ratio = 0.0
                for fc in partial_matches:
                    fc_spec = str(fc.get('spec') or '').strip()
                    if _is_pure_numeric_spec(fc_spec):
                        continue
                    norm_fc = _normalize_spec_for_compare(fc_spec)
                    ratio = _calc_spec_similarity(norm_bom, norm_fc)
                    if ratio > best_ratio:
                        best_ratio = ratio
                        fuzzy_match = fc
                if best_ratio < _FUZZY_SPEC_THRESHOLD:
                    fuzzy_match = None
                else:
                    log_match(f'temp FUZZY: {code} bom={norm_bom!r} ~= cache={_normalize_spec_for_compare(str(fuzzy_match.get("spec","") or ""))!r} ratio={best_ratio:.2f}')

        matched_entry = exact_match or fuzzy_match
        if matched_entry:
            temp_matched_codes.append(code)
        elif partial_matches:
            temp_matched_codes.append(code)

        match_results.append({
            'item': item,
            'code': code,
            'normalized': normalized,
            'bom_spec': bom_spec,
            'bom_qty': bom_qty,
            'exact_match': exact_match,
            'fuzzy_match': fuzzy_match,
            'partial_matches': partial_matches,
        })

    names_from_db = {}
    if temp_matched_codes:
        db_rows = fetch_material_rows(temp_matched_codes, include_images=False)
        for row in db_rows:
            db_code = str(row.get(DB_CODE_COLUMN) or '').strip()
            n_code = normalize_lookup_code(db_code)
            names_from_db[db_code] = row
            if n_code:
                names_from_db[n_code] = row

    for mr in match_results:
        code = mr['code']
        normalized = mr['normalized']
        bom_spec = mr['bom_spec']
        bom_qty = mr['bom_qty']
        exact_match = mr['exact_match']
        fuzzy_match = mr['fuzzy_match']
        partial_matches = mr['partial_matches']

        db_row = names_from_db.get(code) or names_from_db.get(normalized)
        db_name = str(db_row.get(DB_NAME_COLUMN) or '').strip() if db_row else ''
        db_name_ko = str(db_row.get(DB_NAME_KO_COLUMN) or '').strip() if db_row else ''
        db_name_en = str(db_row.get(DB_NAME_EN_COLUMN) or '').strip() if db_row else ''
        db_name_ja = str(db_row.get(DB_NAME_JA_COLUMN) or '').strip() if db_row else ''

        matched_entry = exact_match or fuzzy_match
        if matched_entry:
            final_price = _select_cache_price(matched_entry, group=group, sale_type=sale_type)
            if final_price is None:
                continue
            norm_bom_spec = _normalize_spec_for_compare(bom_spec)

            existing = material_mapping.get(normalized) or material_mapping.get(code)
            prev_spec_prices = existing.get('_spec_prices', {}) if existing and isinstance(existing, dict) else {}

            record = {
                'db_code': code,
                'name': db_name or str(matched_entry.get('name') or mr['item'].get('name') or '').strip(),
                'name_ko': db_name_ko,
                'name_en': db_name_en,
                'name_fr': '',
                'name_es': '',
                'name_zh': '',
                'name_ja': db_name_ja,
                'unit': str(matched_entry.get('unit') or '').strip(),
                'price': final_price,
                'code_attribute': str(db_row.get(DB_CODE_ATTRIBUTE_COLUMN) or '').strip() if db_row else '',
                'pricing_attribute': str(db_row.get(DB_PRICING_ATTRIBUTE_COLUMN) or '').strip() if db_row else '',
                'attribute': str(db_row.get(DB_ATTRIBUTE_COLUMN) or '').strip() if db_row else '',
                'db_weight': parse_price_value(db_row.get(DB_WEIGHT_COLUMN)) if db_row else None,
                'db_material': str(db_row.get(DB_MATERIAL_COLUMN) or '').strip() if db_row else '',
                'image_status': 'none',
                'image_bytes': None,
                'image_ext': None,
                'issue_reason': None,
                'source': 'temp_db',
                'temp_inquiry': True,
                '_spec_prices': {
                    **prev_spec_prices,
                    norm_bom_spec: {
                        'price': final_price,
                        'unit': str(matched_entry.get('unit') or '').strip(),
                        'temp_inquiry': True,
                    },
                },
            }
            material_mapping[normalized] = record
            if code:
                material_mapping[code] = record

            auto_matched.append({
                'code': code,
                'spec': bom_spec,
                'quantity': bom_qty,
                'price': final_price,
                'unit': matched_entry.get('unit', ''),
                'source': 'temp_db_fuzzy' if fuzzy_match else 'temp_db',
                'source_date': str(matched_entry.get('quotation_date') or '').strip(),
                'cache_spec': str(matched_entry.get('spec') or '').strip(),
                'cache_quantity': matched_entry.get('quantity', 0),
                'preinstall': mr['item'].get('preinstall') or matched_entry.get('preinstall') or '预装',
                'adjusted_price': _compute_adjusted_price(
                    final_price,
                    mr['item'].get('preinstall') or matched_entry.get('preinstall') or '预装',
                    group=group, sale_type=sale_type,
                    price_info={
                        'ton_price_rmb': matched_entry.get('unit_price_rmb'),
                        'exchange_rate': None,
                        'points': None,
                        'rate_category': '',
                    },
                ),
            })
        elif partial_matches:
            spec_mismatch.append({
                'code': code,
                'bom_spec': bom_spec,
                'bom_quantity': bom_qty,
                'bom_name': mr['item'].get('name', ''),
                'candidates': [],
            })
            for c in partial_matches:
                c_price = c.get('unit_price_usd') or c.get('unit_price_cny') or c.get('unit_price_eur') or c.get('unit_price')
                spec_mismatch[-1]['candidates'].append({
                    'spec': str(c.get('spec') or '').strip(),
                    'quantity': c.get('quantity', 0),
                    'price': c_price,
                    'unit': c.get('unit', ''),
                    'quotation_date': c.get('quotation_date', ''),
                    'valid_until': c.get('valid_until', ''),
                })

    if auto_matched:
        log_match(f'temp code auto-matched: {len(auto_matched)} items')
    if spec_mismatch:
        log_match(f'temp code spec mismatch: {len(spec_mismatch)} items need confirmation')

    return auto_matched, spec_mismatch


def _determine_temp_pricing_currency(group=None, sale_type='export'):
    if sale_type == 'domestic':
        return 'rmb_fx'
    if group == '英语组' and sale_type == 'euro':
        return 'eur'
    if group == '英语组':
        return 'usd'
    return 'usd'


def _determine_length_tier(length_mm):
    if length_mm is None or length_mm <= 0:
        return '0-1'
    length_m = length_mm / 1000.0
    if length_m <= 1:
        return '0-1'
    if length_m <= 3:
        return '1-3'
    return '3+'


def _determine_ton_tier(total_weight_ton):
    if total_weight_ton < 5:
        return '0-5'
    if total_weight_ton < 50:
        return '5-50'
    return '50-999'


_METER_UNITS = {'米', 'm', 'M', 'meter', 'Meter', 'METERS', 'meters'}


def _fetch_temp_material_attrs(material_codes):
    """查询吨价底表(temp_material_pricing)中的单重/单位/定价属性。

    返回 {norm_code: {'unit_weight','unit','pricing_attr','code_attr'}, ...}。
    """
    from backend.repositories.material_repository import fetch_material_rows

    norms = [normalize_lookup_code(str(c or '')) for c in (material_codes or [])]
    norms = list(dict.fromkeys(n for n in norms if n))
    if not norms:
        return {}

    conn = get_db_connection()
    try:
        existing = {r[1] for r in conn.execute('PRAGMA table_info(temp_material_pricing)').fetchall()}
        weight_cols = [c for c in ('单重', '米重/km', '参考重量', '重量') if c in existing]
        if not weight_cols:
            return {}
        sel_cols = ['工程编码', '计价单位', '定价属性'] + weight_cols
        col_sql = ', '.join(f'"{c}"' for c in dict.fromkeys(sel_cols))
        placeholders = ', '.join(['?'] * len(norms))
        rows = conn.execute(
            f'SELECT {col_sql} FROM temp_material_pricing '
            f'WHERE UPPER(REPLACE(TRIM("工程编码"), \' \', \'\')) IN ({placeholders})',
            norms,
        ).fetchall()
    except Exception as exc:
        log_match(f'temp material attrs lookup failed: {exc}')
        return {}
    finally:
        conn.close()

    attrs = {}
    for row in rows:
        d = dict(row)
        n = normalize_lookup_code(str(d.get('工程编码') or ''))
        if not n:
            continue
        uw = 0.0
        for col in weight_cols:
            raw = d.get(col)
            if raw is None or str(raw).strip() in ('', '暂无数据'):
                continue
            try:
                v = float(str(raw).replace(',', '').strip())
                if v > 0:
                    uw = v
                    break
            except (TypeError, ValueError):
                continue
        attrs[n] = {
            'unit_weight': uw,
            'unit': str(d.get('计价单位') or '').strip(),
            'pricing_attr': str(d.get('定价属性') or '').strip(),
            'code_attr': '',
        }
    return attrs


def fetch_temp_material_pricing_fallback(products, material_mapping, group=None, sale_type='export', pack=None):
    from backend.core.shared.weight_utils import extract_length_from_spec
    from backend.core.shared.ton_price_utils import (
        build_ton_price_info_for_products,
        _determine_length_tier,
        _weight_tier_key,
        _WEIGHT_TIER_DISPLAY,
        _determine_pricing_currency,
    )

    pack = pack if pack in ('jybz', 'tietuo') else 'jybz'

    unmatched_products = []
    seen = set()
    for product in products:
        code = str(product.get('code') or '').strip()
        if not code:
            continue
        normalized = normalize_lookup_code(code)
        if not normalized:
            continue
        spec = str(product.get('spec') or '').strip()
        dedup_key = (normalized, _normalize_spec_for_compare(spec))
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        price_info = material_mapping.get(normalized) or material_mapping.get(code)
        if price_info is None or price_info.get('price') is None:
            unmatched_products.append({
                'code': code,
                'normalized': normalized,
                'spec': spec,
                'name': str(product.get('name') or '').strip(),
                'quantity': product.get('quantity', 0),
                'preinstall': normalize_preinstall(product.get('preinstall')),
            })

    _pi_override = {}
    for _p in products:
        _n = normalize_lookup_code(str(_p.get('code') or '').strip())
        if not _n:
            continue
        _s = _normalize_spec_for_compare(str(_p.get('spec') or '').strip())
        if normalize_preinstall(_p.get('preinstall')) == '非预装':
            _pi_override[(_n, _s)] = '非预装'
    for _ui in unmatched_products:
        _k = (_ui['normalized'], _normalize_spec_for_compare(_ui['spec']))
        if _k in _pi_override:
            _ui['preinstall'] = '非预装'

    if not unmatched_products:
        return [], []

    all_unmatched_codes = list({item['normalized'] for item in unmatched_products})
    material_attrs = _fetch_temp_material_attrs(all_unmatched_codes)
    if not material_attrs:
        return [], []

    records, code_products_map = build_ton_price_info_for_products(
        products=products,
        material_attrs=material_attrs,
        group=group,
        sale_type=sale_type,
        pack=pack,
    )

    if not records:
        return [], []

    currency = _determine_pricing_currency(group=group, sale_type=sale_type)
    auto_matched = []
    not_found = []

    for item in unmatched_products:
        code = item['code']
        normalized = item['normalized']
        bom_spec = item['spec']

        record = records.get(normalized)
        if not record:
            not_found.append(item)
            continue

        existing = material_mapping.get(normalized) or material_mapping.get(code)
        prev_spec_prices = existing.get('_spec_prices', {}) if existing and isinstance(existing, dict) else {}
        norm_spec = _normalize_spec_for_compare(bom_spec)

        db_name = (existing.get('name') or '') if existing else ''
        db_name_ko = (existing.get('name_ko') or '') if existing else ''
        db_name_en = (existing.get('name_en') or '') if existing else ''
        db_name_ja = (existing.get('name_ja') or '') if existing else ''

        record['name'] = db_name or record.get('name') or item.get('name', '')
        record['name_ko'] = db_name_ko or record.get('name_ko', '')
        record['name_en'] = db_name_en or record.get('name_en', '')
        record['name_fr'] = (existing.get('name_fr') or '') if existing else ''
        record['name_es'] = (existing.get('name_es') or '') if existing else ''
        record['name_zh'] = (existing.get('name_zh') or '') if existing else ''
        record['name_ja'] = db_name_ja or record.get('name_ja', '')
        record['db_material'] = (existing.get('db_material') or '') if existing else ''
        if norm_spec not in record.get('_spec_prices', {}):
            record['_spec_prices'] = {
                **prev_spec_prices,
                norm_spec: {
                    'price': record['price'],
                    'unit': record['unit'],
                    'temp_inquiry': True,
                },
            }

        material_mapping[normalized] = record
        if code:
            material_mapping[code] = record

        pricing_unit = record.get('unit', '')
        is_meter = pricing_unit in _METER_UNITS
        # 吨价模型 compute_ton_price_record 已按规格折算为每件单价，不再二次折算
        # 米计价物料按本行规格从 _spec_prices 取对应单价
        display_price = record['price']
        if is_meter:
            _spec_entry = (record.get('_spec_prices') or {}).get(norm_spec)
            if _spec_entry and _spec_entry.get('price') is not None:
                display_price = _spec_entry['price']

        _pre = item.get('preinstall') or '预装'

        all_prods_for_code = code_products_map.get(normalized, [])
        unit_weight = record.get('db_weight') or 0.0
        # 构造本行规格对应的 price_info（携带该规格的人民币底价），用于预装金额计算
        _cur_spec_entry = (record.get('_spec_prices') or {}).get(norm_spec) or {}
        spec_price_info = {**record, **_cur_spec_entry} if _cur_spec_entry else record
        total_weight_kg = 0.0
        for p in all_prods_for_code:
            qty = p.get('quantity', 0)
            if not qty or qty <= 0:
                continue
            if is_meter:
                p_len_mm = extract_length_from_spec(p.get('spec'))
                if p_len_mm and p_len_mm > 0:
                    total_weight_kg += unit_weight * (p_len_mm / 1000.0) * qty
            else:
                total_weight_kg += unit_weight * qty
        total_weight_ton = total_weight_kg / 1000.0
        ton_tier = _WEIGHT_TIER_DISPLAY.get(_weight_tier_key(total_weight_kg), '50+')
        length_mm = extract_length_from_spec(bom_spec)
        length_tier = _determine_length_tier(length_mm)

        auto_matched.append({
            'code': code,
            'spec': bom_spec,
            'quantity': item.get('quantity', 0),
            'price': round(display_price, 6),
            'unit': pricing_unit,
            'source': 'temp_material_pricing',
            'total_weight_ton': round(total_weight_ton, 3),
            'ton_tier': ton_tier,
            'length_tier': length_tier,
            'side': 'internal',
            'currency': currency,
            'col_name': record.get('rate_category', ''),
            'preinstall': _pre,
            'adjusted_price': _compute_adjusted_price(
                display_price, _pre,
                group=group, sale_type=sale_type,
                price_info=spec_price_info,
            ),
        })

    if auto_matched:
        log_match(f'temp material pricing matched: {len(auto_matched)} items')
    if not_found:
        log_match(f'temp material pricing not found: {len(not_found)} items')

    return auto_matched, not_found


def apply_confirmed_temp_codes(material_mapping, confirmed_temp_codes):
    if not confirmed_temp_codes:
        return
    codes_list = list(confirmed_temp_codes.keys())
    db_rows = fetch_material_rows(codes_list, include_images=False)
    names_from_db = {}
    for row in db_rows:
        db_code = str(row.get(DB_CODE_COLUMN) or '').strip()
        n_code = normalize_lookup_code(db_code)
        names_from_db[db_code] = row
        if n_code:
            names_from_db[n_code] = row

    for code, info in confirmed_temp_codes.items():
        normalized = normalize_lookup_code(code)
        final_price = info.get('price')
        if final_price is not None:
            try:
                final_price = float(final_price)
            except (TypeError, ValueError):
                continue

        db_row = names_from_db.get(code) or names_from_db.get(normalized)
        db_name = str(db_row.get(DB_NAME_COLUMN) or '').strip() if db_row else ''
        db_name_ko = str(db_row.get(DB_NAME_KO_COLUMN) or '').strip() if db_row else ''
        db_name_en = str(db_row.get(DB_NAME_EN_COLUMN) or '').strip() if db_row else ''
        db_name_ja = str(db_row.get(DB_NAME_JA_COLUMN) or '').strip() if db_row else ''

        record = {
            'db_code': code,
            'name': db_name or str(info.get('name') or '').strip(),
            'name_ko': db_name_ko,
            'name_en': db_name_en,
            'name_fr': '',
            'name_es': '',
            'name_zh': '',
            'name_ja': db_name_ja,
            'unit': str(info.get('unit') or '').strip(),
            'price': final_price,
            'code_attribute': str(db_row.get(DB_CODE_ATTRIBUTE_COLUMN) or '').strip() if db_row else '',
            'pricing_attribute': str(db_row.get(DB_PRICING_ATTRIBUTE_COLUMN) or '').strip() if db_row else '',
            'attribute': str(db_row.get(DB_ATTRIBUTE_COLUMN) or '').strip() if db_row else '',
            'db_weight': parse_price_value(db_row.get(DB_WEIGHT_COLUMN)) if db_row else None,
            'db_material': str(db_row.get(DB_MATERIAL_COLUMN) or '').strip() if db_row else '',
            'image_status': 'none',
            'image_bytes': None,
            'image_ext': None,
            'issue_reason': None,
            'source': 'temp_db_confirmed',
            'temp_inquiry': True,
        }
        material_mapping[normalized] = record
        if code:
            material_mapping[code] = record


def _compute_adjusted_price(base_price, preinstall, group=None, sale_type='export', price_info=None):
    """供临时询价匹配结果展示用：按预装公式算出「预装情况对应金额」。

    优先使用 price_info 中的人民币底价(ton_price_rmb)、汇率、点数、类别
    进行精确计算，与 apply_temp_preinstall_adjustment 口径一致；
    缺少人民币底价时回退到 base_price 旧口径(+1 / ×1.1)。
    """
    try:
        base = float(base_price)
    except (TypeError, ValueError):
        return None

    rmb_base = None
    exchange_rate = None
    points = None
    rate_category = ''
    if price_info:
        try:
            rmb_base = float(price_info.get('ton_price_rmb')) if price_info.get('ton_price_rmb') not in (None, '') else None
        except (TypeError, ValueError):
            rmb_base = None
        try:
            exchange_rate = float(price_info.get('exchange_rate')) if price_info.get('exchange_rate') not in (None, '') else None
        except (TypeError, ValueError):
            exchange_rate = None
        try:
            points = float(price_info.get('points')) if price_info.get('points') not in (None, '') else None
        except (TypeError, ValueError):
            points = None
        rate_category = str(price_info.get('rate_category') or '').strip()

    is_domestic = sale_type == 'domestic' or (group == '韩语组' and sale_type == 'domestic')

    pre = normalize_preinstall(preinstall)
    if pre == '非预装':
        if rmb_base is not None and exchange_rate and points:
            adjusted_rmb = rmb_base * 1.1
            if rate_category == 'dizhuang':
                return round(adjusted_rmb / exchange_rate, 6)
            return round(adjusted_rmb / exchange_rate / points, 6)
        return round(base * 1.1, 6)

    if rmb_base is not None and exchange_rate and points:
        adjusted_rmb = rmb_base + 1
        if rate_category == 'dizhuang':
            return round(adjusted_rmb / exchange_rate, 6)
        return round(adjusted_rmb / exchange_rate / points, 6)
    return round(base + 1, 6)
