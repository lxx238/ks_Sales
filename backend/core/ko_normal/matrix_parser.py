import re
import pandas as pd

from backend.excel.reader import read_excel_compat
from backend.utils.converters import extract_numeric_value

_SCAN_MAX_ROW = 200
_SCAN_MAX_COL = 40


def _find_label_cell(df, keywords):
    for r in range(min(_SCAN_MAX_ROW, df.shape[0])):
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            val = df.iat[r, c]
            if pd.isna(val):
                continue
            text = str(val)
            if any(kw in text for kw in keywords):
                return r, c
    return None


def _find_label_with_data_right(df, keywords, numeric=False):
    for r in range(min(_SCAN_MAX_ROW, df.shape[0])):
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            val = df.iat[r, c]
            if pd.isna(val):
                continue
            text = str(val)
            if not any(kw in text for kw in keywords):
                continue
            for cc in range(c + 1, min(_SCAN_MAX_COL, df.shape[1])):
                v = df.iat[r, cc]
                if pd.isna(v) or str(v).strip() == '':
                    continue
                if numeric:
                    try:
                        float(v)
                        return r, c
                    except (ValueError, TypeError):
                        continue
                else:
                    return r, c
    return None


def _find_first_non_empty_right(df, row, start_col):
    for c in range(start_col + 1, min(_SCAN_MAX_COL, df.shape[1])):
        val = df.iat[row, c]
        if pd.isna(val) or str(val).strip() == '':
            continue
        return val
    return None


def _find_first_numeric_right(df, row, start_col):
    for c in range(start_col + 1, min(_SCAN_MAX_COL, df.shape[1])):
        val = df.iat[row, c]
        if pd.isna(val) or str(val).strip() == '':
            continue
        try:
            return float(val)
        except (ValueError, TypeError):
            continue
    return None


def _find_label_with_value_below(df, keywords):
    for r in range(min(_SCAN_MAX_ROW - 1, df.shape[0] - 1)):
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            val = df.iat[r, c]
            if pd.isna(val):
                continue
            text = str(val)
            if not any(kw in text for kw in keywords):
                continue
            below = df.iat[r + 1, c]
            if pd.isna(below):
                continue
            try:
                count = int(round(float(below)))
                if count > 0:
                    return r, c, count
            except (ValueError, TypeError):
                continue
    return None


_MATRIX_SHEET_HINTS = [
    '등록표', '발주표', '솔라 시스템',
    'project information', 'solar system', 'registration form',
]


def _sheet_has_output_label(xls, sname):
    try:
        df = xls.parse(sheet_name=sname, header=None)
        for r in range(min(_SCAN_MAX_ROW, df.shape[0])):
            for c in range(min(_SCAN_MAX_COL, df.shape[1])):
                val = df.iat[r, c]
                if pd.isna(val):
                    continue
                text = str(val)
                if '총 출력량' not in text:
                    continue
                for cc in range(c + 1, min(_SCAN_MAX_COL, df.shape[1])):
                    v = df.iat[r, cc]
                    if pd.isna(v) or str(v).strip() == '':
                        continue
                    try:
                        float(v)
                        return True
                    except (ValueError, TypeError):
                        continue
    except Exception:
        pass
    return False


def _find_matrix_sheet(matrix_file):
    xls = pd.ExcelFile(matrix_file)
    candidates = []
    for sname in xls.sheet_names:
        df = xls.parse(sheet_name=sname, header=None, nrows=3)
        if df.empty or df.shape[0] < 2:
            continue
        matched = False
        for r in range(min(3, df.shape[0])):
            for c in range(min(5, df.shape[1])):
                val = df.iat[r, c]
                if pd.isna(val):
                    continue
                text = str(val)
                if any(hint in text.lower() if hint.isascii() else hint in text for hint in _MATRIX_SHEET_HINTS):
                    matched = True
                    break
            if matched:
                break
        if matched:
            candidates.append(sname)
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]
    for sname in candidates:
        if _sheet_has_output_label(xls, sname):
            return sname
    return candidates[0]


def _find_multi_array_header(df):
    for r in range(min(_SCAN_MAX_ROW, df.shape[0])):
        row_vals = []
        for c in range(min(_SCAN_MAX_COL, df.shape[1])):
            val = df.iat[r, c]
            row_vals.append(str(val).strip().lower() if not pd.isna(val) else '')
        no_col = None
        row_col = None
        col_col = None
        table_qty_col = None
        modules_col = None
        missing_col = None
        for c, text in enumerate(row_vals):
            if 'no' in text or '#' in text:
                if no_col is None:
                    no_col = c
            if ('row' in text and 'table' in text) or ('행' in text and '배열' not in text.replace(' ', '')):
                row_col = c
            if ('column' in text and 'table' in text) or ('열' in text and '배열' not in text.replace(' ', '') and '규칙' not in text):
                if col_col is None:
                    col_col = c
            if ('table' in text and 'qty' in text and 'module' not in text) or ('배열갯수' in text and '\n' not in text) or ('배열' in text and '\n' not in text and ('갯수' in text or ('组' in text and '규칙' not in text))):
                if table_qty_col is None:
                    table_qty_col = c
            if ('module' in text and 'qty' in text) or ('modules' in text and 'qty' in text):
                modules_col = c
            if '缺板' in text or ('배열규칙' in text and '규칙' in text) or '同组排布规律' in text:
                missing_col = c
        if row_col is not None and col_col is not None:
            return {
                'header_row': r,
                'no_col': no_col,
                'row_col': row_col,
                'col_col': col_col,
                'table_qty_col': table_qty_col,
                'modules_col': modules_col,
                'missing_col': missing_col,
            }
    return None


