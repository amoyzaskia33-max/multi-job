import logging
import json
import time
from typing import Dict, Any, Optional
from .models import RunStatus

# Configure root logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

class StructuredLogger:
    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
    
    def info(self, message: str, extra: Optional[Dict[str, Any]] = None):
        self.logger.info(message, extra=extra)
    
    def warning(self, message: str, extra: Optional[Dict[str, Any]] = None):
        self.logger.warning(message, extra=extra)
    
    def error(self, message: str, extra: Optional[Dict[str, Any]] = None):
        self.logger.error(message, extra=extra)
    
    def debug(self, message: str, extra: Optional[Dict[str, Any]] = None):
        self.logger.debug(message, extra=extra)

class MetricsCollector:
    def __init__(self):
        self.metrics = {}
    
    def increment(self, name: str, tags: Optional[Dict[str, str]] = None):
        key = f"{name}:{json.dumps(tags or {})}"
        self.metrics[key] = self.metrics.get(key, 0) + 1
    
    def observe(self, name: str, value: float, tags: Optional[Dict[str, str]] = None):
        key = f"{name}:{json.dumps(tags or {})}"
        if key not in self.metrics:
            self.metrics[key] = []
        self.metrics[key].append(value)
    
    def get_metrics(self) -> Dict[str, Any]:
        return self.metrics

# Global instances
logger = StructuredLogger("multi_job")
metrics_collector = MetricsCollector()

# Prometheus-style metrics exporter
def expose_metrics() -> str:
    """Return metrics in Prometheus text format"""
    lines = ["# HELP job_runs_total Total number of job runs"]
    lines.append("# TYPE job_runs_total counter")
    
    for key, value in metrics_collector.metrics.items():
        if key.startswith("job_runs_total:"):
            # Parse tags
            parts = key.split(":", 1)
            if len(parts) == 2:
                metric_name = parts[0]
                tags_str = parts[1]
                try:
                    tags = json.loads(tags_str)
                    label_str = ",".join([f'{k}="{v}"' for k, v in tags.items()])
                    lines.append(f'job_runs_total{{{label_str}}} {value}')
                except:
                    lines.append(f'job_runs_total {value}')
    
    return "\n".join(lines)