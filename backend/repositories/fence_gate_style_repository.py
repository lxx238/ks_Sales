from backend.config.settings import get_db_connection
from backend.utils.helpers import row_to_dict


FENCE_TABLE = 'fence_styles'
GATE_TABLE = 'gate_styles'


def _get_fence_db_connection():
    connection = get_db_connection()
    ensure_fence_styles_schema(connection)
    ensure_gate_styles_schema(connection)
    return connection


def ensure_fence_styles_schema(connection):
    columns = {row[1] for row in connection.execute(f'PRAGMA table_info({FENCE_TABLE})').fetchall()}
    if 'mesh_code' in columns and 'mesh_code_30' not in columns:
        connection.execute("DROP TABLE IF EXISTS fence_styles")
        columns = set()
    if not columns:
        connection.execute(
            f'''
            CREATE TABLE IF NOT EXISTS {FENCE_TABLE} (
                code TEXT PRIMARY KEY,
                mesh_type TEXT NOT NULL,
                mesh_shape TEXT NOT NULL DEFAULT '折半圆',
                pipe_spec TEXT NOT NULL,
                base_type TEXT NOT NULL,
                height INTEGER NOT NULL,
                mesh_code_30 TEXT NOT NULL DEFAULT '',
                mesh_code_35 TEXT NOT NULL DEFAULT '',
                mesh_code_40 TEXT NOT NULL DEFAULT '',
                post_code TEXT NOT NULL,
                pile_code TEXT DEFAULT NULL,
                end_cap_code TEXT NOT NULL DEFAULT '',
                rubber_code TEXT DEFAULT NULL,
                buckle_qty INTEGER NOT NULL DEFAULT 2,
                image_base64 TEXT DEFAULT ''
            )
            '''
        )
        connection.commit()
        return
    for col, spec in [('mesh_shape', "TEXT NOT NULL DEFAULT '折半圆'"),
                       ('mesh_code_30', "TEXT NOT NULL DEFAULT ''"),
                       ('mesh_code_35', "TEXT NOT NULL DEFAULT ''"),
                       ('mesh_code_40', "TEXT NOT NULL DEFAULT ''"),
                       ('buckle_qty', "INTEGER NOT NULL DEFAULT 2"),
                       ('image_base64', "TEXT DEFAULT ''")]:
        if col not in columns:
            connection.execute(f"ALTER TABLE {FENCE_TABLE} ADD COLUMN {col} {spec}")
    connection.commit()


