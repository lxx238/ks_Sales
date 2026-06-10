from dataclasses import dataclass
from typing import Optional


@dataclass
class Product:
    code: str
    name: str = ''
    specification: str = ''
    material: str = ''
    quantity: float = 0.0
    remarks: str = ''
    unit_weight: Optional[float] = None


@dataclass
class MaterialRecord:
    db_code: str
    name: str = ''
    name_ko: str = ''
    unit: str = ''
    price: Optional[float] = None
    image_status: str = 'missing'
    image_bytes: Optional[bytes] = None
    image_ext: Optional[str] = None
    issue_reason: Optional[str] = None
