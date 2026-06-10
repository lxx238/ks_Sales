import pandas as pd
import re

from backend.excel.reader import read_excel_compat


_SCAN_MAX_ROW = 200
_SCAN_MAX_COL = 40


def _find_target_sheet(matrix_file):
    xls = pd.ExcelFile(matrix_file)
    target_keyword = '架台設計情報'
    candidates = [s for s in xls.sheet_names if target_keyword in s]
    if len(candidates) > 1:
        best_sheet = None
        best_count = -1
        for sname in candidates:
            try:
                df = read_excel_compat(matrix_file, sheet_name=sname, header=None)
                arrays = _extract_arrays(df)
                if len(arrays) > best_count:
                    best_count = len(arrays)
                    best_sheet = sname
            except Exception:
                continue
        if best_sheet:
            return best_sheet
    if candidates:
        return candidates[0]
    for sname in xls.sheet_names:
        df = xls.parse(sheet_name=sname, header=None, nrows=5)
        if df.empty:
            continue
        for r in range(min(5, df.shape[0])):
            for c in range(min(10, df.shape[1])):
                val = df.iat[r, c]
                if pd.isna(val):
                    continue
                if '架台' in str(val) and '設計' in str(val):
                    return sname
    return None


def _safe_str(val):
    if pd.isna(val):
        return ''
    return str(val).strip()


def _find_keyword_row(df, keywords, scan_range=range(1, 10)):
    for r in scan_range:
        if r >= df.shape[0]:
            break
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            val = _safe_str(df.iat[r, c])
            if val and any(kw in val for kw in keywords):
                return r
    return None


def _extract_panel_spec(df):
    row2 = df.shape[0] > 1
    if not row2:
        return None
    for c in range(min(_SCAN_MAX_COL, df.shape[1])):
        val = _safe_str(df.iat[1, c])
        if not val:
            continue
        match = re.search(r'([A-Za-z0-9\-]+)\s+(\d+)W', val)
        if match:
            return match.group(0).strip()
    return None


def _extract_panel_wattage(df):
    if df.shape[0] < 8:
        return None
    scan_rows = []
    default_r = 7
    if default_r < df.shape[0]:
        scan_rows.append(default_r)
    kw_row = _find_keyword_row(df, ['W/', 'w/', '太阳能板'], scan_range=range(5, 12))
    if kw_row is not None and kw_row not in scan_rows:
        scan_rows.append(kw_row)
    for r in scan_rows:
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            val = _safe_str(df.iat[r, c])
            if 'W/' in val or 'w/' in val:
                for offset in [-1, 1]:
                    try:
                        num = float(df.iat[r, c + offset])
                        if 50 < num < 2000:
                            return int(num)
                    except (ValueError, TypeError, IndexError):
                        pass
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            val = _safe_str(df.iat[r, c])
            if 'W' in val:
                match = re.search(r'(\d+(?:\.\d+)?)\s*W', val, re.IGNORECASE)
                if match:
                    v = float(match.group(1))
                    if 50 < v < 2000:
                        return int(v)
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            raw = df.iat[r, c]
            if not pd.isna(raw):
                try:
                    num = float(raw)
                    if 50 < num < 2000:
                        val_next = _safe_str(df.iat[r, c + 1]) if c + 1 < df.shape[1] else ''
                        val_prev = _safe_str(df.iat[r, c - 1]) if c > 0 else ''
                        if 'W' in val_next or 'W' in val_prev:
                            return int(num)
                except (ValueError, TypeError):
                    pass
    return None