def _parse_multi_arrays(df, header_info):
    header_row = header_info['header_row']
    arrays = []
    for r in range(header_row + 1, min(_SCAN_MAX_ROW, df.shape[0])):
        no_val = df.iat[r, header_info['no_col']] if header_info['no_col'] is not None else None
        if no_val is None or (isinstance(no_val, str) and no_val.strip() == ''):
            continue
        row_val = df.iat[r, header_info['row_col']] if header_info['row_col'] is not None else None
        col_val = df.iat[r, header_info['col_col']] if header_info['col_col'] is not None else None
        if pd.isna(row_val) or pd.isna(col_val):
            continue
        try:
            rows = int(round(float(row_val)))
            cols = int(round(float(col_val)))
        except (ValueError, TypeError):
            continue
        if rows <= 0 or cols <= 0:
            continue
        table_qty = None
        if header_info['table_qty_col'] is not None:
            tq_val = df.iat[r, header_info['table_qty_col']]
            if not pd.isna(tq_val):
                try:
                    tq = int(round(float(tq_val)))
                    if tq > 0:
                        table_qty = tq
                except (ValueError, TypeError):
                    pass
        modules = rows * cols * (table_qty if table_qty else 1)
        modules_col = header_info.get('modules_col')
        if modules_col is not None:
            explicit_modules = _scan_right_for_positive_int(df, r, modules_col, max_offset=4)
            if explicit_modules is not None:
                modules = explicit_modules
        no_text = str(no_val).strip() if not pd.isna(no_val) else ''
        missing_total = 0
        missing_col_idx = header_info.get('missing_col')
        if missing_col_idx is not None:
            m_val = df.iat[r, missing_col_idx]
            if not pd.isna(m_val):
                try:
                    missing_total = int(round(float(m_val)))
                except (ValueError, TypeError):
                    pass
        if missing_total == 0 and modules_col is not None:
            raw_mod = df.iat[r, modules_col]
            if not pd.isna(raw_mod):
                try:
                    mv = float(raw_mod)
                    if mv < 0:
                        missing_total = int(round(mv))
                except (ValueError, TypeError):
                    pass
        arrays.append({
            'no': no_text,
            'rows': rows,
            'cols': cols,
            'table_qty': table_qty,
            'modules': modules,
            'base_count': table_qty if table_qty else 1,
            'missing_per_table': missing_total,
        })
    return arrays


def _scan_right_for_positive_int(df, row, start_col, max_offset=4):
    for offset in range(max_offset + 1):
        c = start_col + offset
        if c >= df.shape[1]:
            break
        val = df.iat[row, c]
        if pd.isna(val) or str(val).strip() == '':
            continue
        try:
            n = int(round(float(val)))
            if n > 0:
                return n
        except (ValueError, TypeError):
            continue
    return None


def _try_parse_multi_array_format(df):
    header_info = _find_multi_array_header(df)
    if header_info is None:
        return None
    arrays = _parse_multi_arrays(df, header_info)
    if not arrays:
        return None
    set_count = len(arrays)
    total_modules = sum(a['modules'] for a in arrays)
    first = arrays[0]
    return {
        'set_count': set_count,
        'array_rows': first['rows'],
        'array_cols': first['cols'],
        'total_modules': total_modules,
        'arrays': arrays,
    }


