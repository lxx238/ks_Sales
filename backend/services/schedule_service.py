"""
总助日程提醒 - 业务编排 + APScheduler 调度。

职责：
  - 日程 CRUD（含提醒任务自动重算）
  - 每日 08:00 晨报 Cron 任务
  - 每条日程定点/提前提醒 Date 任务
  - 服务重启后从 DB 重建未发送任务
  - 拼装钉钉 markdown 消息并经 dingtalk_service 发送
"""
from datetime import date, datetime, timedelta, timezone

from backend.repositories import schedule_repository as repo
from backend.services import dingtalk_service
from backend.config import settings as app_settings

CN_TZ = timezone(timedelta(hours=8))

REMIND_RULE_OFFSETS = {
    'point': 0,
    'before_5': -5,
    'before_10': -10,
    'before_15': -15,
    'before_30': -30,
    'before_1h': -60,
    'before_1day': -1440,
}
REMIND_RULE_LABELS = {
    'point': '准点提醒',
    'before_5': '提前5分钟',
    'before_10': '提前10分钟',
    'before_15': '提前15分钟',
    'before_30': '提前30分钟',
    'before_1h': '提前1小时',
    'before_1day': '提前1天',
}

_scheduler = None


# ============================ 时间工具 ============================

def beijing_now():
    return datetime.now(CN_TZ)


def beijing_today():
    return beijing_now().date().isoformat()


def _parse_iso_naive(iso_str):
    """把存储的 naive ISO(北京时间) 解析为 aware datetime(CN_TZ)。"""
    s = str(iso_str or '').strip()
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        try:
            dt = datetime.strptime(s[:19], '%Y-%m-%dT%H:%M:%S')
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=CN_TZ)
    return dt


def _period_default_time(schedule):
    """根据时段返回默认触发时间 HH:MM。"""
    period = str(schedule.get('time_period') or '').strip()
    if not period and schedule.get('is_all_day'):
        period = repo.PERIOD_ALLDAY
    return repo.PERIOD_DEFAULT_TIME.get(period or repo.PERIOD_MORNING, '08:30')


def compute_trigger_at(schedule, rule='point'):
    base_date = str(schedule.get('event_date') or '')
    base_time = _period_default_time(schedule)
    offset_min = REMIND_RULE_OFFSETS.get(rule, 0)
    try:
        ref = datetime.strptime(f'{base_date} {base_time}', '%Y-%m-%d %H:%M')
    except ValueError:
        return None
    return (ref + timedelta(minutes=offset_min)).replace(tzinfo=CN_TZ)


# ============================ 调度器生命周期 ============================

def start_scheduler():
    global _scheduler
    if _scheduler is not None:
        return
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
    except Exception as exc:
        print(f'[SCHEDULE] APScheduler 不可用，日程提醒调度未启动: {exc}')
        return

    _scheduler = BackgroundScheduler(timezone=CN_TZ, daemon=True)
    _reschedule_briefing_job(_scheduler)

    now = beijing_now()
    pending, _ = repo.list_pending_reminders()
    restored = 0
    expired = 0
    for r in pending:
        trigger_dt = _parse_iso_naive(r['trigger_at'])
        if not trigger_dt:
            repo.update_reminder(r['id'], status=repo.REMINDER_FAILED, error_msg='提醒时间格式无效')
            continue
        if trigger_dt > now:
            _add_reminder_job(_scheduler, r['id'], r['job_id'] or f'reminder_{r["id"]}', trigger_dt)
            restored += 1
        else:
            repo.update_reminder(r['id'], status=repo.REMINDER_FAILED, error_msg='已过期(服务未运行时错过)')
            expired += 1

    _scheduler.start()
    print(f'[SCHEDULE] 调度器已启动，日报/周报已注册，恢复待发提醒 {restored} 条，标记过期 {expired} 条')


