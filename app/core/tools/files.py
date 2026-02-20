import os
import json
from typing import Dict, Any, Optional
from .base import Tool

class FilesTool(Tool):
    @property
    def name(self) -> str:
        return "files"
    
    @property
    def version(self) -> str:
        return "1.0.0"
    
    async def run(self, input_data: Dict[str, Any], ctx) -> Dict[str, Any]:
        action = input_data.get("action")
        path = input_data.get("path")
        
        if not path:
            return {"success": False, "error": "Path is required"}
        
        try:
            if action == "read":
                with open(path, 'r') as f:
                    content = f.read()
                return {"success": True, "content": content}
            
            elif action == "write":
                content = input_data.get("content", "")
                mode = input_data.get("mode", "w")
                
                with open(path, mode) as f:
                    f.write(content)
                return {"success": True, "message": f"File {path} written successfully"}
            
            elif action == "list":
                if os.path.isdir(path):
                    files = os.listdir(path)
                    return {"success": True, "files": files}
                else:
                    return {"success": False, "error": f"{path} is not a directory"}
            
            else:
                return {"success": False, "error": f"Unknown action: {action}"}
        
        except Exception as e:
            return {"success": False, "error": str(e)}