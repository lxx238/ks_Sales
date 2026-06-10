from backend.utils.file_utils import cleanup_files_by_ids


def cleanup_upload_files(data):
    if data is None:
        return {'success': False, 'message': '请求体不能为空，请发送JSON格式的数据'}, 400

    file_ids = data.get('file_ids', [])
    cleanup_files_by_ids(file_ids)
    return {
        'success': True,
        'message': f'已清理 {len(file_ids)} 个临时文件（报价表保存在output目录）',
    }, 200
