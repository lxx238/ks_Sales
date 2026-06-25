import os
from datetime import timedelta
from pathlib import Path

from backend.utils.constants import MAX_CONTENT_LENGTH


BASE_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = BASE_DIR / 'backend'
FRONTEND_DIR = BASE_DIR / 'frontend'
UPLOAD_FOLDER = Path(os.getenv('KS_UPLOAD_FOLDER', '')) if os.getenv('KS_UPLOAD_FOLDER') else BASE_DIR / 'uploads'
CAD_ASSISTANT_UPLOAD_FOLDER = UPLOAD_FOLDER / 'cad_assistant'
LEGACY_UPLOAD_FOLDER = BACKEND_DIR / 'uploads'
OUTPUT_FOLDER = Path(os.getenv('KS_OUTPUT_FOLDER', '')) if os.getenv('KS_OUTPUT_FOLDER') else BASE_DIR / 'output'
IMAGE_PATH = BASE_DIR / 'input' / '集团标1.png'
DATABASE_PATH = Path(os.getenv('KS_DATABASE_PATH', '')) if os.getenv('KS_DATABASE_PATH') else BASE_DIR / 'data' / 'database.db'


def get_db_connection():
    import sqlite3
    conn = sqlite3.connect(str(DATABASE_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.row_factory = sqlite3.Row
    return conn


def _load_env_file(path: Path, overwrite: bool = False) -> None:
    if not path.exists():
        return

    try:
        lines = path.read_text(encoding='utf-8').splitlines()
    except OSError:
        return

    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue

        name, value = line.split('=', 1)
        key = name.strip()
        if not key:
            continue
        if not overwrite and key in os.environ:
            continue

        os.environ[key] = value.strip().strip('"').strip("'")


_load_env_file(BASE_DIR / '.env')
_load_env_file(BASE_DIR / '.env.local')


GLOBAL_PRICE_INFO = {
    'file_id': None,
    'filename': None,
    'standard_filename': None,
    'standard_file': None,
    'upload_time': None,
    'price_count': 0,
}

INQUIRY_SMTP_HOST = os.getenv('KS_INQUIRY_SMTP_HOST', 'smtp.exmail.qq.com').strip()
INQUIRY_SMTP_PORT = 465
_raw_smtp_port = os.getenv('KS_INQUIRY_SMTP_PORT', '').strip()
if _raw_smtp_port:
    try:
        INQUIRY_SMTP_PORT = int(_raw_smtp_port)
    except ValueError:
        pass
INQUIRY_SMTP_USER = os.getenv('KS_INQUIRY_SMTP_USER', '').strip()
INQUIRY_SMTP_PASSWORD = os.getenv('KS_INQUIRY_SMTP_PASSWORD', '').strip()
INQUIRY_SMTP_FROM = os.getenv('KS_INQUIRY_SMTP_FROM', '').strip()
INQUIRY_SMTP_TO = os.getenv('KS_INQUIRY_SMTP_TO', '').strip()
INQUIRY_SMTP_CC = os.getenv('KS_INQUIRY_SMTP_CC', '').strip()

SILICONFLOW_API_URL = os.getenv('KS_SILICONFLOW_API_URL', 'https://api.siliconflow.cn/v1/chat/completions').strip()
SILICONFLOW_MODEL = os.getenv('KS_SILICONFLOW_MODEL', 'Pro/moonshotai/Kimi-K2.5').strip()
SILICONFLOW_VISION_MODEL = os.getenv('KS_SILICONFLOW_VISION_MODEL', 'Pro/moonshotai/Kimi-K2.5').strip()
SILICONFLOW_API_KEY = os.getenv('KS_SILICONFLOW_API_KEY', '').strip()

INQUIRY_IMAP_HOST = os.getenv('KS_INQUIRY_IMAP_HOST', 'imap.exmail.qq.com').strip()
INQUIRY_IMAP_PORT = 993
_raw_imap_port = os.getenv('KS_INQUIRY_IMAP_PORT', '').strip()
if _raw_imap_port:
    try:
        INQUIRY_IMAP_PORT = int(_raw_imap_port)
    except ValueError:
        pass
INQUIRY_IMAP_USER = os.getenv('KS_INQUIRY_IMAP_USER', '').strip()
INQUIRY_IMAP_PASSWORD = os.getenv('KS_INQUIRY_IMAP_PASSWORD', '').strip()
INQUIRY_CHECK_INTERVAL_MINUTES = 5
_raw_check_interval = os.getenv('KS_INQUIRY_CHECK_INTERVAL_MINUTES', '').strip()
if _raw_check_interval:
    try:
        INQUIRY_CHECK_INTERVAL_MINUTES = int(_raw_check_interval)
    except ValueError:
        pass


# ---- 钉钉企业内部应用（工作通知，定向给老板）----
DINGTALK_APP_KEY = os.getenv('KS_DINGTALK_APP_KEY', '').strip()
DINGTALK_APP_SECRET = os.getenv('KS_DINGTALK_APP_SECRET', '').strip()
_raw_dingtalk_agent = os.getenv('KS_DINGTALK_AGENT_ID', '').strip()
DINGTALK_AGENT_ID = _raw_dingtalk_agent
DINGTALK_BOSS_USERID = os.getenv('KS_DINGTALK_BOSS_USERID', '').strip()
DINGTALK_BOSS_MOBILE = os.getenv('KS_DINGTALK_BOSS_MOBILE', '').strip()
# 机器人 robotCode（新版平台机器人单聊接口需要，默认用 AppKey）
DINGTALK_ROBOT_CODE = os.getenv('KS_DINGTALK_ROBOT_CODE', '').strip()
# ---- 钉钉自定义群机器人（Webhook，发到群）更简单，优先于工作通知 ----
DINGTALK_WEBHOOK = os.getenv('KS_DINGTALK_WEBHOOK', '').strip()
DINGTALK_WEBHOOK_SECRET = os.getenv('KS_DINGTALK_WEBHOOK_SECRET', '').strip()
DINGTALK_SENDER_NAME = os.getenv('KS_DINGTALK_SENDER_NAME', '总助').strip()
# 发送模式：auto(默认,按配置自动选) / robot(机器人单聊) / worknotify(工作通知) / webhook(群机器人)
DINGTALK_SEND_MODE = os.getenv('KS_DINGTALK_SEND_MODE', 'auto').strip().lower()
# 每日晨报是否以钉钉「公告」形式发送（需开通 qyapi_blackboard_manage 权限）
DINGTALK_BRIEFING_ANNOUNCEMENT = os.getenv('KS_DINGTALK_BRIEFING_ANNOUNCEMENT', '').strip().lower() in ('1', 'true', 'yes', 'on')
SCHEDULE_TIMEZONE = os.getenv('KS_SCHEDULE_TIMEZONE', 'Asia/Shanghai').strip()
# 对外可访问的基础地址（用于钉钉消息里的「本周行程表」链接，需老板手机能打开）
PUBLIC_BASE_URL = os.getenv('KS_PUBLIC_BASE_URL', '').strip()

# ---- 询价提醒机器人（独立钉钉应用）----
INQUIRY_DT_APP_KEY = os.getenv('KS_INQUIRY_DT_APP_KEY', '').strip()
INQUIRY_DT_APP_SECRET = os.getenv('KS_INQUIRY_DT_APP_SECRET', '').strip()
INQUIRY_DT_AGENT_ID = os.getenv('KS_INQUIRY_DT_AGENT_ID', '').strip()
INQUIRY_DT_TARGET_USERID = os.getenv('KS_INQUIRY_DT_TARGET_USERID', '').strip()
# 机器人 robotCode（新版机器人单聊需要，默认用 AppKey）
INQUIRY_DT_ROBOT_CODE = os.getenv('KS_INQUIRY_DT_ROBOT_CODE', '').strip()
INQUIRY_REMINDER_INTERVAL = int(os.getenv('KS_INQUIRY_REMINDER_INTERVAL', '0').strip() or '0')


def reload_dingtalk_env():
    global DINGTALK_APP_KEY, DINGTALK_APP_SECRET, DINGTALK_AGENT_ID
    global DINGTALK_BOSS_USERID, DINGTALK_BOSS_MOBILE, DINGTALK_SENDER_NAME
    global DINGTALK_WEBHOOK, DINGTALK_WEBHOOK_SECRET, DINGTALK_ROBOT_CODE, DINGTALK_SEND_MODE, DINGTALK_BRIEFING_ANNOUNCEMENT, PUBLIC_BASE_URL
    global INQUIRY_DT_APP_KEY, INQUIRY_DT_APP_SECRET, INQUIRY_DT_AGENT_ID, INQUIRY_DT_TARGET_USERID, INQUIRY_DT_ROBOT_CODE, INQUIRY_REMINDER_INTERVAL
    _load_env_file(BASE_DIR / '.env')
    _load_env_file(BASE_DIR / '.env.local', overwrite=True)
    DINGTALK_APP_KEY = os.getenv('KS_DINGTALK_APP_KEY', '').strip()
    DINGTALK_APP_SECRET = os.getenv('KS_DINGTALK_APP_SECRET', '').strip()
    DINGTALK_AGENT_ID = os.getenv('KS_DINGTALK_AGENT_ID', '').strip()
    DINGTALK_BOSS_USERID = os.getenv('KS_DINGTALK_BOSS_USERID', '').strip()
    DINGTALK_BOSS_MOBILE = os.getenv('KS_DINGTALK_BOSS_MOBILE', '').strip()
    DINGTALK_WEBHOOK = os.getenv('KS_DINGTALK_WEBHOOK', '').strip()
    DINGTALK_WEBHOOK_SECRET = os.getenv('KS_DINGTALK_WEBHOOK_SECRET', '').strip()
    DINGTALK_ROBOT_CODE = os.getenv('KS_DINGTALK_ROBOT_CODE', '').strip()
    DINGTALK_SEND_MODE = os.getenv('KS_DINGTALK_SEND_MODE', 'auto').strip().lower()
    DINGTALK_BRIEFING_ANNOUNCEMENT = os.getenv('KS_DINGTALK_BRIEFING_ANNOUNCEMENT', '').strip().lower() in ('1', 'true', 'yes', 'on')
    DINGTALK_SENDER_NAME = os.getenv('KS_DINGTALK_SENDER_NAME', '总助').strip()
    PUBLIC_BASE_URL = os.getenv('KS_PUBLIC_BASE_URL', '').strip()
    INQUIRY_DT_APP_KEY = os.getenv('KS_INQUIRY_DT_APP_KEY', '').strip()
    INQUIRY_DT_APP_SECRET = os.getenv('KS_INQUIRY_DT_APP_SECRET', '').strip()
    INQUIRY_DT_AGENT_ID = os.getenv('KS_INQUIRY_DT_AGENT_ID', '').strip()
    INQUIRY_DT_TARGET_USERID = os.getenv('KS_INQUIRY_DT_TARGET_USERID', '').strip()
    INQUIRY_DT_ROBOT_CODE = os.getenv('KS_INQUIRY_DT_ROBOT_CODE', '').strip()
    INQUIRY_REMINDER_INTERVAL = int(os.getenv('KS_INQUIRY_REMINDER_INTERVAL', '0').strip() or '0')


def ensure_directories():
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
    CAD_ASSISTANT_UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
    OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)


def configure_app(app):
    ensure_directories()
    app.config['UPLOAD_FOLDER'] = str(UPLOAD_FOLDER)
    app.config['CAD_ASSISTANT_UPLOAD_FOLDER'] = str(CAD_ASSISTANT_UPLOAD_FOLDER)
    app.config['OUTPUT_FOLDER'] = str(OUTPUT_FOLDER)
    app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH
    app.config['SECRET_KEY'] = os.getenv('KS_SECRET_KEY', 'ks-bom-intranet-v1')
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['SESSION_COOKIE_SECURE'] = False
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)
