from backend.core.shared.bom_utils import (
    collect_bom_products as engine_collect_bom_products,
    extract_bom_dataframe as engine_extract_bom_dataframe,
    extract_config_info as engine_extract_config_info,
    get_bom_processing_rules as engine_get_bom_processing_rules,
    list_bom_tables as engine_list_bom_tables,
    read_bom_from_dataframe as engine_read_bom_from_dataframe,
)


def get_bom_processing_rules():
    return engine_get_bom_processing_rules()


def collect_bom_products(input_file, selected_bom_keys=None):
    return engine_collect_bom_products(input_file, selected_bom_keys=selected_bom_keys)


def list_bom_tables(input_file):
    return engine_list_bom_tables(input_file)


def read_bom_from_dataframe(dataframe):
    return engine_read_bom_from_dataframe(dataframe)


def extract_config_info(dataframe, start_row, total_rows):
    return engine_extract_config_info(dataframe, start_row, total_rows)


def extract_bom_dataframe(dataframe, bom_info, index, all_bom_starts, total_rows, column_mapping, skip_keywords):
    return engine_extract_bom_dataframe(
        dataframe,
        bom_info,
        index,
        all_bom_starts,
        total_rows,
        column_mapping,
        skip_keywords,
    )
