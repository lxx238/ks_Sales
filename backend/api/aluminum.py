from flask import Blueprint, jsonify, request

from backend.repositories.material_repository import list_table_columns as list_aluminum_table_columns
from backend.utils.constants import DB_TABLE_NAME
from backend.services.aluminum_service import (
    approve_aluminum_change_request,
    batch_update_prices_from_excel,
    add_aluminum_column,
    create_aluminum,
    delete_aluminum,
    download_aluminum_database,
    export_aluminum_images,
    get_aluminum_by_id,
    get_aluminum_list,
    import_aluminum_images,
    import_aluminum_images_from_excel,
    list_aluminum_change_requests,
    reject_aluminum_change_request,
    submit_aluminum_change_request,
    update_aluminum,
    withdraw_aluminum_change_request,
)
from backend.services.auth_service import ensure_permission, get_current_account


aluminum_bp = Blueprint('aluminum', __name__, url_prefix='/api/aluminum')


def build_service_response(result):
    if isinstance(result, tuple):
        payload, status = result
        return jsonify(payload), status
    return result


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


@aluminum_bp.get('/list')
def get_aluminum_list_route():
    ensure_permission('database')
    payload, status = get_aluminum_list(request.args)
    return jsonify(payload), status


@aluminum_bp.get('/change-requests')
def list_change_requests_route():
    ensure_permission('records')
    payload, status = list_aluminum_change_requests(
        request.args,
        get_actor_role(),
        get_actor_user(),
    )
    return jsonify(payload), status


@aluminum_bp.post('/change-requests')
def submit_change_request_route():
    ensure_permission('database_submit')
    payload, status = submit_aluminum_change_request(
        request.get_json(silent=True),
        get_actor_user(),
        get_actor_role(),
    )
    return jsonify(payload), status


@aluminum_bp.post('/change-requests/<int:request_id>/approve')
def approve_change_request_route(request_id):
    ensure_permission('records_review')
    payload, status = approve_aluminum_change_request(
        request_id=request_id,
        data=request.get_json(silent=True),
        actor_role=get_actor_role(),
        actor_user=get_actor_user(),
    )
    return jsonify(payload), status


@aluminum_bp.post('/change-requests/<int:request_id>/reject')
def reject_change_request_route(request_id):
    ensure_permission('records_review')
    payload, status = reject_aluminum_change_request(
        request_id=request_id,
        data=request.get_json(silent=True),
        actor_role=get_actor_role(),
        actor_user=get_actor_user(),
    )
    return jsonify(payload), status


@aluminum_bp.post('/change-requests/<int:request_id>/withdraw')
def withdraw_change_request_route(request_id):
    ensure_permission('records')
    payload, status = withdraw_aluminum_change_request(
        request_id=request_id,
        data=request.get_json(silent=True),
        actor_role=get_actor_role(),
        actor_user=get_actor_user(),
    )
    return jsonify(payload), status


@aluminum_bp.get('/images/export')
def export_aluminum_images_route():
    ensure_permission('database')
    return build_service_response(export_aluminum_images(get_actor_role()))


@aluminum_bp.post('/images/import')
def import_aluminum_images_route():
    ensure_permission('database_submit')
    files = request.files.getlist('files')
    if not files:
        single_file = request.files.get('file')
        if single_file:
            files = [single_file]

    uploaded = files[0] if files else None
    if uploaded and uploaded.filename and uploaded.filename.lower().endswith(('.xlsx', '.xls')):
        return build_service_response(import_aluminum_images_from_excel(uploaded, get_actor_role(), get_actor_user()))

    payload, status = import_aluminum_images(files, get_actor_role(), get_actor_user())
    return jsonify(payload), status


@aluminum_bp.post('/prices/batch-update')
def batch_update_prices_route():
    ensure_permission('database_submit')
    file_storage = request.files.get('file')
    payload, status = batch_update_prices_from_excel(file_storage, get_actor_role(), get_actor_user())
    return jsonify(payload), status


@aluminum_bp.get('/database/download')
def download_aluminum_database_route():
    ensure_permission('database_download')
    return build_service_response(download_aluminum_database(get_actor_role()))


@aluminum_bp.get('/columns')
def get_aluminum_columns_route():
    ensure_permission('database')
    columns = list_aluminum_table_columns(DB_TABLE_NAME)
    return jsonify({'success': True, 'columns': columns})


@aluminum_bp.get('/<record_id>')
def get_aluminum_by_id_route(record_id):
    ensure_permission('database')
    payload, status = get_aluminum_by_id(record_id)
    return jsonify(payload), status


@aluminum_bp.post('/create')
def create_aluminum_route():
    ensure_permission('database_submit')
    payload, status = create_aluminum(
        request.get_json(silent=True),
        get_actor_role(),
    )
    return jsonify(payload), status


@aluminum_bp.put('/<record_id>')
def update_aluminum_route(record_id):
    ensure_permission('database_submit')
    payload, status = update_aluminum(
        record_id,
        request.get_json(silent=True),
        get_actor_role(),
    )
    return jsonify(payload), status


@aluminum_bp.delete('/<record_id>')
def delete_aluminum_route(record_id):
    ensure_permission('database_submit')
    payload, status = delete_aluminum(record_id, get_actor_role())
    return jsonify(payload), status


@aluminum_bp.post('/add-column')
def add_column_route():
    ensure_permission('database_submit')
    payload, status = add_aluminum_column(
        request.get_json(silent=True),
        get_actor_role(),
    )
    return jsonify(payload), status