def _extract_panel_weight(df):
    if df.shape[0] < 8:
        return None
    scan_rows = []
    default_r = 7
    if default_r < df.shape[0]:
        scan_rows.append(default_r)
    kw_row = _find_keyword_row(df, ['W/', 'w/', '太阳能板', 'kg/'], scan_range=range(5, 12))
    if kw_row is not None and kw_row not in scan_rows:
        scan_rows.append(kw_row)
    for r in scan_rows:
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            val = _safe_str(df.iat[r, c])
            if 'kg' in val.lower() or '重量' in val:
                for offset in [-1, 1]:
                    try:
                        num = float(df.iat[r, c + offset])
                        if 1 < num < 500:
                            return num
                    except (ValueError, TypeError, IndexError):
                        pass
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            val = _safe_str(df.iat[r, c])
            if 'kg' in val.lower():
                match = re.search(r'(\d+(?:\.\d+)?)\s*(?:kg|KG)', val, re.IGNORECASE)
                if match:
                    return float(match.group(1))
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            raw = df.iat[r, c]
            if not pd.isna(raw):
                try:
                    num = float(raw)
                    if 1 < num < 500:
                        val_next = _safe_str(df.iat[r, c + 1]) if c + 1 < df.shape[1] else ''
                        val_prev = _safe_str(df.iat[r, c - 1]) if c > 0 else ''
                        if 'kg' in val_next.lower() or 'kg' in val_prev.lower():
                            return num
                except (ValueError, TypeError):
                    pass
    return None


def _extract_panel_size(df):
    if df.shape[0] < 11:
        return None
    scan_rows = []
    default_r = 9
    if default_r < df.shape[0]:
        scan_rows.append(default_r)
    kw_row = _find_keyword_row(df, ['板尺寸', 'サイズ', '外形寸法', 'パネルサイズ'], scan_range=range(7, 15))
    if kw_row is not None and kw_row not in scan_rows:
        scan_rows.append(kw_row)
    for r in scan_rows:
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            val = _safe_str(df.iat[r, c])
            if not val:
                continue
            match = re.search(r'(\d+)\s*[*×xX]\s*(\d+)\s*[*×xX]\s*(\d+)', val)
            if match:
                return f"{match.group(1)}*{match.group(2)}*{match.group(3)}"
    return None


def _extract_wind_speed(df):
    if df.shape[0] < 5:
        return None
    scan_rows = []
    default_r = 3
    if default_r < df.shape[0]:
        scan_rows.append(default_r)
    kw_row = _find_keyword_row(df, ['風速', '基準風速', '风速'])
    if kw_row is not None and kw_row not in scan_rows:
        scan_rows.append(kw_row)
    for r in scan_rows:
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            val = _safe_str(df.iat[r, c])
            if '風速' in val or '基準風速' in val or '风速' in val:
                try:
                    num = float(df.iat[r, c + 1])
                    unit = _safe_str(df.iat[r, c + 3]) if c + 3 < df.shape[1] else 'm/s'
                    if 'm/s' not in unit.lower() and 'm/s' not in unit:
                        unit = 'm/s'
                    return f"{num} {unit}"
                except (ValueError, TypeError, IndexError):
                    pass
                match = re.search(r'(\d+(?:\.\d+)?)\s*(?:m/s)?', val)
                if match:
                    return f"{float(match.group(1))} m/s"
    return None


def _extract_snow_load(df):
    if df.shape[0] < 6:
        return None
    scan_rows = []
    default_r = 4
    if default_r < df.shape[0]:
        scan_rows.append(default_r)
    kw_row = _find_keyword_row(df, ['積雪', '雪量', '积雪'])
    if kw_row is not None and kw_row not in scan_rows:
        scan_rows.append(kw_row)
    for r in scan_rows:
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            val = _safe_str(df.iat[r, c])
            if '積雪' in val or '雪量' in val or '积雪' in val:
                try:
                    num = float(df.iat[r, c + 1])
                    unit = _safe_str(df.iat[r, c + 3]) if c + 3 < df.shape[1] else 'cm'
                    if 'cm' not in unit.lower():
                        unit = 'cm'
                    return f"{num} {unit}"
                except (ValueError, TypeError, IndexError):
                    pass
                match = re.search(r'(\d+(?:\.\d+)?)\s*(?:cm)?', val)
                if match:
                    return f"{float(match.group(1))} cm"
    return None


def _extract_angle(df):
    if df.shape[0] < 7:
        return None
    scan_rows = []
    default_r = 5
    if default_r < df.shape[0]:
        scan_rows.append(default_r)
    kw_row = _find_keyword_row(df, ['角度', '傾斜', '設置角度'])
    if kw_row is not None and kw_row not in scan_rows:
        scan_rows.append(kw_row)
    for r in scan_rows:
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            val = _safe_str(df.iat[r, c])
            if '角度' in val or '傾斜' in val or '設置角度' in val:
                try:
                    raw_num = df.iat[r, c + 1]
                    if pd.isna(raw_num):
                        continue
                    num = float(raw_num)
                    if num != num:
                        continue
                    return f"{num}°"
                except (ValueError, TypeError, IndexError):
                    pass
                match = re.search(r'(\d+(?:\.\d+)?)\s*°?', val)
                if match:
                    return f"{float(match.group(1))}°"
    return None


