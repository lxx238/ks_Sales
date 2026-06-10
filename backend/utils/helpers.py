def row_to_dict(row):
    """Convert a sqlite Row into a plain dict."""
    return dict(row) if row else None
