# 三组（日语/韩语/英语）报价生成速度优化

---

## 一、优化结果（实测数据）

### 基准测试文件：test34-bom.xlsx (6.3MB)

| 配置 | 优化前 | 优化后 | 提速倍数 |
|------|--------|--------|---------|
| **韩语组-NORMAL** | **43.08s** | **1.52s** | **28.3x** |
| 韩语组-KSD | 17.51s | 18.50s | ~1.0x |
| 韩语组-SIMPLE | 18.24s | 19.37s | ~1.0x |
| 日语组-EST | 2.47s | 2.21s | 1.1x |
| 日语组-NORMAL | 1.87s | 1.85s | ~1.0x |

### 第二测试文件：【BOM V1.0】架高防水车棚.xlsx (7.8MB) + 信息表 3×97×17

| 配置 | 优化后耗时 |
|------|-----------|
| 英语组 | 0.84s |
| 日语组 | 0.73s |
| 韩语组(ZIP) | 1.24s |

### 第三测试文件：uploads/ 6.3MB BOM (benchmark_speed.py 含预解析)

| 文件 (6.3MB) | 韩语-NORMAL | 日语-EST | 英语-SIMPLE |
|---|---|---|---|
| b53ae02b | 1.85s | 0.53s | 0.52s |
| fb4af2d1 | 1.80s | 0.55s | 0.53s |
| 891b680d | 2.97s | 0.75s | 0.75s |

### 韩语组-NORMAL 43s 瓶颈拆解

| 阶段 | 耗时 | 占比 | 优化措施 |
|------|------|------|---------|
| BOM 二次读取（引擎内） | ~17s | 36% | Phase 11：传递 bom_info 跳过二次读取 |
| BOM 三次读取（阵列校验） | ~27s | 60% | Phase 13：使用预解析 bom_info |
| 实际工作表创建+保存 | ~0.5s | 1% | 已是最优 |
| 服务层实际工作（BOM解析+物料+图片） | ~1.0s | 2% | 无法再优化 |

### 优化前各案件实测耗时

| 案件 | 文件大小 | 组别 | 优化前耗时 |
|------|---------|------|-----------|
| test34-bom.xlsx | 6.3MB | 韩语-NORMAL | 43.08s |
| test34-bom.xlsx | 6.3MB | 韩语-KSD | 17.51s |
| test34-bom.xlsx | 6.3MB | 韩语-SIMPLE | 18.24s |
| test34-bom.xlsx | 6.3MB | 日语-EST | 2.47s |
| test34-bom.xlsx | 6.3MB | 日语-NORMAL | 1.87s |
| 架高防水车棚.xlsx | 7.8MB | 韩语-NORMAL(无ZIP路径) | 21.26s |
| 架高防水车棚.xlsx | 7.8MB | 日语-EST(无预解析) | 19.73s |

### 优化后各案件实测耗时

| 案件 | 文件大小 | 组别 | 优化后耗时 |
|------|---------|------|-----------|
| test34-bom.xlsx | 6.3MB | 韩语-NORMAL | 1.52s |
| test34-bom.xlsx | 6.3MB | 韩语-KSD | 18.50s |
| test34-bom.xlsx | 6.3MB | 韩语-SIMPLE | 19.37s |
| test34-bom.xlsx | 6.3MB | 日语-EST | 2.21s |
| test34-bom.xlsx | 6.3MB | 日语-NORMAL | 1.85s |
| 架高防水车棚.xlsx | 7.8MB | 英语组 | 0.84s |
| 架高防水车棚.xlsx | 7.8MB | 日语-EST | 0.73s |
| 架高防水车棚.xlsx | 7.8MB | 韩语-NORMAL(ZIP) | 1.24s |
| 架高防水车棚.xlsx | 7.8MB | 韩语-NORMAL(无ZIP路径) | 2.95s |

---

## 二、已实施的优化（Phases 1-13）

