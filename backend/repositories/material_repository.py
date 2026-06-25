import json
import re

from backend.config.settings import get_db_connection as _get_shared_conn
from backend.image.processor import decode_image_base64
from backend.utils.constants import (
    ALUMINUM_CHANGE_REQUEST_TABLE,
    ALUMINUM_LIST_COLUMNS,
    API_TO_DB_FIELD_MAP,
    CHANGE_STATUS_PENDING,
    DB_CODE_COLUMN,
    DB_CODE_ATTRIBUTE_COLUMN,
    DB_ATTRIBUTE_COLUMN,
    DB_IMAGE_COLUMN,
    DB_IMAGE_BASE64_COLUMN,
    DB_MATERIAL_COLUMN,
    DB_NAME_COLUMN,
    DB_NAME_KO_COLUMN,
    DB_NAME_EN_COLUMN,
    DB_NAME_FR_COLUMN,
    DB_NAME_ES_COLUMN,
    DB_NAME_ZH_COLUMN,
    DB_NAME_JA_COLUMN,
    DB_PILE_15_18UM_CODE_COLUMN,
    DB_PILE_15_18UM_PRICE_EUR,
    DB_PILE_15_18UM_PRICE_RMB,
    DB_PILE_15_18UM_PRICE_USD,
    DB_PILE_15_18UM_TABLE,
    DB_PRICE_COLUMN,
    DB_PRICE_COLUMN_EN,
    DB_PRICING_ATTRIBUTE_COLUMN,
    DB_SPEC_COLUMN,
    DB_TABLE_NAME,
    DB_TO_API_FIELD_MAP,
    DB_UNIT_COLUMN,
    DB_WEIGHT_COLUMN,
)
from backend.utils.converters import normalize_lookup_code
from backend.utils.helpers import row_to_dict


def to_db_field_name(field_name):
    return API_TO_DB_FIELD_MAP.get(field_name, field_name)


def to_api_field_name(field_name):
    return DB_TO_API_FIELD_MAP.get(field_name, field_name)


def normalize_record_keys(record):
    normalized = {to_api_field_name(key): value for key, value in record.items()}
    normalize_image_fields(normalized)
    return normalized


def normalize_image_fields(record):
    image_value = record.get(DB_IMAGE_COLUMN)
    image_base64_value = record.get(DB_IMAGE_BASE64_COLUMN)
    invalid_image_values = {
        '',
        '??',
        DB_IMAGE_COLUMN,
        'null',
        'none',
        'nan',
    }
    invalid_image_base64_values = {
        '',
        '??_base64',
        DB_IMAGE_BASE64_COLUMN,
        'null',
        'none',
        'nan',
    }

    image_text = str(image_value or '').strip()
    if image_text.lower() in invalid_image_values or image_text in invalid_image_values:
        record[DB_IMAGE_COLUMN] = None

    image_base64_text = str(image_base64_value or '').strip()
    if image_base64_text.lower() in invalid_image_base64_values or image_base64_text in invalid_image_base64_values:
        record[DB_IMAGE_BASE64_COLUMN] = None

    normalized_data_url = normalize_image_data_url(record.get(DB_IMAGE_BASE64_COLUMN))
    if not normalized_data_url:
        normalized_data_url = normalize_image_data_url(record.get(DB_IMAGE_COLUMN))

    if normalized_data_url:
        record[DB_IMAGE_BASE64_COLUMN] = normalized_data_url
        image_text = str(record.get(DB_IMAGE_COLUMN) or '').strip()
        if image_text.startswith('data:image') or looks_like_raw_base64(image_text):
            record[DB_IMAGE_COLUMN] = None


def looks_like_raw_base64(value):
    text = re.sub(r'\s+', '', str(value or '').strip())
    if len(text) < 32:
        return False
    return bool(re.fullmatch(r'[A-Za-z0-9+/=]+', text))


