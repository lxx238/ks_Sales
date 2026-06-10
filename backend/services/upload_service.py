import uuid
from datetime import datetime

from werkzeug.utils import secure_filename

from backend.config.settings import GLOBAL_PRICE_INFO, UPLOAD_FOLDER
from backend.core.bom_parser import list_bom_tables
from backend.core import extract_matrix_data
from backend.core.price_matcher import extract_pricing_data, load_price_mapping
from backend.excel.reader import get_sheet_names
from backend.utils.file_utils import allowed_file, cleanup_file


def _save_uploaded_file(file_storage):
    if file_storage is None:
        raise ValueError('没有上传文件')
    if not file_storage.filename:
        raise ValueError('文件名为空')
    if not allowed_file(file_storage.filename):
        raise ValueError('只支持.xlsx和.xls文件')

    file_id = str(uuid.uuid4())
    original_filename = file_storage.filename
    file_ext = original_filename.rsplit('.', 1)[-1].lower()
    filename = secure_filename(original_filename)
    if '.' not in filename:
        filename = f'{file_id}.{file_ext}'
    saved_filename = f'{file_id}.{file_ext}'
    filepath = UPLOAD_FOLDER / saved_filename
    file_storage.save(str(filepath))
    return file_id, filename, filepath


def get_global_price_status():
    has_global_price = GLOBAL_PRICE_INFO['file_id'] is not None
    return {
        'success': True,
        'has_global_price': has_global_price,
        'filename': GLOBAL_PRICE_INFO['filename'] if has_global_price else None,
        'standard_filename': GLOBAL_PRICE_INFO.get('standard_filename') if has_global_price else None,
        'upload_time': GLOBAL_PRICE_INFO['upload_time'] if has_global_price else None,
        'price_count': GLOBAL_PRICE_INFO['price_count'] if has_global_price else 0,
        'message': '全局价格表状态查询成功',
    }, 200


def upload_bom_file(file_storage):
    filepath = None
    try:
        file_id, filename, filepath = _save_uploaded_file(file_storage)
        sheet_names = get_sheet_names(filepath)
        bom_tables = list_bom_tables(filepath)
        return {
            'success': True,
            'file_id': file_id,
            'filename': filename,
            'sheet_count': len(sheet_names),
            'sheet_names': sheet_names,
            'bom_table_count': len(bom_tables),
            'bom_tables': bom_tables,
            'message': 'BOM表上传成功',
        }, 200
    except ValueError as exc:
        if filepath:
            cleanup_file(filepath)
        return {'success': False, 'message': str(exc)}, 400
    except Exception as exc:
        if filepath:
            cleanup_file(filepath)
        return {'success': False, 'message': f'文件读取失败: {exc}'}, 400


def upload_matrix_file(file_storage, group=None):
    filepath = None
    try:
        file_id, filename, filepath = _save_uploaded_file(file_storage)
        matrix_data = extract_matrix_data(filepath, group=group)
        return {
            'success': True,
            'file_id': file_id,
            'filename': filename,
            'project_name': matrix_data['project_name'],
            'output_kw': matrix_data['output_kw'],
            'output_wp': matrix_data['output_wp'],
            'set_count': matrix_data['set_count'],
            'array_rows': matrix_data.get('array_rows'),
            'array_cols': matrix_data.get('array_cols'),
            'max_wind_speed': matrix_data.get('max_wind_speed'),
            'max_snow_load': matrix_data.get('max_snow_load'),
            'module_wattage': matrix_data.get('module_wattage'),
            'module_size': matrix_data.get('module_size'),
            'arrays': matrix_data.get('arrays'),
            'message': '阵列表上传成功',
        }, 200
    except ValueError as exc:
        if filepath:
            cleanup_file(filepath)
        message = str(exc)
        if '阵列表' in message:
            return {'success': False, 'message': f'阵列表解析失败: {message}'}, 400
        return {'success': False, 'message': message}, 400
    except Exception as exc:
        if filepath:
            cleanup_file(filepath)
        return {'success': False, 'message': f'上传失败: {exc}'}, 500


def upload_price_file(file_storage, set_as_global=False):
    filepath = None
    try:
        file_id, filename, filepath = _save_uploaded_file(file_storage)
        standard_price_file = None
        standard_file_id = None

        try:
            result_df = extract_pricing_data(filepath)
            standard_price_filename = f'{file_id}_standard.xlsx'
            standard_price_file = UPLOAD_FOLDER / standard_price_filename
            result_df.to_excel(standard_price_file, index=False, engine='openpyxl')
            standard_file_id = file_id
            price_mapping = load_price_mapping(standard_price_file)
        except Exception as exc:
            print(f'⚠️ 标准定价表生成失败，使用原始价格表: {exc}')
            standard_price_filename = None
            price_mapping = load_price_mapping(filepath)

        meter_count = sum(
            1 for value in price_mapping.values()
            if value['unit'] in ['米', 'm', 'M', 'meter', 'Meter']
        )
        piece_count = sum(
            1 for value in price_mapping.values()
            if value['unit'] in ['个', '套', '支', '件', 'PCS', 'pcs']
        )

        if set_as_global and standard_price_file:
            GLOBAL_PRICE_INFO['file_id'] = file_id
            GLOBAL_PRICE_INFO['filename'] = filename
            GLOBAL_PRICE_INFO['standard_filename'] = standard_price_filename
            GLOBAL_PRICE_INFO['standard_file'] = str(standard_price_file)
            GLOBAL_PRICE_INFO['upload_time'] = datetime.now().isoformat()
            GLOBAL_PRICE_INFO['price_count'] = len(price_mapping)

        message = '价格表上传成功，已自动生成标准定价表'
        if set_as_global:
            message += '，并已设置为全局价格表'

        return {
            'success': True,
            'file_id': file_id,
            'filename': filename,
            'price_count': len(price_mapping),
            'meter_unit_count': meter_count,
            'piece_unit_count': piece_count,
            'standard_file_id': standard_file_id,
            'message': message,
        }, 200
    except ValueError as exc:
        if filepath:
            cleanup_file(filepath)
        return {'success': False, 'message': str(exc)}, 400
    except Exception as exc:
        if filepath:
            cleanup_file(filepath)
        return {'success': False, 'message': f'上传失败: {exc}'}, 500
