"""
总助日程提醒 - API 路由层（Blueprint）。
所有接口需 'schedule' 权限（admin 放行）。
"""
from flask import Blueprint, jsonify, request, Response

from backend.services.auth_service import ensure_permission, get_current_account
from backend.services import schedule_service


schedule_bp = Blueprint('schedule', __name__, url_prefix='/api/schedule')


def _actor():
    try:
        account = get_current_account(optional=True)
        if account:
            return str(account.get('username') or '').strip()
    except Exception:
        pass
    return request.headers.get('X-KS-User', '').strip()


def _json_or_400(data):
    if data is None:
        return {'success': False, 'message': '请求体不能为空'}, 400
    return None


@schedule_bp.get('/month')
def month_route():
    ensure_permission('schedule')
    try:
        year = request.args.get('year', type=int)
        month = request.args.get('month', type=int)
        if not year or not month or not (1 <= month <= 12):
            from datetime import date
            today = date.today()
            year, month = today.year, today.month
        data = schedule_service.get_month(year, month)
        return jsonify({'success': True, 'year': year, 'month': month, 'data': data}), 200
    except Exception as exc:
        return jsonify({'success': False, 'message': f'查询失败: {exc}'}), 500


@schedule_bp.get('/day')
def day_route():
    ensure_permission('schedule')
    try:
        from datetime import date
        day_str = (request.args.get('date') or date.today().isoformat()).strip()
        items = schedule_service.get_day(day_str)
        return jsonify({'success': True, 'date': day_str, 'data': items}), 200
    except Exception as exc:
        return jsonify({'success': False, 'message': f'查询失败: {exc}'}), 500


@schedule_bp.get('/<int:schedule_id>')
def detail_route(schedule_id):
    ensure_permission('schedule')
    try:
        result = schedule_service.get_detail(schedule_id)
        if not result:
            return jsonify({'success': False, 'message': '日程不存在'}), 404
        return jsonify({'success': True, 'data': result}), 200
    except Exception as exc:
        return jsonify({'success': False, 'message': f'查询失败: {exc}'}), 500


@schedule_bp.get('')
def list_route():
    ensure_permission('schedule')
    try:
        status = (request.args.get('status') or '').strip()
        schedule_id = request.args.get('schedule_id', type=int)
        reminders = schedule_service.list_reminders(status=status, schedule_id=schedule_id)
        return jsonify({'success': True, 'data': reminders}), 200
    except Exception as exc:
        return jsonify({'success': False, 'message': f'查询失败: {exc}'}), 500


@schedule_bp.post('')
def create_route():
    ensure_permission('schedule')
    data = request.get_json(silent=True)
    err = _json_or_400(data)
    if err:
        return jsonify(err)
    try:
        result = schedule_service.create_schedule(data, actor=_actor())
        return jsonify({'success': True, 'message': '日程已创建', 'data': result}), 200
    except ValueError as exc:
        return jsonify({'success': False, 'message': str(exc)}), 400
    except Exception as exc:
        return jsonify({'success': False, 'message': f'创建失败: {exc}'}), 500


@schedule_bp.put('/<int:schedule_id>')
def update_route(schedule_id):
    ensure_permission('schedule')
    data = request.get_json(silent=True)
    err = _json_or_400(data)
    if err:
        return jsonify(err)
    try:
        result = schedule_service.update_schedule(schedule_id, data)
        return jsonify({'success': True, 'message': '日程已更新', 'data': result}), 200
    except LookupError:
        return jsonify({'success': False, 'message': '日程不存在'}), 404
    except ValueError as exc:
        return jsonify({'success': False, 'message': str(exc)}), 400
    except Exception as exc:
        return jsonify({'success': False, 'message': f'更新失败: {exc}'}), 500


@schedule_bp.delete('/<int:schedule_id>')
def delete_route(schedule_id):
    ensure_permission('schedule')
    try:
        ok = schedule_service.delete_schedule(schedule_id)
        if not ok:
            return jsonify({'success': False, 'message': '日程不存在'}), 404
        return jsonify({'success': True, 'message': '日程已删除'}), 200
    except Exception as exc:
        return jsonify({'success': False, 'message': f'删除失败: {exc}'}), 500


@schedule_bp.post('/<int:schedule_id>/status')
def status_route(schedule_id):
    ensure_permission('schedule')
    data = request.get_json(silent=True) or {}
    try:
        status = str(data.get('status') or '').strip()
        ok = schedule_service.set_schedule_status(schedule_id, status)
        if not ok:
            return jsonify({'success': False, 'message': '日程不存在'}), 404
        return jsonify({'success': True, 'message': '状态已更新'}), 200
    except ValueError as exc:
        return jsonify({'success': False, 'message': str(exc)}), 400
    except Exception as exc:
        return jsonify({'success': False, 'message': f'更新失败: {exc}'}), 500


@schedule_bp.get('/briefing/config')
def briefing_config_route():
    ensure_permission('schedule')
    try:
        return jsonify({'success': True, 'data': schedule_service.get_briefing_config_api()}), 200
    except Exception as exc:
        return jsonify({'success': False, 'message': f'查询失败: {exc}'}), 500


