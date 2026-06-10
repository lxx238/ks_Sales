from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class MatrixData:
    project_name: str
    output_kw: float
    output_wp: int
    set_count: int


@dataclass
class QuotationResult:
    output_file: Optional[str] = None
    inquiry_file: Optional[str] = None
    statistics: dict[str, Any] = field(default_factory=dict)
