"""重算 temp_material_pricing 的两套包装价格（简易包装/铁托），与 update_prices 口径一致。"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from backend.api.temp_price import (
    TBL_S, TBL_M, CURRENCIES, VALID_SIDE_TON, MAT_TON_TIERS, MAT_LEN_TIERS,
    TIERS, TON_TIERS, PACK_KEYS, PRICE_COL_MAP,
)
from backend.config.settings import get_db_connection


def _f(v):
    try:
        return float(v)
    except (ValueError, TypeError):
        return 0.0


def recompute():
    c = get_db_connection()
    try:
        s = c.execute(f'SELECT * FROM {TBL_S} WHERE id=1').fetchone()
        s_cols = s.keys()
        rows = c.execute(f'SELECT "工程编码","单重" FROM {TBL_M}').fetchall()
        updated = 0
        for r in rows:
            w = _f(r['单重'])
            if w <= 0:
                continue
            code = r['工程编码'] or ''
            if code.startswith('FEPJ'):
                tp_type = code.replace('-', '_')
            else:
                tp_type = code.split('-')[0] if '-' in code else code
            is_pj = tp_type.startswith('FEPJ_')
            price_vals = {}
            for pk in PACK_KEYS:
                for side, ton in VALID_SIDE_TON:
                    ton_settings_key = TON_TIERS[MAT_TON_TIERS.index(ton)]
                    for li, length in enumerate(MAT_LEN_TIERS):
                        len_settings_key = TIERS[li]
                        for cur in CURRENCIES:
                            ck = cur['key']
                            has_rate = cur['has_rate']
                            col = PRICE_COL_MAP[(side, ton, length, ck, pk)]
                            if side == 'int':
                                k = (f'ton_{tp_type}_int_{ton_settings_key}_{pk}' if is_pj
                                     else f'ton_{tp_type}_int_{len_settings_key}_{ton_settings_key}_{pk}')
                                ton_val = _f(s[k] if k in s_cols else None)
                                if has_rate:
                                    ex = _f(s[f'exchange_rate_{ck}'] if f'exchange_rate_{ck}' in s_cols else None)
                                    pt = _f(s[f'points_{ck}'] if f'points_{ck}' in s_cols else None)
                                    price_vals[col] = round(w * ton_val / ex / pt, 6) if ex > 0 and pt > 0 else 0
                                else:
                                    price_vals[col] = round(w * ton_val, 6)
                            else:
                                k = (f'ton_{tp_type}_ext_50999_{pk}' if is_pj
                                     else f'ton_{tp_type}_ext_{len_settings_key}_50999_{pk}')
                                ton_val = _f(s[k] if k in s_cols else None)
                                if has_rate:
                                    ex = _f(s[f'exchange_rate_{ck}'] if f'exchange_rate_{ck}' in s_cols else None)
                                    pt = _f(s[f'points_{ck}'] if f'points_{ck}' in s_cols else None)
                                    price_vals[col] = round(w * ton_val / ex / pt, 6) if ex > 0 and pt > 0 else 0
                                else:
                                    price_vals[col] = round(w * ton_val, 6)
            set_sql = ', '.join(f'"{col}"=?' for col in price_vals)
            c.execute(f'UPDATE {TBL_M} SET {set_sql} WHERE "工程编码"=?', list(price_vals.values()) + [r['工程编码']])
            updated += 1
        c.commit()
        print(f'recompute done: {updated} materials, both packs')
    finally:
        c.close()


if __name__ == '__main__':
    recompute()
