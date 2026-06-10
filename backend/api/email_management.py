import io

import openpyxl
from flask import Blueprint, jsonify, request, send_file

import backend.config.settings as settings_mod
from backend.repositories.inquiry_repository import (
    count_inquiry_records_by_status,
    delete_price_cache_item,
    delete_price_cache_items,
    get_price_cache_stats,
    list_price_cache,
)
from backend.services.auth_service import ensure_permission

email_mgmt_bp = Blueprint('email_mgmt', __name__, url_prefix='/api/email-mgmt')


def _get_current_poll_interval():
    try:
        from backend.app import get_email_scheduler
        scheduler = get_email_scheduler()
        if scheduler:
            job = scheduler.get_job('email_reply_check')
            trigger = getattr(job, 'trigger', None) if job else None
            interval = getattr(trigger, 'interval', None) if trigger else None
            if interval:
                seconds = int(interval.total_seconds())
                if seconds > 0:
                    return max(1, seconds // 60)
    except Exception:
        pass
    return int(getattr(settings_mod, 'INQUIRY_CHECK_INTERVAL_MINUTES', 20))


@email_mgmt_bp.get('/overview')
def get_overview():
    ensure_permission('quotation')
    try:
        record_counts = count_inquiry_records_by_status()
    except Exception:
        record_counts = {'sent': 0, 'parsed': 0, 'parse_failed': 0, 'forwarded': 0, 'total': 0}
    try:
        cache_stats = get_price_cache_stats()
    except Exception:
        cache_stats = {'total': 0, 'carbon_steel': 0, 'other': 0, 'valid': 0, 'expired': 0}
    try:
        from backend.services.email_reply_watcher import get_last_scan_time
        last_scan = get_last_scan_time()
    except Exception:
        last_scan = None
    try:
        from backend.app import get_email_scheduler
        scheduler = get_email_scheduler()
        scheduler_running = bool(scheduler and scheduler.running)
    except Exception:
        scheduler_running = False
    return jsonify({
        'success': True,
        'records': record_counts,
        'cache': cache_stats,
        'poll_interval': _get_current_poll_interval(),
        'last_scan_time': last_scan,
        'scheduler_running': scheduler_running,
    })


@email_mgmt_bp.get('/poll-interval')
def get_poll_interval():
    ensure_permission('quotation')
    return jsonify({
        'success': True,
        'interval': _get_current_poll_interval(),
    })


@email_mgmt_bp.post('/poll-interval')
def set_poll_interval():
    ensure_permission('quotation')
    data = request.get_json(silent=True) or {}
    minutes = data.get('minutes')
    if minutes is None:
        return jsonify({'success': False, 'message': '缺少 minutes 参数'}), 400
    try:
        minutes = int(minutes)
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': 'minutes 必须是整数'}), 400
    if minutes < 1 or minutes > 120:
        return jsonify({'success': False, 'message': '轮询间隔必须在 1-120 分钟之间'}), 400

    try:
        from backend.app import get_email_scheduler, persist_poll_interval
        scheduler = get_email_scheduler()
        if scheduler:
            from apscheduler.triggers.interval import IntervalTrigger
            scheduler.reschedule_job(
                'email_reply_check',
                trigger=IntervalTrigger(minutes=minutes),
            )
    except Exception as exc:
        return jsonify({'success': False, 'message': f'重新调度失败: {exc}'}), 500

    settings_mod.INQUIRY_CHECK_INTERVAL_MINUTES = minutes

    try:
        persist_poll_interval(minutes)
    except Exception:
        pass

    return jsonify({
        'success': True,
        'interval': _get_current_poll_interval(),
        'message': f'轮询间隔已更新为 {minutes} 分钟',
    })


@email_mgmt_bp.get('/unread-count')
def get_unread_count():
    ensure_permission('quotation')
    try:
        from backend.services.email_reply_watcher import _connect_imap
        import imaplib
        imap = _connect_imap()
        try:
            imap.select('INBOX')
            status, data = imap.search(None, '(UNSEEN)')
            count = 0
            if status == 'OK' and data and data[0]:
                count = len(data[0].split())
            return jsonify({'success': True, 'unread': count})
        finally:
            try:
                imap.close()
                imap.logout()
            except Exception:
                pass
    except Exception as exc:
        return jsonify({'success': True, 'unread': -1, 'error': str(exc)})


@email_mgmt_bp.get('/last-scan-time')
def get_last_scan_time_route():
    ensure_permission('quotation')
    try:
        from backend.services.email_reply_watcher import get_last_scan_time
        last_scan = get_last_scan_time()
    except Exception:
        last_scan = None
    return jsonify({'success': True, 'last_scan_time': last_scan})


@email_mgmt_bp.delete('/price-cache/<int:item_id>')
def delete_cache_item_route(item_id):
    ensure_permission('quotation')
    deleted = delete_price_cache_item(item_id)
    if deleted:
        return jsonify({'success': True, 'message': '已删除'})
    return jsonify({'success': False, 'message': '记录不存在'}), 404


@email_mgmt_bp.post('/price-cache/batch-delete')
def batch_delete_cache_route():
    ensure_permission('quotation')
    data = request.get_json(silent=True) or {}
    ids = data.get('ids') or []
    if not ids:
        return jsonify({'success': True, 'deleted': 0})
    deleted = delete_price_cache_items(ids)
    return jsonify({'success': True, 'deleted': deleted})


@email_mgmt_bp.get('/price-cache/export')
def export_price_cache_route():
    ensure_permission('quotation')
    keyword = request.args.get('keyword', '').strip()
    items = list_price_cache(keyword=keyword if keyword else None, limit=5000)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = '价格缓存'
    headers = ['物料编码', '名称', '规格', '数量', '单价(美元)', '单价(人民币)', '单价(欧元)', '单位', '报价日期', '有效期', '是否过期', '折扣', '询价人', '来源邮件']
    ws.append(headers)
    for item in items:
        ws.append([
            item.get('material_code', ''),
            item.get('name', ''),
            item.get('spec', ''),
            item.get('quantity', 0) if item.get('is_carbon_steel') else '—',
            item.get('unit_price_usd', ''),
            item.get('unit_price_cny', ''),
            item.get('unit_price_eur', ''),
            item.get('unit', ''),
            item.get('quotation_date', ''),
            item.get('valid_until', ''),
            '是' if item.get('is_expired') else '否',
            item.get('discount', ''),
            item.get('inquirer', ''),
            item.get('source_email', ''),
        ])
    for col in ws.columns:
        max_len = 0
        col_letter = col[0].column_letter
        for cell in col:
            val_len = len(str(cell.value or ''))
            if val_len > max_len:
                max_len = val_len
        ws.column_dimensions[col_letter].width = min(max_len + 4, 40)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return send_file(
        buf,
        as_attachment=True,
        download_name='price_cache_export.xlsx',
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
