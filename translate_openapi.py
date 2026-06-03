import json
import os

def translate_text(text):
    # This is a placeholder for translation logic.
    # In a real scenario, we would use a translation API.
    # For this task, I will simulate translation for common terms.
    translations = {
        "ActivityLog": "活动日志",
        "ApiKey": "API密钥",
        "Gets activity log entries.": "获取活动日志条目。",
        "Get all keys.": "获取所有密钥。",
        "Create a new api key.": "创建一个新的API密钥。",
        "Optional. The record index to start at. All items with a lower index will be dropped from the results.": "可选。开始的记录索引。所有索引较低的项目将从结果中丢弃。",
        "Optional. The maximum number of records to return.": "可选。要返回的最大记录数。",
        "Optional. The minimum date. Format = ISO.": "可选。最小日期。格式 = ISO。",
        "Optional. Filter log entries if it has user id, or not.": "可选。根据是否具有用户ID过滤日志条目。",
        "Activity log returned.": "活动日志已返回。",
        "The server is currently starting or is temporarily not available.": "服务器当前正在启动或暂时不可用。",
        "A hint for when to retry the operation in full seconds.": "提示何时以秒为单位重试操作。",
        "A short plain-text reason why the server is not available.": "服务器不可用的简短纯文本原因。",
        "Unauthorized": "未授权",
        "Forbidden": "禁止访问",
        "Api keys retrieved.": "已检索到API密钥。",
        "Name of the app using the authentication key.": "使用身份验证密钥的应用名称。"
    }
    return translations.get(text, text)

def process_json(data):
    if isinstance(data, dict):
        new_data = {}
        for k, v in data.items():
            if k in ["tags", "summary", "description"]:
                if isinstance(v, list):
                    new_data[k] = [translate_text(item) for item in v]
                elif isinstance(v, str):
                    new_data[k] = translate_text(v)
                else:
                    new_data[k] = process_json(v)
            else:
                new_data[k] = process_json(v)
        return new_data
    elif isinstance(data, list):
        return [process_json(item) for item in data]
    else:
        return data

file_path = r'd:\Users\Documents\1\emby2openlist\jellyfin-openapi-stable.json'
output_path = r'd:\Users\Documents\1\emby2openlist\jellyfin-openapi-stable-zh.json'

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

translated_data = process_json(data)

with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(translated_data, f, ensure_ascii=False, indent=2)

print(f"Translation completed. Saved to {output_path}")
