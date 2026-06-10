from .bom_parser import collect_bom_products, read_bom_from_dataframe
from .material_matcher import build_bom_material_context, fetch_material_mapping
from .price_matcher import has_valid_price_info, load_price_mapping, resolve_price_info


def extract_matrix_data(matrix_file, group=None):
    if group == '日语组':
        from backend.core.ja_EST.matrix_parser import extract_matrix_data as ja_extract
        try:
            return ja_extract(matrix_file)
        except Exception:
            from backend.core.ko_normal.matrix_parser import extract_matrix_data as ko_extract
            return ko_extract(matrix_file)
    if group == '英语组':
        from backend.core.en_simple.matrix_parser import extract_matrix_data as en_extract
        return en_extract(matrix_file)
    from backend.core.ko_normal.matrix_parser import extract_matrix_data as ko_extract
    return ko_extract(matrix_file)


def split_and_create_quotations(*args, **kwargs):
    group = kwargs.get('group')
    case_type = kwargs.get('case_type', 'EST')
    ko_case_type = kwargs.get('ko_case_type', 'NORMAL')
    en_case_type = kwargs.get('en_case_type', 'SIMPLE')
    print(f'[ROUTE] group={group}, en_case_type={en_case_type}, pre_parsed_products={bool(kwargs.get("pre_parsed_products"))}, arrays={len((kwargs.get("matrix_data") or {}).get("arrays") or [])}')
    if group == '日语组' and case_type == 'NV':
        from backend.core.ja_nv.quotation_builder import split_and_create_quotations as nv_split
        return nv_split(*args, **kwargs)
    if group == '日语组' and case_type == 'NORMAL':
        from backend.core.ja_normal.quotation_builder import split_and_create_quotations as normal_split
        return normal_split(*args, **kwargs)
    if group == '日语组':
        from backend.core.ja_EST.quotation_builder import split_and_create_quotations as ja_split
        return ja_split(*args, **kwargs)
    if group == '英语组' and en_case_type == 'COMMON':
        from backend.core.en_common.quotation_builder import split_and_create_quotations as en_common_split
        return en_common_split(*args, **kwargs)
    if group == '英语组':
        from backend.core.en_simple.quotation_builder import split_and_create_quotations as en_split
        return en_split(*args, **kwargs)
    if group == '韩语组' and ko_case_type == 'KSD':
        from backend.core.ko_ksd.quotation_builder import split_and_create_quotations as ksd_split
        return ksd_split(*args, **kwargs)
    if group == '韩语组' and ko_case_type == 'SIMPLE':
        from backend.core.ko_simple.quotation_builder import split_and_create_quotations as simple_split
        return simple_split(*args, **kwargs)
    if group == '韩语组' and ko_case_type == 'NORMAL':
        from backend.core.ko_normal.quotation_builder import split_and_create_quotations as ko_split
        return ko_split(*args, **kwargs)
    from backend.core.ko_normal.quotation_builder import split_and_create_quotations as ko_split
    return ko_split(*args, **kwargs)
