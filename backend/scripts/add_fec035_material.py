"""为 FEC035 在 temp_material_pricing 补建物料行（从 aluminum_pricing 取单重/属性/单位），再重算两套包装价。"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from backend.config.settings import get_db_connection
from backend.utils.constants import DB_TABLE_NAME
from backend.api.temp_price import TBL_M, PRICE_COLS

CODE = 'FEC035'

c = get_db_connection()
try:
    # 从铝价库取属性
    row = c.execute(f'SELECT * FROM {DB_TABLE_NAME} WHERE "工程编码"=?', [CODE]).fetchone()
    if not row:
        print(f'{CODE} 不在 {DB_TABLE_NAME}，无法补建')
        sys.exit(1)
    d = dict(row)
    spec = str(d.get('规格说明') or '').strip()
    name = str(d.get('工程品名') or '').strip()
    unit = str(d.get('计价单位') or '米').strip()
    attr = str(d.get('定价属性') or '').strip()
    weight = None
    for col in ('单重', '米重/km', '参考重量', '重量'):
        raw = d.get(col)
        if raw is None or str(raw).strip() in ('', '暂无数据'):
            continue
        try:
            v = float(str(raw).replace(',', '').strip())
            if v > 0:
                weight = v
                break
        except (TypeError, ValueError):
            continue
    ton_type = CODE.replace('-', '_') if CODE.startswith('FEPJ') else CODE

    # 已存在则跳过
    exists = c.execute(f'SELECT 1 FROM {TBL_M} WHERE "工程编码"=?', [CODE]).fetchone()
    if exists:
        print(f'{CODE} 已存在物料行，更新单重/属性')
        c.execute(
            f'UPDATE {TBL_M} SET "规格说明"=?, "工程品名"=?, "计价单位"=?, "单重"=?, "定价属性"=?, "吨价类型"=? WHERE "工程编码"=?',
            [spec, name, unit, weight, attr, ton_type, CODE],
        )
    else:
        c.execute(
            f'INSERT INTO {TBL_M} ("工程编码","规格说明","工程品名","计价单位","单重","定价属性","吨价类型") VALUES (?,?,?,?,?,?,?)',
            [CODE, spec, name, unit, weight, attr, ton_type],
        )
    c.commit()
    print(f'已补建/更新 {CODE}: 单重={weight} 单位={unit} 属性={attr} 吨价类型={ton_type}')
finally:
    c.close()

# 重算两套包装价
from backend.scripts.recompute_material_packs import recompute
recompute()
