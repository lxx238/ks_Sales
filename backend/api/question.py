from flask import Blueprint, jsonify, request

from backend.services.auth_service import ensure_permission, get_current_account
from backend.services.question_service import (
    close_question_item,
    get_question_detail,
    get_question_list,
    reply_question,
    submit_question,
)


question_bp = Blueprint('question', __name__, url_prefix='/api/questions')


def get_actor_role():
    account = get_current_account(optional=True)
    if account:
        return str(account.get('role') or '').strip()
    return request.headers.get('X-KS-Role', '').strip()


def get_actor_user():
    account = get_current_account(optional=True)
    if account:
        return str(account.get('username') or '').strip()
    return request.headers.get('X-KS-User', '').strip()


@question_bp.get('')
def list_questions_route():
    ensure_permission('questions')
    payload, status = get_question_list(
        request.args,
        get_actor_role(),
        get_actor_user(),
    )
    return jsonify(payload), status


@question_bp.get('/<int:question_id>')
def get_question_route(question_id):
    ensure_permission('questions')
    payload, status = get_question_detail(question_id)
    return jsonify(payload), status


@question_bp.post('')
def submit_question_route():
    ensure_permission('questions')
    payload, status = submit_question(
        request.get_json(silent=True),
        get_actor_user(),
        get_actor_role(),
    )
    return jsonify(payload), status


@question_bp.post('/<int:question_id>/reply')
def reply_question_route(question_id):
    ensure_permission('questions')
    payload, status = reply_question(
        question_id=question_id,
        data=request.get_json(silent=True),
        actor_role=get_actor_role(),
        actor_user=get_actor_user(),
    )
    return jsonify(payload), status


@question_bp.post('/<int:question_id>/close')
def close_question_route(question_id):
    ensure_permission('questions')
    payload, status = close_question_item(
        question_id=question_id,
        actor_role=get_actor_role(),
        actor_user=get_actor_user(),
    )
    return jsonify(payload), status
