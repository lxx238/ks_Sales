from backend.core.array_matcher import (
    build_matrix_array_entries,
    find_matching_matrix_array,
    find_accumulated_match,
    find_info_accumulated_match,
)


def validate_array_matching(matrix_arrays, bom_configs):
    matched_details = []
    unmatched_info = []
    if not matrix_arrays or not bom_configs:
        return [], matched_details, unmatched_info, []

    bom_list = []
    for bom in bom_configs:
        config = bom.get('config', {})
        array_str = config.get('array', '')
        rows, cols = _parse_array_str(array_str)
        if rows == 0 or cols == 0:
            continue
        missing = config.get('missing_boards', 0) or 0
        base = config.get('base_count', 0) or 0
        key = bom.get('key', '')
        sheet = key.split('::')[0] if '::' in key else ''
        variant = bom.get('variant_name', '')
        bom_list.append({
            'rows': rows,
            'cols': cols,
            'base': base,
            'missing': missing,
            'sheet': sheet,
            'variant': variant,
            'label': f"{rows}×{cols}_{base}",
            'angle': config.get('angle', ''),
        })

    matrix_entries = []
    info_list = []
    for arr in matrix_arrays:
        info_base = arr.get('base_count') or arr.get('table_qty') or 1
        if info_base <= 0:
            continue
        info_missing = arr.get('missing_per_table', 0) or 0
        rows = arr.get('rows', 0)
        cols = arr.get('cols', 0)

        if arr.get('is_standalone_inverter'):
            inv_count = arr.get('inverter_count', 1)
            matrix_entries.append({
                'rows': 0,
                'cols': 0,
                'table_qty': info_base,
                'missing_per_table': 0,
                'is_standalone_inverter': True,
                'inverter_count': inv_count,
            })
            info_list.append({
                'rows': 0,
                'cols': 0,
                'base': info_base,
                'missing': 0,
                'label': f"パワコン独立架台_{info_base}",
                'is_standalone_inverter': True,
                'inverter_count': inv_count,
            })
            continue

        if rows == 0 or cols == 0:
            continue
        matrix_entries.append({
            'rows': rows,
            'cols': cols,
            'table_qty': info_base,
            'missing_per_table': info_missing,
        })
        info_list.append({
            'rows': rows,
            'cols': cols,
            'base': info_base,
            'missing': info_missing,
            'label': f"{rows}×{cols}_{info_base}",
        })

    used_bom = set()
    confirmed_sheets = set()
    results = [None] * len(info_list)

    # Pass 0: 最严格匹配 (rows × cols × base × missing 四维全等)
    for i, info in enumerate(info_list):
        for j, bom in enumerate(bom_list):
            if j in used_bom:
                continue
            if (info['rows'] == bom['rows']
                    and info['cols'] == bom['cols']
                    and info['base'] == bom['base']
                    and info['missing'] == bom['missing']):
                used_bom.add(j)
                if bom['sheet']:
                    confirmed_sheets.add(bom['sheet'])
                results[i] = {
                    'info_label': info['label'],
                    'info_missing': info['missing'],
                    'info_base': info['base'],
                    'bom_label': bom['label'],
                    'bom_base': bom['base'],
                    'bom_missing': bom['missing'],
                    'bom_variant': bom['variant'],
                    'bom_angle': bom['angle'],
                    'status': '直接匹配成功',
                }
                break

    # Pass 1: 严格匹配 (rows × cols × base 完全一致)
    for i, info in enumerate(info_list):
        if results[i] is not None:
            continue
        for j, bom in enumerate(bom_list):
            if j in used_bom:
                continue
            if (info['rows'] == bom['rows']
                    and info['cols'] == bom['cols']
                    and info['base'] == bom['base']):
                used_bom.add(j)
                if bom['sheet']:
                    confirmed_sheets.add(bom['sheet'])
                results[i] = {
                    'info_label': info['label'],
                    'info_missing': info['missing'],
                    'info_base': info['base'],
                    'bom_label': bom['label'],
                    'bom_base': bom['base'],
                    'bom_missing': bom['missing'],
                    'bom_variant': bom['variant'],
                    'bom_angle': bom['angle'],
                    'status': '直接匹配成功',
                }
                break

    # Pass 2: 同页累加匹配 (同行列BOM的base累加 == info的table_qty)
    pending_boms = []
    pending_bom_indices = []
    for j, bom in enumerate(bom_list):
        if j in used_bom:
            continue
        pending_boms.append({
            'sheet_name': bom['sheet'],
            'rows': bom['rows'],
            'cols': bom['cols'],
            'base_count': bom['base'],
            'missing': bom['missing'],
            'variant': bom['variant'],
            'label': bom['label'],
            'angle': bom['angle'],
            'products': [],
        })
        pending_bom_indices.append(j)

    if pending_boms and matrix_entries:
        used_matrix_indices = set()
        for i, info in enumerate(info_list):
            if results[i] is not None:
                used_matrix_indices.add(i)

        acc_results = find_accumulated_match(
            matrix_entries, pending_boms,
            used_matrix_indices, confirmed_sheets,
        )

        for acc in acc_results:
            m_idx = acc['matrix_idx']
            selected = acc['selected_boms']
            accumulated_base = acc['accumulated_base']
            info = info_list[m_idx]
            results[m_idx] = {
                'info_label': info['label'],
                'info_missing': info['missing'],
                'info_base': info['base'],
                'bom_label': ' + '.join(b.get('label', '') for b in selected),
                'bom_base': accumulated_base,
                'bom_missing': selected[0].get('missing', 0) if selected else 0,
                'bom_variant': ' + '.join(b.get('variant', '') for b in selected),
                'bom_angle': ' + '.join(b.get('angle', '') for b in selected),
                'status': f"累加匹配成功（{' + '.join(str(b.get('base_count', 0)) for b in selected)} = {accumulated_base}）",
            }
            for pb in selected:
                raw_j = _find_pending_bom_original_index(pb, pending_boms, pending_bom_indices, used_bom)
                if raw_j is not None:
                    used_bom.add(raw_j)

    # Pass 2.5: 信息表累加匹配 (多个小信息表条目 → 一个大BOM)
    remaining_matrix = set()
    for i, info in enumerate(info_list):
        if results[i] is None:
            remaining_matrix.add(i)

    if remaining_matrix and pending_boms:
        used_bom_in_acc = set()
        for j in range(len(bom_list)):
            if j in used_bom:
                used_bom_in_acc.add(j)

        info_acc_results = find_info_accumulated_match(
            matrix_entries, pending_boms,
            set(range(len(matrix_entries))) - remaining_matrix,
            used_bom_in_acc,
        )

        for acc in info_acc_results:
            m_indices = acc['matrix_indices']
            matched_bom = acc['matched_bom']
            total_info_qty = acc['total_info_qty']

            bom_j = _find_bom_list_index(matched_bom, pending_boms, pending_bom_indices, used_bom)
            if bom_j is not None:
                used_bom.add(bom_j)

            info_labels = [info_list[m]['label'] for m in m_indices]
            info_qtys = [str(info_list[m]['base']) for m in m_indices]

            for m_idx in m_indices:
                info = info_list[m_idx]
                results[m_idx] = {
                    'info_label': info['label'],
                    'info_missing': info['missing'],
                    'info_base': info['base'],
                    'bom_label': matched_bom.get('label', ''),
                    'bom_base': matched_bom.get('base_count', 0) or 0,
                    'bom_missing': matched_bom.get('missing', 0) or 0,
                    'bom_variant': matched_bom.get('variant', ''),
                    'bom_angle': matched_bom.get('angle', ''),
                    'status': f"信息表累加匹配（{' + '.join(info_qtys)} = {total_info_qty} → BOM {matched_bom.get('label', '')}）",
                }

    # Pass 3: 间接匹配兜底 (第一个同行列BOM，基数用信息表的)
    for i, info in enumerate(info_list):
        if results[i] is not None:
            continue
        if info.get('is_standalone_inverter'):
            continue

        for j, bom in enumerate(bom_list):
            if j in used_bom:
                continue
            if info['rows'] == bom['rows'] and info['cols'] == bom['cols']:
                used_bom.add(j)
                if info['base'] == bom['base']:
                    status = '直接匹配成功'
                elif info['base'] > bom['base']:
                    status = f"间接匹配成功（信息表基数多{info['base'] - bom['base']}）"
                else:
                    status = f"间接匹配成功（BOM基数多{bom['base'] - info['base']}）"
                results[i] = {
                    'info_label': info['label'],
                    'info_missing': info['missing'],
                    'info_base': info['base'],
                    'bom_label': bom['label'],
                    'bom_base': bom['base'],
                    'bom_missing': bom['missing'],
                    'bom_variant': bom['variant'],
                    'bom_angle': bom['angle'],
                    'status': status,
                }
                break

    # Pass 4: Standalone inverter matching
    standalone_inv_indices = [
        i for i, info in enumerate(info_list)
        if info.get('is_standalone_inverter') and results[i] is None
    ]
    if standalone_inv_indices:
        inv_bom_configs = []
        for bom in bom_configs:
            config = bom.get('config', {})
            array_str = config.get('array', '')
            if array_str and array_str != '未知':
                continue
            variant = bom.get('variant_name', '')
            key = bom.get('key', '')
            sheet = key.split('::')[0] if '::' in key else ''
            inv_total = 0
            inv_base = 0
            try:
                from backend.core.shared.bom_zip_parser import _parse_sheet_cells
            except Exception:
                pass
            inv_bom_configs.append({
                'variant': variant,
                'sheet': sheet,
                'key': key,
            })

        for i in standalone_inv_indices:
            info = info_list[i]
            results[i] = {
                'info_label': info['label'],
                'info_missing': 0,
                'info_base': info['base'],
                'bom_label': f"PCS{info.get('inverter_count', 1)}台",
                'bom_base': info['base'],
                'bom_missing': 0,
                'bom_variant': '',
                'bom_angle': '',
                'status': '✅ パワコン直接匹配',
            }

    # Pass 5: Collect results
    for i, info in enumerate(info_list):
        if results[i] is not None:
            matched_details.append(results[i])
        else:
            unmatched_info.append({
                'info_label': info['label'],
                'info_missing': info['missing'],
                'info_base': info['base'],
                'status': '无法匹配，使用信息表基数',
            })

    return [], matched_details, unmatched_info, []


def _find_pending_bom_original_index(pb, pending_boms, pending_bom_indices, used_bom):
    for k, item in enumerate(pending_boms):
        if item is pb:
            j = pending_bom_indices[k]
            if j not in used_bom:
                return j
    return None


def _find_bom_list_index(pb, pending_boms, pending_bom_indices, used_bom):
    for k, item in enumerate(pending_boms):
        if item is pb:
            return pending_bom_indices[k]
    return None


def _parse_array_str(array_str):
    if not array_str:
        return 0, 0
    s = str(array_str).replace('×', 'x').replace('*', 'x').replace('X', 'x')
    parts = s.split('x')
    if len(parts) == 2:
        try:
            return int(float(parts[0])), int(float(parts[1]))
        except (ValueError, TypeError):
            pass
    return 0, 0
