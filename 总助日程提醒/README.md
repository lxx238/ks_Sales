# 总助日程提醒系统 · 设计方案（README）

> 给总助使用的页面：维护老板日程（整月预览 / 当天行程），通过**钉钉工作通知**在每日 8:00 发送今日行程晨报，并在每条日程对应时间点自动给老板发提醒。

本系统**融入现有 BOM 报价平台**（Flask + SQLite + 原生 JS SPA），复用其角色权限、`.env` 配置、APScheduler 调度与 Blueprint/Service/Repository 分层，**不引入新框架**。

---

## 一、功能概述

| 模块 | 说明 |
|------|------|
| **月历预览** | 整月日历视图，每日角标显示当天日程数量与状态色块，点日期展开当日行程 |
| **当天行程** | 时间轴列出今日全部日程（时间/标题/地点/分类/参与人/优先级/状态） |
| **日程管理** | 新增 / 编辑 / 删除 / 标记完成 / 取消，支持跨天、全天事件 |
| **每日晨报** | 每天 08:00 自动汇总今日行程，以钉钉工作通知定向发给老板 |
| **定点提醒** | 每条日程按设定的提醒时间（准点 / 提前 N 分钟 / 提前一天）单独推送钉钉消息 |
| **钉钉对接** | 企业内部应用工作通知（AppKey/AppSecret/AgentId），按 userid 定向 |
| **发送日志** | 记录每条提醒的发送状态（待发/成功/失败）、失败原因、可重试 |
| **钉钉设置** | 在线配置凭据、测试发送、查老板 userid |

### 用户角色
- 新增角色 **`总助`**，归属于 **`人事组`**；新增权限标识 **`schedule`**。
- 仅持有 `schedule` 权限的账号可见本页面；`admin` 默认拥有全部权限。
- `人事组` 为**单功能分组**（与「物流组」机制一致）：选中后侧边栏只显示「总助日程提醒」，其余功能隐藏；语言组（韩/日/英）中不再显示本功能入口。
- `总助` 登录后直达 `app.html?group=人事组&page=schedule`。

