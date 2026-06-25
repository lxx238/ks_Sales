import json
from datetime import datetime

from pypinyin import lazy_pinyin
from werkzeug.security import check_password_hash, generate_password_hash

from backend.config.settings import get_db_connection
from backend.utils.helpers import row_to_dict

TABLE = 'ks_users'

GROUP_SUFFIX = {'韩语组': '_h', '日语组': '_j', '英语组': '_e', '亚太组': '_a', '物流组': '_w', '人事组': '_r', '设计组': '_s'}

ALL_PERMISSIONS = [
    'quotation',
    'cad',
    'database',
    'database_submit',
    'database_download',
    'records',
    'records_review',
    'questions',
    'logistics',
    'schedule',
]

ROLE_TARGETS = {
    'admin': 'admin.html',
    '韩语业务员': 'app.html?group=韩语组',
    '英语业务员': 'app.html?group=英语组',
    '日语业务员': 'app.html?group=日语组',
    '亚太业务员': 'app.html?group=亚太组',
    '业务助理': '',
    '总助': 'app.html?page=schedule',
    '物流专员': 'app.html?group=物流组',
}

ROLE_LABELS = {
    'admin': '管理员',
    '韩语业务员': '韩语业务员',
    '英语业务员': '英语业务员',
    '日语业务员': '日语业务员',
    '亚太业务员': '亚太业务员',
    '业务助理': '业务助理',
    '总助': '总助',
    '物流专员': '物流专员',
}

CREATE_TABLE_SQL = f'''
CREATE TABLE IF NOT EXISTS {TABLE} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL DEFAULT '',
    name_china TEXT NOT NULL DEFAULT '',
    nickname TEXT NOT NULL DEFAULT '',
    mob TEXT NOT NULL DEFAULT '',
    tel TEXT NOT NULL DEFAULT '',
    fax TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    dingtalk_id TEXT NOT NULL DEFAULT '',
    "group" TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    role_label TEXT NOT NULL DEFAULT '',
    target TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    permissions TEXT NOT NULL DEFAULT '[]',
    preferences TEXT NOT NULL DEFAULT '{{}}',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
)
'''

GROUP_ROLE_MAP = {'韩语组': '韩语业务员', '英语组': '英语业务员', '日语组': '日语业务员', '亚太组': '亚太业务员', '物流组': '物流专员', '人事组': '总助', '设计组': '业务助理'}

