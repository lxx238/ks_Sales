from flask import Blueprint, jsonify, request

from backend.services.auth_service import ensure_permission
from backend.services.cleanup_service import cleanup_upload_files


cleanup_bp = Blueprint('cleanup', __name__, url_prefix='/api')


@cleanup_bp.post('/cleanup')
def cleanup_files_route():
    ensure_permission('quotation')
    payload, status = cleanup_upload_files(request.get_json(silent=True))
    return jsonify(payload), status
