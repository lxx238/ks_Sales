# 科盛集团 BOM 智能报价系统

## 一、系统简介

BOM智能报价系统用于集中管理各语言组报价流程，统一定价标准与出表规范。支持上传BOM文件自动计算报价，并导出报价汇总表。

系统当前支持**韩语组**、**日语组**和**英语组**三个语言组的报价生成，并内置铝价物料数据库管理、CAD阵列识别助手、问答系统等辅助功能。

系统具备**物料编码自动补录**功能：当BOM表中出现数据库中不存在的物料编码时，系统会自动将该编码（连同BOM中的名称和规格）写入数据库作为骨架记录，后续流程自动生成对应的询价单和缺图表，方便采购人员补全价格和图片。

---

## 二、快速开始（给使用者）

### 步骤1：获取访问地址

联系管理员获取以下信息：
- **服务器IP地址**（例如：192.168.2.84）
- **端口号**（默认：5000）
- **登录账号和密码**

### 步骤2：打开网页

在浏览器地址栏输入：
```
http://服务器IP:5000
```

例如：
```
http://192.168.2.84:5000
```

### 步骤3：登录系统

使用分配的账号密码登录。

### 步骤4：使用功能

1. 上传BOM文件（支持 .xlsx / .xls 格式）
2. 系统自动解析并计算报价
3. 下载报价汇总表

---

## 三、管理员操作指南

### 3.1 启动服务器

**方法1：双击启动（推荐）**
```
双击运行 start.bat
```

**方法2：命令行启动**
```powershell
cd D:\lxx\科盛集团\韩语组功能demo
python -m backend.serve
```

### 3.2 查看访问地址

启动成功后，控制台会显示所有可访问的地址：

```
================================================================================
BOM quotation system - intranet production server
================================================================================
Access URL: http://127.0.0.1:5000
Login URL : http://127.0.0.1:5000/frontend/login.html
Access URL: http://192.168.2.84:5000      <-- 把这个地址发给内网用户
Login URL : http://192.168.2.84:5000/frontend/login.html
================================================================================
```

### 3.3 开放内网访问（防火墙设置）

**首次使用需要开放防火墙端口：**

1. **右键** `setup_firewall.bat`
2. 选择 **"以管理员身份运行"**
3. 看到 `[OK] TCP 5000 is now allowed.` 表示成功

### 3.4 分享给他人使用

把以下信息发给需要使用的人：

```
访问地址：http://192.168.2.84:5000
账号：[分配的账号]
密码：[分配的密码]
```

> 注意：请将 `192.168.2.84` 替换为实际的服务器IP地址

---

## 四、系统要求

### 服务器端
- Python 3.11+ 或 Python 3.12（推荐）
- Windows 10/11 或 Windows Server
- 已开放 TCP 5000 端口

### 客户端（使用者）
- 任意现代浏览器（Chrome、Edge、Firefox、Safari）
- 能访问服务器所在的内网

---

## 五、常见问题

### Q1: 别人无法访问网页？

**检查清单：**
1. 服务器是否已启动（控制台是否在运行）
2. 防火墙是否已开放 5000 端口（运行 `setup_firewall.bat`）
3. 客户端是否在同一内网
4. IP地址是否正确

### Q2: 如何查看本机IP地址？

打开命令提示符，输入：
```powershell
ipconfig
```
找到 `IPv4 地址` 那一行。

### Q3: 端口被占用怎么办？

修改启动端口：
```powershell
set KS_SERVER_PORT=5001
python -m backend.serve
```
同时需要开放新端口的防火墙。

### Q4: 如何停止服务器？

在控制台窗口按 `Ctrl + C`，或直接关闭窗口。

---

## 六、目录结构

```
韩语组功能demo/
├── start.bat               # 一键启动脚本
├── setup_firewall.bat      # 防火墙配置脚本（需管理员权限）
├── .env / .env.local       # 环境变量配置
│
├── backend/                # 后端代码
│   ├── app.py              # Flask 应用入口（注册 Blueprint）
│   ├── serve.py            # 生产服务器启动（Waitress）
│   ├── config/
│   │   └── settings.py     # 全局配置（路径、密钥、API密钥等）
│   ├── api/                # API 路由层（Blueprint）
│   │   ├── auth.py         #   认证与账号管理 API
│   │   ├── upload.py       #   文件上传 API
│   │   ├── quotation.py    #   报价生成与下载 API
│   │   ├── analyze.py      #   BOM 分析 API
│   │   ├── aluminum.py     #   铝价数据库管理 API
│   │   ├── question.py     #   问答系统 API
│   │   ├── cad_assistant.py#   CAD 阵列识别助手 API
│   │   ├── cleanup.py      #   临时文件清理 API
│   │   └── health.py       #   健康检查 API
│   ├── services/           # 业务逻辑层
│   │   ├── auth_service.py         # 认证与账号管理
│   │   ├── upload_service.py       # 文件上传处理
│   │   ├── quotation_service.py    # 报价生成调度
│   │   ├── analyze_service.py      # BOM 分析
│   │   ├── aluminum_service.py     # 铝价数据库管理
│   │   ├── question_service.py     # 问答系统
│   │   ├── cad_assistant_service.py# CAD 阵列识别
│   │   └── cleanup_service.py      # 文件清理
│   ├── core/               # 核心引擎层
│   │   ├── __init__.py     #   路由分发（按 group 转发韩语/日语/英语模块）
│   │   ├── bom_parser.py   #   BOM 解析器（薄封装）
│   │   ├── quotation_engine.py  # 韩语报价引擎（解析+生成，~3300行）
│   │   ├── quotation_builder.py # 韩语报价构建器（薄封装）
│   │   ├── matrix_parser.py     # 韩语信息表解析
│  → core/material_matcher.py  # BOM 物料匹配 + 数据库查询 + LRU 缓存 + 缺失编码自动补录
│   │   ├── price_matcher.py     # 定价表解析
│   │   ├── price_extractor.py   # 价格提取
│   │   ├── inquiry_builder.py   # 询价表构建
│   │   ├── statistics.py        # BOM 分析统计
│   │   └── ja/              #   日语组专用模块
│   │       ├── matrix_parser.py      # 日语信息表解析 (.xls, xlrd)
│   │       ├── quotation_engine.py   # 日语明细表 + 汇总表生成
│   │       └── quotation_builder.py  # 日语报价构建器（解析+组装）
│   ├── en/                  #   英语组专用模块
│   │       ├── matrix_parser.py      # 英语信息表解析（固定行号+标签匹配）
│   │       ├── quotation_engine.py   # 英语明细表(9列) + 汇总表(Part1架台+Part2运费)
│   │       └── quotation_builder.py  # 英语报价构建器（复用韩语BOM解析）
│   ├── repositories/       # 数据访问层（SQLite）
│   │   ├── account_repository.py    # 账号数据库操作
│   │   ├── material_repository.py   # 铝价数据库查询（aluminum_pricing 表）+ 缺失编码自动入库
│   │   └── question_repository.py   # 问答数据库操作
│   ├── excel/
│   │   └── reader.py       # Excel 兼容读取（.xlsx/.xls）
│   ├── image/
│   │   ├── processor.py    # 图片处理（base64 解码、格式转换）
│   │   ├── matcher.py      # 图片匹配（DB base64 → 临时文件）
│   │   └── inserter.py     # Excel 图片居中插入
│   ├── models/             # 数据模型
│   └── utils/
│       ├── constants.py    # 常量定义（数据库列名、角色、权限等）
│       ├── converters.py   # 数据转换工具（编码规范化、价格解析等）
│       ├── validators.py   # 请求校验
│       ├── file_utils.py   # 文件工具（路径解析、清理等）
│       └── helpers.py      # 通用辅助函数
│
├── frontend/               # 前端页面（SPA）
│   ├── login.html          # 登录页
│   ├── app.html            # 主应用页（路由容器）
│   ├── admin.html          # 管理页
│   ├── js/
│   │   ├── router.js       #   前端路由
│   │   ├── auth.js         #   认证相关
│   │   ├── login.js        #   登录页逻辑
│   │   ├── accounts.js     #   账号管理逻辑
│   │   ├── admin.js        #   管理页逻辑
│   │   ├── utils.js        #   通用工具
│   │   └── pages/          #   各功能页面 JS
│   └── css/                # 样式文件
│
├── data/
│   └── database.db         # SQLite 数据库（铝价 + 账号 + 问答）
│
├── uploads/                # 上传文件临时存储（BOM/Matrix/定价表）
├── output/                 # 生成的报价表输出目录
└── input/                  # 输入模板文件（含集团标1.png Logo）
```

---

## 七、默认账号密码

### 7.1 系统默认账号

| 账号 | 密码 | 角色 | 说明 |
|------|------|------|------|
| **admin** | Admin@123 | 管理员 | 系统管理员，拥有所有权限 |
| **ko_user** | Ko@123 | 韩语组 | 韩语组成员账号 |
| **en_user** | En@123 | 英语组 | 英语组成员账号 |
| **ja_user** | Ja@123 | 日语组 | 日语组成员账号 |

### 7.2 权限体系

系统采用**基于角色的权限控制**，定义了 5 种权限：

| 权限标识 | 功能范围 | 默认拥有者 |
|----------|----------|-----------|
| `quotation` | 报价生成、BOM分析、文件上传下载 | 所有语言组 + admin |
| `database` | 铝价数据库增删改查、图片管理 | admin |
| `records` | 变更申请记录查看与审批 | admin |
| `questions` | 问答系统（提问/回复/关闭） | 所有语言组 + admin |
| `cad` | CAD 阵列识别助手 | 所有语言组 + admin |

**权限检查流程**：
```
请求到达 → ensure_permission('quotation')
  → 从 session 读取当前用户（ks_auth_username）
  → admin 角色直接放行
  → 其他角色检查 account['permissions'] 列表是否包含该权限
  → 不满足则返回 403 PermissionError
```

### 7.3 安全建议

⚠️ **首次使用后请立即修改默认密码！**

修改密码方式：
1. 使用管理员账号登录
2. 进入管理页面
3. 选择对应账号修改密码

---

## 八、系统配置说明

### 8.1 环境变量

系统支持通过 `.env` 或 `.env.local` 文件配置环境变量：

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `KS_SERVER_PORT` | `5000` | 服务监听端口 |
| `KS_UPLOAD_FOLDER` | `./uploads` | 上传文件目录 |
| `KS_OUTPUT_FOLDER` | `./output` | 输出文件目录 |
| `KS_DATABASE_PATH` | `./data/database.db` | SQLite 数据库路径 |
| `KS_SECRET_KEY` | `ks-bom-intranet-v1` | Session 加密密钥 |
| `KS_SILICONFLOW_API_URL` | `https://api.siliconflow.cn/v1/chat/completions` | SiliconFlow API 地址 |
| `KS_SILICONFLOW_MODEL` | `Pro/moonshotai/Kimi-K2.5` | CAD 助手使用的模型 |
| `KS_SILICONFLOW_API_KEY` | （空） | SiliconFlow API 密钥 |

