from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
from openpyxl.drawing.image import Image as XlImage
from openpyxl.worksheet.page import PageMargins
import os
from decimal import Decimal

from backend.core.shared.price_utils import round_to_2_decimal

SM_FONT = Font(name='Yu Gothic UI', size=8)
SM_FONT_BOLD = Font(name='Yu Gothic UI', size=8, bold=True)
SM_FONT_BOLD_10 = Font(name='Yu Gothic UI', size=10, bold=True)
SM_FONT_HEADER = Font(name='Yu Gothic UI', size=8, bold=True)
SM_FONT_RED = Font(name='Yu Gothic UI', size=8, bold=True, color='FF0000')
SM_FONT_RED_10 = Font(name='Yu Gothic UI', size=10, bold=True, color='FF0000')

THIN_BORDER = Border(
    left=Side(style='thin'), right=Side(style='thin'),
    top=Side(style='thin'), bottom=Side(style='thin'),
)
THICK_SIDE = Side(style='medium', color='000000')

CENTER = Alignment(horizontal='center', vertical='center', wrap_text=True)
RIGHT_A = Alignment(horizontal='right', vertical='center', wrap_text=True)
LEFT_A = Alignment(horizontal='left', vertical='center', wrap_text=True)

NUM_FMT = '"US$" #,##0.00'
NUM_FMT = '#,##0.00'

BLUE_FILL = PatternFill(start_color='DAEEF3', end_color='DAEEF3', fill_type='solid')
ORANGE_FILL = PatternFill(start_color='F3D4A9', end_color='F3D4A9', fill_type='solid')
HEADER_FILL = PatternFill(start_color='D9E1F2', end_color='D9E1F2', fill_type='solid')
GREEN_FILL = PatternFill(start_color='E2EFDA', end_color='E2EFDA', fill_type='solid')

