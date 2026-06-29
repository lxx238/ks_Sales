import copy
import os
import re
import shutil
import uuid
import zipfile
from decimal import Decimal

from openpyxl import Workbook

from backend.excel.reader import excel_file_compat
from backend.core.shared.bom_utils import (
    discover_sheet_bom_starts, extract_bom_dataframe, get_bom_processing_rules,
    normalize_selected_bom_keys, quick_scan_bom_sheets, parse_array_to_rows_cols,
    read_bom_from_dataframe, extract_sheet_names_from_keys, build_bom_selection_key,
)
from backend.core.shared.image_utils import scan_images, find_latest_image_log, load_image_mapping_from_log
from backend.core.shared.price_utils import resolve_price_info, round_to_2_decimal, get_temp_adjusted_base_price
from backend.core.shared.text_utils import normalize_lookup_code
from backend.core.shared.product_utils import _is_valid_product_code, _match_exclude_group
from backend.core.shared.sheet_utils import reorder_sheets_by_matrix_array, set_page_break_preview
from backend.core.shared.bom_zip_parser import _build_ss_lookup, _parse_bom_sheets_zip
from backend.core.inquiry_builder import create_inquiry_sheet
from backend.core.array_matcher import (
    build_matrix_array_entries,
    find_matching_matrix_array,
    merge_bom_products,
    find_accumulated_match,
    find_info_accumulated_match,
)
from backend.core.ja_EST.quotation_engine import (
    create_detail_sheet,
    create_summary_sheet,
    create_ja_inquiry_sheet,
)
from backend.services.translate_service import translate_notes_in_details


def _col_letters_to_idx(letters):
    idx = 0
    for c in letters.upper():
        idx = idx * 26 + (ord(c) - ord('A') + 1)
    return idx - 1


def _parse_sheet_cells(sheet_data, ss_list):
    rows = {}
    for m in re.finditer(rb'<row r="(\d+)"', sheet_data):
        row_num = int(m.group(1))
        row_end = sheet_data.find(b'</row>', m.start())
        if row_end == -1:
            continue
        row_chunk = sheet_data[m.start():row_end]
        cells = {}
        for cm in re.finditer(rb'<c r="([A-Z]+)\d+"', row_chunk):
            col_letters = cm.group(1).decode('utf-8')
            col_idx = _col_letters_to_idx(col_letters)
            c_start = cm.start()
            c_end = row_chunk.find(b'</c>', c_start)
            if c_end == -1:
                continue
            cell_block = row_chunk[c_start:c_end]
            is_shared = b't="s"' in cell_block
            v_match = re.search(rb'<v>([^<]+)</v>', cell_block)
            if not v_match:
                continue
            if is_shared:
                si_idx = int(v_match.group(1))
                if 0 <= si_idx < len(ss_list):
                    cells[col_idx] = ss_list[si_idx]
            else:
                cells[col_idx] = v_match.group(1).decode('utf-8', errors='replace')
        if cells:
            rows[row_num] = cells
    return rows


_HEADER_FIELD_MAP = {
    '编码': ['编码', 'Part No.', '编号', 'Code', '品番'],
    '名称': ['名称', 'Part Name', '品名', 'Description'],
    '规格': ['规格', 'Spec', '尺寸', 'Size'],
    '材质': ['材质', 'Material', '材料'],
    '数量': ['数量', 'Qty.', 'Quantity'],
    '单重': ['单重', 'Weight', '重量'],
    '备注': ['备注', 'Remark', 'Notes'],
}


def _match_header_row(cells):
    col_mapping = {}
    for col_idx, value in cells.items():
        val = str(value).replace('\n', '').replace('（', '(').replace('）', ')')
        for field, keywords in _HEADER_FIELD_MAP.items():
            if field in col_mapping:
                continue
            for kw in keywords:
                if kw.replace('\n', '').replace('（', '(').replace('）', ')') in val:
                    col_mapping[field] = col_idx
                    break
    has_ident = '编码' in col_mapping or '名称' in col_mapping
    has_qty = '数量' in col_mapping
    if has_ident and has_qty:
        return col_mapping
    return None


def _find_label_value(cells, label):
    sorted_cols = sorted(cells.keys())
    for i, col_idx in enumerate(sorted_cols):
        if label in str(cells[col_idx]):
            if i + 1 < len(sorted_cols):
                return sorted_cols[i + 1], cells[sorted_cols[i + 1]]
            break
    return None, None


def _find_config_zip(parsed_rows, bom_row, max_row, search_end=None):
    config = {
        'array': '', 'variant': '固定', 'variant_detail': '',
        'panel_spec': '', 'cross_span': '', 'angle': '', 'layout': '',
        'missing_boards': 0, 'base_count': 0,
        'header_row': None, 'data_start_row': None, 'column_mapping': {},
    }
    end = search_end if search_end is not None else min(bom_row + 150, max_row + 1)
    for rn in range(bom_row, end):
        cells = parsed_rows.get(rn)
        if cells is None:
            continue
        row_str = ' '.join(str(v) for v in cells.values())

        if not config['array'] and '阵列' in row_str:
            found_combined = False
            for v in cells.values():
                if re.search(r'\d+[×xX]\d+', str(v)):
                    config['array'] = str(v)
                    found_combined = True
                    break
            if not found_combined:
                array_col = None
                for col_idx in sorted(cells.keys()):
                    if '阵列' in str(cells[col_idx]):
                        array_col = col_idx
                        break
                if array_col is not None:
                    sorted_cols = sorted(cells.keys())
                    row_val = None
                    col_val = None
                    for col_idx in sorted_cols:
                        if col_idx <= array_col:
                            continue
                        v = str(cells[col_idx])
                        if re.search(r'[段行南北东西列▶◀]', v):
                            continue
                        try:
                            n = int(float(v))
                            if row_val is None:
                                row_val = n
                            elif col_val is None:
                                col_val = n
                                break
                        except (ValueError, TypeError):
                            continue
                    if row_val is not None and col_val is not None:
                        config['array'] = f"{row_val}×{col_val}"
                    elif row_val is not None:
                        config['array'] = str(row_val)

        if not config['angle'] and '角度' in row_str:
            _, val = _find_label_value(cells, '角度')
            if val is not None:
                am = re.search(r'(\d+)', str(val))
                if am:
                    config['angle'] = am.group(1)

        if '缺板' in row_str:
            _, val = _find_label_value(cells, '缺板')
            if val is not None:
                try:
                    config['missing_boards'] = int(float(str(val)))
                except (ValueError, TypeError):
                    pass

        if '阵列基数' in row_str:
            _, val = _find_label_value(cells, '阵列基数')
            if val is not None:
                try:
                    config['base_count'] = int(float(str(val)))
                except (ValueError, TypeError):
                    pass

        if '是否东西可调' in row_str:
            _, val = _find_label_value(cells, '是否东西可调')
            if val is not None and '是' in str(val):
                config['variant'] = '可调'

        if not config['cross_span'] and '导轨伸出面板长度' in row_str:
            sorted_cols = sorted(cells.keys())
            anchor_col = None
            for col_idx in sorted_cols:
                if '导轨伸出面板长度' in str(cells[col_idx]):
                    anchor_col = col_idx
                    break
            if anchor_col is not None:
                for col_idx in sorted_cols:
                    if col_idx <= anchor_col:
                        continue
                    val = str(cells[col_idx]).strip()
                    if any(stop in val for stop in ['单基侧压总数', '阵列基数', '标准定价', '切法辅助']):
                        break
                    m = re.search(r'(\d+(?:\.\d+)?)', val)
                    if not m:
                        continue
                    num = float(m.group(1))
                    if 500 <= num <= 20000:
                        config['cross_span'] = m.group(1).rstrip('0').rstrip('.') if '.' in m.group(1) else m.group(1)
                        break

        if not config['cross_span'] and '跨距' in row_str:
            _, val = _find_label_value(cells, '跨距')
            if val is not None:
                m = re.search(r'(\d+(?:\.\d+)?)', str(val))
                if m:
                    num = float(m.group(1))
                    if 500 <= num <= 20000:
                        config['cross_span'] = m.group(1).rstrip('0').rstrip('.') if '.' in m.group(1) else m.group(1)
    return config


