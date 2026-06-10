from flask import Blueprint, jsonify, request

from backend.services.auth_service import ensure_permission
from backend.services.cad_assistant_service import (
    chat_with_cad_session,
    create_cad_session,
    delete_cad_session,
)


cad_assistant_bp = Blueprint('cad_assistant', __name__, url_prefix='/api/cad-assistant')


@cad_assistant_bp.post('/sessions')
def create_cad_session_route():
    ensure_permission('cad')
    payload, status = create_cad_session(request.files.get('file'))
    return jsonify(payload), status


@cad_assistant_bp.post('/chat')
def cad_assistant_chat_route():
    ensure_permission('cad')
    payload, status = chat_with_cad_session(request.get_json(silent=True))
    return jsonify(payload), status


@cad_assistant_bp.delete('/sessions/<session_id>')
def delete_cad_session_route(session_id):
    ensure_permission('cad')
    payload, status = delete_cad_session(session_id)
    return jsonify(payload), status