def ensure_gate_styles_schema(connection):
    columns = {row[1] for row in connection.execute(f'PRAGMA table_info({GATE_TABLE})').fetchall()}
    if 'mesh_base_code' not in columns and columns:
        connection.execute("DROP TABLE IF EXISTS gate_styles")
        columns = set()
    connection.execute(
        f'''
        CREATE TABLE IF NOT EXISTS {GATE_TABLE} (
            code TEXT PRIMARY KEY,
            gate_type TEXT NOT NULL,
            width INTEGER NOT NULL,
            height INTEGER NOT NULL,
            base_type TEXT NOT NULL,
            mesh_shape TEXT NOT NULL DEFAULT '折半圆',
            install_type TEXT NOT NULL DEFAULT '常规',
            mesh_base_code TEXT DEFAULT '',
            buckle_code TEXT DEFAULT 'FN-PJ-0002',
            bolt_code TEXT DEFAULT 'FN-PJ-0004',
            end_cap_code TEXT DEFAULT 'XJ-0009',
            horizontal_pin_code TEXT DEFAULT '',
            vertical_pin_code TEXT DEFAULT '',
            pile_code TEXT DEFAULT NULL,
            pile_bolt_code TEXT DEFAULT '',
            rubber_code TEXT DEFAULT NULL,
            buckle_qty INTEGER NOT NULL DEFAULT 0,
            bolt_qty INTEGER NOT NULL DEFAULT 0,
            end_cap_qty INTEGER NOT NULL DEFAULT 2,
            horizontal_pin_qty INTEGER NOT NULL DEFAULT 0,
            vertical_pin_qty INTEGER NOT NULL DEFAULT 0,
            pile_qty INTEGER NOT NULL DEFAULT 0,
            pile_bolt_qty INTEGER NOT NULL DEFAULT 0,
            rubber_qty INTEGER NOT NULL DEFAULT 0,
            image_base64 TEXT DEFAULT ''
        )
        '''
    )
    columns = {row[1] for row in connection.execute(f'PRAGMA table_info({GATE_TABLE})').fetchall()}
    for col, spec in [('mesh_shape', "TEXT NOT NULL DEFAULT '折半圆'"),
                       ('install_type', "TEXT NOT NULL DEFAULT '常规'"),
                       ('mesh_base_code', "TEXT DEFAULT ''"),
                       ('buckle_code', "TEXT DEFAULT 'FN-PJ-0002'"),
                       ('bolt_code', "TEXT DEFAULT 'FN-PJ-0004'"),
                       ('end_cap_code', "TEXT DEFAULT 'XJ-0009'"),
                       ('horizontal_pin_code', "TEXT DEFAULT ''"),
                       ('vertical_pin_code', "TEXT DEFAULT ''"),
                       ('pile_code', "TEXT DEFAULT NULL"),
                       ('pile_bolt_code', "TEXT DEFAULT ''"),
                       ('rubber_code', "TEXT DEFAULT NULL"),
                       ('buckle_qty', "INTEGER NOT NULL DEFAULT 0"),
                       ('bolt_qty', "INTEGER NOT NULL DEFAULT 0"),
                       ('end_cap_qty', "INTEGER NOT NULL DEFAULT 2"),
                       ('horizontal_pin_qty', "INTEGER NOT NULL DEFAULT 0"),
                       ('vertical_pin_qty', "INTEGER NOT NULL DEFAULT 0"),
                       ('pile_qty', "INTEGER NOT NULL DEFAULT 0"),
                       ('pile_bolt_qty', "INTEGER NOT NULL DEFAULT 0"),
                       ('rubber_qty', "INTEGER NOT NULL DEFAULT 0"),
                       ('image_base64', "TEXT DEFAULT ''")]:
        if col not in columns:
            connection.execute(f"ALTER TABLE {GATE_TABLE} ADD COLUMN {col} {spec}")
    connection.commit()


def normalize_fence(row):
    data = row_to_dict(row)
    if not data:
        return None
    return {
        'code': str(data.get('code') or '').strip(),
        'mesh_type': str(data.get('mesh_type') or '').strip(),
        'mesh_shape': str(data.get('mesh_shape') or '折半圆').strip(),
        'pipe_spec': str(data.get('pipe_spec') or '').strip(),
        'base_type': str(data.get('base_type') or '').strip(),
        'height': int(data.get('height') or 0),
        'mesh_code_30': str(data.get('mesh_code_30') or '').strip(),
        'mesh_code_35': str(data.get('mesh_code_35') or '').strip(),
        'mesh_code_40': str(data.get('mesh_code_40') or '').strip(),
        'post_code': str(data.get('post_code') or '').strip(),
        'pile_code': str(data.get('pile_code') or '').strip() if data.get('pile_code') else None,
        'end_cap_code': str(data.get('end_cap_code') or '').strip(),
        'rubber_code': str(data.get('rubber_code') or '').strip() if data.get('rubber_code') else None,
        'buckle_qty': int(data.get('buckle_qty') or 2),
        'image_base64': str(data.get('image_base64') or '').strip(),
    }


