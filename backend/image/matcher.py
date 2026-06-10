import re
import uuid

from backend.config.settings import OUTPUT_FOLDER
from backend.utils.converters import normalize_lookup_code


def material_mapping_to_temp_image_dir(material_mapping):
    temp_dir = OUTPUT_FOLDER / f'db_images_{uuid.uuid4().hex}'
    temp_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    seen_codes = set()

    for key, record in material_mapping.items():
        db_code = str(record.get('db_code') or key or '').strip()
        normalized_code = normalize_lookup_code(db_code)
        if not normalized_code or normalized_code in seen_codes:
            continue
        seen_codes.add(normalized_code)

        if record.get('image_status') != 'ready' or not record.get('image_bytes'):
            continue

        safe_name = re.sub(r'[^A-Za-z0-9._-]+', '_', normalized_code) or f'image_{written}'
        image_ext = record.get('image_ext') or 'png'
        image_path = temp_dir / f'{safe_name}.{image_ext}'
        with open(image_path, 'wb') as image_file:
            image_file.write(record['image_bytes'])
        written += 1

    return str(temp_dir), written
