#!/usr/bin/env python3
"""Build and optionally submit the Google Play Data Safety CSV declaration.

The template must be a current CSV exported or downloaded from Play Console.
The app-specific answers live in play-store/data-safety-responses.json.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
from pathlib import Path
from typing import Any

CONFIG_PATH = Path("play-store/google-play.config.json")
RESPONSES_PATH = Path("play-store/data-safety-responses.json")
SCOPES = ["https://www.googleapis.com/auth/androidpublisher"]

QUESTION_ID = "Question ID (machine readable)"
RESPONSE_ID = "Response ID (machine readable)"
RESPONSE_VALUE = "Response value"

GLOBAL_RESPONSES = {
    "PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA": "collectsPersonalData",
    "PSL_DATA_COLLECTION_ENCRYPTED_IN_TRANSIT": "encryptedInTransit",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--template-csv", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Submit the generated CSV with Android Publisher applications.dataSafety.",
    )
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        sys.exit(f"{path} not found")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        sys.exit(f"{path} must contain a JSON object")
    return value


def boolean(value: object) -> str:
    if not isinstance(value, bool):
        raise ValueError(f"Expected boolean, got {value!r}")
    return "TRUE" if value else "FALSE"


def normalize_sharing_purposes(item: dict[str, Any], response_id: object) -> list[str]:
    value = item.get("sharingPurposes", [])
    if value is None:
        return []
    if not isinstance(value, list) or not all(
        isinstance(purpose, str) for purpose in value
    ):
        raise ValueError(f"Invalid sharing purpose for {response_id}")
    return value


def load_template(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    if not path.exists():
        sys.exit(f"{path} not found")
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            sys.exit("Data Safety template has no header")
        required = {QUESTION_ID, RESPONSE_ID, RESPONSE_VALUE}
        if not required.issubset(reader.fieldnames):
            sys.exit("Data Safety template has an unsupported header")
        return list(reader.fieldnames), [dict(row) for row in reader]


def set_unique(
    rows: list[dict[str, str]],
    *,
    question_id: str,
    response_id: str | None,
    value: str,
) -> None:
    matches = [
        row
        for row in rows
        if row[QUESTION_ID] == question_id
        and (response_id is None or row[RESPONSE_ID] == response_id)
    ]
    if len(matches) != 1:
        raise ValueError(
            f"Expected one template row for {question_id}/{response_id}, got {len(matches)}"
        )
    matches[0][RESPONSE_VALUE] = value


def build_csv(template: Path, answers: dict[str, Any]) -> str:
    fieldnames, rows = load_template(template)
    for row in rows:
        row[RESPONSE_VALUE] = ""

    global_answers = answers.get("global")
    if not isinstance(global_answers, dict):
        raise ValueError("global answers are required")
    for question_id, answer_key in GLOBAL_RESPONSES.items():
        set_unique(
            rows,
            question_id=question_id,
            response_id=None,
            value=boolean(global_answers.get(answer_key)),
        )

    account_methods = global_answers.get("accountCreationMethods")
    if not isinstance(account_methods, list) or not account_methods:
        raise ValueError("At least one account creation method is required")
    if not all(isinstance(method, str) for method in account_methods):
        raise ValueError("Invalid account creation method")
    for method in account_methods:
        set_unique(
            rows,
            question_id="PSL_SUPPORTED_ACCOUNT_CREATION_METHODS",
            response_id=method,
            value="TRUE",
        )

    if "PSL_ACM_OTHER" in account_methods:
        account_creation_description = global_answers.get("accountCreationDescription")
        if not isinstance(account_creation_description, str) or not account_creation_description.strip():
            raise ValueError("An account creation description is required for Other")
        set_unique(
            rows,
            question_id="PSL_ACM_SPECIFY",
            response_id=None,
            value=account_creation_description.strip(),
        )

    account_deletion_url = global_answers.get("accountDeletionUrl")
    if not isinstance(account_deletion_url, str) or not account_deletion_url.startswith(
        "https://"
    ):
        raise ValueError("A secure account deletion URL is required")
    set_unique(
        rows,
        question_id="PSL_ACCOUNT_DELETION_URL",
        response_id=None,
        value=account_deletion_url,
    )
    supports_deletion = global_answers.get("supportsDeletionRequest")
    if not isinstance(supports_deletion, bool):
        raise ValueError("supportsDeletionRequest must be a boolean")
    legacy_deletion_rows = [
        row
        for row in rows
        if row[QUESTION_ID] == "PSL_DATA_COLLECTION_USER_REQUEST_DELETE"
    ]
    if legacy_deletion_rows:
        set_unique(
            rows,
            question_id="PSL_DATA_COLLECTION_USER_REQUEST_DELETE",
            response_id=None,
            value=boolean(supports_deletion),
        )
    else:
        set_unique(
            rows,
            question_id="PSL_SUPPORT_DATA_DELETION_BY_USER",
            response_id=("DATA_DELETION_YES" if supports_deletion else "DATA_DELETION_NO"),
            value="TRUE",
        )
        if supports_deletion:
            set_unique(
                rows,
                question_id="PSL_DATA_DELETION_URL",
                response_id=None,
                value=account_deletion_url,
            )

    data_types = answers.get("dataTypes")
    if not isinstance(data_types, list) or not data_types:
        raise ValueError("At least one data type is required")

    seen: set[str] = set()
    for item in data_types:
        if not isinstance(item, dict):
            raise ValueError("Each data type answer must be an object")
        response_id = item.get("responseId")
        collection = item.get("collection")
        purposes = item.get("purposes")
        shared = item.get("shared", False)
        sharing_purposes = normalize_sharing_purposes(item, response_id)
        if not isinstance(response_id, str) or response_id in seen:
            raise ValueError(f"Invalid or duplicate responseId: {response_id!r}")
        if collection not in {"required", "optional"}:
            raise ValueError(f"Invalid collection setting for {response_id}")
        if not isinstance(purposes, list) or not purposes:
            raise ValueError(f"At least one purpose is required for {response_id}")
        if not all(isinstance(purpose, str) for purpose in purposes):
            raise ValueError(f"Invalid purpose for {response_id}")
        if not isinstance(shared, bool):
            raise ValueError(f"Invalid shared setting for {response_id}")
        if shared and not sharing_purposes:
            raise ValueError(f"At least one sharing purpose is required for {response_id}")
        if not shared and sharing_purposes:
            raise ValueError(f"Sharing purposes require shared=true for {response_id}")
        seen.add(response_id)

        type_rows = [
            row
            for row in rows
            if row[RESPONSE_ID] == response_id
            and row[QUESTION_ID].startswith("PSL_DATA_TYPES_")
        ]
        if len(type_rows) != 1:
            raise ValueError(f"Template data type not found: {response_id}")
        type_rows[0][RESPONSE_VALUE] = "TRUE"

        prefix = f"PSL_DATA_USAGE_RESPONSES:{response_id}:"
        set_unique(
            rows,
            question_id=prefix + "PSL_DATA_USAGE_COLLECTION_AND_SHARING",
            response_id="PSL_DATA_USAGE_ONLY_COLLECTED",
            value="TRUE",
        )
        if shared:
            set_unique(
                rows,
                question_id=prefix + "PSL_DATA_USAGE_COLLECTION_AND_SHARING",
                response_id="PSL_DATA_USAGE_ONLY_SHARED",
                value="TRUE",
            )
        set_unique(
            rows,
            question_id=prefix + "PSL_DATA_USAGE_EPHEMERAL",
            response_id=None,
            value="FALSE",
        )
        set_unique(
            rows,
            question_id=prefix + "DATA_USAGE_USER_CONTROL",
            response_id=(
                "PSL_DATA_USAGE_USER_CONTROL_REQUIRED"
                if collection == "required"
                else "PSL_DATA_USAGE_USER_CONTROL_OPTIONAL"
            ),
            value="TRUE",
        )
        for purpose in purposes:
            set_unique(
                rows,
                question_id=prefix + "DATA_USAGE_COLLECTION_PURPOSE",
                response_id=purpose,
                value="TRUE",
            )
        for purpose in sharing_purposes:
            set_unique(
                rows,
                question_id=prefix + "DATA_USAGE_SHARING_PURPOSE",
                response_id=purpose,
                value="TRUE",
            )

    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=fieldnames, lineterminator="\r\n")
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


def package_name() -> str:
    config = load_json(CONFIG_PATH)
    value = config.get("packageName")
    if not isinstance(value, str) or not value or "확정" in value:
        sys.exit("packageName is unresolved in google-play.config.json")
    return value


def apply(csv_text: str) -> None:
    from google.auth import default
    from googleapiclient.discovery import build

    credentials, _ = default(scopes=SCOPES)
    service = build(
        "androidpublisher", "v3", credentials=credentials, cache_discovery=False
    )
    service.applications().dataSafety(
        packageName=package_name(), body={"safetyLabels": csv_text}
    ).execute()


def main() -> None:
    args = parse_args()
    answers = load_json(RESPONSES_PATH)
    csv_text = build_csv(args.template_csv, answers)
    if args.output:
        args.output.write_text(csv_text, encoding="utf-8", newline="")
        print(f"Wrote {args.output}")
    if args.apply:
        apply(csv_text)
        print(f"Submitted Data Safety declaration for {package_name()}")
    if not args.output and not args.apply:
        print("Data Safety declaration validated (dry run)")


if __name__ == "__main__":
    main()
