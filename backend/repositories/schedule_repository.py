"""
总助日程提醒 - 数据访问层（SQLite）

表：
  ks_schedules             日程主表
  ks_schedule_reminders    提醒任务表
  ks_schedule_briefing     每日晨报配置（单行）
  ks_schedule_send_log     钉钉发送日志
"""
import json
from datetime import datetime, timedelta

from backend.config.settings import get_db_connection as _get_shared_conn
from backend.utils.helpers import row_to_dict


SCHEDULE_TABLE = 'ks_schedules'
REMINDER_TABLE = 'ks_schedule_reminders'
BRIEFING_TABLE = 'ks_schedule_briefing'
LOG_TABLE = 'ks_schedule_send_log'

# 日程状态
STATUS_PENDING = 'pending'
STATUS_DOING = 'doing'
STATUS_DONE = 'done'
STATUS_CANCELLED = 'cancelled'
SCHEDULE_STATUSES = (STATUS_PENDING, STATUS_DOING, STATUS_DONE, STATUS_CANCELLED)

# 提醒任务状态
REMINDER_PENDING = 'pending'
REMINDER_SENT = 'sent'
REMINDER_FAILED = 'failed'
REMINDER_CANCELLED = 'cancelled'
REMINDER_STATUSES = (REMINDER_PENDING, REMINDER_SENT, REMINDER_FAILED, REMINDER_CANCELLED)

# 时段（取代具体时间）
PERIOD_MORNING = 'morning'   # 早晨
PERIOD_NOON = 'noon'         # 中午
PERIOD_EVENING = 'evening'   # 晚上
PERIOD_ALLDAY = 'allday'     # 全天
TIME_PERIODS = (PERIOD_MORNING, PERIOD_NOON, PERIOD_EVENING, PERIOD_ALLDAY)
PERIOD_LABELS = {
    PERIOD_MORNING: '早晨',
    PERIOD_NOON: '中午',
    PERIOD_EVENING: '晚上',
    PERIOD_ALLDAY: '全天',
}
# 各时段默认触发时间（单条提醒按此时间发）
PERIOD_DEFAULT_TIME = {
    PERIOD_MORNING: '08:30',
    PERIOD_NOON: '13:30',
    PERIOD_EVENING: '17:30',
    PERIOD_ALLDAY: '08:30',
}
# 展示排序
PERIOD_ORDER = {PERIOD_MORNING: 0, PERIOD_NOON: 1, PERIOD_EVENING: 2, PERIOD_ALLDAY: 3}


def now_iso():
    return datetime.now().isoformat(timespec='seconds')


def get_db():
    conn = _get_shared_conn()
    ensure_schema(conn)
    return conn


def ensure_schema(conn):
    conn.executescript(f'''
        CREATE TABLE IF NOT EXISTS {SCHEDULE_TABLE} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            location TEXT NOT NULL DEFAULT '',
            event_date TEXT NOT NULL,
            start_time TEXT NOT NULL DEFAULT '',
            end_time TEXT NOT NULL DEFAULT '',
            is_all_day INTEGER NOT NULL DEFAULT 0,
            time_period TEXT NOT NULL DEFAULT 'morning',
            category TEXT NOT NULL DEFAULT '',
            participants TEXT NOT NULL DEFAULT '[]',
            priority TEXT NOT NULL DEFAULT 'medium',
            status TEXT NOT NULL DEFAULT '{STATUS_PENDING}',
            remark TEXT NOT NULL DEFAULT '',
            created_by TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_{SCHEDULE_TABLE}_date ON {SCHEDULE_TABLE} (event_date);
        CREATE INDEX IF NOT EXISTS idx_{SCHEDULE_TABLE}_status ON {SCHEDULE_TABLE} (status, event_date);

        CREATE TABLE IF NOT EXISTS {REMINDER_TABLE} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schedule_id INTEGER NOT NULL,
            trigger_at TEXT NOT NULL,
            remind_rule TEXT NOT NULL DEFAULT '',
            remind_label TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT '{REMINDER_PENDING}',
            sent_at TEXT,
            job_id TEXT NOT NULL DEFAULT '',
            error_msg TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_{REMINDER_TABLE}_status ON {REMINDER_TABLE} (status, trigger_at);
        CREATE INDEX IF NOT EXISTS idx_{REMINDER_TABLE}_schedule ON {REMINDER_TABLE} (schedule_id);

        CREATE TABLE IF NOT EXISTS {BRIEFING_TABLE} (
            id INTEGER PRIMARY KEY,
            enabled INTEGER NOT NULL DEFAULT 1,
            send_time TEXT NOT NULL DEFAULT '08:00',
            tz TEXT NOT NULL DEFAULT 'Asia/Shanghai',
            briefing_format TEXT NOT NULL DEFAULT '{BRIEFING_FORMAT_CARD}',
            weekly_enabled INTEGER NOT NULL DEFAULT 1,
            weekly_mon_time TEXT NOT NULL DEFAULT '08:30',
            weekly_fri_time TEXT NOT NULL DEFAULT '17:30',
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS {LOG_TABLE} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ref_type TEXT NOT NULL DEFAULT '',
            ref_id TEXT NOT NULL DEFAULT '',
            target_userid TEXT NOT NULL DEFAULT '',
            task_id TEXT NOT NULL DEFAULT '',
            success INTEGER NOT NULL DEFAULT 0,
            error_msg TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
    ''')
    conn.commit()
    _migrate(conn)