def _reschedule_briefing_job(scheduler=None):
    global _scheduler
    sched = scheduler or _scheduler
    if sched is None:
        return
    config = repo.get_briefing_config()

    def _parse_hm(t):
        parts = str(t).split(':')
        h = int(parts[0]) if len(parts) >= 1 and parts[0].isdigit() else 8
        m = int(parts[1]) if len(parts) >= 2 and parts[1].isdigit() else 0
        return h, m

    def _remove(jid):
        try:
            sched.remove_job(jid)
        except Exception:
            pass

    # 日报：每天 08:00（config.send_time）
    daily_id = 'schedule_daily_briefing'
    _remove(daily_id)
    if config['enabled']:
        dh, dm = _parse_hm(config['send_time'])
        sched.add_job(
            run_briefing, 'cron',
            hour=dh, minute=dm, timezone=CN_TZ,
            id=daily_id, misfire_grace_time=3600, max_instances=1, coalesce=True,
        )

    # 周报-本周：每周一 weekly_mon_time（默认 08:30）
    mon_id = 'schedule_weekly_this'
    _remove(mon_id)
    # 周报-下周：每周五 weekly_fri_time（默认 17:30）
    fri_id = 'schedule_weekly_next'
    _remove(fri_id)
    if config.get('weekly_enabled', True):
        mh, mm = _parse_hm(config.get('weekly_mon_time') or '08:30')
        sched.add_job(
            run_weekly_briefing, 'cron',
            day_of_week='mon', hour=mh, minute=mm, timezone=CN_TZ,
            id=mon_id, misfire_grace_time=3600, max_instances=1, coalesce=True,
            kwargs={'week_offset': 0},
        )
        fh, fm = _parse_hm(config.get('weekly_fri_time') or '17:30')
        sched.add_job(
            run_weekly_briefing, 'cron',
            day_of_week='fri', hour=fh, minute=fm, timezone=CN_TZ,
            id=fri_id, misfire_grace_time=3600, max_instances=1, coalesce=True,
            kwargs={'week_offset': 1},
        )


def _add_reminder_job(scheduler, reminder_id, job_id, trigger_dt):
    scheduler.add_job(
        run_reminder, 'date', run_date=trigger_dt,
        id=job_id, misfire_grace_time=600, max_instances=1, coalesce=True,
        args=[reminder_id],
    )


def _remove_jobs(job_ids):
    if not _scheduler or not job_ids:
        return
    for jid in job_ids:
        if not jid:
            continue
        try:
            _scheduler.remove_job(jid)
        except Exception:
            pass


def get_scheduler():
    return _scheduler


# ============================ 消息拼装 ============================

PRIORITY_EMOJI = {'high': '🔴', 'medium': '🟡', 'low': '⚪'}


def _priority_emoji(p):
    return PRIORITY_EMOJI.get(str(p or 'medium'), '🟡')


def _time_range(schedule):
    if schedule.get('is_all_day') or not schedule.get('start_time'):
        return '全天'
    start = str(schedule.get('start_time') or '')[:5]
    end = str(schedule.get('end_time') or '').strip()[:5]
    return f'{start}–{end}' if end else start


def build_briefing_markdown(day_str, items):
    active = [it for it in items if it['status'] in (repo.STATUS_PENDING, repo.STATUS_DOING)]
    count = len(active)
    lines = ['### 📅 当日行程', '', f'- 当日日期：{day_str}', f'- 事项安排：{count} 项']
    if count == 0:
        lines.append('- 今日暂无行程安排')
        return '当日行程', '\n'.join(lines)
    # 按时段分组
    by_period = {}
    for it in active:
        by_period.setdefault(str(it.get('time_period') or repo.PERIOD_MORNING), []).append(it)
    for period in sorted(by_period.keys(), key=lambda p: repo.PERIOD_ORDER.get(p, 9)):
        lines.append('')
        lines.append(f'**{repo.PERIOD_LABELS.get(period, period)}**')
        lines.append('')
        for it in by_period[period]:
            lines.append(f'- {_priority_emoji(it.get("priority"))} {it["title"]}')
    return '当日行程', '\n'.join(lines)


