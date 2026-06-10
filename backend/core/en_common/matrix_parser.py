import math
import re

from backend.excel.reader import excel_file_compat


def _extract_number(text):
    if text is None:
        return None
    text = str(text).strip()
    m = re.search(r'[\d.]+', text)
    return float(m.group()) if m else None


def _safe_str(val):
    if val is None:
        return ''
    return str(val).strip()


def extract_matrix_data(file_path):
    xls = excel_file_compat(file_path)
    sheet_names = xls.sheet_names
    ws = None
    for sn in sheet_names:
        df = xls.parse(sheet_name=sn, header=None)
        if df.empty:
            continue
        val = _safe_str(df.iloc[0, 0] if df.shape[1] > 0 else '')
        if val.lower() == 'quotation':
            ws = df
            break
    if ws is None:
        for sn in sheet_names:
            df = xls.parse(sheet_name=sn, header=None)
            if not df.empty:
                ws = df
                break
    if ws is None:
        ws = xls.parse(sheet_name=sheet_names[0], header=None)

    total_rows = len(ws)
    ncols = ws.shape[1]

    project_name = ''
    max_wind_speed = ''
    max_snow_load = ''
    module_wattage = 0
    module_size = ''
    module_quantity = 0
    total_capacity = 0
    angle = 0
    layout_str = ''
    arrays = []

    for r in range(total_rows):
        if ncols < 14:
            continue
        a_val = _safe_str(ws.iloc[r, 0])
        d_val = _safe_str(ws.iloc[r, 3]) if ncols > 3 else ''
        h_val = _safe_str(ws.iloc[r, 7]) if ncols > 7 else ''
        k_val = _safe_str(ws.iloc[r, 10]) if ncols > 10 else ''

        if 'Project Name' in a_val:
            if d_val:
                project_name = d_val
            else:
                for ci in range(1, min(ncols, 14)):
                    v = _safe_str(ws.iloc[r, ci])
                    if v:
                        project_name = v
                        break

        if 'Snow Load' in a_val:
            max_snow_load = d_val

        if 'Wind Load' in a_val:
            max_wind_speed = d_val

        if 'Installation Angle' in a_val:
            _angle_num = _extract_number(d_val)
            angle = int(_angle_num) if _angle_num is not None else 0

        if 'Solar Module Dimension' in h_val:
            module_size = k_val

        if 'Solar Module Capacity' in h_val:
            _num = _extract_number(k_val)
            module_wattage = int(_num) if _num is not None else 0

        if 'Solar Module Quantity' in h_val:
            _num = _extract_number(k_val)
            module_quantity = int(_num) if _num is not None else 0

        if 'Total Capacity' in h_val:
            _num = _extract_number(k_val)
            total_capacity = int(_num) if _num is not None else 0

        if 'Layout' in h_val:
            layout_str = k_val

    if layout_str:
        arrays = _parse_layout_string(layout_str)

    return {
        'project_name': project_name,
        'output_kw': round(total_capacity / 1000, 3) if total_capacity else None,
        'output_wp': total_capacity if total_capacity else None,
        'set_count': sum(a.get('table_qty', 1) for a in arrays) if arrays else 0,
        'array_rows': arrays[0]['rows'] if arrays else 0,
        'array_cols': arrays[0]['cols'] if arrays else 0,
        'max_wind_speed': max_wind_speed,
        'max_snow_load': max_snow_load,
        'module_wattage': module_wattage,
        'module_size': module_size,
        'panel_weight': '',
        'angle': angle,
        'arrays': arrays,
    }


def _parse_layout_string(layout_str):
    layout_str = layout_str.replace('×', 'x').replace('×', 'x').replace('*', 'x')
    arrays = []
    pattern = r'(\d+)\s*row\s*x\s*(\d+)\s*column\s*of\s*(\d+)\s*table'
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
