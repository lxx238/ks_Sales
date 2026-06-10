import os
import json
from datetime import datetime
from pathlib import Path

from backend.config.settings import OUTPUT_FOLDER
from backend.repositories.inquiry_repository import (
    insert_inquiry_record,
    cleanup_expired_records,
)
from backend.services.email_service import send_inquiry_email
from backend.utils.file_utils import find_output_file


def send_inquiry_with_record(data, extra_attachments=None):
    if not data:
        return {'success': False, 'message': '请求体不能为空'}, 400

    inquiry_file_id = data.get('inquiry_file_id')
    project_name = data.get('project_name', '')
    bom_filename = data.get('bom_filename', '')
    inquiry_requester = data.get('inquiry_requester', '')
    unmatched_products = data.get('unmatched_products') or []
    remark = data.get('remark', '')

    try:
        from backend.services.auth_service import get_current_account as _get_acct
        _acct = _get_acct(optional=True)
        if _acct:
            _china_name = str(_acct.get('name') or '').strip()
            if _china_name:
                inquiry_requester = _china_name
    except Exception:
        pass

    if not inquiry_file_id:
        return {'success': False, 'message': '缺少询价表文件ID'}, 400

    inquiry_path = find_output_file(inquiry_file_id)
    if not inquiry_path or not os.path.exists(inquiry_path):
        return {'success': False, 'message': '询价表文件不存在或已过期，请重新生成报表'}, 404

    material_count = len(unmatched_products) if unmatched_products else 0

    now = datetime.now()
    date_str = now.strftime('%Y-%m-%d %H:%M')
    email_subject = f'【inquiry询价】{project_name} - {material_count}项物料待询价 ({date_str})' if project_name else f'【inquiry询价】新询价单 - {material_count}项物料待询价 ({date_str})'

    try:
        send_inquiry_email(
            file_path=inquiry_path,
            project_name=project_name,
            material_count=material_count,
            unmatched_products=unmatched_products,
            sender_name=inquiry_requester,
            bom_filename=bom_filename,
            remark=remark,
            extra_attachments=extra_attachments,
        )
    except RuntimeError as exc:
        return {'success': False, 'message': str(exc)}, 500
    except Exception as exc:
        print(f'[INQUIRY] Email send failed: {exc}')
        import traceback
        traceback.print_exc()
        return {'success': False, 'message': '邮件发送失败，请检查邮箱配置'}, 500

    materials_for_db = []
    for p in unmatched_products[:500]:
        materials_for_db.append({
            'code': p.get('code', ''),
            'name': p.get('name', ''),
            'spec': p.get('spec', ''),
            'quantity': p.get('quantity', 0),
        })

    record_id = None
    try:
        record_id = insert_inquiry_record(
            project_name=project_name,
            bom_filename=bom_filename,
            inquiry_requester=inquiry_requester,
            material_count=material_count,
            materials=materials_for_db,
            email_subject=email_subject,
            remark=remark,
        )
        print(f'[INQUIRY] Record saved: id={record_id}, subject={email_subject}')
    except Exception as exc:
        print(f'[INQUIRY] Record save failed (email was sent): {exc}')
        import traceback
        traceback.print_exc()

    return {
        'success': True,
        'message': f'询价表已发送，共 {material_count} 项物料',
        'record_id': record_id,
        'material_count': material_count,
    }, 200


def run_inquiry_cleanup():
    deleted = cleanup_expired_records()
    return {
        'success': True,
        'deleted_count': deleted,
        'message': f'已清理 {deleted} 条过期询价记录',
    }
