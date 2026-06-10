import math
import os
import re
from decimal import Decimal
import pandas as pd
from backend.excel.reader import excel_file_compat
from backend.core.shared.cache_utils import _store_parse_md
from backend.core.shared.text_utils import (
    normalize_lookup_code, normalize_excel_cell_text, normalize_lookup_token,
    format_number_text, parse_numeric_cell_text,
)



CONFIG_FIELD_RULES = {
    'array': {
        'anchors': ['阵列'],
        'mode': 'two_numbers',
        'window_cols': 6,
        'stop_labels': ['缺板数', '是否东西可调', '基础类型', '阵列基数'],
        'ranges': [(1,10000), (1, 10000)],
    },
    'panel_spec': {
        'anchors': ['板规'],
        'mode': 'three_numbers',
        'window_cols': 8,
        'stop_labels': ['是否东西可调', '阵列', '架台类型'],
        'ranges': [(100, 4000), (100, 4000), (1, 4000)],
    },
    'cross_span': {
        'anchors': ['跨距'],
        'fallback_anchors': ['导轨伸出面板长度'],
        'prefer_fallback': True,
        'mode': 'one_number',
        'window_cols': 8,
        'stop_labels': ['基础类型', '单基侧压总数', '阵列基数', '标准定价', '切法辅助'],
        'ranges': [(500, 20000)],
        'pick': 'first',
    },
    'angle': {
        'anchors': ['角度'],
        'mode': 'one_number',
        'window_cols': 4,
        'stop_labels': ['导轨总长', '东西板间距'],
        'ranges': [(0, 360)],
        'pick': 'first',
    },
    'layout': {
        'anchors': ['布板方式'],
        'mode': 'text',
        'window_cols': 3,
        'stop_labels': ['板规'],
        'allowed_values': ['横放', '竖放'],
    },
    'adjustable': {
        'anchors': ['是否东西可调'],
        'mode': 'text',
        'window_cols': 3,
        'stop_labels': ['导轨伸出面板长度', '标准定价'],
        'allowed_values': ['是', '否'],
    },
    'extension': {
        'anchors': ['导轨伸出面板长度'],
        'mode': 'one_number',
        'window_cols': 6,
        'stop_labels': ['基础类型', '单基侧压总数', '阵列基数', '标准定价'],
        'ranges': [(-500, 500)],
        'pick': 'first',
    },
    'missing_boards': {
        'anchors': ['缺板数'],
        'mode': 'one_number',
        'window_cols': 4,
        'stop_labels': ['基础类型', '阵列基数'],
        'ranges': [(-100000, 100000)],
    },
    'base_count': {
        'anchors': ['阵列基数'],
        'mode': 'one_number',
        'window_cols': 4,
        'stop_labels': ['标准定价'],
        'ranges': [(0, 10000)],
    },
}

HEADER_FIELD_RULES = {
    '编码': {
        'include': ['编码', 'partno', '编号', 'code', '物料编码'],
    },
    '名称': {
        'include': ['名称', 'partname', '品名', 'description', '物料名称'],
    },
    '规格': {
        'include': ['规格', 'spec', '尺寸', 'size', '型号'],
    },
    '材质': {
        'include': ['材质', 'material', '材料'],
    },
    '数量': {
        'include': ['数量', 'qty', 'quantity', '个数'],
        'prefer': ['单基数量', '单基qty', '单基quantity'],
        'exclude': ['多基数量', '多基qty', '多基quantity'],
    },
    '单重': {
        'include': ['单重', 'weight', '重量', 'kg'],
    },
    '备注': {
        'include': ['备注', 'remark', 'notes'],
    },
}


def get_bom_processing_rules():
    column_mapping = {
        '编码': '编码', 'Part No.': '编码', '编号': '编码', 'Code': '编码',
        '名称': '名称', 'Part Name': '名称', '品名': '名称', 'Description': '名称',
        '规格': '规格', 'Spec': '规格', '尺寸': '规格', 'Size': '规格',
        '材质': '材质', 'Material': '材质',
        '数量': '数量', 'Qty.': '数量', 'Quantity': '数量',
        '备注': '备注', 'Remark': '备注',
        '单重': '单重', 'Weight': '单重', '(Kg)': '单重'
    }

    skip_keywords = [
        'BOM表', '导轨切法', '柜台角度', '布板方式', '柜台类型', '是否内缩',
        '切法辅助', '导轨压块配套方案', '导轨定长方案', '中压块类型',
        '中侧压块配套方案', '导轨总长', '东西板间距', '板规', '阵列',
        '是否东西可调', '导轨伸出面板长度', '跨距', '基础类型',
        '备注（', '基数（', '单基总重', '多基总重'
    ]

    non_bom_sheet_keywords = ['配套', '配置', '价格表', '物料总表', 'Sheet']
    return column_mapping, skip_keywords, non_bom_sheet_keywords


