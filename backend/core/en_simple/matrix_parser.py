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
            project_name = str(ws.iloc[r, 1] if ws.shape[1] > 1 else '').strip()

        if 'Quotation NO' in a_val or 'Quotation NO' in str(ws.iloc[r, 5] if ws.shape[1] > 5 else ''):
            for _qc in (12, 13, 14, 2, 3):
                if ws.shape[1] > _qc:
                    _qv = str(ws.iloc[r + 1, _qc] if r + 1 < total_rows else '').strip()
                    if _qv and _qv != '0':
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
            break

    return {
        'quotation_no': quotation_no,
        'project_name': project_name,
        'output_kw': None,
        'output_wp': None,
        'set_count': len(arrays),
        'array_rows': arrays[0]['rows'] if arrays else 0,
        'array_cols': arrays[0]['cols'] if arrays else 0,
        'max_wind_speed': max_wind_speed,
        'max_snow_load': max_snow_load,
        'module_wattage': module_wattage,
        'module_size': module_size,
        'panel_weight': panel_weight,
        'angle': angle,
        'arrays': arrays,
    }
