import re
from backend.core.price_matcher import has_valid_price_info, resolve_price_info


def _is_valid_product_code(code):
    if not code or not str(code).strip():
        return False
    text = str(code).strip()
    if re.search(r'[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]', text):
        return False
    return True


def build_bom_analysis(products, material_mapping):
    issue_codes = []
    preview_rows = []
    matched_count = 0
    missing_price_count = 0
    missing_image_count = 0
    invalid_image_count = 0
    missing_image_codes = []

    for product in products:
        code = str(product.get('code') or '').strip()
        if not _is_valid_product_code(code):
            continue

        price_info = resolve_price_info(material_mapping, code, spec=product.get('spec', ''))
        issue_reasons = []
        has_valid_price = bool(price_info and has_valid_price_info(price_info))

        if not price_info:
            issue_reasons.append('数据库无匹配')
        elif not has_valid_price:
            issue_reasons.append(price_info.get('issue_reason') or '数据库缺少价格')
            missing_price_count += 1

        if price_info and price_info.get('image_status') == 'missing':
            issue_reasons.append('数据库缺少图片')
            missing_image_count += 1
            missing_image_codes.append(code)
        elif price_info and price_info.get('image_status') == 'invalid':
            issue_reasons.append('图片数据无效')
            invalid_image_count += 1
        elif not price_info:
            missing_image_codes.append(code)

        if issue_reasons:
            issue_codes.append(code)
        else:
            matched_count += 1

        if len(preview_rows) < 100:
            preview_rows.append({
                'code': code,
                'bom_name': product.get('name', ''),
                'db_name': price_info.get('name', '') if price_info else '',
                'db_name_ko': price_info.get('name_ko', '') if price_info else '',
                'unit': price_info.get('unit', '') if price_info else '',
                'price': price_info.get('price') if price_info else None,
                'image_status': price_info.get('image_status', 'missing') if price_info else 'missing',
                'issue_reason': '；'.join(issue_reasons),
            })

    unique_issue_codes = []
    seen = set()
    for code in issue_codes:
        if code not in seen:
            unique_issue_codes.append(code)
            seen.add(code)

    unique_missing_image_codes = []
    unique_missing_image_items = []
    seen_img = set()
    for code in missing_image_codes:
        if code not in seen_img:
            unique_missing_image_codes.append(code)
            seen_img.add(code)
            price_info = resolve_price_info(material_mapping, code)
            name = ''
            if price_info:
                name = price_info.get('name', '')
            for product in products:
                if str(product.get('code', '')).strip() == code:
                    if not name:
                        name = str(product.get('name', '')).strip()
                    break
            unique_missing_image_items.append({'code': code, 'name': name})

    total_products = len([product for product in products if str(product.get('code') or '').strip()])
    return {
        'unmatched_codes': unique_issue_codes,
        'unmatched_code_count': len(unique_issue_codes),
        'unmatched_items_count': len(issue_codes),
        'total_products': total_products,
        'matched_count': matched_count,
        'unmatched_count': len(unique_issue_codes),
        'missing_price_count': missing_price_count,
        'missing_image_count': missing_image_count,
        'invalid_image_count': invalid_image_count,
        'missing_image_codes': unique_missing_image_codes,
        'missing_image_items': unique_missing_image_items,
        'preview_rows': preview_rows,
    }
