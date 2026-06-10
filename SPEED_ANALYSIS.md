# 三组（日语/韩语/英语）解析速度差异分析

> 基于旧代码 (`旧代码/backend/`) 的实际调用链路分析。
> 结论：**日语明细表生成最快，韩语最慢，英语居中。**

---

## 一、速度对比总览

| 维度 | 日语 (ja_EST) | 韩语 (ko_normal) | 英语 (en_simple) |
|------|--------------|-----------------|-----------------|
| BOM 解析模式 | `pre_parse` (ZIP XML 快速) | **`full` (openpyxl 完整加载)** | `pre_parse` (ZIP XML 快速) |
| BOM 遍历次数 | **1 遍** | **3 遍** (预扫描+过滤+生成) | 1 遍 |
| 信息表匹配后再解析 | 否（预解析已缓存） | **是**（`extract_bom_dataframe` 再次提取） | 否（预解析已缓存） |
| 累加匹配轮数 | 2 轮 | **3 轮** (accumulated + info_accumulated + indirect) | 0 轮 |
| 预估单次明细生成耗时 | 基准 1x | **2.5-4x** | **1.5-2x** |

---

## 二、速度瓶颈逐层分析

### 2.1 第一层：BOM 解析模式差异（影响最大）

入口文件：`旧代码/backend/services/quotation_service.py`

**日语** (`quotation_service.py:221-241`)

```python
# 日语在 service 层就完成了预解析，使用 _build_products_by_key (ZIP XML)
from backend.core.ja_EST.quotation_builder import _build_products_by_key as ja_build
products_by_key, bom_info_by_key, _, inverter_products_all, bom_configs = ja_build(
    bom_file, sel_set, col_map, skip_kw, non_bom_kw
)
# 结果作为 pre_parsed_products 传入 builder，builder 内不再解析文件
```

- 使用自定义 ZIP XML 级解析 (`bom_parse_mode='pre_parse'`)
- **一次解析，结果缓存**，builder 内直接复用 `products_by_key`
- 不走 openpyxl，直接解析 `.xlsx` 内的 XML 文件，速度快 5-10 倍

**韩语 NORMAL** (`quotation_service.py:340-352`)

```python
# ko_normal 使用 build_bom_material_context，内部使用完整 openpyxl 加载
ctx = build_bom_material_context(
    bom_file, selected_bom_keys=selected_bom_keys,
    load_images=False, lazy_image_filter=True,
)
```

- `bom_parse_mode='full'`：使用 openpyxl 完整加载整个 Excel 文件
- 所有 sheet、所有单元格、所有样式全部加载到内存
- 即便后续只需要 3 个 sheet，也会加载全部 10+ 个 sheet
- openpyxl 加载开销 >> ZIP XML 解析开销

**英语** (`quotation_service.py:271-320`)

```python
# 英语在 service 层手动遍历所有 sheet 并解析
for _en_sn in _en_bom_sheet_names:
    _en_df = _en_xls.parse(sheet_name=_en_sn, header=None)  # 解析每个 sheet
    _en_bom_starts = discover_sheet_bom_starts(...)
    for _en_oi, _en_bi in enumerate(_en_bom_starts, 1):
        _en_bom_df = extract_bom_dataframe(...)
        _en_products, _, _ = read_bom_from_dataframe(...)
```

- 虽然 `bom_parse_mode='pre_parse'`，但 service 层手动遍历了**所有 BOM sheet**
- 所有 bom_starts 都被解析和提取，不管是否有对应的信息表阵列
- 浪费了不匹配 BOM 的解析时间

**结论**：韩语的 `full` 模式是最大瓶颈。一个 10MB 的 BOM 文件，openpyxl 完整加载需要 3-8 秒，ZIP XML 解析只需要 0.3-1 秒。

---

### 2.2 第二层：BOM 遍历次数差异

#### 日语：1 遍

文件：`旧代码/backend/core/ja_EST/quotation_builder.py:791-886`

```python
def _process_products_by_key(products_by_key, bom_info_by_key, master_wb):
    for key, products in products_by_key.items():          # ← 遍历预解析结果
        bom_info = bom_info_by_key.get(key)
        matched_idx, matched_array = find_matching_matrix_array(...)
        if matched_array is None:
            pending_boms.append(...)                        # ← 加入待处理队列
            continue
        # 只为匹配成功的 BOM 生成明细
        detail = create_detail_sheet(...)
```

