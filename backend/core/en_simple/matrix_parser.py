import math
import re

from backend.excel.reader import excel_file_compat


def _safe_int_from_raw(raw, default=0):
    if raw is None:
        return default
    try:
        f = float(raw)
        return default if math.isnan(f) else int(f)
    except (ValueError, TypeError, OverflowError):
        return default


def _extract_number(text):
    if text is None:
        return None
    text = str(text).strip()
    m = re.search(r'[\d.]+', text)
    return float(m.group()) if m else None


def _parse_common_layout(layout_str):
    layout_str = layout_str.replace('\u00d7', 'x').replace('\u00d7', 'x').replace('*', 'x')
    arrays = []
    pattern = r'(\d+)\s*row\s*x\s*(\d+)\s*(?:column|col)\s*x?\s*(\d+)\s*table'
    for m in re.finditer(pattern, layout_str, re.IGNORECASE):
        arrays.append({
            'no': str(len(arrays) + 1),
            'rows': int(m.group(1)),
            'cols': int(m.group(2)),
            'table_qty': int(m.group(3)),
            'note': '',
        })
    if not arrays:
        pattern2 = r'(\d+)\s*row.*?(\d+)\s*col.*?(\d+)\s*table'
        for m in re.finditer(pattern2, layout_str, re.IGNORECASE):
            arrays.append({
                'no': str(len(arrays) + 1),
                'rows': int(m.group(1)),
                'cols': int(m.group(2)),
                'table_qty': int(m.group(3)),
                'note': '',
            })
    return arrays


