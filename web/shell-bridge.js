/* ControlPod · 桌面壳通信与本地 API 传输 */
'use strict';

const API_BASE = '/api';
let __shellSeq = 0;
const __shellWaiters = new Map();

if (typeof window !== 'undefined' && window.chrome && window.chrome.webview
  && typeof window.chrome.webview.addEventListener === 'function'){
  window.chrome.webview.addEventListener('message', ev => {
    const m = ev.data;
    if (!m || m.type !== 'api-reply') return;
    const waiter = __shellWaiters.get(m.id);
    if (!waiter) return;
    __shellWaiters.delete(m.id);
    waiter(m);
  });
}

function shellRequest(path, options){
  return new Promise((resolve, reject) => {
    const id = ++__shellSeq;
    __shellWaiters.set(id, m => m.ok
      ? resolve({ status: m.status, text: m.text })
      : reject(new Error(m.error || '壳通道请求失败')));
    window.chrome.webview.postMessage({
      type:'api-call', id, path,
      method:(options && options.method) || 'GET',
      body:(options && options.body) != null ? String(options.body) : null
    });
  });
}

const IN_SHELL = typeof window !== 'undefined' && !!(window.chrome && window.chrome.webview);

function shellToast(message, title){
  if (!IN_SHELL) return;
  if (!(S && S.notify)) return;
  try {
    window.chrome.webview.postMessage({
      type:'shell-toast', title:title || 'ControlPod', message:message || ''
    });
  } catch (_) {}
}

function shellChromeCommand(command, value){
  if (!IN_SHELL) return;
  try {
    const msg = { type:'chrome-command', command };
    if (value !== undefined) msg.value = value;
    window.chrome.webview.postMessage(msg);
  } catch (_) {}
}

document.addEventListener('mousedown', e => {
  if (e.button !== 0 || !e.target.closest('[data-drag]')) return;
  shellChromeCommand('drag');
});

document.addEventListener('dblclick', e => {
  if (e.target.closest('[data-drag]')) shellChromeCommand('toggle-maximize');
});

async function apiRequest(path, options){
  let status, readJson;
  if (IN_SHELL){
    const response = await shellRequest(path, options);
    status = response.status;
    readJson = () => { try { return JSON.parse(response.text); } catch (_) { return null; } };
  } else {
    if (typeof fetch !== 'function') throw new Error('当前环境不支持后端请求');
    const response = await fetch(API_BASE + path, {
      headers:{'Content-Type':'application/json'}, ...(options || {})
    });
    status = response.status;
    readJson = async () => { try { return await response.json(); } catch (_) { return null; } };
  }
  const payload = await readJson();
  if (status < 200 || status >= 300){
    const detail = payload && payload.detail;
    throw new Error(typeof detail === 'string'
      ? detail : (detail && detail.message) || `后端请求失败（${status}）`);
  }
  return payload;
}