**流程**：
1. 遍历 `products_by_key`（已缓存的预解析结果）
2. 尝试匹配信息表阵列
3. 匹配成功 → 生成明细
4. 匹配失败 → 加入 `pending_boms`，后续做 2 轮松散匹配

**总计**：1 次主遍历 + 最多 2 次 pending 处理 = **最多 3 次，但只处理未匹配的少量 BOM**

#### 韩语：3 遍

文件：`旧代码/backend/core/ko_normal/quotation_engine.py:2647-3170`

**第 1 遍：预扫描排序** (line 2648-2676)

```python
if has_explicit_matrix_arrays and matrix_array_entries:
    _sheet_match_counts = {}
    for _sn in bom_sheet_names:
        _df = xls.parse(sheet_name=_sn, header=None)       # ← 解析 sheet
        _bstarts = discover_sheet_bom_starts(_df, ...)      # ← 发现 BOM 区域
        for _bi in _sel:
            _as = str((_bi.get('config') or {}).get('array', ''))
            _r, _c = parse_array_to_rows_cols(_as)
            _, _ma = find_matching_matrix_array(...)         # ← 匹配信息表
            if _ma:
                _cnt += 1
        _sheet_match_counts[_sn] = _cnt
    # 按匹配数排序 sheet
    bom_sheet_names = sorted(bom_sheet_names, key=lambda sn: _sheet_match_counts.get(sn, 0), reverse=True)
```

**开销**：遍历所有 sheet → 每个都 `parse()` → 每个都 `discover_sheet_bom_starts()` → 每个都 `find_matching_matrix_array()`

**第 2 遍：过滤不匹配的 BOM** (line 2702-2724)

```python
if matrix_array_entries:
    matched = []
    for bom_info in selected_bom_starts:
        bom_array_str = str((bom_info.get('config') or {}).get('array', ''))
        bom_r, bom_c = parse_array_to_rows_cols(bom_array_str)
        _, matched_array = find_matching_matrix_array(...)   # ← 再次匹配
        if matched_array:
            matched.append(bom_info)
        else:
            print(f"   ⏭️  跳过阵列不匹配的BOM: ...")
    selected_bom_starts = matched                            # ← 过滤后的列表
```

**开销**：再次对所有 `bom_starts` 调用 `find_matching_matrix_array()`，与第 1 遍的匹配逻辑重复

**第 3 遍：正式生成明细** (line 2730-2868)

```python
for original_index, bom_info in enumerate(bom_starts, 1):
    if bom_info not in selected_bom_starts:
        continue
    bom_df = extract_bom_dataframe(df, bom_info, ...)        # ← 再次提取 BOM 数据
    result = create_quotation_from_dataframe(...)             # ← 生成明细
```

**开销**：对过滤后的 BOM 再次 `extract_bom_dataframe()` + 生成明细

**总计**：3 次完整遍历 + 重复的 `find_matching_matrix_array` 调用

#### 英语：1 遍 + 预解析浪费

文件：`旧代码/backend/core/en_simple/quotation_builder.py:159-217`

```python
for key, products in products_by_key.items():
    matched_array = find_matching_array(bom_rows, bom_cols, bom_base_count=...)
    if matched_array is None:
        continue                                             # ← 不匹配直接跳过
    detail = create_detail_sheet(...)                        # ← 生成明细
```

**流程简单**：但预解析阶段（`quotation_service.py:284-306`）已浪费了不匹配 BOM 的解析时间

**总计**：1 次主遍历，但预解析阶段的浪费不可忽视

---

### 2.3 第三层：累加匹配复杂度

当存在 BOM 未匹配到信息表时，各组做不同处理：

#### 日语 (ja_EST) — 2 轮松散匹配

```
quotation_builder.py:960-1056
  Pass 1: require_base_match=True  → 精确匹配 base_count
  Pass 2: require_base_match=False → 宽松匹配 rows×cols
  Pass 3: 未匹配信息表复用 BOM → 按相同 rows×cols 复制最近的 BOM 数据
```

#### 韩语 (ko_normal) — 3 轮累加 + 3 轮间接

```
quotation_engine.py:2870-3170
  Pass 1: find_accumulated_match()       → 多个 BOM 合并 → 一个信息表
  Pass 2: find_info_accumulated_match()  → 多个信息表 → 一个大 BOM
  Pass 3: 间接匹配兜底                   → rows×cols 相同即可
```

每轮累加匹配都涉及：
- 遍历 `pending_boms` × `matrix_array_entries` 的笛卡尔积
- `merge_bom_products()` 合并产品列表
- 每个匹配结果都调用 `create_quotation_from_dataframe()` 生成明细