### 8.2 数据库结构

系统使用 SQLite 数据库，包含以下主要表：

#### `aluminum_pricing` 表（铝价物料数据库）

| 数据库列名 | API 字段名 | 说明 |
|-----------|-----------|------|
| `工程编码` | code | 产品工程编码（主键，用于匹配 BOM） |
| `规格说明\n(mm)/(米)` | 规格说明(mm)/(米) | 规格描述 |
| `工程品名` | name | 中文名称 |
| `工程品名--韩语` | name_ko | 韩语名称 |
| `工程品名--英语` | name_en | 英语名称 |
| `工程品名--日语` | name_ja | 日语名称 |
| `计价单位` | unit | 计价单位（米/个/套/支等） |
| `10u小氧化(美元)--组装` | price | 美元单价 |
| `编码属性` | code_attribute | 编码属性（A/F/TX → 按长度计重） |
| `重量` | weight | 单位重量 |
| `图片` | image | 图片（旧格式） |
| `图片_base64` | image_base64 | 图片（base64 格式，优先使用） |

#### `aluminum_change_requests` 表（变更申请记录）

| 列名 | 说明 |
|------|------|
| `id` | 自增主键 |
| `action` | 操作类型（create/update/delete） |
| `target_code` | 目标工程编码 |
| `requester` | 申请人 |
| `requester_role` | 申请人角色 |
| `status` | 状态（pending/approved/rejected/withdrawn） |
| `submitted_at` | 提交时间 |
| `reviewed_at` | 审核时间 |
| `reviewed_by` | 审核人 |
| `review_note` | 审核备注 |
| `payload_json` | 变更数据（JSON） |
| `snapshot_json` | 原始快照（JSON） |

---

## 九、全部 API 接口清单

### 9.1 认证与账号管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/auth/login` | 登录 | 无 |
| POST | `/api/auth/logout` | 登出 | 无 |
| GET | `/api/auth/me` | 获取当前用户 | 已登录 |
| GET | `/api/auth/accounts` | 列出所有账号 | admin |
| POST | `/api/auth/accounts` | 新增/更新账号 | admin |
| POST | `/api/auth/accounts/import` | 批量导入账号（Excel） | admin |
| GET | `/api/auth/accounts/import-template` | 下载导入模板 | admin |
| POST | `/api/auth/accounts/<username>/password` | 重置密码 | admin |
| POST | `/api/auth/accounts/<username>/toggle` | 启用/停用账号 | admin |
| DELETE | `/api/auth/accounts/<username>` | 删除账号 | admin |
| POST | `/api/auth/accounts/reset` | 恢复默认账号 | admin |

### 9.2 文件上传

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/upload-bom` | 上传 BOM 文件 | quotation |
| POST | `/api/upload-matrix` | 上传阵列表（附 group 参数） | quotation |
| POST | `/api/upload-price` | 上传定价表（可设为全局） | quotation |
| GET | `/api/get-global-price-status` | 查询全局定价表状态 | quotation |

### 9.3 报价生成与分析

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/generate` | 生成报价表 | quotation |
| POST | `/api/analyze` | 分析 BOM（不生成文件） | quotation |
| POST | `/api/download-missing-image-template` | 下载缺图编码模板 | quotation |
| GET | `/api/download/<file_id>` | 下载生成的报价表 | quotation |
| GET | `/api/download-standard/<file_id>` | 下载标准定价表 | quotation |
| POST | `/api/cleanup` | 清理上传的临时文件 | quotation |

### 9.4 铝价数据库管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/aluminum/list` | 分页列表查询 | database |
| GET | `/api/aluminum/<id>` | 单条记录查询 | database |
| POST | `/api/aluminum/create` | 新增记录 | database |
| PUT | `/api/aluminum/<id>` | 修改记录 | database |
| DELETE | `/api/aluminum/<id>` | 删除记录 | database |
| POST | `/api/aluminum/images/import` | 导入图片（多文件/Excel） | database |
| GET | `/api/aluminum/images/export` | 导出所有图片（zip） | database |
| POST | `/api/aluminum/prices/batch-update` | 批量更新价格（Excel） | database |
| GET | `/api/aluminum/database/download` | 下载完整数据库（Excel） | database |
| GET | `/api/aluminum/change-requests` | 查询变更申请列表 | records |
| POST | `/api/aluminum/change-requests` | 提交变更申请 | records |
| POST | `/api/aluminum/change-requests/<id>/approve` | 审批通过 | records |
| POST | `/api/aluminum/change-requests/<id>/reject` | 审批拒绝 | records |
| POST | `/api/aluminum/change-requests/<id>/withdraw` | 撤回申请 | records |

### 9.5 问答系统

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/questions` | 问题列表 | questions |
| GET | `/api/questions/<id>` | 问题详情 | questions |
| POST | `/api/questions` | 提交问题 | questions |
| POST | `/api/questions/<id>/reply` | 回复问题（仅 admin） | questions |
| POST | `/api/questions/<id>/close` | 关闭问题（仅 admin） | questions |

### 9.6 CAD 阵列识别助手

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/cad-assistant/sessions` | 创建会话（上传图纸） | cad |
| POST | `/api/cad-assistant/chat` | 多轮对话 | cad |
| DELETE | `/api/cad-assistant/sessions/<id>` | 删除会话 | cad |

### 9.7 健康检查

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/health` | 系统健康检查 | 无 |

---

## 十、功能模块详细流程

### 10.1 认证与账号管理流程

```
前端 login.js → POST /api/auth/login {username, password}
  → auth_service.py :: login_user()
    → ensure_json_payload() 校验请求体
    → account_repository.py :: verify_account_password()
      → SQLite 查询 accounts 表
      → 密码比对（明文比对）
      → 检查账号是否启用
    → clear_auth_session() 清除旧 session
    → persist_auth_session() 写入新 session
      → session['ks_auth_username'] = username
      → session.permanent = True（7天有效期）
    → 返回 {success: true, data: {username, role, permissions}}

后续请求 → ensure_permission('quotation')
  → get_current_account() 从 session 读取用户
  → admin 角色直接放行
  → 其他角色检查 permissions 列表
```

**账号管理功能明细**：

| 功能 | 实现函数 | 关键逻辑 |
|------|---------|---------|
| 新增/更新账号 | `upsert_account_item()` | 管理员不可降权/停用；密码必填 |
| 重置密码 | `reset_account_password()` | 管理员权限，新密码必填 |
| 启用/停用 | `toggle_account_item()` | 管理员账号不可停用 |
| 删除账号 | `delete_account_item()` | 管理员账号不可删除 |
| 批量导入 | `import_account_items()` | Excel 解析，需含「账号」「密码」「角色」列 |
| 导入模板 | `generate_import_template()` | 生成示例 Excel（3行示例数据） |
| 恢复默认 | `reset_account_items()` | 清空并重建 5 个默认账号 |

---

### 10.2 文件上传流程

#### 10.2.1 BOM 文件上传

```
POST /api/upload-bom (multipart/form-data, file=<BOM.xlsx>)
  → upload_service.py :: upload_bom_file()
    → _save_uploaded_file()
      → 校验文件扩展名（.xlsx/.xls）
      → 生成 UUID 作为 file_id
      → 保存到 uploads/<file_id>.<ext>
    → get_sheet_names() 获取所有工作表名称
    → list_bom_tables() 扫描 BOM 表格列表
      → excel_file_compat() 打开文件（.xlsx 用 openpyxl，.xls 用 xlrd）
      → quick_scan_bom_sheets()
        → 遍历每个 sheet，读取前 50 行
        → 检测含 "BOM" 关键词的行（排除"备注："行）
        → 返回包含 BOM 的工作表列表
      → 对每个 BOM sheet:
        → discover_sheet_bom_starts() 定位每个 BOM 区域
          → 扫描含 "BOM" 的行
          → extract_config_info() 提取配置
            → build_config_region() 读取 BOM 上方配置区域
            → 按规则提取字段：
              - 阵列（anchors=['阵列'], mode='two_numbers'）
              - 板规（anchors=['板规'], mode='three_numbers'）
              - 跨距（anchors=['跨距'], mode='one_number'）
              - 角度（anchors=['角度'], mode='one_number'）
              - 布板方式（anchors=['布板方式'], mode='text'）
              - 是否东西可调（anchors=['是否东西可调'], mode='text'）
              - 导轨伸出面板长度
            → find_header_mapping_for_row() 智能匹配表头
              → 对每个单元格文本评分（score_header_candidate）
              → 需要「编码」「名称」「规格」3 个核心列
          → 生成 variant_name（如 "4×2_固定"）
          → 生成 key（如 "Sheet1::5"）
    → 返回 {file_id, filename, sheet_names, bom_tables: [{key, sheet_name, variant_name, display_name, array}]}
```

#### 10.2.2 阵列表（Matrix）上传

```
POST /api/upload-matrix (multipart/form-data, file=<Matrix.xlsx>, group=韩语组)
  → upload_service.py :: upload_matrix_file(file, group)
    → _save_uploaded_file()
    → extract_matrix_data(filepath, group=group)  [路由分发]
      → 韩语组: core/matrix_parser.py :: extract_matrix_data()
      → 日语组: core/ja/matrix_parser.py :: extract_matrix_data()
      → 英语组: core/en/matrix_parser.py :: extract_matrix_data()
    → 解析失败 → cleanup_file() → 返回错误
    → 返回 {file_id, project_name, output_kw, output_wp, set_count, arrays, ...}
```

#### 10.2.3 定价表上传

```
POST /api/upload-price (multipart/form-data, file=<Price.xlsx>, set_as_global=true)
  → upload_service.py :: upload_price_file(file, set_as_global)
    → _save_uploaded_file()
    → extract_pricing_data(filepath)
      → 读取 Excel，标准化列名
      → 生成标准定价表文件（uploads/<file_id>_standard.xlsx）
    → load_price_mapping() 加载价格映射
      → 查找「工程编码」「10u小氧化」「单位」列
      → 构建 {code: {price, unit}} 映射
    → 统计米计价/个套计价数量
    → [可选] 设为全局定价表（写入内存 GLOBAL_PRICE_INFO）
    → 返回 {file_id, price_count, meter_unit_count, piece_unit_count}
