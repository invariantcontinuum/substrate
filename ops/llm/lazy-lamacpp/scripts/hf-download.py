#!/usr/bin/env python3
import argparse
from pathlib import Path

from huggingface_hub import snapshot_download


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--pattern", required=True)
    parser.add_argument("--local-dir", required=True)
    parser.add_argument("--revision", default="main")
    parser.add_argument("--token", default="")
    args = parser.parse_args()

    local_dir = Path(args.local_dir)
    local_dir.mkdir(parents=True, exist_ok=True)

    snapshot_download(
        repo_id=args.repo,
        revision=args.revision,
        local_dir=str(local_dir),
        allow_patterns=[args.pattern],
        local_dir_use_symlinks=False,
        token=args.token or None,
    )

    print(str(local_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

