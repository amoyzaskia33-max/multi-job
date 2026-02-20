from typing import Dict, Callable, List, Optional
from .models import JobSpec

class Tool:
    def __init__(self, name: str, version: str, run_func: Callable):
        self.name = name
        self.version = version
        self.run_func = run_func
    
    async def run(self, input_data: dict, ctx):
        return await self.run_func(input_data, ctx)

class ToolRegistry:
    def __init__(self):
        self.tools: Dict[str, Tool] = {}
    
    def register_tool(self, name: str, version: str, run_func: Callable):
        self.tools[name] = Tool(name, version, run_func)
    
    def get_tool(self, name: str) -> Optional[Tool]:
        return self.tools.get(name)
    
    def list_tools(self) -> List[str]:
        return list(self.tools.keys())

class PolicyManager:
    def __init__(self):
        self.allowlists: Dict[str, List[str]] = {}
        self.denylists: Dict[str, List[str]] = {}
    
    def set_allowlist(self, job_type: str, tools: List[str]):
        """Set allowed tools for a job type"""
        self.allowlists[job_type] = tools
    
    def set_denylist(self, job_type: str, tools: List[str]):
        """Set denied tools for a job type"""
        self.denylists[job_type] = tools
    
    def is_tool_allowed(self, job_type: str, tool_name: str) -> bool:
        """Check if a tool is allowed for a job type"""
        # Check denylist first
        if job_type in self.denylists and tool_name in self.denylists[job_type]:
            return False
        
        # Check allowlist
        if job_type in self.allowlists:
            return tool_name in self.allowlists[job_type]
        
        # If no allowlist defined, all tools are allowed (except explicit deny)
        return True

# Global instances
tool_registry = ToolRegistry()
policy_manager = PolicyManager()