def normalize_image_data_url(value):
    text = str(value or '').strip()
    if not text:
        return None

    image_bytes, image_ext, image_status = decode_image_base64(text)
    if image_status != 'ready':
        return None

    if text.startswith('data:image'):
        return text

    base64_text = re.sub(r'\s+', '', text.split('base64,', 1)[1] if 'base64,' in text else text)
    return f'data:image/{image_ext};base64,{base64_text}'


def get_db_connection():
    connection = _get_shared_conn()
    ensure_aluminum_schema(connection)
    return connection


def ensure_aluminum_schema(connection):
    columns = {
        row[1]
        for row in connection.execute(f'PRAGMA table_info({DB_TABLE_NAME})').fetchall()
    }
    if DB_IMAGE_BASE64_COLUMN not in columns:
        connection.execute(
            f'ALTER TABLE {DB_TABLE_NAME} ADD COLUMN "{DB_IMAGE_BASE64_COLUMN}" TEXT'
        )
        connection.commit()
    if DB_NAME_FR_COLUMN not in columns:
        connection.execute(
            f'ALTER TABLE {DB_TABLE_NAME} ADD COLUMN "{DB_NAME_FR_COLUMN}" TEXT'
        )
        connection.commit()
    if DB_NAME_ES_COLUMN not in columns:
        connection.execute(
            f'ALTER TABLE {DB_TABLE_NAME} ADD COLUMN "{DB_NAME_ES_COLUMN}" TEXT'
        )
        connection.commit()
    if DB_NAME_ZH_COLUMN not in columns:
        connection.execute(
            f'ALTER TABLE {DB_TABLE_NAME} ADD COLUMN "{DB_NAME_ZH_COLUMN}" TEXT'
        )
        connection.commit()


def ensure_change_request_table(connection):
    connection.execute(
        f'''
        CREATE TABLE IF NOT EXISTS {ALUMINUM_CHANGE_REQUEST_TABLE} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            target_code TEXT,
            requester TEXT NOT NULL,
            requester_role TEXT,
            status TEXT NOT NULL DEFAULT '{CHANGE_STATUS_PENDING}',
            submitted_at TEXT NOT NULL,
            reviewed_at TEXT,
            reviewed_by TEXT,
            review_note TEXT,
            payload_json TEXT,
            snapshot_json TEXT
        )
        '''
    )
    connection.execute(
        f'''
        CREATE INDEX IF NOT EXISTS idx_{ALUMINUM_CHANGE_REQUEST_TABLE}_status
        ON {ALUMINUM_CHANGE_REQUEST_TABLE} (status, submitted_at DESC)
        '''
    )
    connection.execute(
        f'''
        CREATE INDEX IF NOT EXISTS idx_{ALUMINUM_CHANGE_REQUEST_TABLE}_requester
        ON {ALUMINUM_CHANGE_REQUEST_TABLE} (requester, submitted_at DESC)
        '''
    )
    connection.commit()


def fetch_material_rows(material_codes, price_column=None, include_images=True):
    normalized_codes = [
        normalize_lookup_code(code)
        for code in material_codes
        if normalize_lookup_code(code)
    ]
    normalized_codes = list(dict.fromkeys(normalized_codes))
    if not normalized_codes:
        return []

    price_col = price_column or DB_PRICE_COLUMN
    connection = get_db_connection()
    try:
        matched_rows = []
        chunk_size = 500

        image_columns = ''
        if include_images:
            image_columns = f'''
                    "{DB_IMAGE_COLUMN}",
                    "{DB_IMAGE_BASE64_COLUMN}",'''

        for start in range(0, len(normalized_codes), chunk_size):
            code_chunk = normalized_codes[start:start + chunk_size]
            placeholders = ', '.join(['?' for _ in code_chunk])
            sql = f'''
                SELECT
                    "{DB_CODE_COLUMN}",
                    "{DB_NAME_COLUMN}",
                    "{DB_NAME_KO_COLUMN}",
                    "{DB_NAME_EN_COLUMN}",
                    "{DB_NAME_FR_COLUMN}",
                    "{DB_NAME_ES_COLUMN}",
                    "{DB_NAME_ZH_COLUMN}",
                    "{DB_NAME_JA_COLUMN}",
                    "{DB_UNIT_COLUMN}",
                    "{price_col}",
                    "{DB_CODE_ATTRIBUTE_COLUMN}",
                    "{DB_ATTRIBUTE_COLUMN}",
                    "{DB_PRICING_ATTRIBUTE_COLUMN}",
                    "{DB_WEIGHT_COLUMN}",{image_columns}
                    "{DB_MATERIAL_COLUMN}"
                FROM {DB_TABLE_NAME}
                WHERE UPPER(REPLACE(TRIM("{DB_CODE_COLUMN}"), ' ', '')) IN ({placeholders})
            '''
            matched_rows.extend(
                row_to_dict(row)
                for row in connection.execute(sql, code_chunk).fetchall()
            )
    finally:
        connection.close()

    return matched_rows


