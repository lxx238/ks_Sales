"""亚太组（Asia-Pacific）屋顶分销报价单构建器。

入口：split_and_create_quotations(...) —— 由 backend.core.__init__.py
按 group='亚太组' 路由调用。

BOM 解析 + 矩阵阵列匹配流水线迁移自 ko_simple，差异点：
  - 引擎改用 ap_common.quotation_engine（USD 币种、单价直接取数据库价格、模板版式）
  - 多阵列/多站点合并为「单页」报价工作表
  - 贸易方式 EXW/FOB/CIF 由 trade_method 控制（不再含运费/备品/汇率换算）
"""

import os
import shutil
import sys
import uuid
from time import perf_counter

from openpyxl import Workbook

from backend.excel.reader import excel_file_compat
from backend.core.shared.bom_utils import (
    discover_sheet_bom_starts,
    extract_bom_dataframe,
    get_bom_processing_rules,
    normalize_selected_bom_keys,
    quick_scan_bom_sheets,
    parse_array_to_rows_cols,
    read_bom_from_dataframe,
)
from backend.core.shared.image_utils import (
    scan_images,
    find_latest_image_log,
    load_image_mapping_from_log,
)
from backend.core.shared.text_utils import extract_main_name
from backend.core.shared.price_utils import resolve_price_info, has_valid_price_info, get_temp_adjusted_base_price
from backend.core.shared.weight_utils import extract_length_from_spec
from backend.core.shared.sheet_utils import set_page_break_preview
from backend.core.array_matcher import (
    build_matrix_array_entries,
    find_matching_matrix_array,
    build_bom_matrix_data,
    merge_bom_products,
    find_accumulated_match,
    find_info_accumulated_match,
)
from backend.core.ap_common.quotation_engine import (
    collect_ap_array,
    aggregate_ap_items,
    create_ap_quotation_sheet,
)

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass


def split_and_create_quotations(
        input_file,
        price_file_path,
        output_dir=None,
        image_path=None,
        image_folder=None,
        price_mapping_override=None,
        contact_info=None,
        matrix_data=None,
        return_details=False,
        selected_bom_keys=None,
        group=None,
        need_weight_code=False,
        exclude_options=None,
        trade_method='EXW',
        dest_port='',
        container_type='40HQ',
        container_qty=1,
        sale_type='export',
        coating_thickness=10,
        delete_options=None,
        always_exclude_extra_items=False,
        ap_exclude_options=None,
        pre_parsed_bom_data=None,
        pre_parsed_products_by_key=None,
        pre_parsed_bom_info_by_key=None,
        bom_sheet_keyword=None,
        **kwargs
):
    ap_discount_rate = kwargs.get('ap_discount_rate', 100)
    ap_steel_discount_rate = kwargs.get('ap_steel_discount_rate', 100)
    ap_purchased_discount_rate = kwargs.get('ap_purchased_discount_rate', 100)
    ap_freight = kwargs.get('ap_freight', 0)
    dest_port = dest_port or kwargs.get('dest_port') or 'XIAMEN'
    module_wattage = kwargs.get('module_wattage')
    if output_dir is None:
        output_dir = os.path.join(os.path.dirname(input_file), 'quotation_output')
    os.makedirs(output_dir, exist_ok=True)

    code_to_images = {}
    image_cache = {}
    image_temp_dir = None

    log_search_dirs = [output_dir, os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")]
    latest_log = find_latest_image_log(log_search_dirs)
    if latest_log:
        log_mapping = load_image_mapping_from_log(latest_log)
        if log_mapping:
            code_to_images.update(log_mapping)
            print(f"[AP] loaded image log: {latest_log}")

    if image_folder and os.path.exists(image_folder):
        scanned = scan_images(image_folder)
        for code, paths in scanned.items():
            if code not in code_to_images:
                code_to_images[code] = paths
        if code_to_images:
            image_temp_dir = os.path.join(output_dir, f"temp_images_{uuid.uuid4().hex}")
            os.makedirs(image_temp_dir, exist_ok=True)
    elif image_folder:
        image_folder = None

    print(f"\n{'=' * 80}\n[AP] Processing: {input_file}\n{'=' * 80}\n")

    _t_parse = perf_counter()

    if price_mapping_override is not None:
        price_mapping = price_mapping_override
    else:
        from backend.core.quotation_engine import load_price_mapping
        price_mapping = load_price_mapping(price_file_path)

    selected_key_set = normalize_selected_bom_keys(selected_bom_keys)
    matrix_array_entries = build_matrix_array_entries(matrix_data)
    has_explicit_matrix_arrays = bool((matrix_data or {}).get('arrays'))
    used_matrix_array_indices = set()

    column_mapping, skip_keywords, non_bom_sheet_keywords = get_bom_processing_rules()

    use_zip = False
    zip_products_by_key = None
    zip_bom_info_by_key = None

    # service 单次解析后透传（ZIP 表示），命中即跳过 builder 自身的二次解析
    if pre_parsed_products_by_key is not None and pre_parsed_bom_info_by_key is not None:
        zip_products_by_key = pre_parsed_products_by_key
        zip_bom_info_by_key = pre_parsed_bom_info_by_key
        _valid_arrays = 0
        for _bkey, _binfo in zip_bom_info_by_key.items():
            _arr = str((_binfo.get('config') or {}).get('array', ''))
            _ar, _ac = parse_array_to_rows_cols(_arr)
            if _ar and _ac:
                _valid_arrays += 1
        if zip_products_by_key and _valid_arrays >= len(zip_bom_info_by_key):
            use_zip = True
            print(f"[AP] Pre-parsed reuse: {len(zip_products_by_key)} BOM entries (skip re-parse)")
        else:
            print(f"[AP] Pre-parsed invalid arrays ({_valid_arrays}/{len(zip_bom_info_by_key)}), re-parse")
            zip_products_by_key = None
            zip_bom_info_by_key = None

    if use_zip:
        if bom_sheet_keyword:
            _keep = {k: v for k, v in zip_products_by_key.items() if bom_sheet_keyword in k}
            _keep_info = {k: v for k, v in zip_bom_info_by_key.items() if bom_sheet_keyword in k}
            print(f"[AP] Sheet filter '{bom_sheet_keyword}': {len(zip_products_by_key)} → {len(_keep)} sheets")
            zip_products_by_key = _keep
            zip_bom_info_by_key = _keep_info
        xls = None
        bom_sheet_names = []
        parsed_sheets = {}
        bom_starts_map = {}
        bom_df_map = {}
        products_map = {}
    elif pre_parsed_bom_data is not None:
        bom_sheet_names = pre_parsed_bom_data.get('bom_sheet_names', [])
        parsed_sheets = pre_parsed_bom_data.get('parsed_sheets', {})
        bom_starts_map = pre_parsed_bom_data.get('bom_starts_map', {})
        bom_df_map = pre_parsed_bom_data.get('bom_df_map', {})
        products_map = pre_parsed_bom_data.get('products_map', {})
        xls = None
    else:
        try:
            from backend.core.shared.bom_zip_parser import _parse_bom_sheets_zip
            _zip_result = _parse_bom_sheets_zip(
                input_file, selected_key_set,
                non_bom_sheet_keywords
            )
            if _zip_result and _zip_result[0]:
                zip_products_by_key = _zip_result[0]
                zip_bom_info_by_key = _zip_result[1]
                _valid_arrays = 0
                for _bkey, _binfo in zip_bom_info_by_key.items():
                    _arr = str((_binfo.get('config') or {}).get('array', ''))
                    _ar, _ac = parse_array_to_rows_cols(_arr)
                    if _ar and _ac:
                        _valid_arrays += 1
                if _valid_arrays < len(zip_bom_info_by_key):
                    print(f"[AP] ZIP parsing: only {_valid_arrays}/{len(zip_bom_info_by_key)} "
                          f"BOMs have valid arrays, falling back to non-ZIP")
                    zip_products_by_key = None
                    zip_bom_info_by_key = None
                else:
                    use_zip = True
                    print(f"[AP] ZIP fast parsing: {len(zip_products_by_key)} BOM entries")
        except Exception:
            pass

        if use_zip:
            xls = None
            bom_sheet_names = []
            parsed_sheets = {}
            bom_starts_map = {}
            bom_df_map = {}
            products_map = {}
        else:
            xls = excel_file_compat(input_file)
            bom_sheet_names = []
            parsed_sheets = {}
            bom_starts_map = {}
            bom_df_map = {}
            products_map = {}


    master_wb = Workbook()
    master_wb.remove(master_wb.active)

    print(f"[AP-TIME] BOM parse phase: {perf_counter() - _t_parse:.2f}s")
    _t_collect = perf_counter()

    all_quotation_results = []
    collected_arrays = []
    pile_products_all = []
    all_unmatched_products = []
    pile_summary = None
    pending_boms = []
    accumulated_results = []

    def _common_detail_kwargs():
        return dict(
            image_path=image_path,
            image_folder=image_folder,
            code_to_images=code_to_images,
            image_temp_dir=image_temp_dir,
            image_cache=image_cache,
            unmatched_products_list=all_unmatched_products,
            contact_info=contact_info,
            sale_type=sale_type,
            coating_thickness=coating_thickness,
            delete_options=delete_options,
            always_exclude_extra_items=always_exclude_extra_items,
            ap_exclude_options=ap_exclude_options,
            trade_method=trade_method,
            need_weight_code=need_weight_code,
            module_wattage=module_wattage,
        )

    def _collect(df_arg, config, effective_matrix_data, pre_parsed_products, matched_array, matched_idx, label):
        """收集单个阵列（不渲染），结果累计到 collected_arrays / pile_products_all。"""
        kw = _common_detail_kwargs()
        kw['config'] = config
        kw['matrix_data'] = effective_matrix_data
        kw['pre_parsed_products'] = pre_parsed_products
        collected = collect_ap_array(df_arg, price_mapping, **kw)
        collected['config'] = config
        collected['matched_array'] = matched_array
        collected['matrix_data'] = effective_matrix_data
        collected['set_count'] = effective_matrix_data.get('set_count') or 1
        if matched_idx is not None:
            collected['_matrix_idx'] = matched_idx
        collected_arrays.append(collected)
        _pile = collected.get('pile_products', [])
        if _pile:
            pile_products_all.extend(dict(pp) for pp in _pile)
        print(f"   ✅ AP collected: {label} (items={len(collected.get('items', []))}, "
              f"tables={collected['set_count']})")
        return collected

    # ========== ZIP 通道 ==========
    if use_zip and zip_products_by_key:
        for bom_key, products in zip_products_by_key.items():
            bom_info = zip_bom_info_by_key.get(bom_key)
            if not bom_info:
                continue
            config = bom_info.get('config', {})
            bom_array_str = str(config.get('array', ''))
            bom_rows, bom_cols = parse_array_to_rows_cols(bom_array_str)
            bom_miss = config.get('missing_boards', 0) or 0
            bom_base = config.get('base_count', 0) or 0
            matched_idx, matched_array = find_matching_matrix_array(
                matrix_array_entries, bom_rows, bom_cols,
                used_indices=used_matrix_array_indices if has_explicit_matrix_arrays else None,
                bom_missing=bom_miss if bom_miss > 0 else None,
                bom_base_count=bom_base,
                strict_only=has_explicit_matrix_arrays,
            )
            if matched_array is None:
                if has_explicit_matrix_arrays:
                    pending_boms.append({
                        'sheet_name': bom_info.get('variant_name', ''),
                        'bom_info': bom_info, 'products': products,
                        'rows': bom_rows, 'cols': bom_cols,
                        'base_count': bom_base, 'missing': bom_miss, 'config': config,
                    })
                    continue
            if has_explicit_matrix_arrays and matched_idx is not None:
                used_matrix_array_indices.add(matched_idx)

            sheet_prefix = bom_info.get('variant_name', '')
            if matched_array:
                ma_rows = matched_array.get('rows', '')
                ma_cols = matched_array.get('cols', '')
                ma_qty = matched_array.get('table_qty', 1)
                ma_miss = matched_array.get('missing_per_table', 0) or 0
                ma_no = matched_array.get('no', '')
                base_prefix = f"{ma_rows}×{ma_cols}_{ma_qty}"
                same_dim_entries = [
                    e for e in (matrix_array_entries or [])
                    if e.get('rows') == ma_rows and e.get('cols') == ma_cols
                    and (e.get('table_qty') or 1) == ma_qty
                ]
                if len(same_dim_entries) > 1:
                    sheet_prefix = f"{base_prefix}_缺{ma_miss}" if ma_miss > 0 else (f"{base_prefix}_{ma_no}" if ma_no else base_prefix)
                else:
                    sheet_prefix = base_prefix
                if matched_idx is not None:
                    sheet_prefix = f"({matched_idx + 1}){sheet_prefix}"

            effective_matrix_data = build_bom_matrix_data(matrix_data, matched_array, bom_config=config)
            array_info = config.get('array', '')
            span_info = config.get('cross_span', '')

            try:
                _collect(None, config, effective_matrix_data,
                         (products, array_info, span_info), matched_array, matched_idx,
                         label=sheet_prefix)
            except Exception as e:
                import traceback
                print(f"   ❌ AP detail failed: {e}"); traceback.print_exc()

    if xls is not None:
        bom_sheet_names = quick_scan_bom_sheets(xls, non_bom_sheet_keywords, selected_key_set)
        if bom_sheet_keyword:
            _before = len(bom_sheet_names)
            bom_sheet_names = [s for s in bom_sheet_names if bom_sheet_keyword in s]
            print(f"[AP] Sheet filter '{bom_sheet_keyword}': {_before} → {len(bom_sheet_names)} sheets")

    if has_explicit_matrix_arrays and matrix_array_entries:
        _sheet_match_counts = {}
        for _sn in bom_sheet_names:
            _df = parsed_sheets.get(_sn) if _sn in parsed_sheets else (xls.parse(sheet_name=_sn, header=None) if xls is not None else None)
            if _df is None or _df.empty or len(_df) < 5:
                if _df is not None:
                    parsed_sheets[_sn] = _df
                continue
            parsed_sheets[_sn] = _df
            _bstarts = bom_starts_map.get(_sn) or discover_sheet_bom_starts(_df, len(_df), sheet_name=_sn)
            bom_starts_map[_sn] = _bstarts
            _sel = [b for b in _bstarts if not selected_key_set or b.get('key') in selected_key_set]
            _cnt = 0
            for _bi in _sel:
                _as = str((_bi.get('config') or {}).get('array', ''))
                _r, _c = parse_array_to_rows_cols(_as)
                _m = (_bi.get('config') or {}).get('missing_boards', 0) or 0
                _b = (_bi.get('config') or {}).get('base_count', 0) or 0
                _, _ma = find_matching_matrix_array(matrix_array_entries, _r, _c, bom_missing=_m, bom_base_count=_b)
                if _ma:
                    _cnt += 1
            _sheet_match_counts[_sn] = _cnt
        if _sheet_match_counts:
            bom_sheet_names = sorted(bom_sheet_names, key=lambda sn: _sheet_match_counts.get(sn, 0), reverse=True)
            print(f"[AP] Sheet order by match count: {[(sn, _sheet_match_counts.get(sn, 0)) for sn in bom_sheet_names if sn in _sheet_match_counts]}")

    for sheet_name in bom_sheet_names:
        if sheet_name in parsed_sheets:
            df = parsed_sheets[sheet_name]
        elif xls is not None:
            df = xls.parse(sheet_name=sheet_name, header=None)
            parsed_sheets[sheet_name] = df
        else:
            continue
        if df.empty or len(df) < 5:
            continue

        print(f"[AP] Sheet: {sheet_name} ({df.shape})")
        total_rows = len(df)
        bom_starts = bom_starts_map.get(sheet_name) or discover_sheet_bom_starts(df, total_rows, sheet_name=sheet_name)
        bom_starts_map[sheet_name] = bom_starts
        selected_bom_starts = [
            bom_info for bom_info in bom_starts
            if not selected_key_set or bom_info.get('key') in selected_key_set
        ]

        if matrix_array_entries:
            matched = []
            for bom_info in selected_bom_starts:
                bom_array_str = str((bom_info.get('config') or {}).get('array', ''))
                bom_r, bom_c = parse_array_to_rows_cols(bom_array_str)
                bom_miss = (bom_info.get('config') or {}).get('missing_boards', 0) or 0
                bom_base = (bom_info.get('config') or {}).get('base_count', 0) or 0
                _, matched_array = find_matching_matrix_array(
                    matrix_array_entries, bom_r, bom_c, bom_missing=bom_miss, bom_base_count=bom_base,
                    strict_only=has_explicit_matrix_arrays,
                )
                if matched_array:
                    matched.append(bom_info)
            if not has_explicit_matrix_arrays:
                selected_bom_starts = matched
            else:
                rows_cols_matched = []
                for bom_info in selected_bom_starts:
                    bom_array_str = str((bom_info.get('config') or {}).get('array', ''))
                    bom_r, bom_c = parse_array_to_rows_cols(bom_array_str)
                    for me in matrix_array_entries:
                        if bom_r == me.get('rows') and bom_c == me.get('cols'):
                            rows_cols_matched.append(bom_info)
                            break
                selected_bom_starts = list({id(x): x for x in matched + rows_cols_matched}.values())

        for original_index, bom_info in enumerate(bom_starts, 1):
            if selected_key_set and bom_info.get('key') not in selected_key_set:
                continue
            if bom_info not in selected_bom_starts:
                continue

            bom_key = bom_info.get('key', '')
            bom_df = bom_df_map.get(bom_key) or extract_bom_dataframe(
                df, bom_info, original_index, bom_starts, total_rows, column_mapping, skip_keywords)
            bom_df_map[bom_key] = bom_df
            if bom_df is None or bom_df.empty:
                continue

            sheet_prefix = f"{sheet_name}_{bom_info.get('variant_name', '')}"
            try:
                bom_array_str = str((bom_info.get('config') or {}).get('array', ''))
                bom_rows, bom_cols = parse_array_to_rows_cols(bom_array_str)
                bom_miss = (bom_info.get('config') or {}).get('missing_boards', 0) or 0
                bom_base = (bom_info.get('config') or {}).get('base_count', 0) or 0
                matched_idx, matched_array = find_matching_matrix_array(
                    matrix_array_entries, bom_rows, bom_cols,
                    used_indices=used_matrix_array_indices if has_explicit_matrix_arrays else None,
                    bom_missing=bom_miss if bom_miss > 0 else None,
                    bom_base_count=bom_base,
                    strict_only=has_explicit_matrix_arrays,
                )
                if matched_array is None:
                    if has_explicit_matrix_arrays:
                        pre_parsed_products = products_map.get(bom_key)
                        _prods = pre_parsed_products[0] if pre_parsed_products else None
                        if _prods is None:
                            _prods, _, _ = read_bom_from_dataframe(bom_df) if bom_df is not None else (None, None, None)
                        pending_boms.append({
                            'sheet_name': sheet_name, 'bom_info': bom_info,
                            'products': _prods or [], 'rows': bom_rows, 'cols': bom_cols,
                            'base_count': bom_base, 'missing': bom_miss, 'config': bom_info.get('config', {}),
                        })
                        continue
                if has_explicit_matrix_arrays and matched_idx is not None:
                    used_matrix_array_indices.add(matched_idx)

                if matched_array:
                    ma_rows = matched_array.get('rows', '')
                    ma_cols = matched_array.get('cols', '')
                    ma_qty = matched_array.get('table_qty', 1)
                    ma_miss = matched_array.get('missing_per_table', 0) or 0
                    ma_no = matched_array.get('no', '')
                    base_prefix = f"{ma_rows}×{ma_cols}_{ma_qty}"
                    same_dim_entries = [
                        e for e in (matrix_array_entries or [])
                        if e.get('rows') == ma_rows and e.get('cols') == ma_cols
                        and (e.get('table_qty') or 1) == ma_qty
                    ]
                    if len(same_dim_entries) > 1:
                        sheet_prefix = f"{base_prefix}_缺{ma_miss}" if ma_miss > 0 else (f"{base_prefix}_{ma_no}" if ma_no else base_prefix)
                    else:
                        sheet_prefix = base_prefix
                    if matched_idx is not None:
                        sheet_prefix = f"({matched_idx + 1}){sheet_prefix}"

                effective_matrix_data = build_bom_matrix_data(matrix_data, matched_array, bom_config=bom_info.get('config'))
                pre_parsed_products = products_map.get(bom_key)

                _collect(bom_df, bom_info['config'], effective_matrix_data,
                         pre_parsed_products, matched_array, matched_idx, label=sheet_prefix)
            except Exception as e:
                import traceback
                print(f"   ❌ AP detail failed: {e}"); traceback.print_exc()

    # ========== 累加匹配（多 BOM → 一个矩阵阵列） ==========
    if pending_boms and has_explicit_matrix_arrays and matrix_array_entries:
        accumulated_results = find_accumulated_match(
            matrix_array_entries, pending_boms, used_matrix_array_indices,
            {r.get('sheet_name', '') for r in all_quotation_results if r.get('sheet_name')},
        )
        for acc in accumulated_results:
            m_idx = acc['matrix_idx']
            matrix_entry = acc['matrix_entry']
            selected_boms = acc.get('selected_boms', [])
            merged_products = acc.get('merged_products', [])
            used_matrix_array_indices.add(m_idx)
            ma_rows = matrix_entry.get('rows', '')
            ma_cols = matrix_entry.get('cols', '')
            ma_qty = matrix_entry.get('table_qty', 1)
            sheet_prefix = f"({m_idx + 1}){ma_rows}×{ma_cols}_{ma_qty}"
            pb_config = (selected_boms[0].get('config') if selected_boms else None) or matrix_entry
            span_info = pb_config.get('cross_span', '')
            effective_matrix_data = build_bom_matrix_data(matrix_data, matrix_entry, bom_config=pb_config)
            array_info = f"{ma_rows}×{ma_cols}" if ma_rows and ma_cols else ''
            try:
                _collect(None, pb_config, effective_matrix_data,
                         (merged_products, array_info, span_info), matrix_entry, m_idx,
                         label=f"accumulated {sheet_prefix} ({len(selected_boms)} BOMs)")
            except Exception as e:
                import traceback
                print(f"   ❌ AP accumulated detail failed: {e}"); traceback.print_exc()

    # ========== 信息表累加匹配 ==========
    info_acc_results = []
    if pending_boms and has_explicit_matrix_arrays and matrix_array_entries:
        used_bom_indices_in_acc = set()
        for acc in accumulated_results:
            for sel_bom in acc.get('selected_boms', []):
                for k, pb in enumerate(pending_boms):
                    if pb is sel_bom:
                        used_bom_indices_in_acc.add(k)
                        break
        info_acc_results = find_info_accumulated_match(
            matrix_array_entries, pending_boms, used_matrix_array_indices,
            used_bom_indices=used_bom_indices_in_acc,
        )
        for acc in info_acc_results:
            m_indices = acc['matrix_indices']
            matched_bom = acc['matched_bom']
            for m_idx in m_indices:
                used_matrix_array_indices.add(m_idx)
            bom_products = matched_bom.get('products') or []
            bom_config = matched_bom.get('config') or matched_bom
            bom_base = matched_bom.get('base_count', 0) or 0
            first_entry = acc['matrix_entries'][0]
            ma_rows = first_entry.get('rows', '')
            ma_cols = first_entry.get('cols', '')
            sheet_prefix = f"({m_indices[0] + 1}){ma_rows}×{ma_cols}_{bom_base}" if m_indices else f"{ma_rows}×{ma_cols}_{bom_base}"
            _acc_entry = dict(first_entry); _acc_entry['table_qty'] = bom_base
            effective_matrix_data = build_bom_matrix_data(matrix_data, _acc_entry, bom_config=bom_config)
            array_info = f"{ma_rows}×{ma_cols}" if ma_rows and ma_cols else ''
            span_info = bom_config.get('cross_span', '') if isinstance(bom_config, dict) else ''
            try:
                _collect(None, bom_config, effective_matrix_data,
                         (bom_products, array_info, span_info), first_entry,
                         m_indices[0] if m_indices else None,
                         label=f"info-accumulated {sheet_prefix} ({len(m_indices)} info→base={bom_base})")
            except Exception as e:
                import traceback
                print(f"   ❌ AP info-accumulated detail failed: {e}"); traceback.print_exc()

    # ========== 间接匹配兜底 ==========
    if pending_boms and has_explicit_matrix_arrays and matrix_array_entries:
        _used_bom_set = set()
        for acc in accumulated_results:
            for sel_bom in acc.get('selected_boms', []):
                for k, pb in enumerate(pending_boms):
                    if pb is sel_bom:
                        _used_bom_set.add(k)
        for acc in info_acc_results:
            matched = acc.get('matched_bom')
            if matched:
                for k, pb in enumerate(pending_boms):
                    if pb is matched:
                        _used_bom_set.add(k)
        remaining_info_indices = [i for i in range(len(matrix_array_entries)) if i not in used_matrix_array_indices]
        for m_idx in remaining_info_indices:
            info_entry = matrix_array_entries[m_idx]
            info_rows = info_entry.get('rows')
            info_cols = info_entry.get('cols')
            info_qty = info_entry.get('table_qty', 1)
            if info_rows is None or info_cols is None:
                continue
            matched_pb = None
            matched_pb_k = None
            for k, pb in enumerate(pending_boms):
                if k in _used_bom_set:
                    continue
                if pb.get('rows') == info_rows and pb.get('cols') == info_cols:
                    matched_pb = pb; matched_pb_k = k
                    break
            if matched_pb is None:
                continue
            _used_bom_set.add(matched_pb_k)
            used_matrix_array_indices.add(m_idx)
            bom_products = matched_pb.get('products') or []
            bom_config = matched_pb.get('config') or {}
            bom_base = matched_pb.get('base_count', 0) or 0
            sheet_prefix = f"({m_idx + 1}){info_rows}×{info_cols}_{info_qty}"
            effective_matrix_data = build_bom_matrix_data(matrix_data, info_entry, bom_config=bom_config)
            array_info = f"{info_rows}×{info_cols}" if info_rows and info_cols else ''
            span_info = bom_config.get('cross_span', '')
            try:
                _collect(None, bom_config, effective_matrix_data,
                         (bom_products, array_info, span_info), info_entry, m_idx,
                         label=f"indirect {sheet_prefix} (info→BOM base={bom_base})")
            except Exception as e:
                import traceback
                print(f"   ❌ AP indirect detail failed: {e}"); traceback.print_exc()

    print(f"[AP-TIME] collect phase: {perf_counter() - _t_collect:.2f}s "
          f"(arrays={len(collected_arrays)})")

    # ========== 地桩汇总 ==========
    if pile_products_all:
        _pa = 0.0
        for _pp in pile_products_all:
            _pp_code = _pp.get('code', '')
            _pp_pi = _pp.get('_price_info')
            if not _pp_pi and price_mapping:
                _pp_pi = resolve_price_info(price_mapping, _pp_code, spec=_pp.get('spec', ''))
            _pp_price = get_temp_adjusted_base_price(_pp_pi, _pp, '亚太组', sale_type) if _pp_pi and has_valid_price_info(_pp_pi) else 0
            _pp_unit = (_pp_pi.get('unit', '') if _pp_pi else '') or ''
            if _pp_unit in ('米', 'm', 'M', 'meter'):
                _len = extract_length_from_spec(_pp.get('spec', '')) or 0
                if _len > 0:
                    _pp_price = _pp_price * _len / 1000
            _pa += _pp_price * float(_pp.get('quantity', 0))
        pile_summary = {'total_qty': sum(float(_p.get('quantity', 0)) for _p in pile_products_all), 'total_price': round(_pa, 2)}
        print(f"   🔩 AP地桩汇总: 金额={_pa:.2f}")

    if all_quotation_results and has_explicit_matrix_arrays and matrix_array_entries:
        pass  # 单页输出：无需按矩阵阵列重排工作表

    if collected_arrays:
        _t_render = perf_counter()
        try:
            sites = [arr.get('site', {}) for arr in collected_arrays]
            aggregated_items = aggregate_ap_items(collected_arrays)
            result = create_ap_quotation_sheet(
                master_wb, sites, aggregated_items, price_mapping=price_mapping,
                contact_info=contact_info, matrix_data=matrix_data,
                trade_method=trade_method, coating_thickness=coating_thickness,
                sale_type=sale_type, image_path=image_path, image_folder=image_folder,
                code_to_images=code_to_images, image_temp_dir=image_temp_dir,
                image_cache=image_cache,
                ap_discount_rate=ap_discount_rate,
                ap_steel_discount_rate=ap_steel_discount_rate,
                ap_purchased_discount_rate=ap_purchased_discount_rate,
                ap_freight=ap_freight,
                dest_port=dest_port,
                module_wattage=module_wattage,
            )
            all_quotation_results.append(result)
            print(f"[AP-TIME] render+image phase: {perf_counter() - _t_render:.2f}s "
                  f"(items={len(aggregated_items)})")
            print(f"\n[AP] Done! 1 sheet ({len(aggregated_items)} items, "
                  f"sites={len(sites)}, total={result.get('total_price', 0):.2f})")
        except Exception as e:
            import traceback
            print(f"   ❌ AP quotation sheet failed: {e}"); traceback.print_exc()

        input_basename = os.path.splitext(os.path.basename(input_file))[0]
        output_file = os.path.join(output_dir, f"{input_basename}_报价汇总.xlsx")
        set_page_break_preview(master_wb)
        _t_save = perf_counter()
        master_wb.save(output_file)
        print(f"[AP-TIME] save phase: {perf_counter() - _t_save:.2f}s")
        print(f"[AP] Saved → {output_file}")

        inquiry_file = None
        if all_unmatched_products:
            from backend.core.quotation_engine import save_inquiry_sheet_to_file
            inquiry_file = save_inquiry_sheet_to_file(
                all_unmatched_products, output_dir, input_file,
                inquiry_requester=(contact_info or {}).get('inquiry_requester', ''),
            )
            if inquiry_file:
                print(f"[AP] Inquiry: {inquiry_file}")

        if image_temp_dir and os.path.exists(image_temp_dir):
            try:
                shutil.rmtree(image_temp_dir)
            except Exception:
                pass

        if return_details:
            quotation_product_codes = set()
            for r in all_quotation_results:
                for c in (r.get('quotation_product_codes') or []):
                    quotation_product_codes.add(c)
            for _pp in pile_products_all:
                _c = str(_pp.get('code', '') or '').strip()
                if _c:
                    quotation_product_codes.add(_c)
            return {
                'output_file': output_file, 'inquiry_file': inquiry_file,
                'unmatched_count': len(all_unmatched_products),
                'unmatched_products': all_unmatched_products,
                'quotation_product_codes': quotation_product_codes,
                'pile_summary': pile_summary,
            }
        return output_file

    if image_temp_dir and os.path.exists(image_temp_dir):
        try:
            shutil.rmtree(image_temp_dir)
        except Exception:
            pass

    return None
