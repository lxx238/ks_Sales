from datetime import datetime

from backend.config.settings import get_db_connection as _get_shared_conn
from backend.utils.helpers import row_to_dict


QUESTION_TABLE = 'ks_questions'

QUESTION_STATUS_PENDING = 'pending'
QUESTION_STATUS_ANSWERED = 'answered'
QUESTION_STATUS_CLOSED = 'closed'
QUESTION_STATUSES = (QUESTION_STATUS_PENDING, QUESTION_STATUS_ANSWERED, QUESTION_STATUS_CLOSED)


def get_now_iso():
    return datetime.now().isoformat(timespec='seconds')


def get_db_connection():
    connection = _get_shared_conn()
    ensure_question_schema(connection)
    return connection


def ensure_question_schema(connection):
    connection.execute(
        f'''
        CREATE TABLE IF NOT EXISTS {QUESTION_TABLE} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT '',
            submitter TEXT NOT NULL,
            submitter_role TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT '{QUESTION_STATUS_PENDING}',
            submitted_at TEXT NOT NULL,
            reviewed_at TEXT,
            reviewed_by TEXT,
            reply TEXT
        )
        '''
    )
    connection.execute(
        f'''
        CREATE INDEX IF NOT EXISTS idx_{QUESTION_TABLE}_status
        ON {QUESTION_TABLE} (status, submitted_at DESC)
        '''
    )
    connection.execute(
        f'''
        CREATE INDEX IF NOT EXISTS idx_{QUESTION_TABLE}_submitter
        ON {QUESTION_TABLE} (submitter, submitted_at DESC)
        '''
    )
    connection.commit()


def normalize_question_row(row):
    data = row_to_dict(row)
    if not data:
        return None
    return {
        'id': data.get('id'),
        'title': str(data.get('title') or '').strip(),
        'content': str(data.get('content') or '').strip(),
        'category': str(data.get('category') or '').strip(),
        'submitter': str(data.get('submitter') or '').strip(),
        'submitter_role': str(data.get('submitter_role') or '').strip(),
        'status': str(data.get('status') or QUESTION_STATUS_PENDING).strip(),
        'submitted_at': data.get('submitted_at'),
        'reviewed_at': data.get('reviewed_at'),
        'reviewed_by': data.get('reviewed_by'),
        'reply': data.get('reply'),
    }


def create_question(title, content, category, submitter, submitter_role):
    now = get_now_iso()
    connection = get_db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            f'''
            INSERT INTO {QUESTION_TABLE} (
                title, content, category, submitter, submitter_role,
                status, submitted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                str(title or '').strip(),
                str(content or '').strip(),
                str(category or '').strip(),
                str(submitter or '').strip(),
                str(submitter_role or '').strip(),
                QUESTION_STATUS_PENDING,
                now,
            ),
        )
        connection.commit()
        return cursor.lastrowid
    finally:
        connection.close()


def get_question(question_id):
    connection = get_db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            f'SELECT * FROM {QUESTION_TABLE} WHERE id = ?',
            (question_id,),
        )
        row = cursor.fetchone()
        return normalize_question_row(row)
    finally:
        connection.close()


def list_questions(page, page_size, status='', submitter=''):
    connection = get_db_connection()
    try:
        cursor = connection.cursor()

        clauses = []
        params = []

        status = str(status or '').strip()
        submitter = str(submitter or '').strip()

        if status:
            clauses.append('status = ?')
            params.append(status)
        if submitter:
            clauses.append('submitter = ?')
            params.append(submitter)

        where_clause = f'WHERE {" AND ".join(clauses)}' if clauses else ''

        count_sql = f'SELECT COUNT(*) FROM {QUESTION_TABLE} {where_clause}'
        cursor.execute(count_sql, params)
        total = cursor.fetchone()[0]

        offset = (page - 1) * page_size
        total_pages = (total + page_size - 1) // page_size if total > 0 else 0

        data_sql = (
            f'SELECT * FROM {QUESTION_TABLE} {where_clause} '
            'ORDER BY '
            "CASE status "
            f"WHEN '{QUESTION_STATUS_PENDING}' THEN 0 "
            f"WHEN '{QUESTION_STATUS_ANSWERED}' THEN 1 "
            f"WHEN '{QUESTION_STATUS_CLOSED}' THEN 2 "
            "ELSE 3 END, "
            'submitted_at DESC, id DESC '
            'LIMIT ? OFFSET ?'
        )
        cursor.execute(data_sql, params + [page_size, offset])
        rows = cursor.fetchall()

        return {
            'data': [normalize_question_row(row) for row in rows],
            'total': total,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
        }
    finally:
        connection.close()


def update_question_reply(question_id, reply, reviewed_by, status=QUESTION_STATUS_ANSWERED):
    now = get_now_iso()
    connection = get_db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            f'SELECT COUNT(*) FROM {QUESTION_TABLE} WHERE id = ?',
            (question_id,),
        )
        if cursor.fetchone()[0] == 0:
            raise LookupError('问题不存在')

        cursor.execute(
            f'''
            UPDATE {QUESTION_TABLE}
            SET status = ?,
                reply = ?,
                reviewed_by = ?,
                reviewed_at = ?
            WHERE id = ?
            ''',
            (status, reply, reviewed_by, now, question_id),
        )
        connection.commit()
    finally:
        connection.close()


def close_question(question_id):
    now = get_now_iso()
    connection = get_db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            f'SELECT COUNT(*) FROM {QUESTION_TABLE} WHERE id = ?',
            (question_id,),
        )
        if cursor.fetchone()[0] == 0:
            raise LookupError('问题不存在')

        cursor.execute(
            f'''
            UPDATE {QUESTION_TABLE}
            SET status = ?,
                reviewed_at = ?
            WHERE id = ?
            ''',
            (QUESTION_STATUS_CLOSED, now, question_id),
        )
        connection.commit()
    finally:
        connection.close()