def normalize_selected_bom_keys(selected_bom_keys):
    if not selected_bom_keys:
        return None

    if isinstance(selected_bom_keys, str):
        selected_bom_keys = [selected_bom_keys]

    normalized = {
        str(key).strip()
        for key in selected_bom_keys
        if str(key).strip()
    }
    return normalized or None


def build_bom_selection_key(sheet_name, row_index):
    return f'{sheet_name}::{row_index}'


def extract_sheet_names_from_keys(selected_key_set):
    if not selected_key_set:
        return None
    return {key.split('::')[0] for key in selected_key_set if '::' in key}


def quick_scan_bom_sheets(xls, non_bom_sheet_keywords, selected_key_set=None):
    target_sheets = extract_sheet_names_from_keys(selected_key_set)
    bom_sheets = []

    for sheet_name in xls.sheet_names:
        if any(keyword in sheet_name for keyword in non_bom_sheet_keywords):
            continue
        if target_sheets is not None and sheet_name not in target_sheets:
            continue
        try:
            df_scan = xls.parse(sheet_name=sheet_name, header=None, nrows=50)
        except Exception:
            continue
        if df_scan.empty:
            continue
        has_bom = False
        for _, row in df_scan.iterrows():
            row_str = ' '.join([str(x) if pd.notna(x) else '' for x in row])
            if "BOM" in row_str and not any(skip in row_str for skip in ['备注：', '备注说明']):
                has_bom = True
                break
        if has_bom:
            bom_sheets.append(sheet_name)

    return bom_sheets


def build_config_region(df, start_row, total_rows, max_rows=12, max_cols=20):
    row_limit = min(start_row + max_rows, total_rows)
    col_limit = min(df.shape[1], max_cols)
    return [
        (
            row_idx,
            [normalize_excel_cell_text(df.iat[row_idx, col_idx]) for col_idx in range(col_limit)],
        )
        for row_idx in range(start_row, row_limit)
    ]


def find_anchor_positions(config_rows, anchors):
    matches = []
    if not anchors:
        return matches

    for row_idx, cells in config_rows:
        for col_idx, cell_text in enumerate(cells):
            if cell_text and any(anchor in cell_text for anchor in anchors):
                matches.append((row_idx, col_idx))
    return matches


def collect_text_candidates(row_cells, start_col, window_cols=6, stop_labels=None):
    stop_labels = stop_labels or []
    candidates = []

    for col_idx in range(start_col + 1, min(len(row_cells), start_col + 1 + window_cols)):
        cell_text = row_cells[col_idx]
        if not cell_text:
            continue
        if any(label in cell_text for label in stop_labels):
            break
        if cell_text in {'x', 'X', '×', '*'}:
            continue
        candidates.append(cell_text)

    return candidates


def collect_numeric_candidates(row_cells, start_col, window_cols=6, stop_labels=None):
    stop_labels = stop_labels or []
    candidates = []

    for col_idx in range(start_col + 1, min(len(row_cells), start_col + 1 + window_cols)):
        cell_text = row_cells[col_idx]
        if not cell_text:
            continue
        if any(label in cell_text for label in stop_labels):
            break

        number_text = parse_numeric_cell_text(cell_text)
        if number_text is not None:
            candidates.append(number_text)

    return candidates


def validate_numeric_candidates(candidates, ranges):
    if not candidates:
        return []

    validated = []
    for number_text in candidates:
        try:
            value = float(number_text)
        except (TypeError, ValueError):
            continue

        index = len(validated)
        if index < len(ranges):
            min_value, max_value = ranges[index]
            if value < min_value or value > max_value:
                continue

        validated.append((format_number_text(number_text), value))
        if len(validated) >= len(ranges):
            break

    return validated


