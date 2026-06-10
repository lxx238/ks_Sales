import io

import pandas as pd
from flask import session

from backend.repositories.user_repository import (
    ROLE_TARGETS,
    bulk_import_accounts,
    delete_account,
    get_account_by_username,
    list_accounts,
    reset_accounts,
    save_account,
    set_account_enabled,
    update_account_password,
    verify_account_password,
)
from backend.utils.validators import ensure_json_payload, ensure_required_value

ROLE_LABEL_TO_KEY = {v: k for k, v in {
    'admin': '管理员',
    '韩语业务员': '韩语业务员',
    '英语业务员': '英语业务员',
    '日语业务员': '日语业务员',
    '业务助理': '业务助理',
}.items()}


def parse_excel_accounts(file_storage):
    if not file_storage or not file_storage.filename:
        raise ValueError('请选择要上传的 Excel 文件')

    filename = str(file_storage.filename).lower()
    if not (filename.endswith('.xlsx') or filename.endswith('.xls')):
        raise ValueError('仅支持 .xlsx 或 .xls 格式的 Excel 文件')

    try:
        df = pd.read_excel(file_storage, dtype=str)
    except Exception as exc:
        raise ValueError(f'Excel 文件读取失败: {exc}')

    col_mapping = {}
    required_cols = ['账号', '密码', '角色']
    for col in df.columns:
        col_stripped = str(col).strip()
        if col_stripped in required_cols:
            col_mapping[col_stripped] = col

    for rc in required_cols:
        if rc not in col_mapping:
            raise ValueError(f'Excel 缺少必要列: {rc}。需要包含「账号」「密码」「角色」三列')

    accounts_data = []
    for _, row in df.iterrows():
        username = str(row.get(col_mapping['账号']) or '').strip()
        password = str(row.get(col_mapping['密码']) or '').strip()
        role_raw = str(row.get(col_mapping['角色']) or '').strip()

        if not username:
            continue

        role = ROLE_LABEL_TO_KEY.get(role_raw, role_raw)

        enabled_val = row.get('启用')
        if pd.notna(enabled_val):
            enabled_str = str(enabled_val).strip().lower()
            enabled = enabled_str not in ('0', 'false', '否', '停用', '')
        else:
            enabled = True

        accounts_data.append({
            'username': username,
            'password': password,
            'role': role,
            'enabled': enabled,
        })

    if not accounts_data:
        raise ValueError('Excel 中没有找到有效的账号数据')

    return accounts_data


def generate_import_template():
    data = {
        '账号': ['zhangsan', 'lisi', 'wangwu'],
        '密码': ['Password@123', 'Password@123', 'Password@123'],
        '角色': ['韩语组', '英语组', '日语组'],
        '启用': ['是', '是', '否'],
    }
    df = pd.DataFrame(data)
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='账号导入')
        worksheet = writer.sheets['账号导入']
        for col_idx in range(len(data)):
            worksheet.column_dimensions[chr(65 + col_idx)].width = 20
    buffer.seek(0)
    return buffer


SESSION_USER_KEY = 'ks_auth_username'

ROLE_OPTIONS = {'admin', '韩语业务员', '英语业务员', '日语业务员', '业务助理'}

ALL_PERMISSIONS = [
    'quotation',
    'cad',
    'database',
    'database_submit',
    'database_download',
    'records',
    'records_review',
    'questions',
]


def clear_auth_session():
    session.pop(SESSION_USER_KEY, None)


def persist_auth_session(account):
    session[SESSION_USER_KEY] = account['username']
    session.permanent = True


def get_current_account(optional=False):
    username = str(session.get(SESSION_USER_KEY, '') or '').strip()
    if not username:
        if optional:
            return None
        raise PermissionError('请先登录')

    account = get_account_by_username(username)
    if not account or account.get('enabled') is False:
        clear_auth_session()
        if optional:
            return None
        raise PermissionError('登录已失效，请重新登录')

    return account


def ensure_admin_account():
    account = get_current_account()
    if account.get('role') != 'admin':
        raise PermissionError('只有管理员可以执行该操作')
    return account


def ensure_permission(permission):
    account = get_current_account()
    if account.get('role') == 'admin':
        return account
    perms = account.get('permissions') or []
    if permission not in perms:
        raise PermissionError(f'没有该功能的访问权限: {permission}')
    return account


