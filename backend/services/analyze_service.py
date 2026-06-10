from time import perf_counter

from backend.core.material_matcher import build_bom_material_context
from backend.utils.file_utils import resolve_bom_file
from backend.utils.validators import ensure_json_payload, ensure_required_value


def log_analyze(message):
    print(f'[ANALYZE] {message}', flush=True)


def analyze_bom_db_only(data):
    started_at = perf_counter()
    try:
        ensure_json_payload(data)
        bom_file_id = data.get('bom_file_id')
        selected_bom_keys = data.get('selected_bom_keys') or []
        group = data.get('group')
        ensure_required_value(bom_file_id, '缺少 BOM 文件 ID')
        log_analyze(
            f'request received, bom_file_id={bom_file_id}, selected_bom_count={len(selected_bom_keys)}, group={group}'
        )

        bom_file = resolve_bom_file(bom_file_id)
        if not bom_file:
            log_analyze(f'bom file not found, bom_file_id={bom_file_id}')
            return {'success': False, 'message': 'BOM 文件不存在'}, 400

        log_analyze(f'resolved bom path: {bom_file}')
        ctx = build_bom_material_context(
            bom_file,
            selected_bom_keys=selected_bom_keys,
            group=group,
        )
        _, material_mapping, analysis_result = ctx[0], ctx[1], ctx[2]
        analysis_result['material_record_count'] = len({id(record) for record in material_mapping.values()})

        elapsed = perf_counter() - started_at
        log_analyze(
            'analysis done: '
            f"total_products={analysis_result.get('total_products', 0)}, "
            f"matched_count={analysis_result.get('matched_count', 0)}, "
            f"unmatched_items_count={analysis_result.get('unmatched_items_count', 0)}, "
            f"missing_image_count={analysis_result.get('missing_image_count', 0)}, "
            f"elapsed={elapsed:.2f}s"
        )

        return {
            'success': True,
            **analysis_result,
            'message': 'BOM 分析完成',
        }, 200
    except ValueError as exc:
        log_analyze(f'validation failed: {exc}')
        return {'success': False, 'message': str(exc)}, 400
    except Exception as exc:
        elapsed = perf_counter() - started_at
        log_analyze(f'analysis failed after {elapsed:.2f}s: {exc}')
        return {'success': False, 'message': f'分析失败: {exc}'}, 500
