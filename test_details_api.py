import urllib.request
import json

emby_host = "http://192.168.50.99:8092"
proxy_host = "http://192.168.50.99:8095"
media_id = "e5e434343f934b1c38cf1a617260866e"
admin_key = "c49a593100e944c4a1773eba0ab17c1b"

# 1. 登录用户 1 换取 Token
auth_url = f"{emby_host}/emby/Users/AuthenticateByName"
auth_data = json.dumps({"Username": "1", "Pw": ""}).encode("utf-8")
auth_headers = {
    "Content-Type": "application/json",
    "X-Emby-Authorization": 'MediaBrowser Client="Pelagica", Device="Web", DeviceId="web-device2", Version="1.0.0"'
}

try:
    req = urllib.request.Request(auth_url, data=auth_data, headers=auth_headers, method="POST")
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        token = res.get("AccessToken")
        user_id = res.get("User", {}).get("Id")
        print(f"Login success! User1 Token: {token}, UserId: {user_id}")
except Exception as e:
    print(f"Login failed: {e}")
    exit(1)

headers = {
    "X-Emby-Authorization": f'MediaBrowser Client="Pelagica", Device="Web", DeviceId="web-device2", Version="1.0.0", Token="{token}"',
    "Content-Type": "application/json"
}

def test_get(name, path):
    url = f"{proxy_host}{path}"
    print(f"\n测试 {name}: {url}")
    try:
        req = urllib.request.Request(url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            print(f"--> 成功! Status: {resp.status}")
            data = json.loads(resp.read().decode("utf-8"))
            print(f"    Item Name: {data.get('Name')}")
    except urllib.error.HTTPError as e:
        print(f"--> 失败! Status: {e.code} ({e.reason})")
        try:
            print(f"    响应体: {e.read().decode('utf-8')}")
        except:
            pass

# 测试 1: 使用带 Users 的标准详情接口
test_get("1. 带 Users 路径详情接口", f"/emby/Users/{user_id}/Items/{media_id}")

# 测试 2: 不带 Users 路径详情接口
test_get("2. 不带 Users 路径详情接口", f"/emby/Items/{media_id}")
