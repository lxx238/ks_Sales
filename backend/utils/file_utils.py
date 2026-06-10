import os
from pathlib import Path

from backend.config.settings import GLOBAL_PRICE_INFO, LEGACY_UPLOAD_FOLDER, OUTPUT_FOLDER, UPLOAD_FOLDER
from backend.utils.constants import ALLOWED_EXTENSIONS


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def cleanup_file(filepath):
    try:
        path = Path(filepath)
        if path.exists():
            path.unlink()
    except Exception as exc:
        print(f'清理文件失败: {exc}')


def cleanup_files_by_ids(file_ids, folder=None):
    target_folder = Path(folder or UPLOAD_FOLDER)
    cleaned_count = 0

    if not target_folder.exists():
        return cleaned_count

    for file_id in file_ids:
        for path in target_folder.iterdir():
            if path.name.startswith(file_id):
                cleanup_file(path)
                cleaned_count += 1

    return cleaned_count


def find_file_by_prefix(file_id, folders, prefer_standard=False):
    if not file_id:
        return None

    for folder in folders:
        folder_path = Path(folder)
        if not folder_path.is_dir():
            continue

        if prefer_standard:
            standard_path = folder_path / f'{file_id}_standard.xlsx'
            if standard_path.exists():
                return str(standard_path)

        for filename in os.listdir(folder_path):
            if filename.startswith(file_id):
                path = folder_path / filename
                if path.exists():
                    return str(path)
    return None


def resolve_price_file(file_id):
    return find_file_by_prefix(file_id, [UPLOAD_FOLDER, LEGACY_UPLOAD_FOLDER], prefer_standard=True)


def resolve_bom_file(file_id):
    return find_file_by_prefix(file_id, [UPLOAD_FOLDER, LEGACY_UPLOAD_FOLDER])


def resolve_matrix_file(file_id):
    return find_file_by_prefix(file_id, [UPLOAD_FOLDER, LEGACY_UPLOAD_FOLDER])


def resolve_latest_price_file():
    candidates = []

    for folder in [UPLOAD_FOLDER, LEGACY_UPLOAD_FOLDER]:
        folder_path = Path(folder)
        if not folder_path.is_dir():
            continue

        for path in folder_path.iterdir():
            if path.suffix.lower() not in {'.xlsx', '.xls'}:
                continue
            try:
                mtime = path.stat().st_mtime
            except OSError:
                continue
            is_standard = '_standard' in path.name.lower()
            candidates.append((is_standard, mtime, str(path)))

    if not candidates:
        return None

    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return candidates[0][2]


def resolve_global_price_file(global_price_info=None):
    state = global_price_info or GLOBAL_PRICE_INFO

    if state.get('standard_file') and Path(state['standard_file']).exists():
        return state['standard_file']

    global_file_id = state.get('file_id')
    if global_file_id:
        resolved = resolve_price_file(global_file_id)
        if resolved and resolved.endswith('_standard.xlsx'):
            state['standard_file'] = resolved
        return resolved

    return None


def resolve_price_for_request(price_file_id, global_price_info=None):
    if price_file_id:
        price_file = resolve_price_file(price_file_id)
        if price_file:
            return price_file, 'specified', Path(price_file).name

        price_file = resolve_global_price_file(global_price_info)
        if price_file:
            state = global_price_info or GLOBAL_PRICE_INFO
            return price_file, 'global', state.get('filename')

        price_file = resolve_latest_price_file()
        if price_file:
            return price_file, 'latest', Path(price_file).name

        return None, 'missing_specified', None

    price_file = resolve_global_price_file(global_price_info)
    if price_file:
        state = global_price_info or GLOBAL_PRICE_INFO
        return price_file, 'global', state.get('filename')

    price_file = resolve_latest_price_file()
    if price_file:
        return price_file, 'latest', Path(price_file).name

    return None, 'missing_global', None


def find_output_file(file_id):
    return find_file_by_prefix(file_id, [OUTPUT_FOLDER])


def find_standard_file(file_id):
    if not file_id:
        return None

    folder = Path(UPLOAD_FOLDER)
    if not folder.is_dir():
        return None

    for path in folder.iterdir():
        if path.name.startswith(file_id) and '_standard.xlsx' in path.name:
            return str(path)
    return None
