from .aluminum import aluminum_bp
from .analyze import analyze_bp
from .auth import auth_bp
from .cad_assistant import cad_assistant_bp
from .cleanup import cleanup_bp
from .email_management import email_mgmt_bp
from .fence_gate_material import fence_material_bp
from .fence_gate_style import fence_style_bp, gate_style_bp
from .health import health_bp
from .image_inquiry import image_inquiry_bp
from .inquiry import inquiry_bp
from .public_dashboard import public_dashboard_bp
from .unified_contacts import unified_contacts_bp
from .question import question_bp
from .quotation import quotation_bp
from .temp_price import temp_price_bp
from .pile_price import pile_price_bp
from .upload import upload_bp
from .usage import usage_bp


def register_blueprints(app):
    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(cad_assistant_bp)
    app.register_blueprint(upload_bp)
    app.register_blueprint(analyze_bp)
    app.register_blueprint(quotation_bp)
    app.register_blueprint(inquiry_bp)
    app.register_blueprint(image_inquiry_bp)
    app.register_blueprint(cleanup_bp)
    app.register_blueprint(aluminum_bp)
    app.register_blueprint(question_bp)
    app.register_blueprint(unified_contacts_bp)
    app.register_blueprint(fence_material_bp)
    app.register_blueprint(fence_style_bp)
    app.register_blueprint(gate_style_bp)
    app.register_blueprint(email_mgmt_bp)
    app.register_blueprint(temp_price_bp)
    app.register_blueprint(usage_bp)
    app.register_blueprint(public_dashboard_bp)
    app.register_blueprint(pile_price_bp)