def normalize_gate(row):
    data = row_to_dict(row)
    if not data:
        return None
    return {
        'code': str(data.get('code') or '').strip(),
        'gate_type': str(data.get('gate_type') or '').strip(),
        'width': int(data.get('width') or 0),
        'height': int(data.get('height') or 0),
        'base_type': str(data.get('base_type') or '').strip(),
        'mesh_shape': str(data.get('mesh_shape') or '折半圆').strip(),
        'install_type': str(data.get('install_type') or '常规').strip(),
        'mesh_base_code': str(data.get('mesh_base_code') or '').strip(),
        'buckle_code': str(data.get('buckle_code') or 'FN-PJ-0002').strip(),
        'bolt_code': str(data.get('bolt_code') or 'FN-PJ-0004').strip(),
        'end_cap_code': str(data.get('end_cap_code') or 'XJ-0009').strip(),
        'horizontal_pin_code': str(data.get('horizontal_pin_code') or '').strip(),
        'vertical_pin_code': str(data.get('vertical_pin_code') or '').strip(),
        'pile_code': str(data.get('pile_code') or '').strip() if data.get('pile_code') else None,
        'pile_bolt_code': str(data.get('pile_bolt_code') or '').strip(),
        'rubber_code': str(data.get('rubber_code') or '').strip() if data.get('rubber_code') else None,
        'buckle_qty': int(data.get('buckle_qty') or 0),
        'bolt_qty': int(data.get('bolt_qty') or 0),
        'end_cap_qty': int(data.get('end_cap_qty') or 2),
        'horizontal_pin_qty': int(data.get('horizontal_pin_qty') or 0),
        'vertical_pin_qty': int(data.get('vertical_pin_qty') or 0),
        'pile_qty': int(data.get('pile_qty') or 0),
        'pile_bolt_qty': int(data.get('pile_bolt_qty') or 0),
        'rubber_qty': int(data.get('rubber_qty') or 0),
        'image_base64': str(data.get('image_base64') or '').strip(),
    }


def list_fence_styles(mesh_type='', base_type='', height=None):
    connection = _get_fence_db_connection()
    try:
        clauses = []
        params = []
        mesh_type = str(mesh_type or '').strip()
        base_type = str(base_type or '').strip()
        if mesh_type:
            clauses.append('mesh_type = ?')
            params.append(mesh_type)
        if base_type:
            clauses.append('base_type = ?')
            params.append(base_type)
        if height is not None:
            clauses.append('height = ?')
            params.append(int(height))
        where = f'WHERE {" AND ".join(clauses)}' if clauses else ''
        rows = connection.execute(
            f'SELECT * FROM {FENCE_TABLE} {where} ORDER BY mesh_type, base_type, height, code',
            params,
        ).fetchall()
        return [normalize_fence(r) for r in rows]
    finally:
        connection.close()


def get_fence_style(code):
    connection = _get_fence_db_connection()
    try:
        row = connection.execute(f'SELECT * FROM {FENCE_TABLE} WHERE code = ?', (code,)).fetchone()
        return normalize_fence(row)
    finally:
        connection.close()


def create_fence_style(code, mesh_type, pipe_spec, base_type, height,
                       mesh_code_30, mesh_code_35, mesh_code_40, post_code,
                       pile_code=None, end_cap_code='', rubber_code=None,
                       mesh_shape='折半圆', buckle_qty=2, image_base64=''):
    connection = _get_fence_db_connection()
    try:
        existing = connection.execute(f'SELECT code FROM {FENCE_TABLE} WHERE code = ?', (code,)).fetchone()
        if existing:
            raise ValueError(f'围栏款式已存在: {code}')
        connection.execute(
            f'''
            INSERT INTO {FENCE_TABLE}
                (code, mesh_type, mesh_shape, pipe_spec, base_type, height,
                 mesh_code_30, mesh_code_35, mesh_code_40, post_code, pile_code,
                 end_cap_code, rubber_code, buckle_qty, image_base64)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ''',
            (code, mesh_type, mesh_shape, pipe_spec, base_type, height,
             mesh_code_30, mesh_code_35, mesh_code_40, post_code, pile_code,
             end_cap_code, rubber_code, buckle_qty, image_base64),
        )
        connection.commit()
        return get_fence_style(code)
    finally:
        connection.close()


