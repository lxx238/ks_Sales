import re
import zipfile
from decimal import Decimal




def _build_ss_lookup(ss_data):
    ss_list = []
    pos = 0
    while True:
        si_start = ss_data.find(b'<si>', pos)
        if si_start == -1:
            si_alt = ss_data.find(b'<si ', pos)
            if si_alt == -1:
                break
            si_start = ss_data.find(b'>', si_alt) + 1
        si_end = ss_data.find(b'</si>', si_start)
        if si_end == -1:
            break
        text = ''.join(
            tm.group(1).decode('utf-8', errors='replace')
            for tm in re.finditer(rb'<t[^>]*>([^<]*)</t>', ss_data[si_start:si_end])
        )
        ss_list.append(text)
        pos = si_end + 5
    return ss_list


def _resolve_cell_text(row_chunk, ss_list):
    texts = []
    for cm in re.finditer(rb'<c r="[A-Z]+\d+"[^>]*t="s"[^>]*><v>(\d+)</v>', row_chunk):
        si_idx = int(cm.group(1))
        if 0 <= si_idx < len(ss_list):
            texts.append(ss_list[si_idx])
    return texts


def _resolve_all_values(row_chunk, ss_list):
    texts = []
    is_shared = set()
    for cm in re.finditer(rb'<c r="[A-Z]+\d+"[^>]*t="s"[^>]*><v>(\d+)</v>', row_chunk):
        si_idx = int(cm.group(1))
        if 0 <= si_idx < len(ss_list):
            texts.append(ss_list[si_idx])
            is_shared.add(cm.start())
    for vm in re.finditer(rb'<v>([^<]+)</v>', row_chunk):
        already = any(s <= vm.start() < s + 200 for s in is_shared)
        if not already:
            texts.append(vm.group(1).decode('utf-8', errors='replace'))
    return texts


def _list_bom_tables_zip(input_file, non_bom_sheet_keywords):
    zf = zipfile.ZipFile(input_file, 'r')

    wb_xml = zf.read('xl/workbook.xml').decode('utf-8')
    sheets_raw = re.findall(
        r'<sheet[^/]*?name="([^"]+)"[^/]*?(?:sheetId="[^"]*")?[^/]*?r:id="([^"]+)"',
        wb_xml,
    )
    rels_xml = zf.read('xl/_rels/workbook.xml.rels').decode('utf-8')
    rid_to_file = {}
    for rid, target in re.findall(r'Id="([^"]+)".*?Target="([^"]+)"', rels_xml):
        path = target if target.startswith('xl/') else 'xl/' + target
        rid_to_file[rid] = path

    ss_data = zf.read('xl/sharedStrings.xml')
    ss_list = _build_ss_lookup(ss_data)

    bom_tables = []
    for sheet_name, rid in sheets_raw:
        if any(kw in sheet_name for kw in non_bom_sheet_keywords):
            continue
        if 'BOM' not in sheet_name:
            continue

        sheet_path = rid_to_file.get(rid, '')
        if not sheet_path:
            continue

        try:
            sheet_data = zf.read(sheet_path)
        except Exception:
            continue

        parsed_rows = _parse_sheet_cells(sheet_data, ss_list)
        if len(parsed_rows) < 5:
            continue

        bom_starts = _find_bom_starts_zip(parsed_rows, sheet_name)
        for bom_start in bom_starts:
            config = bom_start.get('config', {})
            array_val = config.get('array', '')
            angle_val = config.get('angle', '')
            variant_name = bom_start.get('variant_name', '固定')

            detail_parts = []
            if array_val:
                detail_parts.append(f"阵列 {array_val}")
            if angle_val:
                detail_parts.append(f"角度 {angle_val}")

            display_name = f"{sheet_name} / {variant_name}"
            if detail_parts:
                display_name = f"{display_name} ({', '.join(detail_parts)})"

            bom_tables.append({
                'key': bom_start['key'],
                'sheet_name': sheet_name,
                'sheet_index': 0,
                'order': len(bom_tables) + 1,
                'start_row': bom_start['row'],
                'variant_name': variant_name,
                'display_name': display_name,
                'array': array_val,
            })

    zf.close()
    return bom_tables


