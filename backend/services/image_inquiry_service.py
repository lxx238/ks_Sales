from backend.services.email_service import send_image_inquiry_email
from backend.repositories.image_inquiry_repository import (
    insert_image_inquiry_record,
    cleanup_expired_image_inquiry_records,
    upsert_pending_items,
    get_all_pending_codes,
    batch_link_items_to_record,
    delete_pending_item,
    list_pending_items,
    count_items_by_status,
    get_pending_item_by_code,
    ensure_image_inquiry_items_schema,
)


GROUP_DESIGNER_MAP = {
    '韩语组': 'crq@xmkseng.com',
    '日语组': 'hlan@xmkseng.com',
    '英语组': 'RoyQuan@xmkseng.com',
}

GROUP_CC_MAP = {
    '英语组': ['yusheng@xmkseng.com'],
}


def save_image_inquiry_items(data):
    if not data:
        return {'success': False, 'message': '请求体不能为空'}, 400

    codes = data.get('codes') or []
    items = data.get('items') or []
    project_name = data.get('project_name', '')
    source_group = data.get('source_group', '')
    designer_email = data.get('designer_email', '') or GROUP_DESIGNER_MAP.get(source_group, '')

    if not codes and not items:
        return {'success': False, 'message': '缺失图片编码列表为空'}, 400

    if not items:
        items = [{'code': c, 'name': ''} for c in codes]
    else:
        for item in items:
            if not item.get('code'):
                item['code'] = item.get('material_code', '')

    ensure_image_inquiry_items_schema()

    try:
        result = upsert_pending_items(
            items, project_name=project_name,
            source_group=source_group, designer_email=designer_email,
        )
    except Exception as exc:
        print(f'[IMAGE-INQUIRY] Save items failed: {exc}')
        import traceback
        traceback.print_exc()
        return {'success': False, 'message': f'存入失败: {exc}'}, 500

    total = result['inserted'] + result['updated'] + result['skipped']
    msg_parts = []
    if result['inserted']:
        msg_parts.append(f'新增 {result["inserted"]} 个')
    if result['updated']:
        msg_parts.append(f'更新 {result["updated"]} 个')
    if result['skipped']:
        msg_parts.append(f'已有图片跳过 {result["skipped"]} 个')
    message = '，'.join(msg_parts) if msg_parts else '无变化'
    message += '（周一统一发送询图邮件）'

    return {
        'success': True,
        'message': message,
        **result,
    }, 200