DEFAULT_USERS = [
    {'username': 'admin', 'password': 'Admin@123', 'name_china': '管理员', 'nickname': '', 'mob': '', 'tel': '', 'fax': '', 'email': '', 'group': '', 'role': 'admin', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'username': 'assistant', 'password': 'Assistant@123', 'name_china': '总经理助理', 'nickname': '', 'mob': '', 'tel': '', 'fax': '', 'email': '', 'group': '人事组', 'role': '总助', 'enabled': True, 'permissions': ['schedule']},
    {'password': 'Ko@123', 'name_china': '冯光英', 'nickname': '풍광영', 'mob': '0086-18050036912', 'tel': '', 'fax': '', 'email': 'judy@xmkseng.com', 'group': '韩语组', 'role': '韩语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '陈佳宜', 'nickname': '진가의', 'mob': '0086-18050018213', 'tel': '', 'fax': '', 'email': 'hedy@xmkseng.com', 'group': '韩语组', 'role': '韩语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '陈雪婷', 'nickname': '진설정', 'mob': '0086-18050053693', 'tel': '', 'fax': '', 'email': 'seol@xmkseng.com', 'group': '韩语组', 'role': '韩语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '黄雨欣', 'nickname': '황유싱', 'mob': '0086-18050032918', 'tel': '', 'fax': '', 'email': 'using@xmkseng.com', 'group': '韩语组', 'role': '韩语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '张伟', 'nickname': '장웨이', 'mob': '0086-18050075797', 'tel': '', 'fax': '', 'email': 'zhangwei@xmkseng.com', 'group': '韩语组', 'role': '韩语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '李善杰', 'nickname': '이선걸', 'mob': '010-5588-8096', 'tel': '', 'fax': '', 'email': 'shanjie@xmkseng.com', 'group': '韩语组', 'role': '韩语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '邱玉萍', 'nickname': '玉子', 'mob': '+86-18059236586', 'tel': '+86-5925767151', 'fax': '+86-592-5767212', 'email': '', 'group': '日语组', 'role': '业务助理', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '蔡少芳', 'nickname': 'Nanami', 'mob': '+86-18050036910', 'tel': '+86-13774665835', 'fax': '+86-592-5738212', 'email': '', 'group': '日语组', 'role': '业务助理', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '陈湘', 'nickname': 'kaori', 'mob': '+86-18050036393', 'tel': '+86-18250338827', 'fax': '-', 'email': '', 'group': '日语组', 'role': '业务助理', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '兰雪琼', 'nickname': 'Yuki', 'mob': '+86-18506932893', 'tel': '+86-18506932893', 'fax': '-', 'email': '', 'group': '日语组', 'role': '业务助理', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '许宜轩', 'nickname': 'KYO', 'mob': '+86-13395056277', 'tel': '+86-18050015231', 'fax': '-', 'email': '', 'group': '日语组', 'role': '业务助理', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '辛美琪', 'nickname': 'MIKI', 'mob': '+86-18050038113', 'tel': '+86-18050038113', 'fax': '-', 'email': '', 'group': '日语组', 'role': '业务助理', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '潘玲瑜', 'nickname': 'Winnie', 'mob': '+86-18050053585', 'tel': '+86-18050053585', 'fax': '-', 'email': '', 'group': '日语组', 'role': '业务助理', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '郭婧', 'nickname': 'Jade', 'mob': '18050028717', 'tel': '', 'fax': '', 'email': 'jade@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '颜冰冰', 'nickname': 'Abby', 'mob': '18050039573', 'tel': '', 'fax': '', 'email': 'abby.yan@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '詹丽莉', 'nickname': 'Ann', 'mob': '19906018062', 'tel': '', 'fax': '', 'email': 'ann@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '徐颖', 'nickname': 'Sally', 'mob': '13328785304', 'tel': '', 'fax': '', 'email': 'sally@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '杨金伟', 'nickname': 'Jiminy', 'mob': '18150073682', 'tel': '', 'fax': '', 'email': 'jiminy@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '陈诗雅', 'nickname': 'Chika', 'mob': '18850571849', 'tel': '', 'fax': '', 'email': 'chika@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '黄小燕', 'nickname': 'Sarah', 'mob': '18050036290', 'tel': '', 'fax': '', 'email': 'sarah@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '陈津津', 'nickname': 'Jessie', 'mob': '18050036973', 'tel': '', 'fax': '', 'email': 'jessie@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '张珈睿', 'nickname': 'Emma', 'mob': '18050039032', 'tel': '', 'fax': '', 'email': 'emma.zhang@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '兰丽娟', 'nickname': 'Fiona', 'mob': '18050076927', 'tel': '', 'fax': '', 'email': 'fiona@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '游国欣', 'nickname': 'Dylan', 'mob': '18050057527', 'tel': '', 'fax': '', 'email': 'dylan@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '丁晨仪', 'nickname': 'Klara', 'mob': '18050076583', 'tel': '', 'fax': '', 'email': 'klara@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '童宁', 'nickname': 'Johnny', 'mob': '18050060927', 'tel': '', 'fax': '', 'email': 'johnny@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '林小玲', 'nickname': 'Vikey', 'mob': '18050057669', 'tel': '', 'fax': '', 'email': 'vikey.lin@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '尤佳敏', 'nickname': 'Jasmine', 'mob': '18050062260', 'tel': '', 'fax': '', 'email': 'jasmine@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '阮惠婷', 'nickname': 'Melody', 'mob': '18050017850', 'tel': '', 'fax': '', 'email': 'Melody.Ruan@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '陈俊玫', 'nickname': 'Hailey Chen', 'mob': '18050039187', 'tel': '', 'fax': '', 'email': 'hailey.c@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '周敏丽', 'nickname': 'Doris', 'mob': '18050029261', 'tel': '', 'fax': '', 'email': 'doris.zhou@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '范城香', 'nickname': 'Sherry Fan', 'mob': '18050020161', 'tel': '', 'fax': '', 'email': 'Sherry.fan@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '胡玉玲', 'nickname': 'Icy Hu', 'mob': '18050026106', 'tel': '', 'fax': '', 'email': 'lcy@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '蒋艺祺', 'nickname': 'Joyce', 'mob': '18050060380', 'tel': '', 'fax': '', 'email': 'joyce.j@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
    {'password': '123', 'name_china': '饶嘉欣', 'nickname': 'Sion', 'mob': '18050059257', 'tel': '', 'fax': '', 'email': 'sion.rao@xmkseng.com', 'group': '英语组', 'role': '英语业务员', 'enabled': True, 'permissions': ALL_PERMISSIONS},
]


def _get_conn():
    return get_db_connection()


def get_now_iso():
    return datetime.now().isoformat(timespec='seconds')


def role_to_target(role, group=''):
    if role == 'admin':
        return 'admin.html'
    if group:
        return f'app.html?group={group}'
    return ROLE_TARGETS.get(role, 'index.html')


def role_to_label(role):
    return ROLE_LABELS.get(role, role or '')


def generate_username(name_china, group, existing=None):
    if not name_china:
        return ''
    initials = ''.join(py[0] for py in lazy_pinyin(name_china)).lower()
    suffix = GROUP_SUFFIX.get(group, '')
    base = initials + suffix
    if existing is None:
        return base
    if base not in existing:
        return base
    n = 2
    while f"{base}{n}" in existing:
        n += 1
    return f"{base}{n}"


def normalize_account_row(row):
    data = row_to_dict(row) or {}
    if not data:
        return None
    raw_permissions = data.get('permissions') or '[]'
    try:
        permissions_list = json.loads(raw_permissions) if isinstance(raw_permissions, str) else raw_permissions
    except (json.JSONDecodeError, TypeError):
        permissions_list = []
    raw_preferences = data.get('preferences') or '{}'
    try:
        preferences_obj = json.loads(raw_preferences) if isinstance(raw_preferences, str) else raw_preferences
        if not isinstance(preferences_obj, dict):
            preferences_obj = {}
    except (json.JSONDecodeError, TypeError):
        preferences_obj = {}
    return {
        'id': data.get('id'),
        'username': str(data.get('username') or '').strip(),
        'name': str(data.get('name_china') or '').strip(),
        'nickname': str(data.get('nickname') or '').strip(),
        'mob': str(data.get('mob') or '').strip(),
        'tel': str(data.get('tel') or '').strip(),
        'fax': str(data.get('fax') or '').strip(),
        'email': str(data.get('email') or '').strip(),
        'dingtalkId': str(data.get('dingtalk_id') or '').strip(),
        'group': str(data.get('group') or '').strip(),
        'role': str(data.get('role') or '').strip(),
        'roleLabel': str(data.get('role_label') or '').strip(),
        'target': str(data.get('target') or '').strip(),
        'enabled': bool(data.get('enabled', 1)),
        'permissions': permissions_list,
        'preferences': preferences_obj,
        'createdAt': data.get('created_at'),
        'updatedAt': data.get('updated_at'),
    }


def ensure_user_schema():
    conn = _get_conn()
    try:
        conn.execute(CREATE_TABLE_SQL)
        conn.execute(f'CREATE INDEX IF NOT EXISTS idx_{TABLE}_username ON {TABLE} (username)')
        conn.execute(f'CREATE INDEX IF NOT EXISTS idx_{TABLE}_group ON {TABLE} ("group")')
        conn.execute(f'CREATE INDEX IF NOT EXISTS idx_{TABLE}_role ON {TABLE} (role, enabled)')
        _ensure_column(conn, 'preferences', "TEXT NOT NULL DEFAULT '{}'")
        _ensure_column(conn, 'dingtalk_id', "TEXT NOT NULL DEFAULT ''")
        conn.commit()
    finally:
        conn.close()


def _ensure_column(conn, column_name, column_def):
    cols = {row[1] for row in conn.execute(f'PRAGMA table_info({TABLE})').fetchall()}
    if column_name not in cols:
        conn.execute(f'ALTER TABLE {TABLE} ADD COLUMN {column_name} {column_def}')


def _table_exists(conn, table_name):
    row = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,)).fetchone()
    return row is not None


