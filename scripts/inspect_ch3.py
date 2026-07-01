import json

file_path = "/Users/qzhu/workspace/uktest/scratch/job_content_ch3.json"
with open(file_path, "r", encoding="utf-8") as f:
    data = json.load(f)

seen_sections = set()
for unit in data:
    sec = unit["section"]
    if sec not in seen_sections:
        seen_sections.add(sec)
        print(f"Section {sec}: ID={unit['id']}, Heading={unit['heading']}, Subheading={unit['subheading']}")