def send_weekly_image_inquiry(source_group='', designer_email='', sender_name=''):
    ensure_image_inquiry_items_schema()

    if not designer_email:
        designer_email = GROUP_DESIGNER_MAP.get(source_group, '')

    cc_emails = GROUP_CC_MAP.get(source_group, [])

    pending_codes = get_all_pending_codes(source_group=source_group)
    if not pending_codes:
        return {'success': False, 'message': f'{source_group or "全部"}没有待发送的询图编码'}, 400

    codes = [item['material_code'] for item in pending_codes]
    items = [
        {'code': item['material_code'], 'name': item.get('material_name', '')}
        for item in pending_codes
    ]
    project_names = set()
    for item in pending_codes:
        for pn in (item.get('project_names') or '').split(', '):
            if pn.strip():
                project_names.add(pn.strip())
    project_name = ', '.join(sorted(project_names)) if project_names else '汇总'

    try:
        send_image_inquiry_email(
            codes=codes,
            project_name=project_name,
            sender_name=sender_name,
            designer_email=designer_email,
            items=items,
            cc_emails=cc_emails,
        )
    except RuntimeError as exc:
        return {'success': False, 'message': str(exc)}, 500
    except Exception as exc:
        print(f'[IMAGE-INQUIRY] Weekly email send failed: {exc}')
        import traceback
        traceback.print_exc()
        return {'success': False, 'message': '邮件发送失败，请检查邮箱配置'}, 500

    from datetime import datetime
    date_str = datetime.now().strftime('%Y-%m-%d %H:%M')
    email_subject = f'[询图] {project_name} - 缺失图片编码列表 ({date_str})'

    record_id = None
    try:
        record_id = insert_image_inquiry_record(
            project_name=project_name,
            sender_name=sender_name,
            designer_email=designer_email,
            code_count=len(codes),
            codes=codes,
            email_subject=email_subject,
            remark='weekly_batch',
            source_group=source_group,
        )
        print(f'[IMAGE-INQUIRY] Weekly batch record saved: id={record_id}, codes={len(codes)}')
    except Exception as exc:
        print(f'[IMAGE-INQUIRY] Weekly batch record save failed (email was sent): {exc}')

    if record_id:
        try:
            batch_link_items_to_record(record_id, codes, source_group=source_group)
        except Exception as exc:
            print(f'[IMAGE-INQUIRY] Batch link items failed: {exc}')
    else:
        try:
            from datetime import datetime as _dt
            _now_str = _dt.now().strftime('%Y-%m-%d %H:%M:%S')
            from backend.repositories.image_inquiry_repository import _get_conn
            _conn = _get_conn()
            try:
                _conn.execute(
                    f"UPDATE ks_image_inquiry_items SET status = 'sent', last_sent_at = ?, updated_at = ? "
                    f"WHERE material_code IN ({','.join(['?'] * len(codes))}) AND source_group = ?",
                    [_now_str, _now_str] + codes + [source_group],
                )
                _conn.commit()
            finally:
                _conn.close()
        except Exception as exc:
            print(f'[IMAGE-INQUIRY] Fallback item status update failed: {exc}')

    return {
        'success': True,
        'message': f'询图邮件已发送，共 {len(codes)} 个编码',
        'record_id': record_id,
        'code_count': len(codes),
    }, 200


def send_image_inquiry_with_record(data):
    if not data:
        return {'success': False, 'message': '请求体不能为空'}, 400

    codes = data.get('codes') or []
    items = data.get('items') or []
    project_name = data.get('project_name', '')
    sender_name = data.get('sender_name', '')
    designer_email = data.get('designer_email', '')
    remark = data.get('remark', '')

    if not codes and not items:
        return {'success': False, 'message': '缺失图片编码列表为空'}, 400

    if not designer_email:
        return {'success': False, 'message': '询图邮件必须指定组长邮箱，不能为空'}, 400

    if not codes:
        codes = [item.get('code', '') for item in items]

    try:
        send_image_inquiry_email(
            codes=codes,
            project_name=project_name,
            sender_name=sender_name,
            designer_email=designer_email,
            remark=remark,
            items=items,
        )
    except RuntimeError as exc:
        return {'success': False, 'message': str(exc)}, 500
    except Exception as exc:
        print(f'[IMAGE-INQUIRY] Email send failed: {exc}')
        import traceback
        traceback.print_exc()
        return {'success': False, 'message': '邮件发送失败，请检查邮箱配置'}, 500

    if project_name:
        email_subject = f'[询图] {project_name} - 缺失图片编码列表'
    else:
        email_subject = f'[询图] 缺失图片编码列表'

    record_id = None
    try:
        record_id = insert_image_inquiry_record(
            project_name=project_name,
            sender_name=sender_name,
            designer_email=designer_email,
            code_count=len(codes),
            codes=codes,
            email_subject=email_subject,
            remark=remark,
        )
        print(f'[IMAGE-INQUIRY] Record saved: id={record_id}, codes={len(codes)}')
    except Exception as exc:
        print(f'[IMAGE-INQUIRY] Record save failed (email was sent): {exc}')

    return {
        'success': True,
        'message': f'询图邮件已发送，共 {len(codes)} 个编码',
        'record_id': record_id,
        'code_count': len(codes),
    }, 200


def run_image_inquiry_cleanup():
    deleted = cleanup_expired_image_inquiry_records()
    return {
        'success': True,
        'deleted_count': deleted,
        'message': f'已清理 {deleted} 条过期询图记录',
    }