# 晨报形式
BRIEFING_FORMAT_CARD = 'card'
BRIEFING_FORMAT_ANNOUNCEMENT = 'announcement'
BRIEFING_FORMATS = (BRIEFING_FORMAT_CARD, BRIEFING_FORMAT_ANNOUNCEMENT)


def _migrate(conn):
    """对已存在的库做增量列迁移。"""
    # 晨报表
    bcols = {r[1] for r in conn.execute(f'PRAGMA table_info({BRIEFING_TABLE})').fetchall()}
    if 'briefing_format' not in bcols:
        conn.execute(f"ALTER TABLE {BRIEFING_TABLE} ADD COLUMN briefing_format TEXT NOT NULL DEFAULT '{BRIEFING_FORMAT_CARD}'")
    if 'weekly_enabled' not in bcols:
        conn.execute(f"ALTER TABLE {BRIEFING_TABLE} ADD COLUMN weekly_enabled INTEGER NOT NULL DEFAULT 1")
    if 'weekly_mon_time' not in bcols:
        conn.execute("ALTER TABLE ks_schedule_briefing ADD COLUMN weekly_mon_time TEXT NOT NULL DEFAULT '08:30'")
    if 'weekly_fri_time' not in bcols:
        conn.execute("ALTER TABLE ks_schedule_briefing ADD COLUMN weekly_fri_time TEXT NOT NULL DEFAULT '17:30'")
    # 日程表：加时段列
    scols = {r[1] for r in conn.execute(f'PRAGMA table_info({SCHEDULE_TABLE})').fetchall()}
    if 'time_period' not in scols:
        conn.execute(f"ALTER TABLE {SCHEDULE_TABLE} ADD COLUMN time_period TEXT NOT NULL DEFAULT '{PERIOD_MORNING}'")
        # 已有数据按 start_time 推断时段
        conn.execute(f'''UPDATE {SCHEDULE_TABLE} SET time_period =
            CASE
                WHEN is_all_day = 1 THEN '{PERIOD_ALLDAY}'
                WHEN start_time = '' OR start_time IS NULL THEN '{PERIOD_MORNING}'
                WHEN CAST(substr(start_time,1,2) AS INTEGER) < 12 THEN '{PERIOD_MORNING}'
                WHEN CAST(substr(start_time,1,2) AS INTEGER) < 14 THEN '{PERIOD_NOON}'
                ELSE '{PERIOD_EVENING}'
            END''')
    conn.commit()


# ============================ 日程 ============================

def normalize_schedule_row(row):
    data = row_to_dict(row)
    if not data:
        return None
    raw_participants = data.get('participants') or '[]'
    try:
        participants = json.loads(raw_participants) if isinstance(raw_participants, str) else raw_participants
    except (json.JSONDecodeError, TypeError):
        participants = []
    return {
        'id': data.get('id'),
        'title': str(data.get('title') or ''),
        'description': str(data.get('description') or ''),
        'location': str(data.get('location') or ''),
        'event_date': str(data.get('event_date') or ''),
        'start_time': str(data.get('start_time') or ''),
        'end_time': str(data.get('end_time') or ''),
        'is_all_day': bool(data.get('is_all_day', 0)),
        'time_period': str(data.get('time_period') or PERIOD_MORNING),
        'category': str(data.get('category') or ''),
        'participants': participants if isinstance(participants, list) else [],
        'priority': str(data.get('priority') or 'medium'),
        'status': str(data.get('status') or STATUS_PENDING),
        'remark': str(data.get('remark') or ''),
        'created_by': str(data.get('created_by') or ''),
        'created_at': data.get('created_at'),
        'updated_at': data.get('updated_at'),
    }