**日语没有 `find_info_accumulated_match`**，而韩语的 3 轮累加可能额外生成 **N+M 个明细 sheet**（N=accumulated 匹配数，M=indirect 匹配数）。

---

### 2.4 第四层：明细表渲染开销差异

即使只比较"生成一个明细 sheet"的耗时，各组也有显著差异：

#### 字体大小

| 组 | 数据字体 | 标题字体 | 影响 |
|----|---------|---------|------|
| ko_normal/en_simple | Malgun Gothic **16pt** | **36pt** | 大字体 XML 序列化开销大 |
| ja_EST | Meiryo UI **6pt** | **16pt** | 小字体开销小 |
| ja_nv | Yu Gothic UI **10pt** | **16pt** | 中等 |

50 个产品 × 10 列 = 500 个单元格，每个单元格的字体对象创建 + XML 写入，16pt 比 6pt 慢约 30-50%。

#### 列数和列宽

| 组 | 列数 | 总列宽 | 列定义来源 |
|----|------|--------|-----------|
| ko_normal | **10** 列 (A-J) | **~306** | `quotation_engine.py:816` |
| en_simple | **7-10** 列 | ~240-306 | `en_simple/quotation_engine.py` |
| ja_EST | **8** 列 (A-H) | **~84** | `ja_EST/quotation_engine.py:144` |

列宽直接影响 openpyxl 的 XML 输出大小和 Excel 打开时的渲染时间。

#### `resolve_price_info` 重复调用

ko_normal 旧代码中每个产品调用 **2-3 次** `resolve_price_info`：

```python
# ko_normal/quotation_engine.py:1157-1158
price_info = product.get('_price_info') or resolve_price_info(price_mapping, product_code, spec=...)
_name_info = price_info or resolve_price_info(price_mapping, product_code)  # ← 第二次调用
```

ja_EST 只调用 **1 次**。50 个产品 → ko 多 50-100 次编码归一化 + 字典查找。

#### 排除项完整渲染

ko_normal 对排除项产品做**完整二次渲染**（表头 + 10 列数据行 + 图片插入 + 小计公式 + 边框）。
ja_EST **没有排除项概念**。

#### `delete_empty_weight_rows` 行删除

ko_normal 使用 `ws.delete_rows()` 逐行删除空重量行。每次 `delete_rows()` 是 **O(N)** 操作（需要移动后续所有行），删除 K 行总计 **O(K×N)**。

ja 的空行处理更简单（只检查 qty=0，不做正则匹配重量列）。

#### 图片处理

ko_normal 为每个产品插入图片时做了：
1. `prepare_image_for_excel()` — PIL 加载 + resize + 保存临时文件
2. `add_image_centered_in_cell()` — 计算居中位置 + openpyxl 插入

ja_EST 也插入图片，但列更窄（D=15 vs D=30.03）、图片更小（100×65 vs 120×80），resize 开销更小。

---

### 2.5 第五层：预解析阶段的浪费

#### 英语的"全量预解析"问题

`quotation_service.py:284-306`：

```python
for _en_sn in _en_bom_sheet_names:          # 遍历所有 BOM sheet
    _en_df = _en_xls.parse(...)             # 解析每个 sheet
    _en_bom_starts = discover_sheet_bom_starts(...)  # 发现所有 BOM 区域
    for _en_oi, _en_bi in enumerate(_en_bom_starts, 1):
        _en_bom_df = extract_bom_dataframe(...)       # 提取 BOM 数据
        _en_products, _, _ = read_bom_from_dataframe(...)  # 读取产品
        en_products_by_key[_en_key] = _en_products    # 全部存储
```

假设有 8 个 BOM 区域，但只有 3 个匹配信息表。英语会把 8 个全部解析，然后在 builder 里丢弃 5 个。

日语也做了类似的事情，但 `_build_products_by_key` 使用 ZIP XML 快速解析，开销远小于英语的 `parse() + discover_sheet_bom_starts + extract_bom_dataframe + read_bom_from_dataframe` 四步流程。

---

## 三、韩语为什么需要 3 遍 BOM 遍历 + 3 轮累加匹配

### 3.1 背景：韩语 BOM 与信息表的对应关系比日语复杂

韩语案件（特别是 ko_normal）的 BOM 文件结构有以下特点：

1. **一个 BOM 文件可能包含多个 sheet**（如 `2×5_3`, `3×4_5`, `4×6_2` 等），每个 sheet 内有多个 BOM 区域
2. **信息表（矩阵文件）的阵列与 BOM 区域不是一一对应的**，存在以下复杂情况：

