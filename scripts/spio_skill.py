import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple
from urllib.parse import urlparse
from urllib.request import urlopen

import yaml

from app.core.skills import delete_skill, get_skill, list_skills, upsert_skill


def _collect_skill_sources(source: str) -> List[Tuple[str, str]]:
    parsed = urlparse(source)
    if parsed.scheme in {"http", "https"}:
        with urlopen(source) as response:
            payload = response.read().decode("utf-8")
        return [(source, payload)]

    path = Path(source)
    if not path.exists():
        raise FileNotFoundError(source)

    if path.is_dir():
        candidates = sorted(path.glob("*.json")) + sorted(path.glob("*.yaml")) + sorted(path.glob("*.yml"))
        if not candidates:
            raise FileNotFoundError(f"tidak ada file skill pada folder {source}")
        return [(str(file), file.read_text(encoding="utf-8")) for file in candidates]

    return [(source, path.read_text(encoding="utf-8"))]


def _parse_skill_documents(content: str) -> List[Any]:
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        data = yaml.safe_load(content)

    if data is None:
        return []
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    raise ValueError("Skill definition harus berupa objek atau array JSON/YAML.")


def _normalize_spec(raw: Any) -> Tuple[str, Dict[str, Any]]:
    if not isinstance(raw, dict):
        raise ValueError("Skill spec harus berupa objek.")
    skill_id = str(raw.get("skill_id") or raw.get("id") or "").strip()
    if not skill_id:
        raise ValueError("Field skill_id wajib disediakan.")
    payload = dict(raw)
    payload.pop("skill_id", None)
    payload.pop("id", None)
    return skill_id, payload


async def _install_source(source: str, dry_run: bool) -> List[Dict[str, Any]]:
    instals: List[Dict[str, Any]] = []
    entries = _collect_skill_sources(source)
    for entry_name, text in entries:
        docs = _parse_skill_documents(text)
        if not docs:
            print(f"[SKIP] {entry_name} tidak berisi skill apa pun.")
            continue
        for raw in docs:
            try:
                skill_id, payload = _normalize_spec(raw)
            except ValueError as exc:
                print(f"[ERROR] {entry_name}: {exc}", file=sys.stderr)
                continue

            print(f"[INSTALL] {skill_id} (sumber {entry_name})")
            if dry_run:
                continue
            try:
                view = await upsert_skill(skill_id, payload)
            except ValueError as exc:
                print(f"[ERROR] {skill_id}: {exc}", file=sys.stderr)
                continue
            instals.append(view)
    return instals


def _render_skill_list(rows: Sequence[Dict[str, Any]]) -> None:
    if not rows:
        print("Tidak ada skill terdaftar.")
        return

    for row in rows:
        tags = ", ".join(row.get("tags", [])) or "-"
        channels = ", ".join(row.get("allowed_channels", [])) or "-"
        print(f"- {row['skill_id']} | {row['name']} | v{row.get('version', '')} | tags: {tags} | channels: {channels}")


def main():
    parser = argparse.ArgumentParser(prog="spio skill", description="Skill registry helper")
    subparsers = parser.add_subparsers(dest="command")

    install_cmd = subparsers.add_parser("install", help="Pasang skill dari file/URL/folder")
    install_cmd.add_argument("source", help="Path/local folder atau URL ke definisi skill")
    install_cmd.add_argument("--dry-run", action="store_true", help="Tampilkan skill yang akan dipasang tanpa menyimpan")

    subparsers.add_parser("list", help="Tampilkan semua skill yang terdaftar")

    describe_cmd = subparsers.add_parser("describe", help="Cetak detail skill")
    describe_cmd.add_argument("skill_id", help="skill_id yang ingin ditampilkan")

    delete_cmd = subparsers.add_parser("delete", help="Hapus skill")
    delete_cmd.add_argument("skill_id", help="skill_id yang akan dihapus")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return

    if args.command == "install":
        hasil = asyncio.run(_install_source(args.source, dry_run=args.dry_run))
        if hasil and not args.dry_run:
            print(f"Skill terpasang: {len(hasil)}")
    elif args.command == "list":
        rows = asyncio.run(list_skills())
        _render_skill_list(rows)
    elif args.command == "describe":
        row = asyncio.run(get_skill(args.skill_id))
        if not row:
            print(f"Skill '{args.skill_id}' tidak ditemukan.")
            return
        print(json.dumps(row, indent=2, ensure_ascii=False))
    elif args.command == "delete":
        sukses = asyncio.run(delete_skill(args.skill_id))
        if sukses:
            print(f"Skill '{args.skill_id}' dihapus.")
        else:
            print(f"Skill '{args.skill_id}' tidak ada.")


if __name__ == "__main__":
    main()
