def build_matrix_array_entries(matrix_data):
    matrix_data = matrix_data or {}
    arrays = matrix_data.get('arrays') or []
    entries = []

    for array in arrays:
        try:
            rows = int(array.get('rows')) if array.get('rows') is not None else None
            cols = int(array.get('cols')) if array.get('cols') is not None else None
        except (TypeError, ValueError):
            continue

        if rows is None or cols is None:
            continue

        table_qty = array.get('table_qty')
        try:
            table_qty = int(table_qty) if table_qty is not None else 1
        except (TypeError, ValueError):
            table_qty = 1
        if table_qty <= 0:
            table_qty = 1

        modules = array.get('modules')
        try:
            modules = int(modules) if modules is not None else rows * cols * table_qty
        except (TypeError, ValueError):
            modules = rows * cols * table_qty

        entries.append({
            **array,
            'rows': rows,
            'cols': cols,
            'table_qty': table_qty,
            'modules': modules,
        })

    if entries:
        return entries

    rows = matrix_data.get('array_rows')
    cols = matrix_data.get('array_cols')
    if rows is None or cols is None:
        return []

    try:
        rows = int(rows)
        cols = int(cols)
    except (TypeError, ValueError):
        return []

    table_qty = matrix_data.get('set_count') or 1
    try:
        table_qty = int(table_qty)
    except (TypeError, ValueError):
        table_qty = 1
    if table_qty <= 0:
        table_qty = 1

    return [{
        'rows': rows,
        'cols': cols,
        'table_qty': table_qty,
        'modules': rows * cols * table_qty,
    }]


def find_matching_matrix_array(matrix_entries, bom_rows, bom_cols, used_indices=None,
                               bom_missing=None, bom_base_count=None, strict_only=False,
                               bom_has_inverter=None):
    if bom_rows is None or bom_cols is None:
        return None, None

    if bom_base_count:
        for idx, entry in enumerate(matrix_entries or []):
            if used_indices is not None and idx in used_indices:
                continue
            if bom_rows == entry.get('rows') and bom_cols == entry.get('cols'):
                if bom_base_count == (entry.get('table_qty') or 1):
                    if bom_missing is not None:
                        entry_missing = entry.get('missing_per_table', 0) or 0
                        if entry_missing != bom_missing:
                            continue
                    if bom_has_inverter is not None:
                        if bom_has_inverter != entry.get('has_inverter', False):
                            continue
                    return idx, entry

    if bom_has_inverter is not None:
        for idx, entry in enumerate(matrix_entries or []):
            if used_indices is not None and idx in used_indices:
                continue
            if bom_rows == entry.get('rows') and bom_cols == entry.get('cols'):
                if bom_has_inverter == entry.get('has_inverter', False):
                    if bom_missing is not None:
                        entry_missing = entry.get('missing_per_table', 0) or 0
                        if entry_missing != bom_missing:
                            continue
                    return idx, entry

    if bom_base_count:
        for idx, entry in enumerate(matrix_entries or []):
            if used_indices is not None and idx in used_indices:
                continue
            if bom_rows == entry.get('rows') and bom_cols == entry.get('cols'):
                if bom_base_count == (entry.get('table_qty') or 1):
                    if bom_missing is not None:
                        entry_missing = entry.get('missing_per_table', 0) or 0
                        if entry_missing != bom_missing:
                            continue
                    return idx, entry

    if strict_only:
        return None, None

    for idx, entry in enumerate(matrix_entries or []):
        if used_indices is not None and idx in used_indices:
            continue
        if bom_rows == entry.get('rows') and bom_cols == entry.get('cols'):
            if bom_missing is not None:
                entry_missing = entry.get('missing_per_table', 0) or 0
                if entry_missing != bom_missing:
                    continue
            return idx, entry

    if bom_missing is not None:
        for idx, entry in enumerate(matrix_entries or []):
            if used_indices is not None and idx in used_indices:
                continue
            if bom_rows == entry.get('rows') and bom_cols == entry.get('cols'):
                return idx, entry

    return None, None


def build_bom_matrix_data(matrix_data, matched_array, bom_config=None):
    if not matched_array:
        return matrix_data or {}

    bom_matrix_data = dict(matrix_data or {})
    rows = matched_array.get('rows')
    cols = matched_array.get('cols')
    modules = matched_array.get('modules')

    table_qty = matched_array.get('table_qty') or 1

    bom_matrix_data['array_rows'] = rows
    bom_matrix_data['array_cols'] = cols
    bom_matrix_data['set_count'] = table_qty
    bom_matrix_data['arrays'] = [matched_array]

    module_wattage = bom_matrix_data.get('module_wattage')

    bom_missing = 0
    bom_missing_from_config = False
    if bom_config:
        try:
            raw = bom_config.get('missing_boards', 0) or 0
            bom_missing = int(raw)
            bom_missing_from_config = bom_config.get('has_missing_field', False)
        except (ValueError, TypeError):
            pass

    try:
        if rows is not None and cols is not None:
            if not bom_missing_from_config:
                info_missing = matched_array.get('missing_per_table', 0) or 0
                bom_missing = info_missing
            if bom_missing > 0:
                bom_missing = -bom_missing
            bom_matrix_data['missing_per_table'] = bom_missing
            if module_wattage is not None:
                effective_modules = (rows * cols + bom_missing) * table_qty
                if effective_modules < 0:
                    effective_modules = 0
                output_wp = int(round(float(effective_modules) * float(module_wattage)))
                bom_matrix_data['output_wp'] = output_wp
                bom_matrix_data['output_kw'] = output_wp / 1000
    except (TypeError, ValueError):
        pass

    return bom_matrix_data


