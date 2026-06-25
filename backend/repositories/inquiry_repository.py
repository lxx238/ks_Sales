import json
import re
import sqlite3
from datetime import datetime, timedelta

from backend.config.settings import get_db_connection
from backend.utils.helpers import row_to_dict
from backend.utils.converters import normalize_lookup_code


INQUIRY_TABLE = 'ks_inquiry_records'
PRICE_CACHE_TABLE = 'ks_inquiry_price_cache'
INQUIRY_ITEMS_TABLE = 'ks_inquiry_items'
CASE_LOCK_TABLE = 'ks_inquiry_case_lock'
TON_HISTORY_TABLE = 'ks_ton_price_history'
CASE_META_TABLE = 'ks_inquiry_case_meta'
ATTACHMENT_TABLE = 'ks_inquiry_attachments'

INQUIRY_TTL_DAYS = 90
CASE_LOCK_MINUTES = 7 * 24 * 60   # 案件金额保存后 7 天内可改
TON_HISTORY_TTL_DAYS = 365       # 吨价历史保存 1 年


def _is_carbon_steel(material_code):
    code = str(material_code or '').strip().upper()
    return code.startswith('WTP-') or code.startswith('WTX-')


def _get_conn():
    return get_db_connection()


def _add_column(conn, table, existing, col, ddl):
    """幂等加列。

    existing 为该表已存在列名的集合。并发连接（如邮件监听线程与请求线程）
    可能在 PRAGMA 读取与真正 ALTER 之间由另一方先添加了该列，从而触发
    sqlite3 "duplicate column name" 错误，此处捕获并忽略该竞态。
    """
    if col in existing:
        return
    try:
        conn.execute(f'ALTER TABLE {table} ADD COLUMN {ddl}')
    except sqlite3.OperationalError as e:
        if 'duplicate column' not in str(e).lower():
            raise


def ensure_inquiry_schema():
    conn = _get_conn()
    try:
        conn.execute(
            f'''
            CREATE TABLE IF NOT EXISTS {INQUIRY_TABLE} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_name TEXT NOT NULL DEFAULT '',
                bom_filename TEXT NOT NULL DEFAULT '',
                inquiry_requester TEXT NOT NULL DEFAULT '',
                material_count INTEGER NOT NULL DEFAULT 0,
                materials_json TEXT NOT NULL DEFAULT '[]',
                email_subject TEXT NOT NULL DEFAULT '',
                email_sent_at TEXT,
                status TEXT NOT NULL DEFAULT 'sent',
                reply_json TEXT DEFAULT '',
                reply_received_at TEXT,
                forwarded_to TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                expires_at TEXT NOT NULL
            )
            '''
        )
        _ensure_inquiry_columns(conn)
        conn.execute(
            f'CREATE INDEX IF NOT EXISTS idx_{INQUIRY_TABLE}_expires '
            f'ON {INQUIRY_TABLE}(expires_at)'
        )
        conn.execute(
            f'CREATE INDEX IF NOT EXISTS idx_{INQUIRY_TABLE}_status '
            f'ON {INQUIRY_TABLE}(status)'
        )
        conn.commit()
    finally:
        conn.close()


def _ensure_inquiry_columns(conn):
    existing = {row['name'] for row in conn.execute(f'PRAGMA table_info({INQUIRY_TABLE})').fetchall()}
    _add_column(conn, INQUIRY_TABLE, existing, 'reply_json', "reply_json TEXT DEFAULT ''")
    _add_column(conn, INQUIRY_TABLE, existing, 'reply_received_at', 'reply_received_at TEXT')
    _add_column(conn, INQUIRY_TABLE, existing, 'forwarded_to', "forwarded_to TEXT DEFAULT ''")
    _add_column(conn, INQUIRY_TABLE, existing, 'remark', "remark TEXT DEFAULT ''")


def ensure_price_cache_schema():
    conn = _get_conn()
    try:
        conn.execute(
            f'''
            CREATE TABLE IF NOT EXISTS {PRICE_CACHE_TABLE} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                material_code TEXT NOT NULL,
                spec TEXT NOT NULL DEFAULT '',
                quantity REAL NOT NULL DEFAULT 0,
                name TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT '',
                unit_price REAL,
                unit_price_usd REAL,
                unit_price_cny REAL,
                unit_price_eur REAL,
                unit TEXT NOT NULL DEFAULT '',
                quotation_date TEXT,
                valid_until TEXT,
                discount TEXT DEFAULT '',
                inquirer TEXT DEFAULT '',
                source_email TEXT DEFAULT '',
                source_record_id INTEGER,
                preinstall TEXT NOT NULL DEFAULT '预装',
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                UNIQUE(material_code, spec, quantity)
            )
            '''
        )
        _ensure_price_cache_columns(conn)
        conn.execute(
            f'CREATE INDEX IF NOT EXISTS idx_{PRICE_CACHE_TABLE}_code_spec '
            f'ON {PRICE_CACHE_TABLE}(material_code, spec)'
        )
        conn.commit()
    finally:
        conn.close()


def _ensure_price_cache_columns(conn):
    existing = {row['name'] for row in conn.execute(f'PRAGMA table_info({PRICE_CACHE_TABLE})').fetchall()}
    _add_column(conn, PRICE_CACHE_TABLE, existing, 'unit_price_usd', 'unit_price_usd REAL')
    _add_column(conn, PRICE_CACHE_TABLE, existing, 'unit_price_cny', 'unit_price_cny REAL')
    _add_column(conn, PRICE_CACHE_TABLE, existing, 'unit_price_eur', 'unit_price_eur REAL')
    _add_column(conn, PRICE_CACHE_TABLE, existing, 'unit_price_rmb', 'unit_price_rmb REAL')
    _add_column(conn, PRICE_CACHE_TABLE, existing, 'preinstall', "preinstall TEXT NOT NULL DEFAULT '预装'")
    _add_column(conn, PRICE_CACHE_TABLE, existing, 'mold_fee', "mold_fee TEXT DEFAULT ''")
    _add_column(conn, PRICE_CACHE_TABLE, existing, 'moq', "moq TEXT DEFAULT ''")
    _add_column(conn, PRICE_CACHE_TABLE, existing, 'remark', "remark TEXT DEFAULT ''")