def extract_matrix_data(file_path):
    xls = excel_file_compat(file_path)
    sheet_names = xls.sheet_names
    ws = None
    for sn in sheet_names:
        df = xls.parse(sheet_name=sn, header=None)
        if df.empty:
            continue
        val = str(df.iloc[0, 0] if df.shape[1] > 0 else '').strip()
        if 'kseng' in val.lower() or 'solar' in str(df.iloc[2, 0] if df.shape[1] > 0 and df.shape[0] > 2 else '').lower():
            ws = df
            break
    if ws is None:
        ws = xls.parse(sheet_name=sheet_names[0], header=None)

    total_rows = len(ws)

    quotation_no = ''
    project_name = ''
    max_wind_speed = ''
    max_snow_load = ''
    ground_clearance = ''
    module_wattage = 0
    panel_weight = ''
    module_size = ''
    angle = 0
    arrays = []

    for r in range(total_rows):
        if ws.shape[1] < 9:
            continue
        a_val = str(ws.iloc[r, 0] if ws.shape[1] > 0 else '').strip()
        b_val = str(ws.iloc[r, 1] if ws.shape[1] > 1 else '').strip()

        if 'Project Name' in a_val:
            _pn = str(ws.iloc[r, 1] if ws.shape[1] > 1 else '').strip()
            if not _pn or _pn == 'nan':
                _pn = str(ws.iloc[r, 3] if ws.shape[1] > 3 else '').strip()
            if _pn and _pn != 'nan':
                project_name = _pn

        if 'Quotation NO' in a_val or 'Quotation NO' in str(ws.iloc[r, 5] if ws.shape[1] > 5 else ''):
            for _qc in (6, 7, 8, 9, 10):
                if ws.shape[1] > _qc:
                    _qv = str(ws.iloc[r, _qc]).strip()
                    if _qv and _qv != 'nan' and _qv != '0':
                        quotation_no = _qv
                        break
            if not quotation_no and r + 1 < total_rows:
                _r1_c11 = str(ws.iloc[r + 1, 11]).strip() if ws.shape[1] > 11 else ''
                _is_example = '\u8303\u4f8b' in _r1_c11 or 'example' in _r1_c11.lower()
                if not _is_example:
                    for _qc in (12, 13, 14):
                        if ws.shape[1] > _qc:
                            _qv = str(ws.iloc[r + 1, _qc]).strip()
                            if _qv and _qv != 'nan' and _qv != '0':
                                quotation_no = _qv
                                break

        if 'Max Wind Speed' in b_val:
            max_wind_speed = str(ws.iloc[r, 2] if ws.shape[1] > 2 else '').strip()

        if 'Max Snow Load' in b_val:
            max_snow_load = str(ws.iloc[r, 2] if ws.shape[1] > 2 else '').strip()

        if b_val.startswith('Power') and 'total' not in b_val.lower():
            raw = ws.iloc[r, 2] if ws.shape[1] > 2 else None
            module_wattage = _safe_int_from_raw(raw, 0)

        if a_val.startswith('Panel Information'):
            d_val = str(ws.iloc[r, 3] if ws.shape[1] > 3 else '').strip()
            if 'Weight' in str(d_val):
                panel_weight = str(ws.iloc[r, 4] if ws.shape[1] > 4 else '').strip()

        if b_val.startswith('Size'):
            module_size = str(ws.iloc[r, 2] if ws.shape[1] > 2 else '').strip()

        if 'Installation Angle' in b_val:
            raw = ws.iloc[r, 4] if ws.shape[1] > 4 else None
            _angle_num = _extract_number(raw)
            angle = int(_angle_num) if _angle_num is not None else 0

        _a_upper = a_val.upper()
        if 'GROUND CLEARANCE' in _a_upper:
            _gc_raw = ''
            for _gc_col in [1, 3, 2]:
                if ws.shape[1] > _gc_col:
                    _gc_candidate = str(ws.iloc[r, _gc_col]).strip()
                    if _gc_candidate and _gc_candidate != 'nan' and _gc_candidate != 'mm':
                        _gc_num_check = _extract_number(_gc_candidate)
                        if _gc_num_check is not None:
                            _gc_raw = _gc_candidate
                            break
            if _gc_raw:
                _gc_num = _extract_number(_gc_raw)
                ground_clearance = int(_gc_num) if _gc_num is not None else _gc_raw

        if 'SNOW LOAD' in _a_upper and not max_snow_load:
            _sl_raw = ''
            for _sl_col in [1, 3, 2]:
                if ws.shape[1] > _sl_col:
                    _sl_candidate = str(ws.iloc[r, _sl_col]).strip()
                    if _sl_candidate and _sl_candidate != 'nan' and _sl_candidate != '/' and _sl_candidate != 'mm':
                        _sl_raw = _sl_candidate
                        break
            if _sl_raw:
                max_snow_load = _sl_raw

        if 'WIND LOAD' in _a_upper and not max_wind_speed:
            _wl_raw = ''
            for _wl_col in [1, 3, 2]:
                if ws.shape[1] > _wl_col:
                    _wl_candidate = str(ws.iloc[r, _wl_col]).strip()
                    if _wl_candidate and _wl_candidate != 'nan' and _wl_candidate != '/' and _wl_candidate != 'mm':
                        _wl_raw = _wl_candidate
                        break
            if _wl_raw:
                max_wind_speed = _wl_raw

        if 'INSTALLATION ANGLE' in _a_upper and angle == 0:
            _ia_raw = str(ws.iloc[r, 3] if ws.shape[1] > 3 else '').strip()
            if _ia_raw and _ia_raw != 'nan':
                _ia_num = _extract_number(_ia_raw)
                if _ia_num is not None:
                    angle = int(_ia_num)

        h_val = str(ws.iloc[r, 7] if ws.shape[1] > 7 else '').strip()
        if ('LAYOUT' in _a_upper or 'LAYOUT' in h_val.upper()) and not arrays:
            _layout_raw = str(ws.iloc[r, 10] if ws.shape[1] > 10 else '').strip()
            if not _layout_raw or _layout_raw == 'nan':
                _layout_raw = str(ws.iloc[r, 3] if ws.shape[1] > 3 else '').strip()
            if _layout_raw and _layout_raw != 'nan':
                _parsed = _parse_common_layout(_layout_raw)
                if _parsed:
                    arrays = _parsed

        if 'SOLAR MODULE CAPACITY' in h_val.upper() and module_wattage == 0:
            _mw_raw = str(ws.iloc[r, 10] if ws.shape[1] > 10 else '').strip()
            if _mw_raw and _mw_raw != 'nan':
                _mw_num = _extract_number(_mw_raw)
                module_wattage = int(_mw_num) if _mw_num is not None else 0

        if 'SOLAR MODULE DIMENSION' in h_val.upper() and not module_size:
            _ms_raw = str(ws.iloc[r, 10] if ws.shape[1] > 10 else '').strip()
            if _ms_raw and _ms_raw != 'nan':
                module_size = _ms_raw

        if 'Array (Row*Column)' in b_val or 'Array (Row*Column)' in str(ws.iloc[r, 1] if ws.shape[1] > 1 else ''):
            data_row = r + 1
            while data_row < total_rows:
                no_val = ws.iloc[data_row, 4] if ws.shape[1] > 4 else None
                rows_val = ws.iloc[data_row, 5] if ws.shape[1] > 5 else None
                cols_val = ws.iloc[data_row, 6] if ws.shape[1] > 6 else None
                tables_val = ws.iloc[data_row, 7] if ws.shape[1] > 7 else None
                if not tables_val or str(tables_val).strip() == '' or (isinstance(tables_val, float) and math.isnan(tables_val)):
                    break
                _r = _safe_int_from_raw(rows_val, 0)
                _c = _safe_int_from_raw(cols_val, 0)
                _t = _safe_int_from_raw(tables_val, 0)
                if _r <= 0 or _c <= 0 or _t <= 0:
                    break
                arrays.append({
                    'no': str(no_val or '').strip(),
                    'rows': _r,
                    'cols': _c,
                    'table_qty': _t,
                    'note': '',
                })
                data_row += 1

    return {
        'quotation_no': quotation_no,
        'project_name': project_name,
        'output_kw': None,
        'output_wp': None,
        'set_count': len(arrays),
        'array_rows': arrays[0]['rows'] if arrays else 0,
        'array_cols': arrays[0]['cols'] if arrays else 0,
        'max_wind_speed': max_wind_speed,
        'max_snow_load': max_snow_load if max_snow_load and max_snow_load != 'nan' else '',
        'ground_clearance': ground_clearance if ground_clearance else 0,
        'module_wattage': module_wattage,
        'module_size': module_size,
        'panel_weight': panel_weight,
        'angle': angle,
        'arrays': arrays,
    }
