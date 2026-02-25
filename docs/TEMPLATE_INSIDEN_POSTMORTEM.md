# Template Insiden dan Postmortem

Gunakan template ini setelah terjadi insiden produksi atau gangguan operasional signifikan.

## 1) Identitas Insiden

| Field | Isi |
| --- | --- |
| Incident ID |  |
| Tanggal/Waktu Mulai |  |
| Tanggal/Waktu Selesai |  |
| Durasi |  |
| Severity (P0/P1/P2/P3) |  |
| Reporter |  |
| Incident Commander |  |
| Sistem terdampak |  |

## 2) Ringkasan Singkat

Tuliskan 3-5 kalimat:

1. Apa yang terjadi.
2. Dampak ke user/operasi.
3. Apa yang dilakukan sampai pulih.

## 3) Dampak Bisnis/Operasional

| Area Dampak | Keterangan |
| --- | --- |
| User terdampak |  |
| Fitur terdampak |  |
| Data/transaction impact |  |
| SLA/SLO impact |  |

## 4) Timeline Kejadian

| Waktu | Kejadian | Bukti (log/link) | PIC |
| --- | --- | --- | --- |
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |

## 5) Akar Masalah (Root Cause)

| Lapisan | Temuan |
| --- | --- |
| Trigger awal |  |
| Faktor teknis utama |  |
| Faktor proses/operasional |  |
| Kenapa lolos dari deteksi awal |  |

### 5-Why (Opsional tapi disarankan)

| Why ke- | Jawaban |
| --- | --- |
| Why 1 |  |
| Why 2 |  |
| Why 3 |  |
| Why 4 |  |
| Why 5 |  |

## 6) Tindakan Saat Insiden (Mitigasi)

| Aksi | Jenis (Mitigasi/Rollback/Fix) | Hasil |
| --- | --- | --- |
|  |  |  |
|  |  |  |

## 7) Action Item Permanen (Preventive)

| No | Action Item | Owner | Prioritas | Target Tanggal | Status |
| --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  | Open |
| 2 |  |  |  |  | Open |
| 3 |  |  |  |  | Open |

## 8) Verifikasi Penutupan

Checklist:

- [ ] Health endpoint stabil (`/healthz`, `/readyz`)
- [ ] Queue depth kembali normal
- [ ] Failed ratio kembali normal
- [ ] CI test utama hijau
- [ ] Monitoring tambahan sudah dipasang (jika perlu)
- [ ] Action item sudah ada owner dan deadline

## 9) Lessons Learned

### Hal yang berjalan baik

1.
2.

### Hal yang harus diperbaiki

1.
2.

### Perubahan proses yang disepakati

1.
2.
