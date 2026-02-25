# Skill Registry & Skill CLI

Skill registry adalah lapisan metadata yang menyimpan *skill* (pola kerja/blueprint) yang bisa dijalankan oleh `agent.workflow`. Skill tersimpan di Redis (`skill:all` + `skill:item:{skill_id}`) bersama informasi policy, channel yang diperbolehkan, dan input default yang bisa digunakan langsung ketika membuat job.  

##### Struktur skill (spec)

| Field | Tipe | Keterangan |
| --- | --- | --- |
| `skill_id` | string | Identifier unik (`[a-zA-Z0-9._:-]{1,64}`) |
| `name` | string | Nama manusiawi skill |
| `description` | string | Ringkasan singkat |
| `job_type` | string | Tipe job (`agent.workflow`, `monitor.channel`, dll.) |
| `version` | string | Versi skill (default `1.0.0`) |
| `default_inputs` | object | Input bawaan (misalnya `prompt`, `flow_group`, dll.) |
| `command_allow_prefixes` | array | Prefix perintah lokal yang boleh dijalankan |
| `allowed_channels` | array | Kanal yang bisa memicu skill (misal `telegram`, `webhook`) |
| `allow_sensitive_commands` | boolean | Jika `true`, perintah sensitif diperbolehkan tanpa approval tambahan |
| `require_approval` | boolean | Jika `true`, skill selalu butuh approval workflow |
| `tags` | array | Label untuk pencarian/filter |
| `runbook` | string | Catatan operasional atau link referensi |
| `source` | string | Nomor repo/tool asal (opsional) |

##### Contoh YAML skill

```yaml
skill_id: skill_content_brief
name: Penulisan Brief Konten
description: Buat outline dan brief konten sosial setiap pagi.
job_type: agent.workflow
version: "1.0.1"
default_inputs:
  prompt: "Rangkum tren harian dan susun outline konten TikTok."
  flow_group: tim_konten
  flow_max_active_runs: 5
command_allow_prefixes:
  - "python scripts/prepare"
  - "npm run build"
allowed_channels:
  - telegram
tags:
  - konten
  - automation
require_approval: false
allow_sensitive_commands: false
runbook: https://wiki.internal/skills#content-brief
source: internal/skills/content-team
```

##### API & CLI

- **API endpoint** `/skills`: daftar semua skill (opsional filter `?tags=ops,konten`)  
- **`GET /skills/{skill_id}`**: detail skill, digunakan dalam UI dan tooling  
- **`PUT /skills/{skill_id}`** / **`POST /skills/sync`**: untuk mengunggah skill baru  
- **`DELETE /skills/{skill_id}`**: hapus skill dari registry  

Tambahkan skill baru baik langsung via API maupun CLI. Contoh CLI:

```bash
python scripts/spio_skill.py install ./skills/content-brief.yaml
python scripts/spio_skill.py list
python scripts/spio_skill.py describe skill_content_brief
python scripts/spio_skill.py delete skill_content_brief
```

`install` mendukung file JSON/YAML atau folder berisi beberapa definisi. Tambahkan `--dry-run` untuk simulasi tanpa menyimpan. CLI memakai `PyYAML` jadi pastikan dependency terpasang.
