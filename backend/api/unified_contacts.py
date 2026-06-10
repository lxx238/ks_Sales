from flask import Blueprint, jsonify, request

from backend.repositories.user_repository import (
    add_unified_contact,
    delete_unified_contact,
    ensure_default_unified_contacts,
    get_unified_contact,
    list_unified_contacts,
    update_unified_contact,
)

unified_contacts_bp = Blueprint('unified_contacts', __name__, url_prefix='/api/ucontacts')


@unified_contacts_bp.get('')
def api_list():
    ensure_default_unified_contacts()
    group = request.args.get('group', '')
    contacts = list_unified_contacts(group=group or None)
    return jsonify({'success': True, 'data': contacts})


@unified_contacts_bp.get('/<int:contact_id>')
def api_get(contact_id):
    row = get_unified_contact(contact_id)
    if not row:
        return jsonify({'success': False, 'message': '联系人不存在'}), 404
    return jsonify({'success': True, 'data': row})


@unified_contacts_bp.post('')
def api_add():
    d = request.get_json(silent=True) or {}
    name_china = str(d.get('name_china', '')).strip()
    nickname = str(d.get('nickname', '')).strip()
    mob = str(d.get('mob', '')).strip()
    tel = str(d.get('tel', '')).strip()
    fax = str(d.get('fax', '')).strip()
    email = str(d.get('email', '')).strip()
    group = str(d.get('group', '')).strip()
    if not name_china:
        return jsonify({'success': False, 'message': '姓名不能为空'}), 400
    if not group:
        return jsonify({'success': False, 'message': '分组不能为空'}), 400
    new_id = add_unified_contact(name_china, nickname, mob, tel, fax, email, group)
    return jsonify({'success': True, 'data': {'id': new_id}})


@unified_contacts_bp.put('/<int:contact_id>')
def api_update(contact_id):
    d = request.get_json(silent=True) or {}
    name_china = str(d.get('name_china', '')).strip()
    nickname = str(d.get('nickname', '')).strip()
    mob = str(d.get('mob', '')).strip()
    tel = str(d.get('tel', '')).strip()
    fax = str(d.get('fax', '')).strip()
    email = str(d.get('email', '')).strip()
    group = str(d.get('group', '')).strip()
    if not name_china:
        return jsonify({'success': False, 'message': '姓名不能为空'}), 400
    if not group:
        return jsonify({'success': False, 'message': '分组不能为空'}), 400
    update_unified_contact(contact_id, name_china, nickname, mob, tel, fax, email, group)
    return jsonify({'success': True})


@unified_contacts_bp.delete('/<int:contact_id>')
def api_delete(contact_id):
    delete_unified_contact(contact_id)
    return jsonify({'success': True})
