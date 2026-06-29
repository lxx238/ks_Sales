"""打印/页面设置模块。

集中管理各案件工作表的页面打印参数，并支持「按业务员个人习惯」覆盖。

设计要点
--------
* ``CASE_DEFAULTS``：每个案件的默认打印参数（提取自原各引擎中的硬编码值，保证向后兼容）。
* ``SHEET_DEFAULTS``：案件内个别 sheet 与案件默认不同时的覆盖键
  （仅 ``en_common_total_materials``、``ja_nv_fence`` 两处）。
* ``resolve_print_settings(case_key, sheet_key)``：默认值（sheet > case > 全局回退）
  与「当前登录用户的个人习惯覆盖（按 case）」合并后的最终参数。
* ``apply_print_setup(ws, case_key, sheet_key)``：把最终参数写回 openpyxl worksheet。

个人习惯存储位置：``accounts.preferences.print[case_key]``，复用既有
``update_user_preferences`` / ``POST /api/auth/me/preferences`` 接口。
用户未设置时自动回退到本模块的默认值（零回归）。
"""

from openpyxl.worksheet.page import PageMargins

# 字段集合
PRINT_FIELDS = (
    'orientation',
    'fit_mode',
    'horizontal_centered',
    'margin_top',
    'margin_bottom',
    'margin_left',
    'margin_right',
)
VALID_ORIENTATIONS = ('portrait', 'landscape')
VALID_FIT_MODES = ('fit_width', 'fit_one')

# 全局回退（最保守默认）
GLOBAL_FALLBACK = {
    'orientation': 'portrait',
    'fit_mode': 'fit_width',
    'horizontal_centered': False,
    'margin_top': 0.75,
    'margin_bottom': 0.75,
    'margin_left': 0.7,
    'margin_right': 0.7,
}

_CM = 1.0 / 2.54  # 厘米转英寸系数
_JA_TOP = 1.2 * _CM
_JA_BOTTOM = 0.4 * _CM
_JA_SIDE = 1.2 * _CM

# 各案件默认（英寸）。键名与案件模块一致：ko_normal / ko_simple / ko_ksd /
# ja_EST / ja_normal / ja_nv / en_simple / en_common / ap_common / ja(旧通用)
CASE_DEFAULTS = {
    'ko_normal': {
        'orientation': 'portrait', 'fit_mode': 'fit_width',
        'horizontal_centered': False,
        'margin_top': 0.75, 'margin_bottom': 0.75, 'margin_left': 0.7, 'margin_right': 0.7,
    },
    'ko_simple': {
        'orientation': 'portrait', 'fit_mode': 'fit_width',
        'horizontal_centered': False,
        'margin_top': 0.75, 'margin_bottom': 0.75, 'margin_left': 0.7, 'margin_right': 0.7,
    },
    'ko_ksd': {
        'orientation': 'portrait', 'fit_mode': 'fit_width',
        'horizontal_centered': False,
        'margin_top': 0.75, 'margin_bottom': 0.75, 'margin_left': 0.7, 'margin_right': 0.7,
    },
    'ja_EST': {
        'orientation': 'portrait', 'fit_mode': 'fit_width',
        'horizontal_centered': False,
        'margin_top': 0.75, 'margin_bottom': 0.75, 'margin_left': 0.7, 'margin_right': 0.7,
    },
    'ja_normal': {
        'orientation': 'portrait', 'fit_mode': 'fit_width',
        'horizontal_centered': True,
        'margin_top': _JA_TOP, 'margin_bottom': _JA_BOTTOM,
        'margin_left': _JA_SIDE, 'margin_right': _JA_SIDE,
    },
    'ja_nv': {
        'orientation': 'portrait', 'fit_mode': 'fit_width',
        'horizontal_centered': False,
        'margin_top': 0.75, 'margin_bottom': 0.75, 'margin_left': 0.25, 'margin_right': 0.25,
    },
    'en_simple': {
        'orientation': 'portrait', 'fit_mode': 'fit_width',
        'horizontal_centered': False,
        'margin_top': 0.75, 'margin_bottom': 0.75, 'margin_left': 0.7, 'margin_right': 0.7,
    },
    'en_common': {
        'orientation': 'portrait', 'fit_mode': 'fit_width',
        'horizontal_centered': False,
        'margin_top': 0.5, 'margin_bottom': 0.5, 'margin_left': 0.25, 'margin_right': 0.25,
    },
    'ap_common': {
        'orientation': 'landscape', 'fit_mode': 'fit_width',
        'horizontal_centered': False,
        'margin_top': 0.75, 'margin_bottom': 0.75, 'margin_left': 0.7, 'margin_right': 0.7,
    },
    'ap_ground': {
        'orientation': 'portrait', 'fit_mode': 'fit_width',
        'horizontal_centered': False,
        'margin_top': 0.5, 'margin_bottom': 0.5, 'margin_left': 0.4, 'margin_right': 0.4,
    },
    'ja': {  # 旧版/通用日语引擎
        'orientation': 'portrait', 'fit_mode': 'fit_width',
        'horizontal_centered': False,
        'margin_top': 0.75, 'margin_bottom': 0.75, 'margin_left': 0.7, 'margin_right': 0.7,
    },
}

