import json

file_path = "/Users/qzhu/workspace/uktest/scratch/job_content_ch3.json"
with open(file_path, "r", encoding="utf-8") as f:
    data = json.load(f)

for unit in data:
    if unit["section"] in ["3.1", "3.7"]:
        print(f"ID: {unit['id']} | Type: {unit['type']}")
        print(f"EN: {unit['en']}")
        print("-" * 40)