def build_reminder_markdown(schedule, label):
    plabel = repo.PERIOD_LABELS.get(str(schedule.get('time_period')), '')
    lines = ['### ⏰ 日程提醒', '', f'- 时段：{plabel}']
    if schedule.get('location'):
        lines.append(f'- 地点：{schedule["location"]}')
    lines.append(f'- 行程：{schedule["title"]}')
    if schedule.get('participants'):
        lines.append(f'- 参与人：{"、".join(schedule["participants"])}')
    if schedule.get('remark'):
        lines.append(f'- 备注：{schedule["remark"]}')
    lines.append(f'- 发送时间：{label}')
    return '日程提醒', '\n'.join(lines)


# ============================ 本周行程表（静态 HTML） ============================

WEEKDAYS_CN = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']
WEEKDAYS_EN = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']


def _esc(s):
    import html as _html
    return _html.escape(str(s if s is not None else ''))


def _time_emoji(start_time):
    try:
        h = int(str(start_time or '99')[:2])
    except ValueError:
        return '🕐'
    if h < 12:
        return '🌅'
    if h < 18:
        return '🍱'
    return '🌙'


def week_bounds(today=None):
    """返回本周一到周日 (monday, sunday) 的 date 对象。"""
    d = today or beijing_now().date()
    monday = d - timedelta(days=d.weekday())
    return monday, monday + timedelta(days=6)