def _try_migrate(conn):
    has_accounts = _table_exists(conn, 'ks_accounts')
    has_contacts = _table_exists(conn, 'ks_unified_contacts')
    if not has_accounts and not has_contacts:
        return False

    now = get_now_iso()
    existing_usernames = set()

    contact_map = {}
    if has_contacts:
        try:
            rows = conn.execute('SELECT * FROM ks_unified_contacts').fetchall()
            for r in rows:
                key = (str(r['name_china'] or '').strip(), str(r['group'] or '').strip())
                contact_map[key] = dict(r)
        except sqlite3.OperationalError:
            pass

    if has_accounts:
        try:
            accounts = conn.execute('SELECT * FROM ks_accounts').fetchall()
            for a in accounts:
                username = str(a['username'] or '').strip()
                role = str(a['role'] or '').strip()
                group = '' if role == 'admin' else role
                name_china = str(a['name'] or '').strip()
                key = (name_china, group)
                contact = contact_map.pop(key, None)

                conn.execute(
                    f'''INSERT INTO {TABLE} (
                        username, password_hash, name_china, nickname, mob, tel, fax, email,
                        "group", role, role_label, target, enabled, permissions, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                    (
                        username,
                        str(a['password_hash'] or ''),
                        name_china,
                        contact.get('nickname', '') if contact else '',
                        contact.get('mob', '') if contact else '',
                        contact.get('tel', '') if contact else '',
                        contact.get('fax', '') if contact else '',
                        contact.get('email', '') if contact else '',
                        group,
                        role,
                        str(a['role_label'] or ''),
                        str(a['target'] or ''),
                        int(a['enabled']) if a['enabled'] is not None else 1,
                        str(a['permissions'] or '[]'),
                        str(a['created_at'] or now),
                        str(a['updated_at'] or now),
                    ),
                )
                existing_usernames.add(username)
        except sqlite3.OperationalError:
            pass

    for key, c in contact_map.items():
        name_china, group = key
        uname = generate_username(name_china, group, existing_usernames)
        conn.execute(
            f'''INSERT INTO {TABLE} (
                username, password_hash, name_china, nickname, mob, tel, fax, email,
                "group", role, role_label, target, enabled, permissions, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (
                uname, '',
                name_china,
                str(c.get('nickname') or ''),
                str(c.get('mob') or ''),
                str(c.get('tel') or ''),
                str(c.get('fax') or ''),
                str(c.get('email') or ''),
                group, '', '', '', 1, '[]',
                str(c.get('created_at') or now),
                str(c.get('updated_at') or now),
            ),
        )
        existing_usernames.add(uname)

    conn.commit()
    return True


def _insert_defaults(conn):
    now = get_now_iso()
    existing_usernames = set()

    for item in DEFAULT_USERS:
        username = str(item.get('username') or '').strip()
        if not username:
            username = generate_username(item.get('name_china', ''), item.get('group', ''), existing_usernames)
        existing_usernames.add(username)

        password = str(item.get('password') or '').strip()
        password_hash = generate_password_hash(password) if password else ''
        role = str(item.get('role') or '').strip()
        perms = item.get('permissions') or []
        enabled = 1 if item.get('enabled', True) else 0

        conn.execute(
            f'''INSERT INTO {TABLE} (
                username, password_hash, name_china, nickname, mob, tel, fax, email,
                "group", role, role_label, target, enabled, permissions, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (
                username,
                password_hash,
                str(item.get('name_china') or ''),
                str(item.get('nickname') or ''),
                str(item.get('mob') or ''),
                str(item.get('tel') or ''),
                str(item.get('fax') or ''),
                str(item.get('email') or ''),
                str(item.get('group') or ''),
                role,
                role_to_label(role),
                role_to_target(role),
                enabled,
                json.dumps(perms, ensure_ascii=False),
                now,
                now,
            ),
        )
    conn.commit()


def ensure_default_users():
    ensure_user_schema()
    conn = _get_conn()
    try:
        count = conn.execute(f'SELECT COUNT(*) FROM {TABLE}').fetchone()[0]
        if count > 0:
            _migrate_old_roles(conn)
            return
        migrated = _try_migrate(conn)
        if not migrated:
            _insert_defaults(conn)
    finally:
        conn.close()


def _migrate_old_roles(conn):
    old_role_map = {'韩语组': '韩语业务员', '英语组': '英语业务员', '日语组': '日语业务员', '设计组': '业务助理'}
    for old_role, new_role in old_role_map.items():
        rows = conn.execute(f'SELECT id, "group", email FROM {TABLE} WHERE role = ?', (old_role,)).fetchall()
        for r in rows:
            email = str(r['email'] or '').strip()
            group = str(r['group'] or '').strip()
            role = GROUP_ROLE_MAP.get(group, '业务助理') if email else '业务助理'
            target = role_to_target(role, group)
            conn.execute(
                f'UPDATE {TABLE} SET role = ?, role_label = ?, target = ? WHERE id = ?',
                (role, role, target, r['id']),
            )
    conn.commit()


# ========== Account functions (for auth_service.py) ==========

def get_account_by_username(username, *, include_password_hash=False):
    ensure_user_schema()
    conn = _get_conn()
    try:
        row = conn.execute(
            f'SELECT * FROM {TABLE} WHERE username = ?',
            (str(username or '').strip(),),
        ).fetchone()
        if not row:
            return None
        if include_password_hash:
            return row_to_dict(row)
        return normalize_account_row(row)
    finally:
        conn.close()


def verify_account_password(username, password):
    row = get_account_by_username(username, include_password_hash=True)
    if not row:
        return None
    if int(row.get('enabled', 1)) != 1:
        return None
    if not str(row.get('password_hash') or ''):
        return None
    if not check_password_hash(str(row['password_hash']), str(password or '')):
        return None
    return get_account_by_username(username)


def save_account(username, password, role, enabled=True, permissions=None, name='',
                 nickname='', mob='', tel='', fax='', email='', group='', dingtalk_id='',
                 preferences=None):
    normalized_username = str(username or '').strip()
    normalized_password = str(password or '').strip()
    normalized_role = str(role or '').strip()
    normalized_name = str(name or '').strip()
    normalized_nickname = str(nickname or '').strip()
    normalized_mob = str(mob or '').strip()
    normalized_tel = str(tel or '').strip()
    normalized_fax = str(fax or '').strip()
    normalized_email = str(email or '').strip()
    normalized_group = str(group or '').strip()
    normalized_dingtalk_id = str(dingtalk_id or '').strip()
    role_label = role_to_label(normalized_role)
    target = role_to_target(normalized_role, normalized_group)
    now = get_now_iso()
    perms_json = json.dumps(permissions if permissions is not None else (ALL_PERMISSIONS if normalized_role else []), ensure_ascii=False)
    prefs_value = preferences if isinstance(preferences, dict) else {}
    prefs_json = json.dumps(prefs_value, ensure_ascii=False)

    ensure_user_schema()
    conn = _get_conn()
    try:
        if not normalized_username:
            existing_usernames = {r[0] for r in conn.execute(f'SELECT username FROM {TABLE}').fetchall()}
            normalized_username = generate_username(normalized_name, normalized_group, existing_usernames)

        existing = conn.execute(
            f'SELECT id, username, password_hash, created_at, preferences FROM {TABLE} WHERE username = ?',
            (normalized_username,),
        ).fetchone()

        if existing:
            created_at = existing['created_at']
            old_hash = existing['password_hash'] or ''
            new_hash = generate_password_hash(normalized_password) if normalized_password else old_hash
            if preferences is None:
                prefs_json = str(existing['preferences'] or '{}')
            conn.execute(
                f'''UPDATE {TABLE}
                SET password_hash = ?, name_china = ?, nickname = ?, mob = ?, tel = ?, fax = ?, email = ?,
                    dingtalk_id = ?, "group" = ?, role = ?, role_label = ?, target = ?, enabled = ?,
                    permissions = ?, preferences = ?, updated_at = ?
                WHERE username = ?''',
                (
                    new_hash,
                    normalized_name,
                    normalized_nickname,
                    normalized_mob,
                    normalized_tel,
                    normalized_fax,
                    normalized_email,
                    normalized_dingtalk_id,
                    normalized_group,
                    normalized_role,
                    role_label,
                    target,
                    1 if enabled else 0,
                    perms_json,
                    prefs_json,
                    now,
                    normalized_username,
                ),
            )
        else:
            created_at = now
            conn.execute(
                f'''INSERT INTO {TABLE} (
                    username, password_hash, name_china, nickname, mob, tel, fax, email, dingtalk_id,
                    "group", role, role_label, target, enabled, permissions, preferences, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (
                    normalized_username,
                    generate_password_hash(normalized_password) if normalized_password else '',
                    normalized_name,
                    normalized_nickname,
                    normalized_mob,
                    normalized_tel,
                    normalized_fax,
                    normalized_email,
                    normalized_dingtalk_id,
                    normalized_group,
                    normalized_role,
                    role_label,
                    target,
                    1 if enabled else 0,
                    perms_json,
                    prefs_json,
                    created_at,
                    now,
                ),
            )

        conn.commit()
        return {
            'username': normalized_username,
            'name': normalized_name,
            'nickname': normalized_nickname,
            'mob': normalized_mob,
            'tel': normalized_tel,
            'fax': normalized_fax,
            'email': normalized_email,
            'dingtalkId': normalized_dingtalk_id,
            'group': normalized_group,
            'role': normalized_role,
            'roleLabel': role_label,
            'target': target,
            'enabled': bool(enabled),
            'permissions': permissions if permissions is not None else ALL_PERMISSIONS,
            'preferences': prefs_value,
            'createdAt': created_at,
            'updatedAt': now,
        }
    finally:
        conn.close()


def update_account_password(username, password):
    normalized_username = str(username or '').strip()
    normalized_password = str(password or '').strip()
    now = get_now_iso()
    ensure_user_schema()
    conn = _get_conn()
    try:
        cursor = conn.execute(
            f'UPDATE {TABLE} SET password_hash = ?, updated_at = ? WHERE username = ?',
            (generate_password_hash(normalized_password), now, normalized_username),
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def _deep_merge(base, incoming):
    if not isinstance(base, dict) or not isinstance(incoming, dict):
        return incoming
    merged = dict(base)
    for key, value in incoming.items():
        if value is None:
            merged.pop(key, None)  # null = 删除该键（用于「恢复默认」）
        elif isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def update_user_preferences(username, incoming):
    normalized_username = str(username or '').strip()
    if not isinstance(incoming, dict):
        incoming = {}
    now = get_now_iso()
    ensure_user_schema()
    conn = _get_conn()
    try:
        row = conn.execute(
            f'SELECT preferences FROM {TABLE} WHERE username = ?',
            (normalized_username,),
        ).fetchone()
        if not row:
            return None
        raw = row['preferences'] or '{}'
        try:
            existing = json.loads(raw) if isinstance(raw, str) else raw
            if not isinstance(existing, dict):
                existing = {}
        except (json.JSONDecodeError, TypeError):
            existing = {}
        merged = _deep_merge(existing, incoming)
        conn.execute(
            f'UPDATE {TABLE} SET preferences = ?, updated_at = ? WHERE username = ?',
            (json.dumps(merged, ensure_ascii=False), now, normalized_username),
        )
        conn.commit()
        return merged
    finally:
        conn.close()


def set_account_enabled(username, enabled):
    normalized_username = str(username or '').strip()
    now = get_now_iso()
    ensure_user_schema()
    conn = _get_conn()
    try:
        cursor = conn.execute(
            f'UPDATE {TABLE} SET enabled = ?, updated_at = ? WHERE username = ?',
            (1 if enabled else 0, now, normalized_username),
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def delete_account(username):
    ensure_user_schema()
    conn = _get_conn()
    try:
        cursor = conn.execute(f'DELETE FROM {TABLE} WHERE username = ?', (str(username or '').strip(),))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def list_accounts():
    ensure_user_schema()
    conn = _get_conn()
    try:
        rows = conn.execute(
            f'SELECT * FROM {TABLE} ORDER BY CASE WHEN role = "admin" THEN 0 ELSE 1 END, id'
        ).fetchall()
        return [normalize_account_row(row) for row in rows]
    finally:
        conn.close()


def bulk_import_accounts(accounts_data):
    ensure_user_schema()
    conn = _get_conn()
    results = {'success': [], 'failed': []}
    try:
        now = get_now_iso()
        for item in accounts_data:
            username = str(item.get('username') or '').strip()
            password = str(item.get('password') or '').strip()
            role = str(item.get('role') or '').strip()
            name = str(item.get('name') or '').strip()

            if not username or not role:
                results['failed'].append({'username': username or '(空)', 'reason': '账号、角色不能为空'})
                continue

            if role not in ROLE_TARGETS:
                results['failed'].append({'username': username, 'reason': f'不支持的角色: {role}'})
                continue

            role_label = role_to_label(role)
            target = role_to_target(role)
            perms = item.get('permissions') or ALL_PERMISSIONS
            enabled = bool(item.get('enabled', True))

            existing = conn.execute(
                f'SELECT id, created_at, password_hash FROM {TABLE} WHERE username = ?',
                (username,),
            ).fetchone()

            if existing:
                created_at = existing['created_at']
                old_hash = existing['password_hash'] or ''
                conn.execute(
                    f'''UPDATE {TABLE}
                    SET password_hash = ?, name_china = ?, role = ?, role_label = ?, target = ?,
                        enabled = ?, permissions = ?, updated_at = ?
                    WHERE username = ?''',
                    (
                        generate_password_hash(password) if password else old_hash,
                        name, role, role_label, target,
                        1 if enabled else 0,
                        json.dumps(perms, ensure_ascii=False),
                        now, username,
                    ),
                )
            else:
                created_at = now
                conn.execute(
                    f'''INSERT INTO {TABLE} (
                        username, password_hash, name_china, role, role_label, target,
                        enabled, permissions, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                    (
                        username,
                        generate_password_hash(password) if password else '',
                        name, role, role_label, target,
                        1 if enabled else 0,
                        json.dumps(perms, ensure_ascii=False),
                        created_at, now,
                    ),
                )

            results['success'].append(username)
        conn.commit()
    finally:
        conn.close()

    return results


def bulk_update_dingtalk_id(updates):
    ensure_user_schema()
    conn = _get_conn()
    results = {'success': [], 'failed': []}
    try:
        now = get_now_iso()
        for item in updates:
            name = str(item.get('name') or '').strip()
            userid = str(item.get('dingtalk_id') or '').strip()
            if not name:
                results['failed'].append({'name': '(空)', 'dingtalkId': userid, 'reason': '姓名为空'})
                continue
            if not userid:
                results['failed'].append({'name': name, 'dingtalkId': userid, 'reason': 'UserId 为空'})
                continue
            cursor = conn.execute(
                f'UPDATE {TABLE} SET dingtalk_id = ?, updated_at = ? WHERE name_china = ?',
                (userid, now, name),
            )
            if cursor.rowcount > 0:
                results['success'].append({'name': name, 'dingtalkId': userid, 'count': cursor.rowcount})
            else:
                results['failed'].append({'name': name, 'dingtalkId': userid, 'reason': '未找到匹配人员'})
        conn.commit()
    finally:
        conn.close()

    return results


def get_dingtalk_id_by_name(name):
    """根据中文名（name_china）查询用户的钉钉 userid，返回字符串或空串。"""
    name = str(name or '').strip()
    if not name:
        return ''
    ensure_user_schema()
    conn = _get_conn()
    try:
        row = conn.execute(
            f'SELECT dingtalk_id FROM {TABLE} WHERE name_china = ?',
            (name,),
        ).fetchone()
        if not row:
            return ''
        return str(row['dingtalk_id'] or '').strip()
    finally:
        conn.close()


def reset_accounts():
    ensure_user_schema()
    conn = _get_conn()
    try:
        conn.execute(f'DELETE FROM {TABLE}')
        conn.commit()
        _insert_defaults(conn)
    finally:
        conn.close()

    return list_accounts()


# ========== Contact functions (for unified_contacts.py / email_reply_watcher.py) ==========

def ensure_default_unified_contacts():
    ensure_default_users()


def list_unified_contacts(group=None):
    ensure_user_schema()
    conn = _get_conn()
    try:
        if group:
            rows = conn.execute(f'SELECT * FROM {TABLE} WHERE "group" = ? ORDER BY id', (group,)).fetchall()
        else:
            rows = conn.execute(f'SELECT * FROM {TABLE} ORDER BY "group", id').fetchall()
        return [row_to_dict(r) for r in rows]
    finally:
        conn.close()


def get_unified_contact(contact_id):
    ensure_user_schema()
    conn = _get_conn()
    try:
        row = conn.execute(f'SELECT * FROM {TABLE} WHERE id = ?', (contact_id,)).fetchone()
        return row_to_dict(row)
    finally:
        conn.close()


def add_unified_contact(name_china, nickname, mob, tel, fax, email, group):
    ensure_user_schema()
    conn = _get_conn()
    try:
        existing_usernames = {r[0] for r in conn.execute(f'SELECT username FROM {TABLE}').fetchall()}
        username = generate_username(name_china, group, existing_usernames)
        now = get_now_iso()
        cur = conn.execute(
            f'''INSERT INTO {TABLE} (
                username, password_hash, name_china, nickname, mob, tel, fax, email,
                "group", role, role_label, target, enabled, permissions, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (username, '', name_china, nickname, mob, tel, fax, email, group, '', '', '', 1, '[]', now, now),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def update_unified_contact(contact_id, name_china, nickname, mob, tel, fax, email, group):
    ensure_user_schema()
    conn = _get_conn()
    try:
        conn.execute(
            f'''UPDATE {TABLE}
            SET name_china = ?, nickname = ?, mob = ?, tel = ?, fax = ?, email = ?,
                "group" = ?, updated_at = datetime('now','localtime')
            WHERE id = ?''',
            (name_china, nickname, mob, tel, fax, email, group, contact_id),
        )
        conn.commit()
    finally:
        conn.close()


def delete_unified_contact(contact_id):
    ensure_user_schema()
    conn = _get_conn()
    try:
        conn.execute(f'DELETE FROM {TABLE} WHERE id = ?', (contact_id,))
        conn.commit()
    finally:
        conn.close()
