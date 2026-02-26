import asyncio
import json
from app.core.branches import create_branch, upsert_blueprint
from app.core.boardroom import get_chat_history, notify_chairman
from app.core.armory import count_ready_accounts_for_branch

async def run_proactive_simulation():
    print("\n--- MEMULAI SIMULASI CEO PROAKTIF ---")
    
    # 1. Setup Cabang 'Kosong' (Pemicu Masalah)
    branch_name = "Unit Bisnis Krisis"
    bp_id = "bp_agency_digital"
    branch = await create_branch(branch_name, bp_id)
    branch_id = branch["branch_id"]
    print(f"1. Cabang '{branch_name}' didirikan (ID: {branch_id})")
    
    # 2. Cek Kesiapan (Harusnya 0 amunisi)
    ready_accounts = await count_ready_accounts_for_branch(branch_id)
    print(f"2. Status Amunisi: {ready_accounts} (Kosong)")
    
    # 3. Simulasi Watchdog mendeteksi masalah
    if not ready_accounts:
        print("3. Watchdog mendeteksi kritis: NO AMMO!")
        await notify_chairman(
            f"LAPORAN DARURAT: Unit Bisnis '{branch_name}' ({branch_id}) terdeteksi 'NO AMMO'. Operasional terhenti.",
            role="CEO"
        )
    
    # 4. Verifikasi apakah pesan CEO masuk ke Boardroom
    await asyncio.sleep(1) # Give time for redis
    history = await get_chat_history(limit=5)
    
    print("\n--- ISI EXECUTIVE BOARDROOM TERBARU ---")
    found_alert = False
    for msg in history:
        print(f"[{msg['sender']}]: {msg['text']}")
        if "NO AMMO" in msg['text'] and msg['sender'] == "CEO":
            found_alert = True
            
    if found_alert:
        print("\nKESIMPULAN: CEO BERHASIL BERTINDAK PROAKTIF!")
    else:
        print("\nKESIMPULAN: CEO GAGAL (Pesan tidak terkirim)")

if __name__ == "__main__":
    asyncio.run(run_proactive_simulation())