def build_weekly_html(week_start_iso=None):
    try:
        ref = date.fromisoformat(week_start_iso) if week_start_iso else beijing_now().date()
    except ValueError:
        ref = beijing_now().date()
    monday, sunday = week_bounds(ref)
    rows = [it for it in repo.list_schedules_range(monday.isoformat(), sunday.isoformat())
            if it['status'] in (repo.STATUS_PENDING, repo.STATUS_DOING)]
    by_day = {}
    for it in rows:
        by_day.setdefault(it['event_date'], []).append(it)

    cards = []
    total = 0
    for i in range(7):
        d = monday + timedelta(days=i)
        items = sorted(by_day.get(d.isoformat(), []),
                       key=lambda x: (0 if x.get('is_all_day') else 1, str(x.get('start_time') or '')))
        weekend_cls = ' weekend' if i >= 5 else ''
        date_badge = f'{d.month}月{d.day}日'
        events = []
        if not items:
            events.append('<div class="event-item"><div class="event-detail">'
                          '<div class="event-desc" style="color:#9fb3c6">当天暂无安排</div>'
                          '</div></div>')
        for it in items:
            total += 1
            tb = f'<div class="time-block">{_time_emoji(it.get("start_time"))} {_esc(_time_range(it))}</div>'
            det = [f'<div class="event-title">{_esc(it["title"])}</div>']
            if it.get('description'):
                det.append(f'<div class="event-desc">{_esc(it["description"])}</div>')
            tags = []
            if it.get('location'):
                tags.append(f'<span class="tag">📍 {_esc(it["location"])}</span>')
            if it.get('participants'):
                tags.append(f'<span class="tag">👥 {_esc("、".join(it["participants"]))}</span>')
            if tags:
                det.append(''.join(tags))
            if it.get('remark'):
                det.append(f'<div class="remark-note">📝 {_esc(it["remark"])}</div>')
            events.append(f'<div class="event-item">{tb}<div class="event-detail">{"".join(det)}</div></div>')
        cards.append(
            f'<div class="day-card{weekend_cls}">'
            f'<div class="card-header"><div class="day-name">{WEEKDAYS_CN[i]} '
            f'<small>{WEEKDAYS_EN[i]}</small></div>'
            f'<div class="date-badge">{date_badge}</div></div>'
            f'<div class="timeline">{"".join(events)}</div></div>'
        )

    rng = f'{monday.month}月{monday.day}日 - {sunday.month}月{sunday.day}日'
    css = '''
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:#f2f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Roboto','PingFang SC','Microsoft YaHei',sans-serif;padding:20px 16px 48px;color:#1a2c3e}
        .planner{max-width:880px;margin:0 auto}
        .header{text-align:center;margin-bottom:24px}
        .header h1{font-size:28px;font-weight:700;background:linear-gradient(135deg,#1f5e7e,#2b8db0);background-clip:text;-webkit-background-clip:text;color:transparent;letter-spacing:-0.3px}
        .header p{color:#5c7c94;font-size:14px;margin-top:6px;border-top:1px solid #dce5ed;display:inline-block;padding-top:6px}
        .week-list{display:flex;flex-direction:column;gap:18px}
        .day-card{background:#fff;border-radius:28px;box-shadow:0 6px 14px rgba(0,0,0,.03),0 1px 3px rgba(0,0,0,.05);overflow:hidden;border:1px solid #e6edf4}
        .card-header{padding:16px 20px 12px;border-bottom:2px solid #eff3f8;display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap}
        .day-name{font-size:22px;font-weight:700;letter-spacing:-.3px}
        .day-name small{font-size:14px;font-weight:500;color:#6d8eab;margin-left:6px}
        .date-badge{background:#eef2f7;padding:4px 12px;border-radius:40px;font-size:13px;font-weight:500;color:#2b6f8f}
        .timeline{padding:10px 0 8px}
        .event-item{display:flex;align-items:flex-start;gap:14px;padding:14px 20px;border-bottom:1px solid #f0f4f9}
        .event-item:last-child{border-bottom:none}
        .time-block{min-width:100px;font-weight:600;font-size:14px;color:#2a7f9c;background:#eef6fc;padding:4px 10px;border-radius:40px;text-align:center;line-height:1.3;white-space:nowrap}
        .event-detail{flex:1}
        .event-title{font-weight:600;font-size:15px;color:#1f3e54;margin-bottom:6px}
        .event-desc{font-size:13.5px;color:#4c6a82;line-height:1.45;margin-bottom:5px}
        .tag{display:inline-block;background:#f0f4fa;font-size:11px;padding:2px 10px;border-radius:20px;color:#447e9e;font-weight:500;margin-right:4px}
        .remark-note{font-size:12px;color:#8aa9c2;margin-top:6px;padding-left:8px;border-left:2px solid #cde0ed}
        .day-card.weekend .card-header{background:#fefaf5}
        .day-card.weekend .day-name{color:#b55b3c}
        .day-card.weekend .time-block{background:#fdf0e6;color:#b4572e}
        .footer-meta{margin-top:32px;text-align:center;font-size:12px;color:#7f9aba;background:#eef3f9;padding:12px 16px;border-radius:60px;width:fit-content;margin-left:auto;margin-right:auto}
        @media(max-width:580px){body{padding:16px 12px 32px}.event-item{flex-direction:column;gap:8px;padding:14px 16px}.time-block{align-self:flex-start;white-space:normal;font-size:12px;padding:3px 12px}.day-name{font-size:20px}.card-header{padding:12px 16px}}
    '''
    return f'''<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover">
<title>本周行程表（{rng}）</title><style>{css}</style></head>
<body><div class="planner">
<div class="header"><h1>📋 本周行程安排表</h1>
<p>{rng} · 共 {total} 项安排</p></div>
<div class="week-list">{''.join(cards)}</div>
<div class="footer-meta">📍 本表由总助日程系统自动生成 · {beijing_now().strftime('%Y-%m-%d %H:%M')} 更新</div>
</div></body></html>'''


def weekly_filename(week_start_iso=None):
    """生成形如 15日-21日_日程安排.html 的文件名。"""
    try:
        ref = date.fromisoformat(week_start_iso) if week_start_iso else beijing_now().date()
    except ValueError:
        ref = beijing_now().date()
    monday, sunday = week_bounds(ref)
    return f'{monday.day}日-{sunday.day}日_日程安排.html'


