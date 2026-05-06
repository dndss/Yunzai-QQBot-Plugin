

"""
QQ开放平台 IP白名单 管理脚本
"""

import requests
import json
import sys
import re
import time


QRCODE_CREATE_URL = "https://q.qq.com/qrcode/create"
QRCODE_GET_URL = "https://q.qq.com/qrcode/get"
QRCODE_CHECK_URL = "https://q.qq.com/qrcode/check?client=qq&code={}"
GET_APP_LIST_URL = "https://q.qq.com/api/v1/homepagepb/GetAppListForLogin"
UPDATE_WHITE_URL = "https://bot.q.qq.com/cgi-bin/dev_info/update_white_ip_config"
QUERY_WHITE_URL = "https://bot.q.qq.com/cgi-bin/dev_info/white_ip_config?bot_appid={}"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "Origin": "https://q.qq.com",
    "Referer": "https://q.qq.com/",
    "X-Requested-With": "mark.via",
    "Sec-Fetch-Site": "same-site",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
}


def parse_cookie(cookie_str):
    """从Cookie字符串提取关键字段"""
    cookies = {}
    for item in cookie_str.split(";"):
        if "=" in item:
            k, v = item.strip().split("=", 1)
            cookies[k.strip()] = v.strip()

    uin = cookies.get("quin", "")
    if not uin:
        raw = cookies.get("uin", "")
        uin = raw[1:] if raw.startswith("o") else raw
    dev_id = cookies.get("developer_id_lite") or cookies.get("developerId", "")
    ticket = cookies.get("qticket", "")
    return uin, dev_id, ticket

def get_app_list(cookie, uin, dev_id, ticket):
    """拉取当前账号下的所有机器人应用"""
    payload = {"uin": uin, "developer_id": dev_id, "ticket": ticket, "app_type": [2]}
    headers = {**HEADERS, "Cookie": cookie, "Sec-Fetch-Site": "same-origin"}
    print("\n正在获取应用列表...")
    try:
        resp = requests.post(GET_APP_LIST_URL, headers=headers, json=payload, timeout=15)
        if resp.status_code != 200:
            print(f"[错误] 获取应用列表失败 HTTP {resp.status_code}")
            sys.exit(1)
        data = resp.json()
        if data.get("code") != 0:
            print(f"[错误] 接口异常: {data}")
            sys.exit(1)
        apps = data.get("data", {}).get("apps", [])
        if not apps:
            print("[错误] 当前账号下没有应用")
            sys.exit(1)
        return apps
    except Exception as e:
        print(f"[错误] 请求异常: {e}")
        sys.exit(1)

def choose_app(apps):
    """展示美观的应用列表并让用户选择"""
    print("\n可用的应用：")
    print("-" * 70)
    print(f"{'序号':<4}{'应用名称':<20}{'AppID':<16}{'描述'}")
    print("-" * 70)

    for i, app in enumerate(apps, 1):
        name = app.get("app_name", "").strip()
        if not name or name.isspace():
            name = "未命名"
        aid = app.get("app_id", "")
        desc = app.get("app_desc", "").split('\n')[0]
        if len(desc) > 20:
            desc = desc[:20] + "…"
        name_display = name[:18] + "…" if len(name) > 18 else name
        print(f"{i:<4}{name_display:<20}{aid:<16}{desc}")

    print("-" * 70)

    while True:
        ch = input("输入序号或 AppID 选择: ").strip()
        if ch.isdigit():
            idx = int(ch)
            if 1 <= idx <= len(apps):
                return apps[idx-1]
        for app in apps:
            if app.get("app_id") == ch:
                return app
        print("输入错误，请重新选择。")

def get_ip_list():
    """交互式输入IP地址（仅开启白名单时使用）"""
    ips = []
    print("\n添加白名单IP地址")
    while True:
        ip = input("IP 地址 (如 1.2.3.4): ").strip()
        if not ip:
            print("IP 不能为空")
            continue
        if not re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', ip):
            print("格式可能不正确，建议使用 x.x.x.x")
        ips.append(ip)
        more = input("继续添加？(y/n): ").strip().lower()
        if more != 'y':
            break
    return ips

