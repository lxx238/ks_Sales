"""亚太组地面支架报价单构建器 —— 无折扣版（隔离模块）。

入口：split_and_create_quotations(...) —— 由 backend.core.__init__.py
按 group='亚太组' 且 ap_case_type=='GROUND_NO_DISCOUNT' 路由调用。

流水线：
    BOM 解析（标准 V3.0，复用 shared.bom_utils）→ 信息表阵列匹配（rows×cols）
    → 每阵列 collect + 明细页（无折扣）→ 汇总页 Total → 保存输出。

与 ap_ground（有折扣版）/ ap_common（屋顶）/ en_simple 完全隔离。
"""

import os
import shutil
import uuid

from openpyxl import Workbook

from backend.excel.reader import excel_file_compat
from backend.core.shared.bom_utils import (
    discover_sheet_bom_starts, extract_bom_dataframe, get_bom_processing_rules,
    normalize_selected_bom_keys, quick_scan_bom_sheets, parse_array_to_rows_cols,
    read_bom_from_dataframe,
)
from backend.core.shared.image_utils import scan_images, find_latest_image_log, load_image_mapping_from_log
from backend.core.array_matcher import build_bom_matrix_data
from backend.core.shared.sheet_utils import set_page_break_preview
from backend.core.ap_ground_no_discount.quotation_engine import (
    collect_ap_ground_no_disc_array,
    create_ap_ground_no_disc_detail_sheet,
    create_ap_ground_no_disc_summary_sheet,
)


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
        sale_type='export',
        coating_thickness=10,
        trade_method='EXW',
        dest_port='XIAMEN',
        ap_discount_rate=100,
        ap_steel_discount_rate=100,
        ap_purchased_discount_rate=100,
        ap_special_discount_rate=100,
        delete_options=None,
        ap_exclude_options=None,
        always_exclude_extra_items=False,
        module_wattage=None,
        production_lead_time='30days after receiving deposit',
        payment_term='30% T/T deposit, 70% balance before shipment',
        validity_days=7,
        container_details=None,
        pre_parsed_bom_data=None,
        bom_sheet_keyword=None,
        **kwargs
):
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
            print(f"[AP-GROUND-ND] loaded image log: {latest_log}")

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

    print(f"\n{'=' * 80}\n[AP-GROUND-ND] Processing: {input_file}\n{'=' * 80}\n")

    if price_mapping_override is not None:
        price_mapping = price_mapping_override
    else:
        from backend.core.shared.price_utils import load_price_mapping
        price_mapping = load_price_mapping(price_file_path)

    selected_key_set = normalize_selected_bom_keys(selected_bom_keys)
    column_mapping, skip_keywords, non_bom_sheet_keywords = get_bom_processing_rules()

    arrays = (matrix_data or {}).get('arrays') or []
    valid_arrays = [a for a in arrays if (a.get('table_qty') or 0) > 0]
    print(f"   [AP-GROUND-ND] matrix has {len(arrays)} arrays ({len(valid_arrays)} valid): "
          f"{[(a.get('rows'), a.get('cols'), a.get('table_qty')) for a in valid_arrays]}")

    # ---- BOM 解析（优先 ZIP XML 快速解析，失败回退逐 sheet 解析）----
    products_by_key = {}
    bom_info_by_key = {}
    span_info_by_key = {}

    use_zip = False
    if pre_parsed_bom_data is not None and pre_parsed_bom_data.get('products_map'):
        products_by_key = pre_parsed_bom_data.get('products_map', {}) or {}
        bom_info_by_key = {k: {'config': (pre_parsed_bom_data.get('bom_starts_map', {}) or {}).get(k, {}).get('config', {})}
                           for k in products_by_key}
        for _k, _bi in (pre_parsed_bom_data.get('bom_starts_map', {}) or {}).items():
            _sp = (_bi.get('config') or {}).get('cross_span', '')
            if _sp:
                span_info_by_key[_k] = _sp
        xls = None
    else:
        try:
            from backend.core.shared.bom_zip_parser import _parse_bom_sheets_zip
            _zip_result = _parse_bom_sheets_zip(input_file, selected_key_set, non_bom_sheet_keywords)
            if _zip_result and _zip_result[0]:
                _zp, _zi = _zip_result[0], _zip_result[1]
                _valid = sum(1 for _bi in _zi.values()
                             if parse_array_to_rows_cols(str((_bi.get('config') or {}).get('array', '')))[0])
                if _valid >= len(_zi):
                    products_by_key = _zp
                    bom_info_by_key = _zi
                    for _k, _bi in _zi.items():
                        _sp = (_bi.get('config') or {}).get('cross_span', '')
                        if _sp:
                            span_info_by_key[_k] = _sp
                    if bom_sheet_keyword:
                        products_by_key = {k: v for k, v in products_by_key.items() if bom_sheet_keyword in k}
                        bom_info_by_key = {k: v for k, v in bom_info_by_key.items() if bom_sheet_keyword in k}
                    use_zip = True
                    print(f"[AP-GROUND-ND] ZIP fast parsing: {len(products_by_key)} BOM entries")
        except Exception as _e:
            print(f"[AP-GROUND-ND] ZIP parse failed ({_e}), fallback to full parse")

        if not use_zip:
            xls = excel_file_compat(input_file)
            bom_sheet_names = quick_scan_bom_sheets(xls, non_bom_sheet_keywords, selected_key_set)
            if bom_sheet_keyword:
                bom_sheet_names = [s for s in bom_sheet_names if bom_sheet_keyword in s]
            products_by_key, bom_info_by_key, span_info_by_key = _parse_bom_sheets(
                xls, bom_sheet_names, selected_key_set, column_mapping, skip_keywords)

    master_wb = Workbook()
    master_wb.remove(master_wb.active)

    used_array_indices = set()
    all_detail_results = []
    all_unmatched_products = []
    match_success = 0
    match_skip = 0

    for key, products in products_by_key.items():
        bom_info = bom_info_by_key.get(key)
        if not bom_info:
            print(f"   [AP-GROUND-ND] skip {key}: no bom_info")
            continue
        config = bom_info.get('config', {})
        bom_array_str = config.get('array', '')
        bom_rows, bom_cols = parse_array_to_rows_cols(bom_array_str)
        matched_array = _find_matching_array(
            valid_arrays, bom_rows, bom_cols,
            bom_base_count=config.get('base_count', 0), used=used_array_indices)
        if matched_array is None:
            match_skip += 1
            print(f"   [AP-GROUND-ND] skip {key}: array='{bom_array_str}' no match")
            continue
        match_success += 1

        r = matched_array.get('rows', '')
        c = matched_array.get('cols', '')
        t = matched_array.get('table_qty', 1)
        sheet_prefix = f'{r}x{c}x{t}' if r and c else key.split('::')[0]

        effective_matrix_data = build_bom_matrix_data(matrix_data, matched_array, bom_config=config)
        try:
            collected = collect_ap_ground_no_disc_array(
                None, price_mapping, config=config, matrix_data=effective_matrix_data,
                pre_parsed_products=(products, config.get('array', ''), span_info_by_key.get(key, '')),
                sale_type=sale_type, coating_thickness=coating_thickness,
                delete_options=delete_options, always_exclude_extra_items=always_exclude_extra_items,
                ap_exclude_options=ap_exclude_options, unmatched_products_list=all_unmatched_products,
                module_wattage=module_wattage,
            )
            detail = create_ap_ground_no_disc_detail_sheet(
                master_wb, collected['site'], collected['items'],
                price_mapping=price_mapping, matrix_data=effective_matrix_data,
                config=config, contact_info=contact_info, sale_type=sale_type,
                coating_thickness=coating_thickness, image_path=image_path,
                image_folder=image_folder, code_to_images=code_to_images,
                image_temp_dir=image_temp_dir, image_cache=image_cache,
                sheet_prefix=sheet_prefix, module_wattage=module_wattage,
            )
            detail['site']['angle'] = config.get('angle', '') or effective_matrix_data.get('angle', '')
            all_detail_results.append(detail)
        except Exception as e:
            import traceback
            print(f"   [AP-GROUND-ND] detail failed: {e}")
            traceback.print_exc()

    # ---- 询价表（未匹配产品）----
    inquiry_file = None
    if all_unmatched_products:
        try:
            from backend.core.quotation_engine import save_inquiry_sheet_to_file
            inquiry_file = save_inquiry_sheet_to_file(
                all_unmatched_products, output_dir, input_file,
                inquiry_requester=(contact_info or {}).get('inquiry_requester', ''),
            )
            if inquiry_file:
                print(f"[AP-GROUND-ND] Inquiry: {inquiry_file}")
        except Exception as e:
            print(f"   [AP-GROUND-ND] inquiry sheet failed: {e}")

    # ---- 汇总页 ----
    if all_detail_results:
        try:
            create_ap_ground_no_disc_summary_sheet(
                master_wb, all_detail_results, matrix_data=matrix_data,
                contact_info=contact_info, trade_method=trade_method, dest_port=dest_port,
                production_lead_time=production_lead_time, payment_term=payment_term,
                validity_days=validity_days,
                module_wattage=module_wattage, image_path=image_path,
                container_details=container_details,
            )
        except Exception as e:
            import traceback
            print(f"   [AP-GROUND-ND] summary sheet failed: {e}")
            traceback.print_exc()

        input_basename = os.path.splitext(os.path.basename(input_file))[0]
        output_file = os.path.join(output_dir, f"{input_basename}_地面报价_无折扣.xlsx")
        set_page_break_preview(master_wb)
        master_wb.save(output_file)
        print(f"[AP-GROUND-ND] Saved → {output_file}")

        if image_temp_dir and os.path.exists(image_temp_dir):
            try:
                shutil.rmtree(image_temp_dir)
            except Exception:
                pass

        if return_details:
            quotation_product_codes = set()
            for r in all_detail_results:
                for c in (r.get('quotation_product_codes') or []):
                    quotation_product_codes.add(c)
            return {
                'output_file': output_file,
                'inquiry_file': inquiry_file,
                'unmatched_count': len(all_unmatched_products),
                'unmatched_products': all_unmatched_products,
                'quotation_product_codes': quotation_product_codes,
            }
        return output_file

    if image_temp_dir and os.path.exists(image_temp_dir):
        try:
            shutil.rmtree(image_temp_dir)
        except Exception:
            pass
    print(f"[AP-GROUND-ND] no detail sheets generated (matched={match_success}, skipped={match_skip})")
    return None


