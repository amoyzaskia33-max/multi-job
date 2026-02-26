import asyncio
from app.core.branches import create_branch

async def seed_initial_branches():
    # Mendirikan HANYA SATU Perusahaan Cabang untuk Uji Coba
    try:
        print("Mendirikan Cabang Perintis: Spio Agency Digital...")
        await create_branch(
            name="Spio Agency Digital", 
            blueprint_id="bp_agency_digital",
            kpi={"revenue_target": 50000000} # Target 50jt
        )
        print("--- CABANG PERINTIS BERHASIL DIDIRIKAN ---")
    except Exception as e:
        print(f"Gagal mendirikan cabang: {e}")

if __name__ == "__main__":
    asyncio.run(seed_initial_branches())
