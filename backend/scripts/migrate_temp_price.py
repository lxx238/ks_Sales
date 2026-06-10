import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from backend.api.temp_price import (
    TBL_M, PRICE_COLS, CURRENCIES, MAT_TON_TIERS, MAT_LEN_TIERS,
    SIDE_KEYS,
)
from backend.config.settings import get_db_connection

OLD_COLS_MAP = {}
for cur in CURRENCIES:
    cur_label = cur['label']
    for side_key, side_label in [('int', '内部'), ('ext', '外部')]:
        for len_key, len_label in [('01', '0-1'), ('13', '1-3'), ('3', '3+')]:
            old_col = f'{cur_label}-{side_label}({len_label})'
            new_col = f'{SIDE_KEYS[side_key]}_50-999_{len_label}_{cur["key"]}'
            OLD_COLS_MAP[old_col] = new_col


def migrate():
    from backend.config.settings import DATABASE_PATH
    print(f'数据库路径: {DATABASE_PATH}')
    c = get_db_connection()

    existing = {r[1] for r in c.execute(f'PRAGMA table_info({TBL_M})').fetchall()}
    if not existing:
        print('temp_material_pricing 表不存在，无需迁移')
        c.close()
        return

    has_old = any(col in existing for col in OLD_COLS_MAP.keys())
    has_new = any(col in existing for col in PRICE_COLS[:4])

    if not has_old and has_new:
        print('已经是新格式，无需迁移')
        c.close()
        return

    print(f'发现旧表 {len(existing)} 列，开始迁移...')

    base_cols = ['工程编码', '规格说明', '工程品名', '计价单位', '单重', '定价属性', '吨价类型']
    existing_base = [col for col in base_cols if col in existing]

    rows = c.execute(f'SELECT * FROM {TBL_M}').fetchall()
    print(f'共 {len(rows)} 条数据')

    old_cols_in_table = [col for col in OLD_COLS_MAP.keys() if col in existing]

    c.execute(f'DROP TABLE IF EXISTS {TBL_M}_old')
    c.execute(f'ALTER TABLE {TBL_M} RENAME TO {TBL_M}_old')

    base_def = ', '.join(f'"{col}" TEXT' for col in existing_base)
    pk_col = '工程编码' if '工程编码' in existing_base else existing_base[0]
    base_def = base_def.replace(f'"{pk_col}" TEXT', f'"{pk_col}" TEXT PRIMARY KEY')
    price_def = ', '.join(f'"{col}" REAL' for col in PRICE_COLS)
    c.execute(f'CREATE TABLE {TBL_M} ({base_def},{price_def})')

    migrated = 0
    for row in rows:
        vals = {}
        for col in existing_base:
            vals[col] = row[col]

        for old_col, new_col in OLD_COLS_MAP.items():
            if old_col in existing:
                vals[new_col] = row[old_col]

        for new_col in PRICE_COLS:
            if new_col not in vals:
                vals[new_col] = None

        cols_sql = ', '.join(f'"{k}"' for k in vals.keys())
        placeholders = ', '.join(['?'] * len(vals))
        c.execute(f'INSERT INTO {TBL_M} ({cols_sql}) VALUES ({placeholders})', list(vals.values()))
        migrated += 1

    c.commit()
    print(f'迁移完成: {migrated} 条数据')

    c.execute(f'DROP TABLE {TBL_M}_old')
    c.commit()
    print('旧表已删除')

    new_count = len({r[1] for r in c.execute(f'PRAGMA table_info({TBL_M})').fetchall()})
    print(f'新表列数: {new_count}')
    c.close()


if __name__ == '__main__':
    migrate()