def _quick_get_sheet_names(input_file):
    zf = zipfile.ZipFile(input_file, 'r')
    wb_xml = zf.read('xl/workbook.xml').decode('utf-8')
    zf.close()
    return re.findall(r'<sheet[^/]*?name="([^"]+)"', wb_xml)


def _col_letters_to_idx(letters):
    idx = 0
    for c in letters.upper():
        idx = idx * 26 + (ord(c) - ord('A') + 1)
    return idx - 1


def _is_self_closing(row_chunk, tag_start):
    search_end = min(tag_start + 200, len(row_chunk))
    snippet = row_chunk[tag_start:search_end]
    gt_pos = snippet.find(b'>')
    if gt_pos == -1:
        return False
    return snippet[gt_pos - 1:gt_pos] == b'/'


def _parse_sheet_cells(sheet_data, ss_list):
    rows = {}
    for m in re.finditer(rb'<row\b[^>]*\br="(\d+)"', sheet_data):
        row_num = int(m.group(1))
        row_tag = sheet_data[m.start():m.start() + 300]
        if b'hidden="1"' in row_tag.split(b'>', 1)[0]:
            continue
        if _is_self_closing(sheet_data, m.start()):
            continue
        row_end = sheet_data.find(b'</row>', m.start())
        if row_end == -1:
            continue
        row_chunk = sheet_data[m.start():row_end]
        cells = {}
        for cm in re.finditer(rb'<c r="([A-Z]+)\d+"', row_chunk):
            col_letters = cm.group(1).decode('utf-8')
            col_idx = _col_letters_to_idx(col_letters)
            c_start = cm.start()
            if _is_self_closing(row_chunk, c_start):
                continue
            c_end = row_chunk.find(b'</c>', c_start)
            if c_end == -1:
                continue
            cell_block = row_chunk[c_start:c_end]
            v_match = re.search(rb'<v>([^<]+)</v>', cell_block)
            if not v_match:
                continue
            raw_val = v_match.group(1).decode('utf-8', errors='replace')
            tag_end = cell_block.find(b'>')
            tag_part = cell_block[:tag_end] if tag_end != -1 else b''
            if re.search(rb'\bt="s"', tag_part):
                try:
                    si_idx = int(raw_val)
                except (ValueError, TypeError):
                    continue
                if 0 <= si_idx < len(ss_list):
                    cells[col_idx] = ss_list[si_idx]
            else:
                cells[col_idx] = raw_val
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
    end = search_end if search_end is not None else min(bom_row + 200, max_row + 1)
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
                    config['cross_span'] = m.group(1)
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
    inverter_base_count = 0
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
            if '逆变器配置基数' in row_str:
                for ci in sorted(cells.keys()):
                    val = str(cells.get(ci, '')).strip()
                    if '逆变器配置基数' in val:
                        for nci in sorted(cells.keys()):
                            if nci > ci:
                                nval = str(cells.get(nci, '')).strip()
                                if '逆变器' in nval:
                                    break
                                try:
                                    inverter_base_count = int(float(nval))
                                except (ValueError, TypeError):
                                    continue
                                break
                        break
                _inv_bc_m = re.search(r'逆变器配置基数[：:]*\s*(\d+)', row_str)
                if _inv_bc_m and inverter_base_count == 0:
                    inverter_base_count = int(_inv_bc_m.group(1))
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
                'inverter_base_count': inverter_base_count,
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


