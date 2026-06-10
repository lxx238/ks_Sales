from pathlib import Path


def merge_cells_range(worksheet, cell_range):
    worksheet.merge_cells(cell_range)


def build_output_path(output_dir, filename):
    return str(Path(output_dir) / filename)


def apply_currency_format(cell, format_code='"US$"#,##0.00'):
    cell.number_format = format_code
