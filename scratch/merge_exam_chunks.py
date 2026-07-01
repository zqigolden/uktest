import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QUESTIONS_PATH = ROOT / "scratch" / "job_questions_exam.json"
CONTENT_PATH = ROOT / "data" / "content.json"

def main():
    missing = []
    translated_data = {}
    
    for chunk_id in range(20):
        chunk_file = ROOT / "scratch" / f"exam_translated_chunk_{chunk_id}.json"
        if not chunk_file.exists():
            missing.append(chunk_id)
        else:
            try:
                with open(chunk_file, "r", encoding="utf-8") as f:
                    chunk_list = json.load(f)
                for item in chunk_list:
                    if "id" in item:
                        translated_data[item["id"]] = item
            except Exception as e:
                print(f"Error loading {chunk_file.name}: {e}")
                sys.exit(1)

    if missing:
        print(f"Missing translated chunks: {missing}")
        print("Progress: Cannot merge yet.")
        sys.exit(1)

    with open(QUESTIONS_PATH, "r", encoding="utf-8") as f:
        questions = json.load(f)

    with open(CONTENT_PATH, "r", encoding="utf-8") as f:
        content_data = json.load(f)
    content_ids = {item["id"] for item in content_data}

    errors = []
    updated_count = 0

    for q in questions:
        qid = q["id"]
        if qid not in translated_data:
            errors.append(f"Question ID '{qid}' was not translated in any chunk")
            continue

        item = translated_data[qid]

        # Validations
        if not item.get("question_zh"):
            errors.append(f"{qid}: missing 'question_zh'")
        if not item.get("options") or len(item["options"]) != len(q["options"]):
            errors.append(f"{qid}: 'options' count mismatch or missing. Expected {len(q['options'])}, got {len(item.get('options', []))}")
        else:
            for idx, opt in enumerate(item["options"]):
                if not opt.get("zh"):
                    errors.append(f"{qid}: option {idx} is missing 'zh'")

        # Validate linked_content
        lc = item.get("linked_content", [])
        if not isinstance(lc, list):
            errors.append(f"{qid}: 'linked_content' must be a list")
        else:
            for cid in lc:
                if cid != "ESCALATE" and cid not in content_ids:
                    errors.append(f"{qid}: linked content ID '{cid}' not found in content.json")

        if not errors:
            q["question_zh"] = item["question_zh"]
            for idx, opt in enumerate(item["options"]):
                q["options"][idx]["zh"] = opt["zh"]
            q["explanation_zh"] = item.get("explanation_zh") or ""
            q["linked_content"] = lc
            updated_count += 1

    if errors:
        print("Validation errors found:")
        for err in errors[:50]:
            print(f"  - {err}")
        if len(errors) > 50:
            print(f"  ... and {len(errors) - 50} more errors")
        print("Abort merge.")
        sys.exit(1)

    with open(QUESTIONS_PATH, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    print(f"Successfully merged {updated_count} updates into job_questions_exam.json.")

if __name__ == "__main__":
    main()