SUMMARY_COL_WIDTHS = {
    'A': 6, 'B': 6.5, 'C': 6.5, 'D': 9, 'E': 8,
    'F': 8, 'G': 12, 'H': 12, 'I': 15, 'J': 12, 'K': 12,
}
def create_normal_summary_sheet(workbook, detail_results, matrix_data=None,
                                 image_path=None, fence_data=None,
                                 normal_params=None, nv_fence_gate_data=None,
                                 pile_summary=None,
                                 image_temp_dir=None, image_cache=None):
    from datetime import datetime

    normal_params = normal_params or {}
    discount_rate_pct = normal_params.get('discount_rate', 71)
    fence_discount_rate = normal_params.get('fence_discount_rate', 94)
    consumption_tax_pct = normal_params.get('consumption_tax', 10)
    tariff_rate_pct = normal_params.get('tariff_rate', 3)
    shipping_fee = normal_params.get('shipping_fee', 0)

    ws = workbook.create_sheet(title='合計')

    for col, width in SUMMARY_COL_WIDTHS.items():
        ws.column_dimensions[col].width = width

    center = CENTER
    right_a = RIGHT_A
    left_a = LEFT_A
    thin_border = THIN_BORDER

    matrix_data = matrix_data or {}
    project_name = str(matrix_data.get('project_name') or '').strip()
    output_kw = matrix_data.get('output_kw') or 0
    module_wattage = matrix_data.get('module_wattage') or 0

    fence_data = fence_data or {}

    _base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    _logo = os.path.join(_base_dir, 'input', '集团标2.png')
    logo_to_use = _logo if os.path.isfile(_logo) else image_path
    if logo_to_use and os.path.isfile(str(logo_to_use)):
        try:
            img = XlImage(str(logo_to_use))
            img.width = 151
            img.height = 67
            ws.add_image(img, 'A1')
        except Exception:
            pass

    ws['I1'] = '見積日：'
    ws['I1'].font = SM_FONT
    ws['I1'].alignment = right_a
    ws.merge_cells('J1:K1')
    ws['J1'] = datetime.now().date()
    ws['J1'].font = SM_FONT
    ws['J1'].number_format = 'yyyy"年"m"月"d"日"'
    ws['J1'].alignment = center
    ws.row_dimensions[1].height = 25

    ws['D2'] = '架台御見積書'
    ws.merge_cells('D2:J2')
    ws['D2'].font = Font(name='Yu Gothic UI', size=16, bold=True)
    ws['D2'].alignment = center
    ws.row_dimensions[2].height = 40

    ws['A3'] = '案件名：'
    ws['A3'].font = SM_FONT
    ws['A3'].alignment = left_a
    ws.merge_cells('A3:B3')
    ws.merge_cells('C3:H3')
    ws['C3'] = project_name
    ws['C3'].font = SM_FONT
    ws['C3'].alignment = left_a
    if output_kw:
        ws['J3'] = output_kw
        ws['J3'].font = SM_FONT
        ws['J3'].alignment = right_a
    ws['K3'] = 'KW'
    ws['K3'].font = SM_FONT
    ws['K3'].alignment = center

    ws['A4'] = '見積条件：'
    ws['A4'].font = SM_FONT
    ws['A4'].alignment = left_a
    ws.merge_cells('A4:B4')
    ws.merge_cells('C4:H4')
    mitsumori_condition = normal_params.get('mitsumori_condition', '')
    if mitsumori_condition:
        ws['C4'] = mitsumori_condition
        ws['C4'].font = SM_FONT
        ws['C4'].alignment = left_a

    ws['A5'] = '納入期限：'
    ws['A5'].font = SM_FONT
    ws['A5'].alignment = left_a
    ws.merge_cells('A5:B5')
    ws['C5'] = '発注後10-14日間後工場から出荷'
    ws['C5'].font = SM_FONT
    ws['C5'].alignment = left_a
    ws.merge_cells('C5:H5')

    ws['A6'] = '取引条件：'
    ws['A6'].font = SM_FONT
    ws['A6'].alignment = left_a
    ws.merge_cells('A6:B6')
    ws['C6'] = '取引基本契約書に基づく'
    ws['C6'].font = SM_FONT
    ws['C6'].alignment = left_a
    ws.merge_cells('C6:H6')

    ws['A7'] = '有効期限：'
    ws['A7'].font = SM_FONT
    ws['A7'].alignment = left_a
    ws.merge_cells('A7:B7')
    ws['C7'] = '御見積後1日間'
    ws['C7'].font = SM_FONT
    ws['C7'].alignment = left_a
    ws.merge_cells('C7:H7')

    r8 = 8
    ws[f'A{r8}'] = '一、架台本体金額（Ex Works）'
    ws[f'A{r8}'].font = SM_FONT_BOLD_10
    ws[f'A{r8}'].alignment = left_a
    ws.merge_cells(f'A{r8}:K{r8}')
    ws.row_dimensions[r8].height = 25
    thin_s = Side(style='thin')
    ws.cell(row=r8, column=1).border = Border(left=THICK_SIDE, top=THICK_SIDE, right=thin_s, bottom=thin_s)
    for c in range(2, 12):
        ws.cell(row=r8, column=c).border = Border(left=thin_s, top=THICK_SIDE, right=THICK_SIDE if c == 11 else thin_s, bottom=thin_s)

    r9 = r8 + 1
    ws[f'A{r9}'] = '序号'
    ws[f'A{r9}'].font = SM_FONT_HEADER
    ws[f'A{r9}'].alignment = center

    ws.merge_cells(f'B{r9}:C{r9}')
    ws[f'B{r9}'] = 'パネル数'
    ws[f'B{r9}'].font = SM_FONT_HEADER
    ws[f'B{r9}'].alignment = center

    ws[f'D{r9}'] = 'セット数'
    ws[f'D{r9}'].font = SM_FONT_HEADER
    ws[f'D{r9}'].alignment = center

    ws[f'E{r9}'] = 'パワコン'
    ws[f'E{r9}'].font = SM_FONT_HEADER
    ws[f'E{r9}'].alignment = center

    ws[f'F{r9}'] = '角度'
    ws[f'F{r9}'].font = SM_FONT_HEADER
    ws[f'F{r9}'].alignment = center

    ws[f'G{r9}'] = '発電量（KW）'
    ws[f'G{r9}'].font = SM_FONT_HEADER
    ws[f'G{r9}'].alignment = center

    ws[f'H{r9}'] = '単価(USD)/基'
    ws[f'H{r9}'].font = SM_FONT_HEADER
    ws[f'H{r9}'].alignment = center

    ws[f'I{r9}'] = '特別値引き後金額'
    ws[f'I{r9}'].font = SM_FONT_HEADER
    ws[f'I{r9}'].alignment = center
    ws[f'I{r9}'].fill = BLUE_FILL

    ws[f'J{r9}'] = '総金額(USD)'
    ws[f'J{r9}'].font = SM_FONT_HEADER
    ws[f'J{r9}'].alignment = center

    ws[f'K{r9}'] = 'W単価(USD)'
    ws[f'K{r9}'].font = SM_FONT_HEADER
    ws[f'K{r9}'].alignment = center
    ws.row_dimensions[r9].height = 25

    data_row_start = r9 + 1
    grand_total = Decimal('0')

    for i, detail in enumerate(detail_results):
        row = data_row_start + i
        ws.row_dimensions[row].height = 20
        arr = detail.get('array_info', {})
        base_count = arr.get('table_qty', 1)
        panel_count = arr.get('rows', 0) * arr.get('cols', 0)
        detail_config = detail.get('config') or {}
        info_missing = arr.get('missing_per_table', 0) or 0
        bom_missing = detail_config.get('missing_boards', 0) or 0
        missing_boards = info_missing if info_missing else (bom_missing // base_count if base_count and bom_missing else bom_missing)
        note = arr.get('note') or ''

        ws.cell(row=row, column=1, value=i + 1).font = SM_FONT
        ws.cell(row=row, column=1).alignment = center
        ws.cell(row=row, column=2, value=arr.get('rows', 0)).font = SM_FONT
        ws.cell(row=row, column=2).alignment = center
        ws.cell(row=row, column=3, value=arr.get('cols', 0)).font = SM_FONT
        ws.cell(row=row, column=3).alignment = center
        ws.cell(row=row, column=4, value=base_count).font = SM_FONT
        ws.cell(row=row, column=4).alignment = center
        missing_val = missing_boards if missing_boards else '/'
        ws.cell(row=row, column=5, value=missing_val).font = SM_FONT
        ws.cell(row=row, column=5).alignment = center
        angle = detail.get('angle', '')
        angle_clean = str(angle).rstrip('°').strip() if angle else ''
        angle_text = f'{angle_clean}°' if angle_clean else ''
        ws.cell(row=row, column=6, value=angle_text).font = SM_FONT
        ws.cell(row=row, column=6).alignment = center
        ws.cell(row=row, column=7, value=f'=(B{row}*C{row}-{missing_boards})*D{row}*{module_wattage}/1000').font = SM_FONT
        ws.cell(row=row, column=7).alignment = center
        ws.cell(row=row, column=7).number_format = '#,##0.00'

        detail_sheet_name = detail.get('sheet_name', '')
        sub_total_row = detail.get('sub_total_row', 24)
        ws.cell(row=row, column=8, value=f"='{detail_sheet_name}'!I{sub_total_row}").font = SM_FONT
        ws.cell(row=row, column=8).number_format = '#,##0.00'
        ws.cell(row=row, column=8).alignment = center
        ws.cell(row=row, column=9, value=f'=H{row}*{discount_rate_pct}/100').font = SM_FONT
        ws.cell(row=row, column=9).number_format = '#,##0.00'
        ws.cell(row=row, column=9).alignment = center
        ws.cell(row=row, column=9).fill = BLUE_FILL
        ws.cell(row=row, column=10, value=f'=I{row}*D{row}').font = SM_FONT
        ws.cell(row=row, column=10).number_format = '#,##0.00'
        ws.cell(row=row, column=10).alignment = center
        ws.cell(row=row, column=11, value=f'=J{row}/G{row}/1000').font = SM_FONT
        ws.cell(row=row, column=11).number_format = '#,##0.00'
        ws.cell(row=row, column=11).alignment = center

        for c in range(1, 12):
            ws.cell(row=row, column=c).border = thin_border

    data_end = data_row_start + len(detail_results) - 1

    r_sub = data_end + 1
    ws[f'A{r_sub}'] = '架台総金額(USD)'
    ws[f'A{r_sub}'].font = SM_FONT
    ws[f'A{r_sub}'].alignment = right_a
    ws.merge_cells(f'A{r_sub}:H{r_sub}')
    ws[f'K{r_sub}'] = f'=SUM(J{data_row_start}:J{data_end})'
    ws[f'K{r_sub}'].font = SM_FONT
    ws[f'K{r_sub}'].alignment = center
    ws[f'K{r_sub}'].number_format = NUM_FMT
    for c in range(1, 12):
        ws.cell(row=r_sub, column=c).fill = BLUE_FILL

    r_pile = r_sub + 1

    pile_label = 'スクリュー杭'

    ws[f'A{r_pile}'] = pile_label
    ws[f'A{r_pile}'].font = SM_FONT
    ws[f'A{r_pile}'].alignment = center
    ws.merge_cells(f'A{r_pile}:C{r_pile}')
    ws[f'D{r_pile}'] = '単価(USD)'
    ws[f'D{r_pile}'].font = SM_FONT
    ws[f'D{r_pile}'].alignment = center
    ws.merge_cells(f'E{r_pile}:G{r_pile}')
    ws[f'H{r_pile}'] = '数量'
    ws[f'H{r_pile}'].font = SM_FONT
    ws[f'H{r_pile}'].alignment = center
    ws[f'J{r_pile}'] = '総金額(USD)'
    ws[f'J{r_pile}'].font = SM_FONT
    ws[f'J{r_pile}'].alignment = center

    pile_qty_parts = []
    pile_amt_parts = []
    for d in detail_results:
        ps = d.get('pile_data_start_row', 0)
        pe = d.get('pile_data_end_row', 0)
        sn = d.get('sheet_name', '')
        tqty = d.get('array_info', {}).get('table_qty', 1)
        if ps and pe and sn:
            pile_qty_parts.append(f"SUM('{sn}'!H{ps}:H{pe})*{tqty}")

    if pile_summary:
        _ps_qty = pile_summary.get('total_qty', 0)
        _ps_price = pile_summary.get('total_price', 0)
        ws[f'E{r_pile}'] = f'=IF(I{r_pile}=0,"",K{r_pile}/I{r_pile})'
        ws[f'E{r_pile}'].font = SM_FONT
        ws[f'E{r_pile}'].alignment = center
        ws[f'E{r_pile}'].number_format = NUM_FMT
        ws[f'I{r_pile}'] = int(_ps_qty) if _ps_qty == int(_ps_qty) else _ps_qty
        ws[f'I{r_pile}'].font = SM_FONT
        ws[f'I{r_pile}'].alignment = center
        ws[f'K{r_pile}'] = _ps_price
        ws[f'K{r_pile}'].font = SM_FONT
        ws[f'K{r_pile}'].alignment = center
        ws[f'K{r_pile}'].number_format = NUM_FMT
    elif pile_qty_parts:
        qty_formula = '+'.join(pile_qty_parts)
        amt_formula = '+'.join(pile_amt_parts)
        ws[f'E{r_pile}'] = f'=IF(I{r_pile}=0,"",K{r_pile}/I{r_pile})'
        ws[f'E{r_pile}'].font = SM_FONT
        ws[f'E{r_pile}'].alignment = center
        ws[f'E{r_pile}'].number_format = NUM_FMT
        ws[f'I{r_pile}'] = f'={qty_formula}'
        ws[f'I{r_pile}'].font = SM_FONT
        ws[f'I{r_pile}'].alignment = center
        ws[f'K{r_pile}'] = f'={amt_formula}'
        ws[f'K{r_pile}'].font = SM_FONT
        ws[f'K{r_pile}'].alignment = center
        ws[f'K{r_pile}'].number_format = NUM_FMT
    else:
        ws[f'E{r_pile}'].font = SM_FONT
        ws[f'E{r_pile}'].alignment = center
        ws[f'E{r_pile}'].number_format = NUM_FMT
        ws[f'I{r_pile}'] = 0
        ws[f'I{r_pile}'].font = SM_FONT
        ws[f'I{r_pile}'].alignment = center
        ws[f'K{r_pile}'] = 0
        ws[f'K{r_pile}'].font = SM_FONT
        ws[f'K{r_pile}'].alignment = center
        ws[f'K{r_pile}'].number_format = NUM_FMT

    r_1 = r_pile + 1
    ws[f'A{r_1}'] = '①架台＋杭本体　総金額(USD)'
    ws[f'A{r_1}'].font = SM_FONT
    ws[f'A{r_1}'].alignment = right_a
    ws.merge_cells(f'A{r_1}:H{r_1}')
    ws[f'J{r_1}'] = f'=K{r_sub}+K{r_pile}'
    ws[f'J{r_1}'].font = SM_FONT
    ws[f'J{r_1}'].alignment = center
    ws[f'J{r_1}'].number_format = '#,##0.00'
    ws.row_dimensions[r_1].height = 20

    r_kw = r_1 + 1
    ws[f'A{r_kw}'] = '発電量(KW)'
    ws[f'A{r_kw}'].font = SM_FONT
    ws[f'A{r_kw}'].alignment = right_a
    ws.merge_cells(f'A{r_kw}:H{r_kw}')
    ws[f'J{r_kw}'] = f'=SUM(G{data_row_start}:G{data_end})'
    ws[f'J{r_kw}'].font = SM_FONT
    ws[f'J{r_kw}'].alignment = center
    ws[f'J{r_kw}'].number_format = '#,##0.00'
    ws.row_dimensions[r_kw].height = 20

    r_wp = r_kw + 1
    ws[f'A{r_wp}'] = 'ワットあたりの価格'
    ws[f'A{r_wp}'].font = SM_FONT
    ws[f'A{r_wp}'].alignment = right_a
    ws.merge_cells(f'A{r_wp}:H{r_wp}')
    ws[f'J{r_wp}'] = f'=J{r_1}/J{r_kw}/1000'
    ws[f'J{r_wp}'].font = SM_FONT
    ws[f'J{r_wp}'].alignment = center
    ws[f'J{r_wp}'].number_format = '#,##0.00'
    ws.row_dimensions[r_wp].height = 20

    ws['J3'] = f'=J{r_kw}'
    ws['J3'].font = SM_FONT
    ws['J3'].alignment = right_a

    r_fence = r_wp + 1
    nv_fgg = nv_fence_gate_data or {}
    fence_data = fence_data or {}
    fence_title_text = '二、フェンス金額'

    detail_fence_rows = []
    detail_gate_rows = []
    fence_height_mm = ''
    fence_len_m = 0
    fence_color_jp = '白色'
    gate_type_label = '片開き門'
    GATE_TYPE_LABEL_MAP = {
        'single': '片開き門', 'double': '両開き門',
        'sliding': '引き戸', 'folding': '折りたたみ扉',
        'telescopic': '伸縮門', 'custom': 'カスタム門',
    }

    def _resolve_gate_label(style_code):
        if not style_code or len(style_code) < 6:
            return '片開き門'
        prefix = style_code[:3].lower()
        w_code = style_code[3:6]
        if prefix.startswith('tl'):
            gt = 'sliding'
        elif prefix.startswith('tf'):
            gt = 'folding'
        elif prefix.startswith('tx'):
            gt = 'custom'
        elif w_code == '120':
            gt = 'single'
        else:
            gt = 'double'
        return GATE_TYPE_LABEL_MAP.get(gt, '片開き門')

    gate_qty_val = 0
    fence_subtotal_amount = Decimal('0')

    multi_fences = nv_fgg.get('fences') if isinstance(nv_fgg, dict) else None
    multi_gates = nv_fgg.get('gates') if isinstance(nv_fgg, dict) else None

    if nv_fgg and (multi_fences or multi_gates):
        fence_color_jp = '白色'
        fence_surface = nv_fgg.get('surface', '白色')
        if fence_surface and '茶' in fence_surface:
            fence_color_jp = '茶色'

        if multi_fences:
            for fi, f_sec in enumerate(multi_fences):
                f_rows = f_sec.get('rows', [])
                detail_fence_rows.extend(f_rows)
                f_len = int(float(f_sec.get('totalLength', 0) or 0))
                if fi == 0:
                    fence_len_m = f_len
                else:
                    fence_len_m += f_len
                f_style = f_sec.get('style', '')
                if fi == 0 and f_style and '-' in f_style:
                    parts = f_style.split('-')
                    height_code = parts[-1] if parts else ''
                    if height_code:
                        try:
                            fence_height_mm = str(int(height_code) * 10)
                        except (ValueError, TypeError):
                            fence_height_mm = ''

        if multi_gates:
            for gi, g_sec in enumerate(multi_gates):
                g_rows = g_sec.get('rows', [])
                detail_gate_rows.extend(g_rows)
                g_style = g_sec.get('gateStyle', '')
                g_qty = int(g_sec.get('gateQty', 0) or 0)
                gate_qty_val += g_qty
                g_color = g_sec.get('gateColor', '')
                if g_color:
                    fence_color_jp = g_color
                if g_style and len(g_style) >= 6:
                    gate_type_label = _resolve_gate_label(g_style)

        fence_amount_raw = Decimal('0')
        if detail_fence_rows:
            fence_amount_raw += Decimal(str(sum(r.get('amount', 0) for r in detail_fence_rows)))
        if detail_gate_rows:
            fence_amount_raw += Decimal(str(sum(r.get('amount', 0) for r in detail_gate_rows)))
        fence_subtotal_amount = fence_amount_raw

    elif nv_fgg:
        fence_section = nv_fgg.get('fence') or {}
        gate_section = nv_fgg.get('gate') or {}
        f_rows = fence_section.get('rows', [])
        g_rows = gate_section.get('rows', [])
        detail_fence_rows = f_rows
        detail_gate_rows = g_rows
        fence_style = fence_section.get('style', '')
        fence_surface = fence_section.get('surface', '白色')
        fence_color_jp = '茶色' if '茶' in fence_surface else '白色'
        fence_len_m = int(float(fence_section.get('totalLength', 0) or 0))

        if fence_style and '-' in fence_style:
            parts = fence_style.split('-')
            height_code = parts[-1] if parts else ''
            if height_code:
                try:
                    fence_height_mm = str(int(height_code) * 10)
                except (ValueError, TypeError):
                    fence_height_mm = ''

        gate_style_code = gate_section.get('gateStyle', '')
        gate_qty_val = int(gate_section.get('gateQty', 0) or 0)
        gate_color = gate_section.get('gateColor', '')
        if gate_color:
            fence_color_jp = gate_color
        if gate_style_code and len(gate_style_code) >= 6:
            gate_type_label = _resolve_gate_label(gate_style_code)

        fence_amount_raw = Decimal('0')
        if f_rows:
            fence_amount_raw += Decimal(str(sum(r.get('amount', 0) for r in f_rows)))
        if g_rows:
            fence_amount_raw += Decimal(str(sum(r.get('amount', 0) for r in g_rows)))
        fence_subtotal_amount = fence_amount_raw

    elif fence_data:
        fence_length = str(fence_data.get('length', 140)).replace('M', '').replace('m', '').strip()
        try:
            fence_len_m = int(float(fence_length or '0'))
        except (ValueError, TypeError):
            fence_len_m = 0

    ws[f'A{r_fence}'] = fence_title_text
    ws[f'A{r_fence}'].font = SM_FONT_BOLD_10
    ws[f'A{r_fence}'].alignment = left_a
    ws.merge_cells(f'A{r_fence}:K{r_fence}')
    ws.row_dimensions[r_fence].height = 25
    for c in range(1, 12):
        ws.cell(row=r_fence, column=c).fill = ORANGE_FILL

    r_fs = r_fence + 1
    height_display = f'H{fence_height_mm}' if fence_height_mm else 'H'
    has_fence = fence_subtotal_amount > 0

    fence_detail_info = None
    if detail_fence_rows or detail_gate_rows:
        try:
            from backend.core.ja_nv.quotation_engine import _create_fence_detail_sheet
            fence_detail_info = _create_fence_detail_sheet(workbook, detail_fence_rows, detail_gate_rows, nv_fgg,
                                       matrix_data=matrix_data, nv_params=normal_params,
                                       image_temp_dir=image_temp_dir, image_cache=image_cache)
        except Exception as e:
            print(f"   ⚠ フェンス物料明細シート生成失敗: {e}")

    fence_discount_ref = ''
    if has_fence and fence_detail_info and fence_detail_info.get('discount_total_row'):
        ds_name = fence_detail_info.get('sheet_name', '').replace("'", "''")
        ds_row = fence_detail_info['discount_total_row']
        fence_discount_ref = f"'{ds_name}'!I{ds_row}"

    fence_desc = f'フェンス {height_display}  {fence_len_m}M  {gate_type_label}{gate_qty_val}セット  {fence_color_jp}'
    ws[f'A{r_fs}'] = fence_desc
    ws[f'A{r_fs}'].font = SM_FONT
    ws[f'A{r_fs}'].alignment = left_a
    ws.merge_cells(f'A{r_fs}:J{r_fs}')
    if fence_discount_ref:
        ws[f'K{r_fs}'] = f'={fence_discount_ref}'
    else:
        ws[f'K{r_fs}'] = float(fence_subtotal_amount) if fence_subtotal_amount > 0 else 0
    ws[f'K{r_fs}'].font = SM_FONT
    ws[f'K{r_fs}'].alignment = center
    ws[f'K{r_fs}'].number_format = NUM_FMT
    for c in range(1, 12):
        ws.cell(row=r_fs, column=c).border = thin_border
        ws.cell(row=r_fs, column=c).fill = ORANGE_FILL

    r_ddp_title = r_fs + 1
    normal_mitsumori_label = '三、DDP現場（船便）' if mitsumori_condition == 'DDP' else '三、CIF'
    ws[f'A{r_ddp_title}'] = normal_mitsumori_label
    ws[f'A{r_ddp_title}'].font = SM_FONT_BOLD_10
    ws[f'A{r_ddp_title}'].alignment = left_a
    ws.merge_cells(f'A{r_ddp_title}:K{r_ddp_title}')
    ws.row_dimensions[r_ddp_title].height = 25

    r_ddp_tax = r_ddp_title + 1
    ws[f'A{r_ddp_tax}'] = f'フェンス+架台 製品金額＊{consumption_tax_pct + tariff_rate_pct}％（消費税{consumption_tax_pct}%＋関税{tariff_rate_pct}%）'
    ws[f'A{r_ddp_tax}'].font = SM_FONT
    ws[f'A{r_ddp_tax}'].alignment = right_a
    ws.merge_cells(f'A{r_ddp_tax}:I{r_ddp_tax}')
    ws.merge_cells(f'J{r_ddp_tax}:K{r_ddp_tax}')
    if has_fence and fence_discount_ref:
        ws[f'J{r_ddp_tax}'] = f'=J{r_1}*{(consumption_tax_pct + tariff_rate_pct) / 100}+{fence_discount_ref}*{consumption_tax_pct / 100}'
    else:
        ws[f'J{r_ddp_tax}'] = f'=J{r_1}*{(consumption_tax_pct + tariff_rate_pct) / 100}'
    ws[f'J{r_ddp_tax}'].font = SM_FONT
    ws[f'J{r_ddp_tax}'].alignment = center
    ws[f'J{r_ddp_tax}'].number_format = NUM_FMT
    ws.row_dimensions[r_ddp_tax].height = 20

    r_ddp_ship = r_ddp_tax + 1
    ws[f'A{r_ddp_ship}'] = 'フェンス+架台 現場までの全て費用\n4Tユニック 配送'
    ws[f'A{r_ddp_ship}'].font = SM_FONT
    ws[f'A{r_ddp_ship}'].alignment = right_a
    ws.merge_cells(f'A{r_ddp_ship}:I{r_ddp_ship}')
    ws.merge_cells(f'J{r_ddp_ship}:K{r_ddp_ship}')
    ws[f'J{r_ddp_ship}'] = shipping_fee
    ws[f'J{r_ddp_ship}'].font = SM_FONT
    ws[f'J{r_ddp_ship}'].alignment = center
    ws[f'J{r_ddp_ship}'].number_format = NUM_FMT
    ws.row_dimensions[r_ddp_ship].height = 30

    r_ddp_total = r_ddp_ship + 1
    ws[f'A{r_ddp_total}'] = 'フェンス+架台 総金額(USD)'
    ws[f'A{r_ddp_total}'].font = SM_FONT_RED_10
    ws[f'A{r_ddp_total}'].alignment = right_a
    ws.merge_cells(f'A{r_ddp_total}:I{r_ddp_total}')
    ws.merge_cells(f'J{r_ddp_total}:K{r_ddp_total}')
    if has_fence and fence_discount_ref:
        ws[f'J{r_ddp_total}'] = f'=J{r_1}+{fence_discount_ref}+J{r_ddp_tax}+J{r_ddp_ship}'
    else:
        ws[f'J{r_ddp_total}'] = f'=J{r_1}+J{r_ddp_tax}+J{r_ddp_ship}'
    ws[f'J{r_ddp_total}'].font = SM_FONT
    ws[f'J{r_ddp_total}'].alignment = center
    ws[f'J{r_ddp_total}'].number_format = NUM_FMT
    ws.row_dimensions[r_ddp_total].height = 20

    for rr in range(r_ddp_title, r_ddp_total + 1):
        for c in range(1, 12):
            ws.cell(row=rr, column=c).fill = GREEN_FILL
    for rr in range(r_ddp_title, r_ddp_total + 1):
        for c in range(1, 12):
            ws.cell(row=rr, column=c).fill = GREEN_FILL
    
    # ========== 新的边框设置（参考成功代码） ==========
    table_start = r8
    table_end = r_ddp_total
    left_col = 1
    right_col = 11
    
    thin_side = Side(style='thin', color='000000')
    thick_side = Side(style='medium', color='000000')
    
    # 1. 先设置所有内部细边框（跳过合并单元格的非起始单元格）
    for row in range(table_start, table_end + 1):
        for col in range(left_col, right_col + 1):
            cell = ws.cell(row=row, column=col)
            # 检查是否是合并单元格中的非起始单元格
            is_skip = False
            for merged_range in ws.merged_cells.ranges:
                if cell.coordinate in merged_range and cell.coordinate != merged_range.start_cell.coordinate:
                    is_skip = True
                    break
            if not is_skip:
                cell.border = Border(
                    left=thin_side, right=thin_side,
                    top=thin_side, bottom=thin_side
                )
    
    # 2. 设置左侧粗边框
    for row in range(table_start, table_end + 1):
        target_cell = ws.cell(row=row, column=left_col)
        # 如果是合并单元格，取起始单元格
        for merged_range in ws.merged_cells.ranges:
            if target_cell.coordinate in merged_range:
                target_cell = merged_range.start_cell
                break
        old_border = target_cell.border
        if old_border is None:
            old_border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
        target_cell.border = Border(
            left=thick_side,
            right=old_border.right,
            top=old_border.top,
            bottom=old_border.bottom
        )
    
    # 3. 设置右侧粗边框
    for row in range(table_start, table_end + 1):
        target_cell = ws.cell(row=row, column=right_col)
        for merged_range in ws.merged_cells.ranges:
            if target_cell.coordinate in merged_range:
                target_cell = merged_range.start_cell
                break
        old_border = target_cell.border
        if old_border is None:
            old_border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
        target_cell.border = Border(
            left=old_border.left,
            right=thick_side,
            top=old_border.top,
            bottom=old_border.bottom
        )
    
    # 4. 设置顶部粗边框
    for col in range(left_col, right_col + 1):
        target_cell = ws.cell(row=table_start, column=col)
        for merged_range in ws.merged_cells.ranges:
            if target_cell.coordinate in merged_range:
                target_cell = merged_range.start_cell
                break
        old_border = target_cell.border
        if old_border is None:
            old_border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
        target_cell.border = Border(
            left=old_border.left,
            right=old_border.right,
            top=thick_side,
            bottom=old_border.bottom
        )
    
    # 5. 设置底部粗边框
    for col in range(left_col, right_col + 1):
        target_cell = ws.cell(row=table_end, column=col)
        for merged_range in ws.merged_cells.ranges:
            if target_cell.coordinate in merged_range:
                target_cell = merged_range.start_cell
                break
        old_border = target_cell.border
        if old_border is None:
            old_border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
        target_cell.border = Border(
            left=old_border.left,
            right=old_border.right,
            top=old_border.top,
            bottom=thick_side
        )
            

    sheet_names = workbook.sheetnames
    if '合計' in sheet_names:
        idx = sheet_names.index('合計')
        workbook.move_sheet('合計', offset=-idx)

    ws.page_setup.orientation = 'portrait'
    ws.page_setup.paperSize = 9
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.page_margins = PageMargins(top=0.75, bottom=0.75, left=0.7, right=0.7, header=0.3, footer=0.3)

    return ws.title
