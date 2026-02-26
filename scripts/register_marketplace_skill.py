import asyncio
import json
from pathlib import Path
from app.core.skills import upsert_skill

async def register_marketplace_skill():
    skill_path = Path("skills/marketplace-eye/_meta.json")
    if not skill_path.exists():
        print("Meta file not found.")
        return
    
    with open(skill_path, "r") as f:
        meta = json.load(f)
    
    await upsert_skill(meta["skill_id"], meta)
    print(f"Skill '{meta['name']}' registered successfully.")

if __name__ == "__main__":
    asyncio.run(register_marketplace_skill())
