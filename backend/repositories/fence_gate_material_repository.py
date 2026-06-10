from backend.config.settings import get_db_connection
from backend.utils.helpers import row_to_dict


TABLE = 'fence_gate_materials'

VALID_CATEGORIES = [
    '围栏配件', '围栏网片', '围栏立柱', '围栏地桩',
    '门配件', '门网片', '门地桩',
    '推拉门配件', '推拉门网片',
    '折叠门配件', '折叠门网片',
]


def _get_fence_db_connection():
    connection = get_db_connection()
    ensure_schema(connection)
    return connection


def ensure_schema(connection):
    connection.execute(
        f'''
        CREATE TABLE IF NOT EXISTS {TABLE} (
            code TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            name TEXT NOT NULL,
            spec TEXT DEFAULT '',
            price_usd REAL DEFAULT 0,
            price_rmb REAL DEFAULT 0,
            remark TEXT DEFAULT '',
            image_base64 TEXT DEFAULT '',
            price_3_5_usd REAL DEFAULT NULL
        )
        '''
    )
    columns = {row[1] for row in connection.execute(f'PRAGMA table_info({TABLE})').fetchall()}
    if 'image_base64' not in columns:
        connection.execute(f'ALTER TABLE {TABLE} ADD COLUMN image_base64 TEXT DEFAULT \'\'')
    if 'price_3_5_usd' not in columns:
        connection.execute(f'ALTER TABLE {TABLE} ADD COLUMN price_3_5_usd REAL DEFAULT NULL')
    if '日语名称' not in columns:
        connection.execute(f'ALTER TABLE {TABLE} ADD COLUMN "日语名称" TEXT DEFAULT \'\'')
    if '材質&表面処理（浸塑）' not in columns:
        connection.execute(f'ALTER TABLE {TABLE} ADD COLUMN "材質&表面処理（浸塑）" TEXT DEFAULT \'\'')
    if '材質&表面処理（热镀锌）' not in columns:
        connection.execute(f'ALTER TABLE {TABLE} ADD COLUMN "材質&表面処理（热镀锌）" TEXT DEFAULT \'\'')
    connection.commit()


def normalize(row):
    data = row_to_dict(row)
    if not data:
        return None
    result = {
        'code': str(data.get('code') or '').strip(),
        'category': str(data.get('category') or '').strip(),
        'name': str(data.get('name') or '').strip(),
        'spec': str(data.get('spec') or '').strip(),
        'price_usd': float(data.get('price_usd') or 0),
        'price_rmb': float(data.get('price_rmb') or 0),
        'remark': str(data.get('remark') or '').strip(),
        'image_base64': str(data.get('image_base64') or '').strip(),
        'price_3_5_usd': float(data['price_3_5_usd']) if data.get('price_3_5_usd') is not None else None,
        '日语名称': str(data.get('日语名称') or '').strip(),
        '材質表面処理_浸塑': str(data.get('材質&表面処理（浸塑）') or '').strip(),
        '材質表面処理_热镀锌': str(data.get('材質&表面処理（热镀锌）') or '').strip(),
    }
    known_db_columns = {
        'code', 'category', 'name', 'spec', 'price_usd', 'price_rmb',
        'remark', 'image_base64', 'price_3_5_usd',
        '日语名称', '材質&表面処理（浸塑）', '材質&表面処理（热镀锌）',
    }
    for key, value in data.items():
        if key not in known_db_columns:
            result[key] = value
    return result


def list_materials(category='', keyword='', page=1, page_size=50):
    connection = _get_fence_db_connection()
    try:
        clauses = []
        params = []
        category = str(category or '').strip()
        keyword = str(keyword or '').strip()
        if category:
            clauses.append('category = ?')
            params.append(category)
        if keyword:
            clauses.append('(code LIKE ? OR name LIKE ? OR spec LIKE ?)')
            kw = f'%{keyword}%'
            params.extend([kw, kw, kw])
        where = f'WHERE {" AND ".join(clauses)}' if clauses else ''

        total = connection.execute(f'SELECT COUNT(*) FROM {TABLE} {where}', params).fetchone()[0]
        offset = (page - 1) * page_size
        total_pages = (total + page_size - 1) // page_size if total > 0 else 0

        rows = connection.execute(
            f'SELECT * FROM {TABLE} {where} ORDER BY category, code LIMIT ? OFFSET ?',
            params + [page_size, offset],
        ).fetchall()

        return {
            'data': [normalize(r) for r in rows],
            'total': total,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
            'categories': VALID_CATEGORIES,
        }
    finally:
        connection.close()


def get_material(code):
    connection = _get_fence_db_connection()
    try:
        row = connection.execute(f'SELECT * FROM {TABLE} WHERE code = ?', (code,)).fetchone()
        return normalize(row)
    finally:
        connection.close()


def create_material(code, category, name, spec='', price_usd=0, price_rmb=0, remark='', image_base64='', price_3_5_usd=None, ja_name='', material_dip='', material_hd=''):
    connection = _get_fence_db_connection()
    try:
        existing = connection.execute(f'SELECT code FROM {TABLE} WHERE code = ?', (code,)).fetchone()
        if existing:
            raise ValueError(f'编码已存在: {code}')
        connection.execute(
            f'INSERT INTO {TABLE} (code, category, name, spec, price_usd, price_rmb, remark, image_base64, price_3_5_usd, "日语名称", "材質&表面処理（浸塑）", "材質&表面処理（热镀锌）") VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            (code, category, name, spec, price_usd, price_rmb, remark, image_base64, price_3_5_usd, ja_name, material_dip, material_hd),
        )
        connection.commit()
        return get_material(code)
    finally:
        connection.close()


