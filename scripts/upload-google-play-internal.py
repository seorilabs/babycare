#!/usr/bin/env python3
"""Upload a signed AAB to a Google Play track via the Android Publisher API.

Contract (seorilabs/.github rn-deploy-google-play):
    upload-google-play-internal.py --aab-path P --release-name N --release-status S
        --track T [--changes-not-sent-for-review]
        [--release-notes TEXT --release-notes-language LANG]

Auth: Application Default Credentials, provided by google-github-actions/auth
      (Workload Identity Federation) — GOOGLE_APPLICATION_CREDENTIALS is set in CI.
Package name: read from play-store/google-play.config.json (single source of truth).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from google.auth import default
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

SCOPES = ["https://www.googleapis.com/auth/androidpublisher"]
CONFIG_PATH = Path("play-store/google-play.config.json")


def load_package_name() -> str:
    if not CONFIG_PATH.exists():
        sys.exit(f"{CONFIG_PATH} not found")
    data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    package_name = data.get("packageName")
    if not package_name or "확정" in str(package_name):
        sys.exit("packageName is unresolved in google-play.config.json")
    return package_name


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--aab-path", required=True)
    parser.add_argument("--release-name", required=True)
    parser.add_argument(
        "--release-status",
        default="completed",
        choices=["draft", "inProgress", "halted", "completed"],
    )
    parser.add_argument("--track", default="internal")
    parser.add_argument("--changes-not-sent-for-review", action="store_true")
    parser.add_argument("--release-notes")
    parser.add_argument("--release-notes-language", default="ko-KR")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    aab = Path(args.aab_path)
    if not aab.exists():
        sys.exit(f"AAB not found: {aab}")
    package_name = load_package_name()

    credentials, _ = default(scopes=SCOPES)
    service = build(
        "androidpublisher", "v3", credentials=credentials, cache_discovery=False
    )
    edits = service.edits()
    edit_id = edits.insert(packageName=package_name, body={}).execute()["id"]

    media = MediaFileUpload(
        str(aab), mimetype="application/octet-stream", resumable=True
    )
    bundle = edits.bundles().upload(
        packageName=package_name, editId=edit_id, media_body=media
    ).execute()
    version_code = bundle["versionCode"]
    print(f"Uploaded AAB versionCode={version_code}")

    release = {
        "name": args.release_name,
        "status": args.release_status,
        "versionCodes": [str(version_code)],
    }
    if args.release_notes:
        release["releaseNotes"] = [
            {"language": args.release_notes_language, "text": args.release_notes}
        ]
    edits.tracks().update(
        packageName=package_name,
        editId=edit_id,
        track=args.track,
        body={"track": args.track, "releases": [release]},
    ).execute()

    edits.commit(
        packageName=package_name,
        editId=edit_id,
        changesNotSentForReview=args.changes_not_sent_for_review,
    ).execute()
    print(
        f"Committed edit {edit_id}: track={args.track} "
        f"status={args.release_status} name={args.release_name}"
    )


if __name__ == "__main__":
    main()