def update_fence_style(code, new_code=None, **kwargs):
    if new_code is None:
        new_code = code
    connection = _get_fence_db_connection()
    try:
        existing = connection.execute(f'SELECT * FROM {FENCE_TABLE} WHERE code = ?', (code,)).fetchone()
        if not existing:
            raise LookupError(f'围栏款式不存在: {code}')
        old = normalize_fence(existing)
        fields = [
            'mesh_type', 'mesh_shape', 'pipe_spec', 'base_type', 'height',
            'mesh_code_30', 'mesh_code_35', 'mesh_code_40', 'post_code', 'pile_code',
            'end_cap_code', 'rubber_code', 'buckle_qty', 'image_base64',
        ]
        values = []
        sets = []
        for f in fields:
            if f in kwargs:
                values.append(kwargs[f])
            else:
                values.append(old.get(f))
            sets.append(f'{f} = ?')
        if new_code != code:
            sets.append('code = ?')
            values.append(new_code)
        values.append(code)
        connection.execute(
            f'UPDATE {FENCE_TABLE} SET {", ".join(sets)} WHERE code = ?',
            values,
        )
        connection.commit()
        return get_fence_style(new_code)
    finally:
        connection.close()


def delete_fence_style(code):
    connection = _get_fence_db_connection()
    try:
        cursor = connection.execute(f'DELETE FROM {FENCE_TABLE} WHERE code = ?', (code,))
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def bulk_upsert_fence_styles(styles):
    connection = _get_fence_db_connection()
    try:
        success = 0
        failed = []
        for s in styles:
            try:
                code = str(s.get('code') or '').strip()
                if not code:
                    failed.append({'code': '', 'reason': '编码不能为空'})
                    continue
                connection.execute(
                    f'''
                    INSERT OR REPLACE INTO {FENCE_TABLE}
                        (code, mesh_type, mesh_shape, pipe_spec, base_type, height,
                         mesh_code_30, mesh_code_35, mesh_code_40, post_code, pile_code,
                         end_cap_code, rubber_code, buckle_qty, image_base64)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ''',
                    (
                        code,
                        str(s.get('mesh_type') or '').strip(),
                        str(s.get('mesh_shape') or '折半圆').strip(),
                        str(s.get('pipe_spec') or '').strip(),
                        str(s.get('base_type') or '').strip(),
                        int(s.get('height') or 0),
                        str(s.get('mesh_code_30') or '').strip(),
                        str(s.get('mesh_code_35') or '').strip(),
                        str(s.get('mesh_code_40') or '').strip(),
                        str(s.get('post_code') or '').strip(),
                        s.get('pile_code'),
                        str(s.get('end_cap_code') or '').strip(),
                        s.get('rubber_code'),
                        int(s.get('buckle_qty') or 2),
                        str(s.get('image_base64') or '').strip(),
                    ),
                )
                success += 1
            except Exception as e:
                failed.append({'code': s.get('code', ''), 'reason': str(e)})
        connection.commit()
        return {'success': success, 'failed': failed}
    finally:
        connection.close()


def batch_delete_fence_styles(codes):
    connection = _get_fence_db_connection()
    try:
        deleted = 0
        for code in codes or []:
            cursor = connection.execute(f'DELETE FROM {FENCE_TABLE} WHERE code = ?', (code,))
            if cursor.rowcount > 0:
                deleted += 1
        connection.commit()
        return deleted
    finally:
        connection.close()


def list_all_fence_styles_raw():
    connection = _get_fence_db_connection()
    try:
        rows = connection.execute(f'SELECT * FROM {FENCE_TABLE} ORDER BY mesh_type, base_type, height, code').fetchall()
        return [row_to_dict(r) for r in rows]
    finally:
        connection.close()


def list_fence_style_codes():
    connection = _get_fence_db_connection()
    try:
        rows = connection.execute(f'SELECT code FROM {FENCE_TABLE} ORDER BY code').fetchall()
        return [str(r['code'] or '').strip() for r in rows if str(r['code'] or '').strip()]
    finally:
        connection.close()


