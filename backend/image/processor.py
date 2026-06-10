import base64
import binascii
import re


def guess_image_extension(image_bytes, fallback='png'):
    if not image_bytes:
        return fallback

    if image_bytes.startswith(b'\x89PNG'):
        return 'png'
    if image_bytes.startswith(b'\xff\xd8'):
        return 'jpg'
    if image_bytes.startswith(b'GIF8'):
        return 'gif'
    if image_bytes.startswith(b'BM'):
        return 'bmp'
    if image_bytes.startswith(b'RIFF') and b'WEBP' in image_bytes[:16]:
        return 'webp'
    return fallback


def decode_image_base64(value):
    if value is None:
        return None, None, 'missing'

    text = str(value).strip()
    if not text or text.lower() in {'nan', 'none', 'null'}:
        return None, None, 'missing'

    image_ext = None
    base64_text = text
    if 'base64,' in text:
        header, base64_text = text.split('base64,', 1)
        match = re.search(r'image/([a-zA-Z0-9.+-]+)', header)
        if match:
            image_ext = match.group(1).lower().replace('jpeg', 'jpg')

    base64_text = re.sub(r'\s+', '', base64_text)
    if not base64_text:
        return None, None, 'missing'

    if len(base64_text) % 4:
        base64_text += '=' * (4 - len(base64_text) % 4)

    try:
        image_bytes = base64.b64decode(base64_text, validate=True)
    except (binascii.Error, ValueError):
        return None, None, 'invalid'

    if not image_bytes:
        return None, None, 'missing'

    image_ext = guess_image_extension(image_bytes, image_ext or 'png')
    return image_bytes, image_ext, 'ready'