```

---

### 10.3 BOM 分析流程

```
POST /api/analyze {bom_file_id, selected_bom_keys: [...]}
  → analyze_service.py :: analyze_bom_db_only()
    → resolve_bom_file(bom_file_id) 查找文件路径
      → 在 uploads/ 目录下搜索 file_id 匹配的文件
    → build_bom_material_context(bom_file, selected_bom_keys)
      → [缓存检查] get_cached_bom_material_context()
        → 缓存 key = (文件路径, 文件mtime, 文件size, 数据库路径, 数据库mtime, 数据库size, 选中的BOM keys 排序元组)
        → LRU 缓存，上限 8 条
        → 缓存命中 → 直接返回，日志打印 "[MATCH] context cache hit"
      → [缓存未命中]
        → collect_bom_products(bom_file, selected_bom_keys)
          → 解析 BOM（流程同 10.2.1 中的 BOM 解析）
          → 返回 products = [{seq, code, name, spec, material, quantity, weight, ...}]
        → fetch_material_mapping(material_codes)
          → normalize_lookup_code() 标准化编码（去空格、大写）
          → 去重后得到 unique_codes
          → fetch_material_rows() 批量查询数据库
            → 分块查询（每块 500 个编码）
            → SQL: WHERE UPPER(REPLACE(TRIM(工程编码), ' ', '')) IN (...)
          → 对每条数据库记录构建:
            → decode_image_base64() 解码图片
            → record = {db_code, name, name_ko, name_en, name_ja, unit, price,
                         code_attribute, db_weight, image_status, image_bytes, ...}
            → material_mapping[normalized_code] = record
            → material_mapping[原始编码] = record（双索引）
        → auto_register_missing_codes(products, material_mapping)  ← 【自动补录】
          → 遍历 products，用 normalize_lookup_code() 标准化编码
          → 对比 material_mapping 找出数据库中不存在的编码
          → 去重：同一 normalized code 只处理一次
          → 调用 auto_create_missing_records() 批量写入骨架记录
            → INSERT OR IGNORE INTO aluminum_pricing (工程编码, 工程品名, 规格说明)
            → 只填 3 个字段，价格/图片/单位等全部为空
            → 一个连接、一次 commit
          → 如有新增: 重新 fetch_material_mapping() 加载最新数据
          → 新增记录自动被标记为 price=None, image_status='missing'
          → 后续询价表和缺图表自动包含这些编码
        → build_bom_analysis(products, material_mapping)
          → 逐产品检查:
            → resolve_price_info() 尝试精确匹配 → strip匹配 → 标准化匹配
            → has_valid_price_info() 检查价格是否有效（> 0）
            → 检查图片状态（ready/missing/invalid）
            → 收集 issue_reasons（数据库无匹配/缺少价格/缺少图片/图片无效）
          → 返回统计:
            → total_products, matched_count, unmatched_code_count
            → missing_price_count, missing_image_count, invalid_image_count
            → unmatched_codes（去重）, missing_image_codes（去重）
            → preview_rows（前 100 条匹配详情）
        → 存入缓存 store_cached_bom_material_context()
    → 返回 {success: true, total_products, matched_count, unmatched_items_count,
             missing_image_count, missing_image_codes, preview_rows, ...}
```

---

### 10.4 报价生成流程 — 韩语组

```
POST /api/generate {bom_file_id, matrix_file_id, selected_bom_keys, contact_info, center_images, group}
  → quotation_service.py :: generate_quotation_db_only()

┌─────────────────────────────────────────────────────────────────────────┐
│ 步骤 0: 参数校验与文件解析                                                │
│  → ensure_json_payload(data)                                            │
│  → 提取参数: bom_file_id, matrix_file_id, selected_bom_keys,             │
│             contact_info, center_images, group                           │
│  → resolve_bom_file(bom_file_id) → BOM 文件路径                          │
│  → [日志] "[GENERATE] request received, bom_file_id=..., ..."           │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 步骤 1: 解析信息表（可选）                                                │
│  → matrix_file_id 存在时:                                                │
│    → resolve_matrix_file(matrix_file_id)                                 │
│    → extract_matrix_data(matrix_file, group='韩语组')                    │
│      → core/__init__.py 路由分发                                         │
│      → core/matrix_parser.py :: extract_matrix_data()                    │
│        → _find_matrix_sheet()                                            │
│          → 遍历所有 sheet，扫描前 3 行                                    │
│          → 查找含 '등록표/발주표/솔라 시스템/project information' 的 sheet│
│        → 读取整个 sheet 为 DataFrame（无表头）                            │
│        → 扫描区域: 前 55 行 × 20 列                                      │
│                                                                         │
│        → _find_label_with_data_right(['프로젝트', '项目', 'Project Name'])│
│          → 找到标签位置 (row, col)                                       │
│          → _find_first_non_empty_right() 读取右侧第一个非空值             │
│          → → project_name                                               │
│                                                                         │
│        → _find_label_with_data_right(['총 출력량', '总发电量'])           │
│          → _find_first_numeric_right() → output_kw                      │
│                                                                         │
│        → _try_parse_multi_array_format() 多阵列格式检测                   │
│          → _find_multi_array_header()                                    │
│            → 扫描含 'Row/Table' + 'Column/Table' 列头的行                │
│          → _parse_multi_arrays()                                         │
│            → 逐行读取: no, rows, cols, table_qty, modules                │
│          → 返回 arrays = [{no, rows, cols, table_qty, modules}, ...]     │
│          → 或回退到 _find_label_with_value_below(['배열갯수'])            │
│            → 找标签下方一行的数值 → set_count                             │
│            → 从同一表头行找 '행'/'열' 列 → array_rows, array_cols        │
│                                                                         │
│        → _extract_label_value(['최대풍속']) → max_wind_speed            │
│        → _extract_label_value(['최대적설량']) → max_snow_load            │
│        → _extract_label_numeric(['모듈출력량']) → module_wattage          │
│        → _extract_label_value(['사이즈']) → module_size                  │
│                                                                         │
│        → 返回 matrix_data = {                                            │
│            project_name, output_kw, output_wp(=output_kw*1000),          │
│            set_count, array_rows, array_cols, arrays, total_modules,     │
│            max_wind_speed, max_snow_load, module_wattage, module_size    │
│          }                                                              │
│    → [日志] "[GENERATE] matrix parsed: project_name=..., output_kw=..." │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 步骤 2: BOM 解析 + 数据库价格匹配（韩语组使用 LRU 缓存）                   │
│  → build_bom_material_context(bom_file, selected_bom_keys)               │
│    → [完整流程同 10.3 BOM 分析]                                          │
│    → 返回 (products, material_mapping, analysis)                         │
│  → analysis['material_record_count'] = 数据库去重记录数                   │
│  → [日志] "[GENERATE] analysis context ready: total_products=..., ..."  │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 步骤 3: 图片准备                                                         │
│  → material_mapping_to_temp_image_dir(material_mapping)                  │
│    → 在 output/ 下创建临时目录 db_images_<uuid>/                         │
│    → 遍历 material_mapping，去重处理（按 normalized_code）               │
│    → 对 image_status='ready' 的记录:                                     │
│      → 将 image_bytes 写入临时文件（如 ALU-123_1.png）                    │
│    → 返回 (temp_dir_path, written_count)                                 │
│  → [日志] "[GENERATE] temp image dir prepared: ..., image_count=..."    │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 步骤 4: 生成报价表                                                       │
│  → logo_path = input/集团标1.png（如存在）                                │
│  → split_and_create_quotations(bom_file, ..., group=None)                │
│    → core/__init__.py 路由 → 韩语组使用:                                 │
│    → core/quotation_engine.py :: split_and_create_quotations()           │
│                                                                         │
│    4a. 图片预扫描                                                        │
│      → 从 output/ 目录加载历史图片匹配日志                                │
│      → scan_images(image_folder) 扫描临时图片目录                        │
│      → 构建 code_to_images = {code: [image_paths]}                       │
│                                                                         │
│    4b. 加载价格映射                                                      │
│      → 使用 price_mapping_override（来自步骤2的数据库查询结果）            │
│      → 不再从文件重新加载                                                 │
│                                                                         │
│    4c. 再次解析 BOM 文件                                                 │
│      → excel_file_compat() 打开 BOM                                      │
│      → quick_scan_bom_sheets() 跳过非 BOM sheet                         │
│        → 跳过关键词: 对照表/物料总表/定价表/套件明细/Sheet                 │
│      → 对每个 BOM sheet:                                                 │
│        → discover_sheet_bom_starts() 定位 BOM 区域                      │
│        → [按 selected_bom_keys 过滤]                                     │
│        → [按 matrix_data.array_rows × array_cols 过滤]                   │
│          → parse_array_to_rows_cols() 解析 BOM 阵列字符串               │
│          → 只保留匹配的 BOM                                              │
│                                                                         │
│    4d. 对每个选中的 BOM 生成明细 Sheet                                    │
│      → create_quotation_from_dataframe()                                 │
│        → read_bom_from_dataframe() 从 DataFrame 读取产品列表             │
│        → parse_array_to_rows_cols() 从阵列信息提取行列数                  │
│                                                                         │
│        ═══ Sheet 布局（韩语 10 列）═══                                    │
│                                                                         │
│        Row 1: 空行                                                       │
│        Row 2: 标题 = matrix_project_name 或 '태양광 시스템 견적서'       │
│               (Malgun Gothic 36号加粗, 居中)                             │
│        Row 3-6: 左侧 A3:B6 合并 = 公司 Logo                              │
│                  右侧: 담당자/전화/Tel/Fax + 安装角度/最大风速/板规等     │
│        Row 7: A7='서측'(蓝底白字), D7=행数, E7=열数, G7=세트数           │
│        Row 8: 空分隔行                                                   │
│        Row 9: 表头行                                                     │
│          A=번호\nItem No.                                                │
│          B=상품명\nProduct Name                                          │
│          C=제조 재료\nMaterial                                           │
│          D=사진\nPicture                                                 │
│          E=규격\nSpec.                                                   │
│          F=단가\nUnit Price (US$)\nEX Works                             │
│          G=수량\nQTY (PCS)                                               │
│          H=총가격\nTotal Price (US$)\nEX Works                          │
│          I=무게\nWeight(KG)                                              │
│          J=제품코드\nRemark                                              │
│                                                                         │
│        Row 10+: 数据行（每行高 61px）                                     │
│          → 品名显示优先级: group对应语言 > name_ko > name > BOM原名       │
│          → 价格匹配: resolve_price_info(price_mapping, product_code)    │
│            → 精确匹配 → strip匹配 → normalize大写去空格匹配              │
│                                                                         │
│          ═══ 价格计算逻辑 ═══                                            │
│          if price_unit in ['米', 'm', 'M', 'meter', ...]:                │
│            length_mm = extract_length_from_spec(spec)                    │
│              → 支持: 123mm, L=123, 长度:123, 123米(×1000), 纯数字       │
│            if length_mm > 0:                                             │
│              总价 = 单价 × (length_mm / 1000) × 数量  [米计价]           │
│            else:                                                         │
│              总价 = 单价 × 数量  [降级为按个计价]                         │
│          else:                                                           │
│            总价 = 单价 × 数量  [个/套计价]                                │
│          → 总价四舍五入到 2 位小数                                        │
│                                                                         │
│          ═══ 重量计算逻辑 ═══                                            │
│          if quantity <= 0: 跳过                                          │
│          fallback = BOM单重 × 数量                                       │
│          if price_info 有 db_weight:                                     │
│            total_weight = db_weight × 数量                               │
│            if code_attribute in {'A', 'F', 'TX'}:  [按长度计重]          │
│              length_mm = extract_length_from_spec(spec)                  │
│              if length_mm > 0:                                           │
│                total_weight ×= (length_mm / 1000)                        │
│              else:                                                       │
│                回退到 BOM 单重公式                                        │
│          else:                                                           │
│            回退到 BOM 单重公式                                            │
│          → 重量四舍五入到 2 位小数                                        │
│                                                                         │
│          ═══ 未匹配处理 ═══                                              │
│          → 未匹配价格的行: 整行黄色背景 (FFFF00)                         │
│          → 缺少图片: 记录 issue                                          │
│          → 收集到 local_unmatched_products                               │
│                                                                         │
│        删除空重量行 + 重新编号                                            │
│          → 遍历 I 列，删除重量为空/0 且名称为空的行                       │
│          → 重新从 1 开始编号 A 列                                        │
│                                                                         │
│        插入图片到 D 列                                                   │
│          → 对每行读取 J 列编码                                           │
│          → 在 code_to_images 中查找图片路径                              │
│          → prepare_image_for_excel()                                     │
│            → 转为 RGB，缩放到 120×80px，保存为 JPEG                      │
│            → 使用缓存避免重复处理                                        │
│          → add_image_centered_in_cell()                                  │
│            → 计算单元格中心偏移 (EMU 单位，1px = 9525 EMU)               │
│            → 使用 OneCellAnchor 居中插入                                 │
│          → 无图片填 "/"                                                  │
│                                                                         │
│        小计和总计行                                                      │
│          → SUB-TOTAL AMOUNT/TABLE (单基小计)                             │
│          → TOTAL AMOUNT OF <set_count> TABLES (总金额 = 小计 × 组数)     │
│          → 附加说明行 (红色字体)                                         │
│          → 空的附加产品小计/总计                                          │
│                                                                         │
│        样式设置                                                          │
│          → 全部单元格: thin border, Malgun Gothic 16号                   │
│          → 外围: thick border                                            │
│          → 页面设置: 横向, A4, fit to width                              │
│                                                                         │
│        返回 {sheet_name, valid_products, total_weight, total_price,      │
│               matched_count, unmatched_count, meter_unit_count, ...}     │
│                                                                         │
│    4e. 生成汇总报价单（견적서）                                           │
│      → create_summary_quotation_sheet()                                  │
│        ═══ 汇总表布局 ═══                                                │
│        Row 1: 公司 Logo（A1:G1 合并, 居中缩放）+ 报价日期                 │
│        Row 2: '태양광 지붕 시스템 견적서'（16号加粗, 浅蓝背景）           │
│        Row 3: 프로젝트: {project_name}                                   │
│        Row 4: 무역거래조건: CIF 부산（红色）                              │
│        Row 5: 납기일: 계약금 수금후 10~14일                              │
│        Row 6: 지불조건: 30% 예약금 선불(T/T) + 70% 선적전               │
│        Row 7: 유효기간: 1일간 유효                                       │
│        Row 8: Part 1 标题                                                │
│        Row 9: 表头 (번호/행/열/세트/각도/출력량/1세트요금/합계/드리는요금)│
│        Row 10+: 每个 BOM 一行                                            │
│          → 1세트요금 = total_price / set_count                           │
│          → 합계(USD) = total_price                                      │
│          → 드리는 요금 = total_price（浅蓝背景）                         │
│        汇总行: 합계 / 총 출력량(KW) / 1W당비용(USD)                      │
│        Part 2: 운임비 (Freight Cost)                                     │
│          → CIF부산(USD) / 컨테이너(20/40/LCL) / 토탈                    │
│          → 총무게 ~ kg（红色小字）                                       │
│        → 移至工作簿首位                                                  │
│                                                                         │
│    4f. 生成询价表（独立文件）                                             │
│      → save_inquiry_sheet_to_file()                                      │
│        → create_inquiry_sheet()                                          │
│          → 31 列宽表头:                                                  │
│            业务/研发沟通确定(A-H): 询价人/日期/编码/名称/规格/数量/单位/备注│
│            研发提供(I-Q): 产品类别/售价/单位/报价日期/表面处理/重量/备注  │
│            采购提供(R-AE): 是否带图/归属项目/采购员/单价/含税/供应商等    │
│          → 每行一个未匹配产品                                             │
│        → 保存为 output/询价表.xlsx                                       │
│                                                                         │
│    4g. 保存主文件                                                        │
│      → master_wb.save(output_dir/<BOM文件名>_报价汇总.xlsx)              │
│      → 清理临时图片目录                                                  │
│      → 打印统计信息（工作表/物料/重量/金额/匹配/图片）                    │
│      → 返回 {output_file, inquiry_file, unmatched_count}                 │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 步骤 5: 后处理                                                           │
│  → stage_generated_file(output_file)                                     │
│    → 移动到 output/ 目录，重命名为 <uuid>_<原文件名>                      │
│    → 返回 (file_id, filename, path)                                      │
│  → [可选] stage_generated_file(inquiry_file) 询价表同理                   │
│  → [可选] center_images == true:                                         │
│    → center_images_in_column_d(output_path)                              │
│      → 重新打开 workbook                                                 │
│      → 遍历每个 sheet 的所有图片                                         │
│      → 重新计算 D 列的居中偏移                                           │
│      → 保存                                                              │
│  → build_sheet_statistics(output_path)                                   │
│    → get_sheet_names() → {sheet_count, sheet_names}                      │
│  → 返回前端:                                                             │
│    {success, output_file_id, output_filename, output_dir, output_path,   │
│     inquiry_file_id, inquiry_filename, inquiry_path, statistics,         │
│     center_images, matrix_applied, matrix_data, analysis,               │
│     image_source: {mode, image_count}}                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 10.5 报价生成流程 — 日语组

