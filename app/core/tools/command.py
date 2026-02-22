import asyncio
import os
import time
from typing import Any, Dict, List

from .base import Tool

BATAS_TIMEOUT_DETIK = 1800
BATAS_POTONG_OUTPUT = 3000

PREFIX_PERINTAH_BAWAAN: List[str] = [
    "pytest",
    "python -m pytest",
    "uv run pytest",
    "npm test",
    "npm run test",
    "npm run build",
    "npm run lint",
    "pnpm test",
    "pnpm run test",
    "pnpm run build",
    "pnpm run lint",
    "yarn test",
    "yarn build",
    "yarn lint",
    "go test",
    "cargo test",
    "ruff check",
    "mypy",
    "docker build",
    "docker compose build",
    "docker compose up",
    "vercel",
    "netlify deploy",
]

KATA_KUNCI_PERINTAH_SENSITIF: List[str] = [
    "rm -rf",
    "del /f",
    "format ",
    "shutdown",
    "reboot",
    "mkfs",
    "dd if=",
    "git push",
    "git reset --hard",
    "git checkout --",
    "docker system prune",
    "kubectl apply",
    "helm upgrade",
    "terraform apply",
    "vercel --prod",
    "netlify deploy --prod",
    "npm run deploy",
    "pnpm run deploy",
    "yarn deploy",
]

KATA_KUNCI_OPERATOR_SHELL: List[str] = [
    "&&",
    "||",
    ";",
    "|",
    "$(",
    "`",
    "\n",
    "\r",
]


def _normalisasi_path(path: str) -> str:
    return os.path.abspath(os.path.realpath(os.path.expanduser(path)))


def _normalisasi_daftar_direktori(raw: Any) -> List[str]:
    kandidat: List[str] = []
    if isinstance(raw, str):
        teks = raw.replace("\n", ";")
        kandidat.extend(teks.split(";"))
    elif isinstance(raw, (list, tuple, set)):
        for item in raw:
            kandidat.append(str(item or ""))

    hasil: List[str] = []
    sudah = set()
    for item in kandidat:
        teks = str(item or "").strip()
        if not teks:
            continue
        path = _normalisasi_path(teks)
        kunci = os.path.normcase(path)
        if kunci in sudah:
            continue
        sudah.add(kunci)
        hasil.append(path)
    return hasil


def _akar_workdir_diizinkan(input_data: Dict[str, Any]) -> List[str]:
    dari_input = _normalisasi_daftar_direktori(input_data.get("allowed_workdir_roots"))
    if dari_input:
        return dari_input

    dari_env = _normalisasi_daftar_direktori(os.getenv("AGENT_COMMAND_ALLOWED_ROOTS", ""))
    if dari_env:
        return dari_env

    return [_normalisasi_path(os.getcwd())]


def _path_di_dalam_akar(path: str, akar: str) -> bool:
    try:
        return os.path.commonpath([path, akar]) == akar
    except Exception:
        return False


def _workdir_diizinkan(workdir: str, daftar_akar: List[str]) -> bool:
    return any(_path_di_dalam_akar(workdir, akar) for akar in daftar_akar)


def _mengandung_operator_shell(perintah: str) -> bool:
    teks = str(perintah or "")
    return any(token in teks for token in KATA_KUNCI_OPERATOR_SHELL)


def normalisasi_daftar_prefix_perintah(raw: Any) -> List[str]:
    kandidat: List[str] = []
    if isinstance(raw, str):
        if raw.strip():
            pecah = raw.replace("\n", ";").split(";")
            kandidat.extend(pecah)
    elif isinstance(raw, (list, tuple, set)):
        for item in raw:
            teks = str(item or "").strip()
            if teks:
                kandidat.append(teks)

    hasil: List[str] = []
    sudah = set()
    for item in kandidat:
        teks = str(item or "").strip()
        if not teks:
            continue
        lower = teks.lower()
        if lower in sudah:
            continue
        sudah.add(lower)
        hasil.append(teks)
    return hasil


def _prefix_perintah_dari_env() -> List[str]:
    raw = os.getenv("AGENT_COMMAND_ALLOW_PREFIXES", "")
    prefix = normalisasi_daftar_prefix_perintah(raw)
    if prefix:
        return prefix
    return list(PREFIX_PERINTAH_BAWAAN)


def perintah_diizinkan_oleh_prefix(perintah: str, daftar_prefix: List[str]) -> bool:
    teks = str(perintah or "").strip().lower()
    if not teks:
        return False
    for prefix in daftar_prefix:
        prefix_clean = str(prefix or "").strip().lower()
        if not prefix_clean:
            continue
        if teks == prefix_clean or teks.startswith(prefix_clean + " "):
            return True
    return False


def perintah_termasuk_sensitif(perintah: str) -> bool:
    teks = str(perintah or "").strip().lower()
    if not teks:
        return False
    for kata in KATA_KUNCI_PERINTAH_SENSITIF:
        if kata in teks:
            return True
    return False