def fetch_material_images(material_codes):
    normalized_codes = [
        normalize_lookup_code(code)
        for code in material_codes
        if normalize_lookup_code(code)
    ]
    normalized_codes = list(dict.fromkeys(normalized_codes))
    if not normalized_codes:
        return {}

    connection = get_db_connection()
    try:
        image_rows = []
        chunk_size = 500

        for start in range(0, len(normalized_codes), chunk_size):
            code_chunk = normalized_codes[start:start + chunk_size]
            placeholders = ', '.join(['?' for _ in code_chunk])
            sql = f'''
                SELECT
                    "{DB_CODE_COLUMN}",
                    "{DB_IMAGE_COLUMN}",
                    "{DB_IMAGE_BASE64_COLUMN}"
                FROM {DB_TABLE_NAME}
                WHERE UPPER(REPLACE(TRIM("{DB_CODE_COLUMN}"), ' ', '')) IN ({placeholders})
            '''
            image_rows.extend(
                row_to_dict(row)
                for row in connection.execute(sql, code_chunk).fetchall()
            )
    finally:
        connection.close()

    result = {}
    for row in image_rows:
        db_code = str(row.get(DB_CODE_COLUMN) or '').strip()
        normalized_code = normalize_lookup_code(db_code)
        if not normalized_code:
            continue
        result[normalized_code] = {
            DB_IMAGE_COLUMN: row.get(DB_IMAGE_COLUMN),
            DB_IMAGE_BASE64_COLUMN: row.get(DB_IMAGE_BASE64_COLUMN),
        }
    return result


def build_list_where_clause(filters=None, search=''):
    filters = filters or {}
    clauses = []
    params = []

    keyword = str(filters.get('keyword') or search or '').strip()
    if keyword:
        search_pattern = f'%{keyword}%'
        clauses.append(
            (
                f'("{DB_CODE_COLUMN}" LIKE ? '
                f'OR "{DB_NAME_COLUMN}" LIKE ? '
                f'OR "{DB_NAME_KO_COLUMN}" LIKE ? '
                f'OR "{DB_SPEC_COLUMN}" LIKE ?)'
            )
        )
        params.extend([search_pattern] * 4)

    field_map = (
        ('code', DB_CODE_COLUMN),
        ('name', DB_NAME_COLUMN),
        ('name_ko', DB_NAME_KO_COLUMN),
        ('spec', DB_SPEC_COLUMN),
    )
    for filter_key, db_column in field_map:
        value = str(filters.get(filter_key) or '').strip()
        if not value:
            continue
        clauses.append(f'"{db_column}" LIKE ?')
        params.append(f'%{value}%')

    if not clauses:
        return '', params

    return f'WHERE {" AND ".join(clauses)}', params


def list_aluminum_records(page, page_size, search='', filters=None):
    connection = get_db_connection()
    cursor = connection.cursor()

    where_clause, params = build_list_where_clause(filters=filters, search=search)

    count_sql = f'SELECT COUNT(*) FROM {DB_TABLE_NAME} {where_clause}'
    cursor.execute(count_sql, params)
    total = cursor.fetchone()[0]

    offset = (page - 1) * page_size
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    column_names = ', '.join(
        f'"{db_column}" AS "{api_column}"'
        for db_column, api_column in ALUMINUM_LIST_COLUMNS
    )
    data_sql = (
        f'SELECT {column_names} FROM {DB_TABLE_NAME} {where_clause} '
        f'ORDER BY "{DB_CODE_COLUMN}" LIMIT ? OFFSET ?'
    )
    cursor.execute(data_sql, params + [page_size, offset])
    rows = cursor.fetchall()
    connection.close()

    return {
        'data': [normalize_record_keys(row_to_dict(row)) for row in rows],
        'total': total,
        'page': page,
        'page_size': page_size,
        'total_pages': total_pages,
    }