```
POST /api/generate {bom_file_id, matrix_file_id, group='日语组', ...}
  → quotation_service.py :: generate_quotation_db_only()

┌─────────────────────────────────────────────────────────────────────────┐
│ 步骤 1: 解析信息表（日语组专用）                                          │
│  → core/ja/matrix_parser.py :: extract_matrix_data(matrix_file)          │
│    → _find_target_sheet()                                                │
│      → 查找含 '架台設計情報' 的 sheet 名称                               │
│      → 回退: 扫描前 5 行含 '架台'+'設計' 的 sheet                        │
│    → read_excel_compat(filepath, sheet_name, header=None)                │
│                                                                         │
│    → _extract_project_name(df)                                           │
│      → 扫描 Row 2, 查找含 'N<number> ' 的文本                           │
│      → 正则: N\d+\s+(.+?)(?:\s*-\s*\d+.*KW)?                           │
│      → 回退: _extract_project_name_from_filename()                       │
│                                                                         │
│    → _extract_output_kw(df)                                              │
│      → Row 2 查找含 'KW' 的文本                                         │
│      → 或 Row 2 中 0.1~10000 的数值                                     │
│                                                                         │
│    → _extract_arrays(df)                                                 │
│      → 扫描 Row 10~16, 查找含 '段' 的行                                  │
│      → 从该行提取:                                                       │
│        - 段数(rows): '段' 左侧或右侧的数字                                │
│        - 列数(cols): '列' 左侧或右侧的数字                                │
│        - 基数(table_qty): col 6~9 中的 1~9999 数字                      │
│        - 总板数(modules): col 9~10 中的数字                              │
│      → 支持多阵列（每行一个阵列配置）                                     │
│      → 返回 arrays = [{no, rows, cols, table_qty, modules, note}, ...]   │
│                                                                         │
│    → _extract_wind_speed(df): Row 3 查找 '風速' → "数字 m/s"            │
│    → _extract_snow_load(df): Row 4 查找 '積雪' → "数字 cm"              │
│    → _extract_angle(df): Row 5 查找 '角度' → "数字°"                    │
│    → _extract_ground_height(df): Row 6 查找 '离地高' → "数字 mm"         │
│    → _extract_panel_wattage(df): Row 7 查找 'W/' → 数字                 │
│    → _extract_panel_size(df): Row 9 查找 '数字*数字*数字'                │
│    → _extract_panel_spec(df): Row 1 查找 '型号 数字W'                    │
│    → _extract_panel_weight(df): Row 7 查找 'kg' → 数字                  │
│                                                                         │
│    → 返回 matrix_data = {                                                │
│        project_name, output_kw, output_wp, set_count=len(arrays),        │
│        array_rows=arrays[0].rows, array_cols=arrays[0].cols,             │
│        max_wind_speed, max_snow_load, module_wattage, module_size,       │
│        angle, ground_height, panel_spec, panel_weight,                   │
│        arrays, total_modules                                             │
│      }                                                                  │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 步骤 2: BOM 解析（单次预解析，避免重复读取）                               │
│  → ja/quotation_builder.py :: _build_products_by_key()                   │
│    → 复用韩语的解析函数，但结果按 key 分组:                               │
│    → excel_file_compat() 打开 BOM                                        │
│    → quick_scan_bom_sheets() → discover_sheet_bom_starts()              │
│    → extract_bom_dataframe() → read_bom_from_dataframe()                │
│    → 返回 products_by_key = {bom_key: [products]}                        │
│           bom_info_by_key = {bom_key: bom_info}                          │
│                                                                         │
│  → 合并所有 products → all_products                                      │
│  → fetch_material_mapping(material_codes)  [同韩语]                       │
│  → build_bom_analysis(all_products, material_mapping)                    │
│  → 传递 pre_parsed_products + pre_parsed_bom_info 给步骤 4               │
│    → 避免在生成阶段再次读取 BOM 文件                                      │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 步骤 3: 图片准备（同韩语）                                                │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 步骤 4: 生成报价表（日语组专用）                                          │
│  → core/__init__.py 路由 → 日语组使用:                                   │
│  → ja/quotation_builder.py :: split_and_create_quotations()              │
│                                                                         │
│    4a. 使用 pre_parsed_products（跳过 BOM 文件读取）                      │
│                                                                         │
│    4b. 阵列匹配                                                          │
│      → find_matching_array(bom_rows, bom_cols)                           │
│        → 遍历 matrix_data.arrays                                         │
│        → 使用 used_array_indices 确保每个阵列只匹配一次（有序消费）       │
│        → BOM 的 rows×cols 与 array 的 rows×cols 完全匹配才选中           │
│                                                                         │
│    4c. 对每个匹配的 BOM 生成明细 Sheet                                    │
│      → ja/quotation_engine.py :: create_detail_sheet()                   │
│                                                                         │
│        ═══ Sheet 布局（日语 8 列）═══                                    │
│                                                                         │
│        Row 1: 项目名（A1:H1 合并, Meiryo UI 20号加粗, 粗黑边框）         │
│        Row 2: A2=阵列标签（如"4段2列"）, E2='セット数', G2=セット数      │
│        Row 3: 空行（高 5px）                                             │
│        Row 4: 表头行（粗黑边框, 浅蓝背景 D9E1F2）                        │
│          A=序号  B=品名  C=材質  D=写真  E=規格                          │
│          F=単価\n（USD）  G=数量\n（PCS)  H=総金額\n（USD）              │
│          列宽: A=5, B=10, C=10, D=15, E=10, F=10, G=8, H=15             │
│                                                                         │
│        Row 5+: 数据行（每行高 60px）                                     │
│          → 品名显示优先级: name_ja > name_ko > name > BOM原名            │
│          → 价格计算: 同韩语（米计价 vs 个计价）                           │
│          → 数量为 0 或空的行: 不跳过，正常填入                            │
│          → 未匹配价格的行: 8 列全部黄色背景                               │
│          → 未匹配产品收集到 unmatched_products_out                        │
│                                                                         │
│        图片插入                                                          │
│          → 图片自适应单元格大小 (fit_image_to_cell)                       │
│            → 计算可用空间 = 单元格宽高 - 2px padding                     │
│            → 缩放比例 = min(avail_w/img_w, avail_h/img_h, 1.0)         │
│          → 默认图片尺寸 70×50px                                          │
│          → 居中插入到 D 列                                               │
│          → 无图片填 "/"                                                  │
│                                                                         │
│        小计行                                                            │
│          → A{end}:G{end} 合并 = 'SUB-TOTAL-（FOB）1基スクリュー杭基礎架台合計'│
│          → H{end} = total_price_sum（USD 格式）                          │
│                                                                         │
│        返回 {sheet_name, array_info, total_price_per_base, total_price,  │
│               matched_count, unmatched_count}                            │
│                                                                         │
│    4d. 生成汇总表（合計シート）                                           │
│      → ja/quotation_engine.py :: create_summary_sheet()                  │
│                                                                         │
│        ═══ 汇总表布局（48 行动态模板）═══                                 │
│                                                                         │
│        Block A: 基本信息 (Row 1-9)                                       │
│          R1: 見積日（公式）                                              │
│          R2: 架台御見積書（标题，Meiryo UI 22号加粗）                     │
│          R3: 案件名: {project_name} + 発電量(KW)                         │
│          R4: 見積条件:                                                   │
│          R5: 納入期限: 発注後10-14日間後工場から出荷                       │
│          R6: 取引条件: 取引基本契約書に基づく                             │
│          R7: 有効期限: 御見積後2日間                                      │
│          R8: ※風速/パネル高さ/パネルサイズ                                │
│          R9: ※積雪/傾斜角度/発電量/PC                                     │
│                                                                         │
│        Block B: 架台本体金額 (Row 10-17)                                 │
│          R10: 一、架台本体金額（Ex Works）                                │
│          R11: 表头 - 序号/パネル数/セット数/備考/発電量/単価/特別値引/総金額/W単価│
│          R12+: 每个阵列一行                                              │
│            → panel_count = rows × cols                                   │
│            → gen_kw = panel_count × base_count × module_wattage / 1000  │
│            → per_base = detail.total_price_per_base                      │
│            → special_price = per_base × 0.71（默认折扣率）               │
│            → total_amount = special_price × base_count                   │
│            → w_unit_price = special_price / (panel_count × wattage)      │
│          → 架台総金額 = Σ(total_amount)                                  │
│          → 発電量(KW) / ワットあたりの価格                                │
│                                                                         │
│        Block C: フェンス金額 (Row 22-29)                                 │
│          → 通常2000mm + 単価/数量/金額                                   │
│          → フェンス明细表（5行空行，待填充）                              │
│          → 追加諸係り + 総金額                                           │
│                                                                         │
│        Block D: 運賃 (Row 31-46)                                         │
│          → 為替レート（USD/JPY）                                         │
│          → 架台+杭 関税 1.6%（H.S.code 7610.90）                         │
│          → 架台+杭 消費税 10%                                            │
│          → フェンス税金 10%                                              │
│          → 混載便 / 4Tユニック+4T平車 配送                               │
│          → ①+②+③+④+⑤ 総金額(USD)                                      │
│          → 請求金額                                                      │
│                                                                         │
│        Block E: DDP 詳細 (Row 40-48)                                     │
│          → ①架台本体一式価格                                             │
│          → ②DDP現地配送費                                                │
│          → ③小計 = ①+②                                                 │
│          → ④消費税10% = ③ × 10%                                         │
│          → ⑤合計(税込み) = ③+④                                         │
│          → レートウェッブ / 原材料ウェッブ 参考链接                       │
│                                                                         │
│        → _apply_outer_border() 统一设置粗边框                             │
│        → 合計シート移至工作簿首位                                        │
│                                                                         │
│    4e. 生成询价表（复用韩语 create_inquiry_sheet）                        │
│    4f. 保存为 {BOM文件名}_見積汇总.xlsx                                   │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 步骤 5: 后处理（同韩语）                                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 10.6 报价生成流程 — 英语组

```
POST /api/generate {bom_file_id, matrix_file_id, group='英语组', ...}
  → quotation_service.py :: generate_quotation_db_only()

