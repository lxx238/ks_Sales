import sys
from backend.core.ko_normal import quotation_builder as _real
sys.modules[__name__] = _real
