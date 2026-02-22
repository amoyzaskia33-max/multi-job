import os
from typing import Any, Dict, List
from .base import Tool


def _normalisasi_path(path: str) -> str:
    return os.path.abspath(os.path.realpath(os.path.expanduser(path)))


def _normalisasi_daftar_akar(raw: Any) -> List[str]:
    kandidat: List[str] = []
    if isinstance(raw, str):
        kandidat.extend(raw.replace("\n", ";").split(";"))
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


def _akar_diizinkan(input_data: Dict[str, Any]) -> List[str]:
    dari_input = _normalisasi_daftar_akar(input_data.get("allowed_roots"))
    if dari_input:
        return dari_input

    dari_env = _normalisasi_daftar_akar(os.getenv("AGENT_FILES_ALLOWED_ROOTS", ""))
    if dari_env:
        return dari_env

    return [_normalisasi_path(os.getcwd())]


def _path_di_dalam_akar(path: str, akar: str) -> bool:
    try:
        return os.path.commonpath([path, akar]) == akar
    except Exception:
        return False


def _path_diizinkan(path: str, daftar_akar: List[str]) -> bool:
    return any(_path_di_dalam_akar(path, akar) for akar in daftar_akar)


class FilesTool(Tool):
    @property
    def name(self) -> str:
        return "files"
    
    @property
    def version(self) -> str:
        return "1.0.0"
    
    async def run(self, input_data: Dict[str, Any], ctx) -> Dict[str, Any]:
        action = str(input_data.get("action") or "").strip().lower()
        path_raw = str(input_data.get("path") or "").strip()

        if not action:
            return {"success": False, "error": "Action is required"}
        if not path_raw:
            return {"success": False, "error": "Path is required"}

        daftar_akar = _akar_diizinkan(input_data)
        path = _normalisasi_path(path_raw)
        if not _path_diizinkan(path, daftar_akar):
            return {
                "success": False,
                "error": "Path di luar direktori yang diizinkan.",
                "path": path,
                "allowed_roots": daftar_akar,
            }

        try:
            if action == "read":
                if not os.path.exists(path):
                    return {"success": False, "error": f"Path tidak ditemukan: {path}"}
                if not os.path.isfile(path):
                    return {"success": False, "error": f"Path bukan file: {path}"}
                with open(path, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
                return {"success": True, "path": path, "content": content}

            if action == "write":
                mode = str(input_data.get("mode", "w") or "w").strip().lower()
                if mode not in {"w", "a", "x"}:
                    return {"success": False, "error": f"Mode tidak didukung: {mode}"}

                parent_dir = _normalisasi_path(os.path.dirname(path) or ".")
                if not _path_diizinkan(parent_dir, daftar_akar):
                    return {
                        "success": False,
                        "error": "Direktori tujuan di luar root yang diizinkan.",
                        "path": path,
                        "allowed_roots": daftar_akar,
                    }

                os.makedirs(parent_dir, exist_ok=True)
                content = str(input_data.get("content", ""))
                with open(path, mode, encoding="utf-8") as f:
                    f.write(content)
                return {"success": True, "path": path, "message": f"File {path} written successfully"}

            if action == "list":
                if os.path.isdir(path):
                    files = sorted(os.listdir(path))
                    return {"success": True, "path": path, "files": files}
                return {"success": False, "error": f"{path} is not a directory"}

            return {"success": False, "error": f"Unknown action: {action}"}

        except Exception as e:
            return {"success": False, "error": str(e)}