┌─────────────────────────────────────────────────────────────────────────┐
│ 步骤 1: 解析信息表（英语组专用）                                          │
│  → core/en/matrix_parser.py :: extract_matrix_data(matrix_file)          │
│    → 读取第一个 Sheet（通常名为 '瓦屋顶'）                                │
│    → 固定行号+标签关键词提取字段：                                         │
│      → Row 4: A4 含 'Project Name' → B4 为 project_name                 │
│      → Row 7: B7 含 'Max Wind Speed' → C7 提取数值 → max_wind_speed    │
│      → Row 8: B8 含 'Max Snow Load' → C8 提取数值 → max_snow_load      │
│      → Row 9: B9 含 'Power' → C9 为 module_wattage                      │
│      → Row 10: B10 含 'Size' → C10 为 module_size                       │
│      → Row 12: B12 含 'Installation Angle' → E12 为 angle               │
│      → Row 14+: 阵列数据表                                                │
│        → E 列: No. (如 '1#'), F 列: Row/Table, G 列: Column/Table       │
│        → H 列: Tables (基数)                                              │
│        → 逐行读取直到 H 列为空                                            │
│    → 返回 matrix_data = {                                                 │
│        project_name, output_kw=None, output_wp=None,                     │
│        set_count=len(arrays), array_rows, array_cols,                    │
│        max_wind_speed, max_snow_load, module_wattage, module_size,       │
│        angle, arrays=[{no, rows, cols, table_qty}],                      │
│      }                                                                   │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 步骤 2: BOM 解析 + 数据库价格匹配（复用韩语 BOM 解析器）                    │
│  → build_bom_material_context(bom_file, selected_bom_keys, group='英语组')│
│    → collect_bom_products()  ← 复用韩语 BOM 解析器                       │
│    → fetch_material_mapping(codes, group='英语组')                        │
│      → fetch_material_rows(codes, price_column='10u大氧化(美元)--组装')  │
│         → SQL SELECT 含 10u大氧化 列 + name_en 列                        │
│    → auto_register_missing_codes()  ← 自动补录缺失编码                   │
│    → build_bom_analysis()                                                │
│    → LRU 缓存（key 含 group 参数，区分韩语/英语缓存）                      │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 步骤 3: 图片准备（同韩语）                                                │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 步骤 4: 生成报价表（英语组专用）                                          │
│  → core/__init__.py 路由 → 英语组使用:                                   │
│  → en/quotation_builder.py :: split_and_create_quotations()              │
│                                                                         │
│    4a. 图片预扫描 + code_to_images 构建（同韩语）                          │
│    4b. 使用 price_mapping_override（已含英语组价格列数据）                  │
│    4c. BOM 解析（复用韩语解析器，与日语组相同的单次解析模式）               │
│    4d. 阵列匹配                                                          │
│      → find_matching_array(bom_rows, bom_cols)                           │
│      → 按 rows×cols 匹配 matrix_data 中的 array                          │
│                                                                         │
│    4e. 对每个匹配的 BOM 生成明细 Sheet                                    │
│      → en/quotation_engine.py :: create_detail_sheet()                   │
│                                                                         │
│        ═══ Sheet 布局（英语 9 列）═══                                    │
│                                                                         │
│        Row 1: A1:I1 合并 = 'Ballast Bracket Products list'               │
│               (Arial 16 bold, 居中, 行高 30)                             │
│        Row 2-4: 头部信息区                                                │
│          A2:B4 合并 → Logo (120×60px)                                    │
│          C2='Sales :', D2='Installation Angle', E2=angle+'°'            │
│          F2='Panel size', G2:H2 合并 = panel_size                        │
│          I2:I5 合并 = '10 years warranty / 20 years service life'        │
│          C3='Mob:', D3='Max Wind Load', E3=wind_speed                    │
│          F3='WATT/PCS', G3:H3 合并 = wattage + 'Wp'                     │
│          C4='Tel:', D4='Max Snow Load', E4=snow_load                     │
│          F4='Total Watt', G4:H4 合并 = rows×cols×wattage×tables          │
│          C5='Array', D5=rows, E5=cols, F5='Tables', G5:H5=table_qty     │
│        Row 6: 空分隔行（高 3px）                                         │
│        Row 7: 表头行（浅蓝填充 D9E1F2, Arial 8 bold, 居中, 行高 30）      │
│          A=Item No.  B=Product Name  C=Material  D=Picture               │
│          E=Spec.  F=Price/pcs  G=QTY(PCS)  H=Total amount  I=Remark     │
│        Row 8: 空分隔行（高 3px）                                         │
│        Row 9+: 数据行（每行高 35px）                                     │
│          → 品名优先级: name_en > name_ko > name > BOM原名                │
│          → 价格计算: 同韩语（米计价 vs 个计价）                           │
│          → 单价来源: 10u大氧化(美元)--组装 列                             │
│          → 数字格式: "US$" #,##0.00                                      │
│          → 未匹配价格的行: A-I 全部黄色背景                               │
│          → 图片: 70×50px, 居中插入 D 列, 无图填 "/"                      │
│                                                                         │
│        汇总区域（数据行结束后）：                                          │
│          → TOTAL AMOUNT/TABLE = SUM(H数据区)                             │
│          → TOTAL AMOUNT {N} TABLES = 单基总价 × table_qty                │
│          → EXW DISCOUNTED Price（预留折扣行）                             │
│          → GET ANOTHER 3% DISCOUNT（预留折扣行）                          │
│          → 100 TABLES / FOB XIAMEN COST / TOTAL AMOUNT                   │
│                                                                         │
│    4f. 生成汇总表（Quotation Sheet）                                      │
│      → en/quotation_engine.py :: create_summary_sheet()                  │
│                                                                         │
│        ═══ 汇总表布局（27 行模板, 11 列 A-K）═══                          │
│                                                                         │
│        模块 1 (Row 1-13): 项目头部                                        │
│          R2: J2='DATE：', K2=TODAY()                                     │
│          R3: A3:K3 合并 = 'Solar PV Mounting System Quotation' (16 bold) │
│          R4-5: G4:K6 合并 → Logo 图片                                    │
│          R6: A6='Project:', B6:E6 = project_name                         │
│          R7: A7='Price Term：', B7:E7='FOB'                              │
│          R8: A8='Delivery time：', B8:E8='2-3 Weeks...'                  │
│          R9: A9='Payment Term:', B9:E9='T/T 100%...'                    │
│          R10: A10='Validity Date:', B10:E10='14 days'                    │
│          R11: A11='TOTAL AMOUNT', B11:E11 = 总金额                       │
│          R12: A12='Unite Price/W:', B12:E12 = 每瓦单价                   │
│          外框: Row 1-13 粗黑边框                                          │
│                                                                         │
│        模块 2 (Row 14-21): Part 1 架台本体                                │
│          R14: A14:K14 = 'Part 1: Solar Mounting System' (10 bold)        │
│          R15: 表头（浅蓝填充, 10 bold）                                   │
│            A=Roof Name. B=Row C=Column D-E=Angle                         │
│            F=Table G-H=Power(kW) I-J=Price(USD/Table) K=Amount(USD)      │
│          R16+: 每个阵列一行数据                                           │
│          R17+: 汇总行                                                     │
│            EXW Price / EXW Discount Price / per/w                        │
│          外框: Row 14-21 粗黑边框                                         │
│                                                                         │
│        模块 3 (Row 22-27): Part 2 运费                                    │
│          R22: A22:K22 = 'Part 2: Freight &insurance' (10 bold)           │
│          R23: 表头 Destination Port / Container / Quantity / Price       │
│          R24: 空数据行（待人工填写）                                      │
│          R25: CIF Total Amount（红色加粗, 黄色背景）                      │
│          R27: 'Please kindly check...' (蓝色斜体)                         │
│          外框: Row 22-27 粗黑边框                                         │
│                                                                         │
│        → 移至工作簿首位                                                   │
│                                                                         │
│    4g. 生成询价表（复用韩语 create_inquiry_sheet）                        │
│    4h. 保存为 {BOM文件名}_Quotation.xlsx                                  │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 步骤 5: 后处理（同韩语）                                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 10.7 韩语组 vs 日语组 vs 英语组关键差异对比

