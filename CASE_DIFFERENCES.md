# 8 种案件差异梳理

> 本文档梳理韩语(3种)、日语(3种)、英语(2种)共 8 种案件在 BOM 解析、明细表、汇总表、
> 阵列匹配、产品分类、价格计算等方面的具体差异，作为新引擎实现的参考。

---

## 一、韩语组

### 1.1 总览

| 维度 | ko_normal | ko_simple | ko_ksd |
|------|-----------|-----------|--------|
| 引擎文件 | quotation_engine.py 3,439行 | quotation_engine.py 1,569行 | quotation_engine.py 1,541行 |
| 构建器 | 22行(薄委托) | 877行 | 872行 |
| 日志前缀 | `[NORMAL]` | `[SIMPLE]` | `[KSD]` |
| BOM解析模式 | full (openpyxl) | zip_first (ZIP XML 快速解析) | zip_first |
| 阵列匹配 | 4轮 | 4轮 | 4轮 |
| 明细表语言 | **韩语** | **英语** | **英语** |
| 汇总表语言 | **韩语** | **英语** | **英语** |

### 1.2 BOM 解析差异

| 维度 | ko_normal | ko_simple / ko_ksd |
|------|-----------|-------------------|
| 解析器 | 完整 openpyxl 加载 | **优先 ZIP 快速解析** (`_parse_bom_sheets_zip`)，失败回退传统解析 |
| 列映射 | 硬编码在 split_and_create_quotations | 使用 `get_bom_processing_rules()` |
| BOM 缓存 | 有 (`_get_parse_md` / `_store_parse_md`) | 无 |
| 预解析 | `pre_parsed_products_by_key` (按 key) | `pre_parsed_bom_data` (批量字典) |

### 1.3 明细表差异

| 维度 | ko_normal | ko_simple | ko_ksd |
|------|-----------|-----------|--------|
| 函数 | `create_quotation_from_dataframe` | `create_ksd_detail_sheet` | `create_ksd_detail_sheet` |
| 标题 | `'태양광 시스템 견적서'` | `'Solar mounting system Quotation'` | 同 simple |
| 数据起始行 | **10** | **9** | **9** |
| 列数 | 固定 10 列 (A-J) | 9~10 列 (条件 `need_weight_code`) | 同 simple |
| 产品分组 | 全部在一起 | Part1: 铝+碳钢; Part3: 排除项 | **Part1: 铝; Part2: 碳钢; Part3: 排除项** |
| 重量列 | 始终显示 | 条件显示 (`need_weight_code`) | 条件显示 |
| A7 填充色 | 浅蓝 `E7F5FF` | 深蓝 `0070C0` | 深蓝 `0070C0` |
| 质保文字 | `'품질보증: 10년\n사용수명: 25년'` | `'10 years warranty\n20 years service life'` | 同 simple |
| Logo 位置 | A3:B6 | A3:B7 | A3:B6 |
| 品名字段 | `name_ko` 默认 (可切换) | `name_en > name_ko > name` | `name_en > name_ko > name` |
| 空重量行删除 | **是** (`delete_empty_weight_rows_and_renumber`) | 否 | 否 |
| 地桩 Sheet | **有** (独立 `지주(地桩)` sheet) | 无 | 无 |

### 1.4 汇总表差异