def merge_bom_products(bom_product_lists):
    merged = {}
    for products in bom_product_lists:
        if not products:
            continue
        for p in products:
            code = p.get('code', '')
            if not code:
                continue
            spec = p.get('spec', '')
            merge_key = f"{code}||{spec}"
            if merge_key in merged:
                merged[merge_key]['quantity'] = merged[merge_key].get('quantity', 0) + p.get('quantity', 0)
            else:
                merged[merge_key] = dict(p)
    return list(merged.values())


def find_accumulated_match(matrix_entries, pending_boms, used_matrix_indices, used_sheet_names=None):
    if not matrix_entries or not pending_boms:
        return []

    remaining_indices = []
    for m_idx in range(len(matrix_entries)):
        if m_idx not in used_matrix_indices:
            remaining_indices.append(m_idx)

    if not remaining_indices:
        return []

    used_bom_indices = set()
    results = []
    used_sheet_names = used_sheet_names or set()

    for m_idx in remaining_indices:
        matrix_entry = matrix_entries[m_idx]
        target_rows = matrix_entry.get('rows')
        target_cols = matrix_entry.get('cols')
        target_qty = matrix_entry.get('table_qty', 1)

        if target_rows is None or target_cols is None:
            continue

        sheet_groups = {}
        for b_idx, pb in enumerate(pending_boms):
            if b_idx in used_bom_indices:
                continue
            if pb.get('rows') == target_rows and pb.get('cols') == target_cols:
                sheet_name = pb.get('sheet_name', '')
                sheet_groups.setdefault(sheet_name, []).append((b_idx, pb))

        candidates = []
        for sn, items in sheet_groups.items():
            total_base = sum(pb.get('base_count', 0) or 0 for _, pb in items)
            if total_base == target_qty:
                candidates.append((sn, items, total_base))

        if not candidates:
            continue

        candidates.sort(key=lambda x: (0 if x[0] in used_sheet_names else 1))
        chosen_sheet, chosen_items, _ = candidates[0]

        accumulated = 0
        selected = []
        for b_idx, pb in chosen_items:
            accumulated += pb.get('base_count', 0) or 0
            selected.append((b_idx, pb))
            if accumulated >= target_qty:
                break

        all_product_lists = []
        bom_configs = []
        for _, pb in selected:
            prods = pb.get('products')
            if prods is not None:
                all_product_lists.append(prods)
            cfg = pb.get('config')
            if cfg:
                bom_configs.append(cfg)

        merged_products = merge_bom_products(all_product_lists)

        results.append({
            'matrix_idx': m_idx,
            'matrix_entry': matrix_entry,
            'selected_boms': [pb for _, pb in selected],
            'merged_products': merged_products,
            'source_sheet': chosen_sheet,
            'accumulated_base': accumulated,
        })

        for b_idx, _ in selected:
            used_bom_indices.add(b_idx)

    return results


def find_info_accumulated_match(matrix_entries, pending_boms, used_matrix_indices, used_bom_indices=None):
    if not matrix_entries or not pending_boms:
        return []

    remaining_matrix = []
    for m_idx in range(len(matrix_entries)):
        if m_idx not in used_matrix_indices:
            remaining_matrix.append(m_idx)

    if not remaining_matrix:
        return []

    used_bom = set(used_bom_indices or [])
    results = []

    info_groups = {}
    for m_idx in remaining_matrix:
        entry = matrix_entries[m_idx]
        key = (entry.get('rows'), entry.get('cols'), entry.get('missing_per_table', 0) or 0)
        info_groups.setdefault(key, []).append(m_idx)

    for (rows, cols, missing), m_indices in info_groups.items():
        total_info_qty = sum(matrix_entries[m].get('table_qty', 1) for m in m_indices)

        matched_bom_idx = None
        matched_bom = None
        for b_idx, pb in enumerate(pending_boms):
            if b_idx in used_bom:
                continue
            if pb.get('rows') == rows and pb.get('cols') == cols:
                bom_base = pb.get('base_count', 0) or 0
                if bom_base == total_info_qty:
                    bom_missing = pb.get('missing', 0) or 0
                    if bom_missing == missing:
                        matched_bom_idx = b_idx
                        matched_bom = pb
                        break

        if matched_bom is None:
            for b_idx, pb in enumerate(pending_boms):
                if b_idx in used_bom:
                    continue
                if pb.get('rows') == rows and pb.get('cols') == cols:
                    bom_base = pb.get('base_count', 0) or 0
                    if bom_base == total_info_qty:
                        matched_bom_idx = b_idx
                        matched_bom = pb
                        break

        if matched_bom is None:
            continue

        used_bom.add(matched_bom_idx)

        results.append({
            'matrix_indices': m_indices,
            'matrix_entries': [matrix_entries[m] for m in m_indices],
            'matched_bom': matched_bom,
            'total_info_qty': total_info_qty,
            'bom_base': matched_bom.get('base_count', 0) or 0,
        })

    return results