def weekly_page_url():
    base = (app_settings.PUBLIC_BASE_URL or '').strip().rstrip('/')
    if not base:
        base = 'http://localhost:5000'
    from urllib.parse import quote
    return f'{base}/api/schedule/week/{quote(weekly_filename())}'


def build_weekly_markdown(week_start_iso=None, week_label='本周'):
    """周行程表 markdown（直接发到对话正文，无需服务器地址即可查看）。"""
    try:
        ref = date.fromisoformat(week_start_iso) if week_start_iso else beijing_now().date()
    except ValueError:
        ref = beijing_now().date()
    monday, sunday = week_bounds(ref)
    rows = [it for it in repo.list_schedules_range(monday.isoformat(), sunday.isoformat())
            if it['status'] in (repo.STATUS_PENDING, repo.STATUS_DOING)]
    by_day = {}
    for it in rows:
        by_day.setdefault(it['event_date'], []).append(it)
    rng = f'{monday.month}月{monday.day}日 - {sunday.month}月{sunday.day}日'
    total = len(rows)
    lines = [f'### 📋 {week_label}行程表', '', f'{rng} · 共 {total} 项', '']
    for i in range(7):
        d = monday + timedelta(days=i)
        items = sorted(by_day.get(d.isoformat(), []),
                       key=lambda x: repo.PERIOD_ORDER.get(str(x.get('time_period')), 9))
        weekend = '（周末）' if i >= 5 else ''
        lines.append(f'**{WEEKDAYS_CN[i]} {d.month}月{d.day}日{weekend}**')
        lines.append('')
        if not items:
            lines.append('- 当天暂无安排')
        else:
            for it in items:
                plabel = repo.PERIOD_LABELS.get(str(it.get('time_period')), '')
                lines.append(f'- {_priority_emoji(it.get("priority"))} {plabel}  {it["title"]}')
        lines.append('')
    # 若配置了对外地址，附完整页面链接
    pub = (app_settings.PUBLIC_BASE_URL or '').strip()
    if pub:
        from urllib.parse import quote
        lines.append(f'[📄 查看完整行程表页面]({pub.rstrip("/")}/api/schedule/week/{quote(weekly_filename())})')
    return f'{week_label}行程表', '\n'.join(lines)


# ============================ 任务执行 ============================

def run_briefing(force=False):
    """每日日报：08:00 发当日行程（按时段分组）。仅发日报，不发周报。"""
    try:
        config = repo.get_briefing_config()
        if not force and not config['enabled']:
            return {'success': False, 'skipped': True, 'error': '每日日报未启用'}
        day_str = beijing_today()
        items = repo.list_schedules_by_date(day_str)
        title, text = build_briefing_markdown(day_str, items)
        briefing_format = config.get('briefing_format', repo.BRIEFING_FORMAT_CARD)
        is_announcement = briefing_format == repo.BRIEFING_FORMAT_ANNOUNCEMENT
        client = dingtalk_service.get_blackboard_client() if is_announcement else dingtalk_service.reload_client()
        userid = client.resolve_boss_userid()
        task_id, _ = client.send_markdown(title, text)
        repo.add_send_log('briefing', day_str, userid, task_id, True)
        print(f'[SCHEDULE] 日报已发送 ({day_str}, task_id={task_id}, 形式={briefing_format})')
        return {'success': True, 'task_id': task_id, 'userid': userid, 'format': briefing_format}
    except dingtalk_service.DingTalkError as exc:
        repo.add_send_log('briefing', beijing_today(), '', '', False, str(exc))
        print(f'[SCHEDULE] 日报发送失败: {exc}')
        return {'success': False, 'error': str(exc)}
    except Exception as exc:
        print(f'[SCHEDULE] 日报异常: {exc}')
        return {'success': False, 'error': str(exc)}