| 维度 | ko_normal | ko_simple | ko_ksd |
|------|-----------|-----------|--------|
| 函数 | `create_summary_quotation_sheet` | `create_ksd_summary_sheet` | `create_ksd_summary_sheet` |
| Sheet名 | `'견적서'` | `'Total'` | `'Total'` |
| 语言 | **韩语** | **英语** | **英语** |
| 字体 | Malgun Gothic 8-16 | Calibri 10-12 | Calibri 10-12 |
| 数据列 | No/A-B/Row/Col/Set/Angle/Output/Price/Table/Amount | No/Row/Col/Angle/Table/Power/Price/Table/Amount | 多一列 **Less** (缺板数) |
| Part2 碳钢 | 无 | 无 | **有** (独立 "Part 2: Carbon steel" + 自有折扣率) |
| 折扣方式 | 按类别 (standard/steel/purchased) 或统一率 | 统一率 `ko_discount_rate%` | Part1: `ko_discount_rate%`; Part2: `ko_steel_discount_rate%` |
| 贸易方式 | EXW/CIF/FOB/**DDP** (含关税+消费税公式) | 仅 EXW (运费可选 `skip_freight`) | 仅 EXW (无运费) |
| 运费区块 | 完整 (CIF/FOB 集装箱, DDP 税费) | 可选 (container, CIF freight, skip_freight) | 不存在 |
| Per/W 公式 | `=ROUND(discount/(output*1000), 3)` | `=ROUND(CIF_total/(output*1000), 3)` | (Part1+Part2折扣) / 总output |

### 1.5 折扣逻辑差异

| 维度 | ko_normal | ko_simple | ko_ksd |
|------|-----------|-----------|--------|
| 明细内折扣 | **可切换** (`ko_discount_in_detail` 参数) | 始终应用 (当 `is_complex`) | **始终不应用** |
| 汇总折扣 | 仅在明细内折扣关闭时应用 | 统一率 | Part1 + Part2 分别折扣 |

---

## 二、日语组

### 2.1 总览

| 维度 | ja_EST | ja_normal | ja_nv |
|------|--------|-----------|-------|
| 构建器行数 | 1,432行 | 446行 | 992行 |
| 引擎行数 | 1,698行 | 716行 | 3,085行 |
| BOM 解析模式 | pre_parse (自定义 ZIP XML 解析) | pre_parse (共享 `_build_products_by_key`) | pre_parse (共享) |
| 阵列匹配 | 3轮 | 1轮 | **5轮** (含累加合并) |
| 默认折扣率 | 71% | 71% (参数化) | 72% (参数化) |
| 围栏支持 | 简单 fence_data | nv_fence_gate_data | nv_fence_gate_data + 独立围栏明细 sheet |
| DDP 支持 | 完整 DDP 分解 | CIF/DDP | **双模式 CIF+DDP** |
| 备品 sheet | 无 | 无 | **有** (`create_spare_parts_sheet`) |
| 输出文件名 | `{basename}_見積汇总.xlsx` | `{basename}_普通案件見積.xlsx` | `{basename}_NV見積.xlsx` |

### 2.2 BOM 解析差异

| 维度 | ja_EST | ja_normal / ja_nv |
|------|--------|-------------------|
| 解析方法 | **自定义 ZIP XML 级解析**: `_parse_sheet_cells`, `_find_bom_starts_zip`, `_find_config_zip` | 共享 `_build_products_by_key` (bom_zip_parser) |
| 逆变器提取 | 双策略: 标记识别 + 名称模式匹配 (`_find_inverter_region` + `_find_inverter_region_by_name`) | 共享解析后后处理 |
| BOM 配置提取 | 自定义 `_find_config_zip` (array, variant, panel_spec, cross_span, angle, missing_boards, base_count) | 依赖共享 bom_info |

### 2.3 阵列匹配差异

| 维度 | ja_EST | ja_normal | ja_nv |
|------|--------|-----------|-------|
| 匹配轮数 | **3轮**: ①精确 → ②带 base_count 重试 → ③宽松 rows×cols | **1轮**: rows×cols + base_count 优先 | **5轮**: ①精确 → ②`find_accumulated_match` → ③`find_info_accumulated_match` → ④宽松 → ⑤强制按序 |
| BOM 合并 | 不合并 | 不合并 | **支持**: 多个 BOM 合并为一个明细 sheet |
| Sheet 排序 | `reorder_sheets_by_matrix_array` | 不排序 | 按 matrix_array_entries 顺序排序 |

### 2.4 明细表差异

| 维度 | ja_EST | ja_normal | ja_nv |
|------|--------|-----------|-------|
| 函数 | `create_detail_sheet` | **复用 NV 的** `create_nv_detail_sheet` | `create_nv_detail_sheet` |
| 字体 | `Meiryo UI` 6-8 | `Yu Gothic UI` 8-10 | `Yu Gothic UI` 10 |
| 列数 | 8列 (A-H) + 可选 I(品番) J(重量) = 最多10 | **11列** (A-K, 动态 `_col_end`) | 11列 |
| 表头 | Row 4: 序号/品名/材質/写真/規格/単価(USD)/数量(PCS)/総金額(USD) | Row 8: 番号/部品名称/材質/写真/規格/単価(EXW US$)/数量(PCS)/総金額(EXW US$) | 同 normal |
| 图片列 | **列4 (D)** | **列5 (E)** | **列5 (E)** |
| Logo | 无 | **有** (A2:C5 OneCellAnchor 居中) | **有** |
| Row 2 信息 | 阵列信息: 段/列/セット数 | 销售信息、角度、面板、风速、积雪、质保文字 | 同 normal |
| SUB-TOTAL | `SUB-TOTAL-(FOB) 1基スクリュー杭基礎架台合計` | `SUB-TOTAL-(EXW) 1基架台合計` + `TOTAL-(EXW) {qty}基` + `1Wあたり金額` | 同 normal |
| 折扣 | 仅在汇总表应用 (0.71) | 同 | 同 |
| 价格格式 | `"$" #,##0.00` (USD) | `#,##0.00` (纯数字) | `#,##0.00` |
| 地桩处理 | 混入同 sheet, 单价设为 0 | 通过 pile_products 参数 | 分区渲染 (独立 pile 区域) |
| 逆变器 sheet | 独立 `パワコン_{rows}×{cols}_{qty}` | 附加到现有明细行 | 独立 `パワコン独立架台_{qty}` |
| 需要删除零数量行 | 是 | 是 | 是 |

### 2.5 汇总表差异

| 维度 | ja_EST | ja_normal | ja_nv |
|------|--------|-----------|-------|
| Logo | `ESTlogo.png` 240×60 | `集团标2.png` 151×67 | `集团标1.png` / `集团标2.png` |
| 结构区块 | **5块**: ①架台本体 → 围栏项 → ②运费(关税/税/卡车) → DDP分解 → 参考链接 | **3块**: ①架台本体 → ②フェンス金額 → ③DDP/CIF | **多块** 可配置 CIF/DDP 模式; 支持 `CIF_DDP` 双 sheet |
| 日元列 | **有** (列K) | 无 | 可配置 |
| 汇率行 | `1ドル＝{rate}円` + USD/JPY 双列 | 无 | 可配置 |
| 关税/消费税 | 分开行: 関税{rate}% + 消費税{rate}% | 合并: `消費税{X}%＋関税{Y}%` | 按 `mitsumori_condition` 配置 |
| 卡车费 | `⑤ truck_desc + truck_fee` | `4Tユニック 配送` shipping_fee | 可配置 |
| DDP 分解 | 完整: ①本体→②配送費→③小計→④消費税→⑤合計(税込み) + 参考URL | 单行 DDP/CIF 总额 | **双模式**: CIF sheet + DDP sheet (当 `mitsumori_condition == 'CIF_DDP'`) |
| 逆变器汇总 | 独立行 (パワコン取付バー) + 独立折扣 | 合并到明细结果 | 独立 `inverter_detail_results` |

### 2.6 围栏/栅栏处理差异

| 维度 | ja_EST | ja_normal | ja_nv |
|------|--------|-----------|-------|
| 数据格式 | 简单 `fence_data` dict: items[], segments[], length, color, corner | `nv_fence_gate_data`: fences[], gates[] + BOM行 | 同 normal |
| 围栏明细 sheet | 无 (内嵌在汇总) | 调用 NV 的 `_create_fence_detail_sheet` | **原生** `_create_fence_detail_sheet` (含物料DB查找+图片+门规格) |
| 门类型识别 | 无 | `_resolve_gate_label` | **DB查询** `_lookup_gate_spec_from_db` (门宽高) |
| 围栏物料查找 | 手动 `_fence_name_ja_map` 字典 | `fence_gate_material_repository.get_material` | 同 + 浸塑/热镀锌材质变体 |
| 多围栏/多门 | 不支持 | 支持 multi_fences/multi_gates | 支持 |

---

## 三、英语组

### 3.1 总览

| 维度 | en_simple | en_common |
|------|-----------|-----------|
| 构建器 | 322行 | 324行 |
| 引擎 | quotation_engine.py | quotation_engine.py |
| 阵列匹配 | 相同 (rows×cols) | 相同 |
| 产品分类 | 相同 | 相同 |
| 价格计算 | 相同核心逻辑 | 相同核心逻辑 |

### 3.2 明细表差异

| 维度 | en_simple | en_common |
|------|-----------|-----------|
| 标题字体 | Malgun Gothic **36** | Arial **22** |
| 正文字体 | Malgun Gothic **16** | Arial **11** |
| 头部区域 | 行2-8 (风速/积雪/模块/阵列/质保/联系人) | 仅 行1标题 + 行2表头 (极简) |
| 数据起始行 | **9** | **3** |
| 公司图片 | **有** (A3:B7) | 无 |
| 项目元数据 | 完整 (风速/积雪/模块/输出/缺板/跨距/阵列/基数/质保) | 无 |
| 图片列 | **列4 (D)** | **列3 (C)** |
| 列布局 | Item/Name/Material/Picture/Spec/UnitPrice/Qty/[TotalQty or TotalPrice]/[TotalPrice or Weight]/Remark | Item/Picture/Material/Spec/QtyPerTable/TotalQty/UnitPrice/TotalAmount/[Weight]/[Remark] |
| `need_total_qty` | **支持** (分离每基数量和总数量) | 不传给明细 |
| 每基数量表头 | 固定 "Qty (pcs)" | **动态**: "Qty in {rows}×{cols} Table" |
| is_complex 检测 | **有** (检测非标准定价) | 无 (始终 False) |
| 货币标签 | `'US$'` | `'USD'` |
| 分组行高 | 61pt | 60pt (合并产品), 40pt (排除项) |
| 代码组织 | 嵌套辅助函数 (`_write_product_rows`, `_write_group_header`) | 全部内联 |
| 总计行 | Sub-Total per Table + Total All Tables + Price per Watt | 单行 SUM + 蓝色填充 |

### 3.3 汇总表差异

| 维度 | en_simple | en_common |
|------|-----------|-----------|
| Sheet名 | `'Total'` (硬编码) | `_t('common_summary_title', lang)` (本地化) |
| 列数 | **13** (A-M) | **15** (A-O) |
| 头部区域 | 简约 (报价号+日期+标题+公司+项目名+价格条款) | **详细** (卖家/买家完整联系信息 + 项目技术参数) |
| 卖家/买家 | 无 | **有** (行5-12: From/Tel/Email/Phone/Web/Add) |
| 项目参数 | 无 | **有** (行17-22: 积雪/模块尺寸/风速/容量/净高/数量/角度/总容量/材质/布局) |
| 版本号 | 无 | **有** (行4: "V1.0") |
| 默认联系人 | `"진설정"` / `"0086-18050053693"` | `"Samantha Ruan"` / `"+86-18050060639"` |
| Part1 数据列 | No/Row/Col/Angle/Table/Power/PricePerTable/Amount | No/Item(layout)/MissingPanel/Picture/Capacity(Wp)/EXW UnitPrice(/W)/EXW Amount |
| 缺板信息 | 无 | **有** (每行显示 missing panel 数量) |
| 折扣公式 | 单行 Discount Price + Unit Price/W | `project` 方法: Total EXW → Discount → Unit Price/W |
| 运费 Unit Price | 无 | **有** (`{method} {port} Unit Price (/W)`) |
| 外边框 | **粗边框** (medium weight) | 无 |
| 提示文字 | 红色 summary_hint | 无 |
| 页边距 | 0.75 / 0.7 | 0.5 / 0.25 |

### 3.4 特有功能

| 功能 | en_simple | en_common |
|------|-----------|-----------|
| `create_total_materials_sheet` | **交叉引入** en_common 的 | **原生定义** (~290行) |
| 质保单元格 | 有 (合并 H3:end) | 无 |
| 规格数字格式 | `"L"!=#"mm"` (数字规格) | `@` (纯文本) |
| `need_total_qty` | 完整支持 | 不传给明细但支持 total materials sheet |

---

## 四、跨组共性模式

### 4.1 折扣逻辑

| 组 | 明细内折扣 | 汇总折扣 | 折扣率 |
|----|-----------|---------|--------|
| 韩语 | 可切换 (`ko_discount_in_detail`) | 按类别 (standard/steel/purchased) 或统一率 | ko_discount_rate(100), ko_steel_discount_rate(84), ko_purchased_discount_rate(94) |
| 日语 | **始终不应用** (仅汇总) | 统一率 0.71/0.72 + 按类别 | discount_rate(71), steel/purchased 可配 |
| 英语 | 按类别 (when `is_complex`) 或不应用 | 跨 sheet 公式引用 | ko_discount_rate, ko_steel_discount_rate, ko_purchased_discount_rate |

### 4.2 价格计算共性

所有案件共享:
- **米计价**: `unit_price × length_mm / 1000`
- **三级降级匹配**: 精确 → strip → normalize (大写去空格)
- **涂层厚度**: 10um → 304; 15/18um → 316 + 规格后缀

### 4.3 产品分类共性

所有案件共享 `_classify_products_single_pass`:
- **排除项**: 导电片/接地/端盖/包角/铭牌/防水
- **地桩**: 关键词匹配 (地桩/地盤杭/PILE)
- **碳钢**: `pricing_attribute in {WTX, WTP}`
- **逆变器**: 名称模式匹配 (逆变器/inverter/インバータ/인버터)
- **铝型材**: 其余全部

### 4.4 地桩价格

- 韩语: 明细中单价设为 0，汇总中单独计算 `pile_summary`
- 日语: 同韩语
- 英语: 同韩语，NV 有 fallback regex `_resolve_pile_price`

---

## 五、新引擎设计建议

### 5.1 配置驱动参数总结

```python
CaseProfile(
    # 明细表
    detail=DetailProfile(
        columns=...,           # 列定义 (10/8/9列)
        font_name=...,         # Malgun Gothic / Meiryo UI / Yu Gothic UI / Arial
        data_start_row=...,    # 10 / 9 / 4 / 8 / 3
        image_col=...,         # 4 或 5
        has_logo=...,          # True / False
        logo_area=...,         # "A3:B6" / "A3:B7" / "A2:C5" / None
        name_field=...,        # name_ko / name_ja / name_en
        show_weight=...,       # True / False / conditional
        delete_empty_rows=..., # True / False
    ),
    # 汇总表
    summary=SummaryProfile(
        template_type=...,     # ko / ko_simple / ko_ksd / ja_est / ja_normal / ja_nv / en / en_common
        language=...,          # ko / ja / en
        has_part2_steel=...,   # ko_ksd 专有
        has_less_column=...,   # ko_ksd 专有
        has_jpy_column=...,    # ja_EST / ja_nv
        has_exchange_rate=..., # ja_EST / ja_nv
        has_ddp_breakdown=..., # ja_EST / ko_normal
        has_fence_block=...,   # ja_EST / ja_normal / ja_nv
        has_spare_parts=...,   # ja_nv 专有
        has_seller_buyer=...,  # en_common 专有
        discount_in_detail=...,# True / False / conditional
        default_discount_rate=..., # 1.0 / 0.71 / 0.72
    ),
)
```

### 5.2 需要独立实现的模块

| 模块 | 差异程度 | 建议 |
|------|---------|------|
| BOM ZIP 解析 (韩语) | ko_simple/ko_ksd 共用 | 一个函数 + 配置 |
| BOM ZIP 解析 (日语) | ja_EST 自定义 XML 级 | 独立策略 |
| BOM 预解析 (日语/英语) | 共享 `_build_products_by_key` | 统一接口 |
| 明细表渲染 | 3种列布局 × 3种字体 × 多种选项 | 配置驱动 + 条件分支 |
| 汇总表渲染 | **8种完全不同的模板** | 8个独立渲染函数 |
| 阵列匹配 | 1轮/3轮/5轮 | 配置 passes 参数 |
| 围栏处理 | 无/简单/完整 | 3级策略 |
| 逆变器处理 | 混入/独立sheet | 配置化 |