def create_qrcode(cookie, app_id):
    """获取安全验证二维码 token"""
    headers = {**HEADERS, "Cookie": cookie, "Referer": "https://q.qq.com/qqbot/"}
    payload = {"type": 51, "miniAppId": app_id}
    print("\n生成安全验证二维码...")
    try:
        resp = requests.post(QRCODE_CREATE_URL, headers=headers, json=payload, timeout=15)
        if resp.status_code != 200:
            print(f"[错误] 二维码请求失败 HTTP {resp.status_code}")
            sys.exit(1)
        data = resp.json()
        if data.get("code") != 0:
            print(f"[错误] 二维码接口异常: {data}")
            sys.exit(1)
        qrcode = data["data"]["QrCode"]
        valid_time = data["data"]["validTime"]
        print(f"二维码有效时间: {valid_time} 秒")
        return qrcode
    except Exception as e:
        print(f"[错误] 请求异常: {e}")
        sys.exit(1)

def poll_qrcode(cookie, qrcode, max_wait=300, interval=3):
    """
    轮询二维码状态，单行动态刷新等待时间
    返回:
      (True, scan_data)  扫码成功
      (False, None)      超时
      (None, msg)        失败
    """
    headers = {**HEADERS, "Cookie": cookie, "Referer": "https://q.qq.com/qqbot/", "Sec-Fetch-Site": "same-origin"}
    payload = {"qrcode": qrcode}
    start = time.time()
    last_status = None

    print("\n等待手机QQ扫码（同一行动态刷新，不刷屏）")
    while time.time() - start < max_wait:
        try:
            resp = requests.post(QRCODE_GET_URL, headers=headers, json=payload, timeout=10)
            if resp.status_code != 200:
                time.sleep(interval)
                continue

            data = resp.json()
            code = data.get("code")
            message = data.get("message", "")

            
            if code == 0 and message == "授权成功":
                print("\n✅ 扫码成功！")
                return True, data.get("data", {})

            
            if code == -1 and "data" in data:
                elapsed = int(time.time() - start)
                
                print(f"\r⏳ 等待扫码中... 已等待 {elapsed} 秒", end="", flush=True)
                time.sleep(interval)
                continue

            
            if code == "-101185007":
                print(f"\n❌ 授权失败：{message}")
                return None, message

            
            if code == -1 and "data" in data and not data.get("data"):
                print("\n❌ 二维码已失效")
                return None, "二维码无效"

            
            if last_status != message:
                print(f"\n  提示: {message}")
                last_status = message
            time.sleep(interval)

        except Exception as e:
            time.sleep(interval)

    print("\n⏰ 扫码等待超时")
    return False, None

def wait_for_scan_auto(cookie, qrcode):
    """自动轮询扫码，成功返回数据，失败退出"""
    success, scan_data = poll_qrcode(cookie, qrcode)
    if success is True:
        
        uin = scan_data.get("uin", "未知")
        uid = scan_data.get("data", {}).get("uid", "未知")
        ip = scan_data.get("data", {}).get("clientIp", "未知")
        print(f"   授权账号 UIN: {uin}")
        print(f"   UID: {uid}")
        print(f"   扫码IP: {ip}")
        return scan_data
    elif success is False:
        print("操作已取消（等待超时）。")
        sys.exit(0)
    else:
        print(f"操作失败：{scan_data}")
        sys.exit(1)

def update_white_config(cookie, app_id, qr_code, use_white, ip_list):
    """
    更新白名单配置
    - use_white=True, ip_list=[...] 开启
    - use_white=False, ip_list=[]      关闭
    """
    body = {
        "bot_appid": app_id,
        "ip_white_infos": {
            "prod": {
                "ip_list": ip_list if use_white else [],
                "use": use_white
            }
        },
        "qr_code": qr_code
    }
    headers = {**HEADERS, "Cookie": cookie}
    try:
        resp = requests.post(UPDATE_WHITE_URL, headers=headers, json=body, timeout=15)
        if resp.status_code != 200:
            print(f"[错误] 更新请求失败 HTTP {resp.status_code}")
            print(resp.text)
            return False
        result = resp.json()
        if result.get("retcode") != 0:
            print(f"[错误] 更新失败: {result.get('msg', '未知错误')}")
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return False
        print("[成功] 白名单配置已更新")
        return True
    except Exception as e:
        print(f"[错误] 请求异常: {e}")
        return False