def build_field_value_from_rule(candidates, rule):
    mode = rule.get('mode')

    if mode == 'text':
        allowed_values = rule.get('allowed_values') or []
        for text in candidates:
            cleaned = normalize_excel_cell_text(text)
            if not cleaned:
                continue
            if allowed_values and cleaned not in allowed_values:
                continue
            return cleaned
        return ''

    validated = validate_numeric_candidates(candidates, rule.get('ranges') or [])
    if not validated:
        return ''

    if mode == 'one_number':
        choice = validated[-1] if rule.get('pick') == 'last' else validated[0]
        return choice[0]

    if mode == 'two_numbers' and len(validated) >= 2:
        return f'{validated[0][0]}×{validated[1][0]}'

    if mode == 'three_numbers' and len(validated) >= 3:
        return f'{validated[0][0]}*{validated[1][0]}*{validated[2][0]}mm'

    return ''


def extract_config_value(config_rows, rule):
    row_map = {row_idx: cells for row_idx, cells in config_rows}

    anchor_key_order = ('fallback_anchors', 'anchors') if rule.get('prefer_fallback') else ('anchors', 'fallback_anchors')

    for anchor_key in anchor_key_order:
        anchor_positions = find_anchor_positions(config_rows, rule.get(anchor_key) or [])
        for row_idx, col_idx in anchor_positions:
            row_cells = row_map.get(row_idx, [])
            if rule.get('mode') == 'text':
                candidates = collect_text_candidates(
                    row_cells,
                    col_idx,
                    window_cols=rule.get('window_cols', 6),
                    stop_labels=rule.get('stop_labels'),
                )
            else:
                candidates = collect_numeric_candidates(
                    row_cells,
                    col_idx,
                    window_cols=rule.get('window_cols', 6),
                    stop_labels=rule.get('stop_labels'),
                )

            value = build_field_value_from_rule(candidates, rule)
            if value:
                return value

    return ''


def score_header_candidate(field_name, cell_text):
    tokenized = normalize_lookup_token(cell_text)
    if not tokenized:
        return None

    rule = HEADER_FIELD_RULES[field_name]
    if any(keyword in tokenized for keyword in rule.get('exclude', [])):
        return None

    score = 0
    if any(keyword in tokenized for keyword in rule.get('prefer', [])):
        score += 100
    if any(keyword in tokenized for keyword in rule.get('include', [])):
        score += 10

    if score <= 0:
        return None
    return score


def find_header_mapping_for_row(row):
    matched_headers = {}
    best_scores = {}

    for col_idx, cell in enumerate(row):
        cell_text = normalize_excel_cell_text(cell)
        if not cell_text:
            continue

        for field_name in HEADER_FIELD_RULES:
            score = score_header_candidate(field_name, cell_text)
            if score is None:
                continue

            if score > best_scores.get(field_name, -1):
                best_scores[field_name] = score
                matched_headers[field_name] = col_idx

    return matched_headers


def is_valid_header_mapping(mapping):
    required = {'编码', '名称', '规格'}
    return len(mapping) >= 3 and required.issubset(mapping.keys())


def extract_config_info(df, start_row, total_rows):
    config = {
        'array': '',
        'variant': '标准',
        'variant_detail': '',
        'panel_spec': '',
        'cross_span': '',
        'angle': '',
        'layout': '',
        'missing_boards': 0,
        'base_count': 0,
        'header_row': None,
        'data_start_row': None,
        'column_mapping': {},
    }

    config_rows = build_config_region(df, start_row, total_rows)
    config['array'] = extract_config_value(config_rows, CONFIG_FIELD_RULES['array'])
    config['panel_spec'] = extract_config_value(config_rows, CONFIG_FIELD_RULES['panel_spec'])
    config['cross_span'] = extract_config_value(config_rows, CONFIG_FIELD_RULES['cross_span'])
    config['angle'] = extract_config_value(config_rows, CONFIG_FIELD_RULES['angle'])
    config['layout'] = extract_config_value(config_rows, CONFIG_FIELD_RULES['layout'])

    missing_val = extract_config_value(config_rows, CONFIG_FIELD_RULES['missing_boards'])
    config['has_missing_field'] = missing_val is not None and str(missing_val).strip() != ''
    if missing_val:
        try:
            config['missing_boards'] = int(float(missing_val))
        except (ValueError, TypeError):
            pass

    base_val = extract_config_value(config_rows, CONFIG_FIELD_RULES['base_count'])
    if base_val:
        try:
            config['base_count'] = int(float(base_val))
        except (ValueError, TypeError):
            pass

    adjustable = extract_config_value(config_rows, CONFIG_FIELD_RULES['adjustable'])
    if adjustable:
        config['variant'] = '可调' if adjustable == '是' else '固定'

    extension_length = extract_config_value(config_rows, CONFIG_FIELD_RULES['extension'])
    if extension_length:
        config['variant_detail'] = f"伸出{extension_length}mm"

    header_search_end = min(start_row + 60, total_rows)
    for row_idx in range(start_row, header_search_end):
        matched_headers = find_header_mapping_for_row(df.iloc[row_idx])
        if is_valid_header_mapping(matched_headers):
            config['header_row'] = row_idx
            config['column_mapping'] = matched_headers
            config['data_start_row'] = row_idx + 1
            break

    return config


