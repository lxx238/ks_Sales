"""吨价设置键加包装后缀迁移：简易包装(_jybz)/铁托(_tietuo)

1) temp_price_settings: 历史吨价列（无包装后缀）→ 重命名为 _jybz，并新建空的 _tietuo 列。
2) temp_material_pricing: 历史价格列（internal_/external_... 无包装后缀）→ 重命名为 _jybz，
   并新建空的 _tietuo 列（随后由「保存并更新价格」重算填充）。
非吨价/基础列保持不变。可重复执行（已是新格式则跳过）。
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from backend.api.temp_price import (
    TBL_S, TBL_M, PACK_KEYS, DEFAULT_PACK,
)
from backend.config.settings import get_db_connection

# temp_material_pricing 基础列（非价格列）
_MATERIAL_BASE_COLS = ['工程编码', '规格说明', '工程品名', '计价单位', '单重', '定价属性', '吨价类型']


def _ton_col_names_for_pack(pack):
    """基于旧吨价列名追加包装后缀（兼容任意动态吨价类型）。"""
    return None  # 由迁移逻辑按实际旧列名生成


def migrate():
    from backend.config.settings import DATABASE_PATH
    print(f'数据库路径: {DATABASE_PATH}')
    c = get_db_connection()

    existing = {r[1] for r in c.execute(f'PRAGMA table_info({TBL_S})').fetchall()}
    if not existing:
        print(f'{TBL_S} 表不存在，启动时会自动建表，无需迁移')
        c.close()
        return

    # 收集旧吨价列（ton_ 开头且无 _jybz/_tietuo 后缀）
    pack_suffixes = tuple(f'_{pk}' for pk in PACK_KEYS)
    old_ton_cols = [
        col for col in existing
        if col.startswith('ton_') and not col.endswith(pack_suffixes)
    ]
    if not old_ton_cols:
        print('已是新格式（吨价列均含包装后缀），无需迁移')
        c.close()
        return

    print(f'发现 {len(old_ton_cols)} 个旧吨价列，开始迁移为「简易包装」...')

    jybz_cols = [f'{old}_{DEFAULT_PACK}' for old in old_ton_cols]
    tietuo_cols = [f'{old}_tietuo' for old in old_ton_cols]

    # 非吨价列（汇率/点数/id/updated_at）保持不变
    other_cols = [col for col in existing if not col.startswith('ton_')]
    if 'id' not in other_cols:
        other_cols.insert(0, 'id')

    rows = c.execute(f'SELECT * FROM {TBL_S}').fetchall()
    print(f'共 {len(rows)} 行数据')

    tmp_table = f'{TBL_S}_new'
    c.execute(f'DROP TABLE IF EXISTS {tmp_table}')

    other_def_parts = []
    for col in other_cols:
        if col == 'id':
            other_def_parts.append('"id" INTEGER PRIMARY KEY DEFAULT 1')
        elif col == 'updated_at':
            other_def_parts.append('"updated_at" TEXT')
        else:
            other_def_parts.append(f'"{col}" REAL')
    ton_def = ', '.join(f'"{col}" REAL' for col in (jybz_cols + tietuo_cols))
    c.execute(f'CREATE TABLE {tmp_table} ({", ".join(other_def_parts)}, {ton_def})')
    c.execute(f'INSERT INTO {tmp_table} (id) VALUES (1)')

    # 旧列名 → 简易包装列名映射
    old_to_jybz = {old: f'{old}_{DEFAULT_PACK}' for old in old_ton_cols}

    migrated = 0
    for row in rows:
        d = dict(row)
        new_row = {'id': d.get('id', 1)}
        # 非吨价列原样保留
        for col in other_cols:
            if col != 'id' and col in d and d[col] is not None:
                new_row[col] = d[col]
        # 旧吨价 → 简易包装
        for old_col, new_col in old_to_jybz.items():
            if old_col in d and d[old_col] is not None:
                new_row[new_col] = d[old_col]
        if len(new_row) > 1:
            set_cols = list(new_row.keys())
            quoted = ', '.join(f'"{col}"' for col in set_cols)
            placeholders = ', '.join(['?'] * len(set_cols))
            c.execute(
                f'INSERT OR REPLACE INTO {tmp_table} ({quoted}) VALUES ({placeholders})',
                list(new_row.values()),
            )
            migrated += 1

    c.commit()
    print(f'迁移完成: {migrated} 行；新建「简易包装」列 {len(jybz_cols)}、「铁托」列 {len(tietuo_cols)}')

    # 原子替换：旧表改名为 _old，新表改名为正式名，再删除旧表
    c.execute(f'DROP TABLE IF EXISTS {TBL_S}_old')
    c.execute(f'ALTER TABLE {TBL_S} RENAME TO {TBL_S}_old')
    c.execute(f'ALTER TABLE {tmp_table} RENAME TO {TBL_S}')
    c.commit()
    c.execute(f'DROP TABLE {TBL_S}_old')
    c.commit()
    print('旧表已删除')

    new_count = len({r[1] for r in c.execute(f'PRAGMA table_info({TBL_S})').fetchall()})
    print(f'新表列数: {new_count}')
    c.close()


def migrate_material_pricing():
    """temp_material_pricing 价格列加包装后缀（简易包装/铁托）。

    历史价格列（internal_/external_ 开头，无 _jybz/_tietuo 后缀）→ 追加 _jybz，
    新建空 _tietuo 列。基础列保持不变。可重复执行。
    """
    c = get_db_connection()
    try:
        existing = {r[1] for r in c.execute(f'PRAGMA table_info({TBL_M})').fetchall()}
        if not existing:
            print(f'{TBL_M} 表不存在，启动时自动建表，无需迁移')
            return
        pack_suffixes = tuple(f'_{pk}' for pk in PACK_KEYS)
        old_price_cols = [
            col for col in existing
            if (col.startswith('internal_') or col.startswith('external_'))
            and not col.endswith(pack_suffixes)
        ]
        if not old_price_cols:
            print(f'{TBL_M} 已是新格式（价格列含包装后缀），无需迁移')
            return

        print(f'{TBL_M}: 发现 {len(old_price_cols)} 个旧价格列，开始迁移为「简易包装」...')
        rows = c.execute(f'SELECT * FROM {TBL_M}').fetchall()
        print(f'共 {len(rows)} 行数据')

        base_cols = [col for col in _MATERIAL_BASE_COLS if col in existing]
        pk_col = '工程编码' if '工程编码' in base_cols else base_cols[0]
        jybz_cols = [f'{old}_{DEFAULT_PACK}' for old in old_price_cols]
        tietuo_cols = [f'{old}_tietuo' for old in old_price_cols]

        tmp_table = f'{TBL_M}_new'
        c.execute(f'DROP TABLE IF EXISTS {tmp_table}')
        base_def = ', '.join(f'"{col}" TEXT' for col in base_cols)
        base_def = base_def.replace(f'"{pk_col}" TEXT', f'"{pk_col}" TEXT PRIMARY KEY')
        price_def = ', '.join(f'"{col}" REAL' for col in (jybz_cols + tietuo_cols))
        c.execute(f'CREATE TABLE {tmp_table} ({base_def}, {price_def})')

        old_to_jybz = {old: f'{old}_{DEFAULT_PACK}' for old in old_price_cols}
        migrated = 0
        for row in rows:
            d = dict(row)
            new_row = {col: d[col] for col in base_cols if col in d}
            for old_col, new_col in old_to_jybz.items():
                if old_col in d and d[old_col] is not None:
                    new_row[new_col] = d[old_col]
            set_cols = list(new_row.keys())
            quoted = ', '.join(f'"{col}"' for col in set_cols)
            placeholders = ', '.join(['?'] * len(set_cols))
            c.execute(f'INSERT OR REPLACE INTO {tmp_table} ({quoted}) VALUES ({placeholders})', list(new_row.values()))
            migrated += 1

        c.commit()
        print(f'{TBL_M} 迁移完成: {migrated} 行；简易包装列 {len(jybz_cols)}、铁托列 {len(tietuo_cols)}（铁托需在临时价格设置点「保存并更新价格」重算）')

        c.execute(f'DROP TABLE IF EXISTS {TBL_M}_old')
        c.execute(f'ALTER TABLE {TBL_M} RENAME TO {TBL_M}_old')
        c.execute(f'ALTER TABLE {tmp_table} RENAME TO {TBL_M}')
        c.commit()
        c.execute(f'DROP TABLE {TBL_M}_old')
        c.commit()
        print(f'{TBL_M} 旧表已删除')
    finally:
        c.close()


if __name__ == '__main__':
    migrate()
    migrate_material_pricing()
