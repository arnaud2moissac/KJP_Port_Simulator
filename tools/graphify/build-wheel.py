#!/usr/bin/env python3
"""Build the pinned Graphify KJP wheel from a hash-verified upstream wheel."""
from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import zipfile

BASE_VERSION = "0.9.79"
VERSION = "0.9.79+kjp.1"
BASE_SHA256 = "51969b5ab321e369120d2d87ca1f42a169002a82bb2dad1dd7c03ee3b8773c65"
BASE_URL = "https://files.pythonhosted.org/packages/ca/f3/ea1d2238dee222108c024d3febbc4759d4ce73f1b1c451855f6c9168eff0/graphifyy-0.9.79-py3-none-any.whl"
HERE = Path(__file__).resolve().parent


def build(base_wheel: Path, output: Path) -> Path:
    if hashlib.sha256(base_wheel.read_bytes()).hexdigest() != BASE_SHA256:
        raise ValueError("Upstream wheel SHA-256 does not match the pinned release")
    with tempfile.TemporaryDirectory(prefix="kjp-graphify-wheel-") as directory:
        root = Path(directory)
        with zipfile.ZipFile(base_wheel) as archive:
            for name in archive.namelist():
                if Path(name).is_absolute() or ".." in Path(name).parts:
                    raise ValueError("Unsafe wheel entry")
            archive.extractall(root)
        hashes = json.loads((HERE / "base-files.json").read_text())
        for name, expected in hashes.items():
            path = root / name
            actual = hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
            if actual != expected:
                raise ValueError(f"Unexpected upstream file: {name}")
        subprocess.run(
            ["patch", "--batch", "--forward", "-p1", "-d", str(root),
             "-i", str(HERE / "p1.patch")], check=True,
        )
        old_info = root / f"graphifyy-{BASE_VERSION}.dist-info"
        new_info = root / f"graphifyy-{VERSION}.dist-info"
        old_info.rename(new_info)
        metadata = new_info / "METADATA"
        text = metadata.read_text()
        old = f"Version: {BASE_VERSION}\n"
        if text.count(old) != 1:
            raise ValueError("Unexpected wheel version metadata")
        metadata.write_text(text.replace(old, f"Version: {VERSION}\n"))
        record_path = new_info / "RECORD"
        records = []
        files = sorted(path for path in root.rglob("*") if path.is_file() and path != record_path)
        for path in files:
            data = path.read_bytes()
            digest = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).decode().rstrip("=")
            records.append((path.relative_to(root).as_posix(), f"sha256={digest}", str(len(data))))
        records.append((record_path.relative_to(root).as_posix(), "", ""))
        stream = io.StringIO(newline="")
        csv.writer(stream, lineterminator="\n").writerows(records)
        record_path.write_text(stream.getvalue())
        files.append(record_path)
        output.mkdir(parents=True, exist_ok=True)
        target = output / f"graphifyy-{VERSION}-py3-none-any.whl"
        with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(files):
                info = zipfile.ZipInfo(path.relative_to(root).as_posix(), (2026, 10, 7, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o644 << 16
                archive.writestr(info, path.read_bytes())
        return target


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-wheel", type=Path)
    parser.add_argument("--output", type=Path, default=HERE / ".build")
    args = parser.parse_args()
    base = args.base_wheel or HERE / ".build" / f"graphifyy-{BASE_VERSION}-py3-none-any.whl"
    if not base.exists():
        if args.base_wheel:
            parser.error("The specified upstream wheel does not exist")
        base.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["curl", "--fail", "--location", "--silent", "--show-error",
                        BASE_URL, "--output", str(base)], check=True)
    result = build(base, args.output)
    print(result)
    print("sha256=" + hashlib.sha256(result.read_bytes()).hexdigest())


if __name__ == "__main__":
    main()