@schedule_bp.put('/briefing/config')
def briefing_config_update_route():
    ensure_permission('schedule')
    data = request.get_json(silent=True) or {}
    try:
        enabled = data.get('enabled')
        if enabled is not None:
            enabled = bool(enabled)
        send_time = data.get('send_time')
        briefing_format = data.get('briefing_format')
        weekly_enabled = data.get('weekly_enabled')
        if weekly_enabled is not None:
            weekly_enabled = bool(weekly_enabled)
        weekly_mon_time = data.get('weekly_mon_time')
        weekly_fri_time = data.get('weekly_fri_time')
        config = schedule_service.update_briefing_config_api(
            enabled=enabled, send_time=send_time, briefing_format=briefing_format,
            weekly_enabled=weekly_enabled, weekly_mon_time=weekly_mon_time, weekly_fri_time=weekly_fri_time)
        return jsonify({'success': True, 'message': '日程配置已更新', 'data': config}), 200
    except Exception as exc:
        return jsonify({'success': False, 'message': f'更新失败: {exc}'}), 500


@schedule_bp.post('/briefing/test')
def briefing_test_route():
    ensure_permission('schedule')
    try:
        result = schedule_service.run_briefing_now()
        if result.get('success'):
            return jsonify({'success': True, 'message': '日报已发送，请查看钉钉', 'data': result}), 200
        return jsonify({'success': False, 'message': f'日报发送失败: {result.get("error")}', 'data': result}), 200
    except Exception as exc:
        return jsonify({'success': False, 'message': f'发送失败: {exc}'}), 500


@schedule_bp.post('/weekly/test')
def weekly_test_route():
    ensure_permission('schedule')
    data = request.get_json(silent=True) or {}
    week_offset = int(data.get('week_offset', 0))
    try:
        result = schedule_service.run_weekly_briefing_now(week_offset=week_offset)
        if result.get('success'):
            label = result.get('week', '本周')
            return jsonify({'success': True, 'message': f'{label}周报已发送，请查看钉钉', 'data': result}), 200
        return jsonify({'success': False, 'message': f'周报发送失败: {result.get("error")}', 'data': result}), 200
    except Exception as exc:
        return jsonify({'success': False, 'message': f'发送失败: {exc}'}), 500


@schedule_bp.post('/reminders/<int:reminder_id>/retry')
def reminder_retry_route(reminder_id):
    ensure_permission('schedule')
    try:
        reminder = schedule_service.retry_reminder(reminder_id)
        return jsonify({'success': True, 'message': '已重发', 'data': reminder}), 200
    except LookupError:
        return jsonify({'success': False, 'message': '提醒任务不存在'}), 404
    except Exception as exc:
        return jsonify({'success': False, 'message': f'重发失败: {exc}'}), 500


@schedule_bp.get('/dingtalk/status')
def dingtalk_status_route():
    ensure_permission('schedule')
    try:
        return jsonify({'success': True, 'data': schedule_service.dingtalk_status()}), 200
    except Exception as exc:
        return jsonify({'success': False, 'message': f'查询失败: {exc}'}), 500


@schedule_bp.post('/dingtalk/test')
def dingtalk_test_route():
    ensure_permission('schedule')
    try:
        result = schedule_service.dingtalk_test()
        return jsonify({'success': True, 'message': '测试消息已发送', 'data': result}), 200
    except Exception as exc:
        return jsonify({'success': False, 'message': f'测试失败: {exc}'}), 500


@schedule_bp.get('/logs')
def logs_route():
    ensure_permission('schedule')
    try:
        limit = request.args.get('limit', 50, type=int)
        data = schedule_service.list_logs(limit=limit or 50)
        return jsonify({'success': True, 'data': data}), 200
    except Exception as exc:
        return jsonify({'success': False, 'message': f'查询失败: {exc}'}), 500


@schedule_bp.get('/weekly.html')
def weekly_html_route():
    """本周行程表静态页面（无需登录，供钉钉消息链接打开）。"""
    try:
        week = request.args.get('week', '').strip()
        html = schedule_service.build_weekly_html(week or None)
        return Response(html, mimetype='text/html; charset=utf-8')
    except Exception as exc:
        return Response(f'<p style="color:#c00;font-family:sans-serif;padding:24px">生成失败: {exc}</p>',
                        mimetype='text/html; charset=utf-8')


@schedule_bp.get('/week/<path:fname>')
def weekly_named_html_route(fname):
    """带日期范围文件名的本周行程表页面，如 /api/schedule/week/15日-21日_日程安排.html。"""
    try:
        from urllib.parse import quote
        week = request.args.get('week', '').strip()
        html = schedule_service.build_weekly_html(week or None)
        resp = Response(html, mimetype='text/html; charset=utf-8')
        # 文件名含中文，用 RFC 5987 编码（filename*=UTF-8''...），并给一个 ASCII 兜底
        resp.headers['Content-Disposition'] = (
            f"inline; filename=\"weekly_schedule.html\"; filename*=UTF-8''{quote(fname)}"
        )
        return resp
    except Exception as exc:
        return Response(f'<p style="color:#c00;font-family:sans-serif;padding:24px">生成失败: {exc}</p>',
                        mimetype='text/html; charset=utf-8')