def _extract_layout(df):
    if df.shape[0] < 10:
        return '横置き'
    scan_rows = [8]
    kw_row = _find_keyword_row(df, ['横置き', '縦置き', '横置', '縦置'])
    if kw_row is not None and kw_row not in scan_rows:
        scan_rows.append(kw_row)
    for r in scan_rows:
        if r >= df.shape[0]:
            continue
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            val = _safe_str(df.iat[r, c])
            if val == '横置き' or val == '横置':
                next_c = c + 1
                if next_c < df.shape[1]:
                    nv = _safe_str(df.iat[r, next_c])
                    if nv in ('\u2713', '\u2714', '\u25cf', '\u25cb', 'o', 'O', '\u25a1', '\u2611', '*'):
                        return '横置き'
                prev_c = c - 1
                if prev_c >= 0:
                    pv = _safe_str(df.iat[r, prev_c])
                    if pv in ('\u2713', '\u2714', '\u25cf', '\u25cb', 'o', 'O', '\u25a1', '\u2611', '*'):
                        return '横置き'
                return '横置き'
            if val == '縦置き' or val == '縦置':
                next_c = c + 1
                if next_c < df.shape[1]:
                    nv = _safe_str(df.iat[r, next_c])
                    if nv in ('\u2713', '\u2714', '\u25cf', '\u25cb', 'o', 'O', '\u25a1', '\u2611', '*'):
                        return '縦置き'
                prev_c = c - 1
                if prev_c >= 0:
                    pv = _safe_str(df.iat[r, prev_c])
                    if pv in ('\u2713', '\u2714', '\u25cf', '\u25cb', 'o', 'O', '\u25a1', '\u2611', '*'):
                        return '縦置き'
                return '縦置き'
    for r in scan_rows:
        if r >= df.shape[0]:
            continue
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            val = _safe_str(df.iat[r, c])
            if '横' in val:
                return '横置き'
            if '縦' in val:
                return '縦置き'
    return '横置き'


def _extract_ground_height(df):
    if df.shape[0] < 8:
        return None
    scan_rows = []
    default_r = 6
    if default_r < df.shape[0]:
        scan_rows.append(default_r)
    kw_row = _find_keyword_row(df, ['离地高', '離地', '地上高', '高度'])
    if kw_row is not None and kw_row not in scan_rows:
        scan_rows.append(kw_row)
    for r in scan_rows:
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            val = _safe_str(df.iat[r, c])
            if '离地高' in val or '離地' in val or '地上高' in val or '高度' in val:
                try:
                    num = float(df.iat[r, c + 1])
                    return f"{int(num)} mm"
                except (ValueError, TypeError, IndexError):
                    pass
                match = re.search(r'(\d+(?:\.\d+)?)\s*(?:mm|MM)', val, re.IGNORECASE)
                if match:
                    return f"{int(float(match.group(1)))} mm"
    return None


