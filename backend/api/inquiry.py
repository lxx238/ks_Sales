from flask import Blueprint, jsonify, request

from backend.services.auth_service import ensure_permission
from backend.services.inquiry_service import send_inquiry_with_record, run_inquiry_cleanup
from backend.repositories.inquiry_repository import (
    list_inquiry_records,
    get_inquiry_record,
    list_price_cache,
    query_price_cache_batch,
)


inquiry_bp = Blueprint('inquiry', __name__, url_prefix='/api')


@inquiry_bp.post('/send-inquiry')
def send_inquiry_route():
    ensure_permission('quotation')
    extra_attachments = []
    uploaded_files = request.files.getlist('attachments')
    for f in uploaded_files:
        if f and f.filename:
            extra_attachments.append({
                'filename': f.filename,
                'data': f.read(),
            })

    data_json = request.form.get('data')
    if data_json:
        import json
        data = json.loads(data_json)
    else:
        data = request.get_json(silent=True) or {}

    payload, status = send_inquiry_with_record(data, extra_attachments=extra_attachments if extra_attachments else None)
    return jsonify(payload), status


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


@inquiry_bp.get('/inquiry-price-cache')
def list_price_cache_route():
    ensure_permission('quotation')
    keyword = request.args.get('keyword', '').strip()
    limit = request.args.get('limit', type=int) or 200
    limit = max(1, min(limit, 5000))
    items = list_price_cache(keyword=keyword if keyword else None, limit=limit)
    return jsonify({'success': True, 'items': items, 'total': len(items)})


@inquiry_bp.post('/inquiry-price-cache/check')
def check_price_cache_route():
    ensure_permission('quotation')
    data = request.get_json(silent=True) or {}
    items = data.get('items') or []
    if not items:
        return jsonify({'success': True, 'results': {}})
    results = query_price_cache_batch(items)
    return jsonify({'success': True, 'results': results})


@inquiry_bp.post('/inquiry-scan-now')
def scan_email_now_route():
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
        message = f'扫描完成：处理 {scanned} 封邮件，解析 {parsed} 封，转发 {forwarded} 封'
        if repaired > 0:
            message += f'，补回 {repaired} 条缺失的询图发送记录'
        if result.get('error'):
            message += f'（错误: {result["error"]}）'
        return jsonify({
            'success': True,
            'scanned': scanned,
            'parsed': parsed,
            'forwarded': forwarded,
            'repaired': repaired,
            'message': message,
        })
    except Exception as exc:
        return jsonify({'success': False, 'message': f'扫描失败: {exc}'}), 500
