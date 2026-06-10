import json
import re
from datetime import datetime, timedelta

from backend.config.settings import get_db_connection
from backend.utils.helpers import row_to_dict


IMAGE_INQUIRY_TABLE = 'ks_image_inquiry_records'
IMAGE_TTL_DAYS = 90


def _get_conn():
    return get_db_connection()


def _ensure_columns(conn):
    import sqlite3
    existing = {row['name'] for row in conn.execute(f'PRAGMA table_info({IMAGE_INQUIRY_TABLE})').fetchall()}
    _alter_cols = {
        'sender_name': "TEXT NOT NULL DEFAULT ''",
        'received_at': 'TEXT',
        'parsed_at': 'TEXT',
        'db_updated_at': 'TEXT',
        'images_json': "TEXT DEFAULT ''",
        'images_updated': 'INTEGER NOT NULL DEFAULT 0',
        'reply_json': "TEXT DEFAULT ''",
        'remark': "TEXT DEFAULT ''",
        'source_group': "TEXT NOT NULL DEFAULT ''",
        'code_count': "INTEGER NOT NULL DEFAULT 0",
    }
    for col, definition in _alter_cols.items():
        if col not in existing:
            try:
                conn.execute(f'ALTER TABLE {IMAGE_INQUIRY_TABLE} ADD COLUMN {col} {definition}')
            except sqlite3.OperationalError:
                pass


def ensure_image_inquiry_schema():
    conn = _get_conn()
    try:
        conn.execute(
            f'''
            CREATE TABLE IF NOT EXISTS {IMAGE_INQUIRY_TABLE} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_name TEXT NOT NULL DEFAULT '',
                sender_name TEXT NOT NULL DEFAULT '',
                designer_email TEXT NOT NULL DEFAULT '',
                code_count INTEGER NOT NULL DEFAULT 0,
                codes_json TEXT NOT NULL DEFAULT '[]',
                email_subject TEXT NOT NULL DEFAULT '',
                email_sent_at TEXT,
                status TEXT NOT NULL DEFAULT 'sent',
                reply_json TEXT DEFAULT '',
                reply_received_at TEXT,
                images_json TEXT DEFAULT '',
                images_updated INTEGER NOT NULL DEFAULT 0,
                received_at TEXT,
                parsed_at TEXT,
                db_updated_at TEXT,
                remark TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                expires_at TEXT NOT NULL
            )
            '''
        )
        _ensure_columns(conn)
        conn.execute(
            f'CREATE INDEX IF NOT EXISTS idx_{IMAGE_INQUIRY_TABLE}_expires '
            f'ON {IMAGE_INQUIRY_TABLE}(expires_at)'
        )
        conn.execute(
            f'CREATE INDEX IF NOT EXISTS idx_{IMAGE_INQUIRY_TABLE}_status '
            f'ON {IMAGE_INQUIRY_TABLE}(status)'
        )
        conn.commit()
        _repair_orphan_sent_items(conn)
    finally:
        conn.close()


