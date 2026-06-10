def reorder_sheets_by_matrix_array(workbook, results, matrix_array_entries, log_prefix=''):
    if not results or not matrix_array_entries:
        return
    pos_map = {}
    for mi, me in enumerate(matrix_array_entries):
        key = (me.get('rows'), me.get('cols'), me.get('table_qty', 1), me.get('missing_per_table', 0) or 0)
        if key not in pos_map:
            pos_map[key] = mi

    def _sort_key(item):
        orig_idx, r = item
        explicit_pos = r.get('_matrix_idx')
        if explicit_pos is not None:
            return (explicit_pos, orig_idx)
        ma = r.get('matched_array') or {}
        key = (ma.get('rows'), ma.get('cols'), ma.get('table_qty', 1), ma.get('missing_per_table', 0) or 0)
        pos = pos_map.get(key, len(matrix_array_entries))
        return (pos, orig_idx)

    indexed = list(enumerate(results))
    indexed.sort(key=_sort_key)
    results[:] = [r for _, r in indexed]

    desired_order = [r['sheet_name'] for r in results]
    sheet_map = {ws.title: ws for ws in workbook.worksheets}
    ordered = [sheet_map[n] for n in desired_order if n in sheet_map]
    for ws in workbook.worksheets:
        if ws.title not in desired_order:
            ordered.append(ws)
    workbook._sheets = ordered
    if log_prefix:
        print(f"{log_prefix} Reordered sheets by matrix_array_entries: {desired_order}")


def set_page_break_preview(workbook):
    for ws in workbook.worksheets:
        ws.sheet_view.view = "pageBreakPreview"