def create_schedule(fields):
    now = now_iso()
    conn = get_db()
    try:
        cur = conn.execute(
            f'''INSERT INTO {SCHEDULE_TABLE} (
                title, description, location, event_date, start_time, end_time,
                is_all_day, time_period, category, participants, priority, status, remark,
                created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (
                fields.get('title', ''),
                fields.get('description', ''),
                fields.get('location', ''),
                fields.get('event_date', ''),
                fields.get('start_time', ''),
                fields.get('end_time', ''),
                1 if fields.get('is_all_day') else 0,
                fields.get('time_period') or PERIOD_MORNING,
                fields.get('category', ''),
                json.dumps(fields.get('participants', []), ensure_ascii=False),
                fields.get('priority', 'medium'),
                fields.get('status', STATUS_PENDING),
                fields.get('remark', ''),
                fields.get('created_by', ''),
                now, now,
            ),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def update_schedule(schedule_id, fields):
    now = now_iso()
    conn = get_db()
    try:
        assignments = []
        params = []
        for key in ('title', 'description', 'location', 'event_date', 'start_time',
                    'end_time', 'time_period', 'category', 'priority', 'status', 'remark', 'created_by'):
            if key in fields:
                assignments.append(f'{key} = ?')
                params.append(fields[key])
        if 'is_all_day' in fields:
            assignments.append('is_all_day = ?')
            params.append(1 if fields['is_all_day'] else 0)
        if 'participants' in fields:
            assignments.append('participants = ?')
            params.append(json.dumps(fields['participants'], ensure_ascii=False))
        if not assignments:
            return False
        assignments.append('updated_at = ?')
        params.append(now)
        params.append(schedule_id)
        cur = conn.execute(
            f'UPDATE {SCHEDULE_TABLE} SET {", ".join(assignments)} WHERE id = ?',
            params,
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def get_schedule(schedule_id):
    conn = get_db()
    try:
        row = conn.execute(
            f'SELECT * FROM {SCHEDULE_TABLE} WHERE id = ?', (schedule_id,)
        ).fetchone()
        return normalize_schedule_row(row)
    finally:
        conn.close()


def delete_schedule(schedule_id):
    conn = get_db()
    try:
        cur = conn.execute(f'DELETE FROM {SCHEDULE_TABLE} WHERE id = ?', (schedule_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def list_schedules_by_date(event_date):
    conn = get_db()
    try:
        rows = conn.execute(
            f'''SELECT * FROM {SCHEDULE_TABLE}
                WHERE event_date = ?
                ORDER BY is_all_day DESC, start_time ASC, id ASC''',
            (event_date,),
        ).fetchall()
        return [normalize_schedule_row(r) for r in rows]
    finally:
        conn.close()


def list_schedules_range(date_from, date_to):
    conn = get_db()
    try:
        rows = conn.execute(
            f'''SELECT * FROM {SCHEDULE_TABLE}
                WHERE event_date >= ? AND event_date <= ?
                ORDER BY event_date ASC, start_time ASC, id ASC''',
            (date_from, date_to),
        ).fetchall()
        return [normalize_schedule_row(r) for r in rows]
    finally:
        conn.close()


def month_aggregate(year, month):
    """返回 {event_date: {'count': n, 'has_active': bool, 'items': [brief]}}"""
    date_from = f'{year:04d}-{month:02d}-01'
    if month == 12:
        date_to = f'{year:04d}-12-31'
    else:
        last_day = (datetime(year, month + 1, 1) - timedelta(days=1)).day
        date_to = f'{year:04d}-{month:02d}-{last_day:02d}'
    items = list_schedules_range(date_from, date_to)
    result = {}
    for it in items:
        day = it['event_date']
        cell = result.setdefault(day, {'count': 0, 'active': 0, 'items': []})
        cell['items'].append(it)
        cell['count'] += 1
        if it['status'] in (STATUS_PENDING, STATUS_DOING):
            cell['active'] += 1
    return result


def set_schedule_status(schedule_id, status):
    now = now_iso()
    conn = get_db()
    try:
        cur = conn.execute(
            f'UPDATE {SCHEDULE_TABLE} SET status = ?, updated_at = ? WHERE id = ?',
            (status, now, schedule_id),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# ============================ 提醒任务 ============================

def normalize_reminder_row(row):
    data = row_to_dict(row)
    if not data:
        return None
    return {
        'id': data.get('id'),
        'schedule_id': data.get('schedule_id'),
        'trigger_at': str(data.get('trigger_at') or ''),
        'remind_rule': str(data.get('remind_rule') or ''),
        'remind_label': str(data.get('remind_label') or ''),
        'status': str(data.get('status') or REMINDER_PENDING),
        'sent_at': data.get('sent_at'),
        'job_id': str(data.get('job_id') or ''),
        'error_msg': str(data.get('error_msg') or ''),
        'created_at': data.get('created_at'),
    }


def create_reminder(schedule_id, trigger_at, rule, label, job_id):
    now = now_iso()
    conn = get_db()
    try:
        cur = conn.execute(
            f'''INSERT INTO {REMINDER_TABLE}
                (schedule_id, trigger_at, remind_rule, remind_label, status, job_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (schedule_id, trigger_at, rule, label, REMINDER_PENDING, job_id, now),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def update_reminder(reminder_id, **fields):
    if not fields:
        return False
    conn = get_db()
    try:
        assignments = []
        params = []
        for key in ('trigger_at', 'remind_rule', 'remind_label', 'status', 'sent_at', 'job_id', 'error_msg'):
            if key in fields:
                assignments.append(f'{key} = ?')
                params.append(fields[key])
        if not assignments:
            return False
        params.append(reminder_id)
        cur = conn.execute(
            f'UPDATE {REMINDER_TABLE} SET {", ".join(assignments)} WHERE id = ?',
            params,
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def get_reminder(reminder_id):
    conn = get_db()
    try:
        row = conn.execute(
            f'SELECT * FROM {REMINDER_TABLE} WHERE id = ?', (reminder_id,)
        ).fetchone()
        return normalize_reminder_row(row)
    finally:
        conn.close()


def list_reminders_by_schedule(schedule_id):
    conn = get_db()
    try:
        rows = conn.execute(
            f'SELECT * FROM {REMINDER_TABLE} WHERE schedule_id = ? ORDER BY trigger_at ASC, id ASC',
            (schedule_id,),
        ).fetchall()
        return [normalize_reminder_row(r) for r in rows]
    finally:
        conn.close()


def list_pending_reminders():
    now = now_iso()
    conn = get_db()
    try:
        rows = conn.execute(
            f'''SELECT * FROM {REMINDER_TABLE}
                WHERE status = ? ORDER BY trigger_at ASC, id ASC''',
            (REMINDER_PENDING,),
        ).fetchall()
        return [normalize_reminder_row(r) for r in rows], now
    finally:
        conn.close()


def list_reminders(status='', schedule_id=None, limit=200):
    conn = get_db()
    try:
        clauses = []
        params = []
        if status:
            clauses.append('status = ?')
            params.append(status)
        if schedule_id:
            clauses.append('schedule_id = ?')
            params.append(schedule_id)
        where = f'WHERE {" AND ".join(clauses)}' if clauses else ''
        params.append(limit)
        rows = conn.execute(
            f'''SELECT * FROM {REMINDER_TABLE} {where}
                ORDER BY trigger_at DESC, id DESC LIMIT ?''',
            params,
        ).fetchall()
        return [normalize_reminder_row(r) for r in rows]
    finally:
        conn.close()


def cancel_reminders_for_schedule(schedule_id):
    now = now_iso()
    conn = get_db()
    try:
        rows = conn.execute(
            f'''SELECT id, job_id FROM {REMINDER_TABLE}
                WHERE schedule_id = ? AND status = ?''',
            (schedule_id, REMINDER_PENDING),
        ).fetchall()
        job_ids = [str(r['job_id']) for r in rows if r['job_id']]
        if rows:
            conn.execute(
                f'''UPDATE {REMINDER_TABLE}
                    SET status = ?, error_msg = '日程变更已取消', sent_at = ?
                    WHERE schedule_id = ? AND status = ?''',
                (REMINDER_CANCELLED, now, schedule_id, REMINDER_PENDING),
            )
        conn.commit()
        return job_ids
    finally:
        conn.close()


def delete_reminders_for_schedule(schedule_id):
    conn = get_db()
    try:
        rows = conn.execute(
            f'SELECT job_id FROM {REMINDER_TABLE} WHERE schedule_id = ?', (schedule_id,),
        ).fetchall()
        job_ids = [str(r['job_id']) for r in rows if r['job_id']]
        conn.execute(f'DELETE FROM {REMINDER_TABLE} WHERE schedule_id = ?', (schedule_id,))
        conn.commit()
        return job_ids
    finally:
        conn.close()


# ============================ 晨报配置 ============================

def get_briefing_config():
    conn = get_db()
    try:
        row = conn.execute(f'SELECT * FROM {BRIEFING_TABLE} WHERE id = 1').fetchone()
        if not row:
            now = now_iso()
            conn.execute(
                f'''INSERT INTO {BRIEFING_TABLE} (id, enabled, send_time, tz, updated_at)
                    VALUES (1, 1, '08:00', 'Asia/Shanghai', ?)''',
                (now,),
            )
            conn.commit()
            return {'id': 1, 'enabled': True, 'send_time': '08:00', 'tz': 'Asia/Shanghai',
                    'briefing_format': BRIEFING_FORMAT_CARD, 'weekly_enabled': True,
                    'weekly_mon_time': '08:30', 'weekly_fri_time': '17:30', 'updated_at': now}
        data = row_to_dict(row)
        return {
            'id': data.get('id'),
            'enabled': bool(data.get('enabled', 1)),
            'send_time': str(data.get('send_time') or '08:00'),
            'tz': str(data.get('tz') or 'Asia/Shanghai'),
            'briefing_format': str(data.get('briefing_format') or BRIEFING_FORMAT_CARD),
            'weekly_enabled': bool(data.get('weekly_enabled', 1)),
            'weekly_mon_time': str(data.get('weekly_mon_time') or '08:30'),
            'weekly_fri_time': str(data.get('weekly_fri_time') or '17:30'),
            'updated_at': data.get('updated_at'),
        }
    finally:
        conn.close()


def update_briefing_config(enabled=None, send_time=None, briefing_format=None,
                           weekly_enabled=None, weekly_mon_time=None, weekly_fri_time=None):
    now = now_iso()
    current = get_briefing_config()
    new_enabled = current['enabled'] if enabled is None else bool(enabled)
    new_time = current['send_time'] if not send_time else str(send_time).strip()
    new_format = current['briefing_format']
    if briefing_format and str(briefing_format).strip().lower() in BRIEFING_FORMATS:
        new_format = str(briefing_format).strip().lower()
    new_weekly_enabled = current['weekly_enabled'] if weekly_enabled is None else bool(weekly_enabled)
    new_mon_time = current['weekly_mon_time'] if not weekly_mon_time else str(weekly_mon_time).strip()
    new_fri_time = current['weekly_fri_time'] if not weekly_fri_time else str(weekly_fri_time).strip()
    conn = get_db()
    try:
        conn.execute(
            f'''UPDATE {BRIEFING_TABLE} SET enabled = ?, send_time = ?, briefing_format = ?,
                weekly_enabled = ?, weekly_mon_time = ?, weekly_fri_time = ?, updated_at = ? WHERE id = 1''',
            (1 if new_enabled else 0, new_time, new_format,
             1 if new_weekly_enabled else 0, new_mon_time, new_fri_time, now),
        )
        conn.commit()
    finally:
        conn.close()
    return get_briefing_config()


# ============================ 发送日志 ============================

def add_send_log(ref_type, ref_id, target_userid, task_id, success, error_msg=''):
    now = now_iso()
    conn = get_db()
    try:
        conn.execute(
            f'''INSERT INTO {LOG_TABLE}
                (ref_type, ref_id, target_userid, task_id, success, error_msg, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (ref_type, str(ref_id or ''), target_userid, str(task_id or ''),
             1 if success else 0, error_msg, now),
        )
        conn.commit()
    finally:
        conn.close()


def list_send_logs(limit=50):
    conn = get_db()
    try:
        rows = conn.execute(
            f'''SELECT * FROM {LOG_TABLE} ORDER BY id DESC LIMIT ?''', (limit,),
        ).fetchall()
        result = []
        for r in rows:
            data = row_to_dict(r)
            data['success'] = bool(data.get('success', 0))
            result.append(data)
        return result
    finally:
        conn.close()
