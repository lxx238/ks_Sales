import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BASE_DIR))

from backend.config.settings import get_db_connection
from backend.repositories.quotation_log_repository import ensure_quotation_log_schema, TABLE

EXCEL_PATH = BASE_DIR / '报价使用统计.xlsx'


def main():
    import openpyxl

    if not EXCEL_PATH.exists():
        print(f'Excel file not found: {EXCEL_PATH}')
        sys.exit(1)

    wb = openpyxl.load_workbook(str(EXCEL_PATH), data_only=True)
    ws = wb['按组员明细']

    ensure_quotation_log_schema()
    conn = get_db_connection()

    inserted = 0
    skipped = 0

    try:
        for row in ws.iter_rows(min_row=2, values_only=True):
            seq, time_val, username, group_name, project_name, bom_filename, \
                case_type, match_str, sheet_count, duration_sec, status_str = row

            if seq is None or username is None or time_val is None:
                skipped += 1
                continue

            if str(seq).startswith('【') or '小计' in str(seq) or '小计' in str(username or ''):
                skipped += 1
                continue

            match_stats = {}
            if match_str and '/' in str(match_str):
                parts = str(match_str).split('/')
                try:
                    match_stats = {'success': int(parts[0]), 'total': int(parts[1])}
                except (ValueError, IndexError):
                    match_stats = {}

            status = 'success' if str(status_str) == '成功' else 'failed'
            duration_ms = int(float(duration_sec or 0) * 1000) if duration_sec else 0

            created_at = str(time_val)

            conn.execute(
                f'''INSERT INTO {TABLE} (
                    username, group_name, project_name, bom_filename, matrix_filename,
                    case_type, match_stats, output_file_ids, sheet_count, status,
                    error_message, duration_ms, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (
                    str(username or ''),
                    str(group_name or ''),
                    str(project_name or '').replace('\xa0', ' ').replace('\u200b', '').replace('\u3000', ' ').strip(),
                    str(bom_filename or ''),
                    '',
                    str(case_type or ''),
                    json.dumps(match_stats, ensure_ascii=False),
                    json.dumps([], ensure_ascii=False),
                    int(sheet_count or 0),
                    status,
                    '',
                    duration_ms,
                    created_at,
                ),
            )
            inserted += 1

        conn.commit()
    finally:
        conn.close()

    print(f'Done. Inserted: {inserted}, Skipped: {skipped}')


if __name__ == '__main__':
    main()
