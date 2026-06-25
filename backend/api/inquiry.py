import json

from flask import Blueprint, jsonify, request, send_file

from backend.services.auth_service import (
    ensure_permission,
    ensure_group,
    ensure_admin_account,
    get_current_account,
)
from backend.services.inquiry_service import (
    submit_inquiry_items,
    import_inquiry_excel,
    add_inquiry_item_manual,
    save_inquiry_item_price,
    save_case_ton_prices,
    update_inquiry_item_fields,
    remove_inquiry_item,
    remove_inquiry_case,
    run_inquiry_cleanup,
    test_inquiry_notification,
    send_pending_inquiry_reminder,
    enrich_inquiry_items,
    get_case_ton_settings,
    save_inquiry_attachments,
    get_inquiry_attachment_path,
    update_case_remark,
    get_ton_history,
    build_case_price_workbook,
    build_ton_history_workbook,
)
from backend.repositories.inquiry_repository import (
    list_inquiry_records,
    get_inquiry_record,
    list_price_cache,
    query_price_cache_batch,
    list_inquiry_items,
    list_inquiry_projects,
    list_inquiry_businesses,
    get_inquiry_item,
    count_inquiry_items_by_status,
    list_case_locks,
    list_case_metas,
    list_attachments_batch,
    list_attachments,
    delete_attachment as repo_delete_attachment,
)


inquiry_bp = Blueprint('inquiry', __name__, url_prefix='/api')


def _ensure_inquiry_view():
    """查看询价填价：admin / 设计组 / 拥有 quotation 权限者均可。"""
    account = get_current_account()
    if account.get('role') == 'admin':
        return account
    if account.get('group') == '设计组':
        return account
    perms = account.get('permissions') or []
    if 'quotation' in perms:
        return account
    raise PermissionError('没有该功能的访问权限')


def _current_role():
    try:
        return str((get_current_account(optional=True) or {}).get('role') or '').strip()
    except Exception:
        return ''


def _current_group_is_design():
    try:
        account = get_current_account(optional=True) or {}
        return account.get('role') == 'admin' or account.get('group') == '设计组'
    except Exception:
        return False


@inquiry_bp.post('/send-inquiry')
def send_inquiry_route():
    """提交未匹配物料为询价项（网页填价，不再发送邮件）。"""
    ensure_permission('quotation')

    uploaded_files = request.files.getlist('attachments')
    data_json = request.form.get('data')
    if data_json:
        data = json.loads(data_json)
    else:
        data = request.get_json(silent=True) or {}

    payload, status = submit_inquiry_items(data)

    # 保存附件（#7）：存到本地服务器文件夹，供 admin 填价时下载参考
    project_name = str((data or {}).get('project_name') or '').strip()
    if project_name and uploaded_files:
        try:
            saved, errors = save_inquiry_attachments(
                project_name, uploaded_files,
                (get_current_account(optional=True) or {}).get('name') or '',
            )
            if errors:
                print(f'[INQUIRY-ITEMS] attachment errors: {errors}')
        except Exception as exc:
            print(f'[INQUIRY-ITEMS] save attachments failed: {exc}')

    return jsonify(payload), status


@inquiry_bp.post('/inquiry-items/import-excel')
def import_inquiry_excel_route():
    """手动导入标准询价表 Excel（与 create_inquiry_sheet 输出格式一致），
    解析后写入询价项并发送钉钉提醒。"""
    ensure_permission('quotation')

    file = request.files.get('file')
    if not file or not file.filename:
        return jsonify({'success': False, 'message': '请上传 Excel 文件'}), 400

    if not file.filename.lower().endswith(('.xlsx', '.xls')):
        return jsonify({'success': False, 'message': '仅支持 .xlsx / .xls 格式'}), 400

    project_name = (request.form.get('project_name') or '').strip()

    import os
    import tempfile
    suffix = os.path.splitext(file.filename)[1]
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    try:
        os.close(fd)
        file.save(tmp_path)
        payload, status = import_inquiry_excel(tmp_path, file.filename, project_name)
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass

    return jsonify(payload), status


# ====================================================================
# 询价项（网页填价工作表）
# ====================================================================