def normalize_account_payload(data):
    ensure_json_payload(data)

    username = str((data or {}).get('username') or '').strip()
    password = str((data or {}).get('password') or '').strip()
    name = str((data or {}).get('name') or '').strip()
    role = str((data or {}).get('role') or '').strip()
    enabled = bool((data or {}).get('enabled', True))
    raw_permissions = (data or {}).get('permissions')
    permissions = raw_permissions if isinstance(raw_permissions, list) else None
    nickname = str((data or {}).get('nickname') or '').strip()
    mob = str((data or {}).get('mob') or '').strip()
    tel = str((data or {}).get('tel') or '').strip()
    fax = str((data or {}).get('fax') or '').strip()
    email = str((data or {}).get('email') or '').strip()
    group = str((data or {}).get('group') or '').strip()

    ensure_required_value(role, '角色不能为空')
    if role not in ROLE_OPTIONS:
        raise ValueError('角色不支持')
    ensure_required_value(username, '账号不能为空')

    return {
        'username': username,
        'password': password,
        'name': name,
        'role': role,
        'enabled': enabled,
        'permissions': permissions,
        'nickname': nickname,
        'mob': mob,
        'tel': tel,
        'fax': fax,
        'email': email,
        'group': group,
    }


def login_user(data):
    try:
        ensure_json_payload(data)
        username = str((data or {}).get('username') or '').strip()
        password = str((data or {}).get('password') or '').strip()

        ensure_required_value(username, '账号不能为空')
        ensure_required_value(password, '密码不能为空')

        account = verify_account_password(username, password)
        if not account:
            return {'success': False, 'message': '账号或密码不正确，或账号已停用。'}, 401

        clear_auth_session()
        persist_auth_session(account)
        return {'success': True, 'data': account, 'message': '登录成功'}, 200
    except ValueError as exc:
        return {'success': False, 'message': str(exc)}, 400
    except Exception as exc:
        return {'success': False, 'message': f'登录失败: {exc}'}, 500


def logout_user():
    clear_auth_session()
    session.clear()
    return {'success': True, 'message': '已退出登录'}, 200


def get_current_user():
    try:
        account = get_current_account()
        return {'success': True, 'data': account, 'message': '查询成功'}, 200
    except PermissionError as exc:
        return {'success': False, 'message': str(exc)}, 401
    except Exception as exc:
        return {'success': False, 'message': f'查询失败: {exc}'}, 500


def list_account_items():
    try:
        ensure_admin_account()
        accounts = list_accounts()
        return {
            'success': True,
            'items': accounts,
            'total': len(accounts),
            'message': '查询成功',
        }, 200
    except PermissionError as exc:
        return {'success': False, 'message': str(exc)}, 403
    except Exception as exc:
        return {'success': False, 'message': f'查询失败: {exc}'}, 500


def upsert_account_item(data):
    try:
        ensure_admin_account()
        normalized = normalize_account_payload(data)

        existing = get_account_by_username(normalized['username'])
        if not existing and not normalized.get('password'):
            return {'success': False, 'message': '新账号必须设置密码'}, 400
        if normalized['role'] == 'admin' and normalized['enabled'] is False:
            return {'success': False, 'message': '管理员账号不可停用'}, 400
        if existing and existing.get('role') == 'admin':
            if normalized['role'] != 'admin' or normalized['enabled'] is False:
                return {'success': False, 'message': '管理员账号不可降权或停用'}, 400

        account = save_account(
            username=normalized['username'],
            password=normalized.get('password', ''),
            role=normalized['role'],
            enabled=normalized['enabled'],
            permissions=normalized.get('permissions'),
            name=normalized.get('name', ''),
            nickname=normalized.get('nickname', ''),
            mob=normalized.get('mob', ''),
            tel=normalized.get('tel', ''),
            fax=normalized.get('fax', ''),
            email=normalized.get('email', ''),
            group=normalized.get('group', ''),
        )
        return {'success': True, 'data': account, 'message': '账号已保存'}, 200
    except PermissionError as exc:
        return {'success': False, 'message': str(exc)}, 403
    except ValueError as exc:
        return {'success': False, 'message': str(exc)}, 400
    except Exception as exc:
        return {'success': False, 'message': f'保存失败: {exc}'}, 500