def discover_sheet_bom_starts(df, total_rows, sheet_name=''):
    bom_starts = []

    for idx, row in df.iterrows():
        row_str = ' '.join([str(x) if pd.notna(x) else '' for x in row])
        if "BOM" not in row_str or any(skip in row_str for skip in ['备注：', '备注说明']):
            continue

        config = extract_config_info(df, idx, total_rows)
        if config['array'] and config['array'] != '未知':
            variant_name = f"{config['array']}_{config['variant']}"
        elif config['angle']:
            variant_name = f"{config['angle']}度_{config['variant']}"
        else:
            variant_name = f"配置{len(bom_starts) + 1}"

        if any(existing['row'] == idx for existing in bom_starts):
            continue

        bom_starts.append({
            'row': idx,
            'config': config,
            'variant_name': variant_name,
            'key': build_bom_selection_key(sheet_name, idx),
        })

    return bom_starts


def list_bom_tables(input_file):
    _, _, non_bom_sheet_keywords = get_bom_processing_rules()

    try:
        from backend.core.shared.bom_zip_parser import _list_bom_tables_zip
        return _list_bom_tables_zip(input_file, non_bom_sheet_keywords)
    except Exception:
        pass

    bom_tables = []
    xls = excel_file_compat(input_file)

    bom_sheet_names = quick_scan_bom_sheets(xls, non_bom_sheet_keywords)

    for sheet_name in bom_sheet_names:
        sheet_index = xls.sheet_names.index(sheet_name)
        df = xls.parse(sheet_name=sheet_name, header=None)
        total_rows = len(df)
        if df.empty or total_rows < 5:
            continue

        bom_starts = discover_sheet_bom_starts(df, total_rows, sheet_name=sheet_name)
        for order, bom_info in enumerate(bom_starts, 1):
            config = bom_info['config']
            detail_parts = []
            if config.get('array') and config['array'] != '未知':
                detail_parts.append(f"阵列 {config['array']}")
            if config.get('angle'):
                detail_parts.append(f"角度 {config['angle']}")

            display_name = f"{sheet_name} / {bom_info['variant_name']}"
            if detail_parts:
                display_name = f"{display_name} ({', '.join(detail_parts)})"

            bom_tables.append({
                'key': bom_info['key'],
                'sheet_name': sheet_name,
                'sheet_index': sheet_index,
                'order': order,
                'start_row': bom_info['row'] + 1,
                'variant_name': bom_info['variant_name'],
                'display_name': display_name,
                'array': config.get('array') or '',
            })

    return bom_tables


def collect_bom_products(input_file, selected_bom_keys=None):
    column_mapping, skip_keywords, non_bom_sheet_keywords = get_bom_processing_rules()
    selected_key_set = normalize_selected_bom_keys(selected_bom_keys)

    try:
        from backend.core.shared.bom_zip_parser import _parse_bom_sheets_zip
        products_by_key, bom_info_by_key, _, inverter_products_all, _bom_configs = _parse_bom_sheets_zip(
            input_file, selected_key_set, non_bom_sheet_keywords,
        )
        collected_products = []
        read_results_map = {}
        for key, products in products_by_key.items():
            collected_products.extend(products)
            config = (bom_info_by_key.get(key) or {}).get('config', {})
            array_info = config.get('array', '')
            span_info = config.get('cross_span', '')
            read_results_map[key] = (products, array_info, span_info)
        if inverter_products_all:
            collected_products.extend(inverter_products_all)
        if collected_products:
            _bom_struct_meta = {
                'source': 'zip',
                'bom_info_by_key': bom_info_by_key,
                'bom_configs': _bom_configs,
            }
            return collected_products, read_results_map, _bom_struct_meta
    except Exception:
        pass

    xls = excel_file_compat(input_file)
    collected_products = []
    read_results_map = {}

    bom_sheet_names = quick_scan_bom_sheets(xls, non_bom_sheet_keywords, selected_key_set)

    _md_parsed = {}
    _md_bom_starts = {}

    for sheet_name in bom_sheet_names:
        df = xls.parse(sheet_name=sheet_name, header=None)
        total_rows = len(df)
        if df.empty or total_rows < 5:
            continue

        bom_starts = discover_sheet_bom_starts(df, total_rows, sheet_name=sheet_name)
        _md_parsed[sheet_name] = df
        _md_bom_starts[sheet_name] = bom_starts

        for i, bom_info in enumerate(bom_starts, 1):
            if selected_key_set and bom_info.get('key') not in selected_key_set:
                continue

            bom_df = extract_bom_dataframe(
                df, bom_info, i, bom_starts, total_rows,
                column_mapping, skip_keywords
            )
            if bom_df is None or bom_df.empty:
                continue

            products, array_info, span_info = read_bom_from_dataframe(bom_df)
            collected_products.extend(products)
            bom_key = bom_info.get('key', f"{sheet_name}_BOM{i}")
            read_results_map[bom_key] = (products, array_info, span_info)

    _store_parse_md(input_file, {
        'xls': xls,
        'parsed_sheets': _md_parsed,
        'bom_starts_map': _md_bom_starts,
    }, selected_bom_keys)

    return collected_products, read_results_map, None