@inquiry_bp.get('/inquiry-items')
def list_inquiry_items_route():
    _ensure_inquiry_view()
    status = request.args.get('status', '').strip() or None
    project = request.args.get('project', '').strip() or None
    business = request.args.get('business', '').strip() or None
    keyword = request.args.get('keyword', '').strip() or None
    page = request.args.get('page', type=int) or 1
    page_size = request.args.get('page_size', type=int) or 50
    page = max(1, page)
    page_size = max(1, min(page_size, 500))
    result = list_inquiry_items(
        status=status, keyword=keyword, project=project, business=business,
        page=page, page_size=page_size,
    )
    result['items'] = enrich_inquiry_items(result.get('items') or [])
    result['projects'] = list_inquiry_projects()
    result['businesses'] = list_inquiry_businesses()

    # 案件级：锁定状态 / 备注 / 附件（供前端按案件渲染）
    projects = {str(it.get('project_name') or '') for it in (result.get('items') or [])}
    try:
        result['case_locks'] = list_case_locks(list(projects))
    except Exception:
        result['case_locks'] = {}
    try:
        result['case_metas'] = list_case_metas(list(projects))
    except Exception:
        result['case_metas'] = {}
    try:
        result['attachments'] = list_attachments_batch(list(projects))
    except Exception:
        result['attachments'] = {}
    result['can_edit_price'] = _current_role() in ('admin',) or _current_group_is_design()
    result['is_admin'] = _current_role() == 'admin'
    return jsonify({'success': True, **result})


@inquiry_bp.get('/inquiry-items/stats')
def inquiry_items_stats_route():
    _ensure_inquiry_view()
    counts = count_inquiry_items_by_status()
    projects = list_inquiry_projects()
    return jsonify({'success': True, 'counts': counts, 'project_count': len(projects)})


@inquiry_bp.get('/inquiry-items/<int:item_id>')
def get_inquiry_item_route(item_id):
    _ensure_inquiry_view()
    item = get_inquiry_item(item_id)
    if not item:
        return jsonify({'success': False, 'message': '询价项不存在'}), 404
    return jsonify({'success': True, 'item': item})


@inquiry_bp.post('/inquiry-items')
def add_inquiry_item_route():
    _ensure_inquiry_view()
    data = request.get_json(silent=True) or {}
    payload, status = add_inquiry_item_manual(data)
    return jsonify(payload), status


@inquiry_bp.put('/inquiry-items/<int:item_id>/price')
def save_inquiry_item_price_route(item_id):
    # 填写价格：仅 admin / 设计组
    ensure_group('设计组')
    data = request.get_json(silent=True) or {}
    payload, status = save_inquiry_item_price(item_id, data)
    return jsonify(payload), status


@inquiry_bp.post('/inquiry-items/case-price')
def save_case_ton_prices_route():
    """按案件批量保存吨价（自动换算每项单价并同步价格库）。"""
    # 填写吨价：仅 admin / 设计组
    ensure_group('设计组')
    data = request.get_json(silent=True) or {}
    payload, status = save_case_ton_prices(data)
    return jsonify(payload), status


@inquiry_bp.post('/inquiry-items/ton-settings')
def case_ton_settings_route():
    """读取各组对应的内部吨价 + 当前汇率/点数（来自 temp_price_settings）。"""
    # 仅 admin / 设计组 可见吨价设置
    ensure_group('设计组')
    data = request.get_json(silent=True) or {}
    groups = data.get('groups') or []
    pack = data.get('pack')
    return jsonify({'success': True, **get_case_ton_settings(groups, pack)})


@inquiry_bp.put('/inquiry-items/<int:item_id>')
def update_inquiry_item_route(item_id):
    _ensure_inquiry_view()
    data = request.get_json(silent=True) or {}
    payload, status = update_inquiry_item_fields(item_id, data)
    return jsonify(payload), status


@inquiry_bp.delete('/inquiry-items/<int:item_id>')
def delete_inquiry_item_route(item_id):
    # 删除：仅 admin（#5）
    ensure_admin_account()
    payload, status = remove_inquiry_item(item_id)
    return jsonify(payload), status


@inquiry_bp.delete('/inquiry-items/case')
def delete_inquiry_case_route():
    """删除整个案件（询价项 + 备注 + 附件）。仅 admin。"""
    ensure_admin_account()
    project = (request.args.get('project') or '').strip()
    payload, status = remove_inquiry_case(project)
    return jsonify(payload), status


# ====================================================================
# 案件金额锁定状态 / 下载 / 吨价历史 / 案件备注 / 附件（#1 #2 #3 #7）
# ====================================================================

@inquiry_bp.get('/inquiry-items/case-lock')
def case_lock_route():
    """查询某案件是否处于金额锁定状态。"""
    _ensure_inquiry_view()
    project = request.args.get('project', '').strip()
    from backend.services.inquiry_service import _is_case_locked
    locked, lock, minutes_left = _is_case_locked(project)
    return jsonify({
        'success': True,
        'project': project,
        'locked': bool(locked),
        'last_priced_at': (lock or {}).get('last_priced_at') or '',
        'priced_by': (lock or {}).get('priced_by') or '',
        'minutes_left': minutes_left,
    })


