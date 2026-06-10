from flask import Blueprint, jsonify, request

from backend.services.auth_service import ensure_permission
from backend.services.quotation_service import (
    download_output_file,
    download_standard_price_file,
    generate_quotation_db_only,
)
from backend.repositories.material_repository import fetch_material_rows
from backend.utils.converters import parse_price_value
from backend.utils.constants import DB_PRICE_COLUMN, DB_CODE_COLUMN


quotation_bp = Blueprint('quotation', __name__, url_prefix='/api')


@quotation_bp.get('/material-price/<code>')
def get_material_price_route(code):
    ensure_permission('quotation')
    rows = fetch_material_rows([code])
    if not rows:
        return jsonify({'success': False, 'message': '物料未找到'}), 404
    price = parse_price_value(rows[0].get(DB_PRICE_COLUMN))
    return jsonify({'success': True, 'code': rows[0].get(DB_CODE_COLUMN, ''), 'price': price})


@quotation_bp.post('/generate')
def generate_quotation_route():
    ensure_permission('quotation')
    payload, status = generate_quotation_db_only(request.get_json(silent=True))
    return jsonify(payload), status


@quotation_bp.get('/download/<file_id>')
def download_file_route(file_id):
    ensure_permission('quotation')
    result = download_output_file(file_id)
    if isinstance(result, tuple):
        payload, status = result
        return jsonify(payload), status
    return result


@quotation_bp.get('/download-standard/<file_id>')
def download_standard_file_route(file_id):
    ensure_permission('quotation')
    result = download_standard_price_file(file_id)
    if isinstance(result, tuple):
        payload, status = result
        return jsonify(payload), status
    return result
