from flask import Blueprint, jsonify, request

from backend.repositories.quotation_log_repository import get_dashboard_daily, get_overview_stats, get_today_detail, get_user_detail
from backend.repositories.user_repository import list_accounts


def _get_admin_usernames():
    accounts = list_accounts()
    return [a['username'] for a in accounts if a.get('role') == 'admin' and a.get('username')]


def _get_group_members():
    accounts = list_accounts()
    admin_set = set(_get_admin_usernames())
    group_members = {}
    china_name_map = {}
    for a in accounts:
        uname = a.get('username', '')
        if not uname or uname in admin_set:
            continue
        if not a.get('enabled', True):
            continue
        group = a.get('group') or ''
        if not group:
            continue
        group_members.setdefault(group, []).append(uname)
        china_name_map[uname] = a.get('name', '') or uname
    return group_members, china_name_map


public_dashboard_bp = Blueprint('public_dashboard', __name__, url_prefix='/api/public/dashboard')


@public_dashboard_bp.get('/data')
def dashboard_data():
    days = request.args.get('days', 10, type=int)
    if days < 1:
        days = 10
    if days > 90:
        days = 90

    exclude_usernames = _get_admin_usernames()
    group_members, china_name_map = _get_group_members()

    result = get_dashboard_daily(days=days, exclude_usernames=exclude_usernames)
    day_strings = result['day_strings']
    date_labels = result['date_labels']
    user_daily = result['user_daily']
    user_group_from_logs = result['user_group']

    groups = {}
    all_usernames = set()
    for group_name, members in group_members.items():
        groups[group_name] = {}
        for username in members:
            daily_data = user_daily.get(username, {})
            counts = [daily_data.get(day, 0) for day in day_strings]
            groups[group_name][username] = {
                'name': china_name_map.get(username, username),
                'daily': counts,
            }
            all_usernames.add(username)

    for username, group_name in user_group_from_logs.items():
        if username in all_usernames:
            continue
        daily_data = user_daily.get(username, {})
        counts = [daily_data.get(day, 0) for day in day_strings]
        groups.setdefault(group_name, {})[username] = {
            'name': china_name_map.get(username, username),
            'daily': counts,
        }
        all_usernames.add(username)

    return jsonify({
        'success': True,
        'data': {
            'date_labels': date_labels,
            'days': days,
            'groups': groups,
        },
    })


@public_dashboard_bp.get('/overview')
def dashboard_overview():
    exclude_usernames = _get_admin_usernames()
    stats = get_overview_stats(exclude_usernames=exclude_usernames)
    return jsonify({'success': True, 'data': stats})


@public_dashboard_bp.get('/today-detail')
def dashboard_today_detail():
    date_str = request.args.get('date', '').strip()
    if date_str:
        import re
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
            return jsonify({'success': False, 'error': 'invalid date format, use YYYY-MM-DD'}), 400
    else:
        date_str = None
    exclude_usernames = _get_admin_usernames()
    _, china_name_map = _get_group_members()
    detail = get_today_detail(exclude_usernames=exclude_usernames, date_str=date_str)

    groups = {}
    for username, info in detail.items():
        g = info['group_name']
        groups.setdefault(g, {})[username] = {
            'name': china_name_map.get(username, username),
            'total': info['total'],
            'by_type': info['by_type'],
        }

    return jsonify({'success': True, 'data': groups})


@public_dashboard_bp.get('/member-detail')
def dashboard_member_detail():
    username = request.args.get('username', '').strip()
    if not username:
        return jsonify({'success': False, 'error': 'username required'}), 400
    admin_usernames = _get_admin_usernames()
    if username in admin_usernames:
        return jsonify({'success': False, 'error': 'not found'}), 404
    _, china_name_map = _get_group_members()
    detail = get_user_detail(username)
    if not detail:
        return jsonify({'success': False, 'error': 'no data'}), 404
    detail['display_name'] = china_name_map.get(username, username)
    return jsonify({'success': True, 'data': detail})