def run_weekly_briefing(week_offset=0, force=False):
    """发送周报。week_offset=0 本周（周一发），1 下周（周五发）。"""
    try:
        config = repo.get_briefing_config()
        if not force and not config.get('weekly_enabled', True):
            return {'success': False, 'skipped': True, 'error': '周报未启用'}
        ref = beijing_now().date() + timedelta(weeks=week_offset)
        monday, sunday = week_bounds(ref)
        week_label = '本周' if week_offset == 0 else '下周'
        title, text = build_weekly_markdown(monday.isoformat(), week_label=week_label)
        briefing_format = config.get('briefing_format', repo.BRIEFING_FORMAT_CARD)
        is_announcement = briefing_format == repo.BRIEFING_FORMAT_ANNOUNCEMENT
        client = dingtalk_service.get_blackboard_client() if is_announcement else dingtalk_service.reload_client()
        userid = client.resolve_boss_userid()
        task_id, _ = client.send_markdown(title, text)
        repo.add_send_log('weekly', f'{monday.isoformat()}~{sunday.isoformat()}', userid, task_id, True)
        print(f'[SCHEDULE] {week_label}周报已发送 ({monday}~{sunday}, task_id={task_id})')
        return {'success': True, 'task_id': task_id, 'userid': userid, 'week': week_label}
    except dingtalk_service.DingTalkError as exc:
        print(f'[SCHEDULE] 周报发送失败: {exc}')
        return {'success': False, 'error': str(exc)}
    except Exception as exc:
        print(f'[SCHEDULE] 周报异常: {exc}')
        return {'success': False, 'error': str(exc)}


def run_reminder(reminder_id):
    try:
        reminder = repo.get_reminder(reminder_id)
        if not reminder or reminder['status'] != repo.REMINDER_PENDING:
            return
        schedule = repo.get_schedule(reminder['schedule_id'])
        if not schedule:
            repo.update_reminder(reminder_id, status=repo.REMINDER_CANCELLED, error_msg='日程已删除')
            return
        if schedule['status'] in (repo.STATUS_DONE, repo.STATUS_CANCELLED):
            repo.update_reminder(reminder_id, status=repo.REMINDER_CANCELLED,
                                 error_msg=f'日程已{schedule["status"]}')
            return
        title, text = build_reminder_markdown(schedule, reminder['remind_label'] or '日程提醒')
        client = dingtalk_service.reload_client()
        userid = client.resolve_boss_userid()
        task_id, _ = client.send_markdown(title, text)
        repo.update_reminder(reminder_id, status=repo.REMINDER_SENT, sent_at=repo.now_iso(),
                             job_id=reminder['job_id'])
        repo.add_send_log('reminder', reminder_id, userid, task_id, True)
        print(f'[SCHEDULE] 提醒已发送 (reminder={reminder_id}, task_id={task_id})')
    except dingtalk_service.DingTalkError as exc:
        repo.update_reminder(reminder_id, status=repo.REMINDER_FAILED, error_msg=str(exc))
        repo.add_send_log('reminder', reminder_id, '', '', False, str(exc))
        print(f'[SCHEDULE] 提醒发送失败 (reminder={reminder_id}): {exc}')
    except Exception as exc:
        print(f'[SCHEDULE] 提醒异常 (reminder={reminder_id}): {exc}')


# ============================ 日程业务 ============================

