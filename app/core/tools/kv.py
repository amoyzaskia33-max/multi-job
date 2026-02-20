from typing import Dict, Any, Optional
from .base import Tool
from ..redis_client import redis_client

class KVTool(Tool):
    @property
    def name(self) -> str:
        return "kv"
    
    @property
    def version(self) -> str:
        return "1.0.0"
    
    async def run(self, input_data: Dict[str, Any], ctx) -> Dict[str, Any]:
        action = input_data.get("action")
        
        if action == "get":
            key = input_data.get("key")
            if not key:
                return {"success": False, "error": "Key is required for get"}
            
            value = await redis_client.get(key)
            return {"success": True, "value": value}
        
        elif action == "set":
            key = input_data.get("key")
            value = input_data.get("value")
            ttl = input_data.get("ttl")
            
            if not key or value is None:
                return {"success": False, "error": "Key and value are required for set"}
            
            if ttl:
                await redis_client.setex(key, ttl, value)
            else:
                await redis_client.set(key, value)
            
            return {"success": True, "message": f"Key {key} set successfully"}
        
        else:
            return {"success": False, "error": f"Unknown action: {action}"}