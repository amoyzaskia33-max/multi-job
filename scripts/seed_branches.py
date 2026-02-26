import asyncio
from app.core.branches import create_branch

async def seed_initial_branches():
    # Mendirikan Kantor Pertama
    try:
        await create_branch(
            name="Spio Agency Digital", 
            blueprint_id="bp_agency_digital",
            kpi={"revenue_target": 50000000} # Target 50jt
        )
        # Mendirikan Kantor Kedua
        await create_branch(
            name="Spio Web Store", 
            blueprint_id="bp_website_sales",
            kpi={"revenue_target": 25000000} # Target 25jt
        )
        print("Dua perusahaan cabang berhasil didirikan!")
    except Exception as e:
        print(f"Gagal mendirikan cabang: {e}")

if __name__ == "__main__":
    asyncio.run(seed_initial_branches())
