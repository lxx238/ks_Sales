from flask import Blueprint, jsonify, request

from backend.services.auth_service import ensure_permission
from backend.services.upload_service import (
    get_global_price_status,
    upload_bom_file,
    upload_matrix_file,
    upload_price_file,
)


upload_bp = Blueprint('upload', __name__, url_prefix='/api')


@upload_bp.get('/get-global-price-status')
def get_global_price_status_route():
    ensure_permission('quotation')
    payload, status = get_global_price_status()
    return jsonify(payload), status


@upload_bp.post('/upload-bom')
def upload_bom_route():
    ensure_permission('quotation')
    payload, status = upload_bom_file(request.files.get('file'))
    return jsonify(payload), status


@upload_bp.post('/upload-matrix')
def upload_matrix_route():
    ensure_permission('quotation')
    group = request.form.get('group') or None
    ap_case_type = request.form.get('ap_case_type') or None
    payload, status = upload_matrix_file(request.files.get('file'), group=group, ap_case_type=ap_case_type)
    return jsonify(payload), status


@upload_bp.post('/upload-price')
def upload_price_route():
    ensure_permission('quotation')
    set_as_global = request.form.get('set_as_global', 'false').lower() == 'true'
    payload, status = upload_price_file(request.files.get('file'), set_as_global=set_as_global)
    return jsonify(payload), status
