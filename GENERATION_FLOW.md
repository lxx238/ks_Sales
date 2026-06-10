# 8 种案件生成报价完整流程

## 总体架构

```
API请求 → quotation_service.generate_quotation_db_only()
    → 1. 解析矩阵表 (extract_matrix_data)
    → 2. 解析BOM文件 (collect_bom_products / ja_build / en_parse)
    → 3. 加载物料映射 (fetch_material_mapping)
    → 4. 自动注册缺失编码 (auto_register_missing_codes)
    → 5. 临时编码回退 (fetch_temp_code_fallback / fetch_temp_material_pricing_fallback)
    → 6. 构建分析统计 (build_bom_analysis)
    → 7. 生成报价Excel (split_and_create_quotations → 对应builder)
    → 8. 暂存输出文件 (stage_generated_file)
    → 9. 返回结果
```

## 1. 韩语 NORMAL (ko_normal)

**入口**: `engine/builders/ko_normal.py` → `backend.core.ko_normal.quotation_builder.split_and_create_quotations`

**流程**:
1. **矩阵解析**: `parsers/matrix/ko.py` — 解析韩语矩阵表，提取阵列信息、项目名、功率
2. **BOM解析**: `parsers/bom_parser.py` `collect_bom_products` → ZIP快速优先 + pandas回退
   - 读取BOM每个sheet，按配置分割多BOM区段
   - 提取产品编码、名称、规格、数量
3. **阵列匹配**: `matching/array_matcher.py` — 1轮精确匹配
   - `build_matrix_array_entries` 从矩阵数据提取阵列条目
   - `find_matching_matrix_array` 精确匹配BOM区段与阵列
4. **物料匹配**: `matching/material_matcher.py`
   - 从SQLite加载物料行(价格、名称_ko、重量、材质、图片)
   - 15/18um地桩价格覆写
   - 延迟图片加载(仅加载有重量的物料)
5. **报价生成**:
   - **明细表**: 10列韩文(NO, 품명, 규격, 이미지, 재질, 수량, 단가, 중량, 금액, 비고)
   - **汇总表**: ko模板 — Part1产品金额 + Part2运费/杂费
   - 字体: Malgun Gothic 16pt
   - 图片: 120×80px
6. **输出**: `【견적서】项目名_日期.xlsx`

## 2. 韩语 SIMPLE (ko_simple)

**入口**: `engine/builders/ko_simple.py` → `backend.core.ko_simple.quotation_builder.split_and_create_quotations`

**流程**:
1. **矩阵解析**: 同韩语NORMAL
2. **BOM解析**: pandas快速扫描模式(zip_first) — 不做完整ZIP解析
3. **阵列匹配**: 4轮匹配(精确 → base_count → 放松missing → 完全放松)
4. **物料匹配**: 同韩语NORMAL + `auto_register_missing_codes`
5. **报价生成**:
   - **明细表**: 同10列韩文
   - **汇总表**: ko_simple模板 — 仅Part1，无运费
6. **输出**: `【견적서】项目名_日期.xlsx`

## 3. 韩语 KSD (ko_ksd)

**入口**: `engine/builders/ko_ksd.py` → `backend.core.ko_ksd.quotation_builder.split_and_create_quotations`

**流程**:
1. **矩阵解析**: 同韩语NORMAL
2. **BOM解析**: pandas快速扫描，预解析BOM数据
3. **阵列匹配**: 4轮匹配
4. **物料匹配**: 同韩语NORMAL + `auto_register_missing_codes`
5. **报价生成**:
   - **明细表**: 同10列韩文
   - **汇总表**: ko_ksd模板 — Part1 + Part2碳钢运费 + Part2地桩(如有)
6. **输出**: `【견적서】项目名_日期.xlsx`

## 4. 日语 EST (ja_EST)

**入口**: `engine/builders/ja_est.py` → `backend.core.ja_EST.quotation_builder.split_and_create_quotations`

**流程**:
1. **矩阵解析**: `parsers/matrix/ja.py` — 解析日语矩阵表
2. **BOM解析**: 预解析模式 — `ja_build` 一次解析所有BOM sheet
   - 提取products_by_key, bom_info_by_key, bom_configs
   - 逆变器产品单独提取(inverter_products_all)
3. **阵列匹配**: 3轮匹配(精确 → base_count+missing → 放松)
4. **物料匹配**: 从SQLite加载，含图片
5. **报价生成**:
   - **明细表**: 8列日文(NO, 品名, 規格, 画像, 材質, 数量, 単価, 金額)
   - **汇总表**: ja_est模板 — 5块汇总(Part1~Part5) + CIF/DDP双汇总
   - **逆变器sheet**: 独立sheet(如有逆变器产品)
   - 字体: Meiryo UI 11pt
   - 图片: 100×65px
   - 折扣: 在明细表内直接打折(discount_in_detail=True)
6. **参数**: tariff_rate, consumption_tax, fence_tax, discount_rate, truck_fee
7. **输出**: `【御見積書】项目名_日期.xlsx`

## 5. 日语 NORMAL (ja_normal)

**入口**: `engine/builders/ja_normal.py` → `backend.core.ja_normal.quotation_builder.split_and_create_quotations`