| Phase | 优化项 | 影响组 | 效果 | 修改文件 |
|-------|--------|--------|------|---------|
| 1 | ko_NORMAL `bom_parse_mode` 改为 `zip_first` | 韩语 | BOM加载模式优化 | `ko_normal/quotation_engine.py` |
| 2 | 缓存 `resolve_price_info`，去掉7次冗余调用 | 韩语 | 2.7x 价格查找提速 | `ko_normal/quotation_engine.py` |
| 3 | 批量 `ws.delete_rows(start, count)` 合并连续行删除 | 韩语 | 微提升 | `ko_normal/quotation_engine.py` |
| 4 | 合并4遍边框扫描为1遍，9个预构建Border对象 | 韩语 | 1.8x 边框设置提速 | `ko_normal/quotation_engine.py` |
| 5 | 去掉预扫描排序+过滤，合并为单遍BOM遍历 | 韩语 | 减少冗余遍历 | `ko_normal/quotation_engine.py` |
| 6 | `copy.deepcopy()` → `[dict(p) for p in products]` 浅拷贝 | 日语 | 14.8x 拷贝提速 | `ja_EST/quotation_builder.py` |
| 7 | 去掉 `en_simple` 冗余 `resolve_price_info` 回退调用 | 英语 | 微提升 | `en_simple/quotation_engine.py` |
| 9a | `AnchorMarker, OneCellAnchor, XDRPositiveSize2D` 导入提升到模块级 | 韩语 | 微提升 | `shared/image_utils.py` |
| 9b | 15个正则表达式预编译到模块级 | 韩语 | 2.3x 正则提速 | `shared/weight_utils.py` |
| **11** | **传递bom_info到引擎，跳过BOM二次读取** | **韩语** | **引擎从17s→0.5s (34x)** | `ko_normal/quotation_engine.py` |
| **13** | **阵列校验使用预解析bom_info，跳过BOM第三次读取** | **韩语** | **服务层从29s→1.0s** | `ko_normal/quotation_engine.py` |
| 12 | 抑制 `[WEIGHT]`/`[MATCH]` 逐条打印 | 韩语 | 减少控制台I/O | `ko_normal/quotation_engine.py` |
| **ZIP-1** | **ko_normal ZIP快速路径：`pre_parsed_products_by_key` 时跳过 openpyxl** | **韩语** | **21s→3s (7.2x)** | `ko_normal/quotation_engine.py` |
| **ZIP-2** | **英语组改用 `_build_products_by_key` 替代 openpyxl+pandas** | **英语** | **ZIP解析替代openpyxl** | `quotation_service.py` |
| **LOOP-1** | **`fetch_temp_code_fallback` 双循环合并为单遍** | **全部** | **匹配阶段耗时减半** | `material_matcher.py` |
| T1 | 样式对象(Font/Border/Alignment)提升到模块级常量 | 韩语 | 10 sheets节省150个对象创建 | `ko_normal/quotation_engine.py` |
| T2 | 翻译结果 `dict` 缓存 | 全部 | 避免190次重复翻译 | `material_translate.py` |

### 核心优化原理

**BOM 文件加载是最大瓶颈**：
- openpyxl/pandas 加载 6-8MB BOM 文件需要 **18-20 秒**（解析所有样式、合并区域、数据类型）
- ZIP XML 直接读取 `xl/sharedStrings.xml` + `xl/worksheets/sheet*.xml` 只需 **0.5-1 秒**（只提取文本数据）
- 关键：在 `collect_bom_products` 阶段已通过 ZIP 解析获得所有产品数据，后续引擎不应再用 openpyxl 重新加载

**优化路径**：
1. `collect_bom_products()` → 尝试 `_parse_bom_sheets_zip()` → 成功则返回 `read_results_map`
2. `split_and_create_quotations()` 收到 `pre_parsed_products_by_key` → 检测到所有 BOM 已预解析
3. 调用 `_parse_bom_sheets_zip()` 获取 bom_starts/config（~0.5s）→ 跳过 openpyxl 加载（~18s）
4. 使用预解析的产品数据直接生成报价表

---

## 三、未优化项（低优先级）

### 韩语 KSD / SIMPLE 为什么没提速

这两个 case_type 使用独立的 `ko_ksd/quotation_builder.py` 和 `ko_simple/quotation_builder.py`。
它们已经有 `_parse_bom_sheets_zip` 快速路径（内部会 fallback 到 openpyxl），但瓶颈不在 BOM 解析，
而在后续的报价表生成逻辑（样式设置、图片插入、openpyxl 写入）。这些是 openpyxl 本身的写入性能瓶颈，
无法通过解析优化解决。

### 英语组预解析延迟加载

| 项目 | 内容 |
|------|------|
| 文件 | `backend/services/quotation_service.py` |
| 当前 | service 层用 `_build_products_by_key` 解析所有 BOM（已改用ZIP） |
| 可优化 | 只解析匹配信息表阵列的 BOM，跳过不匹配的 |
| 影响 | 信息表只匹配部分 BOM 时可减少 30-70% 解析量 |

### 图片处理优化

| 项目 | 内容 |
|------|------|
| 文件 | `backend/core/shared/image_utils.py` |
| 当前 | 每行独立 PIL open → resize → save |
| 可优化 | 按路径去重，相同图片只处理一次 |
| 影响 | 减少 50-70% PIL 操作 |

---

## 四、原始优化计划（参考）

> 以下为优化前的分析文档，保留供参考。已标注状态。

