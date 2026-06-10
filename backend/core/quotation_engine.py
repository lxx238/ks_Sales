import sys
from backend.core.ko_normal import quotation_engine as _real
sys.modules[__name__] = _real