def _extract_arrays(df):
    arrays = []
    if df.shape[0] < 11:
        return arrays

    array_start = None
    for r in range(8, min(20, df.shape[0])):
        row_str = ' '.join(_safe_str(df.iat[r, c]) for c in range(min(_SCAN_MAX_COL, df.shape[1])))
        if '段' in row_str and '列' in row_str:
            array_start = r
            break

    if array_start is None:
        for r in range(8, min(20, df.shape[0])):
            row_str = ' '.join(_safe_str(df.iat[r, c]) for c in range(min(_SCAN_MAX_COL, df.shape[1])))
            if '段' in row_str:
                array_start = r
                break

    if array_start is None:
        return arrays

    header_col_map = {}
    for scan_r in range(max(0, array_start - 3), array_start):
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            val = _safe_str(df.iat[scan_r, c])
            if '基数' in val and '基数' not in header_col_map:
                header_col_map['基数'] = c
            elif '缺板' in val and '缺板' not in header_col_map:
                header_col_map['缺板'] = c
            elif ('備考' in val or '备注' in val) and '備考' not in header_col_map:
                header_col_map['備考'] = c
            elif ('总板' in val or '総枚数' in val or 'パネル数' in val or '总枚数' in val) and '总板数' not in header_col_map:
                header_col_map['总板数'] = c

    array_end = min(array_start + 200, df.shape[0])
    consecutive_empty = 0

    for r in range(array_start, array_end):
        row_str = ' '.join(_safe_str(df.iat[r, c]) for c in range(min(_SCAN_MAX_COL, df.shape[1])))
        if '段' not in row_str:
            consecutive_empty += 1
            if consecutive_empty >= 3:
                break
            continue
        consecutive_empty = 0

        rows_val = None
        cols_val = None
        base_count = None
        note = ''
        total_panels = None
        missing_total = 0
        explicit_missing = None

        base_label_col = None
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            val = _safe_str(df.iat[r, c])
            val_clean = val.replace('\u3000', '').strip()
            if val_clean == '段' or val_clean == '段数':
                if c > 0 and not pd.isna(df.iat[r, c - 1]):
                    try:
                        rows_val = int(float(str(df.iat[r, c - 1])))
                    except (ValueError, TypeError):
                        pass
                if rows_val is None:
                    try:
                        rows_val = int(float(str(df.iat[r, c + 1])))
                    except (ValueError, TypeError):
                        pass
            if val_clean == '列' or val_clean == '列数':
                if c > 0 and not pd.isna(df.iat[r, c - 1]):
                    try:
                        cols_val = int(float(str(df.iat[r, c - 1])))
                    except (ValueError, TypeError):
                        pass
                if cols_val is None:
                    try:
                        cols_val = int(float(str(df.iat[r, c + 1])))
                    except (ValueError, TypeError):
                        pass
            if val_clean == '基数':
                base_label_col = c

        if rows_val is None and cols_val is None:
            break

        if base_label_col is not None and base_label_col + 1 < df.shape[1]:
            try:
                n = int(float(str(df.iat[r, base_label_col + 1])))
                if 1 <= n <= 9999:
                    base_count = n
            except (ValueError, TypeError):
                pass

        if base_count is None:
            for c in [7, 8, 6, 9]:
                if c >= df.shape[1]:
                    continue
                val = df.iat[r, c]
                if pd.isna(val):
                    continue
                try:
                    n = int(float(str(val)))
                    if 1 <= n <= 9999:
                        base_count = n
                        break
                except (ValueError, TypeError):
                    pass

        missing_col = header_col_map.get('缺板')
        if missing_col is not None and missing_col < df.shape[1]:
            val = df.iat[r, missing_col]
            if not pd.isna(val):
                try:
                    mv = float(str(val))
                    if mv != 0:
                        explicit_missing = int(mv)
                except (ValueError, TypeError):
                    pass

        note_col = header_col_map.get('備考')
        if note_col is not None and note_col < df.shape[1]:
            val = _safe_str(df.iat[r, note_col])
            if val and not val.replace('.', '').replace('-', '').isdigit():
                note = val
        else:
            for c in [8, 9]:
                if c >= df.shape[1]:
                    continue
                val = _safe_str(df.iat[r, c])
                if val and not val.replace('.', '').replace('-', '').isdigit():
                    note = val
                    break

        _inv_keywords = ('逆变器', 'パワコン', '汇流箱', '集電箱', '集电箱', 'PB', 'インバータ')
        has_inverter = any(kw in note for kw in _inv_keywords) if note else False

        total_col = header_col_map.get('总板数')
        if total_col is not None and total_col < df.shape[1]:
            val = df.iat[r, total_col]
            if not pd.isna(val):
                try:
                    total_panels = int(float(str(val)))
                except (ValueError, TypeError):
                    pass

        if total_panels is None:
            for cc in [9, 10]:
                if cc >= df.shape[1]:
                    continue
                val = df.iat[r, cc]
                if pd.isna(val):
                    continue
                try:
                    num = int(float(str(val)))
                    if num < 0:
                        missing_total = num
                    else:
                        total_panels = num
                        break
                except (ValueError, TypeError):
                    pass

        if rows_val is not None and cols_val is not None:
            if base_count is None:
                base_count = 1
            if explicit_missing is not None:
                missing_per_table = explicit_missing
            else:
                if total_panels is None:
                    total_panels = rows_val * cols_val * base_count + missing_total
                full_panels = rows_val * cols_val * base_count
                actual_missing = full_panels - total_panels
                missing_per_table = 0
                if missing_total != 0 and base_count and base_count > 0:
                    missing_per_table = missing_total // base_count
                elif actual_missing != 0 and base_count and base_count > 0:
                    missing_per_table = -(actual_missing // base_count)
            if total_panels is None:
                total_panels = rows_val * cols_val * base_count + (explicit_missing if explicit_missing is not None else 0)
            arrays.append({
                'no': str(len(arrays) + 1),
                'rows': rows_val,
                'cols': cols_val,
                'table_qty': base_count,
                'modules': total_panels,
                'missing_per_table': missing_per_table,
                'note': note,
                'has_inverter': has_inverter,
            })

    _inv_scan_start = array_start
    for r in range(_inv_scan_start, min(_inv_scan_start + 200, df.shape[0])):
        row_str = ' '.join(_safe_str(df.iat[r, c]) for c in range(min(_SCAN_MAX_COL, df.shape[1])))
        if '段' in row_str:
            _inv_scan_start = r + 1
        else:
            break

    _inv_keywords_scan = ('逆变器', 'パワコン', 'インバータ')
    for r in range(_inv_scan_start, min(_inv_scan_start + 30, df.shape[0])):
        row_str = ' '.join(_safe_str(df.iat[r, c]) for c in range(min(_SCAN_MAX_COL, df.shape[1])))
        if not any(kw in row_str for kw in _inv_keywords_scan):
            continue

        inv_count = None
        for m in re.finditer(r'逆变器\s*(\d+)\s*台', row_str):
            inv_count = int(m.group(1))
        if inv_count is None:
            for m in re.finditer(r'パワコン\s*(\d+)\s*台', row_str):
                inv_count = int(m.group(1))
        if inv_count is None:
            for m in re.finditer(r'(\d+)\s*台', row_str):
                inv_count = int(m.group(1))

        inv_base = None
        inv_base_label_col = None
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            val = _safe_str(df.iat[r, c])
            if val == '基数':
                inv_base_label_col = c
                break

        if inv_base_label_col is not None and inv_base_label_col + 1 < df.shape[1]:
            try:
                n = int(float(str(df.iat[r, inv_base_label_col + 1])))
                if 1 <= n <= 9999:
                    inv_base = n
            except (ValueError, TypeError):
                pass

        if inv_base is None:
            base_col_hint = header_col_map.get('基数')
            if base_col_hint is not None and base_col_hint + 1 < df.shape[1]:
                try:
                    n = int(float(str(df.iat[r, base_col_hint + 1])))
                    if 1 <= n <= 9999:
                        inv_base = n
                except (ValueError, TypeError):
                    pass

        if inv_base is None:
            for c in [7, 8, 6, 9]:
                if c >= df.shape[1]:
                    continue
                val = df.iat[r, c]
                if pd.isna(val):
                    continue
                try:
                    n = int(float(str(val)))
                    if 1 <= n <= 9999:
                        inv_base = n
                        break
                except (ValueError, TypeError):
                    pass

        if inv_base is None:
            inv_base = 1
        if inv_count is None:
            inv_count = 1

        arrays.append({
            'no': str(len(arrays) + 1),
            'rows': None,
            'cols': None,
            'table_qty': inv_base,
            'modules': 0,
            'missing_per_table': 0,
            'note': f'逆变器{inv_count}台',
            'has_inverter': True,
            'is_standalone_inverter': True,
            'inverter_count': inv_count,
        })

    return arrays


def _extract_project_name(df):
    if df.shape[0] < 4:
        return None
    for c in range(min(_SCAN_MAX_COL, df.shape[1])):
        val = _safe_str(df.iat[2, c])
        if not val:
            continue
        match = re.search(r'N\d+\s+(.+?)(?:\s*[-‑–]\s*\d+.*(?:KW|kw|Kw))?', val)
        if match:
            name = match.group(1).strip()
            if len(name) > 1:
                return name
        if re.search(r'N\d+', val):
            parts = val.split()
            if len(parts) > 1:
                name = ' '.join(parts[1:]).strip()
                if len(name) > 1:
                    return name
    for r in range(1, min(6, df.shape[0])):
        for c in range(min(_SCAN_MAX_COL - 1, df.shape[1] - 1)):
            val = _safe_str(df.iat[r, c])
            if '案件名' in val or '設置場所' in val:
                name = _safe_str(df.iat[r, c + 1])
                if name and len(name) > 1:
                    return name
    return None


def _extract_project_name_from_filename(filename):
    if not filename:
        return None
    import os
    basename = os.path.splitext(os.path.basename(filename))[0]
    match = re.search(r'(N\d+\s+.+?)(?:\s*[-‑–]\s*\d+.*(?:KW|kw))?', basename, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return None


def _extract_output_kw(df):
    if df.shape[0] < 4:
        return None
    scan_rows = []
    default_r = 2
    if default_r < df.shape[0]:
        scan_rows.append(default_r)
    kw_row = _find_keyword_row(df, ['総出力', '出力', 'KW', 'kw'])
    if kw_row is not None and kw_row not in scan_rows:
        scan_rows.append(kw_row)
    for r in scan_rows:
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            val = _safe_str(df.iat[r, c])
            if not val:
                continue
            match = re.search(r'(\d+(?:\.\d+)?)\s*(?:KW|kw|Kw)', val, re.IGNORECASE)
            if match:
                return float(match.group(1))
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            raw = df.iat[r, c]
            if pd.isna(raw):
                continue
            try:
                num = float(raw)
                if 0 <= num < 10000:
                    kw_nearby = False
                    for cc in range(max(0, c - 2), min(df.shape[1], c + 3)):
                        if cc == c:
                            continue
                        v = _safe_str(df.iat[r, cc])
                        if 'KW' in v.upper() or 'kw' in v:
                            kw_nearby = True
                            break
                    if kw_nearby:
                        return num
            except (ValueError, TypeError):
                pass
    return None


def extract_matrix_data(matrix_file):
    try:
        target_sheet = _find_target_sheet(matrix_file)
        df = read_excel_compat(matrix_file, sheet_name=target_sheet if target_sheet else 0, header=None)
    except Exception as exc:
        raise ValueError(f'情報表の読み込みに失敗しました: {exc}') from exc

    if df.shape[0] < 10:
        raise ValueError('情報表の行数が不足しています（10行以上必要）')

    project_name = _extract_project_name(df)
    if not project_name:
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            val = _safe_str(df.iat[2, c])
            if val and len(val) > 1 and 'N' in val:
                project_name = val
                break
    if not project_name or len(project_name) <= 1:
        project_name = _extract_project_name_from_filename(matrix_file)
    if not project_name:
        raise ValueError('情報表から案件名を検出できませんでした')

    output_kw = _extract_output_kw(df)
    if output_kw is None:
        raise ValueError('情報表から総出力(KW)を検出できませんでした')

    arrays = _extract_arrays(df)
    if not arrays:
        raise ValueError('情報表から陣列構成(段×列)を検出できませんでした')

    total_modules = sum(a['modules'] for a in arrays)
    set_count = len(arrays)
    first = arrays[0]

    panel_wattage = _extract_panel_wattage(df)

    result = {
        'project_name': project_name,
        'output_kw': output_kw,
        'output_wp': int(round(output_kw * 1000)),
        'set_count': set_count,
        'array_rows': first['rows'],
        'array_cols': first['cols'],
        'max_wind_speed': _extract_wind_speed(df),
        'max_snow_load': _extract_snow_load(df),
        'module_wattage': panel_wattage,
        'module_size': _extract_panel_size(df),
        'panel_weight': _extract_panel_weight(df),
        'angle': _extract_angle(df),
        'layout': _extract_layout(df),
        'ground_height': _extract_ground_height(df),
        'panel_spec': _extract_panel_spec(df),
        'arrays': arrays,
        'total_modules': total_modules,
    }
    return result
