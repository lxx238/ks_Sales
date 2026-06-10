import json
from datetime import datetime, timedelta

from backend.config.settings import get_db_connection
from backend.utils.helpers import row_to_dict

TABLE = 'ks_quotation_logs'

def _ts(dt):
    return dt.isoformat(timespec='seconds').replace('T', ' ')

CREATE_TABLE_SQL = f'''
CREATE TABLE IF NOT EXISTS {TABLE} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL DEFAULT '',
    group_name TEXT NOT NULL DEFAULT '',
    project_name TEXT NOT NULL DEFAULT '',
    bom_filename TEXT NOT NULL DEFAULT '',
    matrix_filename TEXT NOT NULL DEFAULT '',
    case_type TEXT NOT NULL DEFAULT '',
    match_stats TEXT NOT NULL DEFAULT '{{}}',
    output_file_ids TEXT NOT NULL DEFAULT '[]',
    sheet_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'success',
    error_message TEXT NOT NULL DEFAULT '',
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
)
'''

INDEX_SQL = [
    f'CREATE INDEX IF NOT EXISTS idx_{TABLE}_username ON {TABLE} (username)',
    f'CREATE INDEX IF NOT EXISTS idx_{TABLE}_group ON {TABLE} (group_name)',
    f'CREATE INDEX IF NOT EXISTS idx_{TABLE}_created ON {TABLE} (created_at)',
    f'CREATE INDEX IF NOT EXISTS idx_{TABLE}_status ON {TABLE} (status)',
]


def _get_conn():
    return get_db_connection()


def ensure_quotation_log_schema():
    conn = _get_conn()
    try:
        conn.execute(CREATE_TABLE_SQL)
        for sql in INDEX_SQL:
            conn.execute(sql)
        conn.commit()
    finally:
        conn.close()


