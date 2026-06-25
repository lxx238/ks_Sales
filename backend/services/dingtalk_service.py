"""
钉钉消息发送，支持两种方式（自动选择）：
  1. 自定义群机器人 Webhook（推荐，最简单）—— 发到指定群
  2. 工作通知（企业内部应用）—— 定向发给老板本人

优先级：配置了 Webhook 就用 Webhook，否则用工作通知。
只使用标准库 urllib，不引入 requests。
凭据来自环境变量（见 settings.py）。
"""
import base64
import hashlib
import hmac
import json
import mimetypes
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from backend.config.settings import (
    DINGTALK_AGENT_ID,
    DINGTALK_APP_KEY,
    DINGTALK_APP_SECRET,
    DINGTALK_BOSS_MOBILE,
    DINGTALK_BOSS_USERID,
    DINGTALK_ROBOT_CODE,
    DINGTALK_SEND_MODE,
    DINGTALK_SENDER_NAME,
    DINGTALK_WEBHOOK,
    DINGTALK_WEBHOOK_SECRET,
    INQUIRY_DT_AGENT_ID,
    INQUIRY_DT_APP_KEY,
    INQUIRY_DT_APP_SECRET,
    INQUIRY_DT_ROBOT_CODE,
    INQUIRY_DT_TARGET_USERID,
)

OAPI = 'https://oapi.dingtalk.com'
NEWAPI = 'https://api.dingtalk.com'
_HTTP_TIMEOUT = 10


class DingTalkError(Exception):
    pass


def _http_json(url, payload=None, method=None, extra_headers=None):
    data = None
    headers = {'Accept': 'application/json'}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        headers['Content-Type'] = 'application/json;charset=utf-8'
    if extra_headers:
        headers.update(extra_headers)
    method = method or ('POST' if payload is not None else 'GET')
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=_HTTP_TIMEOUT) as resp:
            raw = resp.read().decode('utf-8')
    except urllib.error.HTTPError as exc:
        body = ''
        try:
            body = exc.read().decode('utf-8', errors='ignore')
        except Exception:
            pass
        raise DingTalkError(f'钉钉接口 HTTP {exc.code}: {body[:200]}')
    except urllib.error.URLError as exc:
        raise DingTalkError(f'无法连接钉钉接口: {exc.reason}')
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        raise DingTalkError(f'钉钉返回非 JSON: {raw[:200]}')


class DingTalkClient:
    def __init__(self, app_key, app_secret, agent_id, boss_userid='', boss_mobile='', sender_name='总助'):
        self.app_key = app_key or ''
        self.app_secret = app_secret or ''
        self.agent_id = agent_id or ''
        self.boss_userid = boss_userid or ''
        self.boss_mobile = boss_mobile or ''
        self.sender_name = sender_name or '总助'
        self._token = ''
        self._token_expire_at = 0.0
        self.mode = 'worknotify'

    def is_configured(self):
        return bool(self.app_key and self.app_secret and self.agent_id)

    def get_access_token(self):
        if not (self.app_key and self.app_secret):
            raise DingTalkError('未配置钉钉 AppKey/AppSecret')
        now = time.time()
        if self._token and now < self._token_expire_at - 300:
            return self._token
        url = f'{OAPI}/gettoken?appkey={urllib.parse.quote(self.app_key)}&appsecret={urllib.parse.quote(self.app_secret)}'
        resp = _http_json(url)
        if resp.get('errcode') != 0:
            raise DingTalkError(f'获取 access_token 失败: {resp.get("errmsg")} (code={resp.get("errcode")})')
        self._token = resp['access_token']
        self._token_expire_at = now + int(resp.get('expires_in', 7200))
        return self._token

    def resolve_boss_userid(self):
        """优先用已配置 userid，否则用手机号反查。返回 userid 或抛错。"""
        if self.boss_userid:
            return self.boss_userid
        if not self.boss_mobile:
            raise DingTalkError('未配置老板 UserId 或手机号，无法定向发送')
        token = self.get_access_token()
        url = f'{OAPI}/topapi/v2/user/getbymobile?access_token={urllib.parse.quote(token)}'
        resp = _http_json(url, {'mobile': self.boss_mobile})
        if resp.get('errcode') != 0:
            raise DingTalkError(f'手机号反查 userid 失败: {resp.get("errmsg")} (code={resp.get("errcode")})')
        userid = str((resp.get('result') or {}).get('userid') or '').strip()
        if not userid:
            raise DingTalkError('手机号反查 userid 为空')
        self.boss_userid = userid
        return userid

    def send_markdown(self, title, text, userid=None):
        """发送 markdown 工作通知。返回 (task_id, raw_resp)。"""
        if not self.is_configured():
            raise DingTalkError('钉钉凭据未配置完整（需要 AppKey/AppSecret/AgentId）')
        target_userid = userid or self.resolve_boss_userid()
        token = self.get_access_token()
        url = f'{OAPI}/topapi/message/corpconversation/asyncsend_v2?access_token={urllib.parse.quote(token)}'
        payload = {
            'agent_id': self.agent_id,
            'userid_list': target_userid,
            'msg': {
                'msgtype': 'markdown',
                'markdown': {'title': title, 'text': text},
            },
        }
        resp = _http_json(url, payload)
        if resp.get('errcode') != 0:
            raise DingTalkError(f'发送工作通知失败: {resp.get("errmsg")} (code={resp.get("errcode")})')
        task_id = str(resp.get('task_id') or '')
        return task_id, resp


