import json

def extract_strings(data, target_fields, found_strings):
    if isinstance(data, dict):
        for k, v in data.items():
            if k in target_fields:
                if isinstance(v, str):
                    found_strings.add(v)
                elif isinstance(v, list):
                    for item in v:
                        if isinstance(item, str):
                            found_strings.add(item)
            extract_strings(v, target_fields, found_strings)
    elif isinstance(data, list):
        for item in data:
            extract_strings(item, target_fields, found_strings)

file_path = r'd:\Users\Documents\1\emby2openlist\jellyfin-openapi-stable.json'
target_fields = ["tags", "summary", "description"]
found_strings = set()

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

extract_strings(data, target_fields, found_strings)

# Save unique strings to a file for translation
with open('strings_to_translate.txt', 'w', encoding='utf-8') as f:
    for s in sorted(list(found_strings)):
        f.write(s + '\n')

print(f"Extracted {len(found_strings)} unique strings to strings_to_translate.txt")