def list_gate_styles(gate_type='', base_type='', width=None, height=None):
    connection = _get_fence_db_connection()
    try:
        clauses = []
        params = []
        gate_type = str(gate_type or '').strip()
        base_type = str(base_type or '').strip()
        if gate_type:
            clauses.append('gate_type = ?')
            params.append(gate_type)
        if base_type:
            clauses.append('base_type = ?')
            params.append(base_type)
        if width is not None:
            clauses.append('width = ?')
            params.append(int(width))
        if height is not None:
            clauses.append('height = ?')
            params.append(int(height))
        where = f'WHERE {" AND ".join(clauses)}' if clauses else ''
        rows = connection.execute(
            f'SELECT * FROM {GATE_TABLE} {where} ORDER BY gate_type, width, base_type, height',
            params,
        ).fetchall()
        return [normalize_gate(r) for r in rows]
    finally:
        connection.close()


def get_gate_style(code):
    connection = _get_fence_db_connection()
    try:
        row = connection.execute(f'SELECT * FROM {GATE_TABLE} WHERE code = ?', (code,)).fetchone()
        return normalize_gate(row)
    finally:
        connection.close()


def create_gate_style(code, gate_type, width, height, base_type,
                      mesh_shape='折半圆', install_type='常规',
                      mesh_base_code='', buckle_code='FN-PJ-0002',
                      bolt_code='FN-PJ-0004', end_cap_code='XJ-0009',
                      horizontal_pin_code='', vertical_pin_code='',
                      pile_code=None, pile_bolt_code='', rubber_code=None,
                      buckle_qty=0, bolt_qty=0, end_cap_qty=2,
                      horizontal_pin_qty=0, vertical_pin_qty=0,
                      pile_qty=0, pile_bolt_qty=0, rubber_qty=0,
                      image_base64=''):
    connection = _get_fence_db_connection()
    try:
        existing = connection.execute(f'SELECT code FROM {GATE_TABLE} WHERE code = ?', (code,)).fetchone()
        if existing:
            raise ValueError(f'门款式已存在: {code}')
        connection.execute(
            f'''
            INSERT INTO {GATE_TABLE}
                (code, gate_type, width, height, base_type, mesh_shape, install_type,
                 mesh_base_code, buckle_code, bolt_code, end_cap_code,
                 horizontal_pin_code, vertical_pin_code,
                 pile_code, pile_bolt_code, rubber_code,
                 buckle_qty, bolt_qty, end_cap_qty,
                 horizontal_pin_qty, vertical_pin_qty,
                 pile_qty, pile_bolt_qty, rubber_qty,
                 image_base64)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ''',
            (code, gate_type, width, height, base_type, mesh_shape, install_type,
             mesh_base_code, buckle_code, bolt_code, end_cap_code,
             horizontal_pin_code, vertical_pin_code,
             pile_code, pile_bolt_code, rubber_code,
             buckle_qty, bolt_qty, end_cap_qty,
             horizontal_pin_qty, vertical_pin_qty,
             pile_qty, pile_bolt_qty, rubber_qty,
             image_base64),
        )
        connection.commit()
        return get_gate_style(code)
    finally:
        connection.close()


def update_gate_style(code, new_code=None, **kwargs):
    if new_code is None:
        new_code = code
    connection = _get_fence_db_connection()
    try:
        existing = connection.execute(f'SELECT * FROM {GATE_TABLE} WHERE code = ?', (code,)).fetchone()
        if not existing:
            raise LookupError(f'门款式不存在: {code}')
        old = normalize_gate(existing)
        fields = ['gate_type', 'width', 'height', 'base_type', 'mesh_shape', 'install_type',
                  'mesh_base_code', 'buckle_code', 'bolt_code', 'end_cap_code',
                  'horizontal_pin_code', 'vertical_pin_code',
                  'pile_code', 'pile_bolt_code', 'rubber_code',
                  'buckle_qty', 'bolt_qty', 'end_cap_qty',
                  'horizontal_pin_qty', 'vertical_pin_qty',
                  'pile_qty', 'pile_bolt_qty', 'rubber_qty',
                  'image_base64']
        values = []
        sets = []
        for f in fields:
            if f in kwargs:
                values.append(kwargs[f])
            else:
                values.append(old.get(f))
            sets.append(f'{f} = ?')
        if new_code != code:
            sets.append('code = ?')
            values.append(new_code)
        values.append(code)
        connection.execute(
            f'UPDATE {GATE_TABLE} SET {", ".join(sets)} WHERE code = ?',
            values,
        )
        connection.commit()
        return get_gate_style(new_code)
    finally:
        connection.close()


