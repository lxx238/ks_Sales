"""
BOM智能报价系统 - Flask Web后端
应用入口只负责创建 Flask App、加载配置、注册蓝图。
"""
import os
import sys

from flask import Flask, jsonify, redirect
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge


if __package__ in {None, ''}:
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


from backend.api import register_blueprints
from backend.config.settings import (
    FRONTEND_DIR, IMAGE_PATH, OUTPUT_FOLDER, UPLOAD_FOLDER, configure_app,
    INQUIRY_IMAP_USER, INQUIRY_CHECK_INTERVAL_MINUTES,
)


def create_app():
    app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path='/frontend')
    CORS(app, supports_credentials=True, expose_headers=['Content-Disposition'])
    configure_app(app)
    register_blueprints(app)

    @app.get('/')
    def index():
        return redirect('/frontend/login.html', code=302)

    @app.errorhandler(RequestEntityTooLarge)
    def handle_file_too_large(_error):
        limit_bytes = int(app.config.get('MAX_CONTENT_LENGTH') or 0)
        limit_mb = limit_bytes // (1024 * 1024) if limit_bytes else 0
        message = '上传文件过大'
        if limit_mb > 0:
            message = f'上传文件过大，当前限制为 {limit_mb}MB'
        return jsonify({
            'success': False,
            'message': message,
            'error': 'file_too_large',
            'max_size_bytes': limit_bytes,
            'max_size_mb': limit_mb,
        }), 413

    @app.errorhandler(PermissionError)
    def handle_permission_error(error):
        return jsonify({
            'success': False,
            'message': str(error),
        }), 403

    _start_email_watcher()

    return app


_email_scheduler = None


def _weekly_image_inquiry_job():
    from backend.services.image_inquiry_service import send_weekly_image_inquiry, GROUP_DESIGNER_MAP
    print('[WEEKLY-INQUIRY] Starting weekly image inquiry send...')
    for group, email in GROUP_DESIGNER_MAP.items():
        try:
            result, status = send_weekly_image_inquiry(source_group=group)
            print(f'[WEEKLY-INQUIRY] {group}: {result.get("message", result)} (status={status})')
        except Exception as exc:
            print(f'[WEEKLY-INQUIRY] {group} failed: {exc}')


def _monthly_log_cleanup_job():
    try:
        from backend.repositories.quotation_log_repository import delete_old_logs
        deleted = delete_old_logs(older_than_days=180)
        if deleted > 0:
            print(f'[LOG-CLEANUP] Deleted {deleted} old quotation log records (older than 180 days)')
    except Exception as exc:
        print(f'[LOG-CLEANUP] Failed: {exc}')


def _start_email_watcher():
    global _email_scheduler
    if _email_scheduler is not None:
        return
    if not INQUIRY_IMAP_USER:
        print('[EMAIL-WATCHER] IMAP not configured, skipping scheduler')
        return
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from backend.services.email_reply_watcher import check_email_replies

        interval = _load_persisted_interval()
        _email_scheduler = BackgroundScheduler(daemon=True)
        _email_scheduler.add_job(
            check_email_replies,
            'interval',
            minutes=interval,
            id='email_reply_check',
            misfire_grace_time=300,
            max_instances=1,
            coalesce=True,
        )
        _email_scheduler.add_job(
            _weekly_image_inquiry_job,
            'cron',
            day_of_week='mon',
            hour=6,
            minute=0,
            id='weekly_image_inquiry',
            misfire_grace_time=3600,
            max_instances=1,
            coalesce=True,
        )
        _email_scheduler.add_job(
            _monthly_log_cleanup_job,
            'cron',
            day=1,
            hour=3,
            minute=0,
            id='monthly_log_cleanup',
            misfire_grace_time=3600,
            max_instances=1,
            coalesce=True,
        )
        _email_scheduler.start()
        print(f'[EMAIL-WATCHER] Scheduler started, interval={interval}min, weekly inquiry=Mon 09:00')
    except Exception as exc:
        print(f'[EMAIL-WATCHER] Scheduler start failed: {exc}')


def get_email_scheduler():
    return _email_scheduler


_INTERVAL_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'poll_interval.txt')


def _load_persisted_interval():
    default = INQUIRY_CHECK_INTERVAL_MINUTES
    try:
        if os.path.exists(_INTERVAL_FILE):
            raw = open(_INTERVAL_FILE, 'r', encoding='utf-8').read().strip()
            val = int(raw)
            if 1 <= val <= 120:
                return val
    except Exception:
        pass
    return default


def persist_poll_interval(minutes):
    try:
        os.makedirs(os.path.dirname(_INTERVAL_FILE), exist_ok=True)
        with open(_INTERVAL_FILE, 'w', encoding='utf-8') as f:
            f.write(str(minutes))
    except Exception as exc:
        print(f'[EMAIL-WATCHER] Failed to persist poll interval: {exc}')


app = create_app()


if __name__ == '__main__':
    print('=' * 80)
    print('BOM智能报价系统 - Flask Web后端')
    print('=' * 80)
    print(f'上传目录: {os.path.abspath(str(UPLOAD_FOLDER))}')
    print(f'输出目录: {os.path.abspath(str(OUTPUT_FOLDER))}')
    print(f'Logo路径: {os.path.abspath(str(IMAGE_PATH))}')
    print('=' * 80)
    print('服务启动地址: http://localhost:5000')
    print('前端页面: http://localhost:5000/frontend/index.html')
    print('=' * 80)
    app.run(debug=True, host='0.0.0.0', port=5000)