def read_bom_from_dataframe(df):
    products = []
    array_info = None
    span_info = None

    for idx, row in df.iterrows():
        seq_num = row.get('序号', None)
        code = row.get('编码', None)
        name = row.get('名称', None)
        spec = row.get('规格', None)
        material = row.get('材质', None)
        quantity = row.get('数量', None)
        remark = row.get('备注', None)
        weight = row.get('单重', None)
        array_val = row.get('阵列', None)
        span_val = row.get('跨距', None)

        if array_val and array_val != '' and array_info is None:
            array_info = str(array_val)

        if span_val and span_val != '' and span_info is None:
            span_info = str(span_val)

        if all(v is None or v == '' for v in [code, name, spec, material, quantity, weight]):
            continue

        if quantity is None or quantity == '':
            quantity = 0
        try:
            quantity = float(quantity) if isinstance(quantity, (int, float)) else int(quantity)
        except (ValueError, TypeError):
            quantity = 0

        weight_decimal = Decimal('0')
        weight_has_unit = False
        weight_unit = ''

        if weight is not None and weight != '':
            weight_str = str(weight).strip()
            unit_patterns = [
                (r'(\d+(?:\.\d+)?)\s*(?:kg|KG|Kg|公斤)', 'kg'),
                (r'(\d+(?:\.\d+)?)', ''),
            ]
            for pattern, unit_pattern in unit_patterns:
                match = re.search(pattern, weight_str)
                if match:
                    try:
                        weight_decimal = Decimal(match.group(1))
                        if unit_pattern:
                            weight_has_unit = True
                            weight_unit = unit_pattern
                        break
                    except (ValueError, TypeError):
                        continue

        if seq_num is None or seq_num == '':
            seq_num = idx + 1

        product = {
            'seq': int(seq_num) if seq_num and not (isinstance(seq_num, float) and math.isnan(seq_num)) else idx + 1,
            'code': str(code) if code else '',
            'name': str(name) if name else '',
            'spec': str(spec) if spec else '',
            'material': str(material) if material else '',
            'quantity': quantity,
            'remark': str(remark) if remark else '',
            'weight': weight_decimal,
            'weight_has_unit': weight_has_unit,
            'weight_unit': weight_unit,
            '_source_row': row.get('_orig_row', idx),
        }
        products.append(product)

    return products, array_info, span_info


def parse_array_to_rows_cols(array_str):
    if not array_str:
        return None, None
    match = re.search(r'(\d+)\s*[×xX*]\s*(\d+)', str(array_str))
    if match:
        rows = int(match.group(1))
        cols = int(match.group(2))
        return rows, cols
    return None, None


def resolve_products_and_array(pre_parsed_products, df, matrix_data=None):
    if pre_parsed_products is not None:
        if isinstance(pre_parsed_products, tuple) and len(pre_parsed_products) == 3:
            all_products, array_info, span_info = pre_parsed_products
        else:
            all_products = pre_parsed_products
            array_info = ''
            span_info = ''
    else:
        all_products, array_info, span_info = read_bom_from_dataframe(df)

    rows, cols = parse_array_to_rows_cols(array_info)
    matrix_data = matrix_data or {}
    if rows is None or cols is None:
        rows = matrix_data.get('array_rows')
        cols = matrix_data.get('array_cols')

    return all_products, array_info, span_info, rows, cols