class DingTalkRobotClient:
    """新版平台机器人单聊（oToMessages/batchSend），用新版 OAuth2 token。"""

    def __init__(self, app_key, app_secret, robot_code='', boss_userid='', boss_mobile='', sender_name='总助'):
        self.app_key = app_key or ''
        self.app_secret = app_secret or ''
        self.robot_code = robot_code or app_key or ''
        self.boss_userid = boss_userid or ''
        self.boss_mobile = boss_mobile or ''
        self.sender_name = sender_name or '总助'
        self._token = ''
        self._token_expire_at = 0.0
        self._oapi_token = ''
        self._oapi_token_expire_at = 0.0
        self.mode = 'robot'

    def is_configured(self):
        return bool(self.app_key and self.app_secret and self.boss_userid)

    def resolve_boss_userid(self):
        if self.boss_userid:
            return self.boss_userid
        if self.boss_mobile:
            return DingTalkClient(
                self.app_key, self.app_secret, '',
                '', self.boss_mobile, self.sender_name,
            ).resolve_boss_userid()
        raise DingTalkError('未配置老板 UserId 或手机号，无法定向发送')

    def get_access_token(self):
        if self._token and time.time() < self._token_expire_at - 120:
            return self._token
        url = f'{NEWAPI}/v1.0/oauth2/accessToken'
        resp = _http_json(url, {'appKey': self.app_key, 'appSecret': self.app_secret})
        token = (resp.get('accessToken') or '').strip()
        if not token:
            raise DingTalkError(f'新版 accessToken 获取失败: {json.dumps(resp, ensure_ascii=False)[:200]}')
        self._token = token
        self._token_expire_at = time.time() + int(resp.get('expireIn', 7200))
        return token

    def send_markdown(self, title, text, userid=None):
        if not self.app_key or not self.app_secret:
            raise DingTalkError('钉钉凭据未配置完整（需要 Client ID / Client Secret）')
        target = userid or self.resolve_boss_userid()
        user_ids = [u.strip() for u in str(target).split(',') if u.strip()]
        if not user_ids:
            raise DingTalkError('未配置接收人 userid')
        token = self.get_access_token()
        url = f'{NEWAPI}/v1.0/robot/oToMessages/batchSend'
        msg_param = json.dumps({'title': title, 'text': text}, ensure_ascii=False)
        task_ids = []
        last_resp = {}
        for uid in user_ids:
            payload = {
                'robotCode': self.robot_code,
                'userIds': [uid],
                'msgKey': 'sampleMarkdown',
                'msgParam': msg_param,
            }
            last_resp = _http_json(url, payload, extra_headers={'x-acs-dingtalk-access-token': token})
            task_ids.append(str(last_resp.get('messageTaskId') or last_resp.get('processQueryKey') or last_resp.get('flowId') or ''))
        return ','.join(t for t in task_ids if t), last_resp

    def _oapi_access_token(self):
        """旧版 access_token（media/upload 等旧接口需要）。"""
        if not (self.app_key and self.app_secret):
            raise DingTalkError('钉钉凭据未配置完整（需要 Client ID / Client Secret）')
        now = time.time()
        if self._oapi_token and now < self._oapi_token_expire_at - 300:
            return self._oapi_token
        url = f'{OAPI}/gettoken?appkey={urllib.parse.quote(self.app_key)}&appsecret={urllib.parse.quote(self.app_secret)}'
        resp = _http_json(url)
        if resp.get('errcode') != 0:
            raise DingTalkError(f'获取 access_token 失败: {resp.get("errmsg")} (code={resp.get("errcode")})')
        self._oapi_token = resp['access_token']
        self._oapi_token_expire_at = now + int(resp.get('expires_in', 7200))
        return self._oapi_token

    def upload_media(self, file_path, media_type='file'):
        """上传本地文件到钉钉，返回 media_id。"""
        if not os.path.isfile(file_path):
            raise DingTalkError(f'文件不存在: {file_path}')
        token = self._oapi_access_token()
        filename = os.path.basename(file_path)
        ctype = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
        boundary = '----ks' + uuid.uuid4().hex
        with open(file_path, 'rb') as f:
            filedata = f.read()
        preamble = (
            f'--{boundary}\r\n'
            f'Content-Disposition: form-data; name="media"; filename="{filename}"\r\n'
            f'Content-Type: {ctype}\r\n\r\n'
        ).encode('utf-8')
        body = preamble + filedata + f'\r\n--{boundary}--\r\n'.encode('utf-8')
        url = f'{OAPI}/media/upload?access_token={urllib.parse.quote(token)}&type={media_type}'
        req = urllib.request.Request(url, data=body, method='POST')
        req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
        try:
            with urllib.request.urlopen(req, timeout=_HTTP_TIMEOUT) as resp:
                raw = resp.read().decode('utf-8')
        except urllib.error.HTTPError as exc:
            b = ''
            try:
                b = exc.read().decode('utf-8', 'ignore')
            except Exception:
                pass
            raise DingTalkError(f'钉钉文件上传 HTTP {exc.code}: {b[:200]}')
        except urllib.error.URLError as exc:
            raise DingTalkError(f'无法连接钉钉接口: {exc.reason}')
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            raise DingTalkError(f'钉钉返回非 JSON: {raw[:200]}')
        if data.get('errcode') not in (0, None):
            raise DingTalkError(f'文件上传失败: {data.get("errmsg")} (code={data.get("errcode")})')
        media_id = str(data.get('media_id') or '')
        if not media_id:
            raise DingTalkError(f'文件上传未返回 media_id: {raw[:200]}')
        return media_id

    def send_file(self, file_path, display_name=None, userid=None):
        """机器人发送文件消息（sampleFile），支持多收件人。返回 (task_ids, media_id)。"""
        media_id = self.upload_media(file_path)
        user_ids = [u.strip() for u in str(userid or self.resolve_boss_userid()).split(',') if u.strip()]
        if not user_ids:
            raise DingTalkError('未配置接收人 userid')
        token = self.get_access_token()
        url = f'{NEWAPI}/v1.0/robot/oToMessages/batchSend'
        fname = display_name or os.path.basename(file_path)
        msg_param = json.dumps(
            {'mediaId': media_id, 'fileName': fname, 'fileType': _file_type(fname)},
            ensure_ascii=False)
        task_ids = []
        last_resp = {}
        for uid in user_ids:
            payload = {
                'robotCode': self.robot_code,
                'userIds': [uid],
                'msgKey': 'sampleFile',
                'msgParam': msg_param,
            }
            last_resp = _http_json(url, payload, extra_headers={'x-acs-dingtalk-access-token': token})
            task_ids.append(str(last_resp.get('processQueryKey') or last_resp.get('messageTaskId') or ''))
        return ','.join(t for t in task_ids if t), media_id


