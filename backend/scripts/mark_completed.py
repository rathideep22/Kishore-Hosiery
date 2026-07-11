"""One-off: mark specific orders as completed. Dry-run by default."""
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

MONGO = os.environ["MONGODB_URL"]
DB_NAME = os.environ.get("DB_NAME", "kishore_hosiery")

TARGETS = ["Kh-0080", "Kh-0107", "Kh-0111", "Ls-0008", "Ls-0009"]

client = MongoClient(MONGO)
db = client[DB_NAME]

now_iso = datetime.now(timezone.utc).isoformat()

apply = "--apply" in sys.argv

found = []
missing = []
for code in TARGETS:
    doc = db.orders.find_one(
        {"orderId": {"$regex": f"^{code}$", "$options": "i"}},
        {"_id": 0, "id": 1, "orderId": 1, "partyName": 1, "completed": 1, "readinessStatus": 1, "dispatched": 1},
    )
    if doc:
        found.append(doc)
    else:
        missing.append(code)

print(f"Requested: {TARGETS}")
print(f"Missing:   {missing}")
print(f"Found {len(found)}:")
for d in found:
    print(
        f"  {d['orderId']:<10} party={d.get('partyName'):<30} "
        f"completed={d.get('completed')} dispatched={d.get('dispatched')} status={d.get('readinessStatus')}"
    )

if not apply:
    print("\nDRY RUN. Re-run with --apply to mark them completed.")
    sys.exit(0)

to_update_ids = [d["id"] for d in found if not d.get("completed")]
skipped_already = [d["orderId"] for d in found if d.get("completed")]

print(f"\nAlready completed, skipping: {skipped_already}")
print(f"Updating {len(to_update_ids)} orders…")

res = db.orders.update_many(
    {"id": {"$in": to_update_ids}},
    {"$set": {"completed": True, "completedAt": now_iso, "updatedAt": now_iso}},
)
print(f"matched={res.matched_count} modified={res.modified_count}")

# Audit log
for d in found:
    if d["id"] in to_update_ids:
        db.audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "userId": "manual-script",
            "action": "ORDER_MARKED_COMPLETED_MANUAL",
            "orderId": d["id"],
            "details": f"Manually marked {d['orderId']} as completed via mark_completed.py",
            "timestamp": now_iso,
        })

print("Done.")