### 钉钉接入（工作通知）
`.env.local` 配置（前缀 `KS_DINGTALK_*`），全部就绪后点「设置 → 测试发送」即时生效：
- `KS_DINGTALK_APP_KEY`：Client ID（AppKey）
- `KS_DINGTALK_APP_SECRET`：Client Secret（AppSecret，需在后台「显示」完整值）
- `KS_DINGTALK_AGENT_ID`：**纯数字** AgentId（注意：不是 App ID / UUID）
- `KS_DINGTALK_BOSS_USERID`：老板的钉钉 userId（优先）；留空时用 `KS_DINGTALK_BOSS_MOBILE` 手机号反查（需开通 `qyapi_get_member_by_mobile` 权限）
- 系统自动判断：AgentId 为数字 → 旧版工作通知接口（`corpconversation/asyncsend_v2`）；为空/非数字 → 新版机器人单聊接口
- 备选：`KS_DINGTALK_WEBHOOK` + `KS_DINGTALK_WEBHOOK_SECRET`（自定义群机器人，发到群，免权限）

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│  前端 app.html  →  侧边栏新增「总助日程」  →  KSRouter 'schedule'     │
│  frontend/js/pages/schedule.js  (月历 + 当天行程 + 设置)              │
└───────────────┬─────────────────────────────────────────────────────┘
                │  fetch /api/schedule/*
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  backend/api/schedule.py        Blueprint (薄路由 + ensure_permission)│
│           └→ services/schedule_service.py   业务编排                  │
│                 ├→ repositories/schedule_repository.py   SQLite      │
│                 └→ services/dingtalk_service.py   钉钉工作通知发送    │
└───────────────┬─────────────────────────────────────────────────────┘
                │  APScheduler（复用 app.py 调度模式）
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  晨报 Cron(每天08:00 Asia/Shanghai)  +  每条日程的 Date 触发任务       │
│  启动时从 schedule_reminders 表重建未发送任务（重启不丢失）           │
└─────────────────────────────────────────────────────────────────────┘
```

**复用现有能力**
- 权限：`backend/services/auth_service.py :: ensure_permission('schedule')`
- 配置：`backend/config/settings.py` + `.env.local`（`KS_` 前缀）
- 调度：`backend/app.py` 现有 APScheduler `BackgroundScheduler` 同款写法
- DB：`settings.py :: get_db_connection()`（WAL + Row 工厂）

---

## 三、钉钉对接方案（工作通知 · 定向给老板）

采用**企业内部应用 → 工作通知**，可按 userid 定向发送给老板本人（区别于群机器人只能发群）。

### 3.1 凭据清单（管理员在钉钉开发者后台创建「企业内部应用」获取）

| 配置项 | 环境变量 | 说明 |
|--------|---------|------|
| AppKey | `KS_DINGTALK_APP_KEY` | 应用唯一标识 |
| AppSecret | `KS_DINGTALK_APP_SECRET` | 应用密钥（**勿入库，只进 .env**） |
| AgentId | `KS_DINGTALK_AGENT_ID` | 工作通知所需 agentId |
| 老板 UserId | `KS_DINGTALK_BOSS_USERID` | 老板的钉钉 userid |
| 老板手机号 | `KS_DINGTALK_BOSS_MOBILE` | 备用：通过手机号反查 userid |
| 发送人姓名 | `KS_DINGTALK_SENDER_NAME` | 落款，默认「总助」 |

> 敏感凭据只放 `.env.local`，**不写进数据库、不进前端**。

### 3.2 调用链路

```
1) 获取 access_token（缓存 7000s，过期自动刷新）
   GET https://oapi.dingtalk.com/gettoken?appkey={AppKey}&appsecret={AppSecret}
   → { access_token, expires_in }

2) （首次/配置时）手机号 → userid 反查老板
   POST https://oapi.dingtalk.com/topapi/v2/user/getbymobile
        { access_token, mobile }
   → { result: { userid } }   ← 写入 KS_DINGTALK_BOSS_USERID

3) 发送工作通知（markdown 卡片，发给老板）
   POST https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2
        { access_token,
          agent_id, userid_list: [BOSS_USERID],
          msg: { msgtype:"markdown",
                 markdown:{ title, text } } }
   → { task_id }   （异步发送，钉钉服务端投递）
```

### 3.3 消息模板示例（markdown 工作通知）

**每日晨报（08:00）**
```
### 📅 老板今日行程（2026-06-15 共 4 项）

🟢 09:00–10:00 ｜ 高管周会 ｜ 3F一号会议室
🟡 10:30–11:30 ｜ 会见 A 客户 ｜ 接待室 B（客户：张总）
🔴 14:00–17:00 ｜ 视察生产基地 ｜ 西厂区（全天重点）
⚪ 18:30–20:00 ｜ 商务晚宴 ｜ 万豪酒店

> 本消息由总助日程系统于 08:00 自动发送
```

**单条日程定点提醒**
```
### ⏰ 日程提醒

**高管周会**
时间：09:00–10:00
地点：3F一号会议室
参与：王副总、李总监
备注：请提前审阅上周纪要

> 还有 15 分钟开始
```

### 3.4 限频与失败处理
- 工作通知无群机器人 20 条/分钟限制，但按企业额度计；**合并**：晨报单条聚合，定点提醒单条。
- access_token 内存缓存 + 过期重取，避免频繁鉴权。
- 发送失败：记录 `error_msg`，日志页支持「一键重发」；连续失败告警打印到控制台。

---

## 四、数据库设计（SQLite，存于现有 `data/database.db`）

新增 4 张表，启动时自动建表（`ensure_directories` 后执行 DDL）。

### 4.1 `boss_schedules` 日程主表
| 列 | 类型 | 说明 |
|----|------|------|
| id | INTEGER PK | 自增 |
| title | TEXT | 日程标题 |
| description | TEXT | 详细描述 |
| location | TEXT | 地点 |
| event_date | TEXT | 日期 YYYY-MM-DD |
| start_time | TEXT | 开始 HH:MM |
| end_time | TEXT | 结束 HH:MM |
| is_all_day | INTEGER | 0/1 全天事件 |
| category | TEXT | 会议/出差/接待/电话/其他 |
| participants | TEXT | 参与人或客户（JSON 数组） |
| priority | TEXT | high/medium/low |
| status | TEXT | pending/doing/done/cancelled |
| remark | TEXT | 备注 |
| created_by | TEXT | 创建账号（总助） |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

> 索引：`(event_date)`、`(status)`。

### 4.2 `schedule_reminders` 提醒任务表
| 列 | 类型 | 说明 |
|----|------|------|
| id | INTEGER PK | 自增 |
| schedule_id | INTEGER | 关联日程（软关联） |
| trigger_at | TEXT | 绝对提醒时间（调度器据此触发） |
| remind_kind | TEXT | morning(晨报)/point(定点) |
| remind_label | TEXT | 展示用「提前15分钟/前一天8:00」 |
| status | TEXT | pending/sent/failed/cancelled |
| sent_at | TEXT | 实际发送时间 |
| job_id | TEXT | APScheduler job id |
| error_msg | TEXT | 失败原因 |
| created_at | TEXT | |

> 索引：`(status, trigger_at)`、`(schedule_id)`。

### 4.3 `daily_briefing_config` 每日晨报配置（单行）
| 列 | 类型 | 说明 |
|----|------|------|
| id | INTEGER PK | 固定 1（单例） |
| enabled | INTEGER | 0/1 是否启用 |
| send_time | TEXT | 发送时间 HH:MM，默认 08:00 |
| tz | TEXT | 时区，默认 Asia/Shanghai |
| updated_at | TEXT | |

### 4.4 `dingtalk_send_log` 发送日志（可选，便于排查）
| 列 | 类型 | 说明 |
|----|------|------|
| id | INTEGER PK | |
| ref_type | TEXT | briefing/reminder/test |
| ref_id | INTEGER | 关联 reminder id 或日期 |
| target_userid | TEXT | 接收 userid |
| task_id | TEXT | 钉钉返回 task_id |
| success | INTEGER | 0/1 |
| error_msg | TEXT | |
| created_at | TEXT | |

---

## 五、定时发送机制（核心）

复用 `app.py` 中 APScheduler `BackgroundScheduler` 的同款写法，新增 `_start_schedule_scheduler()`。

### 5.1 两类定时任务

**① 每日晨报（Cron 触发）**
```
job: cron  hour=08 minute=00  tz=Asia/Shanghai
执行: schedule_service.run_daily_briefing()
  → 查 boss_schedules where event_date=今天 且 status in (pending,doing)
  → 按时间排序拼 markdown
  → dingtalk_service.send_to_boss(msg)
  → 写 dingtalk_send_log
```
晨报时间可在前端「设置」页改（改 `daily_briefing_config.send_time` 并 reschedule 该 job）。

**② 单条日程定点提醒（Date 触发）**
```
新建/编辑日程时:
  → 按「提醒规则」计算 trigger_at
  → 写 schedule_reminders(status=pending)
  → scheduler.add_job(date trigger, id=f"reminder_{id}")
执行: schedule_service.run_reminder(reminder_id)
  → 读日程 → 拼 markdown → 发钉钉 → 标记 sent/failed
```

### 5.2 提醒规则（前端勾选，可多选）
| 规则 | trigger_at 计算 |
|------|----------------|
| 当天准点 | 日程开始时间（如 09:00） |
| 提前 15 分钟 | start - 15min |
| 提前 30 分钟 | start - 30min |
| 提前 1 小时 | start - 60min |
| 前一天 08:00 | 日程前一天 08:00 |
| 自定义 | 前端选具体时间 |

### 5.3 重启不丢失（关键设计）
服务每次启动：
```
start_schedule_scheduler()
  → 启动晨报 cron
  → 读 schedule_reminders where status='pending' AND trigger_at > now
      → 逐条 add_job（id 复用 job_id），已过期的立即补发或标记
  → trigger_at < now 且超过 misfire 窗口的 → 标记 failed(已过期)，避免补发陈旧提醒
```
> 用 `misfire_grace_time` 控制宽限；`max_instances=1, coalesce=True` 防重复。

---

## 六、API 接口设计

新 Blueprint：`backend/api/schedule.py`，`url_prefix='/api/schedule'`，全部需 `schedule` 权限（admin 放行）。

### 6.1 日程 CRUD
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/schedule/month?year=2026&month=6` | 月历数据（每日聚合：数量/有无/状态） |
| GET | `/api/schedule/day?date=2026-06-15` | 某日全部行程（按时间排序） |
| GET | `/api/schedule/list?from=&to=&status=` | 区间筛选/分页 |
| GET | `/api/schedule/<id>` | 详情 |
| POST | `/api/schedule` | 新增（带提醒规则，自动建提醒任务） |
| PUT | `/api/schedule/<id>` | 编辑（重算提醒：取消旧任务、建新任务） |
| DELETE | `/api/schedule/<id>` | 删除（取消关联提醒任务） |
| POST | `/api/schedule/<id>/status` | 改状态（pending/doing/done/cancelled） |

### 6.2 晨报与提醒
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/schedule/briefing/config` | 读晨报配置 |
| PUT | `/api/schedule/briefing/config` | 改启用/时间（reschedule） |
| POST | `/api/schedule/briefing/test` | 立即手动发送一次今日晨报 |
| GET | `/api/schedule/reminders?schedule_id=&status=` | 提醒任务列表 |
| POST | `/api/schedule/reminders/<id>/retry` | 重发失败提醒 |

### 6.3 钉钉设置
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/schedule/dingtalk/status` | 配置完整度（不含 secret） |
| POST | `/api/schedule/dingtalk/test` | 测试发送（按手机号反查 userid 并发测试消息） |
| GET | `/api/schedule/dingtalk/logs?limit=50` | 发送日志 |

> 凭据(AppKey/Secret/AgentId/Userid)只读 `.env`，不可经 API 写入前端；`status` 接口仅返回「是否已配置」布尔。

### 6.4 请求/响应示例

**新增日程**
```json
POST /api/schedule
{
  "title": "高管周会",
  "event_date": "2026-06-15",
  "start_time": "09:00",
  "end_time": "10:00",
  "location": "3F一号会议室",
  "category": "会议",
  "participants": ["王副总", "李总监"],
  "priority": "high",
  "remark": "请提前审阅上周纪要",
  "remind_rules": ["point", "before_15", "before_1day"]
}
→ 200 { "success": true, "data": { "id": 1, "reminders": [...] } }
```

---

## 七、前端页面设计

新增页面 `frontend/js/pages/schedule.js`，注册到路由 `schedule`，并在 `app.html` 侧边栏加入口（`总助` 角色可见）。

### 7.1 布局（单页 Tab）
```
┌───────────────────────────────────────────────────────────┐
│ [📅 月历] [📋 今日行程] [⚙️ 提醒设置] [📨 钉钉设置] [📜 日志] │
├───────────────────────────────────────────────────────────┤
│ 月历 Tab:                                                  │
│  < 2026年6月 >      [今天]  [+ 新增日程]                   │
│  日 一 二 三 四 五 六                                      │
│   · · · · · · 1②  2①   (角标=当天日程数)                   │
│   3 · 4① 5③ ...                                           │
│  选中日期 → 右侧/下方面板列当日行程时间轴 + 编辑/完成按钮    │
├───────────────────────────────────────────────────────────┤
│ 今日行程 Tab: 时间轴卡片，显示时间/标题/地点/分类/参与人/   │
│              优先级/状态，支持标记完成、修改、删除           │
├───────────────────────────────────────────────────────────┤
│ 提醒设置 Tab: 晨报开关 + 时间(默认08:00) + [立即测试发送]   │
│ 钉钉设置 Tab: 显示配置完整度 + [测试发送] + 老板姓名/手机    │
└───────────────────────────────────────────────────────────┘
```

### 7.2 状态色约定
- 🔴 high（高/重点）、🟡 medium（中）、⚪ low（低）
- 状态：待办灰、进行中蓝、已完成绿（划线）、已取消浅灰

### 7.3 月历角标
每日右下角显示数字 = 当天待办+进行中数量；已完成/取消不计入角标，但点开可见。

---

## 八、目录结构（新增文件）

```
backend/
├── api/schedule.py                      新增 Blueprint
├── services/
│   ├── schedule_service.py              日程+提醒业务编排
│   └── dingtalk_service.py              钉钉工作通知发送+鉴权缓存
├── repositories/schedule_repository.py  SQLite 增删改查
└── app.py                               加 _start_schedule_scheduler() + 建表

frontend/
├── js/pages/schedule.js                 新增页面模块
├── app.html                             侧边栏加「总助日程」入口 + 注册路由
└── css/schedule.css                     月历/时间轴样式

.env.local                               加 KS_DINGTALK_* 变量
总助日程提醒/README.md                   本文档
```

### 改动既有文件（最小侵入）
- `backend/app.py`：`create_app()` 末尾加 `_start_schedule_scheduler()`
- `backend/api/__init__.py`：注册 `schedule_bp`
- `backend/config/settings.py`：读取 `KS_DINGTALK_*` 环境变量
- `backend/services/auth_service.py`：`ALL_PERMISSIONS` 加 `'schedule'`；角色含 `总助`
- `frontend/app.html`：加导航项 + `<script>` + `KSRouter.register('schedule', ...)`
- `backend/repositories/user_repository.py`：默认账号/权限映射加 `总助` → `['schedule']`

---

## 九、配置说明（`.env.local` 追加）

```ini
# 钉钉企业内部应用（工作通知，定向给老板）
KS_DINGTALK_APP_KEY=dingxxxxxxxxxxxx
KS_DINGTALK_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
KS_DINGTALK_AGENT_ID=123456789
KS_DINGTALK_BOSS_USERID=manager123           # 首次可留空，用手机号反查后填回
KS_DINGTALK_BOSS_MOBILE=13800000000
KS_DINGTALK_SENDER_NAME=总助
KS_SCHEDULE_TIMEZONE=Asia/Shanghai           # 默认 Asia/Shanghai
```

---

## 十、安全与边界

1. **凭据隔离**：AppSecret 只在 `.env`，绝不进数据库、绝不返回前端；API 只暴露「已配置」布尔。
2. **权限**：所有接口 `ensure_permission('schedule')`；仅 `总助`/`admin` 可用。
3. **去重防刷**：同一提醒 `job_id` 固定为 `reminder_{id}`，重启 reschedule 用同 id，APScheduler 自动去重。
4. **过期不补发陈旧**：超过 `misfire_grace_time` 的提醒标记 failed(已过期)，避免老板收到几天前的旧提醒。
5. **取消联动**：删除/取消日程 → 取消所有 pending 提醒任务并置 cancelled。
6. **失败可重试**：日志页一键重发；晨报失败不影响定点提醒，二者独立。
7. **时区**：统一 `Asia/Shanghai`，避免服务器时区差异导致提醒错点。

---

## 十一、实施步骤（建议顺序）

1. **建表 + Repository**：`schedule_repository.py` 实现 4 表 CRUD + 启动建表。
2. **钉钉服务**：`dingtalk_service.py` 实现 access_token 缓存、反查 userid、发送工作通知、测试发送。
3. **日程服务**：`schedule_service.py` 实现日程编排、提醒任务计算与写入。
4. **调度接入**：`app.py` 加 `_start_schedule_scheduler()`（晨报 cron + 启动重建 pending 提醒）。
5. **API 层**：`api/schedule.py` 路由 + 注册蓝图 + 加权限。
6. **权限/角色**：`auth_service.py`、`user_repository.py` 加 `schedule` 与 `总助`。
7. **前端页面**：`schedule.js`（月历/今日/设置/日志）+ `app.html` 入口 + CSS。
8. **联调**：填 `.env` 钉钉凭据 → 测试发送 → 建一条带提醒的日程 → 验证晨报与定点提醒。
9. **文档**：补充主 README 的 API 清单与默认账号说明。

---

## 十二、验证清单（验收）

- [ ] `总助` 账号登录后侧边栏可见「总助日程」，其他角色不可见
- [ ] 月历可切换月份，角标正确反映当日行程数
- [ ] 新增日程并选「提前15分钟」，到点老板钉钉收到提醒
- [ ] 每天 08:00 自动收到今日行程晨报
- [ ] 修改/删除日程，旧提醒被取消、新提醒被重建
- [ ] 服务重启后，未发送的提醒仍能按点触发
- [ ] 钉钉设置页「测试发送」成功，日志可见 task_id
- [ ] 失败提醒可在日志页一键重发