def list_all_aluminum_image_records():
    connection = get_db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            f'''
            SELECT
                "{DB_CODE_COLUMN}" AS "{DB_CODE_COLUMN}",
                "{DB_IMAGE_COLUMN}" AS "{DB_IMAGE_COLUMN}",
                "{DB_IMAGE_BASE64_COLUMN}" AS "{DB_IMAGE_BASE64_COLUMN}"
            FROM {DB_TABLE_NAME}
            WHERE COALESCE(TRIM("{DB_IMAGE_BASE64_COLUMN}"), '') != ''
               OR COALESCE(TRIM("{DB_IMAGE_COLUMN}"), '') != ''
            '''
        )
        return [row_to_dict(row) for row in cursor.fetchall()]
    finally:
        connection.close()


def list_all_aluminum_codes():
    connection = get_db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            f'''
            SELECT "{DB_CODE_COLUMN}" AS "{DB_CODE_COLUMN}"
            FROM {DB_TABLE_NAME}
            ORDER BY "{DB_CODE_COLUMN}"
            '''
        )
        rows = cursor.fetchall()
        return [
            str(row[DB_CODE_COLUMN] or '').strip()
            for row in rows
            if str(row[DB_CODE_COLUMN] or '').strip()
        ]
    finally:
        connection.close()


def list_all_aluminum_records_raw():
    connection = get_db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            f'''
            SELECT *
            FROM {DB_TABLE_NAME}
            ORDER BY "{DB_CODE_COLUMN}"
            '''
        )
        return [row_to_dict(row) for row in cursor.fetchall()]
    finally:
        connection.close()


def list_table_columns(table_name):
    connection = get_db_connection()
    try:
        rows = connection.execute(f'PRAGMA table_info({table_name})').fetchall()
        return [str(row[1]) for row in rows if len(row) > 1]
    finally:
        connection.close()


def list_all_change_requests_raw():
    connection = get_db_connection()
    try:
        ensure_change_request_table(connection)
        cursor = connection.cursor()
        cursor.execute(
            f'''
            SELECT *
            FROM {ALUMINUM_CHANGE_REQUEST_TABLE}
            ORDER BY
                CASE status
                    WHEN 'pending' THEN 0
                    WHEN 'approved' THEN 1
                    WHEN 'rejected' THEN 2
                    WHEN 'withdrawn' THEN 3
                    ELSE 4
                END,
                submitted_at DESC,
                id DESC
            '''
        )
        return [row_to_dict(row) for row in cursor.fetchall()]
    finally:
        connection.close()


def get_aluminum_record(record_id):
    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute(f'SELECT * FROM {DB_TABLE_NAME} WHERE "{DB_CODE_COLUMN}" = ?', (record_id,))
    row = cursor.fetchone()
    connection.close()
    return normalize_record_keys(row_to_dict(row)) if row else None


def auto_create_missing_records(missing_items):
    if not missing_items:
        return 0

    connection = get_db_connection()
    try:
        cursor = connection.cursor()
        inserted_count = 0
        insert_sql = (
            f'INSERT OR IGNORE INTO {DB_TABLE_NAME} '
            f'("{DB_CODE_COLUMN}", "{DB_NAME_COLUMN}", "{DB_SPEC_COLUMN}") '
            f'VALUES (?, ?, ?)'
        )
        for item in missing_items:
            code = str(item.get('code') or '').strip()
            name = str(item.get('name') or '').strip()
            spec = str(item.get('spec') or '').strip()
            if not code:
                continue
            cursor.execute(insert_sql, (code, name, spec))
            if cursor.rowcount > 0:
                inserted_count += 1
        connection.commit()
        return inserted_count
    finally:
        connection.close()


