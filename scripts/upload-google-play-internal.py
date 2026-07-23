#!/usr/bin/env python3
"""Upload a signed AAB to a Google Play track via the Android Publisher API.

Contract (seorilabs/.github rn-deploy-google-play / promote-google-play):
    upload-google-play-internal.py --aab-path P --release-name N --release-status S
        --track T [--changes-not-sent-for-review]
        [--release-notes TEXT --release-notes-language LANG]
        [--release-notes-json PATH]   # 전체 언어 노트(env RELEASE_NOTES_JSON)
    upload-google-play-internal.py --promote --release-name N --release-status S
        [--promote-from-track internal --promote-to-track production] [--rollout F]

Auth: Application Default Credentials, provided by google-github-actions/auth
      (Workload Identity Federation) — GOOGLE_APPLICATION_CREDENTIALS is set in CI.
Package name: read from play-store/google-play.config.json (single source of truth).
"""
from __future__ import annotations

import argparse
import json
import os
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


def unit_fraction(value: str) -> float:
    parsed = float(value)
    if not 0 < parsed <= 1:
        raise argparse.ArgumentTypeError("must be in (0, 1]")
    return parsed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--aab-path")  # upload 모드에서만 필요
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
    parser.add_argument(
        "--release-notes-json",
        default=os.environ.get("RELEASE_NOTES_JSON") or None,
        help="Path to release-notes.json ({notes:{locale:text}}) for per-language notes.",
    )
    parser.add_argument("--promote", action="store_true")
    parser.add_argument("--promote-from-track", default="internal")
    parser.add_argument("--promote-to-track", default="production")
    parser.add_argument(
        "--rollout",
        type=unit_fraction,
        default=None,
        help="Staged rollout fraction (0,1] for promotion. Omit for full release.",
    )
    return parser.parse_args()


def load_notes_map(path: str | None) -> dict[str, str]:
    """release-notes.json({notes:{'ko-KR':..}}) → {storeLocale: text}."""
    if not path:
        return {}
    notes_path = Path(path)
    if not notes_path.exists():
        return {}
    doc = json.loads(notes_path.read_text(encoding="utf-8"))
    notes = doc.get("notes", {}) if isinstance(doc, dict) else {}
    return {k: v for k, v in notes.items() if isinstance(v, str) and v.strip()}


def listing_languages(edits, package_name: str, edit_id: str) -> set[str]:
    """앱 스토어 등록(listing) 언어 집합. 실패 시 빈 집합."""
    try:
        resp = edits.listings().list(packageName=package_name, editId=edit_id).execute()
    except Exception as error:  # noqa: BLE001
        print(f"Warning: failed to list Google Play listings: {error}", file=sys.stderr)
        return set()
    return {item.get("language") for item in resp.get("listings", []) if item.get("language")}


def build_release_notes(edits, package_name: str, edit_id: str, args) -> list[dict]:
    """release-notes.json 이 있으면 앱 등록 언어와 교집합인 언어별 노트 전부를,
    없으면 단일 --release-notes 를 반환한다(미등록 언어는 400 방지 위해 제외)."""
    notes_map = load_notes_map(args.release_notes_json)
    if notes_map:
        languages = listing_languages(edits, package_name, edit_id)
        selected = (
            {k: v for k, v in notes_map.items() if k in languages}
            if languages
            else notes_map
        )
        if selected:
            return [{"language": k, "text": v} for k, v in selected.items()]
    if args.release_notes:
        return [{"language": args.release_notes_language, "text": args.release_notes}]
    return []


def promote_release(edits, package_name: str, args) -> None:
    """from-track 최신 versionCode 를 재빌드 없이 to-track 으로 승격 + 언어별 노트 반영
    + commit(=심사 제출). rollout 지정 시 단계적 출시."""
    edit_id = edits.insert(packageName=package_name, body={}).execute()["id"]
    try:
        source = edits.tracks().get(
            packageName=package_name, editId=edit_id, track=args.promote_from_track
        ).execute()
        version_codes: list[int] = []
        for release in source.get("releases", []):
            version_codes.extend(int(v) for v in release.get("versionCodes", []) or [])
        if not version_codes:
            sys.exit(f"No versionCode on '{args.promote_from_track}' track to promote.")
        latest = str(max(version_codes))

        release = {
            "name": args.release_name,
            "versionCodes": [latest],
            "status": args.release_status,
        }
        notes = build_release_notes(edits, package_name, edit_id, args)
        if notes:
            release["releaseNotes"] = notes
        if args.rollout is not None:
            release["status"] = "inProgress"
            release["userFraction"] = args.rollout

        edits.tracks().update(
            packageName=package_name,
            editId=edit_id,
            track=args.promote_to_track,
            body={"track": args.promote_to_track, "releases": [release]},
        ).execute()
        edits.commit(packageName=package_name, editId=edit_id).execute()
        print(
            f"Promoted {args.promote_from_track}->{args.promote_to_track}: "
            f"versionCode={latest} status={release['status']}"
        )
    except Exception:
        try:
            edits.delete(packageName=package_name, editId=edit_id).execute()
        except Exception:  # noqa: BLE001
            pass
        raise


def main() -> None:
    args = parse_args()
    package_name = load_package_name()

    credentials, _ = default(scopes=SCOPES)
    service = build(
        "androidpublisher", "v3", credentials=credentials, cache_discovery=False
    )
    edits = service.edits()

    if args.promote:
        promote_release(edits, package_name, args)
        return

    if not args.aab_path:
        sys.exit("--aab-path is required for upload.")
    aab = Path(args.aab_path)
    if not aab.exists():
        sys.exit(f"AAB not found: {aab}")

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
    notes = build_release_notes(edits, package_name, edit_id, args)
    if notes:
        release["releaseNotes"] = notes
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
