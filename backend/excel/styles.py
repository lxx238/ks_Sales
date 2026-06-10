from openpyxl.styles import Alignment, Border, Font, PatternFill, Side


THIN_SIDE = Side(style='thin', color='000000')
THIN_BORDER = Border(left=THIN_SIDE, right=THIN_SIDE, top=THIN_SIDE, bottom=THIN_SIDE)
CENTER_ALIGNMENT = Alignment(horizontal='center', vertical='center', wrap_text=True)
HEADER_FILL = PatternFill(fill_type='solid', fgColor='D9EAF7')
HEADER_FONT = Font(bold=True)
CURRENCY_NUMBER_FORMAT = '"US$"#,##0.00'