def update_material(code, category=None, name=None, spec=None, price_usd=None, price_rmb=None, remark=None, image_base64=None, price_3_5_usd=None, ja_name=None, material_dip=None, material_hd=None):
    connection = _get_fence_db_connection()
    try:
        existing = connection.execute(f'SELECT * FROM {TABLE} WHERE code = ?', (code,)).fetchone()
        if not existing:
            raise LookupError(f'编码不存在: {code}')
        old = normalize(existing)
        connection.execute(
            f'''
            UPDATE {TABLE} SET category=?, name=?, spec=?, price_usd=?, price_rmb=?, remark=?, image_base64=?, price_3_5_usd=?, "日语名称"=?, "材質&表面処理（浸塑）"=?, "材質&表面処理（热镀锌）"=?
            WHERE code=?
            ''',
            (
                category if category is not None else old['category'],
                name if name is not None else old['name'],
                spec if spec is not None else old['spec'],
                price_usd if price_usd is not None else old['price_usd'],
                price_rmb if price_rmb is not None else old['price_rmb'],
                remark if remark is not None else old['remark'],
                image_base64 if image_base64 is not None else old['image_base64'],
                price_3_5_usd if price_3_5_usd is not None else old.get('price_3_5_usd'),
                ja_name if ja_name is not None else old.get('日语名称', ''),
                material_dip if material_dip is not None else old.get('材質表面処理_浸塑', ''),
                material_hd if material_hd is not None else old.get('材質表面処理_热镀锌', ''),
                code,
            ),
        )
        connection.commit()
        return get_material(code)
    finally:
        connection.close()


def delete_material(code):
    connection = _get_fence_db_connection()
    try:
        cursor = connection.execute(f'DELETE FROM {TABLE} WHERE code = ?', (code,))
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def bulk_upsert(materials):
    connection = _get_fence_db_connection()
    try:
        success = 0
        failed = []
        for m in materials:
            try:
                code = str(m.get('code') or '').strip()
                if not code:
                    failed.append({'code': '', 'reason': '编码不能为空'})
                    continue
                connection.execute(
                    f'''
                    INSERT OR REPLACE INTO {TABLE} (code, category, name, spec, price_usd, price_rmb, remark, image_base64, price_3_5_usd, "日语名称", "材質&表面処理（浸塑）", "材質&表面処理（热镀锌）")
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                    ''',
                    (
                        code,
                        str(m.get('category') or '').strip(),
                        str(m.get('name') or '').strip(),
                        str(m.get('spec') or '').strip(),
                        float(m.get('price_usd') or 0),
                        float(m.get('price_rmb') or 0),
                        str(m.get('remark') or '').strip(),
                        str(m.get('image_base64') or '').strip(),
                        float(m['price_3_5_usd']) if m.get('price_3_5_usd') is not None else None,
                        str(m.get('日语名称') or m.get('ja_name') or '').strip(),
                        str(m.get('材質&表面処理（浸塑）') or m.get('material_dip') or '').strip(),
                        str(m.get('材質&表面処理（热镀锌）') or m.get('material_hd') or '').strip(),
                    ),
                )
                success += 1
            except Exception as e:
                failed.append({'code': m.get('code', ''), 'reason': str(e)})
        connection.commit()
        return {'success': success, 'failed': failed}
    finally:
        connection.close()


def bulk_update_images(image_updates):
    connection = _get_fence_db_connection()
    try:
        updated = 0
        for item in image_updates or []:
            code = str((item or {}).get('code') or '').strip()
            image_base64 = str((item or {}).get('image_base64') or '').strip()
            if not code or not image_base64:
                continue
            cursor = connection.execute(
                f'UPDATE {TABLE} SET image_base64 = ? WHERE code = ?',
                (image_base64, code),
            )
            if cursor.rowcount > 0:
                updated += 1
        connection.commit()
        return updated
    finally:
        connection.close()


def list_all_codes():
    connection = _get_fence_db_connection()
    try:
        rows = connection.execute(f'SELECT code FROM {TABLE} ORDER BY code').fetchall()
        return [str(r['code'] or '').strip() for r in rows if str(r['code'] or '').strip()]
    finally:
        connection.close()


def list_all_records_raw():
    connection = _get_fence_db_connection()
    try:
        rows = connection.execute(f'SELECT * FROM {TABLE} ORDER BY category, code').fetchall()
        return [row_to_dict(r) for r in rows]
    finally:
        connection.close()


def list_image_records():
    connection = _get_fence_db_connection()
    try:
        rows = connection.execute(
            f"SELECT code, image_base64 FROM {TABLE} WHERE COALESCE(TRIM(image_base64), '') != ''"
        ).fetchall()
        return [row_to_dict(r) for r in rows]
    finally:
        connection.close()


def list_table_columns():
    connection = _get_fence_db_connection()
    try:
        rows = connection.execute(f'PRAGMA table_info({TABLE})').fetchall()
        return [str(row[1]) for row in rows if len(row) > 1]
    finally:
        connection.close()


def add_column(column_name):
    connection = _get_fence_db_connection()
    try:
        columns = {row[1] for row in connection.execute(f'PRAGMA table_info({TABLE})').fetchall()}
        if column_name in columns:
            raise ValueError(f'列 "{column_name}" 已存在')
        connection.execute(f'ALTER TABLE {TABLE} ADD COLUMN "{column_name}" TEXT')
        connection.commit()
        return column_name
    finally:
        connection.close()
