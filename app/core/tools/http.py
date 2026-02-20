import aiohttp
import json
import time
from typing import Dict, Any, Optional
from .base import Tool

class HTTPTool(Tool):
    @property
    def name(self) -> str:
        return "http"
    
    @property
    def version(self) -> str:
        return "1.0.0"
    
    async def run(self, input_data: Dict[str, Any], ctx) -> Dict[str, Any]:
        method = input_data.get("method", "GET").upper()
        url = input_data.get("url")
        headers = input_data.get("headers", {})
        body = input_data.get("body")
        timeout = input_data.get("timeout", 30)
        
        if not url:
            return {"success": False, "error": "URL is required"}
        
        try:
            started = time.time()
            async with aiohttp.ClientSession() as session:
                kwargs = {
                    "headers": headers,
                    "timeout": aiohttp.ClientTimeout(total=timeout)
                }
                
                if body:
                    kwargs["data"] = json.dumps(body) if isinstance(body, dict) else body
                
                async with session.request(method, url, **kwargs) as response:
                    response_text = await response.text()
                    
                    return {
                        "success": True,
                        "status": response.status,
                        "headers": dict(response.headers),
                        "body": response_text,
                        "elapsed_ms": int((time.time() - started) * 1000)
                    }
        except Exception as e:
            return {"success": False, "error": str(e)}