def _file_type(filename):
    ext = os.path.splitext(filename)[1].lower().lstrip('.')
    return ext or 'file'


_client_singleton = None


class DingTalkWebhookClient:
    """自定义群机器人（Webhook + 加签），消息发到机器人所在群。"""

    def __init__(self, webhook, secret='', sender_name='总助'):
        self.webhook = webhook or ''
        self.secret = secret or ''
        self.sender_name = sender_name or '总助'
        self.mode = 'webhook'

    def is_configured(self):
        return bool(self.webhook)

    def resolve_boss_userid(self):
        return ''

    @staticmethod
    def _sign(secret):
        timestamp = str(round(time.time() * 1000))
        string_to_sign = f'{timestamp}\n{secret}'
        digest = hmac.new(secret.encode('utf-8'), string_to_sign.encode('utf-8'),
                          digestmod=hashlib.sha256).digest()
        sign = urllib.parse.quote_plus(base64.b64encode(digest))
        return timestamp, sign

    def send_markdown(self, title, text, userid=None):
        if not self.is_configured():
            raise DingTalkError('未配置钉钉群机器人 Webhook')
        url = self.webhook
        if self.secret:
            timestamp, sign = self._sign(self.secret)
            url = f'{url}&timestamp={timestamp}&sign={sign}'
        payload = {
            'msgtype': 'markdown',
            'markdown': {'title': title, 'text': text},
        }
        resp = _http_json(url, payload)
        if resp.get('errcode') != 0:
            raise DingTalkError(f'群机器人发送失败: {resp.get("errmsg")} (code={resp.get("errcode")})')
        return str(resp.get('msgid') or resp.get('task_id') or ''), resp


