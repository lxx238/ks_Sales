IMAGE_WIDTH = 65
IMAGE_HEIGHT = 50
IMAGE_COLUMN_INDEX = 4
IMAGE_PADDING = 2

CARBON_STEEL_PRICING_ATTRS = frozenset(['WTX', 'WTP'])
PURCHASED_PRICING_ATTRS = frozenset(['W'])
CARBON_STEEL_MATERIAL_KEYWORDS = ['Q235', 'Q345', 'Q355']
CARBON_STEEL_CODE_PREFIXES = ('FEB', 'FEPJ')

WEIGHT_BY_LENGTH_ATTRIBUTES = {'A', 'F', 'TX'}

EXCLUDE_ITEM_GROUPS = {
    'earth_clip': {
        'keywords': ['earth clip', '어스 클립', '导电片', '導電シート'],
        'code_prefixes': ['DP-'],
        'label': '导电片(Earth Clip)',
    },
    'earth_lug': {
        'keywords': ['earth lug', '접지동선', '接地铜线夹', 'アース用ラグ'],
        'code_prefixes': ['GL-'],
        'label': '接地铜线夹(Earth Lug)',
    },
    'rail_cap': {
        'keywords': ['rail cap', '导轨端盖', 'キャップ'],
        'code_prefixes': ['DG-'],
        'label': '导轨端盖(Rail Cap)',
    },
    'beam_cap': {
        'keywords': ['beam cap', '承重梁端盖', 'キャップ', '方管端盖', '빔 덮개', '각관 덮개', 'square pipe cap'],
        'code_prefixes': ['DG-'],
        'label': '承重梁端盖(Beam Cap)',
    },
    'rail': {
        'keywords': ['导轨', 'レール'],
        'code_prefixes': ['R'],
        'label': '导轨(Rail)',
    },
    'angle_aluminum': {
        'keywords': ['角铝', 'コーナー'],
        'code_prefixes': ['J'],
        'label': '角铝(Angle Aluminum)',
    },
    'beam': {
        'keywords': ['承重梁', 'ビーム', '支持梁'],
        'code_prefixes': ['B'],
        'label': '承重梁(Beam)',
    },
    'h_connector': {
        'keywords': ['H连接件', 'Hコネクタ'],
        'code_prefixes': ['VH-'],
        'label': 'H连接件(H Connector)',
    },
    'post': {
        'keywords': ['立柱', '柱'],
        'code_prefixes': ['L'],
        'label': '立柱(Post)',
    },
    'base': {
        'keywords': ['底座', 'ベース'],
        'code_prefixes': ['AB-'],
        'label': '底座(Base)',
    },
    'connector': {
        'keywords': ['连接件', 'コネクタ'],
        'code_prefixes': ['SB-', 'SR-'],
        'label': '连接件(Connector)',
    },
    'clamp': {
        'keywords': ['压块', 'クランプ'],
        'code_prefixes': ['CM-', 'CE-', 'CT-'],
        'label': '压块(Clamp)',
    },
    'bolt': {
        'keywords': ['螺栓', 'ボルト'],
        'code_prefixes': ['FA-'],
        'label': '螺栓(Bolt)',
    },
    'pile': {
        'keywords': ['地桩', '杭'],
        'code_prefixes': ['DZ-'],
        'label': '地桩(Pile)',
    },
}