def extract_bom_dataframe(df, bom_info, index, all_bom_starts, total_rows, column_mapping, skip_keywords):
    start_row = bom_info['row']
    config = bom_info['config']
    array_info = config.get('array', '未知')
    cross_span = config.get('cross_span', '')

    header_row = config.get('header_row')
    header_mapping = config.get('column_mapping', {}).copy()
    data_start_row = config.get('data_start_row')

    if index < len(all_bom_starts):
        end_row = all_bom_starts[index]['row'] - 1
    else:
        end_row = total_rows - 1
        for j in range(start_row + 20, min(start_row + 500, total_rows)):
            try:
                row_str = ' '.join([str(x) if pd.notna(x) else '' for x in df.iloc[j]])
                if '备注：' in row_str and '基数：' in row_str:
                    end_row = min(j + 2, total_rows - 1)
                    break
                if '单基重量' in row_str or '多基重量' in row_str:
                    end_row = min(j, total_rows - 1)
                    break
                if "BOM" in row_str and j > start_row + 5:
                    end_row = j - 1
                    break
            except:
                continue

    if header_row is None or not header_mapping:
        search_start = start_row + 1
        search_end = min(start_row + 30, end_row + 1, total_rows)

        for j in range(search_start, search_end):
            row = df.iloc[j]
            temp_mapping = find_header_mapping_for_row(row)

            if is_valid_header_mapping(temp_mapping):
                header_row = j
                header_mapping = temp_mapping
                data_start_row = j + 1
                break

        if not header_mapping:
            header_mapping = {
                '编码': 0,
                '名称': 1,
                '规格': 2,
                '材质': 3,
                '数量': 4,
                '备注': 5,
                '单重': 6
            }
            data_start_row = start_row + 7

    if data_start_row is None:
        data_start_row = header_row + 1 if header_row else start_row + 7

    normalized_mapping = {}
    for field, col_idx in header_mapping.items():
        if field in ['编码', 'Part No.', '编号', 'Code']:
            standard_name = '编码'
        elif field in ['名称', 'Part Name', '品名', 'Description']:
            standard_name = '名称'
        elif field in ['规格', 'Spec', '尺寸', 'Size']:
            standard_name = '规格'
        elif field in ['材质', 'Material', '材料']:
            standard_name = '材质'
        elif field in ['数量', 'Qty.', 'Quantity']:
            standard_name = '数量'
        elif field in ['单重', 'Weight', '重量', '(Kg)']:
            standard_name = '单重'
        elif field in ['备注', 'Remark', 'Notes']:
            standard_name = '备注'
        else:
            standard_name = field

        normalized_mapping[standard_name] = col_idx

    material_data = []

    for j in range(data_start_row, min(end_row + 1, total_rows)):
        try:
            row = df.iloc[j]
            row_str = ' '.join([str(x) if pd.notna(x) else '' for x in row])

            non_empty = [str(x) for x in row if pd.notna(x) and str(x).strip() not in ['', 'nan', 'NaN']]
            if len(non_empty) <= 1:
                continue

            is_skip = any(keyword in row_str for keyword in skip_keywords)
            if is_skip:
                continue

            filtered_row = {}
            for standard_col in ['编码', '名称', '规格', '材质', '数量', '备注', '单重']:
                if standard_col in normalized_mapping:
                    col_idx = normalized_mapping[standard_col]
                    if col_idx < len(row):
                        cell_value = row[col_idx] if pd.notna(row[col_idx]) else ''
                        filtered_row[standard_col] = cell_value
                    else:
                        filtered_row[standard_col] = ''
                else:
                    filtered_row[standard_col] = ''

            if not filtered_row.get('编码') and not filtered_row.get('名称'):
                continue

            if filtered_row.get('数量'):
                try:
                    qty_str = str(filtered_row['数量']).strip()
                    qty_str = re.sub(r'[^0-9\.\-]', '', qty_str)
                    if qty_str:
                        filtered_row['数量'] = float(qty_str) if '.' in qty_str else int(qty_str)
                except:
                    filtered_row['数量'] = 0

            filtered_row['阵列'] = array_info
            filtered_row['跨距'] = cross_span
            filtered_row['_orig_row'] = j

            material_data.append(filtered_row)
        except Exception as e:
            continue

    if not material_data:
        return None

    df_result = pd.DataFrame(material_data)
    df_result.insert(0, '序号', range(1, len(df_result) + 1))
    return df_result