class DingTalkBlackboardClient:
    """钉钉公告（黑板/OA公告），推送到「公告」模块，比聊天消息更醒目。"""

    def __init__(self, app_key, app_secret, boss_userid='', boss_mobile='', sender_name='总助'):
        self.app_key = app_key or ''
        self.app_secret = app_secret or ''
        self.boss_userid = boss_userid or ''
        self.boss_mobile = boss_mobile or ''
        self.sender_name = sender_name or '总助'
        self._helper = DingTalkClient(app_key, app_secret, '', '', '', sender_name)
        self.mode = 'blackboard'

    def is_configured(self):
        return bool(self.app_key and self.app_secret and self.boss_userid)

    def resolve_boss_userid(self):
        if self.boss_userid:
            return self.boss_userid
        if self.boss_mobile:
            self._helper.boss_mobile = self.boss_mobile
            return self._helper.resolve_boss_userid()
        raise DingTalkError('未配置收件人 UserId 或手机号，无法发送公告')

    @staticmethod
    def _to_plain(text):
        """公告正文为纯文本，去掉 markdown 符号。"""
        import re
        t = text or ''
        t = re.sub(r'^#{1,6}\s*', '', t, flags=re.M)   # 标题
        t = re.sub(r'\*{1,2}(.+?)\*{1,2}', r'\1', t)   # 加粗
        t = re.sub(r'^>\s?', '', t, flags=re.M)         # 引用
        t = re.sub(r'`(.+?)`', r'\1', t)               # 行内代码
        return t.strip()

    def send_markdown(self, title, text, userid=None):
        target = userid or self.resolve_boss_userid()
        token = self._helper.get_access_token()
        url = f'{OAPI}/topapi/blackboard/create?access_token={urllib.parse.quote(token)}'
        payload = {
            'create_request': {
                'operation_userid': target,
                'title': (title or '日程提醒')[:50],
                'content': self._to_plain(text),
                'blackboard_receiver': {'useridlist': [target], 'deptidlist': [], 'to_all_user': False},
            }
        }
        resp = _http_json(url, payload)
        if resp.get('errcode') != 0:
            raise DingTalkError(f'公告发送失败: {resp.get("errmsg")} (code={resp.get("errcode")})')
        return str(resp.get('blackboardid') or resp.get('id') or resp.get('instanceid') or ''), resp