def _parse_bom_sheets(xls, bom_sheet_names, selected_key_set, column_mapping, skip_keywords):
    products_by_key = {}
    bom_info_by_key = {}
    span_info_by_key = {}
    for sheet_name in bom_sheet_names:
        df = xls.parse(sheet_name=sheet_name, header=None)
        total_rows = len(df)
        if df.empty or total_rows < 5:
            continue
        bom_starts = discover_sheet_bom_starts(df, total_rows, sheet_name=sheet_name)
        for original_index, bom_info in enumerate(bom_starts, 1):
            key = bom_info.get('key', '')
            if selected_key_set and key not in selected_key_set:
                continue
            bom_df = extract_bom_dataframe(
                df, bom_info, original_index, bom_starts, total_rows,
                column_mapping, skip_keywords,
            )
            if bom_df is None or bom_df.empty:
                continue
            products, array_info, span_info = read_bom_from_dataframe(bom_df)
            if not products:
                continue
            products_by_key[key] = products
            bom_info_by_key[key] = bom_info
            if span_info:
                span_info_by_key[key] = span_info
    return products_by_key, bom_info_by_key, span_info_by_key


def _find_matching_array(arrays, bom_rows, bom_cols, bom_base_count=0, used=None):
    """与信息表阵列匹配（迁移自 en_simple 简单匹配：先按 base_count，再宽松）。"""
    if used is None:
        used = set()
    if bom_base_count:
        for i, arr in enumerate(arrays):
            if i in used:
                continue
            if bom_rows == arr.get('rows') and bom_cols == arr.get('cols'):
                if bom_base_count == (arr.get('table_qty') or 1):
                    used.add(i)
                    return arr
    for i, arr in enumerate(arrays):
        if i in used:
            continue
        if bom_rows == arr.get('rows') and bom_cols == arr.get('cols'):
            used.add(i)
            return arr
    return None
