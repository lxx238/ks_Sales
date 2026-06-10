import json
import re
from datetime import datetime, timedelta

from backend.config.settings import get_db_connection
from backend.utils.helpers import row_to_dict


INQUIRY_TABLE = 'ks_inquiry_records'
PRICE_CACHE_TABLE = 'ks_inquiry_price_cache'

INQUIRY_TTL_DAYS = 90


def _is_carbon_steel(material_code):
    code = str(material_code or '').strip().upper()
    return code.startswith('WTP-') or code.startswith('WTX-')


def _get_conn():
    return get_db_connection()


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
    if 'reply_json' not in existing:
        conn.execute(f'ALTER TABLE {INQUIRY_TABLE} ADD COLUMN reply_json TEXT DEFAULT \'\'')
    if 'reply_received_at' not in existing:
        conn.execute(f'ALTER TABLE {INQUIRY_TABLE} ADD COLUMN reply_received_at TEXT')
    if 'forwarded_to' not in existing:
        conn.execute(f'ALTER TABLE {INQUIRY_TABLE} ADD COLUMN forwarded_to TEXT DEFAULT \'\'')
    if 'remark' not in existing:
        conn.execute(f'ALTER TABLE {INQUIRY_TABLE} ADD COLUMN remark TEXT DEFAULT \'\'')


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
    if 'unit_price_usd' not in existing:
        conn.execute(f'ALTER TABLE {PRICE_CACHE_TABLE} ADD COLUMN unit_price_usd REAL')
    if 'unit_price_cny' not in existing:
        conn.execute(f'ALTER TABLE {PRICE_CACHE_TABLE} ADD COLUMN unit_price_cny REAL')
    if 'unit_price_eur' not in existing:
        conn.execute(f'ALTER TABLE {PRICE_CACHE_TABLE} ADD COLUMN unit_price_eur REAL')


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

            quotation_date_val = str(item.get('quotation_date') or '')
            valid_until_val = _normalize_valid_until(
                item.get('valid_until', ''), quotation_date_val
            )

            conn.execute(
                f'''
                INSERT OR REPLACE INTO {PRICE_CACHE_TABLE}
                    (material_code, spec, quantity, name, category, unit_price, unit,
                     unit_price_usd, unit_price_cny, unit_price_eur,
                     quotation_date, valid_until, discount, inquirer, source_email,
                     source_record_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
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
                    usd, cny, eur,
                    quotation_date_val,
                    valid_until_val,
                    str(item.get('discount') or ''),
                    str(item.get('inquirer') or ''),
                    str(item.get('source_email') or ''),
                    item.get('source_record_id'),
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
