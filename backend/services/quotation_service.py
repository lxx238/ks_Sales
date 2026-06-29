import os
import re
import shutil
import time
import uuid
from datetime import datetime
from pathlib import Path
from time import perf_counter

from flask import send_file

from backend.config.settings import IMAGE_PATH, OUTPUT_FOLDER
from backend.core.material_matcher import build_bom_material_context, fetch_material_mapping, fetch_temp_code_fallback, fetch_temp_material_pricing_fallback, apply_confirmed_temp_codes
from backend.core import extract_matrix_data, split_and_create_quotations
from backend.core.array_validator import validate_array_matching
from backend.core.quotation_engine import (
    excel_file_compat,
    discover_sheet_bom_starts,
    extract_bom_dataframe,
    get_bom_processing_rules,
    normalize_selected_bom_keys,
    quick_scan_bom_sheets,
    read_bom_from_dataframe,
)
from backend.excel.reader import get_sheet_names
from backend.image.inserter import center_images_in_column_d
from backend.image.matcher import material_mapping_to_temp_image_dir
from backend.utils.converters import coerce_bool
from backend.utils.file_utils import (
    find_output_file,
    find_standard_file,
    resolve_bom_file,
    resolve_matrix_file,
)
from backend.utils.validators import ensure_json_payload, ensure_required_value


def log_generate(message):
    print(f'[GENERATE] {message}', flush=True)


_FRIENDLY_NAME_MAP = {}


def _sanitize_filename(name):
    name = re.sub(r'[\r\n]+', '', str(name))
    name = re.sub(r'[<>:"/\\|?*]', '_', name)
    name = re.sub(r'_+', '_', name).strip('_ ')
    return name


def _build_friendly_name(prefix, project_name, bom_filename, ext='.xlsx'):
    date_str = datetime.now().strftime('%Y%m%d')
    base_name = project_name or (os.path.splitext(bom_filename)[0] if bom_filename else '')
    base_name = _sanitize_filename(base_name)
    if base_name:
        return f'【{prefix}】{base_name}_{date_str}{ext}'
    return f'【{prefix}】{date_str}{ext}'


def _get_engine_prefix(group, ko_case_type='', case_type='', en_case_type=''):
    if group == '韩语组':
        return '견적서'
    if group == '日语组':
        return '御見積書'
    if group == '英语组':
        return 'Quotation'
    if group == '亚太组':
        return 'Quotation'
    return '报价表'


def stage_generated_file(source_path, friendly_name=None):
    source = Path(source_path)
    if not source.exists():
        raise FileNotFoundError(f'generated file not found: {source}')

    file_id = str(uuid.uuid4())
    target_name = f'{file_id}_{source.name}'
    target_path = OUTPUT_FOLDER / target_name
    for attempt in range(5):
        try:
            shutil.move(str(source), str(target_path))
            break
        except PermissionError:
            if attempt < 4:
                time.sleep(0.5)
            else:
                shutil.copy2(str(source), str(target_path))
                try:
                    os.unlink(str(source))
                except PermissionError:
                    pass
    if friendly_name:
        _FRIENDLY_NAME_MAP[file_id] = friendly_name
    return file_id, target_name, str(target_path)


def build_sheet_statistics(output_file):
    sheet_names = get_sheet_names(output_file)
    return {
        'sheet_count': len(sheet_names),
        'sheet_names': sheet_names,
    }


