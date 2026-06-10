from backend.repositories.question_repository import (
    QUESTION_STATUSES,
    QUESTION_STATUS_ANSWERED,
    QUESTION_STATUS_CLOSED,
    QUESTION_STATUS_PENDING,
    close_question,
    create_question,
    get_question,
    list_questions,
    update_question_reply,
)
from backend.services.auth_service import get_current_account


def get_actor_info():
    account = get_current_account(optional=True)
    if account:
        return str(account.get('username') or '').strip(), str(account.get('role') or '').strip()
    return '', ''


def ensure_admin_role(role):
    if role != 'admin':
        raise PermissionError('只有管理员可以回复或关闭问题')


def submit_question(data, actor_user='', actor_role=''):
    try:
        title = str((data or {}).get('title') or '').strip()
        content = str((data or {}).get('content') or '').strip()
        category = str((data or {}).get('category') or '').strip()
        submitter = str(actor_user or (data or {}).get('submitter') or '').strip() or 'anonymous'
        submitter_role = str(actor_role or (data or {}).get('submitter_role') or '').strip()

        if not title:
            return {'success': False, 'message': '标题不能为空'}, 400
        if not content:
            return {'success': False, 'message': '内容不能为空'}, 400

        question_id = create_question(
            title=title,
            content=content,
            category=category,
            submitter=submitter,
            submitter_role=submitter_role,
        )
        return {
            'success': True,
            'question_id': question_id,
            'message': '问题已提交，等待管理员回复',
        }, 200
    except ValueError as exc:
        return {'success': False, 'message': str(exc)}, 400
    except Exception as exc:
        return {'success': False, 'message': f'提交失败: {exc}'}, 500


def get_question_list(args, actor_role, actor_user=''):
    try:
        page = max(int(args.get('page', 1)), 1)
        page_size = max(int(args.get('page_size', 10)), 1)
        status = str(args.get('status', '')).strip()
        submitter = str(args.get('submitter', '')).strip()

        if status and status not in QUESTION_STATUSES:
            return {'success': False, 'message': '状态不支持'}, 400

        if actor_role != 'admin':
            submitter = submitter or str(actor_user or '').strip()
            if not submitter:
                return {'success': False, 'message': '缺少提交人标识'}, 400

        result = list_questions(page, page_size, status=status, submitter=submitter)
        return {
            'success': True,
            **result,
            'message': '查询成功',
        }, 200
    except Exception as exc:
        return {'success': False, 'message': f'查询失败: {exc}'}, 500


def get_question_detail(question_id):
    try:
        question = get_question(question_id)
        if not question:
            return {'success': False, 'message': '问题不存在'}, 404
        return {
            'success': True,
            'data': question,
            'message': '查询成功',
        }, 200
    except Exception as exc:
        return {'success': False, 'message': f'查询失败: {exc}'}, 500


def reply_question(question_id, data, actor_role, actor_user):
    try:
        ensure_admin_role(actor_role)
    except PermissionError as exc:
        return {'success': False, 'message': str(exc)}, 403

    reply = str((data or {}).get('reply') or '').strip()
    if not reply:
        return {'success': False, 'message': '回复内容不能为空'}, 400

    reviewer = str(actor_user or '').strip() or 'admin'

    try:
        question = get_question(question_id)
        if not question:
            return {'success': False, 'message': '问题不存在'}, 404

        update_question_reply(
            question_id=question_id,
            reply=reply,
            reviewed_by=reviewer,
            status=QUESTION_STATUS_ANSWERED,
        )
        return {'success': True, 'message': '回复成功'}, 200
    except LookupError as exc:
        return {'success': False, 'message': str(exc)}, 404
    except Exception as exc:
        return {'success': False, 'message': f'回复失败: {exc}'}, 500


def close_question_item(question_id, actor_role, actor_user):
    try:
        ensure_admin_role(actor_role)
    except PermissionError as exc:
        return {'success': False, 'message': str(exc)}, 403

    try:
        question = get_question(question_id)
        if not question:
            return {'success': False, 'message': '问题不存在'}, 404

        close_question(question_id)
        return {'success': True, 'message': '问题已关闭'}, 200
    except LookupError as exc:
        return {'success': False, 'message': str(exc)}, 404
    except Exception as exc:
        return {'success': False, 'message': f'关闭失败: {exc}'}, 500
