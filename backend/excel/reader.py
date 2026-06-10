import importlib.util
import os

import pandas as pd


XLS_EXTENSION = '.xls'
OPENPYXL_EXTENSIONS = {'.xlsx', '.xlsm', '.xltx', '.xltm'}


def get_excel_engine(file_path):
    extension = os.path.splitext(os.fspath(file_path))[1].lower()

    if extension == XLS_EXTENSION:
        if importlib.util.find_spec('xlrd') is None:
            raise ImportError(
                '当前环境缺少 xlrd，无法读取 .xls 文件。请安装 xlrd>=2.0.1 后重试。'
            )
        return 'xlrd'

    if extension in OPENPYXL_EXTENSIONS:
        return 'openpyxl'

    return None


def read_excel_compat(file_path, **kwargs):
    engine = get_excel_engine(file_path)
    if engine and 'engine' not in kwargs:
        kwargs['engine'] = engine
    return pd.read_excel(file_path, **kwargs)


def excel_file_compat(file_path, **kwargs):
    engine = get_excel_engine(file_path)
    if engine and 'engine' not in kwargs:
        kwargs['engine'] = engine
    return pd.ExcelFile(file_path, **kwargs)


def get_sheet_names(file_path):
    return excel_file_compat(file_path).sheet_names
