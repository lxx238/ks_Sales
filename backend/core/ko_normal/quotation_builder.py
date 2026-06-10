from backend.core.quotation_engine import (
    analyze_unmatched_codes as engine_analyze_unmatched_codes,
    create_quotation_from_dataframe as engine_create_quotation_from_dataframe,
    delete_empty_weight_rows_and_renumber as engine_delete_empty_weight_rows_and_renumber,
    split_and_create_quotations as engine_split_and_create_quotations,
)


def create_quotation_from_dataframe(*args, **kwargs):
    return engine_create_quotation_from_dataframe(*args, **kwargs)


def delete_empty_weight_rows_and_renumber(*args, **kwargs):
    return engine_delete_empty_weight_rows_and_renumber(*args, **kwargs)


def split_and_create_quotations(*args, **kwargs):
    return engine_split_and_create_quotations(*args, **kwargs)


def analyze_unmatched_codes(*args, **kwargs):
    return engine_analyze_unmatched_codes(*args, **kwargs)
