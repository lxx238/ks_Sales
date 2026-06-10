from backend.core.quotation_engine import (
    create_inquiry_sheet as engine_create_inquiry_sheet,
    save_inquiry_sheet_to_file as engine_save_inquiry_sheet_to_file,
)


def create_inquiry_sheet(workbook, unmatched_products, source_sheet_name, inquiry_requester=''):
    return engine_create_inquiry_sheet(
        workbook,
        unmatched_products,
        source_sheet_name,
        inquiry_requester=inquiry_requester,
    )


def save_inquiry_sheet_to_file(unmatched_products, output_dir, input_filename=None, inquiry_requester=''):
    return engine_save_inquiry_sheet_to_file(
        unmatched_products,
        output_dir,
        input_filename,
        inquiry_requester=inquiry_requester,
    )