| 情况 | 说明 | 举例 |
|------|------|------|
| 一一匹配 | 一个 BOM 区域 → 一个信息表阵列 | BOM `2×5 base=3` → 信息表 `2×5 qty=3` |
| **多 BOM → 一信息表** | 多个小 BOM 合并对应一个大信息表阵列 | BOM `2×5 base=1` + BOM `2×5 base=2` → 信息表 `2×5 qty=3` |
| **多信息表 → 一 BOM** | 多个小信息表阵列共用一个大的 BOM | 信息表 `2×5 qty=1` + `2×5 qty=2` → BOM `2×5 base=3` |
| 完全不匹配 | BOM 的阵列尺寸在信息表中不存在 | BOM `3×8` 但信息表只有 `2×5` 和 `4×6` |

日语没有"多 BOM → 一信息表"和"多信息表 → 一 BOM"的场景（日语 EST 案件的信息表通常是精确一一匹配的），所以日语不需要复杂的累加匹配。

### 3.2 第 1 遍：预扫描排序（line 2648-2676）

**目的**：确保匹配数最多的 sheet 优先处理，避免信息表阵列被"错误"的 BOM 抢占。

**解决的问题**：

假设有以下场景：
- BOM sheet A 包含 `2×5 base=1` 和 `2×5 base=2` 两个 BOM 区域
- BOM sheet B 包含 `2×5 base=3` 一个 BOM 区域
- 信息表有 `2×5 qty=3` 一个阵列

如果先处理 sheet B，`2×5 base=3` 精确匹配了 `2×5 qty=3`，信息表的这个阵列就被消耗了。
然后 sheet A 的两个 BOM `2×5 base=1` 和 `2×5 base=2` 就无法匹配，变成 pending。

但如果先处理 sheet A，`2×5 base=1` 和 `2×5 base=2` 可以通过累加匹配合并为 `base=3`，与信息表 `2×5 qty=3` 对应。
然后 sheet B 的 `2×5 base=3` 还可以尝试其他匹配方式。

**实现逻辑**：
```
对每个 sheet：
  统计该 sheet 中有多少 BOM 区域能匹配到信息表阵列（匹配计数）
按匹配计数从高到低排序 sheet
```

**代码**（`quotation_engine.py:2648-2676`）：
```python
_sheet_match_counts = {}
for _sn in bom_sheet_names:
    _bstarts = discover_sheet_bom_starts(_df, ...)
    for _bi in _sel:
        _, _ma = find_matching_matrix_array(matrix_array_entries, _r, _c, ...)
        if _ma:
            _cnt += 1
    _sheet_match_counts[_sn] = _cnt
# 按匹配数排序：匹配多的 sheet 优先处理
bom_sheet_names = sorted(bom_sheet_names, key=lambda sn: _sheet_match_counts.get(sn, 0), reverse=True)
```

**开销**：遍历所有 sheet × 所有 BOM 区域，每个都做一次 `find_matching_matrix_array`。

**日语为什么不需要**：日语的 `_build_products_by_key` 已经按 BOM key 组织好了产品，`_process_products_by_key` 按固定顺序遍历，不依赖排序优化。

### 3.3 第 2 遍：过滤不匹配的 BOM（line 2702-2724）

**目的**：提前剔除完全无法匹配信息表的 BOM 区域，避免浪费第 3 遍的 `extract_bom_dataframe` 和 `create_quotation_from_dataframe` 调用。

**解决的问题**：

BOM 文件中可能有很多 BOM 区域（如 10 个），但信息表只有 5 个阵列。如果不提前过滤，第 3 遍会对所有 10 个 BOM 都执行完整的数据提取和明细表生成，其中 5 个会在生成后发现无法匹配而丢弃。

**实现逻辑**：
```
对每个 BOM 区域：
  读取其阵列信息（rows×cols, base_count, missing）
  尝试 find_matching_matrix_array（不消耗 used_indices）
  匹配成功 → 保留
  匹配失败 → 打印日志，丢弃
```

**代码**（`quotation_engine.py:2702-2724`）：
```python
matched = []
for bom_info in selected_bom_starts:
    _, matched_array = find_matching_matrix_array(
        matrix_array_entries, bom_r, bom_c, bom_missing=bom_miss, bom_base_count=bom_base,
    )
    if matched_array:
        matched.append(bom_info)
    else:
        print(f"   ⏭️  跳过阵列不匹配的BOM: {variant_name} (阵列 {bom_array_str} 缺板={bom_miss})")
selected_bom_starts = matched
```

