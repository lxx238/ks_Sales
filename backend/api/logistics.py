from flask import Blueprint, request, jsonify, send_from_directory, Response

from backend.services.logistics_service import (
    create_session,
    generate_stream,
    save_json as svc_save_json,
    extract_pages as svc_extract_pages,
    run_script as svc_run_script,
    chat_stream as svc_chat_stream,
    get_session_dirs,
    sse_pack,
)

logistics_bp = Blueprint('logistics', __name__, url_prefix='/api/logistics')


@logistics_bp.post('/session')
def create_session_route():
    try:
        session_id = create_session()
        return jsonify({'ok': True, 'sessionId': session_id})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@logistics_bp.post('/generate')
def generate_route():
    session_id = request.form.get('sessionId', '')
    if not session_id:
        return jsonify({'ok': False, 'error': '缺少sessionId'}), 400

    from backend.services.logistics_service import get_session_dirs
    dirs = get_session_dirs(session_id)
    import os
    if not os.path.exists(dirs['base']):
        return jsonify({'ok': False, 'error': '会话不存在，请刷新页面'}), 400

    pdf_file = request.files.get('pdf')
    if not pdf_file:
        return jsonify({'ok': False, 'error': '请上传PDF文件'}), 400

    pallet_qty = int(request.form.get('palletQty', '0'))
    kit_qty = int(request.form.get('kitQty', '0'))
    chinese_qty = int(request.form.get('chineseQty', '0'))
    pallet_remarks = request.form.get('palletRemarks', '')
    kit_remarks = request.form.get('kitRemarks', '')
    chinese_remarks = request.form.get('chineseRemarks', '')
    api_base = request.form.get('apiBase', 'https://open.bigmodel.cn/api/anthropic').rstrip('/')
    api_key = request.form.get('apiKey', '')
    model = request.form.get('model', 'glm-5.1')
    send_mode = request.form.get('sendMode', 'both')

    if not api_key:
        return jsonify({'ok': False, 'error': '请填写API Key'}), 400

    pdf_bytes = pdf_file.read()
    pdf_filename = pdf_file.filename

    def event_stream():
        try:
            for chunk in generate_stream(
                pdf_bytes, pdf_filename, pallet_qty, kit_qty, chinese_qty,
                pallet_remarks, kit_remarks, chinese_remarks,
                api_base, api_key, model, send_mode, session_id
            ):
                yield chunk
        except Exception as e:
            yield sse_pack({'type': 'error', 'msg': str(e)})

    return Response(event_stream(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@logistics_bp.post('/save-json')
def save_json_route():
    session_id = request.json.get('sessionId', '')
    if not session_id:
        return jsonify({'ok': False, 'error': '缺少sessionId'}), 400

    filename = request.json.get('filename', '')
    json_data = request.json.get('data')
    if not filename or json_data is None:
        return jsonify({'ok': False, 'error': '缺少参数'}), 400

    ok, msg = svc_save_json(session_id, filename, json_data)
    if ok:
        return jsonify({'ok': True, 'saved': msg})
    return jsonify({'ok': False, 'error': msg}), 400


@logistics_bp.post('/run-script')
def run_script_route():
    session_id = request.json.get('sessionId', '')
    if not session_id:
        return jsonify({'ok': False, 'error': '缺少sessionId'}), 400

    lang = request.json.get('lang', 'en')
    ok, result, filename = svc_run_script(session_id, lang)

    if ok is False and filename is None:
        return jsonify({'ok': False, 'error': result}), 400

    if ok:
        return jsonify({
            'ok': True,
            'filename': filename,
            'stdout': result.get('stdout', ''),
            'stderr': result.get('stderr', ''),
        })
    return jsonify({
        'ok': False,
        'error': result.get('stderr', '') if isinstance(result, dict) else str(result),
        'stdout': result.get('stdout', '') if isinstance(result, dict) else '',
    }), 500


@logistics_bp.post('/extract-pages')
def extract_pages_route():
    session_id = request.json.get('sessionId', '')
    if not session_id:
        return jsonify({'ok': False, 'error': '缺少sessionId'}), 400

    page_input = request.json.get('pages', '').strip()
    if not page_input:
        return jsonify({'ok': False, 'error': '请输入页码'}), 400

    ok, error, data = svc_extract_pages(session_id, page_input)
    if not ok:
        return jsonify({'ok': False, 'error': error}), 400
    return jsonify({'ok': True, **data})


@logistics_bp.get('/download/<session_id>/<filename>')
def download_file_route(session_id, filename):
    dirs = get_session_dirs(session_id)
    return send_from_directory(dirs['output'], filename, as_attachment=True)


@logistics_bp.post('/chat')
def chat_route():
    session_id = request.json.get('sessionId', '')
    if not session_id:
        return jsonify({'ok': False, 'error': '缺少sessionId'}), 400

    message = request.json.get('message', '').strip()
    if not message:
        return jsonify({'ok': False, 'error': '消息不能为空'}), 400

    def event_stream():
        for chunk in svc_chat_stream(session_id, message):
            yield chunk

    return Response(event_stream(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})
