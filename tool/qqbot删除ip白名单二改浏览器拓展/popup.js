// 全局状态
let currentAppId = null;
let currentUseWhite = false;   // 将要设置的状态
let currentIpList = [];

const appSelect = document.getElementById('app-select');
const statusText = document.getElementById('status-text');
const operationSection = document.getElementById('operation-section');
const ipSection = document.getElementById('ip-section');
const scanSection = document.getElementById('scan-section');
const ipListDiv = document.getElementById('ip-list');
const messageBar = document.getElementById('message-bar');

// 初始化：加载应用列表，恢复扫码状态
document.addEventListener('DOMContentLoaded', async () => {
  await loadAppList();
  restoreScanState();
});

// 加载应用列表（从 background 获取）
async function loadAppList() {
  try {
    const apps = await chrome.runtime.sendMessage({ type: 'GET_APPS' });
    appSelect.innerHTML = '';
    if (!apps || apps.length === 0) {
      appSelect.innerHTML = '<option>无可用应用</option>';
      return;
    }
    apps.forEach((app, idx) => {
      const opt = document.createElement('option');
      opt.value = app.app_id;
      opt.textContent = `${app.app_name} (${app.app_id})`;
      appSelect.appendChild(opt);
    });
    // 如果之前有选中的应用，恢复
    const { selectedAppId } = await chrome.storage.local.get('selectedAppId');
    if (selectedAppId && apps.find(a => a.app_id === selectedAppId)) {
      appSelect.value = selectedAppId;
      await onAppSelected(selectedAppId);
    }
  } catch (e) {
    showMessage('获取应用失败: ' + e.message);
  }
}

// 刷新应用列表
document.getElementById('refresh-apps').addEventListener('click', loadAppList);

// 选择应用
appSelect.addEventListener('change', async (e) => {
  const appId = e.target.value;
  if (appId) {
    await onAppSelected(appId);
  }
});

async function onAppSelected(appId) {
  currentAppId = appId;
  await chrome.storage.local.set({ selectedAppId: appId });
  // 查询白名单状态
  const data = await chrome.runtime.sendMessage({ type: 'QUERY_WHITE', appId });
  statusText.textContent = JSON.stringify(data, null, 2);
  operationSection.classList.remove('hidden');
  ipSection.classList.add('hidden');
  scanSection.classList.add('hidden');
  currentUseWhite = false;
  currentIpList = [];
  clearIpInputs();
}

// 操作按钮
document.getElementById('btn-close').addEventListener('click', () => {
  currentUseWhite = false;
  ipSection.classList.add('hidden');
  startScan();
});

document.getElementById('btn-open').addEventListener('click', () => {
  currentUseWhite = true;
  ipSection.classList.remove('hidden');
  showIpInputs();
});

// IP 输入管理
function showIpInputs() {
  ipListDiv.innerHTML = '';
  addIpInput();
}

function addIpInput() {
  const div = document.createElement('div');
  div.className = 'ip-item';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '例如 1.2.3.4';
  const delBtn = document.createElement('button');
  delBtn.textContent = '✖';
  delBtn.addEventListener('click', () => {
    div.remove();
    updateIpList();
  });
  div.appendChild(input);
  div.appendChild(delBtn);
  ipListDiv.appendChild(div);
  input.addEventListener('input', updateIpList);
}

document.getElementById('add-ip').addEventListener('click', addIpInput);

function updateIpList() {
  const inputs = ipListDiv.querySelectorAll('input');
  currentIpList = Array.from(inputs).map(i => i.value.trim()).filter(v => v);
}

function clearIpInputs() {
  ipListDiv.innerHTML = '';
  currentIpList = [];
}

// 开始扫码流程
async function startScan() {
  // 如果是开启白名单，必须有至少一个 IP
  if (currentUseWhite && currentIpList.length === 0) {
    showMessage('请至少添加一个 IP 地址');
    return;
  }
  if (!currentAppId) {
    showMessage('请先选择应用');
    return;
  }

  // 通知 background 生成二维码并开始轮询
  try {
    const { qrcode: qrToken } = await chrome.runtime.sendMessage({
      type: 'START_SCAN',
      appId: currentAppId,
      useWhite: currentUseWhite,
      ipList: currentIpList
    });
    // 显示二维码
    showQRCode(qrToken);
    scanSection.classList.remove('hidden');
    // 开始向 background 查询扫码状态
    pollScanStatus();
  } catch (e) {
    showMessage('扫码初始化失败: ' + e.message);
  }
}

// 生成二维码图片
function showQRCode(token) {
  const qrDiv = document.getElementById('qr-code');
  qrDiv.innerHTML = '';
  const qrUrl = `https://q.qq.com/qrcode/check?client=qq&code=${token}`;
  // 使用 qrcodejs 生成
  new QRCode(qrDiv, {
    text: qrUrl,
    width: 180,
    height: 180,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });
}

// 轮询扫码状态
let scanTimer = null;
function pollScanStatus() {
  if (scanTimer) clearInterval(scanTimer);
  scanTimer = setInterval(async () => {
    const state = await chrome.storage.local.get('scanState');
    if (!state.scanState) return;
    const { status, data } = state.scanState;
    if (status === 'scan_success') {
      clearInterval(scanTimer);
      document.getElementById('scan-hint').textContent = '扫码成功，正在更新白名单...';
      // 后台会自动执行更新，这里等待更新结果
      checkUpdateResult();
    } else if (status === 'scan_failed') {
      clearInterval(scanTimer);
      showMessage('扫码失败: ' + (data?.message || '未知错误'));
      resetScanUI();
    } else if (status === 'updated') {
      clearInterval(scanTimer);
      showMessage('白名单已更新成功');
      resetScanUI();
      // 刷新状态
      if (currentAppId) await onAppSelected(currentAppId);
    } else if (status === 'update_failed') {
      clearInterval(scanTimer);
      showMessage('更新失败: ' + (data?.message || ''));
      resetScanUI();
    }
  }, 1000);
}

async function checkUpdateResult() {
  const state = await chrome.storage.local.get('updateResult');
  if (state.updateResult) {
    clearInterval(scanTimer);
    if (state.updateResult.success) {
      showMessage('白名单已更新成功');
    } else {
      showMessage('更新失败: ' + state.updateResult.message);
    }
    resetScanUI();
    if (currentAppId) await onAppSelected(currentAppId);
  }
}

function resetScanUI() {
  scanSection.classList.add('hidden');
  document.getElementById('scan-hint').textContent = '等待扫码...';
}

// 恢复扫描状态（Popup 重新打开时）
async function restoreScanState() {
  const state = await chrome.storage.local.get('scanState');
  if (state.scanState && state.scanState.status === 'scanning') {
    // 正在扫描，重新显示二维码
    const qrToken = state.scanState.qrToken;
    if (qrToken) {
      showQRCode(qrToken);
      scanSection.classList.remove('hidden');
      pollScanStatus();
    }
  }
}

function showMessage(msg) {
  messageBar.textContent = msg;
  setTimeout(() => { messageBar.textContent = ''; }, 5000);
}