def query_white_config(cookie, app_id):
    """查询当前白名单状态"""
    headers = {**HEADERS, "Cookie": cookie}
    try:
        resp = requests.get(QUERY_WHITE_URL.format(app_id), headers=headers, timeout=15)
        if resp.status_code != 200:
            print(f"[警告] 查询状态失败 HTTP {resp.status_code}")
            return None
        data = resp.json()
        if data.get("retcode") != 0:
            print(f"[警告] 查询异常: {data}")
            return None
        return data.get("data")
    except Exception as e:
        print(f"[警告] 查询异常: {e}")
        return None

def show_status(data):
    """打印白名单状态"""
    if not data:
        return
    prod = data.get("ip_white_infos", {}).get("prod", {})
    sandbox = data.get("ip_white_infos", {}).get("sandbox", {})
    print("\n当前白名单状态：")
    print(f"  生产环境: 启用={prod.get('use')}, IP列表={prod.get('ip_list')}")
    print(f"  沙箱环境: 启用={sandbox.get('use')}, IP列表={sandbox.get('ip_list')}")


def main():
    print("=" * 50)
    print("  QQ开放平台 IP白名单管理脚本")
    print("=" * 50)

    
    cookie = input("请粘贴完整的浏览器 Cookie:\n").strip()
    if not cookie:
        print("Cookie 不能为空")
        sys.exit(1)

    
    uin, dev_id, ticket = parse_cookie(cookie)
    if not all([uin, dev_id, ticket]):
        print("自动解析 Cookie 不全，请手动补全：")
        uin = uin or input("纯数字 uin: ").strip()
        dev_id = dev_id or input("developer_id: ").strip()
        ticket = ticket or input("qticket: ").strip()

    
    apps = get_app_list(cookie, uin, dev_id, ticket)
    current_app = None

    while True:
        if not current_app:
            current_app = choose_app(apps)
            print(f"当前操作应用: {current_app.get('app_name','未命名')} (AppID: {current_app['app_id']})")

        
        config = query_white_config(cookie, current_app["app_id"])
        show_status(config)

        
        print("\n请选择操作：")
        print("  1 - 关闭 IP 白名单")
        print("  2 - 开启 IP 白名单（添加 IP）")
        print("  3 - 切换到其他应用")
        print("  4 - 退出脚本")
        op = input("输入数字 (1/2/3/4): ").strip()

        if op == "1":
            use_white = False
            ip_list = []
        elif op == "2":
            use_white = True
            ip_list = get_ip_list()
            if not ip_list:
                print("错误：开启白名单必须至少提供一个 IP 地址。")
                continue
            print(f"将要设置的白名单 IP: {ip_list}")
        elif op == "3":
            current_app = None
            continue
        elif op == "4":
            print("脚本已退出。")
            break
        else:
            print("无效选项，请重新输入。")
            continue

        
        qr_code = create_qrcode(cookie, current_app["app_id"])

        
        manual_url = QRCODE_CHECK_URL.format(qr_code)
        print(f"💡 打开链接扫码：{manual_url}")

        
        scan_data = wait_for_scan_auto(cookie, qr_code)

        
        print("\n" + "="*50)
        action = "关闭" if not use_white else f"开启 (IP: {ip_list})"
        print(f"即将对应用 {current_app['app_id']} 执行：{action} IP白名单")
        confirm = input("输入 y 确认执行，输入 n 取消: ").strip().lower()
        if confirm != 'y':
            print("操作已取消。")
            continue

        
        success = update_white_config(cookie, current_app["app_id"], qr_code, use_white, ip_list)
        if success:
            new_config = query_white_config(cookie, current_app["app_id"])
            show_status(new_config)

        
        again = input("\n是否继续操作当前应用？(y/n): ").strip().lower()
        if again != 'y':
            current_app = None

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n用户取消操作。")
        sys.exit(0)