def _normalize_schedule_payload(data):
    title = str((data or {}).get('title') or '').strip()
    event_date = str((data or {}).get('event_date') or '').strip()
    if not title:
        raise ValueError('日程标题不能为空')
    if not event_date:
        raise ValueError('日程日期不能为空')
    try:
        datetime.strptime(event_date, '%Y-%m-%d')
    except ValueError:
        raise ValueError('日程日期格式应为 YYYY-MM-DD')

    is_all_day = bool((data or {}).get('is_all_day'))
    time_period = str((data or {}).get('time_period') or '').strip()
    # 全天 → 强制时段为全天
    if is_all_day:
        time_period = repo.PERIOD_ALLDAY
    if time_period not in repo.TIME_PERIODS:
        time_period = repo.PERIOD_MORNING
    start_time = str((data or {}).get('start_time') or '').strip()
    end_time = str((data or {}).get('end_time') or '').strip()
    for t in (start_time, end_time):
        if t:
            try:
                datetime.strptime(t[:5], '%H:%M')
            except ValueError:
                raise ValueError('时间格式应为 HH:MM')
    participants = (data or {}).get('participants') or []
    if isinstance(participants, str):
        participants = [p.strip() for p in participants.split(',') if p.strip()]

    priority = str((data or {}).get('priority') or 'medium').strip()
    if priority not in ('high', 'medium', 'low'):
        priority = 'medium'
    status = str((data or {}).get('status') or repo.STATUS_PENDING).strip()
    if status not in repo.SCHEDULE_STATUSES:
        status = repo.STATUS_PENDING

    return {
        'title': title,
        'description': str((data or {}).get('description') or '').strip(),
        'location': str((data or {}).get('location') or '').strip(),
        'event_date': event_date,
        'start_time': '' if is_all_day else start_time,
        'end_time': '' if is_all_day else end_time,
        'is_all_day': is_all_day,
        'time_period': time_period,
        'category': str((data or {}).get('category') or '').strip(),
        'participants': participants,
        'priority': priority,
        'status': status,
        'remark': str((data or {}).get('remark') or '').strip(),
        'created_by': str((data or {}).get('created_by') or '').strip(),
    }


def _normalize_rules(raw_rules):
    if not raw_rules:
        return ['point']
    if isinstance(raw_rules, str):
        raw_rules = [r.strip() for r in raw_rules.split(',') if r.strip()]
    return [r for r in raw_rules if r in REMIND_RULE_OFFSETS] or ['point']


def _rebuild_reminders(schedule, rules, actor=''):
    """每个行程一条提醒，按其时段默认时间触发。"""
    old_job_ids = repo.delete_reminders_for_schedule(schedule['id'])
    _remove_jobs(old_job_ids)
    now = beijing_now()
    created = []
    trigger_dt = compute_trigger_at(schedule, 'point')
    if not trigger_dt:
        return created
    label = _period_default_time(schedule)  # 如 08:30
    reminder_id = repo.create_reminder(schedule['id'], trigger_dt.isoformat(), 'point', label, '')
    job_id = f'reminder_{reminder_id}'
    if trigger_dt > now:
        repo.update_reminder(reminder_id, job_id=job_id)
        if _scheduler is not None:
            try:
                _add_reminder_job(_scheduler, reminder_id, job_id, trigger_dt)
            except Exception as exc:
                print(f'[SCHEDULE] 注册提醒任务失败 reminder={reminder_id}: {exc}')
    else:
        repo.update_reminder(reminder_id, job_id=job_id, status=repo.REMINDER_FAILED,
                             error_msg='提醒时间已过')
    created.append(reminder_id)
    return created


def create_schedule(data, actor=''):
    fields = _normalize_schedule_payload(data)
    fields['created_by'] = fields.get('created_by') or actor
    schedule_id = repo.create_schedule(fields)
    schedule = repo.get_schedule(schedule_id)
    rules = _normalize_rules((data or {}).get('remind_rules'))
    reminder_ids = _rebuild_reminders(schedule, rules, actor)
    return {'schedule': schedule, 'reminder_ids': reminder_ids}


def update_schedule(schedule_id, data):
    existing = repo.get_schedule(schedule_id)
    if not existing:
        raise LookupError('日程不存在')
    fields = _normalize_schedule_payload(data)
    repo.update_schedule(schedule_id, fields)
    if 'remind_rules' in (data or {}):
        rules = _normalize_rules(data.get('remind_rules'))
    else:
        rules = [r['remind_rule'] for r in repo.list_reminders_by_schedule(schedule_id)
                 if r['remind_rule']]
        rules = _normalize_rules(rules)
    schedule = repo.get_schedule(schedule_id)
    reminder_ids = _rebuild_reminders(schedule, rules)
    return {'schedule': schedule, 'reminder_ids': reminder_ids}


