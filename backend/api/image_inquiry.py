from flask import Blueprint, jsonify, request

from backend.services.auth_service import ensure_permission
from backend.services.image_inquiry_service import (
    send_image_inquiry_with_record,
    save_image_inquiry_items,
    send_weekly_image_inquiry,
    run_image_inquiry_cleanup,
)
from backend.repositories.image_inquiry_repository import (
    list_image_inquiry_records,
    get_image_inquiry_record,
    count_image_inquiry_records_by_status,
    list_pending_items,
    get_pending_item_by_code,
    delete_pending_item,
    count_items_by_status,
    ensure_image_inquiry_items_schema,
)
from backend.repositories.material_repository import fetch_material_rows
from backend.utils.constants import (
    DB_CODE_COLUMN,
    DB_NAME_COLUMN,
    DB_NAME_KO_COLUMN,
    DB_NAME_EN_COLUMN,
    DB_NAME_JA_COLUMN,
    DB_IMAGE_BASE64_COLUMN,
)


image_inquiry_bp = Blueprint('image_inquiry', __name__, url_prefix='/api')


@image_inquiry_bp.post('/save-image-inquiry-items')
def save_image_inquiry_items_route():
    ensure_permission('quotation')
    payload, status = save_image_inquiry_items(request.get_json(silent=True))
    return jsonify(payload), status


@image_inquiry_bp.get('/pending-image-items')
def list_pending_image_items_route():
    ensure_permission('quotation')
    status = request.args.get('status')
    source_group = request.args.get('source_group')
    page = request.args.get('page', type=int) or 1
    page_size = request.args.get('page_size', type=int) or 500
    result = list_pending_items(status=status, page=page, page_size=page_size, source_group=source_group)
    return jsonify({'success': True, **result})


@image_inquiry_bp.get('/pending-image-items/<path:code>')
def get_pending_image_item_route(code):
    ensure_permission('quotation')
    source_group = request.args.get('source_group')
    item = get_pending_item_by_code(code, source_group=source_group)
    if not item:
        return jsonify({'success': False, 'message': '编码不存在'}), 404
    return jsonify({'success': True, 'item': item})


@image_inquiry_bp.delete('/pending-image-items/<path:code>')
def delete_pending_image_item_route(code):
    ensure_permission('quotation')
    source_group = request.args.get('source_group')
    deleted = delete_pending_item(code, source_group=source_group)
    if not deleted:
        return jsonify({'success': False, 'message': '编码不存在或状态不是 pending'}), 404
    return jsonify({'success': True, 'message': f'已删除编码 {code}'})


@image_inquiry_bp.get('/image-inquiry-items-stats')
def image_inquiry_items_stats_route():
    ensure_permission('quotation')
    source_group = request.args.get('source_group')
    stats = count_items_by_status(source_group=source_group)
    return jsonify({'success': True, **stats})


@image_inquiry_bp.post('/send-weekly-image-inquiry')
def send_weekly_image_inquiry_route():
    ensure_permission('quotation')
    data = request.get_json(silent=True) or {}
    source_group = data.get('source_group', '')
    designer_email = data.get('designer_email', '')
    sender_name = data.get('sender_name', '')
    payload, status = send_weekly_image_inquiry(
        source_group=source_group,
        designer_email=designer_email,
        sender_name=sender_name,
    )
    return jsonify(payload), status


@image_inquiry_bp.post('/send-image-inquiry')
def send_image_inquiry_route():
    ensure_permission('quotation')
    payload, status = send_image_inquiry_with_record(request.get_json(silent=True))
    return jsonify(payload), status


@image_inquiry_bp.get('/image-inquiry-records')
def list_image_inquiry_records_route():
    ensure_permission('quotation')
    status_filter = request.args.get('status')
    page = request.args.get('page', type=int) or 1
    page_size = request.args.get('page_size', type=int) or 20
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    result = list_image_inquiry_records(
        status=status_filter,
        page=page,
        page_size=page_size,
    )
    return jsonify({'success': True, **result})


@image_inquiry_bp.get('/image-inquiry-records/<int:record_id>')
def get_image_inquiry_record_route(record_id):
    ensure_permission('quotation')
    record = get_image_inquiry_record(record_id)
    if not record:
        return jsonify({'success': False, 'message': '记录不存在'}), 404
    return jsonify({'success': True, 'record': record})


@image_inquiry_bp.get('/image-inquiry-stats')
def image_inquiry_stats_route():
    ensure_permission('quotation')
    stats = count_image_inquiry_records_by_status()
    return jsonify({'success': True, **stats})


@image_inquiry_bp.post('/image-inquiry-cleanup')
def image_inquiry_cleanup_route():
    ensure_permission('quotation')
    result = run_image_inquiry_cleanup()
    return jsonify(result)


@image_inquiry_bp.post('/image-inquiry-records/<int:record_id>/reparse')
def reparse_image_inquiry_record_route(record_id):
    ensure_permission('quotation')
    from backend.repositories.image_inquiry_repository import get_image_inquiry_record, update_image_inquiry_status, update_item_by_code
    from backend.services.email_reply_watcher import _extract_code_from_filename, _match_images_to_codes
    import json

    record = get_image_inquiry_record(record_id)
    if not record:
        return jsonify({'success': False, 'message': '记录不存在'}), 404

    codes = record.get('codes') or []
    images_json = record.get('images_json') or '[]'
    try:
        images = json.loads(images_json) if images_json else []
    except:
        images = []

    code_image_map = _match_images_to_codes(images, codes)
    updated = 0
    for code, data_url in code_image_map.items():
        try:
            update_item_by_code(code, status='db_updated', image_base64=data_url)
            updated += 1
        except Exception:
            pass

    if updated > 0:
        update_image_inquiry_status(record_id, status='db_updated', images_updated=updated)
        message = f'重新解析完成，匹配并更新了 {updated} 个图片'
    else:
        message = '未找到可匹配的图片'

    return jsonify({'success': True, 'message': message, 'updated': updated})


@image_inquiry_bp.get('/lookup-material-name')
def lookup_material_name_route():
    ensure_permission('quotation')
    code = (request.args.get('code') or '').strip()
    if not code:
        return jsonify({'success': False, 'message': '缺少编码参数'}), 400
    rows = fetch_material_rows([code], include_images=False)
    if not rows:
        return jsonify({'success': False, 'message': '编码未找到', 'name': '', 'name_ko': '', 'name_en': '', 'name_ja': ''})
    row = rows[0]
    has_image = bool(row.get(DB_IMAGE_BASE64_COLUMN))
    return jsonify({
        'success': True,
        'code': row.get(DB_CODE_COLUMN, ''),
        'name': row.get(DB_NAME_COLUMN, ''),
        'name_ko': row.get(DB_NAME_KO_COLUMN, ''),
        'name_en': row.get(DB_NAME_EN_COLUMN, ''),
        'name_ja': row.get(DB_NAME_JA_COLUMN, ''),
        'has_image': has_image,
    })