def insert_log(username, group_name, project_name, bom_filename, matrix_filename,
               case_type, match_stats, output_file_ids, sheet_count, status,
               error_message, duration_ms):
    ensure_quotation_log_schema()
    conn = _get_conn()
    try:
        conn.execute(
            f'''INSERT INTO {TABLE} (
                username, group_name, project_name, bom_filename, matrix_filename,
                case_type, match_stats, output_file_ids, sheet_count, status,
                error_message, duration_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (
                str(username or ''),
                str(group_name or ''),
                str(project_name or ''),
                str(bom_filename or ''),
                str(matrix_filename or ''),
                str(case_type or ''),
                json.dumps(match_stats or {}, ensure_ascii=False),
                json.dumps(output_file_ids or [], ensure_ascii=False),
                int(sheet_count or 0),
                str(status or 'success'),
                str(error_message or ''),
                int(duration_ms or 0),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def _add_exclude_usernames(clauses, params, exclude_usernames):
    if exclude_usernames:
        placeholders = ','.join(['?'] * len(exclude_usernames))
        clauses.append(f"username NOT IN ({placeholders})")
        params.extend(exclude_usernames)


def _build_where(clauses, params, start, end, username, group_name, status, exclude_usernames=None):
    if start:
        clauses.append("created_at >= ?")
        params.append(start)
    if end:
        clauses.append("created_at <= ?")
        params.append(end)
    if username:
        clauses.append("username = ?")
        params.append(username)
    if group_name:
        clauses.append("group_name = ?")
        params.append(group_name)
    if status:
        clauses.append("status = ?")
        params.append(status)
    _add_exclude_usernames(clauses, params, exclude_usernames)


def query_logs(start=None, end=None, username=None, group_name=None,
               status=None, limit=100, offset=0, exclude_usernames=None):
    ensure_quotation_log_schema()
    conn = _get_conn()
    try:
        clauses = []
        params = []
        _build_where(clauses, params, start, end, username, group_name, status, exclude_usernames)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ''
        rows = conn.execute(
            f'SELECT * FROM {TABLE} {where} ORDER BY id DESC LIMIT ? OFFSET ?',
            params + [limit, offset],
        ).fetchall()
        count_row = conn.execute(f'SELECT COUNT(*) FROM {TABLE} {where}', params).fetchone()
        return [row_to_dict(r) for r in rows], count_row[0]
    finally:
        conn.close()


def get_overview_stats(exclude_usernames=None):
    ensure_quotation_log_schema()
    conn = _get_conn()
    try:
        now = datetime.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat(timespec='seconds').replace('T', ' ')
        week_start = (now - timedelta(days=now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0).isoformat(timespec='seconds').replace('T', ' ')
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat(timespec='seconds').replace('T', ' ')

        excl_sql = ''
        excl_params = []
        if exclude_usernames:
            placeholders = ','.join(['?'] * len(exclude_usernames))
            excl_sql = f" AND username NOT IN ({placeholders})"
            excl_params = list(exclude_usernames)

        today_count = conn.execute(
            f"SELECT COUNT(*) FROM {TABLE} WHERE created_at >= ? AND status = 'success'{excl_sql}",
            (today_start,) + tuple(excl_params),
        ).fetchone()[0]

        week_count = conn.execute(
            f"SELECT COUNT(*) FROM {TABLE} WHERE created_at >= ? AND status = 'success'{excl_sql}",
            (week_start,) + tuple(excl_params),
        ).fetchone()[0]

        month_count = conn.execute(
            f"SELECT COUNT(*) FROM {TABLE} WHERE created_at >= ? AND status = 'success'{excl_sql}",
            (month_start,) + tuple(excl_params),
        ).fetchone()[0]

        total_count = conn.execute(
            f"SELECT COUNT(*) FROM {TABLE} WHERE status = 'success'{excl_sql}",
            tuple(excl_params),
        ).fetchone()[0]

        active_users_today = conn.execute(
            f"SELECT COUNT(DISTINCT username) FROM {TABLE} WHERE created_at >= ? AND status = 'success'{excl_sql}",
            (today_start,) + tuple(excl_params),
        ).fetchone()[0]

        active_users_week = conn.execute(
            f"SELECT COUNT(DISTINCT username) FROM {TABLE} WHERE created_at >= ? AND status = 'success'{excl_sql}",
            (week_start,) + tuple(excl_params),
        ).fetchone()[0]

        active_users_month = conn.execute(
            f"SELECT COUNT(DISTINCT username) FROM {TABLE} WHERE created_at >= ? AND status = 'success'{excl_sql}",
            (month_start,) + tuple(excl_params),
        ).fetchone()[0]

        group_stats = conn.execute(
            f"SELECT group_name, COUNT(*) as cnt FROM {TABLE} "
            f"WHERE created_at >= ? AND status = 'success'{excl_sql} GROUP BY group_name ORDER BY cnt DESC",
            (month_start,) + tuple(excl_params),
        ).fetchall()

        return {
            'today_count': today_count,
            'week_count': week_count,
            'month_count': month_count,
            'total_count': total_count,
            'active_users_today': active_users_today,
            'active_users_week': active_users_week,
            'active_users_month': active_users_month,
            'group_stats': [{'group_name': r['group_name'], 'count': r['cnt']} for r in group_stats],
        }
    finally:
        conn.close()


def get_user_stats(start=None, end=None, exclude_usernames=None):
    ensure_quotation_log_schema()
    conn = _get_conn()
    try:
        clauses = ["status = 'success'"]
        params = []
        if start:
            clauses.append("created_at >= ?")
            params.append(start)
        if end:
            clauses.append("created_at <= ?")
            params.append(end)
        _add_exclude_usernames(clauses, params, exclude_usernames)
        where = f"WHERE {' AND '.join(clauses)}"

        rows = conn.execute(
            f'''SELECT username, group_name,
                   COUNT(*) as total_count,
                   SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
                   ROUND(AVG(CASE WHEN status = 'success' THEN duration_ms ELSE NULL END)) as avg_duration_ms,
                   MAX(created_at) as last_active
               FROM {TABLE}
               {where}
               GROUP BY username, group_name
               ORDER BY total_count DESC''',
            params,
        ).fetchall()
        return [row_to_dict(r) for r in rows]
    finally:
        conn.close()


def get_group_stats(start=None, end=None, exclude_usernames=None):
    ensure_quotation_log_schema()
    conn = _get_conn()
    try:
        clauses = ["status = 'success'"]
        params = []
        if start:
            clauses.append("created_at >= ?")
            params.append(start)
        if end:
            clauses.append("created_at <= ?")
            params.append(end)
        _add_exclude_usernames(clauses, params, exclude_usernames)
        where = f"WHERE {' AND '.join(clauses)}"

        rows = conn.execute(
            f'''SELECT group_name,
                   COUNT(*) as total_count,
                   COUNT(DISTINCT username) as active_users,
                   ROUND(AVG(duration_ms)) as avg_duration_ms
               FROM {TABLE}
               {where}
               GROUP BY group_name
               ORDER BY total_count DESC''',
            params,
        ).fetchall()
        return [row_to_dict(r) for r in rows]
    finally:
        conn.close()


def get_trend(granularity='day', start=None, end=None, exclude_usernames=None):
    ensure_quotation_log_schema()
    conn = _get_conn()
    try:
        if granularity == 'week':
            fmt = '%Y-W%W'
        elif granularity == 'month':
            fmt = '%Y-%m'
        else:
            fmt = '%Y-%m-%d'

        clauses = ["status = 'success'"]
        params = []
        if start:
            clauses.append("created_at >= ?")
            params.append(start)
        if end:
            clauses.append("created_at <= ?")
            params.append(end)
        _add_exclude_usernames(clauses, params, exclude_usernames)
        where = f"WHERE {' AND '.join(clauses)}"

        rows = conn.execute(
            f'''SELECT strftime('{fmt}', created_at) as period,
                   COUNT(*) as count,
                   COUNT(DISTINCT username) as active_users
               FROM {TABLE}
               {where}
               GROUP BY period
               ORDER BY period ASC''',
            params,
        ).fetchall()
        return [row_to_dict(r) for r in rows]
    finally:
        conn.close()


def delete_old_logs(older_than_days=180):
    ensure_quotation_log_schema()
    conn = _get_conn()
    try:
        cutoff = (datetime.now() - timedelta(days=older_than_days)).isoformat(timespec='seconds').replace('T', ' ')
        cursor = conn.execute(f"DELETE FROM {TABLE} WHERE created_at < ?", (cutoff,))
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()


def query_all_logs(start=None, end=None, username=None, group_name=None, status=None, exclude_usernames=None):
    ensure_quotation_log_schema()
    conn = _get_conn()
    try:
        clauses = []
        params = []
        _build_where(clauses, params, start, end, username, group_name, status, exclude_usernames)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ''
        rows = conn.execute(
            f'SELECT * FROM {TABLE} {where} ORDER BY group_name, username, id DESC',
            params,
        ).fetchall()
        return [row_to_dict(r) for r in rows]
    finally:
        conn.close()


def get_user_detail(username):
    ensure_quotation_log_schema()
    conn = _get_conn()
    try:
        u = str(username or '').strip()
        if not u:
            return None

        summary_row = conn.execute(
            f'''SELECT username, group_name,
                   COUNT(*) as total_count,
                   SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
                   SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
                   ROUND(AVG(CASE WHEN status = 'success' THEN duration_ms ELSE NULL END)) as avg_duration_ms,
                   ROUND(AVG(CASE WHEN status = 'success' THEN sheet_count ELSE NULL END), 1) as avg_sheet_count,
                   MAX(created_at) as last_active,
                   MIN(created_at) as first_active
               FROM {TABLE}
               WHERE username = ?
               GROUP BY username, group_name''',
            (u,),
        ).fetchone()

        if not summary_row or not summary_row['total_count']:
            return None

        summary = row_to_dict(summary_row)

        now = datetime.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat(timespec='seconds').replace('T', ' ')
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat(timespec='seconds').replace('T', ' ')

        summary['today_count'] = conn.execute(
            f"SELECT COUNT(*) FROM {TABLE} WHERE username = ? AND created_at >= ? AND status = 'success'",
            (u, today_start),
        ).fetchone()[0]

        summary['month_count'] = conn.execute(
            f"SELECT COUNT(*) FROM {TABLE} WHERE username = ? AND created_at >= ? AND status = 'success'",
            (u, month_start),
        ).fetchone()[0]

        daily_rows = conn.execute(
            f'''SELECT strftime('%Y-%m-%d', created_at) as day,
                   COUNT(*) as count,
                   SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count
               FROM {TABLE}
               WHERE username = ?
               GROUP BY day
               ORDER BY day DESC
               LIMIT 30''',
            (u,),
        ).fetchall()
        summary['daily_trend'] = [row_to_dict(r) for r in daily_rows]

        recent_rows = conn.execute(
            f'''SELECT id, project_name, bom_filename, case_type, match_stats,
                   sheet_count, status, error_message, duration_ms, created_at
               FROM {TABLE}
               WHERE username = ?
               ORDER BY id DESC
               LIMIT 20''',
            (u,),
        ).fetchall()
        summary['recent_logs'] = [row_to_dict(r) for r in recent_rows]

        return summary
    finally:
        conn.close()


def get_dashboard_daily(days=10, exclude_usernames=None):
    ensure_quotation_log_schema()
    conn = _get_conn()
    try:
        now = datetime.now()
        start = (now - timedelta(days=days - 1)).replace(
            hour=0, minute=0, second=0, microsecond=0).isoformat(timespec='seconds').replace('T', ' ')

        day_strings = []
        date_labels = []
        for i in range(days):
            d = now - timedelta(days=days - 1 - i)
            day_strings.append(d.strftime('%Y-%m-%d'))
            date_labels.append(f'{d.month}/{d.day}')

        excl_sql = ''
        excl_params = []
        if exclude_usernames:
            placeholders = ','.join(['?'] * len(exclude_usernames))
            excl_sql = f" AND username NOT IN ({placeholders})"
            excl_params = list(exclude_usernames)

        rows = conn.execute(
            f"""SELECT username, group_name,
                       strftime('%Y-%m-%d', created_at) as day,
                       COUNT(*) as count
                FROM {TABLE}
                WHERE status = 'success' AND created_at >= ?{excl_sql}
                GROUP BY username, day
                ORDER BY day ASC""",
            (start,) + tuple(excl_params),
        ).fetchall()

        user_daily = {}
        user_group = {}
        for r in rows:
            u = r['username']
            g = r['group_name'] or '未知'
            user_daily.setdefault(u, {})[r['day']] = r['count']
            user_group[u] = g

        return {
            'day_strings': day_strings,
            'date_labels': date_labels,
            'user_daily': user_daily,
            'user_group': user_group,
        }
    finally:
        conn.close()


def get_today_detail(exclude_usernames=None, date_str=None):
    ensure_quotation_log_schema()
    conn = _get_conn()
    try:
        if date_str:
            target_start = date_str + ' 00:00:00'
            target_end = date_str + ' 23:59:59'
        else:
            now = datetime.now()
            target_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat(timespec='seconds').replace('T', ' ')
            target_end = None

        excl_sql = ''
        excl_params = []
        if exclude_usernames:
            placeholders = ','.join(['?'] * len(exclude_usernames))
            excl_sql = f" AND username NOT IN ({placeholders})"
            excl_params = list(exclude_usernames)

        end_sql = ''
        end_params = []
        if target_end:
            end_sql = " AND created_at <= ?"
            end_params = [target_end]

        rows = conn.execute(
            f"""SELECT username, group_name, case_type,
                       COUNT(*) as count
                FROM {TABLE}
                WHERE status = 'success' AND created_at >= ?{end_sql}{excl_sql}
                GROUP BY username, group_name, case_type
                ORDER BY group_name, username""",
            (target_start,) + tuple(end_params) + tuple(excl_params),
        ).fetchall()

        member_detail = {}
        for r in rows:
            u = r['username']
            if u not in member_detail:
                member_detail[u] = {
                    'group_name': r['group_name'] or '未知',
                    'total': 0,
                    'by_type': {},
                }
            member_detail[u]['total'] += r['count']
            ct = r['case_type'] or '其他'
            member_detail[u]['by_type'][ct] = member_detail[u]['by_type'].get(ct, 0) + r['count']

        return member_detail
    finally:
        conn.close()