def _build_client(settings_module=None):
    s = settings_module or _get_settings()
    mode = (s.DINGTALK_SEND_MODE or 'auto').lower()
    if mode == 'webhook' or (mode == 'auto' and s.DINGTALK_WEBHOOK):
        return DingTalkWebhookClient(s.DINGTALK_WEBHOOK, s.DINGTALK_WEBHOOK_SECRET, s.DINGTALK_SENDER_NAME)
    robot = DingTalkRobotClient(
        s.DINGTALK_APP_KEY, s.DINGTALK_APP_SECRET, s.DINGTALK_ROBOT_CODE,
        s.DINGTALK_BOSS_USERID, s.DINGTALK_BOSS_MOBILE, s.DINGTALK_SENDER_NAME,
    )
    if mode == 'robot':
        return robot
    if mode == 'worknotify' or (mode == 'auto' and s.DINGTALK_AGENT_ID and s.DINGTALK_AGENT_ID.isdigit()):
        return DingTalkClient(
            s.DINGTALK_APP_KEY, s.DINGTALK_APP_SECRET, s.DINGTALK_AGENT_ID,
            s.DINGTALK_BOSS_USERID, s.DINGTALK_BOSS_MOBILE, s.DINGTALK_SENDER_NAME,
        )
    return robot


def _get_settings():
    from backend.config import settings
    return settings


def get_client():
    """返回单例 client（读取 .env 配置）。

    若缓存的 client 未配置完整（例如在 .env 尚未填写钉钉凭据时被首次创建），
    则重新读取 .env 并重建，避免使用过期/不完整的单例发送导致静默失败。
    """
    global _client_singleton
    if _client_singleton is None or not _client_singleton.is_configured():
        s = _get_settings()
        s.reload_dingtalk_env()
        _client_singleton = _build_client(s)
    return _client_singleton


def reload_client():
    """重新读取 .env 配置（用于测试发送后立即生效）。"""
    global _client_singleton
    s = _get_settings()
    s.reload_dingtalk_env()
    _client_singleton = _build_client(s)
    return _client_singleton


_blackboard_singleton = None


def get_blackboard_client():
    """返回公告（黑板）客户端单例，用于晨报以公告形式发送。"""
    global _blackboard_singleton
    s = _get_settings()
    if _blackboard_singleton is None or not _blackboard_singleton.is_configured():
        s.reload_dingtalk_env()
        _blackboard_singleton = DingTalkBlackboardClient(
            s.DINGTALK_APP_KEY, s.DINGTALK_APP_SECRET,
            s.DINGTALK_BOSS_USERID, s.DINGTALK_BOSS_MOBILE, s.DINGTALK_SENDER_NAME,
        )
    return _blackboard_singleton


# ---- 询价提醒机器人（独立应用，与总助日程提醒分开）----

_inquiry_bot_singleton = None


def get_inquiry_bot_client():
    """返回询价提醒机器人客户端单例（机器人单聊模式，定向给报价人员）。

    使用独立的企业内部应用凭据（KS_INQUIRY_DT_*），与总助日程提醒的
    钉钉应用互不影响。以「机器人单聊」形式发送（消息出现在机器人对话窗口），
    而非工作通知。若未配置则返回 None。
    """
    global _inquiry_bot_singleton
    s = _get_settings()
    if _inquiry_bot_singleton is None or not _inquiry_bot_singleton.is_configured():
        s.reload_dingtalk_env()
        if not (s.INQUIRY_DT_APP_KEY and s.INQUIRY_DT_APP_SECRET
                and s.INQUIRY_DT_TARGET_USERID):
            return None
        _inquiry_bot_singleton = DingTalkRobotClient(
            s.INQUIRY_DT_APP_KEY,
            s.INQUIRY_DT_APP_SECRET,
            s.INQUIRY_DT_ROBOT_CODE,
            s.INQUIRY_DT_TARGET_USERID,
            '',
            '询价助手',
        )
    return _inquiry_bot_singleton


def reload_inquiry_bot_client():
    """重新读取 .env 并重建询价提醒机器人客户端（配置变更后立即生效）。"""
    global _inquiry_bot_singleton
    s = _get_settings()
    s.reload_dingtalk_env()
    _inquiry_bot_singleton = DingTalkRobotClient(
        s.INQUIRY_DT_APP_KEY,
        s.INQUIRY_DT_APP_SECRET,
        s.INQUIRY_DT_ROBOT_CODE,
        s.INQUIRY_DT_TARGET_USERID,
        '',
        '询价助手',
    ) if (s.INQUIRY_DT_APP_KEY and s.INQUIRY_DT_APP_SECRET
         and s.INQUIRY_DT_TARGET_USERID) else None
    return _inquiry_bot_singleton
