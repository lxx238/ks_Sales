from datetime import datetime

from flask import Blueprint, jsonify


health_bp = Blueprint('health', __name__, url_prefix='/api')


@health_bp.get('/health')
def health_check():
    return jsonify({
        'status': 'ok',
        'timestamp': datetime.now().isoformat(),
        'message': 'BOM智能报价系统运行正常',
    })