def generate_quotation_db_only(data):
    started_at = perf_counter()
    temp_image_dir = None
    _log_username = ''
    _log_group = ''
    _log_project_name = ''
    _log_bom_filename = data.get('bom_filename', '') if isinstance(data, dict) else ''
    _log_matrix_filename = ''
    _log_case_type = ''
    _log_match_stats = {}
    _log_output_file_ids = []
    _log_sheet_count = 0

    _logged_in_china_name = ''
    try:
        from flask import session as _session
        _log_username = str(_session.get('ks_auth_username', '') or '').strip()
        if _log_username:
            from backend.repositories.user_repository import get_account_by_username as _get_account
            _acct = _get_account(_log_username)
            if _acct:
                _logged_in_china_name = str(_acct.get('name') or '').strip()
    except Exception:
        pass

    try:
        ensure_json_payload(data)

        bom_file_id = data.get('bom_file_id')
        bom_filename = data.get('bom_filename', '')
        matrix_file_id = data.get('matrix_file_id')
        selected_bom_keys = data.get('selected_bom_keys') or []
        contact_info = data.get('contact_info') or {}
        if _logged_in_china_name:
            contact_info['inquiry_requester'] = _logged_in_china_name
        center_images = coerce_bool(data.get('center_images'), default=False)
        group = data.get('group')
        ko_case_type = data.get('ko_case_type', 'NORMAL')
        en_case_type = data.get('en_case_type', 'SIMPLE')
        en_lang = data.get('en_lang', 'en')
        ap_case_type = data.get('ap_case_type', 'ROOF')
        _log_group = str(group or '')
        _log_case_type = ''
        need_weight_code = coerce_bool(data.get('need_weight_code'), default=False)
        need_weight = coerce_bool(data.get('need_weight'), default=False)
        need_code = coerce_bool(data.get('need_code'), default=False)
        need_total_qty = coerce_bool(data.get('need_total_qty'), default=False)
        need_total_materials = coerce_bool(data.get('need_total_materials'), default=False)
        discount_method = data.get('discount_method', 'project')
        exclude_options = data.get('exclude_options') or {}
        delete_options = data.get('delete_options') or {}
        exclude_delete_options = data.get('exclude_delete_options') or {}
        exchange_rate = data.get('exchange_rate', 160)
        tariff_rate = data.get('tariff_rate', 1.6)
        consumption_tax = data.get('consumption_tax', 10)
        fence_tax = data.get('fence_tax', 10)
        discount_rate = data.get('discount_rate', 71)
        truck_desc = data.get('truck_desc', '')
        truck_fee = data.get('truck_fee', 0)
        fence_data = data.get('fence_data')
        coating_thickness = data.get('coating_thickness', 10)
        case_type = data.get('case_type', 'EST')
        nv_params = data.get('nv_params') or {}
        trade_method = data.get('trade_method', 'CIF')
        dest_port = data.get('dest_port', '부산')
        container_type = data.get('container_type', '40HQ')
        container_qty = data.get('container_qty', 1)
        sale_type = data.get('sale_type', 'export')
        # 中文报价联动人民币：英语组选择中文时，强制内贸(RMB)价格列与货币标签
        if group == '英语组' and en_lang == 'zh' and sale_type != 'domestic':
            sale_type = 'domestic'
        ko_discount_rate = data.get('ko_discount_rate', 100)
        ko_steel_discount_rate = data.get('ko_steel_discount_rate', 84)
        ko_purchased_discount_rate = data.get('ko_purchased_discount_rate', 94)
        ap_discount_rate = data.get('ap_discount_rate', 100)
        ap_steel_discount_rate = data.get('ap_steel_discount_rate', 100)
        ap_purchased_discount_rate = data.get('ap_purchased_discount_rate', 100)
        ap_freight = data.get('ap_freight', 0)
        module_wattage = data.get('module_wattage')
        ko_tariff_rate = data.get('ko_tariff_rate', 1.6)
        ko_consumption_tax = data.get('ko_consumption_tax', 10)
        ko_freight = data.get('ko_freight', 0)
        ko_cif_freight = data.get('ko_cif_freight', 0)
        ko_ddp_address = data.get('ko_ddp_address', '')
        ko_exclude_options = data.get('ko_exclude_options') or {}
        ko_discount_in_detail = True
        confirmed_temp_codes = data.get('confirmed_temp_codes')
        # 碳钢包装（简易包装/铁托）：决定报价时碳钢单价取哪套吨价预算价
        steel_pack = str(data.get('steel_pack') or '').strip().lower()
        if steel_pack not in ('jybz', 'tietuo'):
            steel_pack = 'jybz'

        if group == '日语组':
            _log_case_type = str(case_type or '')
        elif group == '英语组':
            _log_case_type = str(en_case_type or '')
        elif group == '亚太组':
            _log_case_type = str(ap_case_type or '')
        else:
            _log_case_type = str(ko_case_type or '')

        ensure_required_value(bom_file_id, '缺少 BOM 文件 ID')
        log_generate(
            f'request received, bom_file_id={bom_file_id}, '
            f'matrix_file_id={matrix_file_id or "-"}, center_images={center_images}, '
            f'selected_bom_count={len(selected_bom_keys)}, group={group}, '
            f'need_weight_code={need_weight_code}, exclude_options={exclude_options}'
        )

        bom_file = resolve_bom_file(bom_file_id)
        if not bom_file:
            log_generate(f'bom file not found, bom_file_id={bom_file_id}')
            return {'success': False, 'message': 'BOM 文件不存在'}, 400
        log_generate(f'resolved bom path: {bom_file}')

        matrix_data = None
        matrix_applied = False
        if matrix_file_id:
            matrix_file = resolve_matrix_file(matrix_file_id)
            if not matrix_file:
                log_generate(f'matrix file not found, matrix_file_id={matrix_file_id}')
                return {'success': False, 'message': '阵列表文件不存在'}, 400

            log_generate(f'resolved matrix path: {matrix_file}')
            matrix_data = extract_matrix_data(matrix_file, group=group, ap_case_type=ap_case_type)
            if module_wattage is not None:
                matrix_data['module_wattage'] = module_wattage
            matrix_applied = True
            log_generate(
                'matrix parsed: '
                f"project_name={matrix_data.get('project_name')}, "
                f"output_kw={matrix_data.get('output_kw')}, "
                f"set_count={matrix_data.get('set_count')}"
            )

        _log_project_name = (matrix_data or {}).get('project_name', '') or ''
        _log_matrix_filename = str(matrix_file_id or '')

        ja_kwargs = {}
        pre_parsed_bom_data = None
        en_products_by_key = None
        en_bom_info_by_key = None
        en_span_info_by_key = None
        pre_parsed_bom_configs = None
        ap_pre_parsed_products_by_key = None
        ap_pre_parsed_bom_info_by_key = None
        if group == '日语组':
            from backend.core.ja_EST.quotation_builder import _build_products_by_key as ja_build
            from backend.core.statistics import build_bom_analysis

            col_map, skip_kw, non_bom_kw = get_bom_processing_rules()
            sel_set = normalize_selected_bom_keys(selected_bom_keys)
            products_by_key, bom_info_by_key, _, inverter_products_all, bom_configs = ja_build(bom_file, sel_set, col_map, skip_kw, non_bom_kw)
            ja_kwargs['pre_parsed_products'] = products_by_key
            ja_kwargs['pre_parsed_bom_info'] = bom_info_by_key
            ja_kwargs['pre_parsed_bom_configs'] = bom_configs
            pre_parsed_bom_configs = bom_configs
            ja_kwargs['tariff_rate'] = tariff_rate
            ja_kwargs['consumption_tax'] = consumption_tax
            ja_kwargs['fence_tax'] = fence_tax
            ja_kwargs['discount_rate'] = discount_rate
            if case_type == 'EST':
                ja_kwargs['steel_discount_rate'] = data.get('steel_discount_rate', 84)
                ja_kwargs['purchased_discount_rate'] = data.get('purchased_discount_rate', 94)
                ja_kwargs['steel_pack'] = str(data.get('steel_pack') or '').strip().lower() or 'jybz'
            ja_kwargs['exchange_rate'] = exchange_rate
            ja_kwargs['truck_desc'] = truck_desc
            ja_kwargs['truck_fee'] = truck_fee
            ja_kwargs['coating_thickness'] = coating_thickness
            if fence_data:
                ja_kwargs['fence_data'] = fence_data
            if inverter_products_all:
                ja_kwargs['pre_parsed_inverter_products'] = inverter_products_all

            if case_type == 'NV':
                ja_kwargs['case_type'] = 'NV'
                ja_kwargs['nv_params'] = nv_params
                ja_kwargs['need_weight'] = need_weight
                ja_kwargs['need_code'] = need_code
                nv_fence_gate_data = data.get('nv_fence_gate_data')
                if nv_fence_gate_data:
                    ja_kwargs['nv_fence_gate_data'] = nv_fence_gate_data
            elif case_type == 'NORMAL':
                ja_kwargs['case_type'] = 'NORMAL'
                normal_params = data.get('normal_params') or {}
                ja_kwargs['normal_params'] = normal_params
                nv_fence_gate_data = data.get('nv_fence_gate_data')
                if nv_fence_gate_data:
                    ja_kwargs['nv_fence_gate_data'] = nv_fence_gate_data
            else:
                ja_kwargs['case_type'] = 'EST'

            all_products = []
            for prods in products_by_key.values():
                all_products.extend(prods)
            if inverter_products_all:
                all_products.extend(inverter_products_all)

            material_codes = [p.get('code') for p in all_products]
            material_mapping = fetch_material_mapping(material_codes, group=group, coating_thickness=coating_thickness)
            analysis = build_bom_analysis(all_products, material_mapping)
            analysis['material_record_count'] = len({id(record) for record in material_mapping.values()})
        elif group == '英语组':
            from backend.core.material_matcher import auto_register_missing_codes
            from backend.core.statistics import build_bom_analysis
            from backend.core.shared.bom_zip_parser import _build_products_by_key

            _en_col_map, _en_skip_kw, _en_non_bom_kw = get_bom_processing_rules()
            _en_sel_set = normalize_selected_bom_keys(selected_bom_keys)
            log_generate(f'en selected_bom_keys ({len(selected_bom_keys)}): {selected_bom_keys[:5]}...')

            _en_products_by_key, _en_bom_info_by_key, _en_xls, _en_inv, _en_bom_configs = _build_products_by_key(
                bom_file, _en_sel_set, _en_col_map, _en_skip_kw, _en_non_bom_kw,
            )
            log_generate(f'en parsed BOM keys ({len(_en_products_by_key)}): {list(_en_products_by_key.keys())[:8]}')

            en_products_by_key = {}
            en_bom_info_by_key = {}
            en_span_info_by_key = {}

            for _en_key, _en_products in _en_products_by_key.items():
                en_products_by_key[_en_key] = _en_products
                _en_bi = _en_bom_info_by_key.get(_en_key)
                if _en_bi:
                    en_bom_info_by_key[_en_key] = _en_bi
                    _en_config = (_en_bi.get('config') or {})
                    _en_span = _en_config.get('cross_span', '')
                    if _en_span:
                        en_span_info_by_key[_en_key] = _en_span

            all_products = []
            for _en_prods in en_products_by_key.values():
                all_products.extend(_en_prods)

            material_codes = [p.get('code') for p in all_products]
            material_mapping = fetch_material_mapping(material_codes, group=group, sale_type=sale_type, coating_thickness=coating_thickness)
            newly_registered = auto_register_missing_codes(all_products, material_mapping)
            if newly_registered:
                new_mapping = fetch_material_mapping(newly_registered, group=group, sale_type=sale_type, coating_thickness=coating_thickness)
                material_mapping.update(new_mapping)

            analysis = build_bom_analysis(all_products, material_mapping)
            analysis['material_record_count'] = len({id(record) for record in material_mapping.values()})
            pre_parsed_bom_configs = _en_bom_configs
        else:
            missing_ja_list = []
            pre_parsed_bom_data = None
            all_products = None
            ko_read_results_map = None
            ko_bom_struct_meta = None
            if group == '韩语组' and ko_case_type in ('KSD', 'SIMPLE'):
                pre_parsed_bom_data = _pre_parse_bom_for_ksd(bom_file, selected_bom_keys)
                all_products = _collect_products_from_pre_parsed(pre_parsed_bom_data)
                material_codes = [p.get('code') for p in all_products]
                from backend.core.material_matcher import auto_register_missing_codes
                from backend.core.statistics import build_bom_analysis
                from backend.utils.converters import normalize_lookup_code as _nlc
                material_mapping = fetch_material_mapping(material_codes, group=group, sale_type=sale_type, coating_thickness=coating_thickness)
                newly_registered = auto_register_missing_codes(all_products, material_mapping)
                if newly_registered:
                    new_mapping = fetch_material_mapping(newly_registered, group=group, sale_type=sale_type, coating_thickness=coating_thickness)
                    material_mapping.update(new_mapping)
                analysis = build_bom_analysis(all_products, material_mapping)
                analysis['material_record_count'] = len({id(record) for record in material_mapping.values()})
            elif group == '韩语组' and ko_case_type == 'NORMAL':
                ctx = build_bom_material_context(
                    bom_file,
                    selected_bom_keys=selected_bom_keys,
                    group=group,
                    sale_type=sale_type,
                    coating_thickness=coating_thickness,
                    load_images=False,
                    lazy_image_filter=True,
                    module_wattage=module_wattage,
                )
                all_products, material_mapping, analysis = ctx[0], ctx[1], ctx[2]
                ko_read_results_map = ctx[3] if len(ctx) > 3 else None
                ko_bom_struct_meta = ctx[4] if len(ctx) > 4 else None
                analysis['material_record_count'] = len({id(record) for record in material_mapping.values()})
            elif group == '亚太组':
                from backend.core.shared.bom_zip_parser import _build_products_by_key
                from backend.core.statistics import build_bom_analysis
                from backend.core.material_matcher import auto_register_missing_codes

                _ap_col_map, _ap_skip_kw, _ap_non_bom_kw = get_bom_processing_rules()
                _ap_sel_set = normalize_selected_bom_keys(selected_bom_keys)
                (_ap_products_by_key, _ap_bom_info_by_key, _ap_xls, _ap_inv, _ap_bom_configs) = _build_products_by_key(
                    bom_file, _ap_sel_set, _ap_col_map, _ap_skip_kw, _ap_non_bom_kw,
                )
                log_generate(f'ap parsed BOM keys ({len(_ap_products_by_key)}): {list(_ap_products_by_key.keys())[:8]}')

                all_products = []
                for _ap_prods in _ap_products_by_key.values():
                    all_products.extend(_ap_prods)

                material_codes = [p.get('code') for p in all_products]
                material_mapping = fetch_material_mapping(material_codes, group=group, sale_type=sale_type, coating_thickness=coating_thickness)
                newly_registered = auto_register_missing_codes(all_products, material_mapping)
                if newly_registered:
                    new_mapping = fetch_material_mapping(newly_registered, group=group, sale_type=sale_type, coating_thickness=coating_thickness)
                    material_mapping.update(new_mapping)

                analysis = build_bom_analysis(all_products, material_mapping)
                analysis['material_record_count'] = len({id(record) for record in material_mapping.values()})
                pre_parsed_bom_configs = _ap_bom_configs
                if _ap_products_by_key and _ap_bom_info_by_key:
                    ap_pre_parsed_products_by_key = _ap_products_by_key
                    ap_pre_parsed_bom_info_by_key = _ap_bom_info_by_key
            else:
                ctx = build_bom_material_context(
                    bom_file,
                    selected_bom_keys=selected_bom_keys,
                    group=group,
                    sale_type=sale_type,
                    coating_thickness=coating_thickness,
                    module_wattage=module_wattage,
                )
                all_products, material_mapping, analysis = ctx[0], ctx[1], ctx[2]
                if group == '韩语组' and len(ctx) > 3:
                    ko_read_results_map = ctx[3]
                if group == '韩语组' and len(ctx) > 4:
                    ko_bom_struct_meta = ctx[4]
                analysis['material_record_count'] = len({id(record) for record in material_mapping.values()})
        log_generate(
            'analysis context ready: '
            f"total_products={analysis.get('total_products', 0)}, "
            f"matched_count={analysis.get('matched_count', 0)}, "
            f"unmatched_items_count={analysis.get('unmatched_items_count', 0)}, "
            f"missing_image_count={analysis.get('missing_image_count', 0)}, "
            f"material_record_count={analysis.get('material_record_count', 0)}"
        )

        _log_match_stats = {
            'total_products': analysis.get('total_products', 0),
            'matched_count': analysis.get('matched_count', 0),
            'unmatched_items_count': analysis.get('unmatched_items_count', 0),
            'missing_image_count': analysis.get('missing_image_count', 0),
        }

        temp_auto_matched = []
        temp_spec_mismatch = []
        temp_pricing_matched = []
        if confirmed_temp_codes:
            apply_confirmed_temp_codes(material_mapping, confirmed_temp_codes)
            log_generate(f'applied {len(confirmed_temp_codes)} confirmed temp codes')
        elif all_products:
            temp_pricing_matched, _ = fetch_temp_material_pricing_fallback(all_products, material_mapping, group=group, sale_type=sale_type, pack=steel_pack)
            if temp_pricing_matched:
                log_generate(f'temp material pricing matched {len(temp_pricing_matched)} items')
            temp_auto_matched, temp_spec_mismatch = fetch_temp_code_fallback(all_products, material_mapping, group=group, sale_type=sale_type)
            if temp_auto_matched:
                analysis['matched_count'] = analysis.get('matched_count', 0) + len(temp_auto_matched)
                analysis['unmatched_items_count'] = max(0, analysis.get('unmatched_items_count', 0) - len(temp_auto_matched))
            if temp_pricing_matched:
                analysis['matched_count'] = analysis.get('matched_count', 0) + len(temp_pricing_matched)
                analysis['unmatched_items_count'] = max(0, analysis.get('unmatched_items_count', 0) - len(temp_pricing_matched))

        temp_image_dir, image_count = material_mapping_to_temp_image_dir(material_mapping)
        log_generate(f'temp image dir prepared: {temp_image_dir}, image_count={image_count}')

        array_warnings = []
        array_matched_details = []
        array_unmatched_info = []
        array_unmatched_bom = []
        if matrix_data and matrix_data.get('arrays'):
            try:
                selected_key_set = set(selected_bom_keys or [])
                pre_parsed_configs = ja_kwargs.get('pre_parsed_bom_configs') or pre_parsed_bom_configs
                if pre_parsed_configs:
                    bom_configs_for_validation = pre_parsed_configs
                elif pre_parsed_bom_data is not None:
                    bom_starts_map = pre_parsed_bom_data.get('bom_starts_map', {})
                    bom_configs_for_validation = []
                    for _sn, bstarts in bom_starts_map.items():
                        for b in bstarts:
                            if not selected_key_set or b.get('key') in selected_key_set:
                                bom_configs_for_validation.append(b)
                else:
                    _, _, non_bom_kw = get_bom_processing_rules()
                    xls = excel_file_compat(bom_file)
                    target_sheets = set()
                    for key in selected_key_set:
                        parts = key.split('::')
                        if parts:
                            target_sheets.add(parts[0])
                    bom_configs_for_validation = []
                    for sn in xls.sheet_names:
                        if any(kw in sn for kw in non_bom_kw):
                            continue
                        if target_sheets and sn not in target_sheets:
                            continue
                        df = xls.parse(sheet_name=sn, header=None)
                        sheet_boms = discover_sheet_bom_starts(df, len(df), sheet_name=sn)
                        for b in sheet_boms:
                            if not selected_key_set or b.get('key') in selected_key_set:
                                bom_configs_for_validation.append(b)
                result = validate_array_matching(matrix_data.get('arrays', []), bom_configs_for_validation)
                if isinstance(result, tuple):
                    array_warnings = result[0] if len(result) > 0 else []
                    array_matched_details = result[1] if len(result) > 1 else []
                    array_unmatched_info = result[2] if len(result) > 2 else []
                    array_unmatched_bom = result[3] if len(result) > 3 else []
                else:
                    array_warnings = result
                    array_matched_details = []
                    array_unmatched_info = []
                    array_unmatched_bom = []
                if array_warnings:
                    log_generate(f'array validation warnings: {len(array_warnings)}')
                    for w in array_warnings:
                        log_generate(f'  ⚠ {w}')
            except Exception as exc:
                log_generate(f'array validation skipped: {exc}')

        logo_path = str(IMAGE_PATH) if Path(IMAGE_PATH).exists() else None
        ko_kwargs = {}
        if group in ('韩语组', '英语组'):
            ko_kwargs['ko_discount_rate'] = ko_discount_rate
            ko_kwargs['ko_steel_discount_rate'] = ko_steel_discount_rate
            ko_kwargs['ko_purchased_discount_rate'] = ko_purchased_discount_rate
            ko_kwargs['coating_thickness'] = coating_thickness
            ko_kwargs['trade_method'] = trade_method
            ko_kwargs['dest_port'] = dest_port
            ko_kwargs['container_type'] = container_type
            ko_kwargs['container_qty'] = container_qty
            ko_kwargs['ko_cif_freight'] = ko_cif_freight
        if group == '韩语组':
            ko_kwargs['delete_options'] = delete_options
            ko_kwargs['always_exclude_extra_items'] = True
            ko_kwargs['ko_exclude_options'] = ko_exclude_options
            ko_kwargs['ko_case_type'] = ko_case_type
            ko_kwargs['sale_type'] = sale_type
            ko_kwargs['ko_tariff_rate'] = ko_tariff_rate
            ko_kwargs['ko_consumption_tax'] = ko_consumption_tax
            ko_kwargs['ko_freight'] = ko_freight
            ko_kwargs['ko_ddp_address'] = ko_ddp_address
            ko_kwargs['ko_discount_in_detail'] = ko_discount_in_detail
            if ko_read_results_map:
                ko_kwargs['pre_parsed_products_by_key'] = ko_read_results_map
            if ko_bom_struct_meta:
                ko_kwargs['pre_parsed_bom_struct_meta'] = ko_bom_struct_meta

        if group == '英语组':
            ko_kwargs['en_case_type'] = en_case_type
            ko_kwargs['sale_type'] = sale_type
            ko_kwargs['quote_validity'] = data.get('quote_validity', '7d')
            ko_kwargs['en_lang'] = en_lang
            ko_kwargs['discount_method'] = discount_method
            ko_kwargs['payment_term'] = data.get('payment_term', '3070shipment')
            ko_kwargs['seller_name'] = data.get('seller_name', 'metal')
            ko_kwargs['pre_parsed_products'] = en_products_by_key
            ko_kwargs['pre_parsed_bom_info'] = en_bom_info_by_key
            ko_kwargs['pre_parsed_span_info'] = en_span_info_by_key
            container_details = data.get('container_details')
            if container_details and isinstance(container_details, list):
                ko_kwargs['container_details'] = container_details

        ap_kwargs = {}
        if group == '亚太组':
            ap_kwargs['trade_method'] = trade_method
            ap_kwargs['coating_thickness'] = coating_thickness
            ap_kwargs['delete_options'] = delete_options
            ap_kwargs['always_exclude_extra_items'] = True
            ap_kwargs['ap_discount_rate'] = ap_discount_rate
            ap_kwargs['ap_steel_discount_rate'] = ap_steel_discount_rate
            ap_kwargs['ap_purchased_discount_rate'] = ap_purchased_discount_rate
            ap_kwargs['ap_freight'] = ap_freight
            ap_kwargs['dest_port'] = data.get('dest_port', 'XIAMEN')
            ap_kwargs['module_wattage'] = module_wattage
            ap_kwargs['ap_case_type'] = ap_case_type
            if str(ap_case_type or '').upper() == 'GROUND':
                ap_kwargs['ap_exclude_options'] = data.get('ap_exclude_options') or {}
                ap_kwargs['ap_special_discount_rate'] = data.get('ap_special_discount_rate', 100)
                ap_kwargs['production_lead_time'] = data.get('production_lead_time', '30days after receiving deposit')
                ap_kwargs['payment_term'] = data.get('payment_term', '30% T/T deposit, 70% balance before shipment')
                ap_kwargs['container_details'] = data.get('container_details')
                ap_kwargs['validity_days'] = data.get('validity_days', 7)
            if ap_pre_parsed_products_by_key and ap_pre_parsed_bom_info_by_key:
                ap_kwargs['pre_parsed_products_by_key'] = ap_pre_parsed_products_by_key
                ap_kwargs['pre_parsed_bom_info_by_key'] = ap_pre_parsed_bom_info_by_key

        if group == '英语组':
            _bom_arr_count = len(en_products_by_key) if en_products_by_key else 0
            _matrix_arr_count = len([a for a in (matrix_data or {}).get('arrays', []) if (a.get('table_qty') or 0) > 0]) if matrix_data else 0
            log_generate(f'en generation params: bom_entries={_bom_arr_count}, matrix_arrays={_matrix_arr_count}, selected_bom_keys={len(selected_bom_keys)}')

        generate_result = split_and_create_quotations(
            bom_file,
            None,
            output_dir=str(OUTPUT_FOLDER),
            image_path=logo_path,
            image_folder=temp_image_dir,
            price_mapping_override=material_mapping,
            contact_info=contact_info,
            matrix_data=matrix_data,
            return_details=True,
            selected_bom_keys=selected_bom_keys,
            group=group,
            exclude_options=exclude_options,
            exclude_delete_options=exclude_delete_options,
            need_weight_code=need_weight_code,
            need_total_qty=need_total_qty,
            **ja_kwargs,
            **ko_kwargs,
            **ap_kwargs,
            **({'need_total_materials': need_total_materials} if group in ('英语组', '韩语组') else {}),
            **({'pre_parsed_bom_data': pre_parsed_bom_data} if pre_parsed_bom_data else {}),
        )

        if not generate_result or not generate_result.get('output_file'):
            elapsed = perf_counter() - started_at
            log_generate(f'generation returned no output after {elapsed:.2f}s')
            return {'success': False, 'message': '报价表生成失败'}, 500

        project_name = (matrix_data or {}).get('project_name', '') or ''
        engine_prefix = _get_engine_prefix(group, ko_case_type=ko_case_type, case_type=case_type)
        output_friendly = _build_friendly_name(engine_prefix, project_name, bom_filename)
        inquiry_friendly = _build_friendly_name('询价表', project_name, bom_filename)

        output_file_id, output_filename, output_path = stage_generated_file(
            generate_result['output_file'], friendly_name=output_friendly,
        )
        log_generate(f'output staged: file_id={output_file_id}, friendly={output_friendly}, path={output_path}')

        inquiry_file_id = None
        inquiry_filename = None
        inquiry_path = None
        if generate_result.get('inquiry_file'):
            inquiry_file_id, inquiry_filename, inquiry_path = stage_generated_file(
                generate_result['inquiry_file'], friendly_name=inquiry_friendly,
            )
            log_generate(f'inquiry staged: file_id={inquiry_file_id}, friendly={inquiry_friendly}, path={inquiry_path}')

        if center_images:
            log_generate('centering images in output workbook')
            center_images_in_column_d(output_path)

        statistics = build_sheet_statistics(output_path)
        elapsed = perf_counter() - started_at
        _log_output_file_ids = [output_file_id] if output_file_id else []
        if inquiry_file_id:
            _log_output_file_ids.append(inquiry_file_id)
        _log_sheet_count = statistics.get('sheet_count', 0)
        log_generate(
            'generation done: '
            f'output_filename={output_filename}, '
            f'sheet_count={statistics["sheet_count"]}, '
            f'inquiry_file={"yes" if inquiry_path else "no"}, '
            f'elapsed={elapsed:.2f}s'
        )

        try:
            from backend.repositories.quotation_log_repository import insert_log as _insert_log
            _insert_log(
                username=_log_username, group_name=_log_group,
                project_name=_log_project_name, bom_filename=_log_bom_filename,
                matrix_filename=_log_matrix_filename, case_type=_log_case_type,
                match_stats=_log_match_stats, output_file_ids=_log_output_file_ids,
                sheet_count=_log_sheet_count, status='success',
                error_message='', duration_ms=int(elapsed * 1000),
            )
        except Exception as _log_exc:
            log_generate(f'usage log write failed: {_log_exc}')

        result = {
            'success': True,
            'output_file_id': output_file_id,
            'output_filename': output_friendly,
            'output_dir': os.path.dirname(output_path),
            'output_path': output_path,
            'inquiry_file_id': inquiry_file_id,
            'inquiry_filename': inquiry_friendly if inquiry_file_id else None,
            'inquiry_path': inquiry_path,
            'statistics': statistics,
            'center_images': center_images,
            'matrix_applied': matrix_applied,
            'matrix_data': matrix_data,
            'analysis': analysis,
            'image_source': {
                'mode': 'database_base64',
                'image_count': image_count,
            },
            'message': '报价表生成成功',
            'array_warnings': array_warnings,
            'array_matched_details': array_matched_details,
            'array_unmatched_info': array_unmatched_info,
            'array_unmatched_bom': array_unmatched_bom,
        }

        if generate_result:
            from backend.utils.converters import normalize_lookup_code as _nlc
            quotation_codes_normalized = set()
            for c in (generate_result.get('quotation_product_codes') or []):
                nc = _nlc(str(c).strip())
                if nc:
                    quotation_codes_normalized.add(nc)
            for p in (generate_result.get('unmatched_products') or []):
                c = str(p.get('code', '')).strip()
                nc = _nlc(c)
                if nc:
                    quotation_codes_normalized.add(nc)

            temp_auto_matched = [item for item in temp_auto_matched
                                 if _nlc(str(item.get('code', '')).strip()) in quotation_codes_normalized]
            temp_spec_mismatch = [item for item in temp_spec_mismatch
                                  if _nlc(str(item.get('code', '')).strip()) in quotation_codes_normalized]

            if generate_result.get('unmatched_products'):
                result['unmatched_products'] = generate_result['unmatched_products']

        result['temp_auto_matched'] = temp_auto_matched
        result['temp_spec_mismatch'] = temp_spec_mismatch
        result['temp_pricing_matched'] = temp_pricing_matched

        if group == '日语组' and generate_result:
            ja_missing_ja = generate_result.get('missing_ja_list', [])
            if ja_missing_ja:
                result['missing_ja_count'] = len(ja_missing_ja)
                result['missing_ja_list'] = ja_missing_ja
            ja_missing_img = generate_result.get('missing_image_codes', [])
            if ja_missing_img:
                result['missing_image_codes'] = ja_missing_img
                ja_items = []
                for c in ja_missing_img:
                    item_name = ''
                    if material_mapping:
                        from backend.utils.converters import normalize_lookup_code as _nlc
                        for key, rec in material_mapping.items():
                            if _nlc(str(rec.get('db_code') or key or '')) == _nlc(c):
                                item_name = rec.get('name', '')
                                break
                    if not item_name and all_products:
                        for p in all_products:
                            if str(p.get('code', '')).strip() == c:
                                item_name = str(p.get('name', '')).strip()
                                break
                    ja_items.append({'code': c, 'name': item_name})
                result['missing_image_items'] = ja_items
        else:
            missing_img = analysis.get('missing_image_codes', [])
            if missing_img:
                result['missing_image_codes'] = missing_img
                items_from_analysis = analysis.get('missing_image_items')
                if items_from_analysis:
                    result['missing_image_items'] = items_from_analysis
                else:
                    fallback_items = []
                    for c in missing_img:
                        item_name = ''
                        if material_mapping:
                            from backend.utils.converters import normalize_lookup_code as _nlc2
                            for key, rec in material_mapping.items():
                                if _nlc2(str(rec.get('db_code') or key or '')) == _nlc2(c):
                                    item_name = rec.get('name', '')
                                    break
                        if not item_name and all_products:
                            for p in all_products:
                                if str(p.get('code', '')).strip() == c:
                                    item_name = str(p.get('name', '')).strip()
                                    break
                        fallback_items.append({'code': c, 'name': item_name})
                    result['missing_image_items'] = fallback_items

        return result, 200
    except ValueError as exc:
        log_generate(f'validation failed: {exc}')
        try:
            from backend.repositories.quotation_log_repository import insert_log as _insert_log
            _insert_log(
                username=_log_username, group_name=_log_group,
                project_name=_log_project_name, bom_filename=_log_bom_filename,
                matrix_filename=_log_matrix_filename, case_type=_log_case_type,
                match_stats=_log_match_stats, output_file_ids=_log_output_file_ids,
                sheet_count=_log_sheet_count, status='failed',
                error_message=str(exc), duration_ms=int((perf_counter() - started_at) * 1000),
            )
        except Exception:
            pass
        return {'success': False, 'message': str(exc)}, 400
    except Exception as exc:
        elapsed = perf_counter() - started_at
        import traceback
        traceback.print_exc()
        log_generate(f'generation failed after {elapsed:.2f}s: {exc}')
        try:
            from backend.repositories.quotation_log_repository import insert_log as _insert_log
            _insert_log(
                username=_log_username, group_name=_log_group,
                project_name=_log_project_name, bom_filename=_log_bom_filename,
                matrix_filename=_log_matrix_filename, case_type=_log_case_type,
                match_stats=_log_match_stats, output_file_ids=_log_output_file_ids,
                sheet_count=_log_sheet_count, status='failed',
                error_message=str(exc), duration_ms=int(elapsed * 1000),
            )
        except Exception:
            pass
        return {'success': False, 'message': f'报价表生成失败: {exc}'}, 500
    finally:
        if temp_image_dir and os.path.isdir(temp_image_dir):
            shutil.rmtree(temp_image_dir, ignore_errors=True)