def _find_end_row_zip(parsed_rows, bom_row, bom_starts, bom_idx, max_row):
    if bom_idx + 1 < len(bom_starts):
        return bom_starts[bom_idx + 1]['row'] - 1
    for rn in range(bom_row + 20, min(bom_row + 500, max_row + 1)):
        cells = parsed_rows.get(rn)
        if cells is None:
            continue
        row_str = ' '.join(str(v) for v in cells.values())
        if '备注：' in row_str and '基数：' in row_str:
            return min(rn + 2, max_row)
        if '单基重量' in row_str or '多基重量' in row_str:
            return rn
        if 'BOM' in row_str and rn > bom_row + 5:
            return rn - 1
    return max_row


def _safe_float(val, default=0):
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _extract_products_zip(parsed_rows, header_row, end_row, col_mapping):
    if header_row is None:
        return []
    products = []
    seq = 1
    for rn in range(header_row + 1, end_row + 1):
        cells = parsed_rows.get(rn)
        if cells is None:
            continue
        code = str(cells.get(col_mapping.get('编码', -1), '')).strip()
        name = str(cells.get(col_mapping.get('名称', -1), '')).strip()
        if not code and not name:
            continue
        row_str = ' '.join(str(v) for v in cells.values())
        if '备注：' in row_str or '备注说明' in row_str:
            break
        if '逆变器总数量' in row_str or '逆变器配置基数' in row_str:
            continue
        spec = str(cells.get(col_mapping.get('规格', -1), '')).strip()
        material = str(cells.get(col_mapping.get('材质', -1), '')).strip()
        remark = str(cells.get(col_mapping.get('备注', -1), '')).strip()
        qty_raw = cells.get(col_mapping.get('数量', -1), '')
        qty_clean = re.sub(r'[^0-9.\-]', '', str(qty_raw))
        quantity = _safe_float(qty_clean, 0)
        weight_raw = cells.get(col_mapping.get('单重', -1), '')
        weight_decimal = Decimal('0')
        weight_has_unit = False
        weight_unit = ''
        if weight_raw:
            wm = re.search(r'(\d+(?:\.\d+)?)', str(weight_raw))
            if wm:
                weight_decimal = Decimal(wm.group(1))
            if 'kg' in str(weight_raw).lower():
                weight_has_unit = True
                weight_unit = 'kg'
        products.append({
            'seq': seq, 'code': code, 'name': name, 'spec': spec,
            'material': material, 'quantity': quantity, 'remark': remark,
            'weight': weight_decimal, 'weight_has_unit': weight_has_unit,
            'weight_unit': weight_unit, '_source_row': rn,
        })
        seq += 1
    return products


def _find_inverter_zip(parsed_rows, bom_row, end_row):
    inv_products = []
    inv_row_set = set()
    found_marker = False
    inverter_total_count = 0
    for rn in range(bom_row, end_row + 1):
        cells = parsed_rows.get(rn)
        if cells is None:
            continue
        row_str = ' '.join(str(v) for v in cells.values())
        if '逆变器总数量' in row_str:
            sorted_cols = sorted(cells.keys())
            last_marker_ci = -1
            for ci in sorted_cols:
                val = str(cells.get(ci, '')).strip()
                if '逆变器总数量' in val:
                    last_marker_ci = ci
            if last_marker_ci >= 0:
                for nci in sorted_cols:
                    if nci > last_marker_ci:
                        nval = str(cells.get(nci, '')).strip()
                        if '逆变器' in nval:
                            break
                        try:
                            inverter_total_count = int(float(nval))
                        except (ValueError, TypeError):
                            continue
                        break
            found_marker = True
            continue
        if found_marker:
            c1 = str(cells.get(1, '')).strip()
            if not c1:
                break
            non_empty = sum(1 for v in cells.values() if str(v).strip())
            if non_empty <= 1:
                break
            if '备注说明' in row_str:
                break
            if len(inv_products) >= 10:
                break
            inv_products.append({
                'seq': len(inv_products) + 1,
                'code': c1, 'name': str(cells.get(0, '')),
                'full_name': str(cells.get(2, '')),
                'spec': str(cells.get(3, '')),
                'material': str(cells.get(4, '')),
                'quantity': _safe_float(cells.get(5, 0)),
                'remark': '', 'weight': _safe_float(cells.get(7, 0)),
                'weight_has_unit': False, 'weight_unit': '',
                '_source_row': rn,
                'inverter_total_count': inverter_total_count,
            })
            inv_row_set.add(rn)
    if not inv_products:
        for rn in range(bom_row, end_row + 1):
            cells = parsed_rows.get(rn)
            if cells is None:
                continue
            c0 = str(cells.get(0, '')).strip()
            c1 = str(cells.get(1, '')).strip()
            is_inv = False
            if '逆变器' in c0 and ('挂杆' in c0 or '安装' in c0):
                is_inv = True
            if c0.startswith('东西向逆变器') or c0.startswith('逆变器挂杆'):
                is_inv = True
            if not is_inv:
                if inv_row_set:
                    break
                continue
            if inv_row_set and rn != max(inv_row_set) + 1 and rn != max(inv_row_set) + 2:
                break
            code = c1 or str(cells.get(2, '')).strip()
            if code:
                inv_products.append({
                    'seq': len(inv_products) + 1,
                    'code': code, 'name': c0, 'full_name': '',
                    'spec': str(cells.get(3, '')),
                    'material': str(cells.get(4, '')),
                    'quantity': _safe_float(cells.get(5, 0)),
                    'remark': '', 'weight': _safe_float(cells.get(6, 0)),
                    'weight_has_unit': False, 'weight_unit': '',
                    '_source_row': rn,
                })
                inv_row_set.add(rn)
    return inv_products, inv_row_set


def _find_bom_starts_zip(parsed_rows, sheet_name):
    max_row = max(parsed_rows.keys()) if parsed_rows else 0
    sorted_rows = sorted(parsed_rows.keys())
    header_rows = {}
    for rn in sorted_rows:
        cells = parsed_rows[rn]
        mapping = _match_header_row(cells)
        if mapping:
            header_rows[rn] = mapping

    bom_starts = []
    raw_entries = []
    for header_rn, col_mapping in sorted(header_rows.items()):
        bom_row = None
        for rn in range(header_rn - 1, max(header_rn - 10, 0), -1):
            prev = parsed_rows.get(rn)
            if prev is None:
                continue
            row_str = ' '.join(str(v) for v in prev.values())
            if 'BOM' in row_str and '备注：' not in row_str and '备注说明' not in row_str:
                bom_row = rn
                break
        if bom_row is None:
            bom_row = header_rn - 5
        raw_entries.append((bom_row, header_rn, col_mapping))

    for i, (bom_row, header_rn, col_mapping) in enumerate(raw_entries):
        next_bom_row = raw_entries[i + 1][0] if i + 1 < len(raw_entries) else max_row + 1
        config = _find_config_zip(parsed_rows, bom_row, max_row, search_end=next_bom_row)
        config['header_row'] = header_rn
        config['column_mapping'] = col_mapping
        config['data_start_row'] = header_rn + 1

        if config['array'] and config['array'] != '未知':
            variant_name = f"{config['array']}_{config['variant']}"
        elif config['angle']:
            variant_name = f"{config['angle']}度_{config['variant']}"
        else:
            variant_name = f"配置{len(bom_starts) + 1}"

        bom_starts.append({
            'row': bom_row,
            'config': config,
            'variant_name': variant_name,
            'key': build_bom_selection_key(sheet_name, bom_row - 1),
        })
    return bom_starts


