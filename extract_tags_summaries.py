import json

def extract_tags_summaries(data, found_tags, found_summaries):
    if isinstance(data, dict):
        for k, v in data.items():
            if k == "tags" and isinstance(v, list):
                for tag in v:
                    if isinstance(tag, str):
                        found_tags.add(tag)
            elif k == "summary" and isinstance(v, str):
                found_summaries.add(v)
            extract_tags_summaries(v, found_tags, found_summaries)
    elif isinstance(data, list):
        for item in data:
            extract_tags_summaries(item, found_tags, found_summaries)

file_path = r'd:\Users\Documents\1\emby2openlist\jellyfin-openapi-stable.json'
found_tags = set()
found_summaries = set()

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

extract_tags_summaries(data, found_tags, found_summaries)

with open('tags_to_translate.txt', 'w', encoding='utf-8') as f:
    for s in sorted(list(found_tags)):
        f.write(s + '\n')

with open('summaries_to_translate.txt', 'w', encoding='utf-8') as f:
    for s in sorted(list(found_summaries)):
        f.write(s + '\n')

print(f"Extracted {len(found_tags)} tags and {len(found_summaries)} summaries.")