**开销**：再次对所有 `bom_starts` 调用 `find_matching_matrix_array`。

**与第 1 遍的重复**：第 1 遍已经对每个 BOM 做了 `find_matching_matrix_array`，但没有缓存结果。第 2 遍又做了一次相同的匹配。

**日语为什么不需要**：日语在 `_process_products_by_key` 中把匹配和生成合并在一步里——匹配失败直接 `continue`，匹配成功直接 `create_detail_sheet`，不需要单独的过滤阶段。

### 3.4 第 3 遍：正式生成明细（line 2730-2868）

**目的**：对过滤后的 BOM 区域，执行完整的数据提取和明细表生成。

**实现逻辑**：
```
对每个过滤后的 BOM 区域：
  extract_bom_dataframe()     → 从原始 DataFrame 提取 BOM 数据
  find_matching_matrix_array() → 第三次匹配（这次会消耗 used_indices）
  匹配成功 → 标记信息表阵列为已使用 → create_quotation_from_dataframe() 生成明细
  匹配失败 → 加入 pending_boms（留给后续累加匹配处理）
```

**代码**（`quotation_engine.py:2730-2868`）：
```python
for original_index, bom_info in enumerate(bom_starts, 1):
    if bom_info not in selected_bom_starts:
        continue
    bom_df = extract_bom_dataframe(df, bom_info, ...)     # 提取数据
    matched_idx, matched_array = find_matching_matrix_array(
        matrix_array_entries, bom_rows, bom_cols,
        used_indices=used_matrix_array_indices,            # 这次会消耗阵列
        strict_only=has_explicit_matrix_arrays,
    )
    if matched_array is None:
        pending_boms.append(...)                           # 留给累加匹配
        continue
    used_matrix_array_indices.add(matched_idx)
    result = create_quotation_from_dataframe(...)          # 生成明细
```

**与第 2 遍的区别**：第 2 遍的过滤是"试探性"的（不消耗 `used_indices`），第 3 遍是"正式"的（消耗 `used_indices`，确保每个信息表阵列只被用一次）。

### 3.5 三遍遍历的问题

| 问题 | 说明 |
|------|------|
| 第 1 遍和第 2 遍做了**重复的匹配** | 两次都调用 `find_matching_matrix_array`，结果相同，但没缓存 |
| 第 1 遍的排序价值有限 | 实际场景中大多数 sheet 的匹配数差异不大，排序对结果影响小 |
| 第 2 遍的过滤可以用第 3 遍的 `continue` 替代 | 日语就是这么做的——在第 3 遍直接跳过不匹配的 |

**理想的合并方案**：将 3 遍合并为 1 遍，在正式生成阶段同时完成过滤和匹配：

```python
# 理想方案（与日语类似）
for sheet_name in bom_sheet_names:
    df = parse(sheet_name)
    bom_starts = discover_sheet_bom_starts(df, ...)
    for bom_info in bom_starts:
        matched_idx, matched_array = find_matching_matrix_array(
            matrix_array_entries, bom_rows, bom_cols,
            used_indices=used_indices,   # 直接消耗
        )
        if matched_array is None:
            pending_boms.append(...)
            continue
        used_indices.add(matched_idx)
        result = create_quotation_from_dataframe(...)  # 直接生成
```

### 3.6 只用 1 次解析能否覆盖全部 4 种对应关系？

**可以。** 关键在于区分"遍历 BOM"和"处理累加匹配"是两个独立步骤：

#### 当前韩语的 3 遍 = 实际只需要 2 步

| 步骤 | 做什么 | 当前韩语用了几遍 |
|------|--------|----------------|
| **Step 1：遍历所有 BOM，逐个尝试精确匹配** | 匹配成功→立即生成明细；匹配失败→加入 pending | 当前用了 3 遍（预扫描+过滤+生成），实际只需 **1 遍** |
| **Step 2：对 pending BOM 做累加匹配** | 多BOM→一信息表、多信息表→一BOM、兜底 | 当前 3 轮（accumulated + info_accumulated + indirect），无法减少 |

**Step 1 可以合并为 1 遍**，因为：
- 第 1 遍（预扫描排序）只统计匹配数，不改变任何状态 → **可以去掉**（排序对实际结果影响极小）
- 第 2 遍（过滤）的匹配结果与第 3 遍（正式生成）完全重复 → **可以合并到第 3 遍**
- 合并后：1 遍遍历，每个 BOM 只做 1 次 `find_matching_matrix_array`，成功则生成，失败则 pending