@inquiry_bp.get('/inquiry-items/case-price/export')
def export_case_price_route():
    """下载某案件的吨价 + 生成价格 Excel（#2）。"""
    _ensure_inquiry_view()
    import re
    project = request.args.get('project', '').strip()
    if not project:
        return jsonify({'success': False, 'message': '缺少项目名称'}), 400
    wb = build_case_price_workbook(project)
    import io
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    safe = re.sub(r'[\\/:*?"<>|]', '_', project or '案件')[:30]
    fname = f'【吨价与价格】{safe}.xlsx'
    return send_file(
        buf,
        as_attachment=True,
        download_name=fname,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )


@inquiry_bp.get('/inquiry-items/ton-price-history')
def ton_price_history_route():
    """吨价历史回溯（#3）。"""
    _ensure_inquiry_view()
    project = request.args.get('project', '').strip() or None
    page = request.args.get('page', type=int) or 1
    page_size = request.args.get('page_size', type=int) or 50
    result = get_ton_history(project=project, page=page, page_size=page_size)
    return jsonify({'success': True, **result})


@inquiry_bp.get('/inquiry-items/ton-price-history/export')
def export_ton_price_history_route():
    """导出吨价历史 Excel（#3 回溯下载）。"""
    _ensure_inquiry_view()
    project = request.args.get('project', '').strip() or None
    result = get_ton_history(project=project, page=1, page_size=2000)
    wb = build_ton_history_workbook(result.get('items') or [])
    import io
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f'【吨价历史】{project or "全部"}.xlsx'
    return send_file(
        buf,
        as_attachment=True,
        download_name=fname,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )


@inquiry_bp.get('/inquiry-items/case-meta')
def case_meta_route():
    """查询某案件的备注 + 附件列表（#7）。"""
    _ensure_inquiry_view()
    project = request.args.get('project', '').strip()
    from backend.repositories.inquiry_repository import get_case_meta
    meta = get_case_meta(project) or {}
    return jsonify({
        'success': True,
        'project': project,
        'remark': meta.get('remark') or '',
        'attachments': list_attachments(project),
    })


@inquiry_bp.post('/inquiry-items/case-meta')
def update_case_meta_route():
    """更新案件备注（admin / 设计组）。支持 remark(业务备注) 和 pricer_remark(报价人员备注)。"""
    ensure_group('设计组')
    data = request.get_json(silent=True) or {}
    project = str(data.get('project_name') or '').strip()
    if not project:
        return jsonify({'success': False, 'message': '缺少项目名称'}), 400
    remark = data.get('remark')
    pricer_remark = data.get('pricer_remark')
    payload = update_case_remark(project, remark=remark, pricer_remark=pricer_remark)
    return jsonify(payload), 200


@inquiry_bp.post('/inquiry-items/attachments')
def upload_case_attachments_route():
    """为案件补充上传附件（admin / 设计组）。"""
    ensure_group('设计组')
    project = str(request.form.get('project_name') or '').strip()
    if not project:
        return jsonify({'success': False, 'message': '缺少项目名称'}), 400
    files = request.files.getlist('attachments')
    saved, errors = save_inquiry_attachments(
        project, files,
        (get_current_account(optional=True) or {}).get('name') or '',
    )
    return jsonify({
        'success': True,
        'saved': saved,
        'errors': errors,
        'attachments': list_attachments(project),
        'message': f'已上传 {saved} 个附件' + ('；' + '；'.join(errors) if errors else ''),
    })


@inquiry_bp.get('/inquiry-items/attachments/<int:attachment_id>/download')
def download_case_attachment_route(attachment_id):
    """下载案件附件（#7）。"""
    _ensure_inquiry_view()
    info = get_inquiry_attachment_path(attachment_id)
    if not info:
        return jsonify({'success': False, 'message': '附件不存在'}), 404
    return send_file(
        info['path'],
        as_attachment=True,
        download_name=info.get('original_name') or 'attachment',
    )


@inquiry_bp.delete('/inquiry-items/attachments/<int:attachment_id>')
def delete_case_attachment_route(attachment_id):
    """删除案件附件（admin）。"""
    ensure_admin_account()
    ok = repo_delete_attachment(attachment_id)
    return jsonify({'success': ok, 'message': '已删除' if ok else '附件不存在'}), 200 if ok else 404


# ====================================================================
# 以下接口保留：询价邮件记录（历史）/ 价格缓存 / 邮件扫描（供询图使用）
# ====================================================================

@inquiry_bp.get('/inquiry-records')
def list_inquiry_records_route():
    ensure_permission('quotation')
    status_filter = request.args.get('status')
    direction = request.args.get('direction')
    page = request.args.get('page', type=int) or 1
    page_size = request.args.get('page_size', type=int) or 20
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    result = list_inquiry_records(
        status=status_filter,
        direction=direction,
        page=page,
        page_size=page_size,
    )
    return jsonify({'success': True, **result})


