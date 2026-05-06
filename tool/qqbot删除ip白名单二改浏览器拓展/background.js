// 缓存
let cachedCookies = null;
let cachedApps = null;

// 解析 Cookie 获取关键字段
function parseCookies(cookies) {
  const map = {};
  cookies.forEach(c => { map[c.name] = c.value; });
  const quin = map['quin'] || (map['uin'] ? map['uin'].replace(/^o/, '') : '');
  const devId = map['developer_id_lite'] || map['developerId'] || '';
  const ticket = map['qticket'] || '';
  return { uin: quin, developer_id: devId, ticket };
}

// 获取并缓存 Cookies
async function getCookies(force = false) {
  if (!force && cachedCookies) return cachedCookies;
  try {
    const cookies = await chrome.cookies.getAll({ domain: 'q.qq.com' });
    cachedCookies = parseCookies(cookies);
    if (!cachedCookies.uin || !cachedCookies.developer_id || !cachedCookies.ticket) {
      throw new Error('Cookie 不完整，请确保已登录 q.qq.com');
    }
    return cachedCookies;
  } catch (e) {
    throw new Error('获取 Cookie 失败，请确认已登录 QQ 开放平台');
  }
}

// 通用 fetch 封装，自动携带 Cookie
async function fetchWithCred(url, options = {}) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'Origin': 'https://q.qq.com',
    'Referer': 'https://q.qq.com/',
    ...options.headers
  };
  const resp = await fetch(url, {
    ...options,
    headers,
    credentials: 'include'
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// 获取应用列表
async function fetchAppList() {
  const { uin, developer_id, ticket } = await getCookies();
  const body = { uin, developer_id, ticket, app_type: [2] };
  const data = await fetchWithCred('https://q.qq.com/api/v1/homepagepb/GetAppListForLogin', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  if (data.code !== 0) throw new Error(data.message || '获取应用列表失败');
  cachedApps = data.data.apps || [];
  return cachedApps;
}

// 查询白名单
async function queryWhite(appId) {
  const data = await fetchWithCred(`https://bot.q.qq.com/cgi-bin/dev_info/white_ip_config?bot_appid=${appId}`);
  if (data.retcode !== 0) throw new Error(data.msg || '查询白名单失败');
  return data.data;
}

// 生成二维码 token
async function createQRCode(appId) {
  const body = { type: 51, miniAppId: appId };
  const data = await fetchWithCred('https://q.qq.com/qrcode/create', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  if (data.code !== 0) throw new Error(data.message || '生成二维码失败');
  return data.data.QrCode;
}

// 查询二维码状态
async function checkQRCode(qrcode) {
  const body = { qrcode };
  const data = await fetchWithCred('https://q.qq.com/qrcode/get', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return data; // { code, message, data }
}

// 更新白名单配置
async function updateWhiteConfig(appId, qrCode, useWhite, ipList) {
  const body = {
    bot_appid: appId,
    ip_white_infos: {
      prod: {
        ip_list: useWhite ? ipList : [],
        use: useWhite
      }
    },
    qr_code: qrCode
  };
  const data = await fetchWithCred('https://bot.q.qq.com/cgi-bin/dev_info/update_white_ip_config', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  if (data.retcode !== 0) throw new Error(data.msg || '更新白名单失败');
  return data;
}

// 轮询扫码状态（Background 中持续运行）
async function pollQRCode(qrToken, maxWait = 300, interval = 3) {
  const start = Date.now();
  while ((Date.now() - start) / 1000 < maxWait) {
    try {
      const result = await checkQRCode(qrToken);
      if (result.code === 0 && result.message === '授权成功') {
        return { status: 'scan_success', data: result.data };
      }
      if (result.code === -1 && result.data) {
        // 仍在等待扫码
        await new Promise(resolve => setTimeout(resolve, interval * 1000));
        continue;
      }
      // 其他情况视为失败
      return { status: 'scan_failed', data: { message: result.message || '未知错误' } };
    } catch (e) {
      await new Promise(resolve => setTimeout(resolve, interval * 1000));
    }
  }
  return { status: 'scan_failed', data: { message: '扫码超时' } };
}

// 消息处理中心
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      switch (request.type) {
        case 'GET_APPS':
          const apps = await fetchAppList();
          sendResponse(apps);
          break;

        case 'QUERY_WHITE': {
          const status = await queryWhite(request.appId);
          sendResponse(status);
          break;
        }

        case 'START_SCAN': {
          // 生成二维码
          const qrToken = await createQRCode(request.appId);
          // 存储扫描状态
          await chrome.storage.local.set({
            scanState: {
              status: 'scanning',
              qrToken,
              appId: request.appId,
              useWhite: request.useWhite,
              ipList: request.ipList
            }
          });
          sendResponse({ qrcode: qrToken });

          // 后台开始轮询
          const scanResult = await pollQRCode(qrToken);
          if (scanResult.status === 'scan_success') {
            // 扫码成功，自动执行更新
            try {
              const { appId, useWhite, ipList } = request;
              await updateWhiteConfig(appId, qrToken, useWhite, ipList);
              await chrome.storage.local.set({
                scanState: { status: 'updated' },
                updateResult: { success: true }
              });
            } catch (e) {
              await chrome.storage.local.set({
                scanState: { status: 'update_failed', data: { message: e.message } },
                updateResult: { success: false, message: e.message }
              });
            }
          } else {
            // 扫码失败
            await chrome.storage.local.set({
              scanState: { status: 'scan_failed', data: scanResult.data }
            });
          }
          break;
        }

        default:
          sendResponse({ error: '未知请求' });
      }
    } catch (e) {
      sendResponse({ error: e.message });
    }
  })();
  return true; // keep channel open for async
});

// 安装或更新时重置部分状态
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.remove(['scanState', 'updateResult']);
});