def create_quotation_from_dataframe(*args, **kwargs):
    return None


def _find_inverter_region(df, bom_info):
    import pandas as pd
    inverter_codes = set()
    inverter_rows = []
    inverter_total_count = 0

    header_row = bom_info.get('header_row')
    data_start_row = bom_info.get('data_start_row')
    end_row = bom_info.get('end_row', len(df) - 1)

    if data_start_row is None:
        data_start_row = (header_row + 1) if header_row is not None else 0
    if end_row is None:
        end_row = len(df) - 1
    data_start_row = int(data_start_row)
    end_row = int(end_row)

    found_marker = False
    for j in range(data_start_row, min(end_row + 1, len(df))):
        row = df.iloc[j]
        row_str = ' '.join([str(x) if pd.notna(x) else '' for x in row])
        if '逆变器总数量' in row_str:
            last_marker_ci = -1
            for ci in range(len(row)):
                if pd.notna(row.iloc[ci]):
                    val = str(row.iloc[ci]).strip()
                    if '逆变器总数量' in val:
                        last_marker_ci = ci
            if last_marker_ci >= 0:
                for nci in range(last_marker_ci + 1, len(row)):
                    if pd.notna(row.iloc[nci]):
                        nval = str(row.iloc[nci]).strip()
                        if '逆变器' in nval:
                            break
                        try:
                            inverter_total_count = int(float(nval))
                        except (ValueError, TypeError):
                            continue
                        break
            found_marker = True
            continue
        if not found_marker:
            continue
        non_empty = [str(x) for x in row if pd.notna(x) and str(x).strip() not in ['', 'nan', 'NaN']]
        if len(non_empty) <= 1:
            break
        if '备注说明' in row_str:
            break
        if len(inverter_rows) >= 10:
            break
        if len(row) > 1 and pd.notna(row.iloc[1]) and str(row.iloc[1]).strip():
            code = str(row.iloc[1]).strip()
            inverter_codes.add(code)
            inverter_rows.append(j)

    return inverter_codes, inverter_rows, inverter_total_count


def _find_inverter_region_by_name(df):
    import pandas as pd
    inverter_codes = set()
    inverter_rows = []

    for j in range(len(df)):
        c0 = df.iloc[j, 0] if df.shape[1] > 0 else None
        c1 = df.iloc[j, 1] if df.shape[1] > 1 else None
        if pd.isna(c0) and pd.isna(c1):
            continue
        c0_str = str(c0).strip() if pd.notna(c0) else ''
        c1_str = str(c1).strip() if pd.notna(c1) else ''

        is_inv_name = False
        if '逆变器' in c0_str and ('挂杆' in c0_str or '安装' in c0_str):
            is_inv_name = True
        if c0_str.startswith('东西向逆变器') or c0_str.startswith('逆变器挂杆'):
            is_inv_name = True

        if not is_inv_name:
            if inverter_rows:
                break
            continue

        if inverter_rows and j != inverter_rows[-1] + 1 and j != inverter_rows[-1] + 2:
            break

        code = c1_str if c1_str else ''
        if not code:
            c2 = df.iloc[j, 2] if df.shape[1] > 2 else None
            if pd.notna(c2):
                code = str(c2).strip()

        if code:
            inverter_codes.add(code)
            inverter_rows.append(j)

        for jj in range(j + 1, min(j + 10, len(df))):
            rr = df.iloc[jj]
            c0_n = rr.iloc[0] if df.shape[1] > 0 else None
            c1_n = rr.iloc[1] if df.shape[1] > 1 else None
            c0_ns = str(c0_n).strip() if pd.notna(c0_n) else ''
            c1_ns = str(c1_n).strip() if pd.notna(c1_n) else ''

            non_empty = [str(x) for x in rr if pd.notna(x) and str(x).strip() not in ['', 'nan', 'NaN']]
            if len(non_empty) <= 1:
                break

            row_str = ' '.join(non_empty)
            if any(kw in row_str for kw in ['备注说明', '单基重量', '多基重量', '常规架台BOM', 'BOM表']):
                break

            if '逆变器' in c0_ns and ('挂杆' in c0_ns or '安装' in c0_ns):
                pass
            elif c0_ns and not c0_ns.startswith(('外六角', '内六角', 'T2', '螺栓', '螺钉')):
                if '逆变器' not in c0_ns:
                    pass

            code_n = c1_ns if c1_ns else ''
            if not code_n:
                c2_n = rr.iloc[2] if df.shape[1] > 2 else None
                if pd.notna(c2_n):
                    code_n = str(c2_n).strip()
            if code_n:
                inverter_codes.add(code_n)
                inverter_rows.append(jj)

        break

    return inverter_codes, inverter_rows


def _extract_inverter_products_from_rows(df, inverter_rows):
    import pandas as pd
    products = []

    for seq, row_idx in enumerate(inverter_rows, 1):
        row = df.iloc[row_idx]
        ncols = df.shape[1]

        c0 = row.iloc[0] if ncols > 0 and pd.notna(row.iloc[0]) else ''
        c1 = row.iloc[1] if ncols > 1 and pd.notna(row.iloc[1]) else ''
        c2 = row.iloc[2] if ncols > 2 and pd.notna(row.iloc[2]) else ''
        c3 = row.iloc[3] if ncols > 3 and pd.notna(row.iloc[3]) else ''
        c4 = row.iloc[4] if ncols > 4 and pd.notna(row.iloc[4]) else ''
        c5 = row.iloc[5] if ncols > 5 and pd.notna(row.iloc[5]) else ''
        c7 = row.iloc[7] if ncols > 7 and pd.notna(row.iloc[7]) else ''

        name = str(c0).strip() if c0 else ''
        code = str(c1).strip() if c1 else ''
        full_name = str(c2).strip() if c2 else ''
        spec = str(c3).strip() if c3 else ''
        material = str(c4).strip() if c4 else ''

        quantity = 0
        if c5:
            try:
                quantity = int(float(str(c5)))
            except (ValueError, TypeError):
                quantity = 0

        weight = 0
        if c7:
            try:
                weight = float(str(c7))
            except (ValueError, TypeError):
                weight = 0

        product = {
            'seq': seq,
            'code': code,
            'name': name,
            'full_name': full_name,
            'spec': spec,
            'material': material,
            'quantity': quantity,
            'remark': '',
            'weight': weight,
            'weight_has_unit': False,
            'weight_unit': '',
            '_source_row': row_idx,
        }
        products.append(product)

    return products


def _split_inverter_products_by_rows(products, inverter_row_set):
    if not inverter_row_set:
        return products, []
    bracket_products = []
    inverter_products = []
    for p in products:
        if p.get('_source_row') in inverter_row_set:
            inverter_products.append(p)
        else:
            bracket_products.append(p)
    return bracket_products, inverter_products