def _find_standalone_inverter_zip(parsed_rows, max_row, captured_source_rows):
    captured = set(captured_source_rows)
    marker_rows = []
    for rn in range(1, max_row + 1):
        cells = parsed_rows.get(rn)
        if cells is None:
            continue
        row_str = ' '.join(str(v) for v in cells.values())
        if '逆变器总数量' not in row_str:
            continue
        has_nearby_captured = any(
            (rn + dr) in captured for dr in range(-1, 25)
        )
        if not has_nearby_captured:
            marker_rows.append(rn)

    all_standalone = []
    for marker_rn in marker_rows:
        inverter_total_count = 0
        inverter_base_count = 0
        cells = parsed_rows.get(marker_rn)
        if cells is None:
            continue
        row_str = ' '.join(str(v) for v in cells.values())
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

        if '逆变器配置基数' in row_str:
            for ci in sorted(cells.keys()):
                val = str(cells.get(ci, '')).strip()
                if '逆变器配置基数' in val:
                    for nci in sorted(cells.keys()):
                        if nci > ci:
                            nval = str(cells.get(nci, '')).strip()
                            if '逆变器' in nval:
                                break
                            try:
                                inverter_base_count = int(float(nval))
                            except (ValueError, TypeError):
                                continue
                            break
                    break
            _m = re.search(r'逆变器配置基数[：:]*\s*(\d+)', row_str)
            if _m and inverter_base_count == 0:
                inverter_base_count = int(_m.group(1))

        if inverter_base_count == 0:
            for scan_rn in range(marker_rn + 1, min(marker_rn + 10, max_row + 1)):
                scan_cells = parsed_rows.get(scan_rn)
                if scan_cells is None:
                    continue
                scan_str = ' '.join(str(v) for v in scan_cells.values())
                if '逆变器配置基数' in scan_str:
                    _m2 = re.search(r'逆变器配置基数[：:]*\s*(\d+)', scan_str)
                    if _m2:
                        inverter_base_count = int(_m2.group(1))
                    else:
                        for ci in sorted(scan_cells.keys()):
                            val = str(scan_cells.get(ci, '')).strip()
                            if '逆变器配置基数' in val:
                                for nci in sorted(scan_cells.keys()):
                                    if nci > ci:
                                        nval = str(scan_cells.get(nci, '')).strip()
                                        if '逆变器' in nval:
                                            break
                                        try:
                                            inverter_base_count = int(float(nval))
                                        except (ValueError, TypeError):
                                            continue
                                        break
                                break
                    break

        inv_products = []
        start_scan = marker_rn + 1
        for rn in range(start_scan, min(start_scan + 30, max_row + 1)):
            prod_cells = parsed_rows.get(rn)
            if prod_cells is None:
                continue
            c1 = str(prod_cells.get(1, '')).strip()
            if not c1:
                break
            non_empty = sum(1 for v in prod_cells.values() if str(v).strip())
            if non_empty <= 1:
                break
            prod_row_str = ' '.join(str(v) for v in prod_cells.values())
            if '备注说明' in prod_row_str or '逆变器总数量' in prod_row_str:
                break
            if len(inv_products) >= 10:
                break
            inv_products.append({
                'seq': len(inv_products) + 1,
                'code': c1, 'name': str(prod_cells.get(0, '')),
                'full_name': str(prod_cells.get(2, '')),
                'spec': str(prod_cells.get(3, '')),
                'material': str(prod_cells.get(4, '')),
                'quantity': _safe_float(prod_cells.get(5, 0)),
                'remark': '', 'weight': _safe_float(prod_cells.get(7, 0)),
                'weight_has_unit': False, 'weight_unit': '',
                '_source_row': rn,
                'inverter_total_count': inverter_total_count,
                'inverter_base_count': inverter_base_count,
            })

        if inv_products:
            all_standalone.extend(inv_products)

    return all_standalone


def _find_bom_starts_zip(parsed_rows, sheet_name):
    from backend.core.shared.bom_utils import build_bom_selection_key
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


