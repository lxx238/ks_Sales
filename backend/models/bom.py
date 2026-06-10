from dataclasses import dataclass, field
from typing import Any


@dataclass
class BOMAnalysis:
    unmatched_codes: list[str] = field(default_factory=list)
    unmatched_code_count: int = 0
    unmatched_items_count: int = 0
    total_products: int = 0
    matched_count: int = 0
    unmatched_count: int = 0
    missing_price_count: int = 0
    missing_image_count: int = 0
    invalid_image_count: int = 0
    preview_rows: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class BOMContext:
    products: list[dict[str, Any]] = field(default_factory=list)
    material_mapping: dict[str, dict[str, Any]] = field(default_factory=dict)
    analysis: dict[str, Any] = field(default_factory=dict)