def extract_matrix_data(matrix_file):
    try:
        target_sheet = _find_matrix_sheet(matrix_file)
        df = read_excel_compat(matrix_file, sheet_name=target_sheet if target_sheet else 0, header=None)
    except Exception as exc:
        raise ValueError(f'读取阵列表失败: {exc}') from exc

    pos = _find_label_with_data_right(df, ['프로젝트', '项目', 'Project Name'], numeric=False)
    if pos is None:
        raise ValueError('阵列表中未找到项目名称标签（프로젝트/项目/Project Name）')
    raw = _find_first_non_empty_right(df, pos[0], pos[1])
    if raw is None:
        raise ValueError('阵列表中项目名称标签右侧无数据')
    project_name = str(raw).strip()

    pos = _find_label_with_data_right(df, ['총 출력량', '总发电量', 'Power (total)', 'Power(total)'], numeric=True)
    if pos is None:
        raise ValueError('阵列表中未找到总发电量标签（총 출력량/总发电量/Power (total)）')
    output_kw = _find_first_numeric_right(df, pos[0], pos[1])
    if output_kw is None:
        raise ValueError('阵列表中总发电量标签右侧无数值')

    multi_array = _try_parse_multi_array_format(df)
    if multi_array is not None:
        set_count = multi_array['set_count']
        array_rows = multi_array['array_rows']
        array_cols = multi_array['array_cols']
        arrays = multi_array['arrays']
    else:
        result = _find_label_with_value_below(df, ['배열갯수'])
        if result is None:
            raise ValueError('阵列表中未找到有效的组数（배열갯수标签下方无数值，也未检测到多阵列格式）')
        header_row, set_col, set_count = result
        array_rows = None
        array_cols = None
        header_text_list = [
            (c, str(df.iat[header_row, c]) if not pd.isna(df.iat[header_row, c]) else '')
            for c in range(min(_SCAN_MAX_COL, df.shape[1]))
        ]

        for c, text in header_text_list:
            if c == set_col:
                continue
            has_korean_row = '행' in text
            has_chinese_row = '行' in text
            has_korean_col = '열' in text
            has_chinese_col = '列' in text
            if has_korean_row and has_chinese_row:
                data_row = header_row + 1
                if data_row < df.shape[0]:
                    val = df.iat[data_row, c]
                    if not pd.isna(val):
                        try:
                            array_rows = int(round(float(val)))
                        except (ValueError, TypeError):
                            pass
            elif has_korean_col and has_chinese_col:
                data_row = header_row + 1
                if data_row < df.shape[0]:
                    val = df.iat[data_row, c]
                    if not pd.isna(val):
                        try:
                            array_cols = int(round(float(val)))
                        except (ValueError, TypeError):
                            pass
        if array_rows is not None and array_cols is not None:
            arrays = []
            for i in range(set_count):
                arrays.append({
                    'no': str(i + 1),
                    'rows': array_rows,
                    'cols': array_cols,
                    'table_qty': 1,
                    'modules': array_rows * array_cols,
                    'base_count': 1,
                    'missing_per_table': 0,
                })
        else:
            arrays = None

    _raw_wind = _extract_label_value(df, ['최대풍속', '最大风速', 'Max Wind Speed'])
    if _raw_wind is not None:
        import re as _re
        _has_wind_unit = bool(_re.search(r'[a-zA-Z/／㎡]', _raw_wind))
        if not _has_wind_unit:
            try:
                float(_raw_wind)
                _raw_wind = f"{_raw_wind}m/s"
            except (ValueError, TypeError):
                pass

    _raw_snow = _extract_label_value(df, ['최대적설량', '最大积雪量', 'Max Snow Load'])
    if _raw_snow is not None:
        import re as _re
        _has_snow_unit = bool(_re.search(r'[a-zA-Z/／㎡]', _raw_snow))
        if not _has_snow_unit:
            try:
                float(_raw_snow)
                _raw_snow = f"{_raw_snow}kN/㎡"
            except (ValueError, TypeError):
                pass

    _raw_angle = _extract_label_value(df, ['설치각도', '安装角度', 'Installation Angle'])
    if _raw_angle:
        _raw_angle = str(_raw_angle).replace('°', '').replace('℃', '').strip()
        _m = re.search(r'(\d+(?:\.\d+)?)', _raw_angle)
        if _m:
            _n = float(_m.group(1))
            _raw_angle = str(int(_n)) if _n == int(_n) else str(_n)

    result = {
        'project_name': project_name,
        'output_kw': output_kw,
        'output_wp': int(round(output_kw * 1000)),
        'set_count': set_count,
        'array_rows': array_rows,
        'array_cols': array_cols,
        'max_wind_speed': _raw_wind,
        'max_snow_load': _raw_snow,
        'module_wattage': _extract_label_numeric(df, ['모듈출력량', '瓦数', 'Power *']),
        'module_size': _extract_label_value(df, ['사이즈', '尺寸', 'Size']),
        'installation_location': _extract_label_value(df, ['설치지역', '安装地点', 'Installation Site']),
        'angle': _raw_angle,
    }
    if arrays is not None:
        result['arrays'] = arrays
        result['total_modules'] = sum(a['modules'] for a in arrays)
    return result


def _extract_label_value(df, keywords):
    pos = _find_label_with_data_right(df, keywords, numeric=False)
    if pos is None:
        return None
    val_col = None
    raw = None
    for c in range(pos[1] + 1, min(_SCAN_MAX_COL, df.shape[1])):
        v = df.iat[pos[0], c]
        if pd.isna(v) or str(v).strip() == '':
            continue
        raw = v
        val_col = c
        break
    if raw is None:
        return None
    text = str(raw).strip()
    try:
        float(text)
        is_pure_number = True
    except (ValueError, TypeError):
        is_pure_number = False
    if is_pure_number and val_col is not None:
        for c in range(val_col + 1, min(val_col + 3, df.shape[1])):
            v = df.iat[pos[0], c]
            if pd.isna(v) or str(v).strip() == '':
                continue
            suffix = str(v).strip()
            if len(suffix) > 12:
                break
            text = text + suffix
            break
    return text


def _extract_label_numeric(df, keywords):
    pos = _find_label_with_data_right(df, keywords, numeric=True)
    if pos is None:
        return None
    val = _find_first_numeric_right(df, pos[0], pos[1])
    return int(round(val)) if val is not None else None