def _repair_orphan_sent_items(conn):
    repaired = 0
    try:
        from datetime import datetime as _dt, timedelta as _td
        import json as _json
        since = (_dt.now() - _td(days=10)).strftime('%Y-%m-%d %H:%M:%S')
        batches = conn.execute(f"""
            SELECT source_group, designer_email, last_sent_at,
                   GROUP_CONCAT(material_code) as codes_csv,
                   COUNT(*) as cnt
            FROM {IMAGE_ITEMS_TABLE}
            WHERE status = 'sent' AND last_sent_at IS NOT NULL AND record_id IS NULL
                  AND last_sent_at >= ?
            GROUP BY source_group, last_sent_at
        """, (since,)).fetchall()
        if not batches:
            return repaired
        _GROUP_MAP = {
            '\u97e9\u8bed\u7ec4': 'crq@xmkseng.com',
            '\u65e5\u8bed\u7ec4': 'hlan@xmkseng.com',
            '\u82f1\u8bed\u7ec4': 'RoyQuan@xmkseng.com',
        }
        for b in batches:
            group = b['source_group']
            sent_at = b['last_sent_at']
            designer_email = b['designer_email'] or _GROUP_MAP.get(group, '')
            codes_csv = b['codes_csv'] or ''
            codes = [c.strip() for c in codes_csv.split(',') if c.strip()]
            code_count = len(codes)
            expires_at = (_dt.now() + _td(days=IMAGE_TTL_DAYS)).strftime('%Y-%m-%d %H:%M:%S')
            email_subject = f'[weekly] {group} - {code_count} codes ({sent_at})'
            codes_json = _json.dumps(codes, ensure_ascii=False)
            cursor = conn.execute(
                f"""INSERT INTO {IMAGE_INQUIRY_TABLE}
                    (project_name, sender_name, designer_email, code_count,
                     codes_json, email_subject, email_sent_at, status, expires_at,
                     remark, source_group, created_at)
                VALUES (?, '', ?, ?, ?, ?, ?, 'sent', ?, 'weekly_batch_repair', ?, ?)""",
                (group, designer_email, code_count, codes_json, email_subject,
                 sent_at, expires_at, group, sent_at),
            )
            record_id = cursor.lastrowid
            conn.execute(
                f"UPDATE {IMAGE_ITEMS_TABLE} SET record_id = ? WHERE source_group = ? AND last_sent_at = ?",
                (record_id, group, sent_at),
            )
            repaired += 1
            print(f'[IMAGE-INQUIRY-REPAIR] Created record #{record_id}: {group} | {code_count} codes | {sent_at}')
        conn.commit()
        if repaired:
            print(f'[IMAGE-INQUIRY-REPAIR] Total: {repaired} records repaired')
    except Exception as exc:
        print(f'[IMAGE-INQUIRY-REPAIR] Repair failed: {exc}')
    return repaired


def repair_image_inquiry_records():
    ensure_image_inquiry_items_schema()
    conn = _get_conn()
    try:
        _ensure_columns(conn)
        return _repair_orphan_sent_items(conn)
    finally:
        conn.close()