def create_aluminum_record(data):
    db_data = {to_db_field_name(key): value for key, value in data.items()}
    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute(f'SELECT COUNT(*) FROM {DB_TABLE_NAME} WHERE "{DB_CODE_COLUMN}" = ?', (db_data[DB_CODE_COLUMN],))
    if cursor.fetchone()[0] > 0:
        connection.close()
        raise ValueError('工程编码已存在')

    columns = list(db_data.keys())
    placeholders = ', '.join(['?' for _ in columns])
    column_names = ', '.join([f'"{column}"' for column in columns])
    sql = f'INSERT INTO {DB_TABLE_NAME} ({column_names}) VALUES ({placeholders})'
    cursor.execute(sql, list(db_data.values()))
    connection.commit()
    connection.close()


def update_aluminum_record(record_id, data):
    db_data = {to_db_field_name(key): value for key, value in data.items()}
    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute(f'SELECT COUNT(*) FROM {DB_TABLE_NAME} WHERE "{DB_CODE_COLUMN}" = ?', (record_id,))
    if cursor.fetchone()[0] == 0:
        connection.close()
        raise LookupError('记录不存在')

    if db_data:
        set_clause = ', '.join([f'"{column}" = ?' for column in db_data.keys()])
        sql = f'UPDATE {DB_TABLE_NAME} SET {set_clause} WHERE "{DB_CODE_COLUMN}" = ?'
        cursor.execute(sql, list(db_data.values()) + [record_id])

    connection.commit()
    connection.close()


def bulk_update_aluminum_images(image_updates):
    normalized_updates = []
    for item in image_updates or []:
        code = str((item or {}).get('code') or '').strip()
        image_base64 = str((item or {}).get('image_base64') or '').strip()
        if not code or not image_base64:
            continue
        normalized_updates.append((image_base64, '', code))

    if not normalized_updates:
        return 0

    connection = get_db_connection()
    try:
        cursor = connection.cursor()
        cursor.executemany(
            f'''
            UPDATE {DB_TABLE_NAME}
            SET "{DB_IMAGE_BASE64_COLUMN}" = ?,
                "{DB_IMAGE_COLUMN}" = ?
            WHERE "{DB_CODE_COLUMN}" = ?
            ''',
            normalized_updates,
        )
        connection.commit()
        return len(normalized_updates)
    finally:
        connection.close()


def delete_aluminum_record(record_id):
    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute(f'SELECT COUNT(*) FROM {DB_TABLE_NAME} WHERE "{DB_CODE_COLUMN}" = ?', (record_id,))
    if cursor.fetchone()[0] == 0:
        connection.close()
        raise LookupError('记录不存在')

    cursor.execute(f'DELETE FROM {DB_TABLE_NAME} WHERE "{DB_CODE_COLUMN}" = ?', (record_id,))
    connection.commit()
    connection.close()


def serialize_json(value):
    if value is None:
        return ''
    return json.dumps(value, ensure_ascii=False)


def deserialize_json(value, default=None):
    if value in (None, ''):
        return {} if default is None else default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return {} if default is None else default


def normalize_change_request_row(row):
    if not row:
        return None

    data = row_to_dict(row)
    data['payload'] = deserialize_json(data.pop('payload_json', ''), {})
    data['snapshot'] = deserialize_json(data.pop('snapshot_json', ''), {})
    return data


