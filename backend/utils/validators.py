def ensure_json_payload(data, message='请求体不能为空，请发送 JSON 数据'):
    if data is None:
        raise ValueError(message)


def ensure_required_value(value, message):
    if not value:
        raise ValueError(message)
