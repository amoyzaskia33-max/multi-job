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
        kunci = f"{name}:{json.dumps(tags or {})}"
        self.metrics[kunci] = self.metrics.get(kunci, 0) + 1

    def observe(self, name: str, value: float, tags: Optional[Dict[str, str]] = None):
        kunci = f"{name}:{json.dumps(tags or {})}"
        if kunci not in self.metrics:
            self.metrics[kunci] = []
        self.metrics[kunci].append(value)

    def get_metrics(self) -> Dict[str, Any]:
        return self.metrics

# Global instances
logger = StructuredLogger("multi_job")
metrics_collector = MetricsCollector()

# Prometheus-style metrics exporter
def expose_metrics() -> str:
    """Return metrics in Prometheus text format"""
    daftar_baris = ["# HELP job_runs_total Total number of job runs"]
    daftar_baris.append("# TYPE job_runs_total counter")

    for kunci, nilai in metrics_collector.metrics.items():
        if kunci.startswith("job_runs_total:"):
            # Parse tags
            bagian = kunci.split(":", 1)
            if len(bagian) == 2:
                metric_name = bagian[0]
                tags_str = bagian[1]
                try:
                    tag_data = json.loads(tags_str)
                    label_str = ",".join([f'{k}="{v}"' for k, v in tag_data.items()])
                    daftar_baris.append(f'job_runs_total{{{label_str}}} {nilai}')
                except:
                    daftar_baris.append(f'job_runs_total {nilai}')

    return "\n".join(daftar_baris)