def insert_inquiry_record(
    project_name='',
    bom_filename='',
    inquiry_requester='',
    material_count=0,
    materials=None,
    email_subject='',
    remark='',
):
    ensure_inquiry_schema()
    materials = materials or []
    now = datetime.now()
    expires_at = (now + timedelta(days=INQUIRY_TTL_DAYS)).strftime('%Y-%m-%d %H:%M:%S')

    conn = _get_conn()
    try:
        cursor = conn.execute(
            f'''
            INSERT INTO {INQUIRY_TABLE}
                (project_name, bom_filename, inquiry_requester, material_count,
                 materials_json, email_subject, email_sent_at, status, expires_at, remark)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?)
            ''',
            (
                project_name,
                bom_filename,
                inquiry_requester,
                material_count,
                json.dumps(materials, ensure_ascii=False),
                email_subject,
                now.strftime('%Y-%m-%d %H:%M:%S'),
                expires_at,
                remark,
            ),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def list_inquiry_records(status=None, direction=None, page=1, page_size=20):
    ensure_inquiry_schema()
    conn = _get_conn()
    try:
        query = f'SELECT * FROM {INQUIRY_TABLE}'
        count_query = f'SELECT COUNT(*) FROM {INQUIRY_TABLE}'
        params = []
        conditions = []

        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        conditions.append("expires_at > ?")
        params.append(now_str)

        if status:
            conditions.append('status = ?')
            params.append(status)

        if direction == 'sent_inquiry':
            conditions.append("status IN ('sent', 'parsed', 'parsed_forwarded')")
            conditions.append("(remark IS NULL OR remark != 'auto_external')")
        elif direction == 'sent_forward':
            conditions.append("forwarded_to IS NOT NULL AND forwarded_to != ''")
            conditions.append("(remark IS NULL OR remark != 'auto_external')")
        elif direction == 'received_reply':
            conditions.append("status IN ('parsed', 'parsed_forwarded', 'parse_failed', 'forwarded_parse_failed')")
            conditions.append("(remark IS NULL OR remark != 'auto_external')")
        elif direction == 'received_forward':
            conditions.append("remark = 'auto_external'")
        elif direction == 'sent':
            conditions.append("status = 'sent' OR (forwarded_to IS NOT NULL AND forwarded_to != '' AND (remark IS NULL OR remark != 'auto_external'))")
        elif direction == 'received':
            conditions.append("status IN ('parsed', 'parsed_forwarded', 'parsed_external', 'parse_failed', 'forwarded_parse_failed')")

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
                d['materials'] = json.loads(d.get('materials_json', '[]'))
            except (json.JSONDecodeError, TypeError):
                d['materials'] = []
            del d['materials_json']
            results.append(d)
        return {'records': results, 'total': total, 'page': page, 'page_size': page_size}
    finally:
        conn.close()


def get_inquiry_record(record_id):
    ensure_inquiry_schema()
    conn = _get_conn()
    try:
        row = conn.execute(
            f'SELECT * FROM {INQUIRY_TABLE} WHERE id = ?', (record_id,)
        ).fetchone()
        if not row:
            return None
        d = row_to_dict(row)
        try:
            d['materials'] = json.loads(d.get('materials_json', '[]'))
        except (json.JSONDecodeError, TypeError):
            d['materials'] = []
        del d['materials_json']
        return d
    finally:
        conn.close()


def cleanup_expired_records():
    ensure_inquiry_schema()
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn = _get_conn()
    try:
        cursor = conn.execute(
            f'DELETE FROM {INQUIRY_TABLE} WHERE expires_at <= ?', (now_str,)
        )
        deleted = cursor.rowcount
        conn.commit()
        if deleted > 0:
            print(f'[INQUIRY] Cleaned up {deleted} expired inquiry records (TTL={INQUIRY_TTL_DAYS} days)')
        return deleted
    finally:
        conn.close()


def update_inquiry_reply(record_id, reply_json='', status='parsed', forwarded_to=''):
    ensure_inquiry_schema()
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn = _get_conn()
    try:
        conn.execute(
            f'''
            UPDATE {INQUIRY_TABLE}
            SET status = ?, reply_json = ?, reply_received_at = ?, forwarded_to = ?
            WHERE id = ?
            ''',
            (status, reply_json, now_str, forwarded_to, record_id),
        )
        conn.commit()
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
    import re as _re
    return _re.sub(r'\s*\(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\)\s*$', '', subject).strip()


def find_record_by_subject(subject):
    ensure_inquiry_schema()
    clean_subject = _strip_reply_prefix(subject)
    clean_no_ts = _strip_trailing_timestamp(clean_subject)
    conn = _get_conn()
    try:
        candidates = [clean_subject]
        if clean_no_ts != clean_subject:
            candidates.append(clean_no_ts)

        for status_filter in ('sent', None):
            for candidate in candidates:
                if status_filter:
                    row = conn.execute(
                        f"SELECT * FROM {INQUIRY_TABLE} WHERE status = ? AND email_subject = ? ORDER BY created_at DESC LIMIT 1",
                        (status_filter, candidate),
                    ).fetchone()
                else:
                    row = conn.execute(
                        f"SELECT * FROM {INQUIRY_TABLE} WHERE email_subject = ? ORDER BY created_at DESC LIMIT 1",
                        (candidate,),
                    ).fetchone()
                if row:
                    return _row_to_record(row)

                if status_filter:
                    rows = conn.execute(
                        f"SELECT * FROM {INQUIRY_TABLE} WHERE status = ? AND email_subject LIKE ? ORDER BY created_at DESC LIMIT 5",
                        (status_filter, f'%{candidate}%'),
                    ).fetchall()
                else:
                    rows = conn.execute(
                        f"SELECT * FROM {INQUIRY_TABLE} WHERE email_subject LIKE ? ORDER BY created_at DESC LIMIT 1",
                        (f'%{candidate}%',),
                    ).fetchall()
                for row in rows:
                    return _row_to_record(row)

        for candidate in candidates:
            rows = conn.execute(
                f"SELECT * FROM {INQUIRY_TABLE} WHERE status = 'sent' ORDER BY created_at DESC"
            ).fetchall()
            for row in rows:
                d = row_to_dict(row)
                db_subj = str(d.get('email_subject') or '').strip()
                if db_subj and candidate and (db_subj in candidate or candidate in db_subj):
                    try:
                        d['materials'] = json.loads(d.get('materials_json', '[]'))
                    except (json.JSONDecodeError, TypeError):
                        d['materials'] = []
                    del d['materials_json']
                    return d

        short = re.sub(r'\s*[-–—]\s*\d+项物料待询价.*$', '', clean_no_ts).strip()
        if short and short != clean_no_ts:
            for status_filter in ('sent', None):
                if status_filter:
                    rows = conn.execute(
                        f"SELECT * FROM {INQUIRY_TABLE} WHERE status = ? AND email_subject LIKE ? ORDER BY created_at DESC LIMIT 5",
                        (status_filter, f'%{short}%'),
                    ).fetchall()
                else:
                    rows = conn.execute(
                        f"SELECT * FROM {INQUIRY_TABLE} WHERE email_subject LIKE ? ORDER BY created_at DESC LIMIT 5",
                        (f'%{short}%',),
                    ).fetchall()
                for row in rows:
                    return _row_to_record(row)

        return None
    finally:
        conn.close()


def _row_to_record(row):
    d = row_to_dict(row)
    try:
        d['materials'] = json.loads(d.get('materials_json', '[]'))
    except (json.JSONDecodeError, TypeError):
        d['materials'] = []
    del d['materials_json']
    return d


def _normalize_valid_until(valid_until_raw, quotation_date_raw):
    raw = str(valid_until_raw or '').strip()
    if not raw:
        return ''
    try:
        days = int(raw)
        if days > 0:
            qd_str = str(quotation_date_raw or '').strip()
            for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d'):
                try:
                    qd = datetime.strptime(qd_str, fmt)
                    return (qd + timedelta(days=days)).strftime('%Y-%m-%d')
                except ValueError:
                    continue
            return raw
    except (TypeError, ValueError):
        pass
    if re.match(r'^\d{4}-\d{2}-\d{2}', raw):
        return raw[:10]
    return raw


def upsert_price_cache(items):
    ensure_price_cache_schema()
    if not items:
        return 0
    conn = _get_conn()
    try:
        count = 0
        for item in items:
            code = str(item.get('material_code') or '').strip()
            spec = str(item.get('spec') or '').strip()
            raw_qty = item.get('quantity', 0)
            try:
                raw_qty = float(raw_qty)
            except (TypeError, ValueError):
                raw_qty = 0.0
            quantity = raw_qty if _is_carbon_steel(code) else 0.0

            raw_price = item.get('unit_price', 0)
            try:
                price = float(str(raw_price).replace(',', '').strip())
            except (TypeError, ValueError):
                price = 0.0

            usd = item.get('unit_price_usd')
            cny = item.get('unit_price_cny')
            eur = item.get('unit_price_eur')
            rmb = item.get('unit_price_rmb')

            quotation_date_val = str(item.get('quotation_date') or '')
            valid_until_val = _normalize_valid_until(
                item.get('valid_until', ''), quotation_date_val
            )

            preinstall_val = str(item.get('preinstall') or '').strip()
            if preinstall_val not in ('预装', '非预装'):
                preinstall_val = '预装'

            conn.execute(
                f'''
                INSERT OR REPLACE INTO {PRICE_CACHE_TABLE}
                    (material_code, spec, quantity, name, category, unit_price, unit,
                     unit_price_usd, unit_price_cny, unit_price_eur, unit_price_rmb,
                     quotation_date, valid_until, discount, mold_fee, moq, remark,
                     inquirer, source_email, source_record_id, preinstall, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                        COALESCE((SELECT created_at FROM {PRICE_CACHE_TABLE}
                                  WHERE material_code=? AND spec=? AND quantity=?),
                                  datetime('now','localtime')),
                        datetime('now','localtime'))
                ''',
                (
                    code, spec, quantity,
                    str(item.get('name') or ''),
                    str(item.get('category') or ''),
                    price,
                    str(item.get('unit') or ''),
                    usd, cny, eur, rmb,
                    quotation_date_val,
                    valid_until_val,
                    str(item.get('discount') or ''),
                    str(item.get('mold_fee') or ''),
                    str(item.get('moq') or ''),
                    str(item.get('remark') or ''),
                    str(item.get('inquirer') or ''),
                    str(item.get('source_email') or ''),
                    item.get('source_record_id'),
                    preinstall_val,
                    code, spec, quantity,
                ),
            )
            count += 1
        conn.commit()
        return count
    finally:
        conn.close()


def backfill_orphan_cache(source_email: str, items: list, record_id: int):
    if not record_id or not items:
        return
    conn = _get_conn()
    try:
        for item in items:
            code = str(item.get('material_code') or '').strip()
            spec = str(item.get('spec') or '').strip()
            raw_qty = item.get('quantity', 0)
            try:
                raw_qty = float(raw_qty)
            except (TypeError, ValueError):
                raw_qty = 0.0
            conn.execute(
                f"UPDATE {PRICE_CACHE_TABLE} SET source_record_id = ? "
                f"WHERE material_code = ? AND spec = ? AND source_email = ? AND source_record_id IS NULL",
                (record_id, code, spec, source_email),
            )
        record = conn.execute(
            f"SELECT status, reply_json FROM {INQUIRY_TABLE} WHERE id = ?", (record_id,)
        ).fetchone()
        if record and record['status'] == 'sent' and not record['reply_json']:
            reply_data = []
            cache_rows = conn.execute(
                f"SELECT * FROM {PRICE_CACHE_TABLE} WHERE source_record_id = ?", (record_id,)
            ).fetchall()
            for ci in cache_rows:
                reply_data.append({
                    'material_code': ci['material_code'],
                    'name': ci['name'],
                    'spec': ci['spec'],
                    'quantity': ci['quantity'],
                    'unit_price': ci['unit_price'],
                    'unit_price_usd': ci['unit_price_usd'],
                    'unit_price_cny': ci['unit_price_cny'],
                    'unit_price_eur': ci['unit_price_eur'],
                    'unit': ci['unit'],
                    'valid_until': ci['valid_until'],
                    'discount': ci['discount'],
                })
            if reply_data:
                now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                conn.execute(
                    f"UPDATE {INQUIRY_TABLE} SET status='parsed', reply_json=?, reply_received_at=? WHERE id=?",
                    (json.dumps(reply_data, ensure_ascii=False), now_str, record_id),
                )
        conn.commit()
    finally:
        conn.close()


def query_price_cache_batch(items):
    ensure_price_cache_schema()
    results = {}
    conn = _get_conn()
    try:
        now_str = datetime.now().strftime('%Y-%m-%d')
        for item in items:
            code = str(item.get('code') or item.get('material_code') or '').strip()
            spec = str(item.get('spec') or '').strip()
            raw_qty = item.get('quantity', 0)
            try:
                raw_qty = float(raw_qty)
            except (TypeError, ValueError):
                raw_qty = 0.0

            is_cs = _is_carbon_steel(code)
            key = f'{code}|{spec}|{raw_qty}' if is_cs else f'{code}|{spec}'

            if is_cs:
                row = conn.execute(
                    f'SELECT * FROM {PRICE_CACHE_TABLE} WHERE material_code=? AND spec=? AND quantity=?',
                    (code, spec, raw_qty),
                ).fetchone()
                if row:
                    d = row_to_dict(row)
                    d['is_expired'] = bool(d.get('valid_until') and d['valid_until'] < now_str)
                    d['is_carbon_steel'] = True
                    d['match_type'] = 'exact'
                    results[key] = d
                else:
                    nearby_rows = conn.execute(
                        f'SELECT * FROM {PRICE_CACHE_TABLE} WHERE material_code=? AND spec=? ORDER BY ABS(quantity - ?) ASC LIMIT 3',
                        (code, spec, raw_qty),
                    ).fetchall()
                    if nearby_rows:
                        results[key] = {
                            'found': False,
                            'is_carbon_steel': True,
                            'match_type': 'approximate',
                            'nearby': [
                                {
                                    'quantity': row_to_dict(r)['quantity'],
                                    'unit_price': row_to_dict(r)['unit_price'],
                                    'unit_price_usd': row_to_dict(r).get('unit_price_usd'),
                                    'unit_price_cny': row_to_dict(r).get('unit_price_cny'),
                                    'unit_price_eur': row_to_dict(r).get('unit_price_eur'),
                                    'valid_until': row_to_dict(r).get('valid_until', ''),
                                }
                                for r in nearby_rows
                            ],
                        }
                    else:
                        results[key] = {'found': False, 'is_carbon_steel': True, 'match_type': 'none'}
            else:
                row = conn.execute(
                    f'SELECT * FROM {PRICE_CACHE_TABLE} WHERE material_code=? AND spec=? AND quantity=0',
                    (code, spec),
                ).fetchone()
                if row:
                    d = row_to_dict(row)
                    d['is_expired'] = bool(d.get('valid_until') and d['valid_until'] < now_str)
                    d['is_carbon_steel'] = False
                    d['match_type'] = 'exact'
                    results[key] = d
                else:
                    results[key] = {'found': False, 'is_carbon_steel': False, 'match_type': 'none'}
        return results
    finally:
        conn.close()


def list_price_cache(keyword=None, limit=200):
    ensure_price_cache_schema()
    conn = _get_conn()
    try:
        query = f'SELECT * FROM {PRICE_CACHE_TABLE}'
        params = []
        if keyword:
            query += ' WHERE material_code LIKE ? OR name LIKE ? OR spec LIKE ?'
            params = [f'%{keyword}%'] * 3
        query += ' ORDER BY updated_at DESC LIMIT ?'
        params.append(limit)
        rows = conn.execute(query, params).fetchall()
        now_str = datetime.now().strftime('%Y-%m-%d')
        results = []
        for r in rows:
            d = row_to_dict(r)
            d['is_expired'] = bool(d.get('valid_until') and d['valid_until'] < now_str)
            d['is_carbon_steel'] = _is_carbon_steel(d.get('material_code', ''))
            name_val = d.get('name', '') or ''
            d['name'] = name_val[:10]
            results.append(d)
        return results
    finally:
        conn.close()


def get_price_cache_stats():
    ensure_price_cache_schema()
    conn = _get_conn()
    try:
        now_str = datetime.now().strftime('%Y-%m-%d')
        total = conn.execute(f'SELECT COUNT(*) FROM {PRICE_CACHE_TABLE}').fetchone()[0]
        carbon_steel = conn.execute(
            f"SELECT COUNT(*) FROM {PRICE_CACHE_TABLE} WHERE material_code LIKE 'WTP-%' OR material_code LIKE 'WTX-%'"
        ).fetchone()[0]
        valid = conn.execute(
            f"SELECT COUNT(*) FROM {PRICE_CACHE_TABLE} WHERE valid_until IS NULL OR valid_until = '' OR valid_until >= ?",
            (now_str,),
        ).fetchone()[0]
        expired = conn.execute(
            f"SELECT COUNT(*) FROM {PRICE_CACHE_TABLE} WHERE valid_until != '' AND valid_until < ?",
            (now_str,),
        ).fetchone()[0]
        return {
            'total': total,
            'carbon_steel': carbon_steel,
            'other': total - carbon_steel,
            'valid': valid,
            'expired': expired,
        }
    finally:
        conn.close()


def count_inquiry_records_by_status():
    ensure_inquiry_schema()
    conn = _get_conn()
    try:
        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        rows = conn.execute(
            f"SELECT status, COUNT(*) as cnt FROM {INQUIRY_TABLE} WHERE expires_at > ? GROUP BY status",
            (now_str,),
        ).fetchall()
        counts = {}
        for r in rows:
            d = row_to_dict(r)
            counts[d['status']] = d['cnt']
        forwarded = conn.execute(
            f"SELECT COUNT(*) FROM {INQUIRY_TABLE} WHERE forwarded_to IS NOT NULL AND forwarded_to != '' AND expires_at > ?",
            (now_str,),
        ).fetchone()[0]
        return {
            'sent': counts.get('sent', 0),
            'parsed': counts.get('parsed', 0),
            'parse_failed': counts.get('parse_failed', 0) + counts.get('forwarded_parse_failed', 0),
            'forwarded': forwarded,
            'total': sum(counts.values()),
        }
    finally:
        conn.close()


def delete_price_cache_item(item_id):
    ensure_price_cache_schema()
    conn = _get_conn()
    try:
        cursor = conn.execute(f'DELETE FROM {PRICE_CACHE_TABLE} WHERE id = ?', (item_id,))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def delete_price_cache_items(item_ids):
    ensure_price_cache_schema()
    if not item_ids:
        return 0
    conn = _get_conn()
    try:
        placeholders = ','.join('?' for _ in item_ids)
        cursor = conn.execute(
            f'DELETE FROM {PRICE_CACHE_TABLE} WHERE id IN ({placeholders})',
            list(item_ids),
        )
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()


def delete_expired_price_cache(days=7):
    """删除有效期已超过 days 天的价格缓存。

    与前端 expiryPriority 中“过期超7天即隐藏”的口径一致：
    valid_until 非空且早于 (今天 - days 天) 的记录会被清除。
    """
    ensure_price_cache_schema()
    try:
        days_int = int(days)
    except (TypeError, ValueError):
        days_int = 7
    if days_int < 0:
        days_int = 0
    cutoff = (datetime.now() - timedelta(days=days_int)).strftime('%Y-%m-%d')
    conn = _get_conn()
    try:
        cursor = conn.execute(
            f"DELETE FROM {PRICE_CACHE_TABLE} "
            f"WHERE valid_until IS NOT NULL AND valid_until != '' AND valid_until < ?",
            (cutoff,),
        )
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()


# ====================================================================
# 询价项（ks_inquiry_items）—— 网页填价工作表
# ====================================================================

def ensure_inquiry_items_schema():
    conn = _get_conn()
    try:
        conn.execute(
            f'''
            CREATE TABLE IF NOT EXISTS {INQUIRY_ITEMS_TABLE} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_name TEXT NOT NULL DEFAULT '',
                business_name TEXT NOT NULL DEFAULT '',
                material_code TEXT NOT NULL DEFAULT '',
                name TEXT NOT NULL DEFAULT '',
                spec TEXT NOT NULL DEFAULT '',
                quantity REAL NOT NULL DEFAULT 0,
                unit_weight REAL,
                total_weight REAL,
                unit TEXT NOT NULL DEFAULT '',
                unit_price_usd REAL,
                unit_price_cny REAL,
                unit_price_eur REAL,
                unit_price_rmb REAL,
                quotation_date TEXT DEFAULT '',
                valid_until TEXT DEFAULT '',
                discount TEXT DEFAULT '',
                remark TEXT DEFAULT '',
                inquirer TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending',
                source TEXT NOT NULL DEFAULT 'bom',
                preinstall TEXT NOT NULL DEFAULT '预装',
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                UNIQUE(project_name, material_code, spec)
            )
            '''
        )
        _ensure_inquiry_items_columns(conn)
        conn.execute(
            f'CREATE INDEX IF NOT EXISTS idx_{INQUIRY_ITEMS_TABLE}_status '
            f'ON {INQUIRY_ITEMS_TABLE}(status)'
        )
        conn.execute(
            f'CREATE INDEX IF NOT EXISTS idx_{INQUIRY_ITEMS_TABLE}_project '
            f'ON {INQUIRY_ITEMS_TABLE}(project_name)'
        )
        conn.commit()
    finally:
        conn.close()


def _ensure_inquiry_items_columns(conn):
    existing = {row['name'] for row in conn.execute(f'PRAGMA table_info({INQUIRY_ITEMS_TABLE})').fetchall()}
    _add_column(conn, INQUIRY_ITEMS_TABLE, existing, 'total_weight', 'total_weight REAL')
    _add_column(conn, INQUIRY_ITEMS_TABLE, existing, 'unit_weight', 'unit_weight REAL')
    _add_column(conn, INQUIRY_ITEMS_TABLE, existing, 'unit_price_usd', 'unit_price_usd REAL')
    _add_column(conn, INQUIRY_ITEMS_TABLE, existing, 'unit_price_cny', 'unit_price_cny REAL')
    _add_column(conn, INQUIRY_ITEMS_TABLE, existing, 'unit_price_eur', 'unit_price_eur REAL')
    _add_column(conn, INQUIRY_ITEMS_TABLE, existing, 'unit_price_rmb', 'unit_price_rmb REAL')
    _add_column(conn, INQUIRY_ITEMS_TABLE, existing, 'business_name', "business_name TEXT NOT NULL DEFAULT ''")
    _add_column(conn, INQUIRY_ITEMS_TABLE, existing, 'quotation_date', "quotation_date TEXT DEFAULT ''")
    _add_column(conn, INQUIRY_ITEMS_TABLE, existing, 'valid_until', "valid_until TEXT DEFAULT ''")
    _add_column(conn, INQUIRY_ITEMS_TABLE, existing, 'discount', "discount TEXT DEFAULT ''")
    _add_column(conn, INQUIRY_ITEMS_TABLE, existing, 'remark', "remark TEXT DEFAULT ''")
    _add_column(conn, INQUIRY_ITEMS_TABLE, existing, 'inquirer', "inquirer TEXT DEFAULT ''")
    _add_column(conn, INQUIRY_ITEMS_TABLE, existing, 'source', "source TEXT DEFAULT 'bom'")
    _add_column(conn, INQUIRY_ITEMS_TABLE, existing, 'unit', "unit TEXT DEFAULT ''")
    _add_column(conn, INQUIRY_ITEMS_TABLE, existing, 'preinstall', "preinstall TEXT NOT NULL DEFAULT '预装'")
    _add_column(conn, INQUIRY_ITEMS_TABLE, existing, 'pricing_method', "pricing_method TEXT DEFAULT ''")
    _add_column(conn, INQUIRY_ITEMS_TABLE, existing, 'price_category', "price_category TEXT DEFAULT ''")
    _add_column(conn, INQUIRY_ITEMS_TABLE, existing, 'mold_fee', "mold_fee TEXT DEFAULT ''")
    _add_column(conn, INQUIRY_ITEMS_TABLE, existing, 'moq', "moq TEXT DEFAULT ''")
    _add_column(conn, INQUIRY_ITEMS_TABLE, existing, 'shipping_company', "shipping_company TEXT DEFAULT ''")


def _row_to_item(row):
    d = row_to_dict(row)
    return d


def insert_inquiry_items(items, source='bom'):
    """插入或合并询价项。

    相同 (project_name, material_code, spec) 的项会合并数量（累加），
    并更新重量。返回新增的条数（不含合并到已有记录的）。
    """
    ensure_inquiry_items_schema()
    if not items:
        return 0
    conn = _get_conn()
    inserted = 0
    try:
        for item in items:
            code = str(item.get('material_code') or item.get('code') or '').strip()
            spec = str(item.get('spec') or '').strip()
            project_name = str(item.get('project_name') or '').strip()
            if not code:
                continue
            try:
                quantity = float(item.get('quantity') or 0)
            except (TypeError, ValueError):
                quantity = 0.0

            unit_weight = item.get('unit_weight')
            if unit_weight is not None:
                try:
                    unit_weight = round(float(unit_weight), 4)
                except (TypeError, ValueError):
                    unit_weight = None

            total_weight = item.get('total_weight')
            if total_weight is not None:
                try:
                    total_weight = round(float(total_weight), 2)
                except (TypeError, ValueError):
                    total_weight = None

            # 检查是否已存在相同 (project_name, material_code, spec)
            existing = conn.execute(
                f'SELECT id, quantity FROM {INQUIRY_ITEMS_TABLE} '
                f'WHERE project_name=? AND material_code=? AND spec=?',
                (project_name, code, spec),
            ).fetchone()

            try:
                if existing:
                    merged_qty = round(float(existing['quantity']) + quantity, 4)
                    merged_total = round(total_weight or 0, 2) if total_weight is not None else None
                    conn.execute(
                        f'UPDATE {INQUIRY_ITEMS_TABLE} '
                        f'SET quantity=?, unit_weight=COALESCE(?, unit_weight), '
                        f'total_weight=COALESCE(?, total_weight), '
                        f'updated_at=datetime(\'now\',\'localtime\') '
                        f'WHERE id=?',
                        (merged_qty, unit_weight, merged_total, existing['id']),
                    )
                else:
                    _preinstall_val = str(item.get('preinstall') or '').strip()
                    if _preinstall_val not in ('预装', '非预装'):
                        _preinstall_val = '预装'
                    _business_val = str(item.get('business_name') or item.get('inquirer') or '').strip()
                    conn.execute(
                        f'''
                        INSERT INTO {INQUIRY_ITEMS_TABLE}
                            (project_name, business_name, material_code, name, spec, quantity,
                             unit_weight, total_weight, unit, status, source, inquirer, preinstall)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
                        ''',
                        (
                            project_name, _business_val, code,
                            str(item.get('name') or ''),
                            spec,
                            quantity,
                            unit_weight,
                            total_weight,
                            str(item.get('unit') or ''),
                            source,
                            str(item.get('inquirer') or ''),
                            _preinstall_val,
                        ),
                    )
                    inserted += 1
            except Exception as exc:
                print(f'[INQUIRY-ITEMS] upsert failed for {code}: {exc}')
        conn.commit()
        return inserted
    finally:
        conn.close()


def list_inquiry_items(status=None, keyword=None, project=None, business=None, page=1, page_size=50):
    ensure_inquiry_items_schema()
    conn = _get_conn()
    try:
        conditions = []
        params = []
        if status and status != 'all':
            conditions.append('status = ?')
            params.append(status)
        if project:
            conditions.append('project_name = ?')
            params.append(project)
        if business:
            conditions.append("COALESCE(NULLIF(business_name, ''), inquirer) = ?")
            params.append(business)
        if keyword:
            conditions.append('(material_code LIKE ? OR name LIKE ? OR spec LIKE ?)')
            params.extend([f'%{keyword}%'] * 3)
        where_clause = (' WHERE ' + ' AND '.join(conditions)) if conditions else ''

        total = conn.execute(
            f'SELECT COUNT(*) FROM {INQUIRY_ITEMS_TABLE}{where_clause}', params
        ).fetchone()[0]

        offset = max(0, (page - 1)) * page_size
        rows = conn.execute(
            f'SELECT * FROM {INQUIRY_ITEMS_TABLE}{where_clause} '
            f'ORDER BY created_at DESC LIMIT ? OFFSET ?',
            params + [page_size, offset],
        ).fetchall()
        items = [_row_to_item(r) for r in rows]
        return {'items': items, 'total': total, 'page': page, 'page_size': page_size}
    finally:
        conn.close()


def list_inquiry_projects():
    ensure_inquiry_items_schema()
    conn = _get_conn()
    try:
        rows = conn.execute(
            f"SELECT DISTINCT project_name FROM {INQUIRY_ITEMS_TABLE} "
            f"WHERE project_name != '' ORDER BY project_name"
        ).fetchall()
        return [row['project_name'] for row in rows]
    finally:
        conn.close()


def list_inquiry_businesses():
    ensure_inquiry_items_schema()
    conn = _get_conn()
    try:
        rows = conn.execute(
            f"SELECT DISTINCT COALESCE(NULLIF(business_name, ''), inquirer) AS business "
            f"FROM {INQUIRY_ITEMS_TABLE} "
            f"WHERE COALESCE(NULLIF(business_name, ''), inquirer) != '' "
            f"ORDER BY business"
        ).fetchall()
        return [row['business'] for row in rows]
    finally:
        conn.close()


def get_inquiry_item(item_id):
    ensure_inquiry_items_schema()
    conn = _get_conn()
    try:
        row = conn.execute(
            f'SELECT * FROM {INQUIRY_ITEMS_TABLE} WHERE id = ?', (item_id,)
        ).fetchone()
        return _row_to_item(row) if row else None
    finally:
        conn.close()


def update_inquiry_item(item_id, **fields):
    ensure_inquiry_items_schema()
    allowed = {
        'project_name', 'business_name', 'material_code', 'name', 'spec', 'quantity',
        'unit_weight', 'total_weight', 'unit',
        'unit_price_usd', 'unit_price_cny', 'unit_price_eur', 'unit_price_rmb',
        'quotation_date', 'valid_until', 'discount', 'remark', 'inquirer', 'status',
        'preinstall', 'pricing_method', 'price_category', 'mold_fee', 'moq', 'shipping_company',
    }
    updates = []
    params = []
    for key, value in fields.items():
        if key in allowed:
            updates.append(f'{key} = ?')
            params.append(value)
    if not updates:
        return False
    updates.append("updated_at = datetime('now','localtime')")
    params.append(item_id)
    conn = _get_conn()
    try:
        cursor = conn.execute(
            f'UPDATE {INQUIRY_ITEMS_TABLE} SET {", ".join(updates)} WHERE id = ?',
            params,
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def delete_inquiry_item(item_id):
    ensure_inquiry_items_schema()
    conn = _get_conn()
    try:
        cursor = conn.execute(
            f'DELETE FROM {INQUIRY_ITEMS_TABLE} WHERE id = ?', (item_id,)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def delete_inquiry_case(project_name):
    """删除整个案件：询价项 + 案件锁定 + 案件备注 + 附件记录。

    返回 {'item_count': 删除的询价项条数, 'attachments': [stored_name, ...]}（供磁盘清理）。
    """
    ensure_inquiry_items_schema()
    project_name = str(project_name or '').strip()
    conn = _get_conn()
    try:
        cursor = conn.execute(
            f'DELETE FROM {INQUIRY_ITEMS_TABLE} WHERE project_name = ?', (project_name,)
        )
        item_count = cursor.rowcount

        stored_names = []
        for ensure_fn, table in (
            (ensure_case_lock_schema, CASE_LOCK_TABLE),
            (ensure_case_meta_schema, CASE_META_TABLE),
            (ensure_attachment_schema, ATTACHMENT_TABLE),
        ):
            try:
                ensure_fn()
                if table == ATTACHMENT_TABLE:
                    rows = conn.execute(
                        f'SELECT stored_name FROM {table} WHERE project_name = ?', (project_name,)
                    ).fetchall()
                    stored_names = [
                        row_to_dict(r).get('stored_name')
                        for r in rows
                        if row_to_dict(r).get('stored_name')
                    ]
                conn.execute(f'DELETE FROM {table} WHERE project_name = ?', (project_name,))
            except Exception as exc:
                print(f'[INQUIRY-ITEMS] delete {table} for case failed: {exc}')

        conn.commit()
        return {'item_count': item_count, 'attachments': stored_names}
    finally:
        conn.close()


def count_inquiry_items_by_status():
    ensure_inquiry_items_schema()
    conn = _get_conn()
    try:
        rows = conn.execute(
            f"SELECT status, COUNT(*) as cnt FROM {INQUIRY_ITEMS_TABLE} GROUP BY status"
        ).fetchall()
        counts = {'pending': 0, 'priced': 0, 'total': 0}
        for r in rows:
            d = row_to_dict(r)
            status = d['status']
            counts[status] = counts.get(status, 0) + d['cnt']
            counts['total'] += d['cnt']
        return counts
    finally:
        conn.close()


# ====================================================================
# 案件金额锁定（保存后 7 天内可改）
# ====================================================================

def ensure_case_lock_schema():
    conn = _get_conn()
    try:
        conn.execute(
            f'''
            CREATE TABLE IF NOT EXISTS {CASE_LOCK_TABLE} (
                project_name TEXT PRIMARY KEY,
                last_priced_at TEXT,
                priced_by TEXT DEFAULT ''
            )
            '''
        )
        conn.commit()
    finally:
        conn.close()


def get_case_lock(project_name):
    ensure_case_lock_schema()
    conn = _get_conn()
    try:
        row = conn.execute(
            f'SELECT * FROM {CASE_LOCK_TABLE} WHERE project_name = ?', (project_name,)
        ).fetchone()
        return row_to_dict(row) if row else None
    finally:
        conn.close()


def list_case_locks(project_names):
    ensure_case_lock_schema()
    if not project_names:
        return {}
    conn = _get_conn()
    try:
        placeholders = ','.join('?' for _ in project_names)
        rows = conn.execute(
            f'SELECT * FROM {CASE_LOCK_TABLE} WHERE project_name IN ({placeholders})',
            list(project_names),
        ).fetchall()
        return {row['project_name']: row_to_dict(row) for row in rows}
    finally:
        conn.close()


def upsert_case_lock(project_name, priced_by=''):
    ensure_case_lock_schema()
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn = _get_conn()
    try:
        conn.execute(
            f'''
            INSERT INTO {CASE_LOCK_TABLE} (project_name, last_priced_at, priced_by)
            VALUES (?, ?, ?)
            ON CONFLICT(project_name) DO UPDATE SET
                last_priced_at = excluded.last_priced_at,
                priced_by = excluded.priced_by
            ''',
            (str(project_name or ''), now_str, str(priced_by or '')),
        )
        conn.commit()
    finally:
        conn.close()


# ====================================================================
# 吨价历史（保存 1 年，可回溯）
# ====================================================================

def ensure_ton_history_schema():
    conn = _get_conn()
    try:
        conn.execute(
            f'''
            CREATE TABLE IF NOT EXISTS {TON_HISTORY_TABLE} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_name TEXT DEFAULT '',
                material_code TEXT DEFAULT '',
                ton_type TEXT DEFAULT '',
                length_tier TEXT DEFAULT '',
                weight_tier TEXT DEFAULT '',
                ton_price REAL,
                prices_json TEXT DEFAULT '',
                valid_until TEXT DEFAULT '',
                saved_by TEXT DEFAULT '',
                saved_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                expires_at TEXT NOT NULL,
                exchange_rate_usd REAL,
                exchange_rate_eur REAL,
                exchange_rate_rmb_fx REAL,
                points_usd REAL,
                points_eur REAL,
                points_rmb_fx REAL,
                rate_category TEXT DEFAULT ''
            )
            '''
        )
        # 幂等加列（兼容旧表：填写时使用的汇率/点数快照）
        existing = {r[1] for r in conn.execute(
            f'PRAGMA table_info({TON_HISTORY_TABLE})').fetchall()}
        _add_column(conn, TON_HISTORY_TABLE, existing, 'exchange_rate_usd', 'exchange_rate_usd REAL')
        _add_column(conn, TON_HISTORY_TABLE, existing, 'exchange_rate_eur', 'exchange_rate_eur REAL')
        _add_column(conn, TON_HISTORY_TABLE, existing, 'exchange_rate_rmb_fx', 'exchange_rate_rmb_fx REAL')
        _add_column(conn, TON_HISTORY_TABLE, existing, 'points_usd', 'points_usd REAL')
        _add_column(conn, TON_HISTORY_TABLE, existing, 'points_eur', 'points_eur REAL')
        _add_column(conn, TON_HISTORY_TABLE, existing, 'points_rmb_fx', 'points_rmb_fx REAL')
        _add_column(conn, TON_HISTORY_TABLE, existing, 'rate_category', "rate_category TEXT DEFAULT ''")
        conn.execute(
            f'CREATE INDEX IF NOT EXISTS idx_{TON_HISTORY_TABLE}_project '
            f'ON {TON_HISTORY_TABLE}(project_name)'
        )
        conn.execute(
            f'CREATE INDEX IF NOT EXISTS idx_{TON_HISTORY_TABLE}_expires '
            f'ON {TON_HISTORY_TABLE}(expires_at)'
        )
        conn.commit()
    finally:
        conn.close()


def insert_ton_price_history(records):
    ensure_ton_history_schema()
    if not records:
        return 0
    expires = (datetime.now() + timedelta(days=TON_HISTORY_TTL_DAYS)).strftime('%Y-%m-%d %H:%M:%S')
    conn = _get_conn()
    try:
        count = 0
        for r in records:
            conn.execute(
                f'''
                INSERT INTO {TON_HISTORY_TABLE}
                    (project_name, material_code, ton_type, length_tier, weight_tier,
                     ton_price, prices_json, valid_until, saved_by, expires_at,
                     exchange_rate_usd, exchange_rate_eur, exchange_rate_rmb_fx,
                     points_usd, points_eur, points_rmb_fx, rate_category)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''',
                (
                    str(r.get('project_name') or ''),
                    str(r.get('material_code') or ''),
                    str(r.get('ton_type') or ''),
                    str(r.get('length_tier') or ''),
                    str(r.get('weight_tier') or ''),
                    r.get('ton_price'),
                    json.dumps(r.get('prices') or {}, ensure_ascii=False),
                    str(r.get('valid_until') or ''),
                    str(r.get('saved_by') or ''),
                    expires,
                    r.get('exchange_rate_usd'),
                    r.get('exchange_rate_eur'),
                    r.get('exchange_rate_rmb_fx'),
                    r.get('points_usd'),
                    r.get('points_eur'),
                    r.get('points_rmb_fx'),
                    str(r.get('rate_category') or ''),
                ),
            )
            count += 1
        conn.commit()
        return count
    finally:
        conn.close()


def list_ton_price_history(project=None, page=1, page_size=50):
    ensure_ton_history_schema()
    conn = _get_conn()
    try:
        conditions = ['expires_at > ?']
        params = [datetime.now().strftime('%Y-%m-%d %H:%M:%S')]
        if project:
            conditions.append('project_name = ?')
            params.append(project)
        where_clause = ' WHERE ' + ' AND '.join(conditions)
        total = conn.execute(
            f'SELECT COUNT(*) FROM {TON_HISTORY_TABLE}{where_clause}', params
        ).fetchone()[0]
        offset = max(0, (page - 1)) * page_size
        rows = conn.execute(
            f'SELECT * FROM {TON_HISTORY_TABLE}{where_clause} '
            f'ORDER BY saved_at DESC, id DESC LIMIT ? OFFSET ?',
            params + [page_size, offset],
        ).fetchall()
        items = []
        for r in rows:
            d = row_to_dict(r)
            try:
                d['prices'] = json.loads(d.get('prices_json') or '{}')
            except (json.JSONDecodeError, TypeError):
                d['prices'] = {}
            d.pop('prices_json', None)
            items.append(d)
        return {'items': items, 'total': total, 'page': page, 'page_size': page_size}
    finally:
        conn.close()


def cleanup_expired_ton_history():
    ensure_ton_history_schema()
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn = _get_conn()
    try:
        cursor = conn.execute(
            f'DELETE FROM {TON_HISTORY_TABLE} WHERE expires_at <= ?', (now_str,)
        )
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()


# ====================================================================
# 案件备注（提交询价项时附带，admin 填价参考）
# ====================================================================

def ensure_case_meta_schema():
    conn = _get_conn()
    try:
        conn.execute(
            f'''
            CREATE TABLE IF NOT EXISTS {CASE_META_TABLE} (
                project_name TEXT PRIMARY KEY,
                remark TEXT DEFAULT '',
                pricer_remark TEXT DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )
            '''
        )
        cols = {row[1] for row in conn.execute(f'PRAGMA table_info({CASE_META_TABLE})').fetchall()}
        if 'pricer_remark' not in cols:
            conn.execute(f'ALTER TABLE {CASE_META_TABLE} ADD COLUMN pricer_remark TEXT DEFAULT \'\'')
        if 'pack' not in cols:
            conn.execute(f'ALTER TABLE {CASE_META_TABLE} ADD COLUMN pack TEXT DEFAULT \'\'')
        conn.commit()
    finally:
        conn.close()


def get_case_meta(project_name):
    ensure_case_meta_schema()
    conn = _get_conn()
    try:
        row = conn.execute(
            f'SELECT * FROM {CASE_META_TABLE} WHERE project_name = ?', (project_name,)
        ).fetchone()
        return row_to_dict(row) if row else None
    finally:
        conn.close()


def list_case_metas(project_names):
    ensure_case_meta_schema()
    if not project_names:
        return {}
    conn = _get_conn()
    try:
        placeholders = ','.join('?' for _ in project_names)
        rows = conn.execute(
            f'SELECT * FROM {CASE_META_TABLE} WHERE project_name IN ({placeholders})',
            list(project_names),
        ).fetchall()
        return {row['project_name']: row_to_dict(row) for row in rows}
    finally:
        conn.close()


def upsert_case_meta(project_name, remark=None, pricer_remark=None, pack=None):
    """插入或更新案件备注。

    remark: 业务备注（提交询价项时附带），传 None 表示不修改。
    pricer_remark: 报价人员备注，传 None 表示不修改。
    pack: 案件级包装类型（jybz/tietuo），传 None 表示不修改。
    """
    ensure_case_meta_schema()
    conn = _get_conn()
    try:
        existing = conn.execute(
            f'SELECT remark, pricer_remark, pack FROM {CASE_META_TABLE} WHERE project_name = ?',
            (str(project_name or ''),),
        ).fetchone()
        old_remark = existing['remark'] if existing else ''
        old_pricer = existing['pricer_remark'] if existing else ''
        old_pack = existing['pack'] if existing else ''
        new_remark = old_remark if remark is None else str(remark or '')
        new_pricer = old_pricer if pricer_remark is None else str(pricer_remark or '')
        new_pack = old_pack if pack is None else str(pack or '')
        conn.execute(
            f'''
            INSERT INTO {CASE_META_TABLE} (project_name, remark, pricer_remark, pack)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(project_name) DO UPDATE SET
                remark = excluded.remark,
                pricer_remark = excluded.pricer_remark,
                pack = excluded.pack,
                updated_at = datetime('now','localtime')
            ''',
            (str(project_name or ''), new_remark, new_pricer, new_pack),
        )
        conn.commit()
    finally:
        conn.close()


# ====================================================================
# 案件附件（提交询价项时上传，存本地服务器文件夹）
# ====================================================================

def ensure_attachment_schema():
    conn = _get_conn()
    try:
        conn.execute(
            f'''
            CREATE TABLE IF NOT EXISTS {ATTACHMENT_TABLE} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_name TEXT DEFAULT '',
                original_name TEXT DEFAULT '',
                stored_name TEXT NOT NULL,
                file_size INTEGER DEFAULT 0,
                uploaded_by TEXT DEFAULT '',
                uploaded_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )
            '''
        )
        conn.execute(
            f'CREATE INDEX IF NOT EXISTS idx_{ATTACHMENT_TABLE}_project '
            f'ON {ATTACHMENT_TABLE}(project_name)'
        )
        conn.commit()
    finally:
        conn.close()


def insert_attachment(project_name, original_name, stored_name, file_size, uploaded_by=''):
    ensure_attachment_schema()
    conn = _get_conn()
    try:
        cursor = conn.execute(
            f'''
            INSERT INTO {ATTACHMENT_TABLE}
                (project_name, original_name, stored_name, file_size, uploaded_by)
            VALUES (?, ?, ?, ?, ?)
            ''',
            (
                str(project_name or ''),
                str(original_name or ''),
                str(stored_name or ''),
                int(file_size or 0),
                str(uploaded_by or ''),
            ),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def list_attachments(project_name=None):
    ensure_attachment_schema()
    conn = _get_conn()
    try:
        if project_name is None:
            rows = conn.execute(
                f'SELECT * FROM {ATTACHMENT_TABLE} ORDER BY uploaded_at DESC'
            ).fetchall()
        else:
            rows = conn.execute(
                f'SELECT * FROM {ATTACHMENT_TABLE} WHERE project_name = ? ORDER BY uploaded_at DESC',
                (project_name,),
            ).fetchall()
        return [row_to_dict(r) for r in rows]
    finally:
        conn.close()


def list_attachments_batch(project_names):
    ensure_attachment_schema()
    if not project_names:
        return {}
    conn = _get_conn()
    try:
        placeholders = ','.join('?' for _ in project_names)
        rows = conn.execute(
            f'SELECT * FROM {ATTACHMENT_TABLE} WHERE project_name IN ({placeholders}) '
            f'ORDER BY uploaded_at DESC',
            list(project_names),
        ).fetchall()
        result = {}
        for r in rows:
            d = row_to_dict(r)
            result.setdefault(d['project_name'], []).append(d)
        return result
    finally:
        conn.close()


def get_attachment(attachment_id):
    ensure_attachment_schema()
    conn = _get_conn()
    try:
        row = conn.execute(
            f'SELECT * FROM {ATTACHMENT_TABLE} WHERE id = ?', (attachment_id,)
        ).fetchone()
        return row_to_dict(row) if row else None
    finally:
        conn.close()


def delete_attachment(attachment_id):
    ensure_attachment_schema()
    conn = _get_conn()
    try:
        cursor = conn.execute(
            f'DELETE FROM {ATTACHMENT_TABLE} WHERE id = ?', (attachment_id,)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()