def _potong_output(teks: str) -> str:
    if len(teks) <= BATAS_POTONG_OUTPUT:
        return teks
    return teks[: BATAS_POTONG_OUTPUT - 3] + "..."


def _baca_timeout_detik(raw: Any) -> int:
    try:
        value = int(raw)
    except Exception:
        value = 180
    return max(1, min(BATAS_TIMEOUT_DETIK, value))


class CommandTool(Tool):
    @property
    def name(self) -> str:
        return "command"

    @property
    def version(self) -> str:
        return "1.0.0"

    async def run(self, input_data: Dict[str, Any], ctx) -> Dict[str, Any]:
        perintah = str(input_data.get("command") or "").strip()
        if not perintah:
            return {"success": False, "error": "command is required"}

        izinkan_operator_shell = bool(input_data.get("allow_shell_operators", False))
        if _mengandung_operator_shell(perintah) and not izinkan_operator_shell:
            return {
                "success": False,
                "error": "Perintah mengandung operator shell. Butuh approval (allow_shell_operators=true).",
                "command": perintah,
            }

        daftar_prefix = normalisasi_daftar_prefix_perintah(input_data.get("allow_prefixes"))
        if not daftar_prefix:
            daftar_prefix = _prefix_perintah_dari_env()

        izinkan_sensitif = bool(input_data.get("allow_sensitive", False))
        if perintah_termasuk_sensitif(perintah) and not izinkan_sensitif:
            return {
                "success": False,
                "error": "Perintah sensitif. Butuh approval (allow_sensitive_commands=true).",
                "command": perintah,
            }

        if not perintah_diizinkan_oleh_prefix(perintah, daftar_prefix):
            return {
                "success": False,
                "error": "Perintah tidak masuk allowlist prefix command.",
                "command": perintah,
                "allow_prefixes": daftar_prefix,
            }

        direktori_kerja_input = str(input_data.get("workdir") or "").strip()
        if direktori_kerja_input:
            direktori_kerja = _normalisasi_path(direktori_kerja_input)
        else:
            direktori_kerja = _normalisasi_path(os.getcwd())

        if not os.path.exists(direktori_kerja):
            return {"success": False, "error": f"workdir tidak ditemukan: {direktori_kerja}", "command": perintah}
        if not os.path.isdir(direktori_kerja):
            return {"success": False, "error": f"workdir bukan direktori: {direktori_kerja}", "command": perintah}

        daftar_akar_workdir = _akar_workdir_diizinkan(input_data)
        if not _workdir_diizinkan(direktori_kerja, daftar_akar_workdir):
            return {
                "success": False,
                "error": "workdir di luar batas direktori yang diizinkan.",
                "command": perintah,
                "workdir": direktori_kerja,
                "allowed_workdir_roots": daftar_akar_workdir,
            }

        env_tambahan = input_data.get("env", {})
        env = os.environ.copy()
        if isinstance(env_tambahan, dict):
            for key, value in env_tambahan.items():
                nama = str(key or "").strip()
                if not nama:
                    continue
                env[nama] = str(value)

        timeout_detik = _baca_timeout_detik(input_data.get("timeout_sec", 180))
        mulai = time.time()
        proses = None
        try:
            proses = await asyncio.create_subprocess_shell(
                perintah,
                cwd=direktori_kerja,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            try:
                stdout_raw, stderr_raw = await asyncio.wait_for(proses.communicate(), timeout=timeout_detik)
            except asyncio.TimeoutError:
                proses.kill()
                await proses.communicate()
                durasi_ms = int((time.time() - mulai) * 1000)
                return {
                    "success": False,
                    "error": f"Perintah timeout setelah {timeout_detik} detik",
                    "command": perintah,
                    "workdir": direktori_kerja,
                    "duration_ms": durasi_ms,
                    "exit_code": -1,
                }

            stdout = _potong_output((stdout_raw or b"").decode(errors="replace"))
            stderr = _potong_output((stderr_raw or b"").decode(errors="replace"))
            durasi_ms = int((time.time() - mulai) * 1000)
            kode_keluar = int(proses.returncode if proses.returncode is not None else -1)

            return {
                "success": kode_keluar == 0,
                "command": perintah,
                "workdir": direktori_kerja,
                "duration_ms": durasi_ms,
                "exit_code": kode_keluar,
                "stdout": stdout,
                "stderr": stderr,
                "error": None if kode_keluar == 0 else f"Perintah gagal dengan exit code {kode_keluar}",
            }
        except Exception as exc:
            if proses and proses.returncode is None:
                proses.kill()
                await proses.communicate()
            durasi_ms = int((time.time() - mulai) * 1000)
            return {
                "success": False,
                "command": perintah,
                "workdir": direktori_kerja,
                "duration_ms": durasi_ms,
                "error": str(exc),
            }
