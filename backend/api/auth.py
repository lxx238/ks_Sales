from flask import Blueprint, jsonify, request, send_file

from backend.services.auth_service import (
    delete_account_item,
    generate_import_template,
    get_current_user,
    import_account_items,
    import_dingtalk_userids,
    list_account_items,
    login_user,
    logout_user,
    reset_account_items,
    reset_account_password,
    save_my_preferences,
    toggle_account_item,
    upsert_account_item,
)


auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


@auth_bp.post('/login')
def login_route():
    payload, status = login_user(request.get_json(silent=True))
    return jsonify(payload), status


@auth_bp.post('/logout')
def logout_route():
    payload, status = logout_user()
    return jsonify(payload), status


@auth_bp.get('/me')
def current_user_route():
    payload, status = get_current_user()
    return jsonify(payload), status


@auth_bp.post('/me/preferences')
def save_preferences_route():
    payload, status = save_my_preferences(request.get_json(silent=True))
    return jsonify(payload), status


@auth_bp.get('/accounts')
def list_accounts_route():
    payload, status = list_account_items()
    return jsonify(payload), status


@auth_bp.post('/accounts')
def upsert_account_route():
    payload, status = upsert_account_item(request.get_json(silent=True))
    return jsonify(payload), status


@auth_bp.post('/accounts/import')
def import_accounts_route():
    file = request.files.get('file')
    payload, status = import_account_items(file)
    return jsonify(payload), status


@auth_bp.post('/accounts/import-userids')
def import_userids_route():
    file = request.files.get('file')
    payload, status = import_dingtalk_userids(file)
    return jsonify(payload), status


@auth_bp.get('/accounts/import-template')
def download_import_template_route():
    buffer = generate_import_template()
    return send_file(
        buffer,
        as_attachment=True,
        download_name='账号导入模板.xlsx',
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )


@auth_bp.post('/accounts/<username>/password')
def reset_password_route(username):
    payload, status = reset_account_password(username, request.get_json(silent=True))
    return jsonify(payload), status


@auth_bp.post('/accounts/<username>/toggle')
def toggle_account_route(username):
    payload, status = toggle_account_item(username, request.get_json(silent=True))
    return jsonify(payload), status


@auth_bp.delete('/accounts/<username>')
def delete_account_route(username):
    payload, status = delete_account_item(username)
    return jsonify(payload), status


@auth_bp.post('/accounts/reset')
def reset_accounts_route():
    payload, status = reset_account_items()
    return jsonify(payload), status