**流程**:
1. **矩阵解析**: 同日语EST
2. **BOM解析**: 复用EST预解析结果
3. **阵列匹配**: 1轮精确匹配
4. **物料匹配**: 同日语EST
5. **报价生成**:
   - **明细表**: 同8列日文
   - **汇总表**: ja_normal模板 — 简化汇总，无围栏/DDP
   - 字体/图片同EST
6. **输出**: `【御見積書】项目名_日期.xlsx`

## 6. 日语 NV (ja_NV)

**入口**: `engine/builders/ja_nv.py` → `backend.core.ja_NV.quotation_builder.split_and_create_quotations`

**流程**:
1. **矩阵解析**: 同日语EST
2. **BOM解析**: 复用EST预解析结果
3. **阵列匹配**: 5轮匹配(精确 → base_count → missing → info累积 → 完全放松)
4. **物料匹配**: 同日语EST
5. **报价生成**:
   - **明细表**: 同8列日文 + 可选重量/编码列
   - **汇总表**: ja_nv模板 — 5块汇总 + 围栏
   - **备品表**: 独立备品sheet
   - CIF + DDP双汇总
   - nv_params: 包含NV特有参数
6. **输出**: `【御見積書】项目名_日期.xlsx`

## 7. 英语 SIMPLE (en_simple)

**入口**: `engine/builders/en_simple.py` → `backend.core.en_simple.quotation_builder.split_and_create_quotations`

**流程**:
1. **矩阵解析**: `parsers/matrix/en.py` — 自动检测格式
2. **BOM解析**: 预解析模式 — 按sheet逐个解析BOM
   - quick_scan → discover_bom_starts → extract_bom_dataframe → read_bom_from_dataframe
3. **阵列匹配**: 1轮精确匹配
4. **物料匹配**: 从SQLite加载 + `auto_register_missing_codes`
5. **报价生成**:
   - **明细表**: 9列英文(NO, Product Name, Specification, Image, Material, QTY, Unit Price, Weight, Amount/Code)
   - **汇总表**: en模板 — EXW/CIF/DDP三段
   - 字体: Arial 8pt
   - 图片: 90×55px
   - 大氧化价格: `10u大氧化(美元)--组装`
6. **参数**: trade_method, dest_port, container_type/qty, discount_method
7. **输出**: `【Quotation】项目名_日期.xlsx`

## 8. 英语 COMMON (en_common)

**入口**: `engine/builders/en_common.py` → `backend.core.en_common.quotation_builder.split_and_create_quotations`

**流程**:
1. **矩阵解析**: 同英语SIMPLE
2. **BOM解析**: 同英语SIMPLE预解析模式
3. **阵列匹配**: 1轮精确匹配
4. **物料匹配**: 同英语SIMPLE
5. **报价生成**:
   - **明细表**: 同9列英文 + 可含15列扩展(运费等)
   - **汇总表**: en_common模板 — 含运费明细
   - 字体/图片同SIMPLE
6. **参数**: 同SIMPLE + container_details
7. **输出**: `【Quotation】项目名_日期.xlsx`

## 关键差异对照表

| 维度 | 韩语NORMAL | 韩语SIMPLE | 韩语KSD | 日语EST | 日语NORMAL | 日语NV | 英语SIMPLE | 英语COMMON |
|------|-----------|-----------|---------|---------|-----------|--------|-----------|-----------|
| 明细列数 | 10 | 10 | 10 | 8 | 8 | 8 | 9 | 9 |
| 字体 | Malgun 16 | Malgun 16 | Malgun 16 | Meiryo 11 | Meiryo 11 | Meiryo 11 | Arial 8 | Arial 8 |
| 图片尺寸 | 120×80 | 120×80 | 120×80 | 100×65 | 100×65 | 100×65 | 90×55 | 90×55 |
| 阵列匹配轮数 | 1 | 4 | 4 | 3 | 1 | 5(?) | 1 | 1 |
| 汇总模板 | ko | ko_simple | ko_ksd | ja_est | ja_normal | ja_nv | en | en_common |
| 价格列 | 小氧化 | 小氧化 | 小氧化 | 小氧化 | 小氧化 | 小氧化 | 大氧化 | 大氧化 |
| BOM解析模式 | full | zip_first | zip_first | pre_parse | pre_parse | pre_parse | pre_parse | pre_parse |
| 折扣在明细 | 否 | 否 | 否 | 是 | 是 | 是 | 否 | 否 |
| 逆变器sheet | 否 | 否 | 否 | 是 | 否 | 否 | 否 | 否 |

## 新系统配置驱动

所有上述差异由 `config/profiles.py` 中的 `CaseProfile` 统一描述:

```python
from new_backend.config.profiles import resolve_profile
profile = resolve_profile(group='日语组', case_type='NV')

profile.detail.columns       # 8列日文
profile.detail.font_name     # 'Meiryo UI'
profile.detail.discount_in_detail  # True
profile.summary.template_type      # 'ja_nv'
profile.array_match_passes         # 3
profile.bom_parse_mode             # 'pre_parse'
```

## 迁移策略

当前 8 个构建器(builder)通过委托模式(Delegate)调用旧代码 `backend.core.*`:
- 好处: 立即可用，渐进式迁移
- 下一步: 逐个将旧 builder 逻辑移植到 `整理代码/new_backend/engine/builders/` 中对应文件
- 完成后: 移除 `backend.*` 依赖，实现完全自包含
