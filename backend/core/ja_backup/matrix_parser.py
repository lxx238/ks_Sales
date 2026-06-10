import pandas as pd
import re

from backend.excel.reader import read_excel_compat


_SCAN_MAX_ROW = 45
_SCAN_MAX_COL = 20


def _find_target_sheet(matrix_file):
    xls = pd.ExcelFile(matrix_file)
    target_keyword = '架台設計情報'
    for sname in xls.sheet_names:
        if target_keyword in sname:
            return sname
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
    for c in range(min(_SCAN_MAX_COL, df.shape[1])):
        val = _safe_str(df.iat[7, c])
        if 'W/' in val or 'w/' in val or '出力' in val or '出力' in val:
            try:
                num = float(df.iat[7, c + 1])
                if 50 < num < 2000:
                    return int(num)
            except (ValueError, TypeError, IndexError):
                pass
    for c in range(min(_SCAN_MAX_COL, df.shape[1])):
        val = _safe_str(df.iat[7, c])
        if 'W' in val:
            match = re.search(r'(\d+(?:\.\d+)?)\s*W', val, re.IGNORECASE)
            if match:
                v = float(match.group(1))
                if 50 < v < 2000:
                    return int(v)
    for c in range(min(_SCAN_MAX_COL, df.shape[1])):
        raw = df.iat[7, c]
        if not pd.isna(raw):
            try:
                num = float(raw)
                if 50 < num < 2000:
                    val_next = _safe_str(df.iat[7, c + 1]) if c + 1 < df.shape[1] else ''
                    if 'W' in val_next:
                        return int(num)
            except (ValueError, TypeError):
                pass
    return None


def _extract_panel_weight(df):
    if df.shape[0] < 8:
        return None
    for c in range(min(_SCAN_MAX_COL, df.shape[1])):
        val = _safe_str(df.iat[7, c])
        if 'kg' in val.lower() or '重量' in val or 'kg' in val:
            try:
                num = float(df.iat[7, c - 1])
                if 1 < num < 500:
                    return num
            except (ValueError, TypeError, IndexError):
                pass
    for c in range(min(_SCAN_MAX_COL, df.shape[1])):
        val = _safe_str(df.iat[7, c])
        if 'kg' in val.lower():
            match = re.search(r'(\d+(?:\.\d+)?)\s*(?:kg|KG)', val, re.IGNORECASE)
            if match:
                return float(match.group(1))
    for c in range(min(_SCAN_MAX_COL, df.shape[1])):
        raw = df.iat[7, c]
        if not pd.isna(raw):
            try:
                num = float(raw)
                if 1 < num < 500:
                    val_next = _safe_str(df.iat[7, c + 1]) if c + 1 < df.shape[1] else ''
                    if 'kg' in val_next.lower():
                        return num
            except (ValueError, TypeError):
                pass
    return None


def _extract_panel_size(df):
    if df.shape[0] < 11:
        return None
    for c in range(min(_SCAN_MAX_COL, df.shape[1])):
        val = _safe_str(df.iat[9, c])
        if not val:
            continue
        match = re.search(r'(\d+)\s*[*×xX]\s*(\d+)\s*[*×xX]\s*(\d+)', val)
        if match:
            return f"{match.group(1)}*{match.group(2)}*{match.group(3)}"
    return None


def _extract_wind_speed(df):
    if df.shape[0] < 5:
        return None
    for c in range(min(_SCAN_MAX_COL, df.shape[1])):
        val = _safe_str(df.iat[3, c])
        if '風速' in val or '基準風速' in val or '风速' in val:
            try:
                num = float(df.iat[3, c + 1])
                unit = _safe_str(df.iat[3, c + 3]) if c + 3 < df.shape[1] else 'm/s'
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
    for c in range(min(_SCAN_MAX_COL, df.shape[1])):
        val = _safe_str(df.iat[4, c])
        if '積雪' in val or '雪量' in val or '积雪' in val:
            try:
                num = float(df.iat[4, c + 1])
                unit = _safe_str(df.iat[4, c + 3]) if c + 3 < df.shape[1] else 'cm'
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
    for c in range(min(_SCAN_MAX_COL, df.shape[1])):
        val = _safe_str(df.iat[5, c])
        if '角度' in val or '傾斜' in val or '設置角度' in val:
            try:
                num = float(df.iat[5, c + 1])
                return f"{num}°"
            except (ValueError, TypeError, IndexError):
                pass
            match = re.search(r'(\d+(?:\.\d+)?)\s*°?', val)
            if match:
                return f"{float(match.group(1))}°"
    return None


def _extract_ground_height(df):
    if df.shape[0] < 8:
        return None
    for c in range(min(_SCAN_MAX_COL, df.shape[1])):
        val = _safe_str(df.iat[6, c])
        if '离地高' in val or '離地' in val or '地上高' in val or '高度' in val:
            try:
                num = float(df.iat[6, c + 1])
                return f"{int(num)} mm"
            except (ValueError, TypeError, IndexError):
                pass
            match = re.search(r'(\d+(?:\.\d+)?)\s*(?:mm|MM)', val, re.IGNORECASE)
            if match:
                return f"{int(float(match.group(1)))} mm"
    return None


def _extract_arrays(df):
    arrays = []
    if df.shape[0] < 17:
        return arrays

    for r in range(10, min(17, df.shape[0])):
        row_str = ' '.join(_safe_str(df.iat[r, c]) for c in range(min(_SCAN_MAX_COL, df.shape[1])))
        if '段' not in row_str:
            continue

        rows_val = None
        cols_val = None
        base_count = None
        note = ''
        total_panels = None

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

        for c in [8, 9]:
            if c >= df.shape[1]:
                continue
            val = _safe_str(df.iat[r, c])
            if val and not val.replace('.', '').replace('-', '').isdigit():
                note = val
                break

        for cc in [9, 10]:
            if cc >= df.shape[1]:
                continue
            val = df.iat[r, cc]
            if pd.isna(val):
                continue
            try:
                total_panels = int(float(str(val)))
                break
            except (ValueError, TypeError):
                pass

        if rows_val is not None and cols_val is not None:
            if base_count is None:
                base_count = 1
            if total_panels is None:
                total_panels = rows_val * cols_val * base_count
            arrays.append({
                'no': str(len(arrays) + 1),
                'rows': rows_val,
                'cols': cols_val,
                'table_qty': base_count,
                'modules': total_panels,
                'note': note,
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
    for c in range(min(_SCAN_MAX_COL, df.shape[1])):
        val = _safe_str(df.iat[2, c])
        if not val:
            continue
        match = re.search(r'(\d+(?:\.\d+)?)\s*(?:KW|kw|Kw)', val, re.IGNORECASE)
        if match:
            return float(match.group(1))
    for c in range(min(_SCAN_MAX_COL, df.shape[1])):
        raw = df.iat[2, c]
        if pd.isna(raw):
            continue
        try:
            num = float(raw)
            if 0.1 < num < 10000:
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
        'ground_height': _extract_ground_height(df),
        'panel_spec': _extract_panel_spec(df),
        'arrays': arrays,
        'total_modules': total_modules,
    }
    return result