| 环节 | 韩语组 | 日语组 | 英语组 |
|------|--------|--------|--------|
| **信息表格式** | `.xlsx` (openpyxl/pandas) | `.xls` (xlrd)，固定位置解析 | `.xlsx` (openpyxl)，固定行号+标签匹配 |
| **信息表 Sheet 查找** | 关键词扫描 '등록표/발주표/솔라' | 关键词 '架台設計情報' | 读取第一个 Sheet |
| **信息表字段提取** | 关键词右侧搜索（灵活位置） | 固定行号+列号（Row 3~9） | 固定行号+标签关键词（Row 4~14） |
| **阵列格式** | 支持单阵列和多阵列表格格式 | 多阵列，每行一个（段×列） | 多阵列，每行一个（Row×Column×Tables） |
| **项目名提取** | '프로젝트' 标签右侧 | Row 2 正则匹配 'N\d+ ...'，回退文件名 | Row 4 B4 'Project Name' 右侧 |
| **BOM 解析** | 独立解析器（2次） | 复用韩语解析器（1次预解析） | 复用韩语解析器（同日语模式） |
| **缓存** | LRU 8 条缓存（key 含 group） | 无缓存（单次解析无需） | LRU 8 条缓存（key 含 group） |
| **明细表列数** | 10 列（含重量 I、编码 J） | 8 列 | **9 列**（含 Remark I） |
| **明细表字体** | Malgun Gothic 16号 | Meiryo UI 11号 | **Arial 8号** |
| **明细表标题** | 36号，2行高 | 20号加粗，1行高，粗黑边框 | 16号加粗，居中 |
| **明细表图片** | 120×80px 固定 | 70×50px 自适应单元格 | 70×50px 居中插入 |
| **品名优先级** | name_ko > name > BOM名 | name_ja > name_ko > name > BOM名 | **name_en** > name_ko > name > BOM名 |
| **数量过滤** | 删除空重量行 + 重新编号 | 不做额外过滤 | 不做额外过滤 |
| **小计行标签** | SUB-TOTAL AMOUNT/TABLE | SUB-TOTAL-(FOB) 1基スクリュー杭基礎架台合計 | TOTAL AMOUNT/TABLE |
| **汇总表** | 견적서（Logo+项目信息+Part1架台+Part2运费） | 合計（48行：架台本体+折扣0.71+フェンス+DDP） | Quotation（27行：Part1架台+Part2运费，3个粗黑外框模块） |
| **折扣** | 无折扣 | 默认折扣率 0.71 | 无折扣（预留折扣行位置） |
| **关税/消费税** | 不在汇总表中计算 | 関税 1.6% + 消費税 10% + DDP | 不在汇总表中计算（CIF 行待人工填写） |
| **输出文件名** | `{BOM}_报价汇总.xlsx` | `{BOM}_見積汇总.xlsx` | `{BOM}_Quotation.xlsx` |
| **价格列** | `10u小氧化(美元)--组装` | `10u小氧化(美元)--组装`（相同） | **`10u大氧化(美元)--组装`** |

---

### 10.7 铝价数据库管理流程

