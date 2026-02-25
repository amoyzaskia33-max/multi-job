# Checklist Operasional Harian

Dokumen ini dipakai operator untuk menjaga sistem tetap sehat sepanjang hari.

## 1) Checklist Pagi (Start of Day)

| No | Item Cek | Target Normal | Cara Cek | Status |
| --- | --- | --- | --- | --- |
| 1 | API health | `/healthz` = 200 | `curl http://127.0.0.1:8000/healthz` | [ ] |
| 2 | API ready | `/readyz` = 200 | `curl http://127.0.0.1:8000/readyz` | [ ] |
| 3 | UI dashboard | Bisa dibuka normal | Buka `http://127.0.0.1:3000` | [ ] |
| 4 | Queue depth | Rendah/stabil | `GET /queue` | [ ] |
| 5 | Worker hidup | Run diproses | `GET /runs?limit=20` | [ ] |
| 6 | Scheduler aktif | Event dispatch jalan | `GET /events?limit=50` | [ ] |
| 7 | Error log | Tidak ada error kritis baru | Cek `runtime-logs/*.err.log` | [ ] |

## 2) Monitoring Berkala (Setiap 1-2 Jam)

| No | Item Pantau | Ambang Normal | Warning | Kritis | Aksi Cepat |
| --- | --- | --- | --- | --- | --- |
| 1 | Queue depth | 0-20 | 20-100 | >100 terus naik | Naikkan worker concurrency, cek worker log |
| 2 | Failed run ratio | <1% | 1-5% | >5% | Cek error dominan, rollback perubahan terbaru bila perlu |
| 3 | API latency | <500 ms | >2 detik | timeout sering | Cek resource host, cek bottleneck endpoint |
| 4 | UI akses | normal | kadang lambat | gagal load | cek process UI + port conflict |
| 5 | CI status | hijau | flaky | merah berulang | buka log workflow, perbaiki penyebab utama |

## 3) Checklist Akhir Hari (End of Day)

| No | Item | Kriteria Selesai | Status |
| --- | --- | --- | --- |
| 1 | Tidak ada insiden aktif P0/P1 | semua tertangani/tereskalasi | [ ] |
| 2 | Run gagal utama sudah dianalisis | ada catatan akar masalah | [ ] |
| 3 | Queue stabil | tidak ada backlog runaway | [ ] |
| 4 | CI branch utama hijau | workflow terakhir success | [ ] |
| 5 | Catatan harian diisi | ringkasan + action item besok | [ ] |

## 4) Template Catatan Harian Singkat

Gunakan format ini setiap hari:

```text
Tanggal:
Operator:

Ringkasan kondisi:
- API:
- Queue:
- Run success/failure:
- CI:

Insiden hari ini:
- [ID/Deskripsi]:
  Dampak:
  Akar masalah:
  Tindakan:

Action item besok:
1.
2.
```

## 5) Eskalasi Cepat

1. P0/P1: langsung eskalasi ke maintainer utama.
2. P2: buka issue + assign owner + target waktu.
3. P3: masukkan backlog sprint.