def delete_gate_style(code):
    connection = _get_fence_db_connection()
    try:
        cursor = connection.execute(f'DELETE FROM {GATE_TABLE} WHERE code = ?', (code,))
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def bulk_upsert_gate_styles(styles):
    connection = _get_fence_db_connection()
    try:
        success = 0
        failed = []
        for s in styles:
            try:
                code = str(s.get('code') or '').strip()
                if not code:
                    failed.append({'code': '', 'reason': '编码不能为空'})
                    continue
                connection.execute(
                    f'''
                    INSERT OR REPLACE INTO {GATE_TABLE}
                        (code, gate_type, width, height, base_type, mesh_shape, install_type,
                         mesh_base_code, buckle_code, bolt_code, end_cap_code,
                         horizontal_pin_code, vertical_pin_code,
                         pile_code, pile_bolt_code, rubber_code,
                         buckle_qty, bolt_qty, end_cap_qty,
                         horizontal_pin_qty, vertical_pin_qty,
                         pile_qty, pile_bolt_qty, rubber_qty,
                         image_base64)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ''',
                    (
                        code,
                        str(s.get('gate_type') or '').strip(),
                        int(s.get('width') or 0),
                        int(s.get('height') or 0),
                        str(s.get('base_type') or '').strip(),
                        str(s.get('mesh_shape') or '折半圆').strip(),
                        str(s.get('install_type') or '常规').strip(),
                        str(s.get('mesh_base_code') or '').strip(),
                        str(s.get('buckle_code') or 'FN-PJ-0002').strip(),
                        str(s.get('bolt_code') or 'FN-PJ-0004').strip(),
                        str(s.get('end_cap_code') or 'XJ-0009').strip(),
                        str(s.get('horizontal_pin_code') or '').strip(),
                        str(s.get('vertical_pin_code') or '').strip(),
                        s.get('pile_code'),
                        str(s.get('pile_bolt_code') or '').strip(),
                        s.get('rubber_code'),
                        int(s.get('buckle_qty') or 0),
                        int(s.get('bolt_qty') or 0),
                        int(s.get('end_cap_qty') or 2),
                        int(s.get('horizontal_pin_qty') or 0),
                        int(s.get('vertical_pin_qty') or 0),
                        int(s.get('pile_qty') or 0),
                        int(s.get('pile_bolt_qty') or 0),
                        int(s.get('rubber_qty') or 0),
                        str(s.get('image_base64') or '').strip(),
                    ),
                )
                success += 1
            except Exception as e:
                failed.append({'code': s.get('code', ''), 'reason': str(e)})
        connection.commit()
        return {'success': success, 'failed': failed}
    finally:
        connection.close()


def batch_delete_gate_styles(codes):
    connection = _get_fence_db_connection()
    try:
        deleted = 0
        for code in codes or []:
            cursor = connection.execute(f'DELETE FROM {GATE_TABLE} WHERE code = ?', (code,))
            if cursor.rowcount > 0:
                deleted += 1
        connection.commit()
        return deleted
    finally:
        connection.close()


def list_all_gate_styles_raw():
    connection = _get_fence_db_connection()
    try:
        rows = connection.execute(f'SELECT * FROM {GATE_TABLE} ORDER BY gate_type, width, base_type, height, code').fetchall()
        return [row_to_dict(r) for r in rows]
    finally:
        connection.close()


def list_gate_style_codes():
    connection = _get_fence_db_connection()
    try:
        rows = connection.execute(f'SELECT code FROM {GATE_TABLE} ORDER BY code').fetchall()
        return [str(r['code'] or '').strip() for r in rows if str(r['code'] or '').strip()]
    finally:
        connection.close()