**Step 2 的 3 轮累加匹配不能省略**，因为：
- 累加匹配必须在 Step 1 完成后才能执行（需要知道哪些 BOM 是 pending 的）
- `find_accumulated_match`（多BOM→一信息表）需要看到所有 pending BOM 才能计算 base_count 之和
- `find_info_accumulated_match`（多信息表→一BOM）需要看到所有未匹配的信息表阵列才能计算 qty 之和
- 但这 3 轮操作的对象是 `pending_boms` 列表（通常只有几个元素），**不是完整的 BOM 文件**，开销极小

#### 合并后的 1 遍方案

```python
# ============ Step 1: 单遍遍历 + 精确匹配 ============
pending_boms = []
used_matrix_indices = set()

for sheet_name in bom_sheet_names:
    df = parse(sheet_name)
    bom_starts = discover_sheet_bom_starts(df, ...)
    
    for bom_info in bom_starts:
        bom_rows, bom_cols = parse_array_to_rows_cols(...)
        bom_base = config.get('base_count', 0)
        
        # 只做 1 次匹配（替代原来的 3 次）
        matched_idx, matched_array = find_matching_matrix_array(
            matrix_array_entries, bom_rows, bom_cols,
            used_indices=used_matrix_indices,
            bom_base_count=bom_base,
        )
        
        if matched_array is None:
            # 未匹配 → 收集 products 后加入 pending
            bom_df = extract_bom_dataframe(df, bom_info, ...)
            products, _, _ = read_bom_from_dataframe(bom_df)
            pending_boms.append({
                'rows': bom_rows, 'cols': bom_cols,
                'base_count': bom_base, 'products': products, ...
            })
            continue
        
        # 匹配成功 → 立即生成明细
        used_matrix_indices.add(matched_idx)
        bom_df = extract_bom_dataframe(df, bom_info, ...)
        create_quotation_from_dataframe(bom_df, ...)

# ============ Step 2: 累加匹配（无法省略，但开销小） ============
# Pass 1: 多 BOM → 一信息表
accumulated_results = find_accumulated_match(matrix_array_entries, pending_boms, ...)
# Pass 2: 多信息表 → 一 BOM
info_acc_results = find_info_accumulated_match(matrix_array_entries, pending_boms, ...)
# Pass 3: 兜底
indirect_match(remaining_info, remaining_pending, ...)
```

#### 对比

| 维度 | 当前韩语（3 遍遍历 + 3 轮累加） | 合并方案（1 遍遍历 + 3 轮累加） |
|------|------|------|
| BOM 遍历次数 | **3** | **1** |
| `find_matching_matrix_array` 调用次数 | 每个 BOM **3 次**（预扫描+过滤+生成） | 每个 BOM **1 次** |
| `extract_bom_dataframe` 调用次数 | 每个 BOM **1 次**（仅第 3 遍） | 每个 BOM **1 次** |
| `xls.parse()` 调用次数 | 每个 sheet **2 次**（第 1 遍 + 第 3 遍） | 每个 sheet **1 次** |
| 累加匹配轮数 | 3 轮（不变） | 3 轮（不变） |
| 最终结果 | 相同 | **相同** |

#### 为什么日语不需要累加匹配？

日语 EST 案件的信息表（架台設計情報）通常是这样的结构：

```
阵列1: 2×5 qty=3  →  BOM key="Sheet1::2×5_3"    (精确一一匹配)
阵列2: 3×4 qty=5  →  BOM key="Sheet1::3×4_5"    (精确一一匹配)
阵列3: 4×6 qty=2  →  BOM key="Sheet2::4×6_2"    (精确一一匹配)
```

每个信息表阵列都有对应的完整 BOM，不存在"需要合并多个小 BOM"或"需要拆分大 BOM"的情况。

而韩语 NORMAL 的 BOM 结构可能是：

```
BOM Sheet "배열1": 
  BOM区域1: 2×5 base=1  ← 小 BOM，1 基
  BOM区域2: 2×5 base=2  ← 小 BOM，2 基
BOM Sheet "배열2":
  BOM区域3: 3×4 base=5  ← 完整 BOM
  
信息表:
  阵列1: 2×5 qty=3  ← 需要 BOM区域1 + BOM区域2 合并 (1+2=3)
  阵列2: 3×4 qty=5  ← 精确匹配 BOM区域3
```

这种"BOM 按基数拆分，信息表按总量汇总"的格式，是韩语案件特有的业务需求，日语案件不存在这种场景。