@inquiry_bp.get('/inquiry-records/<int:record_id>')
def get_inquiry_record_route(record_id):
    ensure_permission('quotation')
    record = get_inquiry_record(record_id)
    if not record:
        return jsonify({'success': False, 'message': '记录不存在'}), 404
    return jsonify({'success': True, 'record': record})


@inquiry_bp.get('/inquiry-records/<int:record_id>/reply')
def get_inquiry_reply_route(record_id):
    ensure_permission('quotation')
    record = get_inquiry_record(record_id)
    if not record:
        return jsonify({'success': False, 'message': '记录不存在'}), 404
    import json
    reply_json = record.get('reply_json', '')
    try:
        parsed = json.loads(reply_json) if reply_json else []
    except (json.JSONDecodeError, TypeError):
        parsed = []
    return jsonify({
        'success': True,
        'record_id': record_id,
        'status': record.get('status', ''),
        'reply_json': parsed,
        'reply_received_at': record.get('reply_received_at', ''),
        'forwarded_to': record.get('forwarded_to', ''),
    })


@inquiry_bp.post('/inquiry-cleanup')
def inquiry_cleanup_route():
    ensure_permission('quotation')
    result = run_inquiry_cleanup()
    return jsonify(result)


@inquiry_bp.post('/inquiry-notify/test')
def inquiry_notify_test_route():
    """测试询价提醒机器人连通性。"""
    ensure_permission('quotation')
    result = test_inquiry_notification()
    if result.get('sent'):
        return jsonify({'success': True, 'message': '测试消息已发送'})
    reason = result.get('reason', '未知原因')
    if reason == '未配置':
        return jsonify({'success': False, 'message': '询价提醒机器人未配置（请在 .env.local 中填写 KS_INQUIRY_DT_* 参数）'}), 400
    return jsonify({'success': False, 'message': f'发送失败: {reason}'}), 500


@inquiry_bp.post('/inquiry-notify/reminder')
def inquiry_notify_reminder_route():
    """手动触发待填价提醒。"""
    ensure_permission('quotation')
    result = send_pending_inquiry_reminder()
    if result.get('sent'):
        return jsonify({'success': True, 'message': '提醒已发送'})
    reason = result.get('reason', '未知原因')
    if reason == '无待填价项':
        return jsonify({'success': True, 'message': '当前无待填价项，无需提醒'})
    if reason == '未配置':
        return jsonify({'success': False, 'message': '询价提醒机器人未配置'}), 400
    return jsonify({'success': False, 'message': f'发送失败: {reason}'}), 500


@inquiry_bp.get('/inquiry-price-cache')
def list_price_cache_route():
    _ensure_inquiry_view()
    keyword = request.args.get('keyword', '').strip()
    limit = request.args.get('limit', type=int) or 200
    limit = max(1, min(limit, 5000))
    items = list_price_cache(keyword=keyword if keyword else None, limit=limit)
    return jsonify({'success': True, 'items': items, 'total': len(items)})


@inquiry_bp.post('/inquiry-price-cache/check')
def check_price_cache_route():
    _ensure_inquiry_view()
    data = request.get_json(silent=True) or {}
    items = data.get('items') or []
    if not items:
        return jsonify({'success': True, 'results': {}})
    results = query_price_cache_batch(items)
    return jsonify({'success': True, 'results': results})


@inquiry_bp.post('/inquiry-scan-now')
def scan_email_now_route():
    """立即扫描邮箱（供询图功能使用；询价邮件已不再处理）。"""
    ensure_permission('quotation')
    from backend.services.email_reply_watcher import check_email_replies
    from backend.repositories.image_inquiry_repository import repair_image_inquiry_records
    try:
        repaired = repair_image_inquiry_records()
        body = request.get_json(silent=True) or {}
        include_seen = body.get('include_seen', False)
        result = check_email_replies(include_seen=include_seen)
        scanned = result.get('scanned', 0)
        parsed = result.get('parsed', 0)
        forwarded = result.get('forwarded', 0)
        image_parsed = result.get('image_parsed', 0)
        message = f'扫描完成：处理 {scanned} 封邮件，询图解析 {image_parsed} 封'
        if repaired > 0:
            message += f'，补回 {repaired} 条缺失的询图发送记录'
        if result.get('error'):
            message += f'（错误: {result["error"]}）'
        return jsonify({
            'success': True,
            'scanned': scanned,
            'parsed': parsed,
            'forwarded': forwarded,
            'image_parsed': image_parsed,
            'repaired': repaired,
            'message': message,
        })
    except Exception as exc:
        return jsonify({'success': False, 'message': f'扫描失败: {exc}'}), 500
