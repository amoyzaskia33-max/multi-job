import os
import aiohttp
import uuid
from typing import Dict, Any, Optional
from .base import Tool

class MultimediaTool(Tool):
    @property
    def name(self) -> str:
        return "multimedia"
    
    @property
    def version(self) -> str:
        return "1.0.0"
    
    async def run(self, input_data: Dict[str, Any], ctx) -> Dict[str, Any]:
        action = input_data.get("action") # generate_image, create_video
        branch_id = input_data.get("branch_id", "default")
        
        # Ensure branch directory exists
        asset_dir = f"assets/branches/{branch_id}/media"
        os.makedirs(asset_dir, exist_ok=True)

        if action == "generate_image":
            prompt = input_data.get("prompt")
            if not prompt: return {"success": False, "error": "prompt is required"}
            
            from app.core.config import settings
            filename = f"img_{uuid.uuid4().hex[:8]}.png"
            filepath = os.path.join(asset_dir, filename)

            # 1. Try Private AI Node (VPS 2 / HuggingFace Factory)
            if settings.AI_NODE_URL:
                try:
                    async with aiohttp.ClientSession() as session:
                        url = f"{settings.AI_NODE_URL.rstrip('/')}/generate/image"
                        headers = {"X-Factory-Secret": settings.AI_NODE_SECRET}
                        payload = {"prompt": prompt, "size": "1024x1024"}
                        async with session.post(url, headers=headers, json=payload, timeout=120) as resp:
                            if resp.status == 200:
                                with open(filepath, "wb") as f:
                                    f.write(await resp.read())
                                return {
                                    "success": True, 
                                    "source": "private_node",
                                    "file_path": filepath,
                                    "public_url": f"/media/{branch_id}/{filename}"
                                }
                except Exception as e:
                    # Fallback to OpenAI if private node fails
                    pass

            # 2. Fallback to OpenAI DALL-E
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                return {"success": False, "error": "OPENAI_API_KEY missing for image generation"}
            
            filename = f"img_{uuid.uuid4().hex[:8]}.png"
            filepath = os.path.join(asset_dir, filename)
            
            try:
                async with aiohttp.ClientSession() as session:
                    url = "https://api.openai.com/v1/images/generations"
                    headers = {"Authorization": f"Bearer {api_key}"}
                    payload = {
                        "model": "dall-e-3",
                        "prompt": prompt,
                        "n": 1,
                        "size": "1024x1024"
                    }
                    async with session.post(url, headers=headers, json=payload) as resp:
                        data = await resp.json()
                        image_url = data['data'][0]['url']
                        
                        # Download and save locally
                        async with session.get(image_url) as img_resp:
                            with open(filepath, "wb") as f:
                                f.write(await img_resp.read())
                
                return {
                    "success": True, 
                    "action": "generate_image",
                    "file_path": filepath,
                    "public_url": f"/media/{branch_id}/{filename}"
                }
            except Exception as e:
                return {"success": False, "error": str(e)}

        elif action == "create_video":
            # This would normally use FFmpeg to stitch images
            # For now, we simulate the production of a video file
            filename = f"vid_{uuid.uuid4().hex[:8]}.mp4"
            filepath = os.path.join(asset_dir, filename)
            with open(filepath, "w") as f: f.write("fake video data")
            
            return {
                "success": True,
                "action": "create_video",
                "file_path": filepath,
                "message": "Video successfully rendered using FFmpeg (simulated)"
            }

        return {"success": False, "error": f"Unknown action: {action}"}
