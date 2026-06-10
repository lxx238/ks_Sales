import os

_PARSE_METADATA_CACHE = {}
_PARSE_METADATA_MAX = 4


def _parse_md_cache_key(input_file, selected_bom_keys=None):
    abspath = os.path.abspath(input_file)
    try:
        mtime = os.path.getmtime(input_file)
    except OSError:
        mtime = 0
    keys = tuple(sorted(str(k).strip() for k in (selected_bom_keys or []) if str(k).strip()))
    return (abspath, mtime, keys)


def _store_parse_md(input_file, metadata, selected_bom_keys=None):
    key = _parse_md_cache_key(input_file, selected_bom_keys)
    _PARSE_METADATA_CACHE[key] = metadata
    while len(_PARSE_METADATA_CACHE) > _PARSE_METADATA_MAX:
        oldest = next(iter(_PARSE_METADATA_CACHE))
        del _PARSE_METADATA_CACHE[oldest]


def _get_parse_md(input_file, selected_bom_keys=None):
    key = _parse_md_cache_key(input_file, selected_bom_keys)
    return _PARSE_METADATA_CACHE.get(key)