def _parse_bom_sheets_zip(input_file, selected_key_set, non_bom_sheet_keywords):
    from backend.core.shared.bom_utils import extract_sheet_names_from_keys, build_bom_selection_key
    zf = zipfile.ZipFile(input_file, 'r')

    wb_xml = zf.read('xl/workbook.xml').decode('utf-8')
    sheets_raw = re.findall(
        r'<sheet[^/]*?name="([^"]+)"[^/]*?(?:sheetId="[^"]*")?[^/]*?r:id="([^"]+)"',
        wb_xml,
    )
    rels_xml = zf.read('xl/_rels/workbook.xml.rels').decode('utf-8')
    rid_to_file = {}
    for rid, target in re.findall(r'Id="([^"]+)".*?Target="([^"]+)"', rels_xml):
        path = target if target.startswith('xl/') else 'xl/' + target
        rid_to_file[rid] = path

    ss_data = zf.read('xl/sharedStrings.xml')
    ss_list = _build_ss_lookup(ss_data)

    target_sheets = extract_sheet_names_from_keys(selected_key_set)

    products_by_key = {}
    bom_info_by_key = {}
    bom_configs = []
    inverter_products_all = []

    for sheet_name, rid in sheets_raw:
        if any(kw in sheet_name for kw in non_bom_sheet_keywords):
            continue
        if 'BOM' not in sheet_name:
            continue
        if target_sheets is not None and sheet_name not in target_sheets:
            continue

        sheet_path = rid_to_file.get(rid, '')
        if not sheet_path:
            continue
        try:
            sheet_data = zf.read(sheet_path)
        except Exception:
            continue

        parsed_rows = _parse_sheet_cells(sheet_data, ss_list)
        if len(parsed_rows) < 5:
            continue

        max_row = max(parsed_rows.keys())
        bom_starts = _find_bom_starts_zip(parsed_rows, sheet_name)
        if not bom_starts:
            continue

        for bom_idx, bom_info in enumerate(bom_starts):
            key = bom_info['key']
            if selected_key_set and key not in selected_key_set:
                continue

            bom_configs.append(bom_info)
            bom_row = bom_info['row']
            config = bom_info['config']
            header_row = config['header_row']
            col_mapping = config['column_mapping']

            end_row = _find_end_row_zip(parsed_rows, bom_row, bom_starts, bom_idx, max_row)
            config['end_row'] = end_row

            inv_prods, inv_row_set = _find_inverter_zip(parsed_rows, bom_row, end_row)
            for ip in inv_prods:
                ip['variant_name'] = bom_info['variant_name']
                ip['bom_key'] = key
                ip['array'] = config.get('array', '')
            inverter_products_all.extend(inv_prods)

            all_products = _extract_products_zip(parsed_rows, header_row, end_row, col_mapping)
            bracket_products = [p for p in all_products if p.get('_source_row') not in inv_row_set]

            if bracket_products:
                products_by_key[key] = bracket_products
                bom_info_by_key[key] = bom_info

        captured_source_rows = [p['_source_row'] for p in inverter_products_all if '_source_row' in p]
        standalone_inv = _find_standalone_inverter_zip(parsed_rows, max_row, captured_source_rows)
        if standalone_inv:
            from collections import OrderedDict
            standalone_groups = OrderedDict()
            standalone_source_rows = set()
            for ip in standalone_inv:
                tc = ip.get('inverter_total_count', 0)
                bc = ip.get('inverter_base_count', 0)
                gk = f"__standalone_inv_{tc}台_{bc}基__"
                ip['variant_name'] = gk
                ip['bom_key'] = gk
                ip['array'] = ''
                standalone_groups.setdefault(gk, []).append(ip)
                if '_source_row' in ip:
                    standalone_source_rows.add(ip['_source_row'])
            for gk, prods in standalone_groups.items():
                inverter_products_all.extend(prods)
                print(f"   ⚡ standalone inverter section found: {gk} ({len(prods)} products)")
            if standalone_source_rows:
                for key in list(products_by_key.keys()):
                    products_by_key[key] = [
                        p for p in products_by_key[key]
                        if p.get('_source_row') not in standalone_source_rows
                    ]
                    if not products_by_key[key]:
                        del products_by_key[key]

    zf.close()
    return products_by_key, bom_info_by_key, None, inverter_products_all, bom_configs


def _build_products_by_key(input_file, selected_key_set, column_mapping, skip_keywords, non_bom_sheet_keywords):
    try:
        result = _parse_bom_sheets_zip(input_file, selected_key_set, non_bom_sheet_keywords)
        print(f"[ZIP-PARSER] _parse_bom_sheets_zip OK, keys={list(result[0].keys())}")
        return result
    except Exception as _e:
        print(f"[ZIP-PARSER] _parse_bom_sheets_zip FAILED: {_e}")
        import traceback; traceback.print_exc()

    from backend.excel.reader import excel_file_compat
    from backend.core.shared.bom_utils import (
        quick_scan_bom_sheets, discover_sheet_bom_starts,
        extract_bom_dataframe, read_bom_from_dataframe,
    )

    products_by_key = {}
    bom_info_by_key = {}
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

            bom_df = extract_bom_dataframe(
                df, bom_info, original_index, bom_starts, total_rows,
                column_mapping, skip_keywords,
            )
            if bom_df is None or bom_df.empty:
                continue
            products, array_info, span_info = read_bom_from_dataframe(bom_df)
            if not products:
                continue

            if products:
                products_by_key[key] = products
                bom_info_by_key[key] = bom_info

    return products_by_key, bom_info_by_key, xls, [], []