def _split_pile_products(products, price_mapping):
    bracket_products = []
    pile_products = []
    for p in products:
        code = str(p.get('code', '') or '').strip().upper()
        if code.startswith('DZ-'):
            pile_products.append(p)
            continue
        price_info = resolve_price_info(price_mapping, p.get('code', ''))
        attr = (price_info.get('attribute', '') if price_info else '') or ''
        if attr.strip() in ('地桩', '地盤杭'):
            pile_products.append(p)
        else:
            bracket_products.append(p)
    return bracket_products, pile_products


def _build_products_by_key(input_file, selected_key_set, column_mapping, skip_keywords, non_bom_sheet_keywords):
    try:
        return _parse_bom_sheets_zip(input_file, selected_key_set, non_bom_sheet_keywords)
    except Exception:
        pass

    products_by_key = {}
    bom_info_by_key = {}
    inverter_products_all = []
    bom_configs = []

    xls = excel_file_compat(input_file)

    bom_sheet_names = quick_scan_bom_sheets(xls, non_bom_sheet_keywords, selected_key_set)

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

            bom_configs.append(bom_info)

            inv_codes, inv_rows, sheet_inv_total = _find_inverter_region(df, bom_info)
            if inv_rows:
                inv_products = _extract_inverter_products_from_rows(df, inv_rows)
                variant_name = bom_info.get('variant_name', '')
                config = bom_info.get('config', {})
                for ip in inv_products:
                    ip['variant_name'] = variant_name
                    ip['bom_key'] = bom_info.get('key', '')
                    ip['array'] = config.get('array', '')
                    ip['inverter_total_count'] = sheet_inv_total
                inverter_products_all.extend(inv_products)
            else:
                inv_rows = []

            bom_df = extract_bom_dataframe(
                df, bom_info, original_index, bom_starts, total_rows,
                column_mapping, skip_keywords,
            )
            if bom_df is None or bom_df.empty:
                continue
            products, array_info, span_info = read_bom_from_dataframe(bom_df)
            if not products:
                continue
            inv_row_set = set(inv_rows)
            bracket_products, _ = _split_inverter_products_by_rows(products, inv_row_set)
            if bracket_products:
                products_by_key[key] = bracket_products
                bom_info_by_key[key] = bom_info

    return products_by_key, bom_info_by_key, xls, inverter_products_all, bom_configs


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
        pre_parsed_bom_configs=None,
        exclude_options=None,
        pre_parsed_inverter_products=None,
        exchange_rate=None,
        tariff_rate=None,
        consumption_tax=None,
        fence_tax=None,
        discount_rate=None,
        steel_discount_rate=None,
        purchased_discount_rate=None,
        steel_pack=None,
        truck_desc=None,
        truck_fee=None,
        fence_data=None,
        need_weight_code=True,
        coating_thickness=10,
        case_type='EST',
        normal_params=None,
        need_total_qty=False,
        exclude_delete_options=None,
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

    matrix_array_entries = build_matrix_array_entries(matrix_data)
    has_explicit_matrix_arrays = bool(arrays)
    matrix_has_inv_info = any(me.get('has_inverter') for me in matrix_array_entries)
    used_array_indices = set()
    pending_boms = []
    accumulated_results = []

    all_excluded_products = []

    _del_opts = exclude_delete_options or {}
    _exc_opts = exclude_options or {}
    _has_any_exclude = bool(_del_opts and any(_del_opts.values())) or bool(_exc_opts and any(_exc_opts.values()))

    def _filter_excluded(products):
        if not _has_any_exclude:
            return products, []
        _merged = dict(_exc_opts)
        _merged.update(_del_opts)
        filtered = []
        excluded = []
        for p in products:
            matched = _match_exclude_group(p, price_mapping, _merged)
            if matched:
                if _del_opts.get(matched):
                    continue
                excluded.append(p)
            else:
                filtered.append(p)
        return filtered, excluded

    pile_products_all = []
    detail_sheet_products = []

    def _process_products_by_key(products_by_key, bom_info_by_key, master_wb):
        for key, products in products_by_key.items():
            bom_info = bom_info_by_key.get(key)
            if not bom_info:
                continue

            config = bom_info.get('config', {})
            bom_array_str = config.get('array', '')
            bom_rows, bom_cols = parse_array_to_rows_cols(bom_array_str)
            bom_base = config.get('base_count', 0) or 0
            bom_miss = config.get('missing_boards', 0) or 0

            bom_has_inv = any(
                (p.get('quantity') or 0) > 0 and p.get('bom_key') == key
                for p in inverter_products_list
            )

            inv_check = (bom_has_inv if has_explicit_matrix_arrays and matrix_has_inv_info
                         else None)

            matched_idx, matched_array = find_matching_matrix_array(
                matrix_array_entries, bom_rows, bom_cols,
                used_indices=used_array_indices if has_explicit_matrix_arrays else None,
                bom_missing=bom_miss,
                bom_base_count=bom_base,
                strict_only=has_explicit_matrix_arrays,
                bom_has_inverter=inv_check,
            )
            if matched_array is None:
                if has_explicit_matrix_arrays:
                    pending_boms.append({
                        'sheet_name': bom_info.get('variant_name', ''),
                        'bom_info': bom_info,
                        'products': products,
                        'rows': bom_rows,
                        'cols': bom_cols,
                        'base_count': bom_base,
                        'missing': bom_miss,
                        'config': config,
                        'has_inverter': bom_has_inv,
                    })
                continue
            if has_explicit_matrix_arrays and matched_idx is not None:
                used_array_indices.add(matched_idx)

            matched_rows = matched_array.get('rows', '')
            matched_cols = matched_array.get('cols', '')
            matched_qty = matched_array.get('table_qty', 1)
            sheet_prefix = f"({matched_idx + 1}){matched_rows}×{matched_cols}_{matched_qty}"

            filtered, excluded = _filter_excluded(products)
            if excluded:
                all_excluded_products.extend(excluded)
            if not filtered:
                continue

            bracket_prods, pile_prods = _split_pile_products(filtered, price_mapping)
            if pile_prods:
                for pp in pile_prods:
                    pp['_is_pile'] = True
                    scaled = dict(pp)
                    scaled['quantity'] = float(pp.get('quantity', 0)) * matched_qty
                    pile_products_all.append(scaled)
            if not bracket_prods and not pile_prods:
                continue

            all_prods_for_sheet = bracket_prods + pile_prods
            detail_sheet_products.extend(all_prods_for_sheet)

            try:
                detail = create_detail_sheet(
                    master_wb,
                    matched_array,
                    all_prods_for_sheet,
                    price_mapping,
                    sheet_prefix=sheet_prefix,
                    image_path=image_path,
                    image_folder=image_folder,
                    code_to_images=code_to_images,
                    image_temp_dir=image_temp_dir,
                    image_cache=image_cache,
                    matrix_data=matrix_data,
                    group=group,
                    discount_rate=discount_rate,
                    steel_discount_rate=steel_discount_rate,
                    purchased_discount_rate=purchased_discount_rate,
                    steel_pack=steel_pack,
                    unmatched_products_out=all_unmatched_products,
                    excluded_products=excluded,
                    need_weight_code=need_weight_code,
                    coating_thickness=coating_thickness,
                )
                detail['config'] = config
                detail['variant_name'] = bom_info.get('variant_name', '')
                detail['bom_key'] = key
                detail['_matrix_idx'] = matched_idx
                all_detail_results.append(detail)
            except Exception as e:
                import traceback
                print(f"   ❌ 明細シート生成失敗: {e}")
                traceback.print_exc()

    inverter_products_list = pre_parsed_inverter_products or []

    if pre_parsed_products and pre_parsed_bom_info:
        products_by_key = pre_parsed_products
        bom_info_by_key = pre_parsed_bom_info
    else:
        xls = excel_file_compat(input_file)
        products_by_key = {}
        bom_info_by_key = {}
        inverter_products_list = []

        bom_sheet_names = quick_scan_bom_sheets(xls, non_bom_sheet_keywords, selected_key_set)

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

                if original_index < len(bom_starts):
                    bom_info['end_row'] = bom_starts[original_index]['row'] - 1
                else:
                    bom_info['end_row'] = total_rows - 1

                _cfg = bom_info.get('config', {})
                if 'header_row' not in bom_info and _cfg.get('header_row') is not None:
                    bom_info['header_row'] = _cfg['header_row']
                if 'data_start_row' not in bom_info and _cfg.get('data_start_row') is not None:
                    bom_info['data_start_row'] = _cfg['data_start_row']

                inv_codes, inv_rows, sheet_inv_total = _find_inverter_region(df, bom_info)
                if inv_rows:
                    inv_prods = _extract_inverter_products_from_rows(df, inv_rows)
                    variant_name = bom_info.get('variant_name', '')
                    config = bom_info.get('config', {})
                    for ip in inv_prods:
                        ip['variant_name'] = variant_name
                        ip['bom_key'] = bom_info.get('key', '')
                        ip['array'] = config.get('array', '')
                        ip['inverter_total_count'] = sheet_inv_total
                    inverter_products_list.extend(inv_prods)
                else:
                    inv_rows = []

                bom_df = extract_bom_dataframe(
                    df, bom_info, original_index, bom_starts, total_rows,
                    column_mapping, skip_keywords,
                )
                if bom_df is None or bom_df.empty:
                    continue
                products, array_info, span_info = read_bom_from_dataframe(bom_df)
                if not products:
                    continue
                inv_row_set = set(inv_rows)
                bracket_products, _ = _split_inverter_products_by_rows(products, inv_row_set)
                if bracket_products:
                    products_by_key[key] = bracket_products
                    bom_info_by_key[key] = bom_info

    master_wb = Workbook()
    default_sheet = master_wb.active
    master_wb.remove(default_sheet)

    _process_products_by_key(products_by_key, bom_info_by_key, master_wb)

    # ========== 逐个 BOM 匹配（与 NV 一致，不做多 BOM 合并） ==========
    if pending_boms and has_explicit_matrix_arrays and matrix_array_entries:
        used_pb_indices = set()

        def _find_match_for_pb(pb, used_array_indices, require_base_match):
            pb_rows = pb.get('rows')
            pb_cols = pb.get('cols')
            pb_base = pb.get('base_count', 0) or 0
            pb_has_inv = pb.get('has_inverter', False)
            if pb_rows is None or pb_cols is None:
                return None, None
            matched_m_idx = None
            matched_array = None
            for m_idx in range(len(matrix_array_entries)):
                if m_idx in used_array_indices:
                    continue
                me = matrix_array_entries[m_idx]
                if me.get('rows') != pb_rows or me.get('cols') != pb_cols:
                    continue
                me_has_inv = me.get('has_inverter', False)
                base_match = pb_base and pb_base == (me.get('table_qty') or 1)
                if require_base_match and not base_match:
                    continue
                if pb_has_inv == me_has_inv:
                    return m_idx, me
                if matched_m_idx is None:
                    matched_m_idx = m_idx
                    matched_array = me
            return matched_m_idx, matched_array

        def _process_pending_match(pb_idx, pb, matched_m_idx, matched_array):
            if matched_array is None:
                return False
            used_array_indices.add(matched_m_idx)
            used_pb_indices.add(pb_idx)
            ma_rows = matched_array.get('rows', '')
            ma_cols = matched_array.get('cols', '')
            ma_qty = matched_array.get('table_qty', 1)
            sheet_prefix = f"({matched_m_idx + 1}){ma_rows}×{ma_cols}_{ma_qty}"
            bom_products = pb.get('products') or []
            filtered, excluded = _filter_excluded(bom_products)
            if excluded:
                all_excluded_products.extend(excluded)
            if not filtered:
                return False
            bracket_prods, pile_prods = _split_pile_products(filtered, price_mapping)
            if pile_prods:
                for pp in pile_prods:
                    pp['_is_pile'] = True
                    scaled = dict(pp)
                    scaled['quantity'] = float(pp.get('quantity', 0)) * ma_qty
                    pile_products_all.append(scaled)
            if not bracket_prods and not pile_prods:
                return False
            all_prods_for_sheet = bracket_prods + pile_prods
            detail_sheet_products.extend(all_prods_for_sheet)
            try:
                detail = create_detail_sheet(
                    master_wb,
                    matched_array,
                    all_prods_for_sheet,
                    price_mapping,
                    sheet_prefix=sheet_prefix,
                    image_path=image_path,
                    image_folder=image_folder,
                    code_to_images=code_to_images,
                    image_temp_dir=image_temp_dir,
                    image_cache=image_cache,
                    matrix_data=matrix_data,
                    group=group,
                    discount_rate=discount_rate,
                    steel_discount_rate=steel_discount_rate,
                    purchased_discount_rate=purchased_discount_rate,
                    steel_pack=steel_pack,
                    unmatched_products_out=all_unmatched_products,
                    excluded_products=excluded,
                    need_weight_code=need_weight_code,
                    coating_thickness=coating_thickness,
                )
                detail['config'] = pb.get('config') or {}
                detail['variant_name'] = pb.get('sheet_name', '')
                detail['bom_key'] = pb.get('bom_info', {}).get('key', '')
                detail['_matrix_idx'] = matched_m_idx
                all_detail_results.append(detail)
                print(f"   ✅ JA detail: {detail['sheet_name']} "
                      f"({ma_rows}×{ma_cols}_{ma_qty})")
            except Exception as e:
                import traceback
                print(f"   ❌ JA detail failed: {e}")
                traceback.print_exc()
            return True

        for pb_idx, pb in enumerate(pending_boms):
            m_idx, m_arr = _find_match_for_pb(pb, used_array_indices, require_base_match=True)
            if m_arr is not None:
                _process_pending_match(pb_idx, pb, m_idx, m_arr)

        # ========== 累加匹配检测 ==========
        _remaining_pb = [(i, pb) for i, pb in enumerate(pending_boms) if i not in used_pb_indices]
        _remaining_matrix = set(range(len(matrix_array_entries))) - used_array_indices
        _pending_by_rc = {}
        for _pb_idx, _pb in _remaining_pb:
            _rc = (_pb.get('rows'), _pb.get('cols'))
            _pending_by_rc.setdefault(_rc, []).append((_pb_idx, _pb))
        _accum_candidates = {}
        _accum_pb_set = set()
        for _rc, _items in _pending_by_rc.items():
            if len(_items) < 2:
                continue
            _total_base = sum(_pb.get('base_count', 0) or 0 for _, _pb in _items)
            for _m_idx in _remaining_matrix:
                _me = matrix_array_entries[_m_idx]
                if _me.get('rows') != _rc[0] or _me.get('cols') != _rc[1]:
                    continue
                if _me.get('table_qty', 1) == _total_base:
                    _accum_candidates[_m_idx] = list(_items)
                    for _pb_idx, _ in _items:
                        _accum_pb_set.add(_pb_idx)
                    break
        _accum_matrix_set = set(_accum_candidates.keys())

        for pb_idx, pb in enumerate(pending_boms):
            if pb_idx in used_pb_indices:
                continue
            if pb_idx in _accum_pb_set:
                continue
            _skip_matrix = used_array_indices | _accum_matrix_set
            m_idx, m_arr = _find_match_for_pb(pb, _skip_matrix, require_base_match=False)
            if m_arr is not None:
                _process_pending_match(pb_idx, pb, m_idx, m_arr)

        # ========== 累加匹配：生成独立的明细シート ==========
        for _m_idx, _items in _accum_candidates.items():
            _me = matrix_array_entries[_m_idx]
            used_array_indices.add(_m_idx)
            _r, _c = _me.get('rows'), _me.get('cols')
            _total_base = _me.get('table_qty', 1)
            _accum_group_id = f"{_r}×{_c}_{_total_base}"
            _items.sort(key=lambda x: x[1].get('base_count', 0) or 0)
            for _sub_idx, (_pb_idx, _pb) in enumerate(_items):
                used_pb_indices.add(_pb_idx)
                _pb_base = _pb.get('base_count', 0) or 1
                _sheet_prefix = f"({_m_idx + 1}_{_sub_idx + 1}){_r}×{_c}_{_pb_base}"
                _sub_array_info = dict(_me)
                _sub_array_info['table_qty'] = _pb_base
                _bom_products = _pb.get('products') or []
                _filtered, _excluded = _filter_excluded(_bom_products)
                if _excluded:
                    all_excluded_products.extend(_excluded)
                if not _filtered:
                    continue
                _bracket_prods, _pile_prods = _split_pile_products(_filtered, price_mapping)
                if _pile_prods:
                    for _pp in _pile_prods:
                        _pp['_is_pile'] = True
                        _scaled = dict(_pp)
                        _scaled['quantity'] = float(_pp.get('quantity', 0)) * _pb_base
                        pile_products_all.append(_scaled)
                if not _bracket_prods and not _pile_prods:
                    continue
                _all_prods = _bracket_prods + _pile_prods
                detail_sheet_products.extend(_all_prods)
                try:
                    detail = create_detail_sheet(
                        master_wb,
                        _sub_array_info,
                        _all_prods,
                        price_mapping,
                        sheet_prefix=_sheet_prefix,
                        image_path=image_path,
                        image_folder=image_folder,
                        code_to_images=code_to_images,
                        image_temp_dir=image_temp_dir,
                        image_cache=image_cache,
                        matrix_data=matrix_data,
                        group=group,
                        discount_rate=discount_rate,
                        steel_discount_rate=steel_discount_rate,
                        purchased_discount_rate=purchased_discount_rate,
                        steel_pack=steel_pack,
                        unmatched_products_out=all_unmatched_products,
                        excluded_products=_excluded,
                        need_weight_code=need_weight_code,
                        coating_thickness=coating_thickness,
                    )
                    detail['config'] = _pb.get('config') or {}
                    detail['variant_name'] = _pb.get('sheet_name', '')
                    detail['bom_key'] = _pb.get('bom_info', {}).get('key', '')
                    detail['_matrix_idx'] = _m_idx
                    detail['accumulated_group_id'] = _accum_group_id
                    detail['accumulated_sub_idx'] = _sub_idx
                    all_detail_results.append(detail)
                    print(f"   ✅ JA detail (accumulated): {detail['sheet_name']} "
                          f"({_r}×{_c}_{_pb_base}, group={_accum_group_id})")
                except Exception as e:
                    import traceback
                    print(f"   ❌ JA detail (accumulated) failed: {e}")
                    traceback.print_exc()

    # ========== 未匹配信息表エントリにBOM再利用で明細シート生成 ==========
    if has_explicit_matrix_arrays and matrix_array_entries and len(used_array_indices) < len(matrix_array_entries):
        unmatched_matrix_indices = [i for i in range(len(matrix_array_entries)) if i not in used_array_indices]
        if unmatched_matrix_indices and all_detail_results:
            for um_idx in unmatched_matrix_indices:
                um_entry = matrix_array_entries[um_idx]
                um_rows = um_entry.get('rows')
                um_cols = um_entry.get('cols')
                if um_rows is None or um_cols is None:
                    continue

                source_detail = None
                source_bom_key = None
                for d in all_detail_results:
                    d_arr = d.get('array_info') or {}
                    if d_arr.get('rows') == um_rows and d_arr.get('cols') == um_cols:
                        source_detail = d
                        source_bom_key = d.get('bom_key', '')
                        break
                if source_detail is None:
                    for key, prods in products_by_key.items():
                        bi = bom_info_by_key.get(key)
                        if not bi:
                            continue
                        cfg = bi.get('config', {})
                        br, bc = parse_array_to_rows_cols(cfg.get('array', ''))
                        if br == um_rows and bc == um_cols:
                            source_bom_key = key
                            break
                    if source_bom_key and source_bom_key in products_by_key:
                        pass
                    else:
                        source_bom_key = None

                if source_detail is None and source_bom_key is None:
                    continue

                if source_bom_key and source_bom_key in products_by_key:
                    reuse_products = [dict(p) for p in products_by_key[source_bom_key]]
                    reuse_bom_info = bom_info_by_key.get(source_bom_key, {})
                elif source_detail:
                    reuse_products = []
                    reuse_bom_info = {}
                else:
                    continue

                if not reuse_products:
                    continue

                um_qty = um_entry.get('table_qty', 1)
                ma_rows_str = um_entry.get('rows', '')
                ma_cols_str = um_entry.get('cols', '')
                sheet_prefix = f"({um_idx + 1}){ma_rows_str}×{ma_cols_str}_{um_qty}"

                filtered, excluded = _filter_excluded(reuse_products)
                if excluded:
                    all_excluded_products.extend(excluded)
                if not filtered:
                    continue

                bracket_prods, pile_prods = _split_pile_products(filtered, price_mapping)
                if pile_prods:
                    for pp in pile_prods:
                        pp['_is_pile'] = True
                        scaled = dict(pp)
                        scaled['quantity'] = float(pp.get('quantity', 0)) * um_qty
                        pile_products_all.append(scaled)
                if not bracket_prods and not pile_prods:
                    continue

                all_prods_for_sheet = bracket_prods + pile_prods
                detail_sheet_products.extend(all_prods_for_sheet)

                try:
                    detail = create_detail_sheet(
                        master_wb,
                        um_entry,
                        all_prods_for_sheet,
                        price_mapping,
                        sheet_prefix=sheet_prefix,
                        image_path=image_path,
                        image_folder=image_folder,
                        code_to_images=code_to_images,
                        image_temp_dir=image_temp_dir,
                        image_cache=image_cache,
                        matrix_data=matrix_data,
                        group=group,
                        discount_rate=discount_rate,
                        steel_discount_rate=steel_discount_rate,
                        purchased_discount_rate=purchased_discount_rate,
                        steel_pack=steel_pack,
                        unmatched_products_out=all_unmatched_products,
                        excluded_products=excluded,
                        need_weight_code=need_weight_code,
                        coating_thickness=coating_thickness,
                    )
                    detail['config'] = reuse_bom_info.get('config') or {}
                    detail['variant_name'] = reuse_bom_info.get('variant_name', '')
                    detail['bom_key'] = source_bom_key or ''
                    detail['_matrix_idx'] = um_idx
                    all_detail_results.append(detail)
                    used_array_indices.add(um_idx)
                    print(f"   ✅ JA detail (reused BOM): {detail['sheet_name']} "
                          f"({ma_rows_str}×{ma_cols_str}_{um_qty})")
                except Exception as e:
                    import traceback
                    print(f"   ❌ JA detail (reused BOM) failed: {e}")
                    traceback.print_exc()

    inverter_detail_results = []
    has_valid_inverter_qty = any(
        (p.get('quantity') or 0) > 0 for p in inverter_products_list
    )
    if inverter_products_list and has_valid_inverter_qty:
        from collections import OrderedDict
        bom_groups = OrderedDict()
        for p in inverter_products_list:
            bk = p.get('bom_key', '') or p.get('variant_name', '') or '__no_key__'
            bom_groups.setdefault(bk, []).append(p)

        for bk, inv_prods in bom_groups.items():
            if not any((p.get('quantity') or 0) > 0 for p in inv_prods):
                continue
            try:
                inv_filtered, inv_excluded = _filter_excluded(inv_prods)
                if inv_excluded:
                    all_excluded_products.extend(inv_excluded)
                if not inv_filtered:
                    continue
                detail_sheet_products.extend(inv_filtered)

                matched_arr = None
                inv_bom_keys = set(p.get('bom_key', '') for p in inv_prods if p.get('bom_key') and (p.get('quantity') or 0) > 0)
                for detail in all_detail_results:
                    dk = detail.get('bom_key', '')
                    if dk and dk in inv_bom_keys:
                        detail_arr = detail.get('array_info')
                        if detail_arr:
                            matched_arr = detail_arr
                            break
                if matched_arr is None:
                    for arr in arrays:
                        arr_str = f"{arr.get('rows', '')}×{arr.get('cols', '')}"
                        vn_first = inv_prods[0].get('variant_name', '') if inv_prods else ''
                        if arr_str in vn_first or vn_first.startswith(arr_str):
                            matched_arr = arr
                            break
                if matched_arr is None and arrays:
                    matched_arr = arrays[0]

                standalone_inv_entry = None
                inv_counts = set(int(p.get('inverter_total_count', 0)) for p in inv_filtered if int(p.get('inverter_total_count', 0)) > 0)
                total_inv_qty = inv_counts.pop() if inv_counts else sum(int(p.get('quantity', 0)) for p in inv_filtered)
                for arr_entry in arrays:
                    if arr_entry.get('is_standalone_inverter'):
                        entry_inv_count = arr_entry.get('inverter_count', 1)
                        if int(entry_inv_count) == int(total_inv_qty):
                            standalone_inv_entry = arr_entry
                            break

                if standalone_inv_entry:
                    inv_base = standalone_inv_entry.get('table_qty', 1)
                    inv_array_info = {
                        'no': '0',
                        'rows': 0,
                        'cols': 0,
                        'table_qty': inv_base,
                        'note': '',
                    }
                    inv_matched_qty = inv_base
                    sheet_prefix = f"パワコン独立架台_{inv_base}"
                else:
                    inv_array_info = {
                        'no': '0',
                        'rows': matched_arr.get('rows', 0) if matched_arr else 0,
                        'cols': matched_arr.get('cols', 0) if matched_arr else 0,
                        'table_qty': matched_arr.get('table_qty', 1) if matched_arr else 1,
                        'note': '',
                    }
                    inv_matched_qty = matched_arr.get('table_qty', 1) if matched_arr else 1
                    inv_matched_rows = matched_arr.get('rows', '') if matched_arr else ''
                    inv_matched_cols = matched_arr.get('cols', '') if matched_arr else ''
                    sheet_prefix = f"パワコン_{inv_matched_rows}×{inv_matched_cols}_{inv_matched_qty}"

                inv_remark = f"パワコン取付バー  {total_inv_qty}台"

                inv_detail = create_detail_sheet(
                    master_wb,
                    inv_array_info,
                    inv_filtered,
                    price_mapping,
                    sheet_prefix=sheet_prefix,
                    image_path=image_path,
                    image_folder=image_folder,
                    code_to_images=code_to_images,
                    image_temp_dir=image_temp_dir,
                    image_cache=image_cache,
                    matrix_data=matrix_data,
                    group=group,
                    discount_rate=discount_rate,
                    steel_discount_rate=steel_discount_rate,
                    purchased_discount_rate=purchased_discount_rate,
                    steel_pack=steel_pack,
                    unmatched_products_out=all_unmatched_products,
                    excluded_products=inv_excluded,
                    need_weight_code=need_weight_code,
                    inv_remark=inv_remark,
                    coating_thickness=coating_thickness,
                )
                if inv_detail:
                    vn_first = inv_prods[0].get('variant_name', '') if inv_prods else ''
                    inv_detail['variant_name'] = vn_first
                    inv_detail['inv_remark'] = inv_remark
                    inv_detail['inv_qty_per_base'] = total_inv_qty
                    inv_detail['bom_keys'] = set(p.get('bom_key', '') for p in inv_prods if p.get('bom_key') and (p.get('quantity') or 0) > 0)
                    inverter_detail_results.append(inv_detail)
                    print(f"   ⚡ パワコン明細シート生成: {inv_detail.get('sheet_name')} ({bk})")
            except Exception as e:
                import traceback
                print(f"   ❌ パワコン明細シート生成失敗 ({bk}): {e}")
                traceback.print_exc()

    for inv_res in inverter_detail_results:
        inv_remark = inv_res.get('inv_remark', '')
        inv_bom_keys = inv_res.get('bom_keys', set())
        if not inv_remark:
            continue
        for detail in all_detail_results:
            dk = detail.get('bom_key', '')
            if dk and dk in inv_bom_keys:
                detail['inv_note'] = inv_remark

    pile_summary = None
    if pile_products_all:
        try:
            pile_filtered, pile_excluded = _filter_excluded(pile_products_all)
            if pile_excluded:
                all_excluded_products.extend(pile_excluded)
            if not pile_filtered:
                pile_products_all = []
            else:
                pile_filtered = [pp for pp in pile_filtered if float(pp.get('quantity', 0) or 0) > 0]
                if not pile_filtered:
                    pile_products_all = []
                else:
                    pile_by_code = {}
                    import re as _re
                    for _pp in pile_filtered:
                        _pp_qty = float(_pp.get('quantity', 0))
                        _pp_code = str(_pp.get('code', '') or '').strip()
                        _pp_pi = resolve_price_info(price_mapping, _pp_code, spec=_pp.get('spec', '')) if price_mapping else None
                        _pp_price = get_temp_adjusted_base_price(_pp_pi, _pp, group or '日语组', 'export') if _pp_pi and _pp_pi.get('price') else 0
                        _pp_unit = (_pp_pi.get('unit', '') if _pp_pi else '') or ''
                        if _pp_unit in ('米', 'm', 'M', 'meter'):
                            _m = _re.search(r'(\d+\.?\d*)', _pp.get('spec', ''))
                            _len = float(_m.group(1)) if _m else 0
                            if _len > 0:
                                _pp_price = _pp_price * _len / 1000
                        if _pp_code not in pile_by_code:
                            _pp_name_ja = 'スクリュー杭'
                            if _pp_pi:
                                _pp_name_ja = _pp_pi.get('name_ja') or _pp_pi.get('name') or 'スクリュー杭'
                            pile_by_code[_pp_code] = {
                                'code': _pp_code,
                                'name_ja': _pp_name_ja,
                                'spec': _pp.get('spec', ''),
                                'unit_price': _pp_price,
                                'total_qty': 0,
                            }
                        pile_by_code[_pp_code]['total_qty'] += _pp_qty

                    for _dr in all_detail_results:
                        _sn = _dr.get('sheet_name', '')
                        for _ppi in (_dr.get('pile_products_info') or []):
                            _c = str(_ppi.get('code', '') or '').strip()
                            if _c in pile_by_code:
                                if 'detail_refs' not in pile_by_code[_c]:
                                    pile_by_code[_c]['detail_refs'] = []
                                pile_by_code[_c]['detail_refs'].append({
                                    'sheet': _sn,
                                    'row': _ppi['row'],
                                })

                    pile_items = list(pile_by_code.values())
                    pile_summary = {'items': pile_items}
                    _pq_total = sum(it['total_qty'] for it in pile_items)
                    _pa_total = sum(it['unit_price'] * it['total_qty'] for it in pile_items)
                    for _pi_it in pile_items:
                        print(f"   🔩 地盤杭: code={_pi_it['code']}, unit_price={_pi_it['unit_price']}, unit={_pp_pi.get('unit','') if _pp_pi else '?'}, qty={_pi_it['total_qty']}")
                    print(f"   🔩 地盤杭汇总: {len(pile_items)}種, 数量={_pq_total}, 金額={_pa_total:.2f}")
        except Exception as e:
            import traceback
            print(f"   ❌ 地盤杭汇总失敗: {e}")
            traceback.print_exc()

    # 按 matrix_array_entries（情報シート）順序にシートを再配置
    if all_detail_results and has_explicit_matrix_arrays and matrix_array_entries:
        reorder_sheets_by_matrix_array(master_wb, all_detail_results, matrix_array_entries, log_prefix='[JA]')

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
                'EST',
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
        translate_notes_in_details(all_detail_results)
        translate_notes_in_details(inverter_detail_results)
        try:
            fence_material_map = {}
            fence_surface_for_prefix = ''
            if fence_data:
                fence_items_for_map = fence_data.get('items') or []
                for seg in (fence_data.get('segments') or []):
                    fence_items_for_map.extend(seg.get('items') or [])
                fence_codes = set()
                for item in fence_items_for_map:
                    code = str(item.get('code', '')).strip()
                    if code:
                        fence_codes.add(code)
                fence_surface_for_prefix = str(fence_data.get('surface', '') or fence_data.get('color', '')).strip()
                surface_prefix_map = {
                    '白色浸塑': 'FN01', '咖啡色浸塑': 'FN02', '绿色浸塑': 'FN03',
                    '灰褐色浸塑': 'FN04', '深茶色浸塑': 'FN05', '银灰色浸塑': 'FN06',
                    '黑色浸塑': 'FN07', '深咖色浸塑': 'FN08', '热镀锌': 'FN11',
                    '咖啡浸塑': 'FN02', '绿浸塑': 'FN03',
                    '灰褐浸塑': 'FN04', '深茶浸塑': 'FN05', '银灰浸塑': 'FN06',
                    '黑浸塑': 'FN07', '深咖浸塑': 'FN08',
                    '白色': 'FN01', '咖啡色': 'FN02', '茶': 'FN02', '绿色': 'FN03',
                    '灰褐色': 'FN04', '深茶色': 'FN05', '银灰色': 'FN06',
                    '黑色': 'FN07', '深咖色': 'FN08',
                    'シルバー': 'FN11', '银': 'FN06', '热镀': 'FN11',
                }
                color_prefix = surface_prefix_map.get(fence_surface_for_prefix, 'FN01')
                if fence_codes:
                    try:
                        from backend.repositories.fence_gate_material_repository import get_material
                        for code in fence_codes:
                            normalized_code = str(code or '').strip()
                            candidate_codes = [normalized_code]
                            if '-' in normalized_code:
                                first_part = normalized_code.split('-', 1)[0]
                                if first_part.startswith('FN') and len(first_part) == 4:
                                    candidate_codes.append(normalized_code.split('-', 1)[1])
                            if '-' in normalized_code:
                                base_with_dash = normalized_code if normalized_code.startswith('M') else normalized_code.split('-', 1)[1] if normalized_code.startswith('FN') else ''
                                if base_with_dash.startswith('M'):
                                    for prefix in [color_prefix, 'FN01', 'FN11']:
                                        candidate_codes.append(f'{prefix}-{base_with_dash}')
                            mat = None
                            for candidate in candidate_codes:
                                try:
                                    mat = get_material(candidate)
                                    if mat:
                                        break
                                except Exception:
                                    continue
                            if mat:
                                fence_material_map[code] = mat
                    except Exception as e:
                        print(f"   ⚠️ フェンス素材情報取得失敗: {e}")

            if fence_material_map and not image_temp_dir:
                image_temp_dir = os.path.join(output_dir, f"temp_images_{uuid.uuid4().hex}")
                os.makedirs(image_temp_dir, exist_ok=True)

            create_summary_sheet(
                master_wb,
                all_detail_results,
                matrix_data=matrix_data,
                image_path=image_path,
                inverter_detail=inverter_detail_results if inverter_detail_results else None,
                pile_summary=pile_summary,
                fence_data=fence_data,
                fence_material_map=fence_material_map,
                image_temp_dir=image_temp_dir,
                image_cache=image_cache,
                shipping_data={
                    'exchange_rate': exchange_rate or 160,
                    'tariff_rate': tariff_rate if tariff_rate is not None else 1.6,
                    'consumption_tax': consumption_tax if consumption_tax is not None else 10,
                    'fence_tax': fence_tax if fence_tax is not None else 10,
                    'discount_rate': discount_rate if discount_rate is not None else 71,
                    'steel_discount_rate': steel_discount_rate if steel_discount_rate is not None else 84,
                    'purchased_discount_rate': purchased_discount_rate if purchased_discount_rate is not None else 94,
                    'fence_discount_rate': 94,
                    'truck_desc': truck_desc or '',
                    'truck_fee': truck_fee or 0,
                    'case_type': case_type or 'EST',
                    'normal_params': normal_params,
                },
            )
        except Exception as e:
            import traceback
            print(f"   ❌ 合計シート生成失敗: {e}")
            traceback.print_exc()

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
            missing_ja_list = []
            missing_image_codes = []
            seen_ja = set()
            seen_img = set()
            for p in detail_sheet_products:
                code = str(p.get('code', '') or '').strip()
                if not code:
                    continue
                pi = resolve_price_info(price_mapping, code, spec=p.get('spec', ''))
                norm = code.upper().replace(' ', '')
                if norm not in seen_ja:
                    seen_ja.add(norm)
                    if pi and not pi.get('name_ja', '').strip():
                        missing_ja_list.append({
                            'code': pi.get('db_code', code),
                            'name': pi.get('name', '') or p.get('name', ''),
                        })
                if code not in seen_img:
                    seen_img.add(code)
                    if not pi or pi.get('image_status') in ('missing', 'invalid'):
                        missing_image_codes.append(code)
            quotation_product_codes = set()
            for p in detail_sheet_products:
                c = str(p.get('code', '') or '').strip()
                if c:
                    quotation_product_codes.add(c)
            for p in all_excluded_products:
                c = str(p.get('code', '') or '').strip()
                if c:
                    quotation_product_codes.add(c)
            return {
                'output_file': output_file,
                'inquiry_file': inquiry_file,
                'unmatched_count': len(all_unmatched_products),
                'unmatched_products': all_unmatched_products,
                'quotation_product_codes': quotation_product_codes,
                'missing_ja_list': missing_ja_list,
                'missing_image_codes': missing_image_codes,
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