```
/api/aluminum/* → aluminum_service.py → material_repository.py (SQLite)

┌─────────────────────────────────────────────────────────────────────────┐
│ 列表查询 GET /api/aluminum/list?page=1&page_size=20&search=ALU          │
│  → get_aluminum_list(request.args)                                      │
│    → list_aluminum_records(page, page_size, search)                     │
│      → build_list_where_clause(): LIKE 搜索 编码/品名/韩语品名/规格     │
│      → SQL: SELECT ... FROM aluminum_pricing WHERE ... ORDER BY 工程编码│
│      → 返回 {data, total, page, page_size, total_pages}                 │
│    → normalize_record_keys(): DB列名 → API列名                          │
│    → normalize_image_fields(): 图片base64标准化                          │
│      → decode_image_base64() 验证有效性                                 │
│      → 统一为 data:image/<ext>;base64,... 格式                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 单条查询 GET /api/aluminum/<record_id>                                   │
│  → get_aluminum_by_id(record_id)                                        │
│    → SELECT * WHERE 工程编码 = record_id                                 │
│    → normalize_record_keys() + normalize_image_fields()                 │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 新增 POST /api/aluminum/create {code, name, price, unit, ...}           │
│  → create_aluminum(data, role)                                          │
│    → 校验: 工程编码必填，检查是否重复                                    │
│    → API字段名 → DB字段名转换 (to_db_field_name)                        │
│    → INSERT INTO aluminum_pricing (...) VALUES (...)                     │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 修改 PUT /api/aluminum/<record_id> {code, name, price, ...}             │
│  → update_aluminum(record_id, data, role)                                │
│    → 检查记录是否存在                                                    │
│    → UPDATE aluminum_pricing SET ... WHERE 工程编码 = ?                  │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 删除 DELETE /api/aluminum/<record_id>                                    │
│  → delete_aluminum(record_id, role)                                     │
│    → 检查记录是否存在                                                    │
│    → DELETE FROM aluminum_pricing WHERE 工程编码 = ?                     │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 图片导入 POST /api/aluminum/images/import (多文件或 Excel)               │
│  → 判断文件类型:                                                         │
│    → .xlsx/.xls → import_aluminum_images_from_excel()                   │
│      → 读取 Excel A列=图片, B列=编码                                    │
│      → 图片单元格提取为 base64                                           │
│    → 其他 → import_aluminum_images(files)                                │
│      → 文件名提取编码 (extract_code_from_filename)                       │
│      → 读取文件 → base64 编码                                            │
│  → bulk_update_aluminum_images([{code, image_base64}, ...])              │
│    → UPDATE SET 图片_base64=?, 图片=? WHERE 工程编码=?                   │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 图片导出 GET /api/aluminum/images/export                                 │
│  → export_aluminum_images()                                              │
│    → list_all_aluminum_image_records() 获取所有有图片的记录              │
│    → 逐条 decode_image_base64() → 写入 zip 文件                         │
│    → 返回 zip 下载                                                       │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 批量价格更新 POST /api/aluminum/prices/batch-update (Excel 文件)         │
│  → batch_update_prices_from_excel(file)                                  │
│    → 读取 Excel，查找「工程编码」和价格列                                │
│    → 逐行 UPDATE SET 价格 WHERE 工程编码=?                               │
│    → 返回 {success_count, fail_count, failed_items}                      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 数据库下载 GET /api/aluminum/database/download                           │
│  → download_aluminum_database()                                          │
│    → list_all_aluminum_records_raw() 获取全部记录                        │
│    → 生成 Excel（含图片预览列和图片状态列）                               │
│    → 返回文件下载                                                        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 缺失编码自动入库（BOM 解析时自动触发）                                    │
│  → auto_create_missing_records(missing_items)                            │
│    → 输入: [{code, name, spec}, ...] BOM 中存在但数据库中不存在的编码      │
│    → INSERT OR IGNORE INTO aluminum_pricing (工程编码, 工程品名, 规格说明)│
│    → 只填充 3 个字段，其余为空（价格/图片/单位待人工补全）                  │
│    → 一个连接、一次 commit，已存在的编码自动跳过                           │
│  → 触发时机: build_bom_material_context() 中                              │
│    fetch_material_mapping() 之后、build_bom_analysis() 之前               │
│  → 自动补录后:                                                            │
│    → 重新加载 material_mapping（包含新骨架记录）                           │
│    → 新记录 price=None → 报价表标黄 + 自动加入询价表                      │
│    → 新记录 image 为空 → 自动加入缺图列表                                 │
│    → 物料管理页面可搜索到新记录，支持人工补全价格和图片                    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 变更申请流程                                                             │
│                                                                         │
│  提交: POST /api/aluminum/change-requests                               │
│    → submit_aluminum_change_request(data, user, role)                    │
│      → action: create/update/delete                                     │
│      → 记录原始数据快照 (snapshot_json)                                  │
│      → INSERT INTO aluminum_change_requests (status='pending')          │
│                                                                         │
│  列表: GET /api/aluminum/change-requests                                │
│    → 按状态排序: pending → approved → rejected → withdrawn               │
│    → 按提交时间倒序                                                      │
│                                                                         │
│  审批: POST /api/aluminum/change-requests/<id>/approve                  │
│    → 获取申请记录                                                        │
│    → 执行实际数据库操作（创建/更新/删除）                                 │
│    → UPDATE status='approved', reviewed_by, reviewed_at                  │
│                                                                         │
│  拒绝: POST /api/aluminum/change-requests/<id>/reject                   │
│    → UPDATE status='rejected', review_note                              │
│                                                                         │
│  撤回: POST /api/aluminum/change-requests/<id>/withdraw                 │
│    → 仅申请人自己可撤回                                                  │
│    → UPDATE status='withdrawn'                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 10.8 问答系统流程

```
/api/questions/* → question_service.py → question_repository.py

┌─────────────────────────────────────────────────────────────────────────┐
│ 提交问题 POST /api/questions {title, content, category}                  │
│  → submit_question(data, actor_user, actor_role)                         │
│    → 校验: title 和 content 不能为空                                     │
│    → create_question() → INSERT INTO questions                          │
│    → 返回 {success, question_id}                                        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 问题列表 GET /api/questions                                              │
│  → get_question_list(args, role, user)                                   │
│    → admin: 看到所有问题                                                 │
│    → 其他角色: 只看到自己提交的问题                                      │
│    → 按状态排序: pending → answered → closed                             │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 回复问题 POST /api/questions/<id>/reply {content}                        │
│  → reply_question(id, data, role, user)                                  │
│    → ensure_admin_role(): 仅管理员可回复                                 │
│    → update_question_reply() → UPDATE reply, status='answered'          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 关闭问题 POST /api/questions/<id>/close                                  │
│  → close_question_item(id, role, user)                                   │
│    → ensure_admin_role(): 仅管理员可关闭                                 │
│    → UPDATE status='closed'                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 10.9 CAD 阵列识别助手流程

```
/api/cad-assistant/* → cad_assistant_service.py

┌─────────────────────────────────────────────────────────────────────────┐
│ 技术架构                                                                 │
│  → 会话存储: 内存字典 _SESSIONS (线程锁保护)                              │
│  → 会话 TTL: 12 小时                                                     │
│  → 历史消息上限: 8 条                                                    │
│  → AI 后端: SiliconFlow API (VLM 视觉语言模型)                           │
│  → 默认模型: Pro/moonshotai/Kimi-K2.5                                   │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 创建会话 POST /api/cad-assistant/sessions (上传图纸文件)                  │
│  → create_cad_session(file)                                              │
│    → 校验文件扩展名: png/jpg/jpeg/webp/bmp/dxf/txt/csv/dwg/pdf          │
│    → 生成 session_id (UUID)                                              │
│    → 保存文件到 uploads/cad_assistant/                                   │
│    → 图片类文件:                                                         │
│      → base64.b64encode() 编码                                          │
│      → 构建消息: [{type: "image_url", image_url: {url: "data:image/..."}}]│
│    → DXF 文件:                                                           │
│      → 解析 DXF 结构（最多 120000 对）                                   │
│      → 提取线段/圆/弧/文字实体摘要                                       │
│      → 截断到 MAX_TEXT_CHARS=12000 字符                                  │
│      → 构建文本消息                                                      │
│    → DWG/PDF:                                                            │
│      → 提示用户"不支持直接解析，请截图后上传"                              │
│    → 调用 SiliconFlow API:                                               │
│      → system prompt: "你是 CAD 阵列识别助手..."                         │
│      → messages: [{role: "user", content: [图片/文本]}]                  │
│      → POST API_URL with Authorization: Bearer API_KEY                   │
│    → 存储会话:                                                           │
│      → _SESSIONS[session_id] = {                                         │
│           created_at, file_info, history, messages, session_id           │
│         }                                                                │
│    → 返回 {session_id, reply: AI分析结果}                                │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 对话 POST /api/cad-assistant/chat {session_id, message}                  │
│  → chat_with_cad_session(data)                                           │
│    → 查找会话 → 追加用户消息到 history                                   │
│    → 保持最近 MAX_HISTORY_MESSAGES=8 条                                  │
│    → 调用 SiliconFlow API（含完整历史）                                   │
│    → 追加 AI 回复到 history                                              │
│    → 返回 {reply: AI回复}                                                │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 删除会话 DELETE /api/cad-assistant/sessions/<session_id>                 │
│  → delete_cad_session(session_id)                                        │
│    → 从 _SESSIONS 中移除                                                 │
│    → 清理上传的文件                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 10.10 文件清理流程

```
POST /api/cleanup {file_ids: ["uuid1", "uuid2", ...]}
  → cleanup_service.py :: cleanup_upload_files(data)
    → cleanup_files_by_ids(file_ids)
      → 遍历 file_ids
      → 在 uploads/ 目录下查找匹配文件（file_id.ext 或 file_id_*）
      → 删除文件
    → 返回 {success, message: "已清理 N 个临时文件"}
```

---

### 10.11 阵列匹配与校验流程

#### 10.11.1 概述

当信息表包含多个阵列配置、BOM文件包含多个小BOM表时，系统需要自动匹配两者的对应关系，并用BOM中的基数（`阵列基数`）作为汇总表的基数，而不是信息表中单个阵列条目的基数。

核心原则：**BOM是物料数据的权威来源，信息表是校验和补充元数据的来源。**

#### 10.11.2 数据解析

**信息表解析**（`matrix_parser.py`）：

读取信息表阵列区每一行，提取：
- `rows × cols` — 阵列尺寸（如 2×10）
- `base_count` — 基数（如 4）
- `missing_per_table` — 单基缺板数（计算方式：`|缺板原始值| ÷ 基数`）

缺板识别方式：
1. 先找表头含"缺板"的列
2. 没找到则看 Modules Qty 列，值为负数时即为缺板（如 -24 → 缺板24块）

**BOM表解析**（`quotation_engine.py`）：

对每个小BOM表头，通过 `CONFIG_FIELD_RULES` 锚点定位规则提取：
- `array` — 阵列尺寸（如 `2×10`），锚点关键词 `阵列`
- `missing_boards` — 缺板数（如 6），锚点关键词 `缺板数`
- `base_count` — 阵列基数（如 13），锚点关键词 `阵列基数`

#### 10.11.3 匹配流程

```
┌─────────────────────────────────────────────────────────────────────┐
│ 步骤1：解析信息表所有阵列行                                          │
│  → matrix_parser.py :: _parse_multi_arrays()                        │
│  → 每个阵列行: {no, rows, cols, base_count, missing_per_table}      │
│                                                                     │
│  示例（测试5）：                                                     │
│    1#: 2×10  基数=4  缺板原始值=-24  → 单基缺板=6                    │
│    2#: 2×10  基数=4  缺板原始值=-24  → 单基缺板=6                    │
│    3#: 2×10  基数=4  缺板原始值=-24  → 单基缺板=6                    │
│    4#: 2×10  基数=1  无缺板         → 单基缺板=0                     │
│    5#: 2×10  基数=1  缺板原始值=-6   → 单基缺板=6                    │
│    6#: 2×6   基数=4  无缺板         → 单基缺板=0                     │
│    7#: 2×4   基数=2  无缺板         → 单基缺板=0                     │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 步骤2：解析用户选中的BOM表头                                         │
│  → quotation_engine.py :: extract_config_info()                     │
│  → 只取 selected_bom_keys 对应的BOM（不取全部sheet的所有BOM）        │
│                                                                     │
│  示例（测试5，仅选中韩屋架台）：                                     │
│    BOM1: 2×10  缺板=6   基数=13                                     │
│    BOM2: 2×10  缺板=0   基数=1                                      │
│    BOM3: 2×6   缺板=0   基数=4                                      │
│    BOM4: 2×4   缺板=0   基数=2                                      │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 步骤3：校验匹配                                                     │
│  → array_validator.py :: validate_array_matching()                  │
│                                                                     │
│  3a. 信息表按 (rows×cols, missing_per_table) 分组，累加 base_count  │
│      key=(2×10, 6) → 1#+2#+3#+5# → Σ基数 = 4+4+4+1 = 13           │
│      key=(2×10, 0) → 4#           → Σ基数 = 1                      │
│      key=(2×6,  0) → 6#           → Σ基数 = 4                      │
│      key=(2×4,  0) → 7#           → Σ基数 = 2                      │
│                                                                     │
│  3b. BOM按 (array, missing_boards) 匹配                             │
│      (2×10, 6) → BOM1 基数=13 → 13==13 ✅                          │
│      (2×10, 0) → BOM2 基数=1  →  1==1  ✅                          │
│      (2×6,  0) → BOM3 基数=4  →  4==4  ✅                          │
│      (2×4,  0) → BOM4 基数=2  →  2==2  ✅                          │
│                                                                     │
│  3c. 不匹配时生成警告（不阻断生成）                                  │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 步骤4：报价生成时的BOM-阵列匹配                                      │
│  → quotation_engine.py :: find_matching_matrix_array()              │
│  → 按 (rows×cols, bom_missing) 精确匹配                             │
│  → 缺板不匹配时回退到只按尺寸匹配                                    │
│                                                                     │
│  BOM1(2×10,缺板6) → 匹配信息表1#                                    │
│  BOM2(2×10,缺板0) → 匹配信息表4#                                    │
│  BOM3(2×6,缺板0)  → 匹配信息表6#                                    │
│  BOM4(2×4,缺板0)  → 匹配信息表7#                                    │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 步骤5：汇总表基数来源                                                │
│  → quotation_engine.py :: build_bom_matrix_data()                   │
│  → set_count = BOM的base_count（优先）> 信息表的table_qty（回退）   │
│                                                                     │
│  汇总表每行 = 一个BOM表，基数列使用BOM的 base_count：                │
│  ┌──────────┬──────┬──────┬─────────┬───────────┬────────────┐     │
│  │ BOM表    │ 阵列 │ 缺板 │ BOM基数 │ 信息表阵列 │ 信息表合计 │     │
│  ├──────────┼──────┼──────┼─────────┼───────────┼────────────┤     │
│  │ 韩屋BOM1 │ 2×10 │ 6    │ 13      │ 1#,2#,3#,5#│ 13 ✅     │     │
│  │ 韩屋BOM2 │ 2×10 │ 0    │ 1       │ 4#         │ 1  ✅     │     │
│  │ 韩屋BOM3 │ 2×6  │ 0    │ 4       │ 6#         │ 4  ✅     │     │
│  │ 韩屋BOM4 │ 2×4  │ 0    │ 2       │ 7#         │ 2  ✅     │     │
│  └──────────┴──────┴──────┴─────────┴───────────┴────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 步骤6：前端展示                                                      │
│  → quotation.js                                                     │
│  → 报价生成完成后，绿色表格展示匹配详情                               │
│  → 基数不一致的行黄色背景标记                                        │
│  → 警告信息（如BOM无匹配、基数不一致）单独黄色展示                    │
└─────────────────────────────────────────────────────────────────────┘
```

#### 10.11.4 警告触发条件

| 场景 | 示例 | 结果 |
|------|------|------|
| 信息表有阵列但BOM无匹配 | 信息表有 3×5 缺板=2，但BOM中没有 | ⚠️ 警告 |
| BOM有阵列但信息表无对应 | BOM有 4×9，但信息表未选中该sheet | ⚠️ 警告 |
| 基数不一致 | 信息表Σ=11，BOM=13，差异=2 | ⚠️ 警告（仍生成报价） |
| 基数完全一致 | 信息表Σ=13，BOM=13 | ✅ 无警告 |
| 信息表无阵列数据 | 纯BOM模式，无信息表 | 跳过校验 |

#### 10.11.5 相关文件

| 文件 | 作用 |
|------|------|
| `backend/core/array_validator.py` | 阵列校验：按(行×列,缺板)分组匹配，返回警告+匹配详情 |
| `backend/core/matrix_parser.py` | 信息表解析：提取每个阵列行的基数和缺板 |
| `backend/core/quotation_engine.py` | BOM config解析：提取缺板数和阵列基数；匹配+汇总 |
| `backend/services/quotation_service.py` | 编排：调用校验，传递结果给前端 |
| `frontend/js/pages/quotation.js` | 前端展示匹配详情表格和警告 |

---

## 十一、核心文件清单

| 文件 | 作用 | 语言组 | 代码行数 |
|------|------|--------|---------|
| `backend/app.py` | Flask 应用入口，注册所有 Blueprint | 共用 | ~50 |
| `backend/serve.py` | Waitress 生产服务器启动 | 共用 | ~80 |
| `backend/config/settings.py` | 全局配置（路径、密钥、环境变量） | 共用 | ~76 |
| `backend/services/quotation_service.py` | 报价生成入口：参数校验、调度、文件管理 | 共用 | ~220 |
| `backend/core/__init__.py` | 路由分发：按 group 转发到韩语/日语/英语模块 | 共用 | ~26 |
| `backend/core/quotation_engine.py` | **韩语报价引擎**（BOM解析+明细表+汇总表+询价表） | 韩语 | ~3290 |
| `backend/core/quotation_builder.py` | 韩语报价构建器（薄封装 quotation_engine） | 韩语 | ~22 |
| `backend/core/matrix_parser.py` | 韩语信息表解析（关键词搜索） | 韩语 | ~355 |
| `backend/core/material_matcher.py` | BOM 物料匹配 + 数据库查询 + LRU 缓存 + 缺失编码自动补录 | 共用 | ~211 |
| `backend/core/bom_parser.py` | BOM 解析器（薄封装 quotation_engine） | 共用 | ~10 |
| `backend/core/statistics.py` | BOM 分析统计（匹配率/缺图/缺价） | 共用 | ~82 |
| `backend/core/array_validator.py` | 阵列校验：信息表分组Σ基数 vs BOM基数匹配 | 共用 | ~100 |
| `backend/core/price_matcher.py` | 定价表解析与匹配 | 共用 | ~100 |
| `backend/core/ja/matrix_parser.py` | 日语信息表解析（.xls, xlrd, 固定位置） | 日语 | ~405 |
| `backend/core/ja/quotation_engine.py` | 日语明细表 + 48行汇总表生成 | 日语 | ~838 |
| `backend/core/ja/quotation_builder.py` | 日语报价构建器（单次解析+组装） | 日语 | ~266 |
| `backend/core/en/matrix_parser.py` | 英语信息表解析（固定行号+标签匹配） | 英语 | ~130 |
| `backend/core/en/quotation_engine.py` | 英语明细表(9列) + 汇总表(27行3模块) | 英语 | ~530 |
| `backend/core/en/quotation_builder.py` | 英语报价构建器（复用韩语BOM解析） | 英语 | ~200 |
| `backend/repositories/material_repository.py` | 数据库操作（SQLite CRUD + 变更申请 + 缺失编码自动入库） | 共用 | ~633 |
| `backend/repositories/account_repository.py` | 账号数据库操作 | 共用 | ~200 |
| `backend/repositories/question_repository.py` | 问答数据库操作 | 共用 | ~120 |
| `backend/services/aluminum_service.py` | 铝价数据库管理（CRUD+导入导出+变更审批） | 共用 | ~1120 |
| `backend/services/auth_service.py` | 认证与账号管理 | 共用 | ~386 |
| `backend/services/cad_assistant_service.py` | CAD 阵列识别（SiliconFlow API 集成） | 共用 | ~589 |
| `backend/services/question_service.py` | 问答系统 | 共用 | ~143 |
| `backend/services/upload_service.py` | 文件上传处理 | 共用 | ~162 |
| `backend/services/analyze_service.py` | BOM 分析 | 共用 | ~56 |
| `backend/image/processor.py` | 图片处理（base64解码、格式检测） | 共用 | ~80 |
| `backend/image/matcher.py` | DB图片→临时文件映射 | 共用 | ~31 |
| `backend/image/inserter.py` | Excel图片居中插入 | 共用 | ~120 |
| `backend/utils/constants.py` | 常量（数据库列名、角色、权限、状态） | 共用 | ~64 |
| `backend/utils/converters.py` | 数据转换（编码标准化、价格解析、数值提取） | 共用 | ~150 |
| `backend/excel/reader.py` | Excel 兼容读取（.xlsx openpyxl / .xls xlrd） | 共用 | ~60 |

---

## 十二、价格计算规则详解

### 12.1 计价单位判定

系统从数据库 `aluminum_pricing` 表的 `计价单位` 列读取计价单位：

| 计价单位值 | 计价方式 | 计算公式 |
|-----------|---------|---------|
| `米` / `m` / `M` / `meter` / `Meter` / `METERS` / `meters` | **按米计价** | 总价 = 单价 × (长度mm ÷ 1000) × 数量 |
| `个` / `套` / `支` / `件` / `PCS` / `pcs` | **按个计价** | 总价 = 单价 × 数量 |
| 其他 / 空 | **按个计价**（默认） | 总价 = 单价 × 数量 |

### 12.2 规格长度提取

按米计价时，需要从 BOM 的 `规格` 字段提取长度（毫米）：

| 格式 | 示例 | 提取结果 |
|------|------|---------|
| `123mm` / `123 mm` | `1000mm` | 1000 |
| `123MM` / `123毫米` | `500MM` | 500 |
| `长度:123` / `长:123` | `长度:2000` | 2000 |
| `L=123` / `L:123` | `L=1500` | 1500 |
| `123米` / `123m` | `2米` | 2000 |
| 纯数字 | `1000` | 1000 |

如果长度提取失败，**降级为按个计价**，并在日志中警告。

### 12.3 重量计算规则

| 条件 | 计算公式 | 说明 |
|------|---------|------|
| 数量 ≤ 0 | 不计算 | 跳过 |
| 无数据库匹配 | BOM单重 × 数量 | 回退到 BOM 自带单重 |
| 有匹配但 db_weight 为空 | BOM单重 × 数量 | 回退 |
| code_attribute ∈ {A, F, TX} | db_weight × 数量 × (长度mm ÷ 1000) | **按长度计重** |
| 其他 code_attribute | db_weight × 数量 | 按个数计重 |

---

## 十三、数据流程图

```
┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────────┐
│  前端    │    │ API 层   │    │ Service  │    │  Core / Repo     │
│  SPA    │───>│ Blueprint │───>│  Layer   │───>│  Engine Layer    │
└─────────┘    └──────────┘    └──────────┘    └──────────────────┘
                                                      │
                                     ┌────────────────┼─────────────────┐
                                     │                │                 │
                                     ▼                ▼                 ▼
                               ┌──────────┐   ┌──────────┐      ┌──────────┐
                               │ BOM 解析  │   │ Matrix   │      │ SQLite   │
                               │ Engine   │   │ Parser   │      │ Database │
                               └──────────┘   └──────────┘      └──────────┘
                                     │                │                 │
                                     │                │                 │
                                     ▼                ▼                 ▼
                               ┌──────────────────────────────────────────────┐
                               │              报价生成引擎                      │
                               │  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
                               │  │ 韩语引擎  │  │ 日语引擎  │  │ 英语引擎  │  │
                               │  │ 10列明细  │  │ 8列明细   │  │ 9列明细   │  │
                               │  │ 견적서    │  │ 合計48行  │  │ Quotation │  │
                               │  └──────────┘  └──────────┘  └──────────┘  │
                               │  ┌──────────┐                               │
                               │  │ 共用模块  │                               │
                               │  │ 物料匹配  │                               │
                               │  │ 图片处理  │                               │
                               │  │ 询价表    │                               │
                               │  └──────────┘                               │
                               └──────────────────────────────────────────────┘
                                                 │
                                                 ▼
                                          ┌──────────┐
                                          │  Output   │
                                          │ 报价汇总  │
                                          │ .xlsx     │
                                          └──────────┘
```

---

## 十四、联系支持

如遇问题，请联系系统管理员。