def delete_schedule(schedule_id):
    job_ids = repo.delete_reminders_for_schedule(schedule_id)
    _remove_jobs(job_ids)
    return repo.delete_schedule(schedule_id)


def set_schedule_status(schedule_id, status):
    if status not in repo.SCHEDULE_STATUSES:
        raise ValueError('无效的状态')
    ok = repo.set_schedule_status(schedule_id, status)
    if ok and status in (repo.STATUS_DONE, repo.STATUS_CANCELLED):
        job_ids = repo.cancel_reminders_for_schedule(schedule_id)
        _remove_jobs(job_ids)
    return ok


def retry_reminder(reminder_id):
    reminder = repo.get_reminder(reminder_id)
    if not reminder:
        raise LookupError('提醒任务不存在')
    repo.update_reminder(reminder_id, status=repo.REMINDER_PENDING, error_msg='')
    run_reminder(reminder_id)
    return repo.get_reminder(reminder_id)


# ============================ 晨报配置业务 ============================

def get_briefing_config_api():
    return repo.get_briefing_config()


def update_briefing_config_api(enabled=None, send_time=None, briefing_format=None,
                               weekly_enabled=None, weekly_mon_time=None, weekly_fri_time=None):
    config = repo.update_briefing_config(enabled=enabled, send_time=send_time, briefing_format=briefing_format,
                                         weekly_enabled=weekly_enabled, weekly_mon_time=weekly_mon_time,
                                         weekly_fri_time=weekly_fri_time)
    if _scheduler is not None:
        _reschedule_briefing_job()
    return config


def run_briefing_now():
    return run_briefing(force=True)


def run_weekly_briefing_now(week_offset=0):
    return run_weekly_briefing(week_offset=week_offset, force=True)


# ============================ 钉钉设置业务 ============================

def dingtalk_status():
    client = dingtalk_service.get_client()
    mode = getattr(client, 'mode', 'worknotify')
    base = {'mode': mode, 'configured': client.is_configured(), 'sender_name': client.sender_name}
    if mode == 'webhook':
        base['has_webhook'] = bool(getattr(client, 'webhook', ''))
        base['has_secret'] = bool(getattr(client, 'secret', ''))
    else:
        base['has_boss_userid'] = bool(getattr(client, 'boss_userid', ''))
        base['has_boss_mobile'] = bool(getattr(client, 'boss_mobile', ''))
        if mode == 'robot':
            base['robot_code'] = getattr(client, 'robot_code', '')
    app_settings.reload_dingtalk_env()
    base['briefing_format'] = repo.get_briefing_config().get('briefing_format', repo.BRIEFING_FORMAT_CARD)
    return base


def dingtalk_test():
    client = dingtalk_service.reload_client()
    userid = client.resolve_boss_userid()
    day_str = beijing_today()
    title, text = '日程系统测试', (
        f'### ✅ 钉钉连通测试\n\n'
        f'总助日程提醒系统已成功连通。\n\n'
        f'> 发送时间：{datetime.now(CN_TZ).strftime("%Y-%m-%d %H:%M")}'
    )
    task_id, _ = client.send_markdown(title, text)
    repo.add_send_log('test', day_str, userid, task_id, True)
    return {'task_id': task_id, 'userid': userid}


# ============================ 查询业务 ============================

def get_month(year, month):
    return repo.month_aggregate(year, month)


def get_day(day_str):
    return repo.list_schedules_by_date(day_str)


def get_detail(schedule_id):
    schedule = repo.get_schedule(schedule_id)
    if not schedule:
        return None
    reminders = repo.list_reminders_by_schedule(schedule_id)
    return {'schedule': schedule, 'reminders': reminders}


def list_reminders(status='', schedule_id=None, limit=200):
    return repo.list_reminders(status=status, schedule_id=schedule_id, limit=limit)


def list_logs(limit=50):
    return repo.list_send_logs(limit=limit)
