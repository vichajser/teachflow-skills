#!/usr/bin/env python3
"""把一个 skill 的 zip 发上线。

用法：

    export API_BASE=https://tryteachflow.com
    export ADMIN_TOKEN=...
    python3 tools/publish.py \\
        --skill lesson-workflow \\
        --version 1.2.0 \\
        --zip dist/lesson-workflow.zip \\
        --changelog-en "Worksheet answer keys now ship with every lesson." \\
        --changelog-ko "이제 모든 수업에 정답지가 함께 제공됩니다."

只用标准库：这台机器装不了第三方包，而发版是出了事最需要能跑的那个脚本，
不该依赖一个可能装不上的 requests。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ENDPOINT = "/api/admin/releases"


def build_multipart(fields: dict[str, str], filename: str, blob: bytes) -> tuple[bytes, str]:
    """手搓 multipart/form-data。

    边界串用 uuid4，不用固定值：固定边界一旦出现在 zip 的字节里，
    服务端就会在半截处把正文切开，而 zip 是二进制，什么字节都可能有。
    """
    boundary = f"----teachflow{uuid.uuid4().hex}"
    out = bytearray()

    for name, value in fields.items():
        out += f"--{boundary}\r\n".encode()
        out += f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode()
        out += value.encode("utf-8")
        out += b"\r\n"

    out += f"--{boundary}\r\n".encode()
    out += (
        f'Content-Disposition: form-data; name="zip"; filename="{filename}"\r\n'
        "Content-Type: application/zip\r\n\r\n"
    ).encode()
    out += blob
    out += b"\r\n"
    out += f"--{boundary}--\r\n".encode()

    return bytes(out), f"multipart/form-data; boundary={boundary}"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="发布一个 skill 版本。")
    parser.add_argument("--skill", required=True, help="skill id，例如 lesson-workflow")
    parser.add_argument("--version", required=True, help="版本号 x.y.z，必须与 SKILL.md 里一致")
    parser.add_argument("--zip", required=True, help="要上传的 zip 路径")
    parser.add_argument("--changelog-en", required=True, help="英文变更说明，会进买家邮件")
    parser.add_argument("--changelog-ko", required=True, help="韩文变更说明，会进买家邮件")
    args = parser.parse_args(argv)

    api_base = os.environ.get("API_BASE", "").rstrip("/")
    token = os.environ.get("ADMIN_TOKEN", "")
    missing = [n for n, v in (("API_BASE", api_base), ("ADMIN_TOKEN", token)) if not v]
    if missing:
        print(f"缺少环境变量：{', '.join(missing)}", file=sys.stderr)
        return 2

    path = Path(args.zip)
    if not path.is_file():
        print(f"找不到 zip：{path}", file=sys.stderr)
        return 2
    blob = path.read_bytes()

    body, content_type = build_multipart(
        {
            "skill": args.skill,
            "version": args.version,
            "changelog_en": args.changelog_en,
            "changelog_ko": args.changelog_ko,
        },
        path.name,
        blob,
    )

    req = urllib.request.Request(
        api_base + ENDPOINT,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": content_type,
            "Content-Length": str(len(body)),
        },
    )

    print(f"上传 {path.name}（{len(blob)} 字节）到 {api_base}{ENDPOINT} …")

    try:
        with urllib.request.urlopen(req) as res:
            payload = res.read().decode("utf-8", "replace")
            status = res.status
    except urllib.error.HTTPError as err:
        # 原样打印服务端的错误正文：那里面写着「哪个版本号对不上」「zip 差什么」，
        # 我在这里转述一遍只会把有用的细节磨掉。
        detail = err.read().decode("utf-8", "replace")
        print(f"发版失败：HTTP {err.code}", file=sys.stderr)
        print(detail, file=sys.stderr)
        return 1
    except urllib.error.URLError as err:
        print(f"发版失败：连不上 {api_base}（{err.reason}）", file=sys.stderr)
        return 1

    if not 200 <= status < 300:
        print(f"发版失败：HTTP {status}", file=sys.stderr)
        print(payload, file=sys.stderr)
        return 1

    try:
        receipt = json.loads(payload)
    except json.JSONDecodeError:
        # 回执解析不了不代表没发成功，正文照样打出来让人自己看。
        print(payload)
        return 0

    print("发版成功：")
    for key in ("skill", "version", "sha256", "size_bytes", "published_at"):
        if key in receipt:
            print(f"  {key}: {receipt[key]}")
    print("归档与买家更新通知已交给后台任务，不需要再做别的。")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