def insert_image_inquiry_record(
    project_name='',
    sender_name='',
    designer_email='',
    code_count=0,
    codes=None,
    email_subject='',
    remark='',
    source_group='',
):
    ensure_image_inquiry_schema()
    codes = codes or []
    now = datetime.now()
    expires_at = (now + timedelta(days=IMAGE_TTL_DAYS)).strftime('%Y-%m-%d %H:%M:%S')

    conn = _get_conn()
    try:
        cursor = conn.execute(
            f'''
            INSERT INTO {IMAGE_INQUIRY_TABLE}
                (project_name, sender_name, designer_email, code_count,
                 codes_json, email_subject, email_sent_at, status, expires_at, remark, source_group)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?)
            ''',
            (
                project_name,
                sender_name,
                designer_email,
                code_count,
                json.dumps(codes, ensure_ascii=False),
                email_subject,
                now.strftime('%Y-%m-%d %H:%M:%S'),
                expires_at,
                remark,
                source_group,
            ),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def update_image_inquiry_status(record_id, status, reply_json='', images_updated=0):
    ensure_image_inquiry_schema()
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn = _get_conn()
    try:
        sets = ['status = ?']
        params = [status]
        if reply_json:
            sets.append('reply_json = ?')
            params.append(reply_json)
        if images_updated:
            sets.append('images_updated = ?')
            params.append(images_updated)

        if status == 'received':
            sets.append('received_at = ?')
            sets.append('reply_received_at = ?')
            params.extend([now_str, now_str])
        elif status == 'parsed':
            sets.append('parsed_at = ?')
            if 'received_at' not in sets:
                sets.append('received_at = COALESCE(received_at, ?)')
                params.append(now_str)
            params.append(now_str)
        elif status == 'db_updated':
            sets.append('db_updated_at = ?')
            if 'parsed_at' not in sets:
                sets.append('parsed_at = COALESCE(parsed_at, ?)')
                params.append(now_str)
            if 'received_at' not in sets:
                sets.append('received_at = COALESCE(received_at, ?)')
                params.append(now_str)
            params.append(now_str)
        elif status == 'parse_failed':
            sets.append('received_at = COALESCE(received_at, ?)')
            params.append(now_str)

        params.append(record_id)
        conn.execute(
            f'UPDATE {IMAGE_INQUIRY_TABLE} SET {", ".join(sets)} WHERE id = ?',
            params,
        )
        conn.commit()
    finally:
        conn.close()


def update_image_inquiry_reply(record_id, images_json='', status='image_received'):
    ensure_image_inquiry_schema()
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn = _get_conn()
    try:
        conn.execute(
            f'''
            UPDATE {IMAGE_INQUIRY_TABLE}
            SET status = ?, images_json = ?, reply_received_at = ?, received_at = COALESCE(received_at, ?)
            WHERE id = ?
            ''',
            (status, images_json, now_str, now_str, record_id),
        )
        conn.commit()
    finally:
        conn.close()


def find_image_inquiry_by_subject(subject):
    ensure_image_inquiry_schema()
    clean_subject = _strip_reply_prefix(subject)
    clean_no_ts = _strip_trailing_timestamp(clean_subject)

    conn = _get_conn()
    try:
        candidates = [clean_subject]
        if clean_no_ts != clean_subject:
            candidates.append(clean_no_ts)

        for candidate in candidates:
            row = conn.execute(
                f"SELECT * FROM {IMAGE_INQUIRY_TABLE} WHERE email_subject = ? ORDER BY created_at DESC LIMIT 1",
                (candidate,),
            ).fetchone()
            if row:
                return row_to_dict(row)
            rows = conn.execute(
                f"SELECT * FROM {IMAGE_INQUIRY_TABLE} WHERE email_subject LIKE ? ORDER BY created_at DESC LIMIT 1",
                (f'%{candidate}%',),
            ).fetchall()
            for row in rows:
                return row_to_dict(row)

        short = re.sub(r'\s*[-–—]\s*缺失图片编码列表.*$', '', clean_no_ts).strip()
        if short and short != clean_no_ts:
            rows = conn.execute(
                f"SELECT * FROM {IMAGE_INQUIRY_TABLE} WHERE email_subject LIKE ? ORDER BY created_at DESC LIMIT 5",
                (f'%{short}%',),
            ).fetchall()
            for row in rows:
                return row_to_dict(row)

        return None
    finally:
        conn.close()


def list_image_inquiry_records(status=None, page=1, page_size=20):
    ensure_image_inquiry_schema()
    conn = _get_conn()
    try:
        query = f'SELECT * FROM {IMAGE_INQUIRY_TABLE}'
        count_query = f'SELECT COUNT(*) FROM {IMAGE_INQUIRY_TABLE}'
        params = []
        conditions = []

        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        conditions.append("expires_at > ?")
        params.append(now_str)

        if status:
            conditions.append('status = ?')
            params.append(status)

        where_clause = ' WHERE ' + ' AND '.join(conditions) if conditions else ''

        total = conn.execute(count_query + where_clause, params).fetchone()[0]

        offset = max(0, (page - 1)) * page_size
        query += where_clause
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
        params.extend([page_size, offset])

        rows = conn.execute(query, params).fetchall()
        results = []
        for r in rows:
            d = row_to_dict(r)
            try:
                d['codes'] = json.loads(d.get('codes_json', '[]'))
            except (json.JSONDecodeError, TypeError):
                d['codes'] = []
            d.pop('codes_json', None)
            try:
                d['reply'] = json.loads(d.get('reply_json', '[]'))
            except (json.JSONDecodeError, TypeError):
                d['reply'] = []
            d.pop('reply_json', None)
            try:
                d['images'] = json.loads(d.get('images_json', '')) if d.get('images_json') else []
            except (json.JSONDecodeError, TypeError):
                d['images'] = []
            d.pop('images_json', None)
            results.append(d)
        return {'records': results, 'total': total, 'page': page, 'page_size': page_size}
    finally:
        conn.close()


def get_image_inquiry_record(record_id):
    ensure_image_inquiry_schema()
    conn = _get_conn()
    try:
        row = conn.execute(
            f'SELECT * FROM {IMAGE_INQUIRY_TABLE} WHERE id = ?', (record_id,)
        ).fetchone()
        if not row:
            return None
        d = row_to_dict(row)
        try:
            d['codes'] = json.loads(d.get('codes_json', '[]'))
        except (json.JSONDecodeError, TypeError):
            d['codes'] = []
        d.pop('codes_json', None)
        try:
            d['reply'] = json.loads(d.get('reply_json', '[]'))
        except (json.JSONDecodeError, TypeError):
            d['reply'] = []
        d.pop('reply_json', None)
        try:
            d['images'] = json.loads(d.get('images_json', '')) if d.get('images_json') else []
        except (json.JSONDecodeError, TypeError):
            d['images'] = []
        d.pop('images_json', None)
        return d
    finally:
        conn.close()


def count_image_inquiry_records_by_status():
    ensure_image_inquiry_schema()
    conn = _get_conn()
    try:
        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        rows = conn.execute(
            f"SELECT status, COUNT(*) as cnt FROM {IMAGE_INQUIRY_TABLE} WHERE expires_at > ? GROUP BY status",
            (now_str,),
        ).fetchall()
        counts = {}
        for r in rows:
            d = row_to_dict(r)
            counts[d['status']] = d['cnt']
        return {
            'sent': counts.get('sent', 0),
            'received': counts.get('received', 0) + counts.get('image_received', 0),
            'parsed': counts.get('parsed', 0),
            'db_updated': counts.get('db_updated', 0),
            'parse_failed': counts.get('parse_failed', 0) + counts.get('failed', 0),
            'total': sum(counts.values()),
        }
    finally:
        conn.close()


def cleanup_expired_image_inquiry_records():
    ensure_image_inquiry_schema()
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn = _get_conn()
    try:
        cursor = conn.execute(
            f'DELETE FROM {IMAGE_INQUIRY_TABLE} WHERE expires_at <= ?', (now_str,)
        )
        deleted = cursor.rowcount
        conn.commit()
        return deleted
    finally:
        conn.close()


def _strip_reply_prefix(subject):
    s = str(subject or '').strip()
    changed = True
    while changed:
        changed = False
        for prefix in ('Re: ', 'Re:', 'RE: ', 'RE:', 'Fwd: ', 'Fwd:', 'FW: ', 'FW:', '回复: ', '回复:', '回复：', '转发: ', '转发:', '转发：'):
            if s.startswith(prefix):
                s = s[len(prefix):].strip()
                changed = True
    return s


def _strip_trailing_timestamp(subject):
    return re.sub(r'\s*\(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?\)\s*$', '', subject).strip()


IMAGE_ITEMS_TABLE = 'ks_image_inquiry_items'


def ensure_image_inquiry_items_schema():
    conn = _get_conn()
    try:
        conn.execute(
            f'''
            CREATE TABLE IF NOT EXISTS {IMAGE_ITEMS_TABLE} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                record_id INTEGER,
                source_group TEXT NOT NULL DEFAULT '',
                designer_email TEXT NOT NULL DEFAULT '',
                project_names TEXT NOT NULL DEFAULT '',
                material_code TEXT NOT NULL,
                material_name TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending',
                image_base64 TEXT DEFAULT '',
                image_received_at TEXT,
                last_sent_at TEXT,
                pending_count INTEGER NOT NULL DEFAULT 1,
                remark TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )
            '''
        )
        _ensure_items_columns(conn)
        try:
            conn.execute(f'DROP INDEX IF EXISTS idx_{IMAGE_ITEMS_TABLE}_code')
        except Exception:
            pass
        conn.execute(
            f'CREATE UNIQUE INDEX IF NOT EXISTS idx_{IMAGE_ITEMS_TABLE}_code_group '
            f'ON {IMAGE_ITEMS_TABLE}(material_code, source_group)'
        )
        conn.execute(
            f'CREATE INDEX IF NOT EXISTS idx_{IMAGE_ITEMS_TABLE}_status '
            f'ON {IMAGE_ITEMS_TABLE}(status)'
        )
        conn.execute(
            f'CREATE INDEX IF NOT EXISTS idx_{IMAGE_ITEMS_TABLE}_record '
            f'ON {IMAGE_ITEMS_TABLE}(record_id)'
        )
        conn.execute(
            f'CREATE INDEX IF NOT EXISTS idx_{IMAGE_ITEMS_TABLE}_group '
            f'ON {IMAGE_ITEMS_TABLE}(source_group)'
        )
        conn.commit()
    finally:
        conn.close()


def _ensure_items_columns(conn):
    import sqlite3
    existing = {row['name'] for row in conn.execute(f'PRAGMA table_info({IMAGE_ITEMS_TABLE})').fetchall()}
    alter_cols = {
        'source_group': "TEXT NOT NULL DEFAULT ''",
        'designer_email': "TEXT NOT NULL DEFAULT ''",
    }
    for col, definition in alter_cols.items():
        if col not in existing:
            try:
                conn.execute(f'ALTER TABLE {IMAGE_ITEMS_TABLE} ADD COLUMN {col} {definition}')
            except sqlite3.OperationalError:
                pass


def upsert_pending_items(items, project_name='', source_group='', designer_email=''):
    ensure_image_inquiry_items_schema()
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    inserted = 0
    updated = 0
    skipped = 0

    conn = _get_conn()
    try:
        for item in items:
            code = str(item.get('code', '') or item.get('material_code', '')).strip()
            if not code:
                continue
            name = str(item.get('name', '') or item.get('material_name', '')).strip()

            existing = conn.execute(
                f'SELECT id, status, project_names, pending_count FROM {IMAGE_ITEMS_TABLE} '
                f'WHERE material_code = ? AND source_group = ?',
                (code, source_group),
            ).fetchone()

            if existing:
                cur_status = existing['status']
                if cur_status == 'db_updated':
                    skipped += 1
                    continue
                new_projects = existing['project_names']
                if project_name and project_name not in new_projects:
                    if new_projects:
                        new_projects = new_projects + ', ' + project_name
                    else:
                        new_projects = project_name
                conn.execute(
                    f'UPDATE {IMAGE_ITEMS_TABLE} SET pending_count = pending_count + 1, '
                    f'project_names = ?, material_name = COALESCE(NULLIF(material_name, ""), ?), '
                    f'updated_at = ? WHERE material_code = ? AND source_group = ?',
                    (new_projects, name, now_str, code, source_group),
                )
                updated += 1
            else:
                conn.execute(
                    f'INSERT INTO {IMAGE_ITEMS_TABLE} '
                    f'(material_code, material_name, project_names, source_group, designer_email, status, created_at, updated_at) '
                    f'VALUES (?, ?, ?, ?, ?, "pending", ?, ?)',
                    (code, name, project_name, source_group, designer_email, now_str, now_str),
                )
                inserted += 1

        conn.commit()
    finally:
        conn.close()

    return {'inserted': inserted, 'updated': updated, 'skipped': skipped}


def list_pending_items(status=None, page=1, page_size=500, source_group=None):
    ensure_image_inquiry_items_schema()
    conn = _get_conn()
    try:
        query = f'SELECT * FROM {IMAGE_ITEMS_TABLE}'
        count_query = f'SELECT COUNT(*) FROM {IMAGE_ITEMS_TABLE}'
        params = []
        conditions = []

        if status:
            conditions.append('status = ?')
            params.append(status)
        else:
            conditions.append("status IN ('pending', 'failed')")

        if source_group:
            conditions.append('source_group = ?')
            params.append(source_group)

        where_clause = ' WHERE ' + ' AND '.join(conditions)
        total = conn.execute(count_query + where_clause, params).fetchone()[0]

        offset = max(0, (page - 1)) * page_size
        query += where_clause
        query += ' ORDER BY created_at ASC LIMIT ? OFFSET ?'
        params.extend([page_size, offset])

        rows = conn.execute(query, params).fetchall()
        results = [row_to_dict(r) for r in rows]
        return {'items': results, 'total': total, 'page': page, 'page_size': page_size}
    finally:
        conn.close()


def get_pending_item_by_code(code, source_group=None):
    ensure_image_inquiry_items_schema()
    conn = _get_conn()
    try:
        if source_group:
            row = conn.execute(
                f'SELECT * FROM {IMAGE_ITEMS_TABLE} WHERE material_code = ? AND source_group = ?',
                (code, source_group),
            ).fetchone()
        else:
            row = conn.execute(
                f'SELECT * FROM {IMAGE_ITEMS_TABLE} WHERE material_code = ?', (code,)
            ).fetchone()
        return row_to_dict(row) if row else None
    finally:
        conn.close()


def delete_pending_item(code, source_group=None):
    ensure_image_inquiry_items_schema()
    conn = _get_conn()
    try:
        if source_group:
            cursor = conn.execute(
                f"DELETE FROM {IMAGE_ITEMS_TABLE} WHERE material_code = ? AND source_group = ? AND status = 'pending'",
                (code, source_group),
            )
        else:
            cursor = conn.execute(
                f"DELETE FROM {IMAGE_ITEMS_TABLE} WHERE material_code = ? AND status = 'pending'",
                (code,),
            )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def batch_link_items_to_record(record_id, codes, source_group=''):
    ensure_image_inquiry_items_schema()
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn = _get_conn()
    try:
        for code in codes:
            conn.execute(
                f'UPDATE {IMAGE_ITEMS_TABLE} SET record_id = ?, status = "sent", '
                f'last_sent_at = ?, updated_at = ? WHERE material_code = ? AND source_group = ?',
                (record_id, now_str, now_str, str(code).strip(), source_group),
            )
        conn.commit()
    finally:
        conn.close()


def update_item_by_code(code, status, image_base64=''):
    ensure_image_inquiry_items_schema()
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn = _get_conn()
    try:
        sets = ['status = ?', 'updated_at = ?']
        params = [status, now_str]
        if image_base64:
            sets.append('image_base64 = ?')
            sets.append('image_received_at = ?')
            params.extend([image_base64, now_str])
        params.append(str(code).strip())
        conn.execute(
            f'UPDATE {IMAGE_ITEMS_TABLE} SET {", ".join(sets)} WHERE material_code = ?',
            params,
        )
        conn.commit()
    finally:
        conn.close()


def count_items_by_status(source_group=None):
    ensure_image_inquiry_items_schema()
    conn = _get_conn()
    try:
        if source_group:
            rows = conn.execute(
                f'SELECT status, COUNT(*) as cnt FROM {IMAGE_ITEMS_TABLE} WHERE source_group = ? GROUP BY status',
                (source_group,),
            ).fetchall()
        else:
            rows = conn.execute(
                f'SELECT source_group, status, COUNT(*) as cnt FROM {IMAGE_ITEMS_TABLE} GROUP BY source_group, status'
            ).fetchall()

        if source_group:
            counts = {}
            for r in rows:
                d = row_to_dict(r)
                counts[d['status']] = d['cnt']
            return {
                'pending': counts.get('pending', 0),
                'sent': counts.get('sent', 0),
                'received': counts.get('received', 0),
                'matched': counts.get('matched', 0),
                'db_updated': counts.get('db_updated', 0),
                'failed': counts.get('failed', 0),
                'total': sum(counts.values()),
            }

        groups = {}
        for r in rows:
            d = row_to_dict(r)
            g = d.get('source_group', '') or '未分组'
            groups.setdefault(g, {})
            groups[g][d['status']] = d['cnt']
        result = {}
        for g, counts in groups.items():
            result[g] = {
                'pending': counts.get('pending', 0),
                'sent': counts.get('sent', 0),
                'received': counts.get('received', 0),
                'matched': counts.get('matched', 0),
                'db_updated': counts.get('db_updated', 0),
                'failed': counts.get('failed', 0),
                'total': sum(counts.values()),
            }
        return result
    finally:
        conn.close()


def get_all_pending_codes(source_group=''):
    ensure_image_inquiry_items_schema()
    conn = _get_conn()
    try:
        if source_group:
            rows = conn.execute(
                f"SELECT material_code, material_name, project_names, source_group, designer_email "
                f"FROM {IMAGE_ITEMS_TABLE} WHERE status = 'pending' AND source_group = ? ORDER BY created_at ASC",
                (source_group,),
            ).fetchall()
        else:
            rows = conn.execute(
                f"SELECT material_code, material_name, project_names, source_group, designer_email "
                f"FROM {IMAGE_ITEMS_TABLE} WHERE status = 'pending' ORDER BY created_at ASC"
            ).fetchall()
        return [row_to_dict(r) for r in rows]
    finally:
        conn.close()