# 案件内个别 sheet 与案件默认不同时的覆盖（仅这两处）
SHEET_DEFAULTS = {
    'en_common_total_materials': {
        'margin_left': 0.4, 'margin_right': 0.4,
    },
    'ja_nv_fence': {
        'horizontal_centered': True,
        'margin_top': _JA_TOP, 'margin_bottom': _JA_BOTTOM,
        'margin_left': _JA_SIDE, 'margin_right': _JA_SIDE,
    },
}


def _coerce(field, value):
    """校验/规整单个字段，非法时返回 None。"""
    if field == 'orientation':
        v = str(value).strip().lower()
        return v if v in VALID_ORIENTATIONS else None
    if field == 'fit_mode':
        v = str(value).strip().lower()
        return v if v in VALID_FIT_MODES else None
    if field == 'horizontal_centered':
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in ('true', '1', 'yes', 'on')
        return bool(value)
    # 边距：浮点，>=0
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if f >= 0 else None


def _get_user_print_override(case_key):
    """读取当前登录用户对该案件的打印习惯覆盖（来自 Flask session）。

    在非请求上下文（如离线/CLI 调用）或读取失败时返回空 dict，回退默认值。
    """
    try:
        from flask import has_app_context, session
        if not has_app_context():
            return {}
        username = (session.get('ks_auth_username') or '').strip()
        if not username:
            return {}
        from backend.repositories.user_repository import get_account_by_username
        account = get_account_by_username(username)
        if not account:
            return {}
        prefs = account.get('preferences') or {}
        print_cfg = (prefs.get('print') or {}).get(case_key)
        return print_cfg if isinstance(print_cfg, dict) else {}
    except Exception:
        return {}


def resolve_print_settings(case_key, sheet_key=None):
    """合并 默认值(sheet>case>全局) 与 用户覆盖(按case) → 最终打印参数 dict。"""
    result = dict(GLOBAL_FALLBACK)
    result.update(CASE_DEFAULTS.get(case_key, {}))
    if sheet_key and sheet_key in SHEET_DEFAULTS:
        result.update(SHEET_DEFAULTS[sheet_key])

    override = _get_user_print_override(case_key)
    if isinstance(override, dict):
        for field in PRINT_FIELDS:
            if field in override:
                coerced = _coerce(field, override[field])
                if coerced is not None:
                    result[field] = coerced
    return result


def apply_print_setup(ws, case_key, sheet_key=None):
    """把最终打印参数写回 openpyxl worksheet。"""
    s = resolve_print_settings(case_key, sheet_key)
    ws.page_setup.orientation = s['orientation']
    ws.page_setup.paperSize = 9  # A4
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = 1
    if s['fit_mode'] == 'fit_one':
        ws.page_setup.fitToHeight = 1  # 全部设为一页
    else:
        ws.page_setup.fitToHeight = 0  # 所有列一页，高度自动
    ws.print_options.horizontalCentered = bool(s['horizontal_centered'])
    ws.page_margins = PageMargins(
        top=s['margin_top'],
        bottom=s['margin_bottom'],
        left=s['margin_left'],
        right=s['margin_right'],
        header=0.3,
        footer=0.3,
    )
