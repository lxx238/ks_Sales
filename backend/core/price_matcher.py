from backend.core.price_extractor import extract_pricing_data as engine_extract_pricing_data
from backend.core.shared.price_utils import (
    has_valid_price_info as engine_has_valid_price_info,
    load_price_mapping as engine_load_price_mapping,
    resolve_price_info as engine_resolve_price_info,
)


def extract_pricing_data(input_path, output_path=None):
    return engine_extract_pricing_data(input_path, output_path)


def load_price_mapping(price_file_path):
    return engine_load_price_mapping(price_file_path)


def resolve_price_info(price_mapping, product_code, spec=None):
    return engine_resolve_price_info(price_mapping, product_code, spec=spec)


def has_valid_price_info(price_info):
    return engine_has_valid_price_info(price_info)
