import os
import shutil
import uuid

from openpyxl import Workbook

from backend.core.quotation_engine import (
    excel_file_compat,
    discover_sheet_bom_starts,
    extract_bom_dataframe,
    get_bom_processing_rules,
    normalize_selected_bom_keys,
    parse_array_to_rows_cols,
    read_bom_from_dataframe,
    scan_images,
    find_latest_image_log,
    load_image_mapping_from_log,
    create_inquiry_sheet,
)
from backend.core.ja.quotation_engine import (
    create_detail_sheet,
    create_summary_sheet,
)
from backend.core.shared.sheet_utils import set_page_break_preview


def create_quotation_from_dataframe(*args, **kwargs):
    return None


def _build_products_by_key(input_file, selected_key_set, column_mapping, skip_keywords, non_bom_sheet_keywords):
    products_by_key = {}
    bom_info_by_key = {}

    xls = excel_file_compat(input_file)

    for sheet_name in xls.sheet_names:
        if any(keyword in sheet_name for keyword in non_bom_sheet_keywords):
            continue
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

    return products_by_key, bom_info_by_key, xls


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
        pre_parsed_products=None,
        pre_parsed_bom_info=None,
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

    if price_mapping_override is not None:
        price_mapping = price_mapping_override
    else:
        from backend.core.quotation_engine import load_price_mapping
        price_mapping = load_price_mapping(price_file_path)

    selected_key_set = normalize_selected_bom_keys(selected_bom_keys)
    column_mapping, skip_keywords, non_bom_sheet_keywords = get_bom_processing_rules()

    arrays = (matrix_data or {}).get('arrays') or []
    all_detail_results = []
    all_unmatched_products = []

    used_array_indices = set()

    def find_matching_array(bom_rows, bom_cols, bom_base_count=0):
        if bom_base_count:
            for i, arr in enumerate(arrays):
                if i in used_array_indices:
                    continue
                if bom_rows == arr.get('rows') and bom_cols == arr.get('cols'):
                    if bom_base_count == (arr.get('table_qty') or 1):
                        used_array_indices.add(i)
                        return arr
        for i, arr in enumerate(arrays):
            if i in used_array_indices:
                continue
            if bom_rows == arr.get('rows') and bom_cols == arr.get('cols'):
                used_array_indices.add(i)
                return arr
        return None

    def _process_products_by_key(products_by_key, bom_info_by_key, master_wb):
        for key, products in products_by_key.items():
            bom_info = bom_info_by_key.get(key)
            if not bom_info:
                continue

            config = bom_info.get('config', {})
            bom_array_str = config.get('array', '')
            bom_rows, bom_cols = parse_array_to_rows_cols(bom_array_str)

            matched_array = find_matching_array(bom_rows, bom_cols, bom_base_count=config.get('base_count', 0))
            if matched_array is None:
                continue

            variant_name = bom_info.get('variant_name', '')
            sheet_name = bom_info.get('key', '').split('::')[0] if '::' in bom_info.get('key', '') else ''
            sheet_prefix = f"{sheet_name}_{variant_name}" if sheet_name else variant_name

            try:
                detail = create_detail_sheet(
                    master_wb,
                    matched_array,
                    products,
                    price_mapping,
                    sheet_prefix=sheet_prefix,
                    image_path=image_path,
                    image_folder=image_folder,
                    code_to_images=code_to_images,
                    image_temp_dir=image_temp_dir,
                    image_cache=image_cache,
                    matrix_data=matrix_data,
                    group=group,
                    unmatched_products_out=all_unmatched_products,
                )
                detail['config'] = config
                all_detail_results.append(detail)
            except Exception as e:
                print(f"   ❌ 明細シート生成失敗: {e}")

    if pre_parsed_products and pre_parsed_bom_info:
        products_by_key = pre_parsed_products
        bom_info_by_key = pre_parsed_bom_info
    else:
        xls = excel_file_compat(input_file)
        products_by_key = {}
        bom_info_by_key = {}

        for sheet_name in xls.sheet_names:
            if any(keyword in sheet_name for keyword in non_bom_sheet_keywords):
                continue
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

    master_wb = Workbook()
    default_sheet = master_wb.active
    master_wb.remove(default_sheet)

    _process_products_by_key(products_by_key, bom_info_by_key, master_wb)

    inquiry_file = None
    if all_unmatched_products:
        try:
            inquiry_wb = Workbook()
            inquiry_wb.remove(inquiry_wb.active)
            requester = ''
            if contact_info and contact_info.get('inquiry_requester'):
                requester = contact_info['inquiry_requester']
            create_inquiry_sheet(
                inquiry_wb,
                all_unmatched_products,
                source_sheet_name='询价表',
                inquiry_requester=requester,
            )
            input_basename = os.path.splitext(os.path.basename(input_file))[0]
            inquiry_file = os.path.join(output_dir, f"{input_basename}_询价表.xlsx")
            inquiry_wb.save(inquiry_file)
            print(f"   📋 询价表: {inquiry_file}")
        except Exception as e:
            print(f"   ❌ 询价表生成失敗: {e}")
            inquiry_file = None

    if all_detail_results:
        try:
            create_summary_sheet(
                master_wb,
                all_detail_results,
                matrix_data=matrix_data,
                image_path=image_path,
            )
        except Exception as e:
            print(f"   ❌ 合計シート生成失敗: {e}")

        input_basename = os.path.splitext(os.path.basename(input_file))[0]
        output_file = os.path.join(output_dir, f"{input_basename}_見積汇总.xlsx")
        set_page_break_preview(master_wb)
        master_wb.save(output_file)

        if image_temp_dir and os.path.exists(image_temp_dir):
            try:
                shutil.rmtree(image_temp_dir)
            except Exception:
                pass

        print(f"\n✅ 処理完了：{len(all_detail_results)} 件の明細シートを生成")
        print(f"📁 出力ファイル: {output_file}")

        if return_details:
            return {
                'output_file': output_file,
                'inquiry_file': inquiry_file,
                'unmatched_count': len(all_unmatched_products),
                'unmatched_products': all_unmatched_products,
            }
        return output_file
    else:
        print("\n❌ 明細シートが生成されませんでした")
        if image_temp_dir and os.path.exists(image_temp_dir):
            try:
                shutil.rmtree(image_temp_dir)
            except Exception:
                pass
        return None
