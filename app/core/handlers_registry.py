from .registry import tool_registry, policy_manager
from app.jobs.handlers.monitor_channel import run as monitor_channel_handler
from app.jobs.handlers.daily_report import run as daily_report_handler
from app.jobs.handlers.backup_export import run as backup_export_handler

# Register job handlers
job_handlers = {
    "monitor.channel": monitor_channel_handler,
    "report.daily": daily_report_handler,
    "backup.export": backup_export_handler
}

# Set policies for each job type
policy_manager.set_allowlist("monitor.channel", ["metrics", "messaging"])
policy_manager.set_allowlist("report.daily", ["metrics", "messaging"])
policy_manager.set_allowlist("backup.export", ["files", "kv"])

def get_handler(job_type: str):
    """Get handler function for a job type"""
    return job_handlers.get(job_type)