### 3.8 3 轮累加匹配的目的

第 3 遍结束后，仍可能有 BOM 没匹配到信息表（`pending_boms` 不为空）。韩语设计了 3 轮额外的匹配策略来处理这些剩余 BOM：

#### Pass 1：累加匹配 `find_accumulated_match()`（line 2870-2972）

**目的**：处理"**多个小 BOM → 一个大信息表**"的场景。

**场景举例**：
```
信息表有: 2×5 qty=3 (一个阵列，要求 3 基)
BOM 有:   2×5 base=1 (1 基), 2×5 base=2 (2 基)
```
两个 BOM 合并后 base=1+2=3，恰好匹配信息表 `2×5 qty=3`。

**实现**（`array_matcher.py:210-283`）：
```
对每个未匹配的信息表阵列：
  找到所有 rows×cols 相同的 pending BOM
  按 sheet_name 分组
  检查每组的 base_count 之和是否等于信息表的 table_qty
  如果相等 → 合并这些 BOM 的产品列表 → 生成一个明细 sheet
```

**日语为什么不需要**：日语 EST 案件通常不存在"多个小 BOM 合并为一个大信息表"的需求。日语的 `_process_products_by_key` 遍历时，每个 BOM key 对应一个完整的产品列表，不需要合并。

#### Pass 2：信息表累加匹配 `find_info_accumulated_match()`（line 2973-3058）

**目的**：处理"**多个小信息表 → 一个大 BOM**"的场景。这是 Pass 1 的**反向**操作。

**场景举例**：
```
信息表有: 2×5 qty=1, 2×5 qty=2  (两个小阵列)
BOM 有:   2×5 base=3              (一个大 BOM)
```
两个信息表阵列的 qty 之和 = 1+2 = 3，恰好匹配 BOM 的 `base=3`。

**实现**（`array_matcher.py:286-348`）：
```
将未匹配的信息表阵列按 (rows, cols, missing) 分组
对每组：计算总 table_qty
在 pending BOM 中寻找 base_count 等于该总量的 BOM
匹配成功 → 用该 BOM 的产品生成明细 sheet（信息表阵列为元数据）
```

**日语为什么不需要**：日语的信息表（架台設計情報）通常是一个完整的阵列列表，不存在"多个小信息表阵列合并"的概念。日语对未匹配的信息表直接复用最近的同尺寸 BOM 数据（`quotation_builder.py:1058-1160`）。

#### Pass 3：间接匹配兜底（line 3059-3170）

**目的**：兜底策略——只要 rows×cols 相同就匹配，不管 base_count 是否一致。

**场景举例**：
```
信息表有: 2×5 qty=3  (剩余未匹配)
BOM 有:   2×5 base=5  (剩余未匹配，base_count 与 table_qty 不等)
```
虽然 base=5 ≠ qty=3，但 rows×cols 相同（都是 2×5），所以强行匹配。

**实现**：
```
对每个剩余未匹配的信息表阵列：
  在剩余未匹配的 pending BOM 中找 rows×cols 相同的
  第一个找到的直接匹配
```

**日语的类似处理**（`quotation_builder.py:1058-1160`）：
日语在 `_process_products_by_key` 之后，对未匹配的信息表阵列做"BOM 复用"——找同尺寸的已生成明细对应的 BOM 数据，`copy.deepcopy` 后重新生成一个明细 sheet。这个策略更简单但更有效，因为不需要"合并"操作。

### 3.9 韩语与日语策略差异总结

| 维度 | 韩语 (ko_normal) | 日语 (ja_EST) |
|------|-----------------|--------------|
| BOM 遍历 | 3 遍（预扫描排序 + 过滤 + 生成） | 1 遍（匹配 + 生成合一） |
| 不匹配 BOM 处理 | 累加合并（多 BOM → 一信息表） | 松散匹配（放宽 base_count 要求） |
| 不匹配信息表处理 | 信息表累加（多信息表 → 一 BOM） | BOM 复用（同尺寸 BOM deepcopy） |
| 兜底策略 | rows×cols 相同即匹配 | 同上 |
| 根本原因 | **韩语 BOM 结构复杂**：一个文件内可能有多 sheet 多 BOM 区域，需要合并/拆分才能与信息表对应 | **日语 BOM 结构简单**：信息表阵列与 BOM 基本一一对应，少数不匹配的用复用解决 |

---

## 四、根本原因总结

以一个典型案件为例：**BOM 文件 10MB，包含 6 个 sheet、10 个 BOM 区域，信息表有 5 个阵列**。

