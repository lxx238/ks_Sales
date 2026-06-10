import re

_UNMAPPED_ZH_RE = re.compile(
    r'[\u4e00-\u9fff\u3400-\u4dbf\U00020000-\U0002a6df]'
)

MATERIAL_ZH_TO_JA = {
    '镀锌': '亜鉛メッキ',
    '热镀锌': '溶融亜鉛メッキ',
    '冷镀锌': '電気亜鉛メッキ',
    '不锈钢': 'ステンレス',
    '浸塑': '浸塑',
    '铝合金': 'アルミ合金',
    '铝': 'アルミ',
    '碳钢': '炭素鋼',
    '橡胶': 'ゴム',
    '塑料': 'プラスチック',
    '尼龙': 'ナイロン',
    '铁': '鉄',
    '铜': '銅',
    '硅胶': 'シリコン',
    '镁': 'マグネシウム',
}

MATERIAL_ZH_TO_EN = {
    '镀锌铝镁': '',
    '热镀锌': 'HDG',
    '镀锌': 'Galvanized',
    '冷镀锌': 'Electro-galvanized',
    '不锈钢': 'Stainless Steel',
    '浸塑': 'Dip Coated',
    '铝合金': 'Aluminum Alloy',
    '铝': 'Aluminum',
    '碳钢': 'Carbon Steel',
    '橡胶': 'Rubber',
    '塑料': 'Plastic',
    '尼龙': 'Nylon',
    '铁': 'Iron',
    '铜': 'Copper',
    '硅胶': 'Silicone',
    '镁': 'Magnesium',
    '平均': 'Average ',
    '局部': 'Part ',
}

MATERIAL_ZH_TO_KO = {
    '镀锌': '아연도금',
    '热镀锌': '용융아연도금',
    '冷镀锌': '전기아연도금',
    '不锈钢': '스테인리스',
    '浸塑': '비닐피복',
    '铝合金': '알루미늄합금',
    '铝': '알루미늄',
    '碳钢': '탄소강',
    '橡胶': '고무',
    '塑料': '플라스틱',
    '尼龙': '나일론',
    '铁': '철',
    '铜': '구리',
    '硅胶': '실리콘',
    '镁': '마그네슘',
}


_translate_cache = {}


def translate_material(raw_material, target='ja'):
    if not raw_material:
        return ''
    cache_key = (str(raw_material), target)
    if cache_key in _translate_cache:
        return _translate_cache[cache_key]
    mat = str(raw_material)
    if target == 'ja':
        mapping = MATERIAL_ZH_TO_JA
    elif target == 'en':
        mapping = MATERIAL_ZH_TO_EN
    elif target == 'ko':
        mapping = MATERIAL_ZH_TO_KO
    else:
        mapping = MATERIAL_ZH_TO_JA
    for zh, translated in mapping.items():
        mat = mat.replace(zh, translated)
    if target in ('ko', 'en'):
        mat = _UNMAPPED_ZH_RE.sub('', mat)
    if target == 'en':
        mat = re.sub(r'(?<=\d)μ(?![mM])', ' μm', mat)
        mat = mat.replace('，', ', ')
        mat = re.sub(r'\s*≥\s*', ' ≥ ', mat)
        mat = re.sub(r'\s+', ' ', mat)
    _translate_cache[cache_key] = mat
    return mat


def adjust_material_by_coating(material, coating_thickness=10):
    if not material:
        return material
    mat = str(material)
    try:
        thickness = int(coating_thickness)
    except (ValueError, TypeError):
        thickness = 10
    if thickness <= 10:
        mat = mat.replace('SUS304/316', 'SUS304')
        mat = mat.replace('SUS316', 'SUS304')
    else:
        mat = mat.replace('SUS304/316', 'SUS316')
        mat = mat.replace('SUS304', 'SUS316')
    return mat