def reset_account_password(username, data):
    try:
        ensure_admin_account()
        ensure_json_payload(data)

        normalized_username = str(username or '').strip()
        password = str((data or {}).get('password') or '').strip()

        ensure_required_value(normalized_username, '账号不能为空')
        ensure_required_value(password, '新密码不能为空')

        account = get_account_by_username(normalized_username)
        if not account:
            return {'success': False, 'message': '账号不存在'}, 404

        updated = update_account_password(normalized_username, password)
        if not updated:
            return {'success': False, 'message': '密码重置失败'}, 500

        return {'success': True, 'message': '密码已更新'}, 200
    except PermissionError as exc:
        return {'success': False, 'message': str(exc)}, 403
    except ValueError as exc:
        return {'success': False, 'message': str(exc)}, 400
    except Exception as exc:
        return {'success': False, 'message': f'密码重置失败: {exc}'}, 500


def toggle_account_item(username, data):
    try:
        ensure_admin_account()
        ensure_json_payload(data)

        normalized_username = str(username or '').strip()
        ensure_required_value(normalized_username, '账号不能为空')

        account = get_account_by_username(normalized_username)
        if not account:
            return {'success': False, 'message': '账号不存在'}, 404
        if account.get('role') == 'admin':
            return {'success': False, 'message': '管理员账号不可停用'}, 400

        enabled = bool((data or {}).get('enabled', True))
        updated = set_account_enabled(normalized_username, enabled)
        if not updated:
            return {'success': False, 'message': '账号状态更新失败'}, 500

        return {'success': True, 'message': '账号状态已更新'}, 200
    except PermissionError as exc:
        return {'success': False, 'message': str(exc)}, 403
    except ValueError as exc:
        return {'success': False, 'message': str(exc)}, 400
    except Exception as exc:
        return {'success': False, 'message': f'账号状态更新失败: {exc}'}, 500


def delete_account_item(username):
    try:
        ensure_admin_account()
        normalized_username = str(username or '').strip()
        ensure_required_value(normalized_username, '账号不能为空')

        account = get_account_by_username(normalized_username)
        if not account:
            return {'success': False, 'message': '账号不存在'}, 404
        if account.get('role') == 'admin':
            return {'success': False, 'message': '管理员账号不可删除'}, 400

        deleted = delete_account(normalized_username)
        if not deleted:
            return {'success': False, 'message': '账号删除失败'}, 500

        return {'success': True, 'message': '账号已删除'}, 200
    except PermissionError as exc:
        return {'success': False, 'message': str(exc)}, 403
    except ValueError as exc:
        return {'success': False, 'message': str(exc)}, 400
    except Exception as exc:
        return {'success': False, 'message': f'账号删除失败: {exc}'}, 500


def import_account_items(file_storage):
    try:
        ensure_admin_account()
        accounts_data = parse_excel_accounts(file_storage)
        results = bulk_import_accounts(accounts_data)

        total = len(accounts_data)
        success_count = len(results['success'])
        failed_count = len(results['failed'])

        message = f'导入完成：共 {total} 条，成功 {success_count} 条'
        if failed_count > 0:
            message += f'，失败 {failed_count} 条'
            failed_details = '; '.join(
                f"{f['username']}: {f['reason']}" for f in results['failed']
            )
            message += f'。失败详情: {failed_details}'

        return {
            'success': True,
            'message': message,
            'total': total,
            'successCount': success_count,
            'failedCount': failed_count,
            'failedItems': results['failed'],
        }, 200
    except PermissionError as exc:
        return {'success': False, 'message': str(exc)}, 403
    except ValueError as exc:
        return {'success': False, 'message': str(exc)}, 400
    except Exception as exc:
        return {'success': False, 'message': f'导入失败: {exc}'}, 500


def reset_account_items():
    try:
        ensure_admin_account()
        accounts = reset_accounts()
        return {
            'success': True,
            'items': accounts,
            'total': len(accounts),
            'message': '默认账号已恢复',
        }, 200
    except PermissionError as exc:
        return {'success': False, 'message': str(exc)}, 403
    except Exception as exc:
        return {'success': False, 'message': f'恢复失败: {exc}'}, 500