### 韩语 P0 — 必须修复

#### 1. ✅ 已完成 — BOM 文件用 openpyxl 完整加载 → 改用 ZIP XML 快速解析

| 项目 | 内容 |
|------|------|
| 文件 | `ko_normal/quotation_engine.py` |
| 问题 | openpyxl 加载 10MB BOM 文件 3-8 秒，ZIP XML 解析只需 0.3-1 秒 |
| 修复 | 改为 `zip_first`（与 ko_simple/ko_ksd 一致），失败时回退 openpyxl |
| 结果 | **BOM 加载阶段提速 5-10 倍** |

#### 2. ✅ 已完成 — 3 遍 BOM 遍历合并为 1 遍

| 项目 | 内容 |
|------|------|
| 文件 | `ko_normal/quotation_engine.py` |
| 问题 | 每个 BOM 调用了 3 次 `find_matching_matrix_array`，每个 sheet 被调用 2 次 `xls.parse()` |
| 修复 | 去掉预扫描排序，合并过滤和生成为单遍 |
| 结果 | **减少 60-70% 的 BOM 遍历开销** |

#### 3. ✅ 已完成 — `ws.delete_rows()` 逐行删除 → 批量删除

| 项目 | 内容 |
|------|------|
| 文件 | `ko_normal/quotation_engine.py` |
| 问题 | 每次 `delete_rows` 触发 O(N) 行移位，删除 K 行总计 O(K×N) |
| 修复 | 使用 `ws.delete_rows(start, count)` 批量删除连续区间 |
| 结果 | **O(K×N) → O(N)** |

#### 4. ✅ 已完成 — `resolve_price_info` 缓存

| 项目 | 内容 |
|------|------|
| 文件 | `ko_normal/quotation_engine.py` |
| 问题 | 同一个产品调用 2-3 次 `resolve_price_info` |
| 修复 | 首次计算后缓存到 `product['_price_info']` |
| 结果 | **价格解析阶段减少 60-70% 查找操作** |

#### 5. ✅ 已完成 — 边框 4 遍 → 1 遍

| 项目 | 内容 |
|------|------|
| 文件 | `ko_normal/quotation_engine.py` |
| 问题 | 4 次嵌套循环遍历 (rows × 10 columns) |
| 修复 | 预构建 9 种 Border 对象，1 遍按位置分配 |
| 结果 | **边框设置提速 4 倍** |

### 韩语 P1 — 已完成

- ✅ #6 `is_complex` 重复查找 → 使用 `_price_info` 缓存
- ✅ #7 `_get_discount_category` 缓存到 `product['_discount_cat']`
- ✅ #8 `print()` 改为计数器汇总输出
- ✅ #9 排除项图片共享 `image_cache`
- ✅ #10 样式对象提升为模块级常量

### 日语 P0 — 已完成

- ✅ #1 `copy.deepcopy` → 浅拷贝 `[dict(p) for p in ...]`

### 日语 P1 — 已完成

- ✅ #2 `delete_rows` 批量化
- ✅ #4 `resolve_price_info` 缓存到 `product['_price_info']`

### 英语 P0 — 已完成

- ✅ #1 `resolve_price_info` 缓存

### 英语 P1 — 已完成

- ✅ #2 改用 `_build_products_by_key`（ZIP优先）

### 跨组通用 — 已完成

- ✅ #1 `fetch_temp_code_fallback` 双循环合并为单遍
- ✅ #2 图片插入 import 移到模块级
- ✅ #3 正则表达式预编译
- ✅ #4 `translate_material` 缓存

### 新增优化 — 已完成

- ✅ ZIP-1: ko_normal ZIP快速路径（`pre_parsed_products_by_key` 时跳过 openpyxl）
- ✅ ZIP-2: 英语组 `_build_products_by_key` 替代 openpyxl+pandas
- ✅ LOOP-1: `fetch_temp_code_fallback` 双循环合并
- ✅ JA-BORDER: 日语EST汇总表5遍边框→1遍，预构建Border对象（0.68s→0.21s）
- ✅ KO-BORDER: 韩语NORMAL外框Border对象提升为模块级常量
- ✅ JA-OUTER: 日语EST `_apply_outer_border` 每格创建Side/Border→预构建9种Border对象

---

## 五、未完成项（低优先级/影响小）

| 项 | 描述 | 原因 |
|----|------|------|
| 图片路径去重批处理 | 相同图片只处理一次 | 需改 `image_utils.py` 核心接口 |
| ko.py 矩阵解析 7次全表扫描→1次 | 新后端 parsers/matrix/ko.py | 属于新后端重构范畴 |
| 英语预解析延迟加载 | 只解析匹配信息表的BOM | 已改ZIP，收益有限 |