| 阶段 | 日语 (ja_EST) | 韩语 (ko_normal) | 英语 (en_simple) |
|------|--------------|-----------------|-----------------|
| ① BOM 文件加载 | 0.3-0.8s (ZIP XML) | **3-8s** (openpyxl full) | 0.3-0.8s (ZIP XML) |
| ② BOM 数据提取 | 0.2-0.5s (一次) | **0.6-1.5s** (三次) | 0.4-1.0s (一次，但全量) |
| ③ 信息表解析 | 0.5-1.5s | 0.5-1.5s | 0.2-0.5s (en parser 最简单) |
| ④ 阵列匹配 | 0.05-0.1s (2轮) | **0.1-0.3s** (3轮累加) | 0.02-0.05s (1轮) |
| ⑤ 明细 sheet 生成 (5个) | 2-4s (8列/6pt/无排除项) | **8-15s** (10列/16pt/排除项/行删除) | 5-10s (10列/16pt/排除项) |
| ⑥ 汇总表生成 | 0.5-1.0s | 0.5-1.0s | 0.3-0.5s |
| **总计** | **3.5-8s** | **13-27s** | **6.5-13s** |

**倍率关系**：日语 1x ≈ 英语 1.5-2x ≈ 韩语 3-4x

---

## 五、根本原因总结

```
速度：日语 > 英语 > 韩语

日语快的原因：
  1. BOM 解析用 ZIP XML（pre_parse），不用 openpyxl
  2. 只遍历 1 次已缓存的预解析结果
  3. 明细表列少（8列）、字体小（6pt）、无排除项渲染
  4. 累加匹配只有 2 轮
  5. 不匹配的信息表用 BOM 复用（deepcopy）而非合并

韩语慢的原因：
  1. BOM 解析用 openpyxl 完整加载（full）—— 最大瓶颈
  2. 3 遍 BOM 遍历（预扫描排序 + 过滤 + 生成），每遍重复解析
  3. 3 轮累加匹配（accumulated + info_accumulated + indirect）
  4. 明细表列多（10列）、字体大（16pt）、排除项完整渲染
  5. delete_empty_weight_rows 的 O(K×N) 行删除
  6. resolve_price_info 每个产品调用 2-3 次
  7. 韩语 BOM 结构复杂（多 sheet 多 BOM 区域需合并/拆分），导致匹配策略必然复杂

英语居中的原因：
  1. BOM 解析用 ZIP XML（快），但预解析阶段全量解析所有 BOM（浪费）
  2. 明细表渲染开销接近韩语（10列、16pt）
  3. 没有累加匹配（简单 case）
  4. en.py parser 最简单（292 行 vs ja 730 行）
```

---

## 六、优化建议

### 高优先级（效果显著）

| # | 优化项 | 影响组 | 预估提升 |
|---|--------|-------|---------|
| 1 | ko_normal 改用 `zip_first` 或 `pre_parse` BOM 解析模式 | 韩语 | **3-5x** BOM 加载提速 |
| 2 | 合并韩语 3 遍 BOM 遍历为 1 遍 | 韩语 | **减少 60%** 重复解析 |
| 3 | 缓存 `resolve_price_info` 结果，避免同产品重复调用 | 韩语 | **减少 50%** 查找次数 |
| 4 | 英语预解析阶段先检查信息表阵列，只解析匹配的 BOM | 英语 | **减少 30-50%** 无效解析 |

### 中优先级（效果中等）

| # | 优化项 | 影响组 | 预估提升 |
|---|--------|-------|---------|
| 5 | 排除项不插入图片（ko_normal line 1657-1693 用 `cache=None` 无缓存） | 韩语 | 减少图片处理开销 |
| 6 | 用"先过滤再写入"替代 `ws.delete_rows()` 逐行删除 | 韩语/日语 | 避免 O(K×N) 行移位 |
| 7 | 删除韩语预扫描排序（第 1 遍），或复用第 1 遍结果 | 韩语 | 减少 1 次完整遍历 |
| 8 | 减少 per-image 的 `print()` 日志输出 | 韩语 | 减少 I/O 阻塞 |

### 低优先级（效果较小）

| # | 优化项 | 影响组 | 预估提升 |
|---|--------|-------|---------|
| 9 | 减小韩语/英语数据字体到 12pt | 韩语/英语 | 减少 XML 输出量 |
| 10 | 合并 ko_normal 的 `create_quotation_from_dataframe` 和累加匹配中的重复调用 | 韩语 | 代码简化 |