def create_change_request(action, target_code, requester, requester_role, submitted_at, payload=None, snapshot=None):
    connection = get_db_connection()
    try:
        ensure_change_request_table(connection)
        cursor = connection.cursor()
        cursor.execute(
            f'''
            INSERT INTO {ALUMINUM_CHANGE_REQUEST_TABLE} (
                action,
                target_code,
                requester,
                requester_role,
                status,
                submitted_at,
                payload_json,
                snapshot_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                action,
                target_code,
                requester,
                requester_role,
                CHANGE_STATUS_PENDING,
                submitted_at,
                serialize_json(payload),
                serialize_json(snapshot),
            ),
        )
        connection.commit()
        return cursor.lastrowid
    finally:
        connection.close()


def get_change_request(request_id):
    connection = get_db_connection()
    try:
        ensure_change_request_table(connection)
        cursor = connection.cursor()
        cursor.execute(
            f'SELECT * FROM {ALUMINUM_CHANGE_REQUEST_TABLE} WHERE id = ?',
            (request_id,),
        )
        row = cursor.fetchone()
        return normalize_change_request_row(row)
    finally:
        connection.close()


def list_change_requests(page, page_size, status='', requester=''):
    connection = get_db_connection()
    try:
        ensure_change_request_table(connection)
        cursor = connection.cursor()

        clauses = []
        params = []

        status = str(status or '').strip()
        requester = str(requester or '').strip()

        if status:
            clauses.append('status = ?')
            params.append(status)
        if requester:
            clauses.append('requester = ?')
            params.append(requester)

        where_clause = f'WHERE {" AND ".join(clauses)}' if clauses else ''

        count_sql = f'SELECT COUNT(*) FROM {ALUMINUM_CHANGE_REQUEST_TABLE} {where_clause}'
        cursor.execute(count_sql, params)
        total = cursor.fetchone()[0]

        offset = (page - 1) * page_size
        total_pages = (total + page_size - 1) // page_size if total > 0 else 0
        data_sql = (
            f'SELECT * FROM {ALUMINUM_CHANGE_REQUEST_TABLE} {where_clause} '
            'ORDER BY '
            "CASE status "
            "WHEN 'pending' THEN 0 "
            "WHEN 'approved' THEN 1 "
            "WHEN 'rejected' THEN 2 "
            "WHEN 'withdrawn' THEN 3 "
            "ELSE 4 END, "
            'submitted_at DESC, id DESC '
            'LIMIT ? OFFSET ?'
        )
        cursor.execute(data_sql, params + [page_size, offset])
        rows = cursor.fetchall()

        return {
            'data': [normalize_change_request_row(row) for row in rows],
            'total': total,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
        }
    finally:
        connection.close()


def update_change_request_status(request_id, status, reviewed_by='', review_note='', reviewed_at=''):
    connection = get_db_connection()
    try:
        ensure_change_request_table(connection)
        cursor = connection.cursor()
        cursor.execute(
            f'SELECT COUNT(*) FROM {ALUMINUM_CHANGE_REQUEST_TABLE} WHERE id = ?',
            (request_id,),
        )
        if cursor.fetchone()[0] == 0:
            raise LookupError('审核记录不存在')

        cursor.execute(
            f'''
            UPDATE {ALUMINUM_CHANGE_REQUEST_TABLE}
            SET status = ?,
                reviewed_by = ?,
                review_note = ?,
                reviewed_at = ?
            WHERE id = ?
            ''',
            (status, reviewed_by, review_note, reviewed_at, request_id),
        )
        connection.commit()
    finally:
        connection.close()


def fetch_pile_15_18um_prices():
    connection = get_db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            f'''
            SELECT "{DB_PILE_15_18UM_CODE_COLUMN}",
                   "{DB_PILE_15_18UM_PRICE_USD}",
                   "{DB_PILE_15_18UM_PRICE_EUR}",
                   "{DB_PILE_15_18UM_PRICE_RMB}"
            FROM "{DB_PILE_15_18UM_TABLE}"
            '''
        )
        rows = cursor.fetchall()
        result = {}
        for row in rows:
            code = str(row[0] or '').strip()
            if not code:
                continue
            price_usd = row[1]
            price_eur = row[2]
            price_rmb = row[3]
            try:
                result[normalize_lookup_code(code)] = {
                    'price_usd': float(price_usd) if price_usd is not None else None,
                    'price_eur': float(price_eur) if price_eur is not None else None,
                    'price_rmb': float(price_rmb) if price_rmb is not None else None,
                }
            except (TypeError, ValueError):
                continue
        return result
    finally:
        connection.close()