def _collect_products_from_pre_parsed(pre_parsed_bom_data):
    all_products = []
    products_map = pre_parsed_bom_data.get('products_map', {})
    for _key, result in products_map.items():
        if result is not None:
            all_products.extend(result[0])
    return all_products


def _pre_parse_bom_for_ksd(bom_file, selected_bom_keys):
    parsed_sheets = {}
    bom_starts_map = {}
    bom_df_map = {}
    products_map = {}

    column_mapping, skip_keywords, non_bom_sheet_keywords = get_bom_processing_rules()
    selected_key_set = normalize_selected_bom_keys(selected_bom_keys)
    xls = excel_file_compat(bom_file)
    bom_sheet_names = quick_scan_bom_sheets(xls, non_bom_sheet_keywords, selected_key_set)

    for sheet_name in bom_sheet_names:
        df = xls.parse(sheet_name=sheet_name, header=None)
        total_rows = len(df)
        if df.empty or total_rows < 5:
            continue
        parsed_sheets[sheet_name] = df

        bom_starts = discover_sheet_bom_starts(df, total_rows, sheet_name=sheet_name)
        bom_starts_map[sheet_name] = bom_starts

        for i, bom_info in enumerate(bom_starts, 1):
            if selected_key_set and bom_info.get('key') not in selected_key_set:
                continue
            bom_key = bom_info.get('key', '')
            bom_df = extract_bom_dataframe(
                df, bom_info, i, bom_starts, total_rows,
                column_mapping, skip_keywords
            )
            bom_df_map[bom_key] = bom_df
            if bom_df is not None and not bom_df.empty:
                products_map[bom_key] = read_bom_from_dataframe(bom_df)

    return {
        'bom_sheet_names': bom_sheet_names,
        'parsed_sheets': parsed_sheets,
        'bom_starts_map': bom_starts_map,
        'bom_df_map': bom_df_map,
        'products_map': products_map,
    }


def download_output_file(file_id):
    file_path = find_output_file(file_id)
    if not file_path or not os.path.exists(file_path):
        return {'success': False, 'message': '文件不存在'}, 404
    download_name = _FRIENDLY_NAME_MAP.get(file_id) or os.path.basename(file_path)
    return send_file(file_path, as_attachment=True, download_name=download_name)


def download_standard_price_file(file_id):
    file_path = find_standard_file(file_id)
    if not file_path or not os.path.exists(file_path):
        return {'success': False, 'message': '标准定价文件不存在'}, 404
    return send_file(file_path, as_attachment=True, download_name=os.path.basename(file_path))
