/* =========================================================
   ControlPod · 本地项目总控台
   ========================================================= */
'use strict';

/* ---------------- 图标 ---------------- */
const sv = (inner, c) => `<svg viewBox="0 0 24 24" fill="none">${inner.replace(/@/g, c)}</svg>`;
const C = {
  blue:'#2563EB', purple:'#7C4DFF', teal:'#0B8F8F', amber:'#B0700F',
  green:'#0E8A3C', indigo:'#6366F1'
};
const IC = {
  file:  c => sv('<path d="M6.5 3.5h7l4.5 4.5v12a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20V5a1.5 1.5 0 0 1 1.5-1.5z" stroke="@s" stroke-width="1.8" stroke-linejoin="round"/><path d="M13.5 3.5V8H18" stroke="@s" stroke-width="1.8" stroke-linejoin="round"/>'.replace(/@s/g,c)),
  code:  c => sv('<path d="M9 6L3.5 12L9 18" stroke="@s" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 6L20.5 12L15 18" stroke="@s" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'.replace(/@s/g,c)),
  web:   c => sv('<circle cx="12" cy="12" r="8.5" stroke="@s" stroke-width="1.8"/><path d="M3.5 12h17M12 3.5c2.2 2.3 3.4 5.3 3.4 8.5s-1.2 6.2-3.4 8.5c-2.2-2.3-3.4-5.3-3.4-8.5S9.8 5.8 12 3.5z" stroke="@s" stroke-width="1.8"/>'.replace(/@s/g,c)),
  git:   c => sv('<circle cx="6.5" cy="6" r="2.5" stroke="@s" stroke-width="1.8"/><circle cx="6.5" cy="18" r="2.5" stroke="@s" stroke-width="1.8"/><circle cx="17.5" cy="12" r="2.5" stroke="@s" stroke-width="1.8"/><path d="M6.5 8.5v7M9 6h4.5a4 4 0 0 1 4 4" stroke="@s" stroke-width="1.8" stroke-linecap="round"/>'.replace(/@s/g,c)),
  image: c => sv('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5" stroke="@s" stroke-width="1.8"/><circle cx="9" cy="10" r="1.8" stroke="@s" stroke-width="1.8"/><path d="M4.5 17l4.5-4.5 3.5 3.5 3-2.5 4 3.5" stroke="@s" stroke-width="1.8" stroke-linejoin="round"/>'.replace(/@s/g,c)),
  ext:   c => sv('<rect x="3.5" y="4.5" width="17" height="12" rx="2" stroke="@s" stroke-width="1.8"/><path d="M8 20h8" stroke="@s" stroke-width="1.8" stroke-linecap="round"/>'.replace(/@s/g,c)),
  folder:c => sv('<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.2l2 2.5H18.5A2.5 2.5 0 0 1 21 10v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17V7.5z" stroke="@s" stroke-width="1.8" stroke-linejoin="round"/>'.replace(/@s/g,c)),
  play:  c => sv('<path d="M8 5.5l11 6.5-11 6.5V5.5z" fill="@s"/>'.replace(/@s/g,c)),
  plus:  c => sv('<path d="M12 5.5v13M5.5 12h13" stroke="@s" stroke-width="2" stroke-linecap="round"/>'.replace(/@s/g,c)),
  check: c => sv('<path d="M5 12.5l4.6 4.6L19 7" stroke="@s" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'.replace(/@s/g,c)),
  close: c => sv('<path d="M6 6l12 12M18 6L6 18" stroke="@s" stroke-width="1.9" stroke-linecap="round"/>'.replace(/@s/g,c)),
  search:c => sv('<circle cx="11" cy="11" r="7" stroke="@s" stroke-width="1.8"/><path d="M16.2 16.2L21 21" stroke="@s" stroke-width="1.8" stroke-linecap="round"/>'.replace(/@s/g,c)),
  trash: c => sv('<path d="M5 7h14M10 7V5h4v2M7.5 7l.8 12.2A1.6 1.6 0 0 0 9.9 20.7h4.2a1.6 1.6 0 0 0 1.6-1.5L16.5 7" stroke="@s" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'.replace(/@s/g,c)),
  pin:   c => sv('<path d="M9 4.5h6l-1 5 3 3v2H7v-2l3-3-1-5z" stroke="@s" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 14.5V20" stroke="@s" stroke-width="1.7" stroke-linecap="round"/>'.replace(/@s/g,c)),
  tag:   c => sv('<path d="M4.5 11.2V6A1.5 1.5 0 0 1 6 4.5h5.2a2 2 0 0 1 1.4.6l6.3 6.3a2 2 0 0 1 0 2.8l-4.7 4.7a2 2 0 0 1-2.8 0l-6.3-6.3a2 2 0 0 1-.6-1.4z" stroke="@s" stroke-width="1.7" stroke-linejoin="round"/><circle cx="8.8" cy="8.8" r="1.3" fill="@s"/>'.replace(/@s/g,c)),
  grid:  c => sv('<rect x="3.5" y="3.5" width="7" height="7" rx="1.8" stroke="@s" stroke-width="1.7"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8" stroke="@s" stroke-width="1.7"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8" stroke="@s" stroke-width="1.7"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8" stroke="@s" stroke-width="1.7"/>'.replace(/@s/g,c)),
  term:  c => sv('<rect x="3" y="4.5" width="18" height="15" rx="2.6" stroke="@s" stroke-width="1.8"/><path d="M7 10l2.6 2.5L7 15" stroke="@s" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.5 15h4.5" stroke="@s" stroke-width="1.7" stroke-linecap="round"/>'.replace(/@s/g,c)),
  clock: c => sv('<circle cx="12" cy="12" r="8.5" stroke="@s" stroke-width="1.8"/><path d="M12 7.6V12l3 1.9" stroke="@s" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'.replace(/@s/g,c)),
  spark: c => sv('<path d="M12 3.5l1.9 4.9 4.9 1.9-4.9 1.9L12 17.1l-1.9-4.9L5.2 10.3l4.9-1.9L12 3.5z" stroke="@s" stroke-width="1.7" stroke-linejoin="round"/><path d="M18 15.5l.75 1.75L20.5 18l-1.75.75L18 20.5l-.75-1.75L15.5 18l1.75-.75L18 15.5z" stroke="@s" stroke-width="1.5" stroke-linejoin="round"/>'.replace(/@s/g,c)),
  bell:  c => sv('<path d="M6 9.5a6 6 0 1 1 12 0v4.2l1.6 2.8H4.4L6 13.7V9.5z" stroke="@s" stroke-width="1.8" stroke-linejoin="round"/>'.replace(/@s/g,c)),
  reset: c => sv('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" stroke="@s" stroke-width="1.8" stroke-linecap="round"/><path d="M4.5 4.5V9h4.5" stroke="@s" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'.replace(/@s/g,c)),
  note:  c => sv('<path d="M6 3.5h8A3 3 0 0 1 17 6.5V18a3 3 0 0 1-3 3H6A2.5 2.5 0 0 1 3.5 18.5V6A2.5 2.5 0 0 1 6 3.5z" stroke="@s" stroke-width="1.8"/><path d="M8 8h6M8 12h6M8 16h4" stroke="@s" stroke-width="1.8" stroke-linecap="round"/>'.replace(/@s/g,c)),
  pen:   c => sv('<path d="M4.4 19.6l.85-3.5L15.2 6.15a1.85 1.85 0 0 1 2.62 0l.63.63a1.85 1.85 0 0 1 0 2.62L8.5 19.15l-4.1.45z" stroke="@s" stroke-width="1.7" stroke-linejoin="round"/><path d="M14.1 7.25l2.65 2.65" stroke="@s" stroke-width="1.7" stroke-linecap="round"/>'.replace(/@s/g,c)),
  stop:  c => sv('<rect x="6.6" y="6.6" width="10.8" height="10.8" rx="2.5" fill="@s"/>'.replace(/@s/g,c)),
  copy:  c => sv('<rect x="8.8" y="8.8" width="11" height="11" rx="2.6" stroke="@s" stroke-width="1.7"/><path d="M15.2 8.8V6.7A2.2 2.2 0 0 0 13 4.5H6.7A2.2 2.2 0 0 0 4.5 6.7V13a2.2 2.2 0 0 0 2.2 2.2h2.1" stroke="@s" stroke-width="1.7" stroke-linecap="round"/>'.replace(/@s/g,c)),
  more:  c => sv('<circle cx="5" cy="12" r="1.6" fill="@s"/><circle cx="12" cy="12" r="1.6" fill="@s"/><circle cx="19" cy="12" r="1.6" fill="@s"/>'.replace(/@s/g,c)),
  chevR: c => sv('<path d="M9.6 5.6L16 12l-6.4 6.4" stroke="@s" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'.replace(/@s/g,c))
};

/* ---------------- 应用图标 ---------------- */
const APP_ICONS = {
  vscode:`<svg viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="10" fill="#0E77BF"/><path d="M25 9.4l-9.6 7.3-4.7-3.6-2.8 1.5 4.5 4.1-4.5 4.1 2.8 1.5 4.7-3.6 9.6 7.3 2.6-1.2V10.6L25 9.4z" fill="#FFFFFF"/></svg>`,
  chrome:`<svg viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="10" fill="#FFFFFF"/><circle cx="18" cy="18" r="9" fill="#4285F4"/><path d="M18 9a9 9 0 0 1 7.8 4.5H18V9z" fill="#EA4335"/><path d="M10.2 13.5A9 9 0 0 0 18 27v-4.6a4.5 4.5 0 0 1-4-2.2l-3.8-6.7z" fill="#34A853"/><circle cx="18" cy="18" r="3.6" fill="#FFFFFF"/></svg>`,
  pycharm:`<svg viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="10" fill="#1E1F22"/><path d="M10.5 11h6.8a4.2 4.2 0 0 1 0 8.4h-3.6V25h-3.2V11zm3.2 3v2.4h3.2a1.2 1.2 0 0 0 0-2.4h-3.2z" fill="#21D789"/><rect x="20" y="22.5" width="6.5" height="2.2" rx="1.1" fill="#FFFFFF"/></svg>`,
  chatgpt:`<svg viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="10" fill="#10A37F"/><path d="M18 9.8l7.2 4.2v8.4L18 26.6l-7.2-4.2v-8.4L18 9.8z" stroke="#FFFFFF" stroke-width="2.3" fill="none"/><path d="M18 15l3.6 2.1v4.2L18 23.4l-3.6-2.1v-4.2L18 15z" fill="#FFFFFF"/></svg>`,
  steam:`<svg viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="10" fill="#1B2838"/><circle cx="14.5" cy="21" r="4.8" stroke="#FFFFFF" stroke-width="2.1" fill="none"/><circle cx="14.5" cy="21" r="1.5" fill="#FFFFFF"/><circle cx="24.5" cy="13.5" r="3.4" stroke="#FFFFFF" stroke-width="2.1" fill="none"/><path d="M17.4 19.2l4-3.1" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round"/></svg>`,
  discord:`<svg viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="10" fill="#5865F2"/><path d="M24.6 13.6c-1.4-.7-2.9-1.1-4.6-1.3l-.6 1.2c-1.6-.2-3.1-.2-4.7 0l-.6-1.2c-1.7.2-3.2.6-4.6 1.3-2.2 3.3-2.9 6.9-2.6 10.7 1.7 1.3 3.4 2.1 5.1 2.6l1.1-1.7c-.6-.2-1.2-.5-1.8-.9l.5-.4c2.5 1.2 5.3 1.8 8.4 1.8s5.9-.6 8.4-1.8l.5.4c-.6.4-1.2.7-1.8.9l1.1 1.7c1.7-.5 3.4-1.3 5.1-2.6.3-3.8-.4-7.4-2.6-10.7z" fill="#FFFFFF"/><circle cx="14.8" cy="19.8" r="1.9" fill="#5865F2"/><circle cx="21.2" cy="19.8" r="1.9" fill="#5865F2"/></svg>`,
  notion:`<svg viewBox="0 0 36 36" fill="none"><rect x="0.5" y="0.5" width="35" height="35" rx="9.5" fill="#FFFFFF" stroke="#E4E4E0"/><path d="M12.5 25V11.8l2.7-.6 5.6 8.5v-8.2h2.7V25l-2.7.5-5.6-8.3V25h-2.7z" fill="#1F1F1F"/></svg>`,
  figma:`<svg viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="10" fill="#2C2C2C"/><path d="M13 9h5v6h-5a3 3 0 0 1 0-6z" fill="#F24E1E"/><path d="M18 9h5a3 3 0 0 1 0 6h-5V9z" fill="#FF7262"/><path d="M13 15h5v6h-5a3 3 0 0 1 0-6z" fill="#A259FF"/><path d="M13 21h5v3a3 3 0 1 1-5-3z" fill="#0ACF83"/><circle cx="23" cy="18" r="3" fill="#1ABCFE"/></svg>`,
  terminal:`<svg viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="10" fill="#1E1F22"/><path d="M11 14l4 4-4 4" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 22h7" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  spotify:`<svg viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="10" fill="#1DB954"/><path d="M11 14.5c4.5-1.4 9.5-.8 13 1.2M11.5 19c3.6-1.1 7.6-.6 10.4 1M12 23.2c2.9-.9 6.1-.5 8.4.8" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>`,
  slack:`<svg viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="10" fill="#4A154B"/><path d="M13.5 10.5v7" stroke="#36C5F0" stroke-width="2.6" stroke-linecap="round"/><path d="M10 14.5h7" stroke="#2EB67D" stroke-width="2.6" stroke-linecap="round"/><path d="M22.5 25.5v-7" stroke="#ECB22E" stroke-width="2.6" stroke-linecap="round"/><path d="M26 21.5h-7" stroke="#E01E5A" stroke-width="2.6" stroke-linecap="round"/></svg>`,
  idea:`<svg viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="10" fill="#FE315D"/><path d="M12 25l6-14h1.6l6 14h-2.4l-1.5-3.6h-6L14.4 25H12zm4.3-5.6h4.2L18.4 14l-2.1 5.4z" fill="#FFFFFF"/></svg>`,
  git:`<svg viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="10" fill="#F05133"/><path d="M25.6 16.6l-6.2-6.2a2 2 0 0 0-2.8 0l-1.2 1.2 2 2a2.3 2.3 0 0 1 2.9 2.9l2 2a2.3 2.3 0 1 1-1.4 1.4l-1.9-1.9v5.5a2.3 2.3 0 1 1-1.6-.1v-6a2.3 2.3 0 0 1-1.2-3L13.5 12v9.6a2.3 2.3 0 1 1-1.4.1V11.6l-.9.9a2 2 0 0 0 0 2.8l6.2 6.2a2 2 0 0 0 2.8 0l5.4-5.4a2 2 0 0 0 0-2.8z" fill="#FFFFFF" transform="translate(-1.5 1.5)"/></svg>`,
  game:`<svg viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="10" fill="#6D3BF5"/><path d="M13 14h10a5 5 0 0 1 5 5v1a4 4 0 0 1-7 2.6L19.6 21h-3.2L15 22.6A4 4 0 0 1 8 20v-1a5 5 0 0 1 5-5z" fill="#FFFFFF"/><path d="M12.5 18.5h3M14 17v3" stroke="#6D3BF5" stroke-width="1.6" stroke-linecap="round"/><circle cx="22.5" cy="17.5" r="1.1" fill="#6D3BF5"/><circle cx="24.5" cy="19.5" r="1.1" fill="#6D3BF5"/></svg>`,
  music:`<svg viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="10" fill="#F2545B"/><circle cx="14" cy="23" r="3" fill="#FFFFFF"/><circle cx="23" cy="21" r="3" fill="#FFFFFF"/><path d="M17 23V12l9-2v11" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
  movie:`<svg viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="10" fill="#0B8F8F"/><rect x="9" y="11" width="18" height="14" rx="3" stroke="#FFFFFF" stroke-width="2"/><path d="M15 14.5l7 3.5-7 3.5v-7z" fill="#FFFFFF"/></svg>`,
  office:`<svg viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="10" fill="#2B579A"/><path d="M11 9h9l5 5v13a1 1 0 0 1-1 1H12a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z" fill="#FFFFFF"/><path d="M14 18h8M14 21.5h8M14 14.5h5" stroke="#2B579A" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  add:`<svg viewBox="0 0 36 36" fill="none"><rect x="1.2" y="1.2" width="33.6" height="33.6" rx="10" stroke="#C9CDD5" stroke-width="2.2" stroke-dasharray="5 4.5"/><path d="M18 11.5v13M11.5 18h13" stroke="#8A909C" stroke-width="2.4" stroke-linecap="round"/></svg>`
};
/* 本机应用图标：native:{scan_id} 走壳内的 /api/applications/scan/{id}/icon（<img> 直出 PNG）。
   onerror 兜底：图标请求只要失败（后端断开 / 抽图失败 / 404），换回内置 SVG 兜底图标 ——
   否则浏览器会画出破图占位，用户看到的是「图标无法识别」而不是一个能接受的替代。 */
function appIconHTML(icon){
  const value = String(icon || '');
  if (value.startsWith('native:')){
    const scanId = value.slice('native:'.length);
    const fb = value.slice('native:'.length).replace(/[^A-Za-z0-9_-]/g, '').slice(-8) || 'add';
    return `<img class="native-app-icon" src="/api/applications/scan/${esc(scanId)}/icon" alt=""`
      + ` onerror="this.onerror=null;this.outerHTML=APP_ICONS['${esc(fb)}']||APP_ICONS.add;">`;
  }
  return APP_ICONS[value] || APP_ICONS.add;
}

/* ---------------- 项目状态（三态） ----------------
   正常 / 开发中 / 已暂停 —— 唯一来源：项目卡片 badge、总控台 hero 状态 chip、
   抽屉与「进入项目」页标题旁的切换控件都从这里取类名与颜色。
   颜色令牌在 styles.css 的 :root / [data-theme="dark"]（--st-ok / --st-dev / --st-pause）。 */
const PROJ_STS = [
  {v:'正常',   cls:'pst-ok',    c:'#16A34A', dsc:'一切正常，随时可以运行'},
  {v:'开发中', cls:'pst-dev',   c:'#2563EB', dsc:'正在迭代，执行模块可能随时变动'},
  {v:'已暂停', cls:'pst-pause', c:'#6B7280', dsc:'暂时搁置，不计入日常运行'}
];
/* 未知状态一律回落「正常」，避免脏数据把 badge 渲染成无底无字 */
function projStDef(st){ return PROJ_STS.find(x=>x.v===st) || PROJ_STS[0]; }
function projStCls(st){ return projStDef(st).cls; }
function projStColor(st){ return projStDef(st).c; }

/* ---------------- 数据 ---------------- */
const DATA = {
  /* ---------------- 项目（原工作流模块迁移：一个项目 = 一个独立运行单元） ----------------
     记录结构：项目层（name/st/desc/files/commits/tags/updated，总控台与抽屉在用）
             + 运行层（ico/color/flowName/flowDesc/last/runs/steps，原 workflow 字段平移） */
  projects: [
    {id:'apex', name:'APEX Automation', st:'正常', stCls:'pst-ok', parent:null, desc:'从总控台直接调用 APEX 启动核心，不再打开原来的前端。',
     files:38, commits:214, tags:['Python','asyncio','SQLite'], updated:'12 分钟前',
     ico:'sun', color:'#E8402A', flowName:'APEX 一键启动', flowDesc:'AK 加速 → Steam → APEX，由真实后端模块执行', last:'—', runs:0,
     steps:[
       {id:'w1s1', type:'script', ref:'apex-launcher', label:'APEX 一键启动', note:'AK → Steam → APEX', wait:true, on:true}
     ]},
    {id:'ops', name:'local-ops', st:'已暂停', stCls:'b-slate', parent:'apex', desc:'本地环境巡检与备份脚本集合，暂缓维护。',
     files:11, commits:42, tags:['Bash','cron'], updated:'6 天前',
     ico:'focus', color:'#2563EB', flowName:'深度开发', flowDesc:'关掉干扰，只留编辑器、终端与待评审的 PR', last:'昨天 21:10', runs:126,
     steps:[
       {id:'w2s1', type:'app', ref:'vscode',   label:'VS Code',  note:'', wait:true,  on:true},
       {id:'w2s2', type:'app', ref:'terminal', label:'Terminal', note:'D:/Projects/APEX-Automation', wait:true, on:true},
       {id:'w2s3', type:'cmd', ref:'npm run dev', label:'npm run dev', note:'前端开发服务', wait:false, on:true},
       {id:'w2s4', type:'web', ref:'https://github.com/pulls', label:'GitHub PR', note:'待我 review', wait:true, on:true},
       {id:'w2s5', type:'app', ref:'spotify',  label:'Spotify',  note:'', wait:false, on:false}
     ]},
    {id:'ai', name:'AI助手', st:'开发中', stCls:'b-blue', parent:null, desc:'个人 AI 工作台：对话、检索与日常任务的自动化编排。',
     files:19, commits:87, tags:['Python','LLM','CLI'], updated:'1 小时前',
     ico:'doc', color:'#7C4DFF', flowName:'日常助理', flowDesc:'把对话、检索和笔记收进一趟流程', last:'9月10日', runs:21,
     steps:[
       {id:'ai1', type:'web',    ref:'https://chat.openai.com', label:'ChatGPT', note:'日常对话与检索', wait:true, on:true},
       {id:'ai2', type:'app',    ref:'vscode', label:'VS Code', note:'AI助手工作区', wait:true, on:true},
       {id:'ai3', type:'folder', ref:'D:/Notes/AI助手', label:'笔记目录', note:'对话沉淀与素材', wait:true, on:true, missing:true}
     ]}
  ],
  /* Obsidian 连接（第一阶段）：只保存仓库名与项目笔记路径，
     通过官方 obsidian:// 协议打开 / 新建；不读取仓库、不做自动同步。 */
  obsidian: {
    vault:'Codex学习',
    projectFolder:'Codex学习/项目',
    bindings:{
      apex:'Codex学习/9.6 收集前端设计资料做apex启动器界面'
    }
  },
  /* 应用不再附带演示清单；启动后只展示后端保存的真实本机应用。 */
  apps: [],
  /* 项目任务统一存储：普通任务（kind:'todo'）与待修改（kind:'fix'）是同一列表的两种类型，
     只在项目开发上下文里按 proj 过滤展示。
     统一条目结构：{ id, text, kind, proj, due, urgent, done }（状态只有 done 一个布尔），
     kind 由 TASK_KIND 统一解释；新增条目必须带 kind，缺省按待办处理。
     「被哪些笔记引用」不落在本表 —— 引用只存笔记侧 links，待办侧由 noteLinksOf() 派生。 */
  todosPlan: [
    {id:'t1', text:'完善自动化脚本的异常处理', proj:'APEX Automation', due:'今天',    urgent:true,  done:false, kind:'todo'},
    {id:'t2', text:'整理项目文档结构',        proj:'APEX Automation', due:'今天',    urgent:true,  done:false, kind:'todo'},
    {id:'t3', text:'测试新版 API 接口',       proj:'AI助手',          due:'明天',    urgent:false, done:false, kind:'todo'},
    {id:'t4', text:'准备下个版本发布内容',    proj:'AI助手',          due:'9月12日', urgent:false, done:true,  kind:'todo'},
    {id:'t5', text:'优化数据库层性能',        proj:'AI助手',          due:'9月18日', urgent:false, done:false, kind:'todo'},
    {id:'t6', text:'回复设计评审的评论',      proj:'AI助手',          due:'9月20日', urgent:false, done:false, kind:'todo'},
    {id:'t7', text:'评审 v3 视觉稿并给出结论',proj:'AI助手',          due:'9月22日', urgent:false, done:false, kind:'todo'},
    /* 项目待办（原 devContext.counts.todo 的实体化） */
    {id:'t8', text:'补齐巡检脚本的 dry-run 模式', proj:'local-ops', due:'本周', urgent:false, done:false, kind:'todo'},
    {id:'t9', text:'给对话编排补一组回归用例',     proj:'AI助手',    due:'本周', urgent:false, done:false, kind:'todo'},
    /* 项目「待修改」（原 devContext.recentChanges 的实体化：从纯字符串升级为可操作条目） */
    {id:'f1', text:'窗口前置偶发失败',           proj:'APEX Automation', due:'本周', urgent:false, done:false, kind:'fix'},
    {id:'f2', text:'第二次启动状态判断错误',      proj:'APEX Automation', due:'本周', urgent:false, done:false, kind:'fix', pri:'高'},
    {id:'f3', text:'点击后缺少成功状态确认',      proj:'APEX Automation', due:'本周', urgent:false, done:false, kind:'fix', pri:'低'},
    {id:'f4', text:'备份任务在磁盘占满时未中断',   proj:'local-ops', due:'本周', urgent:false, done:false, kind:'fix'},
    {id:'f5', text:'巡检日志缺少时间戳',          proj:'local-ops', due:'本周', urgent:false, done:false, kind:'fix'},
    {id:'f6', text:'检索结果缺少引用来源',        proj:'AI助手',    due:'本周', urgent:false, done:false, kind:'fix'},
    {id:'f7', text:'流式输出偶发中断',            proj:'AI助手',    due:'本周', urgent:false, done:false, kind:'fix'}
  ],
  activities: [
    {text:'修改了 main.py',        proj:'APEX Automation', time:'2 分钟前',  ico:'file', c:C.blue,  kind:'文件'},
    {text:'运行了 启动脚本.sh',     proj:'APEX Automation', time:'18 分钟前', ico:'code', c:C.purple,kind:'脚本'},
    {text:'访问了 Product Hunt',   proj:'Chrome',           time:'1 小时前',  ico:'web',  c:C.teal,  kind:'应用'},
    {text:'提交了 commit a3f9c21', proj:'AI助手',            time:'2 小时前',  ico:'git',  c:C.green, kind:'项目'},
    {text:'保存了 设计稿_v3.fig',  proj:'AI助手',            time:'今天 12:08',ico:'image',c:C.amber, kind:'文件'},
    {text:'安装了 效率扩展',       proj:'Chrome',           time:'昨天 21:40',ico:'ext',  c:C.indigo,kind:'应用'}
  ],
  notices: [
    {t:'启动脚本运行完成', d:'start.sh 退出码 0，耗时 4.2s', time:'18 分钟前', read:false},
    {t:'云同步已恢复',     d:'3 个项目已同步至最新状态',      time:'1 小时前', read:false},
    {t:'数据库迁移待确认', d:'db_migrate.py 需要人工确认',    time:'昨天',    read:false},
    {t:'磁盘空间提醒',     d:'D 盘剩余 28%，建议清理归档',    time:'2 天前',  read:true}
  ],
  /* 项目记录统一存储：普通记录与灵感同源（灵感 = tag:'灵感'，不另立第二份存储），
     proj 始终指向所属项目，开发上下文按 proj 过滤展示。
     links = 引用的待办条目 id（待办 ↔ 笔记相互引用的唯一存储点，待办侧派生读取）。 */
  notes: [
    {id:'n1',  title:'晨间记录',  tag:'日常', proj:'AI助手',          pinned:true,  time:'今天 09:14', body:'今天要推进三件事：完善异常处理、整理文档结构、跑一遍数据清洗。'},
    {id:'n2',  title:'APEX 架构备忘', tag:'技术', proj:'APEX Automation', pinned:false, time:'昨天 22:41', body:'调度层用 asyncio 队列串步骤，步骤支持 wait 串行 / 并行两种模式。', links:['t1']},
    {id:'n3',  title:'Q3 复盘要点',   tag:'复盘', proj:'AI助手',          pinned:false, time:'昨天 18:02', body:'下载模块的信息密度问题：并列罗列数量，读者只能得出「东西很多」一个结论。'},
    {id:'n4',  title:'灵感 · 快捷启动', tag:'灵感', proj:'APEX Automation', pinned:false, time:'9月10日',   body:'快捷启动应该只放最常用的 5 个，其余收进应用页，用频率排序而非数量。'},
    /* 项目「灵感 / 笔记」实体（原 devContext.recentIdeas 的实体化：从纯字符串升级为可编辑笔记） */
    {id:'n5',  title:'尝试 UI Automation 替代部分图像识别', tag:'灵感', proj:'APEX Automation', pinned:false, time:'昨天 20:15', body:'图像识别在缩放 / 主题切换下不稳定，改用控件树定位能提升成功率。', links:['f2']},
    {id:'n6',  title:'把模块状态机抽成独立可测单元', tag:'灵感', proj:'APEX Automation', pinned:false, time:'9月11日', body:'状态流转现在散在步骤回调里，抽出来后可以单测覆盖异常分支。'},
    {id:'n7',  title:'把巡检结果写成每日摘要', tag:'灵感', proj:'local-ops', pinned:false, time:'昨天 19:02', body:'每天一条摘要比逐条告警更可读，异常项单独前置。'},
    {id:'n8',  title:'备份失败时自动降级到本地归档', tag:'灵感', proj:'local-ops', pinned:false, time:'9月11日', body:'云端不可用时先落本地队列，恢复后补同步。'},
    {id:'n9',  title:'工具调用结果做成卡片', tag:'灵感', proj:'AI助手', pinned:false, time:'昨天 21:30', body:'结构化结果用卡片呈现，比整段文本更容易扫读。'},
    {id:'n10', title:'对话沉淀自动归档到笔记目录', tag:'灵感', proj:'AI助手', pinned:false, time:'昨天 12:40', body:'有价值的结论自动生成笔记并打上项目标签。'},
    {id:'n11', title:'给常用指令建快捷短语', tag:'灵感', proj:'AI助手', pinned:false, time:'9月10日', body:'高频指令配短触发词，减少重复输入。'}
  ],

  /* ---- 工作流 ---- */
  /* workflows 已并入上方 projects（2026-09-13 项目化迁移），此键不再存在。 */

  /* ---- 项目开发上下文（Mock，按项目名索引） ----
     注意：这里不再存「待办 / 待修改 / 灵感笔记」——
     待办与待修改看 S.todos（kind 区分），笔记与灵感看 S.notes（tag==='灵感' 即灵感），
     三类计数由 devCounts() 派生。别把第二份数据加回来，否则就是两处维护。 */
  devContext: {
    'APEX Automation': {
      projectId:'apex', module:'AK 自动加速', moduleId:'ak-accelerator',
      modulePath:'src/modules/ak-accelerator/', files:['window.py','state.py','runner.py'],
      status:'开发中',
      next:'修复 AK 第二次启动状态判断错误',
      lastEdit:'12 分钟前'
    },
    'local-ops': {
      projectId:'local-ops', module:'环境巡检守护', moduleId:'environment-watch',
      modulePath:'src/modules/environment-watch/', files:['watcher.py','backup.py','logger.py'],
      status:'开发中',
      next:'补齐备份失败时的重试与告警',
      lastEdit:'2 小时前'
    },
    'AI助手': {
      projectId:'ai', module:'对话编排', moduleId:'chat-orchestrator',
      modulePath:'src/modules/chat-orchestrator/', files:['agent.py','memory.py','retriever.py'],
      status:'开发中',
      next:'接入本地知识库检索',
      lastEdit:'1 小时前'
    }
  },

  /* ---- 项目元信息（Mock）：工作流页项目概览用 ---- */
  projMeta: {
    'APEX Automation': {created:'2026-06-18'},
    'local-ops':       {created:'2026-07-02'},
    'AI助手':          {created:'2026-08-15'}
  },

  /* 新建项目模板（下轮「新建项目」流程接入；先落位保证结构一致） */
  projectTemplate: {
    id:'', name:'未命名项目', st:'正常', stCls:'pst-ok', parent:null, desc:'', files:0, commits:0,
    tags:[], updated:'刚刚', ico:'focus', color:'#2563EB', flowName:'', flowDesc:'', last:'—', runs:0, steps:[]
  },

  /* ---- 执行模块库：可以放进项目运行流程的模块（统一封装标准） ----
     实际数据由 /api/bootstrap 恢复。源码只保留 APEX 项目的清单模块用于静态规格测试，
     不再附带 Product Hunt / Notion 等演示网站。网站模块统一从「新增模块」创建。 */
  modules: [
    /* 真实后端模块：运行由 /api/projects/apex/run 接管，前端不拼接或执行 shell。 */
    {id:'apex-launcher', ref:'apex-launcher', type:'script', name:'APEX 一键启动',
     desc:'调用独立 APEX 启动项目，不打开旧前端', arg:'', manifestBacked:true, st:'就绪'}
  ]

  /* 下载捕获没有接入真实系统服务，已随下载模块移除。 */
};

/* 项目初始快照：用于「恢复默认」 */
const WF_SEED = JSON.parse(JSON.stringify(DATA.projects));

/* ---------------- 状态 ---------------- */
const S = {
  page:'home',
  theme:'light',
  density:1,            // 外观·信息密度档位 0/1/2（紧凑/标准/宽松）
  accent:'#E8402A',     // 外观·强调色（写 --brand 令牌），取值受 ACCENTS 白名单约束
  glass:true,           // 外观·玻璃质感；关闭时给 <html> 挂 no-blur，卡片改纯色底
  notify:true,          // 通用·桌面通知：门控壳的系统通知（shellToast）。关掉后运行终态只在页面内提示，不推系统 Toast
  save:true,            // 通用·自动保存
  telemetry:false,      // 通用·使用数据统计（原型不采集，仅记录开关意愿）
  appQuery:'',          // 应用页模糊搜索词
  uninstallArm:'',      // 应用详情里处于「待二次确认卸载」的应用 id
  appView:'list',       // 应用页全部应用区视图（list/grid）
  favOnly:false,        // 「常用优先」开关（索引条顶部置顶图标）：开启后只显示置顶为常用的应用
  appAlpha:'',          // 字母索引条当前高亮的分组（A-Z / #），空=取第一个有内容的分组
  confirmRemove:'',     // 待二次确认剔除的应用 id（弹窗态）
  projConfirm:'',       // 待二次确认删除的项目 id（预演弹窗态）
  projDeletePreview:null, // 后端删除预演：{projectId,taskCount,moduleBindingCount,runCount}
  addName:'', addCat:'', // 添加真实本机应用时的可选命名与标签
  addStep:'form',       // 添加应用流程步：form=选择，confirm=命名确认
  addPick:'',           // 第一步中选中的本机扫描应用 id
  scanQuery:'',         // 「从本机扫描结果选择」列表的搜索词
  scanScroll:0,         // 扫描列表独立滚动；点选 / 返回时保持原位置
  scanApps:[],          // 后端实时扫描到的 Windows 开始菜单应用
  scanLoading:false,
  scanError:'',
  scanRequest:0,        // 扫描请求令牌：刷新时淘汰旧响应，关闭弹窗后不重新弹出
  startupEnabled:null,  // null=尚未从 Windows 启动项读取；其余值以接口读回结果为准
  startupRegistered:null,  // Run 里是否登记了本该有的命令
  startupApproved:null,    // Windows 侧（任务管理器那个开关）是否允许它启动
  startupLoading:false,
  startupUpdating:false,
  startupError:'',
  updates:null,
  updateError:'',
  updateRequestBusy:false,
  updateRequestTarget:null,
  updatePanel:null,
  updateOperation:null,
  updateNotified:'',
  windowState:{available:false, topmost:false},
  windowUpdating:false,
  windowError:'',
  appCat:'全部',
  apps: DATA.apps.slice(),
  projectFiles: [],
  todos: {plan: DATA.todosPlan.map(t=>({...t}))},
  acts: DATA.activities.slice(),
  notices: DATA.notices.map(n=>({...n})),
  notes: DATA.notes.map(n=>({...n, links:(n.links||[]).slice()})),
  noteSel:'',           // 正在编辑的项目记录 id（弹窗关闭后清空）
  obsidian:{
    vault:DATA.obsidian.vault,
    projectFolder:DATA.obsidian.projectFolder,
    bindings:{...DATA.obsidian.bindings}
  },                    // Obsidian URI 配置：仓库名 / 项目目录 / 项目绑定会保存到浏览器本机
  obsidianHubOpen:'',   // 项目资料中枢卡的管理区（按项目 id 展开，不持久化）
  obsidianBindEdit:'',  // 正在连接 / 更换主页的项目 id
  obsidianUpdateArm:'', // 覆盖写入项目主页前的二次确认项目 id
  obsidianUnbindArm:'', // 解除主页绑定前的预演 + 二次确认项目 id
  obsidianReturnFocus:'', // 从 Obsidian 返回后需要定位并高亮的项目 id
  /* 项目 */
  wf:'apex',
  running:null,        // {wfId, i, done, total, states, log, order}
  projectRuntime:{},   // 真实项目最后确认的运行态：{projectId:'running'|'stopped'}，启动时由后端运行记录恢复
  heatDays:[],         // 活跃度热区 371 格（53 周）「每日在线分钟」（旧→今），由 /api/activity/daily 的 online 聚合
  heatDetail:{},       // 活跃度按日明细：date → {online, adds, dels}，悬停 tooltip 用
  heatMode:'daily',    // 热区口径：daily 每日（默认）/ weekly 每周合计 / total 累计
  heatFetchedAt:0,     // 上次拉取活跃度聚合的时间戳（ms），用于 60s 节流
  larderTab:'app',
  larderQ:'',
  /* 模块页 */
  modTab:'all',        // 类型筛选：all / web / folder / script / cmd
  modQ:'',             // 模块库搜索词
  modConfirm:'',       // 待删除模块的键「type|ref」，非空时渲染预演 + 二次确认弹窗
  _modKey:'',          // 模块表单：正在编辑的条目键「原 type|原 ref」；新增时为空
  devTask:{},          // 「本轮开发任务」：{tids:[…]}，tid 指向 S.todos 条目（实时解析）；按项目 id 隔离
  projRules:{},        // 「开发要求」按项目覆盖（编辑基本资料保存时写入）：{projId:[5 条]}；缺省用 DEV_RULES
  basicPending:null,   // 编辑基本资料：待二次确认的保存（{id,text}），仅在预演链路里存在
  zoneH:{},            // 开发上下文区域高度（拖拽手柄调整，内存态不持久化）：{wid:{cur/高/中/低: px}}
  runOpen:{},          // 运行详情展开状态：按 workflowId 隔离，不持久化
  wfEdit:null,         // 当前处于编辑模式的 workflowId；null 表示查看模式
  projEdit:null,       // 「概览 · 身份卡」内联编辑窗口打开的项目 id；null 表示未打开
  /* 项目 */
  proj:'apex'
};

/* ---------------- 工具 ---------------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

/* ---------------- Obsidian 连接（URI 深链接：打开 / 新建 / 单向覆盖） ----------------
   浏览器无法确认外部应用是否真的打开，所以界面只报告“已请求打开”，不伪造连接成功。
   项目绑定按稳定的项目 id 保存；项目改名不会丢失既有笔记路径。 */
const OBSIDIAN_STORE_KEY = 'apex-console.obsidian.v1';
const cleanObsidianPath = s => String(s || '').trim().replace(/\\/g,'/').replace(/^\/+|\/+$/g,'');
function normalizeObsidianState(raw){
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const bindings = {};
  if (raw.bindings && typeof raw.bindings === 'object' && !Array.isArray(raw.bindings)){
    Object.entries(raw.bindings).forEach(([id, path]) => {
      if (!DATA.projects.some(p=>p.id===id) || typeof path !== 'string') return;
      const clean = cleanObsidianPath(path);
      if (clean) bindings[id] = clean;
    });
  }
  return {
    vault:typeof raw.vault === 'string' ? raw.vault.trim() : '',
    projectFolder:typeof raw.projectFolder === 'string' ? cleanObsidianPath(raw.projectFolder) : '',
    bindings
  };
}
function persistObsidianState(){
  const data = normalizeObsidianState(S.obsidian);
  return !!data && store.set(OBSIDIAN_STORE_KEY, JSON.stringify(data));
}
function loadObsidianState(){
  const saved = store.get(OBSIDIAN_STORE_KEY, '');
  if (!saved) return false;
  try {
    const data = normalizeObsidianState(JSON.parse(saved));
    if (!data) return false;
    S.obsidian = data;
    return true;
  } catch (_) {
    return false;
  }
}
/* ---- 界面偏好（浏览器本机持久化，与「刷新即重置」的运行时状态区别对待）----
   设置页的外观选择是用户偏好，不是一次会话的临时状态：刷新后必须还在。
   与 Obsidian 配置同一套 store 包装；读取失败、JSON 损坏、档位越界一律安全回退默认值。 */
const PREFS_STORE_KEY = 'apex-console.prefs.v1';
const DENSITY_STEPS = [[14, 12], [18, 16], [24, 22]];   /* 档位 → [卡片内边距, 间距]，与 :root 的 --pad / --gap 同量级 */
const DENSITY_LABELS = ['紧凑', '标准', '宽松'];
const THEME_VALUES = ['light', 'dark'];
const ACCENTS = ['#E8402A', '#2563EB', '#7C4DFF', '#0E8A3C'];   /* 与设置页色板同序，首项 = :root 的 --brand 默认值 */
const isDensityStep = v => Number.isInteger(v) && v >= 0 && v < DENSITY_STEPS.length;
const PREF_KEYS = ['theme', 'accent', 'density', 'glass', 'notify', 'save', 'telemetry'];
const BOOL_PREF_DEFAULTS = { glass:true, notify:true, save:true, telemetry:false };
function normalizePrefs(raw){
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  /* 逐字段白名单：越界 / 类型不对就回该字段默认值，不因为一个坏字段丢掉整份偏好 */
  const data = {
    theme: THEME_VALUES.includes(raw.theme) ? raw.theme : 'light',
    accent: ACCENTS.includes(raw.accent) ? raw.accent : ACCENTS[0],
    density: isDensityStep(raw.density) ? raw.density : 1
  };
  Object.keys(BOOL_PREF_DEFAULTS).forEach(k => {
    data[k] = typeof raw[k] === 'boolean' ? raw[k] : BOOL_PREF_DEFAULTS[k];
  });
  return data;
}
function persistPrefs(){
  const out = {};
  PREF_KEYS.forEach(k => { out[k] = S[k]; });
  return store.set(PREFS_STORE_KEY, JSON.stringify(out));
}
function loadPrefs(){
  const saved = store.get(PREFS_STORE_KEY, '');
  if (!saved) return false;
  try {
    const data = normalizePrefs(JSON.parse(saved));
    if (!data) return false;
    PREF_KEYS.forEach(k => { S[k] = data[k]; });
    return true;
  } catch (_) {
    return false;
  }
}
/* 四个 applier 只写 :root / <html> 上的令牌与状态类，组件里不硬写视觉值（AGENTS.md 硬约束 6） */
function applyDensity(v){
  /* 非法档位回退「标准」；返回夹紧后的档位，调用方据此回写 S.density 与提示文案 */
  const i = isDensityStep(v) ? v : 1;
  const [pad, gap] = DENSITY_STEPS[i];
  document.documentElement.style.setProperty('--pad', pad + 'px');
  document.documentElement.style.setProperty('--gap', gap + 'px');
  S.density = i;
  return i;
}
function applyTheme(v){
  const t = THEME_VALUES.includes(v) ? v : 'light';
  document.documentElement.dataset.theme = t;
  /* 壳内同步：无边框壳顶部有 8px 系统保留区（WebView2 盖不住，壳用 XAML 底色兜底），
     壳底色必须跟页面主题走才不会在深色下露白带。
     必须走 shellChromeCommand 且传对象 —— 壳用 WebMessageAsJson 解析，自己 JSON.stringify
     会把整条消息变成 JSON 字符串、壳侧 type 取不到，命令被静默丢弃。 */
  shellChromeCommand('theme', t);
}
function applyAccent(v){ document.documentElement.style.setProperty('--brand', ACCENTS.includes(v) ? v : ACCENTS[0]); }
function applyGlass(on){ document.documentElement.classList.toggle('no-blur', on !== true); }
function applyPrefs(){ applyTheme(S.theme); applyAccent(S.accent); applyDensity(S.density); applyGlass(S.glass); }
function obsidianUri(action, params){
  const q = Object.entries(params || {})
    .filter(([,v]) => v !== '' && v != null)
    .map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `obsidian://${action}${q ? '?' + q : ''}`;
}
function obsidianSuggestedPath(w){
  const folder = cleanObsidianPath(S.obsidian.projectFolder);
  return [folder, w && w.name].filter(Boolean).join('/');
}
function obsidianProjectPath(w){
  return cleanObsidianPath(w && S.obsidian.bindings[w.id]) || obsidianSuggestedPath(w);
}
function consoleProjectUrl(w){
  if (!w) return '';
  const href = String(globalThis.location && globalThis.location.href || '');
  const base = /^(?:https?:|file:)/i.test(href) ? href.split('#')[0] : '';
  return `${base}#/workflows/${encodeURIComponent(w.id)}?focus=obsidian`;
}
function clearObsidianHubFlow(keepOpen){
  if (!keepOpen) S.obsidianHubOpen = '';
  S.obsidianBindEdit = '';
  S.obsidianUpdateArm = '';
  S.obsidianUnbindArm = '';
}
function toggleObsidianHub(id){
  if (!DATA.projects.some(x=>x.id===id)) return false;
  const open = S.obsidianHubOpen !== id;
  clearObsidianHubFlow(false);
  S.obsidianHubOpen = open ? id : '';
  render(true);
  return open;
}
function editObsidianBinding(id){
  if (!DATA.projects.some(x=>x.id===id)) return false;
  clearObsidianHubFlow(false);
  S.obsidianHubOpen = id;
  S.obsidianBindEdit = id;
  render(true);
  return true;
}
function armObsidianUnbind(id){
  if (!cleanObsidianPath(S.obsidian.bindings[id])) return false;
  S.obsidianHubOpen = id;
  S.obsidianBindEdit = '';
  S.obsidianUpdateArm = '';
  S.obsidianUnbindArm = id;
  render(true);
  return true;
}
function unbindObsidianProject(id){
  const w = DATA.projects.find(x=>x.id===id); if (!w) return false;
  if (S.obsidianUnbindArm !== id){ toast('请先查看解除连接的影响'); return false; }
  if (!cleanObsidianPath(S.obsidian.bindings[id])) return false;
  delete S.obsidian.bindings[id];
  persistObsidianState();
  clearObsidianHubFlow(false);
  render(true);
  toast(`已移除「${w.name}」的 Obsidian 主页路径；仓库文件未被删除`);
  return true;
}
function markObsidianDeparture(id){
  const hub = $(`#obsHub-${id}`);
  if (!hub || !hub.classList) return false;
  hub.classList.remove('is-opening');
  void hub.offsetWidth;
  hub.classList.add('is-opening');
  setTimeout(()=>hub.classList.remove('is-opening'), 420);
  return true;
}
function readObsidianSettings(){
  const vaultEl = $('#obsVault'), folderEl = $('#obsFolder');
  const vault = String(vaultEl ? vaultEl.value : S.obsidian.vault).trim();
  const folder = cleanObsidianPath(folderEl ? folderEl.value : S.obsidian.projectFolder);
  if (!vault){ toast('请先填写 Obsidian 仓库名称'); return false; }
  S.obsidian.vault = vault;
  S.obsidian.projectFolder = folder;
  return true;
}
function openObsidianUri(uri, label){
  if (!uri) return false;
  try {
    globalThis.location.href = uri;
    toast(label || '已请求打开 Obsidian，请在外部应用中确认');
    return true;
  } catch (_) {
    toast('无法调用 Obsidian，请确认已安装并至少启动过一次');
    return false;
  }
}
function saveObsidianSettings(){
  if (!readObsidianSettings()) return false;
  const saved = persistObsidianState();
  render(true);
  toast(saved ? 'Obsidian 设置已保存，刷新页面后仍会保留' : '设置仅在当前会话生效；浏览器未允许本地保存');
  return true;
}
function testObsidianConnection(){
  if (!readObsidianSettings()) return false;
  return openObsidianUri(
    obsidianUri('open', {vault:S.obsidian.vault}),
    '已请求打开 Obsidian；请确认是否进入了正确仓库'
  );
}
function bindObsidianProject(id){
  const w = DATA.projects.find(x=>x.id===id); if (!w) return false;
  const input = $('#obsProjectPath');
  const path = cleanObsidianPath(input ? input.value : obsidianProjectPath(w));
  if (!path){ toast('请先填写项目主页路径'); return false; }
  S.obsidian.bindings[id] = path;
  clearObsidianHubFlow(false);
  const saved = persistObsidianState();
  render(true);
  toast(saved
    ? `主页路径已保存；控制台无法确认 Obsidian 中是否存在该页面`
    : `路径仅在当前会话保存；控制台无法确认 Obsidian 中是否存在该页面`);
  return true;
}
function openObsidianProject(id){
  const w = DATA.projects.find(x=>x.id===id); if (!w) return false;
  const path = cleanObsidianPath(S.obsidian.bindings[id]);
  if (!S.obsidian.vault){ toast('请先到设置页填写 Obsidian 仓库名称'); return false; }
  if (!path){ toast('请先保存项目笔记绑定'); return false; }
  markObsidianDeparture(id);
  return openObsidianUri(
    obsidianUri('open', {vault:S.obsidian.vault, file:path}),
    `已请求在 Obsidian 中打开「${w.name}」`
  );
}
function obsidianProjectNote(w){
  if (!w) return '';
  const oneLine = s => String(s || '').replace(/\s+/g,' ').trim();
  const tasks = projTasks(w.name);
  const current = new Set(devTidsOf(w.id));
  const taskText = tasks.length ? tasks.map(t => {
    const state = t.done ? '已完成' : current.has(t.id) ? '当前' : priOf(t) + '优先级';
    return `- [${t.done?'x':' '}] ${oneLine(t.text)} · ${KIND_SHOW} · ${state} · ${oneLine(t.due)}`;
  }).join('\n') : '- 暂无项目任务';
  const notes = projNotes(w.name);
  const noteText = notes.length ? notes.map(n =>
    `### ${oneLine(n.title)}\n\n> ${oneLine(n.tag)} · ${oneLine(n.time)}\n\n${String(n.body || '').trim() || '暂无正文'}`
  ).join('\n\n') : '暂无项目记录';
  const back = consoleProjectUrl(w);
  return `---\nproject_id: ${w.id}\nproject: ${JSON.stringify(String(w.name || ''))}\nconsole_managed: true\ntags:\n  - 项目\n---\n\n# ${w.name}\n\n> 此页面由 ControlPod 生成；再次更新会覆盖全文。\n\n[返回 ControlPod 当前项目](${back})\n\n## 项目概览\n\n- 状态：${w.st}\n- 运行流程：${flowNameOf(w)}\n- 最近运行：${w.last}\n\n## 项目说明\n\n${w.desc || ''}\n\n## 项目任务\n\n${taskText}\n\n## 项目记录\n\n${noteText}\n`;
}
function newObsidianProject(id){
  const w = DATA.projects.find(x=>x.id===id); if (!w) return false;
  if (!S.obsidian.vault){ toast('请先到设置页填写 Obsidian 仓库名称'); return false; }
  const input = $('#obsProjectPath');
  const path = cleanObsidianPath(input ? input.value : obsidianProjectPath(w));
  if (!path){ toast('请先填写项目笔记路径'); return false; }
  const opened = openObsidianUri(
    obsidianUri('new', {vault:S.obsidian.vault, file:path, content:obsidianProjectNote(w)}),
    `已请求在 Obsidian 中新建「${w.name}」项目主页`
  );
  if (!opened) return false;
  S.obsidian.bindings[id] = path;
  persistObsidianState();
  clearObsidianHubFlow(false);
  render(true);
  return true;
}
function updateObsidianProject(id){
  const w = DATA.projects.find(x=>x.id===id); if (!w) return false;
  const path = cleanObsidianPath(S.obsidian.bindings[id]);
  if (!S.obsidian.vault){ toast('请先到设置页填写 Obsidian 仓库名称'); return false; }
  if (!path){ toast('请先保存项目主页路径'); return false; }
  if (S.obsidianUpdateArm !== id){ toast('请先确认覆盖当前 Obsidian 主页'); return false; }
  const opened = openObsidianUri(
    obsidianUri('new', {vault:S.obsidian.vault, file:path, content:obsidianProjectNote(w), overwrite:true}),
    `已请求写入「${w.name}」的项目资料，请在 Obsidian 中确认内容`
  );
  clearObsidianHubFlow(false);
  return opened;
}

/* ---------------- 项目任务 / 项目记录联动（单一事实源） ----------------
   合并规则（2026-09-14 定）：
   · 「待办」与「待修改」合并为一个模块：同一份 S.todos，用 kind 区分（todo=待办 / fix=待修改），
     操作（完成 / 改期 / 删除）共用一套 —— 不存在第二份「待修改」数据。
     （2026-09-15：kind 退居内部派生用，对外一律显示「待办」，见下方 KIND_SHOW。）
   · 「笔记」与「灵感笔记」同源：同一份 S.notes，灵感 = tag:'灵感'（不新增冗余字段）。
   · 两条通路都靠 proj（项目名）挂到项目上，开发上下文里的三个数字与两张列表全部由 devCounts() 派生。
     所有编辑入口都在项目内，改动后项目开发上下文与 Agent 文本立即一致。 */
const TASK_KIND = {
  todo: {label:'待办',   cls:'b-slate'},
  fix:  {label:'待修改', cls:'b-amber'}
};
const taskKindOf = t => (t && TASK_KIND[t.kind]) ? t.kind : 'todo';
/* ---- 类型标签的展示口径（2026-09-15 四轮）----
   TASK_KIND 保留为「数据里的类型词表」，只用于内部派生（projTodos / projFixes / devCounts）；
   对外呈现一律走 KIND_SHOW —— 「待修改」不再出现在任何输出（Agent 文本 / 任务来源 / 删除预演 /
   Obsidian 项目主页）里，与「待办」合并成同一个说法。kind 字段本身不动，老数据仍可正常区分。 */
const KIND_SHOW = '待办';
/* ---- 优先级（2026-09-14 三轮）：高 / 中 / 低，缺省「中」 ----
   开发上下文的待办列表按它分组；编辑入口在待办编辑抽屉与新建抽屉。 */
const TASK_PRI = ['高', '中', '低'];
const priOf = t => (t && TASK_PRI.includes(t.pri)) ? t.pri : '中';
/* 区域移动：任务拖入 / 按钮提升的统一入口。
   zone='cur' → 加入当前任务区（支持多个）；zone=高/中/低 → 切换优先级并移出当前区。
   一致性：同一任务同一时刻只在一个区域 —— 移入优先级区即从当前区移除，反之亦然。 */
function moveTaskZone(wid, tid, zone){
  const w = DATA.projects.find(x=>x.id===wid);
  const t = allTodos().find(x=>x.id===tid);
  if (!w || !t) return;
  const short = t.text.length > 14 ? t.text.slice(0,14) + '…' : t.text;
  if (zone === 'cur'){
    const ids = devTidsOf(wid);
    if (!ids.includes(tid)) ids.push(tid);
    S.devTask[wid] = { tids: ids };
    toast(`「${short}」已加入当前任务`);
  } else if (TASK_PRI.includes(zone)){
    if (typeof fetch === 'function'){
      if (!BACKEND_TASK_IDS.has(t.id)){ toast('任务尚未由后端保存'); return; }
      void updateBackendTask(t, {pri:zone}).then(saved => {
        if (!saved) throw new Error('任务保存后无法恢复');
        S.devTask[wid] = { tids: devTidsOf(wid).filter(x=>x!==tid) };
        render(true); toast(`「${short}」已设为${zone}优先级`);
      }).catch(err => toast(err && err.message ? err.message : '任务优先级保存失败'));
      return;
    }
    t.pri = zone;
    S.devTask[wid] = { tids: devTidsOf(wid).filter(x=>x!==tid) };
    toast(`「${short}」已设为${zone}优先级`);
  } else return;
  render(true);
}
/* 一致性清理：任务完成 / 删除后，把它从所有项目的当前任务区移除 */
function pruneCurTasks(tid){
  Object.keys(S.devTask).forEach(wid => {
    const ids = devTidsOf(wid).filter(x => x !== tid);
    if (ids.length) S.devTask[wid] = { tids: ids };
    else delete S.devTask[wid];
  });
}
const allTodos   = () => S.todos.plan;
const projTasks  = n => allTodos().filter(t => t.proj === n);
const projTodos  = n => projTasks(n).filter(t => taskKindOf(t) === 'todo' && !t.done);
const projFixes  = n => projTasks(n).filter(t => taskKindOf(t) === 'fix'  && !t.done);
const projNotes  = n => S.notes.filter(x => x.proj === n);
/* 开发上下文三个计数的唯一来源：todo / fix 只数未完成项（待办=待处理），note 数全部 */
const devCounts  = n => ({ todo: projTodos(n).length, fix: projFixes(n).length, note: projNotes(n).length });
/* 「本轮开发任务」实时解析：存 id 不存文本，项目任务改了措辞这边自动跟上。
   2026-09-14 区域化：S.devTask[wid] = { tids:[…] } —— 当前任务区支持多个、可为空；
   兼容旧单选结构 {tid}；devTaskOf 取第一个（Agent 上下文的「本轮开发任务」语义不变）。 */
const devTidsOf = wid => {
  const dt = S.devTask[wid]; if (!dt) return [];
  if (Array.isArray(dt.tids)) return dt.tids;
  return dt.tid ? [dt.tid] : [];
};
const devTaskOf  = wid => {
  const tid = devTidsOf(wid)[0]; if (!tid) return null;
  const t = allTodos().find(x => x.id === tid);
  return t ? { tid: t.id, source: KIND_SHOW, text: t.text } : null;
};

/* ---- 项目任务 ↔ 项目记录相互引用 ----
   引用只有一处存储：links 数组存在笔记一侧（note.links = [todoId,…]），
   待办一侧的引用列表由 noteLinksOf() 现场派生 —— 不在待办条目上存第二份，
   任何一侧编辑后另一侧自动一致（都是同一份 S 数据派生）。
   引用键 = 待办 id：待办改文案 / 切类型不影响引用；删除待办时用 detachTodoRefs 清理悬空。
   **注意**：两侧的关联入口（任务编辑的「关联项目记录」、记录编辑的任务清单）已先后删除，
   2026-09-15 又删掉了「复制 Agent 上下文」里的「↳ 引用笔记」续行 —— links 现在没有任何渲染宿主；
   2026-09-24 清掉了随宿主消失的两个纯展示函数，引用功能只剩 detachTodoRefs 兜底。 */
const noteLinksOf   = n => (n && Array.isArray(n.links)) ? n.links : [];
function detachTodoRefs(tid){
  S.notes.forEach(n => { const links = noteLinksOf(n); const i = links.indexOf(tid); if (i >= 0) links.splice(i, 1); });
}

/* 复制到系统剪贴板：优先 Clipboard API，失败回退临时 textarea + execCommand。
   只返回 Promise<boolean>（成功/失败），不负责 toast。
   在无 navigator / 无 document.body 的环境（如 smoke-test 桩）不抛异常，直接返回 false。 */
function legacyCopy(text){
  try {
    const doc = globalThis.document;
    if (!doc || !doc.body || typeof doc.execCommand !== 'function') return false;
    const ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly','');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    doc.body.appendChild(ta);
    ta.select();
    const ok = doc.execCommand('copy');
    doc.body.removeChild(ta);
    return !!ok;
  } catch(e){ return false; }
}
function copyText(text){
  try {
    const nav = globalThis.navigator;
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function')
      return Promise.resolve(nav.clipboard.writeText(text)).then(()=>true, ()=>legacyCopy(text));
  } catch(e){}
  return Promise.resolve(legacyCopy(text));
}
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v === null ? d : v; } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, v); return true; } catch(e){ return false; } }
};
function toast(msg, icon){
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = (icon ? `<span style="width:15px;height:15px;display:block;color:var(--brand)">${IC.check('#E8402A')}</span>` : '') + `<span>${esc(msg)}</span>`;
  box.appendChild(el);
  setTimeout(()=>{ el.style.transition='opacity .3s,transform .3s'; el.style.opacity='0'; el.style.transform='translateY(8px)';
    setTimeout(()=>el.remove(), 300); }, 2200);
}

function addActivity(text, proj, icoName, color, kind){
  S.acts.unshift({text, proj, time:'刚刚', at:new Date().toISOString(), ico:icoName, c:color, kind});
  if (S.acts.length > 9) S.acts.pop();
}

/* ---------------- 总控台（首页）· 开发者活跃度热力图 ----------------
   底色只表达一件事：在线时长（单一蓝色系连续深浅，不掺红绿）；代码新增/删减只出现在悬停气泡里。
   数据全部来自后端真实聚合：控制台在线分钟数（页面每分钟心跳上报）
   + 全局代码目录 git 仓库的新增/删减行数，前端把 date→计数对齐到 13 周窗口。
   布局是纯 CSS Grid 自适应卡宽（1fr 列 + 格子用 ::before 撑正方形），不由 JS 算格子尺寸：
   格子宽度天然等于列宽，既不可能撑出横向滚动，月份刻度也与格子逐列对齐。
   后端断开时如实显示不可用，不假装空数据。 */
function heatWindowStart(){
  const dayMs = 24 * 60 * 60 * 1000;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = (today.getDay() + 6) % 7;                          /* 周一 = 0 */
  return new Date(today.getTime() - (dow + 364) * dayMs);        /* 52 周前的周一，共 53 列 */
}
const HEAT_CELLS = 371;          /* 后端窗口：53 周 = 371 天（对齐 /api/activity/daily?days=371） */
const HEAT_CARD_COLS = 13;       /* 卡片可视窗：末尾 13 周（一个季度），1 列 = 1 周、1 格 = 1 天 */
const HEAT_CARD_CELLS = HEAT_CARD_COLS * 7;
const heatDayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const heatDayLabel = d => `${d.getMonth() + 1}月${d.getDate()}日`;
const heatHours = minutes => `${Number((minutes / 60).toFixed(2))}小时`;
const heatLines = lines => lines >= 10000 ? `${Number((lines / 10000).toFixed(2))}万` : String(lines);
function buildHeatPayload(rows){
  const counts = new Map();
  const detail = {};
  (rows || []).forEach(item => {
    /* 底色只看在线时长：这里取 online（不再用后端的 count = online+adds+dels，
       否则「当天没开控制台但提交了几万行代码」会被涂成最深的蓝，与「底色代表在线时长」相悖） */
    counts.set(item.date, Number(item.online) || 0);
    detail[item.date] = { online: Number(item.online) || 0, adds: Number(item.adds) || 0, dels: Number(item.dels) || 0 };
  });
  const dayMs = 24 * 60 * 60 * 1000;
  const start = heatWindowStart();
  const list = Array.from({length: HEAT_CELLS}, (_, i) => counts.get(heatDayKey(new Date(start.getTime() + i * dayMs))) || 0);
  return { counts: list, detail };
}
function heatLevel(count){
  /* 对数档仅作不支持 color-mix 的旧 WebView 降级；正常底色使用连续强度。 */
  return count > 0 ? Math.min(4, Math.floor(Math.log10(count)) + 1) : 0;
}
/* ---- 三口径聚合：输入卡片窗内「每天」的原始序列，输出每一格该上的数 ----
   daily ：1 格 = 1 天，原样返回
   weekly：1 格 = 1 周，取所在整列（周一到周日，窗口首列必为周一）7 天之和
   total ：1 格 = 截至该日的累计，取窗口首日到该日的滚动和
   —— 在线 / 新增 / 删减三个序列走同一套聚合，保证底色与气泡永远同口径 */
function heatWeeklySeries(base){
  return base.map((_, i) => {
    const col = Math.floor(i / 7) * 7;
    return base.slice(col, col + 7).reduce((a, b) => a + b, 0);
  });
}
function heatCumulativeSeries(base){
  let acc = 0;
  return base.map(v => (acc += v));
}
function heatSeries(base, mode){
  if (mode === 'weekly') return heatWeeklySeries(base);
  if (mode === 'total') return heatCumulativeSeries(base);
  return base.slice();
}
async function refreshHeatCounts(){
  S.heatFetchedAt = Date.now();   /* 先记时间再拉：失败也节流，不逐帧重试 */
  try {
    const payload = await apiRequest('/activity/daily?days=371');
    const next = buildHeatPayload(payload.days);
    const changed = next.counts.join(',') !== (S.heatDays || []).join(',');
    S.heatDays = next.counts;
    S.heatDetail = next.detail;
    if (changed && S.page === 'home') render(true);
  } catch (_) { /* 拉取失败保持上一次真实数据；后端断开由全局 backendError 如实提示 */ }
}
function maybeRefreshHeat(){
  if (!S.backendReady || Date.now() - S.heatFetchedAt < 60000) return;
  void refreshHeatCounts();
}
/* 在线心跳：页面开着每 60 秒静默上报一次，切回可见时补一发；无任何界面呈现 */
let heatHeartbeatTimer = null;
function pushHeartbeat(){
  if (!S.backendReady || (typeof document !== 'undefined' && document.hidden)) return;
  apiRequest('/activity/heartbeat', { method: 'POST' }).catch(() => {});
}
function startHeartbeat(){
  if (typeof document === 'undefined' || heatHeartbeatTimer) return;
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pushHeartbeat(); });
  heatHeartbeatTimer = setInterval(pushHeartbeat, 60000);
}
function dashboardHeatmapHTML(counts){
  const dayMs = 24 * 60 * 60 * 1000;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (!S.backendReady) return `<div class="heat-wrap"><div class="heat-empty">后端未连接 · 活跃度暂不可用</div></div>`;
  const mode = S.heatMode || 'daily';
  const full = Array.isArray(counts) && counts.length === HEAT_CELLS ? counts : new Array(HEAT_CELLS).fill(0);
  /* 卡片窗取全窗末尾 13 周；窗口首列必为周一 —— 列与「周」严格一一对应 */
  const cardStart = new Date(heatWindowStart().getTime() + (HEAT_CELLS - HEAT_CARD_CELLS) * dayMs);
  const records = heatCardRecords(full.slice(HEAT_CELLS - HEAT_CARD_CELLS), cardStart);
  /* 三口径同时作用在「在线 / 新增 / 删减」三路序列上，底色只用 online 那一路 */
  const series = {
    online: heatSeries(records.map(r => r.online), mode),
    adds: heatSeries(records.map(r => r.adds), mode),
    dels: heatSeries(records.map(r => r.dels), mode)
  };
  /* 每种口径独立按可见的已发生日期归一化：最长时长最深，0 分钟保持灰色。
     连续混色避免 100–999 分钟全部挤在同一档，代码行数不参与颜色计算。 */
  const maxOnline = Math.max(1, ...series.online.filter((_, i) => records[i].day <= today));
  const todayIndex = HEAT_CARD_CELLS - 7 + (today.getDay() + 6) % 7;   /* 今天落在末列 */
  const cells = records.map((rec, i) => {
    /* 未来格：浅灰、不可交互、不生成气泡 —— 从结构上杜绝出现未来日期 */
    if (rec.day > today) return `<span class="heat-cell future" aria-hidden="true"></span>`;
    const label = `${heatDayLabel(rec.day)} · 在线${heatHours(series.online[i])} · +${heatLines(series.adds[i])} / -${heatLines(series.dels[i])}`;
    const color = series.online[i] > 0 ? ` style="--heat-strength:${100 * series.online[i] / maxOnline}%"` : '';
    return `<span class="heat-cell h${heatLevel(series.online[i])}${i === todayIndex ? ' today' : ''}"${color} aria-label="${label}">${heatTipHTML(rec, i, mode, series)}</span>`;
  }).join('');
  /* 月份刻度：只在月份切换处打标，与格子共用同一套列模板（天然逐列对齐）。两道约束——
     ①「残月」不打标：13 周窗的左端常是个只剩 1 列的月底，给它打标会把紧随的整月挤掉
       （实测出现「6月 8月 9月」独缺 7月）；②两个标至少隔 3 列，否则窄窗下会糊成「3月4月」。
     另外刻度串必须 join('')：直接拼数组会走 Array.join(',') 往每两个格子间塞一个逗号。 */
  const colMonths = Array.from({length: HEAT_CARD_COLS}, (_, col) => new Date(cardStart.getTime() + col * 7 * dayMs).getMonth());
  const runs = [];
  colMonths.forEach((m, col) => {
    const last = runs[runs.length - 1];
    if (last && last.m === m) last.len++;
    else runs.push({ m, col, len: 1 });
  });
  const marks = new Set();
  let prevMark = -99;
  runs.forEach(run => {
    if (run.len >= 2 && run.col - prevMark >= 3) { marks.add(run.col); prevMark = run.col; }
  });
  const months = colMonths.map((m, col) => marks.has(col) ? `<span>${m + 1}月</span>` : '<span></span>').join('');
  return `<div class="heat-wrap" role="img" aria-label="近三个月活跃度按日统计：底色为在线时长，悬停看代码新增删减行数">
    <div class="heat-body">
      <div class="heat-grid">${cells}</div>
      <div class="heat-months" aria-hidden="true">${months}</div>
    </div>
  </div>`;
}
function heatCardRecords(base, start){
  /* 卡片窗内每一天的原始三元组：底色吃 online，气泡里的代码增删吃 adds / dels */
  const dayMs = 24 * 60 * 60 * 1000;
  const detail = S.heatDetail || {};
  return base.map((online, i) => {
    const day = new Date(start.getTime() + i * dayMs);
    const d = detail[heatDayKey(day)] || {};
    return { day, online: Number(online) || 0, adds: Number(d.adds) || 0, dels: Number(d.dels) || 0 };
  });
}
function heatTipHTML(rec, i, mode, series){
  /* 第一行：日期 · 在线时长；第二行：+ 新增 / - 删减（绿 / 红）。只给真实发生过的日期生成气泡。 */
  let head;
  if (mode === 'weekly'){
    const dayMs = 24 * 60 * 60 * 1000;
    const from = new Date(rec.day.getTime() - (i % 7) * dayMs);
    const to = new Date(from.getTime() + 6 * dayMs);
    head = `${heatDayLabel(from)}–${heatDayLabel(to)} · 在线${heatHours(series.online[i])}`;
  } else if (mode === 'total'){
    head = `截至${heatDayLabel(rec.day)} · 累计在线${heatHours(series.online[i])}`;
  } else {
    head = `${heatDayLabel(rec.day)} · 在线${heatHours(series.online[i])}`;
  }
  return `<span class="heat-tip" role="tooltip"><span class="heat-tip-l1">${head}</span>`
    + `<span class="heat-tip-l2"><span class="heat-add">+${heatLines(series.adds[i])}</span>`
    + `<span class="heat-tip-sep">/</span><span class="heat-del">-${heatLines(series.dels[i])}</span></span></span>`;
}
function heatTabHTML(key){
  const on = (S.heatMode || 'daily') === key;
  return `<button class="heat-tab${on ? ' on' : ''}" data-act="heatMode" data-v="${key}" aria-pressed="${on}">${key === 'daily' ? '每日' : key === 'weekly' ? '每周' : '累计'}</button>`;
}
function viewHome(){
  maybeRefreshHeat();
  const acts = S.acts;
  const cur = DATA.projects.find(p=>p.id===S.proj) || DATA.projects[0];
  /* 兜底：总控台的当前项目信息与项目切换全部挂在「当前项目」上，一个项目都没有时不能取 cur.st。
     正常路径已被「至少保留一个项目」挡住，这里是第二道防线（外加自定义 URL 直接进来）。 */
  if (!cur) return `
  <div class="page-head"><div><h1>总控台</h1><p>还没有项目</p></div></div>
  <section class="card">
    <div class="empty">${IC.plus('currentColor')}<span>还没有项目，先新建一个再回到总控台</span>
      <button class="btn btn-primary btn-sm" data-act="newProject">${IC.plus('#fff')}新建项目</button></div>
  </section>`;

  const openTasks = S.todos.plan.filter(task => !task.done).length;
  const activeProjects = DATA.projects.filter(project => project.st !== '已暂停').length;
  const enabledModules = DATA.projects.reduce((sum, project) => sum + project.steps.filter(step => step.on).length, 0);
  const overviewCard = `
  <section class="card dashboard-overview">
    <div class="dashboard-overview-main">
      <div class="hero-meta"><span class="dashboard-kicker">当前项目</span><span class="chip ${projStCls(cur.st)}"><span class="dot" style="background:${projStColor(cur.st)}"></span>${esc(cur.st)}</span><span class="chip soft">更新于 ${esc(cur.updated)}</span></div>
      <div><h2>${esc(cur.name)}</h2><p class="dashboard-desc">${esc(cur.desc)}</p></div>
      <div class="dashboard-overview-foot"><div class="dashboard-actions"><button class="btn btn-primary" data-act="openWf" data-id="${cur.id}">${IC.chevR('#fff')}进入项目</button><button class="btn btn-ghost btn-sm" data-act="focusProj" data-id="${cur.id}">切换当前项目</button></div></div>
    </div>
    <div class="dashboard-kpis" aria-label="项目概览数据">
      <div><span>活跃项目</span><strong>${activeProjects}</strong><small>共 ${DATA.projects.length} 个</small></div>
      <div><span>待处理</span><strong>${openTasks}</strong></div>
      <div><span>启用模块</span><strong>${enabledModules}</strong></div>
      <div><span>活动记录</span><strong>${acts.length}</strong></div>
    </div>
  </section>`;
  const heatCard = `
  <section class="card dashboard-heat">
    <div class="card-head"><span class="ricon" style="color:var(--dash-heat-4)">${IC.grid('var(--dash-heat-4)')}</span><div class="card-title">活跃度</div><div class="right heat-tabs">${heatTabHTML('daily')}${heatTabHTML('weekly')}${heatTabHTML('total')}</div></div>
    ${dashboardHeatmapHTML(S.heatDays)}
  </section>`;
  const projectsCard = `
  <section class="card dashboard-projects">
    <div class="card-head"><span class="ricon" style="color:var(--brand)">${IC.grid('var(--brand)')}</span><div class="card-title">项目总览</div><div class="right"><button class="link" data-act="goPage" data-v="projects">管理项目</button></div></div>
    <div class="dashboard-project-list">${DATA.projects.map(project => `<button class="dashboard-project-row ${project.id===cur.id?'on':''}" data-act="enterProj" data-id="${project.id}"><span class="dot" style="background:${projStColor(project.st)}"></span><span class="dashboard-project-name">${esc(project.name)}<small>${project.steps.filter(step => step.on).length} 个模块 · ${project.runs} 次运行</small></span><span class="dashboard-project-go">${IC.chevR('currentColor')}</span></button>`).join('')}</div>
  </section>`;
  const activityCard = `
  <section class="card dashboard-activity">
    <div class="card-head"><span class="ricon" style="color:var(--teal)">${IC.clock('var(--teal)')}</span><div class="card-title">最近活动</div><div class="right"><button class="link" data-act="allActs">全部记录</button></div></div>
    <div class="dashboard-activity-list">${acts.length ? acts.slice(0, 4).map(activity => `<div class="row"><span class="ricon-box" style="color:${activity.c}">${IC[activity.ico](activity.c)}</span><span class="r-title">${esc(activity.text)}<small>${esc(activity.proj)}</small></span><span class="r-time">${esc(activity.time)}</span></div>`).join('') : `<div class="empty">${IC.clock('currentColor')}<span>暂无活动记录</span></div>`}</div>
  </section>`;

  return `
    <div class="page-head">
      <div><h1>项目仪表盘</h1></div>
    </div>
    <div class="home-grid">
      ${overviewCard}
      ${heatCard}
      ${projectsCard}
      ${activityCard}
    </div>`;
}

/* ---------------- 应用页 ---------------- */
const byUse = arr => arr.slice().sort((a,b) => b.use - a.use);
const byRecent = arr => arr.slice().sort((a,b) => (b.lastTs || 0) - (a.lastTs || 0));   // 最后打开时刻降序，从未启动(0)沉底

/* ---------------- 应用页 ---------------- */
/* 模糊匹配：子串命中，或按字符顺序命中（容忍漏字/打错一两个字） */
function fuzzyMatch(name, q){
  if (!q) return true;
  const n = String(name).toLowerCase();
  if (n.includes(q)) return true;
  let i = 0;
  for (const ch of n){ if (ch === q[i]) i++; }
  return i >= q.length;
}
/* 首字母归类：A-Z 直接取首字母；数字 / 符号 / 非拉丁字符（中文等）统一进 # 分组 */
function alphaOf(name){
  const ch = String(name == null ? '' : name).trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(ch) ? ch : '#';
}
const ALPHA_ALL = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];
/* 分组：只取有内容的分组——A-Z 升序在前、# 恒排最后；组内按名称升序（中文走 zh-Hans-CN 排序） */
function groupByAlpha(list){
  const map = new Map();
  (list || []).forEach(a => {
    const k = alphaOf(a.name);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(a);
  });
  return ALPHA_ALL.filter(k => map.has(k)).map(k => ({
    k,
    items: map.get(k).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hans-CN'))
  }));
}
/* 定位：快速找到并启动本机应用。常用置顶 1 次点击启动；统计类信息（次数/频率条）不做展示 */
function viewApps(){
  /* 标签不写死：除「全部」外，从应用数据动态派生——自定义标签添加后自动出现在筛选条 */
  const cats = ['全部', ...new Set(S.apps.map(a => a.cat).filter(Boolean))];
  if (S.appCat !== '全部' && !cats.includes(S.appCat)) S.appCat = '全部';
  /* 「常用优先」开关：开启后列表只显示置顶为常用的应用（严格不混入未置顶），关闭显示全部；内部均按使用次数降序 */
  const pool = S.favOnly ? S.apps.filter(a => a.st === '常用') : S.apps;
  const all = byUse(pool);
  /* 上方板块：最近打开的应用——严格按最后打开时刻倒序取前 6，与置顶/全部应用列表互不干扰 */
  const fav = byRecent(S.apps).slice(0, 6);
  const q = (S.appQuery||'').trim().toLowerCase();
  const base = all.filter(a => S.appCat === '全部' || a.cat === S.appCat);
  const searching = q.length > 0;
  /* 模糊搜索同时匹配应用名称与标签 */
  const list = searching ? base.filter(a => fuzzyMatch(a.name, q) || fuzzyMatch(a.cat || '', q)) : base;
  const isGrid = S.appView === 'grid';
  /* A-Z 分组：列表视图默认即按名称首字母分组（不再折叠「展开其余 N 个」）；网格视图保持平铺 */
  const groups = groupByAlpha(list);
  const hasAlpha = k => groups.some(g => g.k === k);
  const curAlpha = hasAlpha(S.appAlpha) ? S.appAlpha : (groups[0] ? groups[0].k : '');
  /* 运行徽章列：外层占位 span 始终渲染，保证每行 5 个子元素与 5 条轨道一一对应——
     否则无徽章行 grid 自动放置前移一格，时间/操作组错位 */
  const runBadge = a => `<span class="ar-run">${a.run ? '<span class="badge b-green"><span class="dot" style="background:var(--green)"></span>运行中</span>' : ''}</span>`;
  /* 网格 tile（应用页）：与列表行同一套启动规则——tile 整体不再触发启动，
     右上角浮出「启动 / 快捷操作」两个独立角标按钮（hover 或键盘聚焦时可见） */
  const tile = a => `
    <div class="app-tile ${a.run?'is-run':''}" data-id="${a.id}" title="${esc(a.name)}">
      <span class="ico">${appIconHTML(a.icon)}</span>
      <span>${esc(a.name)}</span>
      <span class="tile-acts">
        <button class="tile-btn tile-launch" data-act="launch" data-id="${a.id}" title="启动 ${esc(a.name)}" aria-label="启动 ${esc(a.name)}">${IC.play('currentColor')}</button>
        <button class="tile-btn" data-act="appMenu" data-id="${a.id}" title="快捷操作" aria-label="快捷操作">···</button>
      </span>
    </div>`;
  /* 行卡片（列表视图）：每行一张独立卡片，高度由 CSS 令牌固定，便于按「一屏完整行数」锁定容器高度。
     注意：行本身**不再**带 data-act="launch"——模块整体点击不启动，只有行内「启动」按钮触发启动 */
  const rowHTML = a => `
            <div class="app-row" data-id="${a.id}" title="${esc(a.name)}">
              <span class="li-ico">${appIconHTML(a.icon)}</span>
              <span class="ar-name">${esc(a.name)}<span class="badge b-slate ar-tag">${esc(a.cat)}</span>${a.st==='常用' ? '<span class="badge b-brand">常用</span>' : ''}</span>
              ${runBadge(a)}
              <span class="ar-last">${esc(a.last)}</span>
              <span class="ar-ops">
                <button class="btn btn-ghost btn-sm ar-launch" data-act="launch" data-id="${a.id}" title="启动 ${esc(a.name)}">${IC.play('var(--brand)')}启动</button>
                <button class="icon-mini pin ${a.st==='常用'?'pin-on':''}" data-act="toggleAppPin" data-id="${a.id}"
                  title="${a.st==='常用'?'取消置顶':'置顶为常用'}" aria-label="${a.st==='常用'?'取消置顶':'置顶为常用'}">${IC.pin(a.st==='常用' ? 'var(--brand)' : 'var(--ink-4)')}</button>
                <button class="icon-mini" data-act="editTag" data-id="${a.id}" title="编辑标签" aria-label="编辑标签">${IC.tag('var(--ink-3)')}</button>
                <button class="icon-mini" data-act="askRemove" data-id="${a.id}" title="从列表剔除" aria-label="从列表剔除">${IC.trash('var(--ink-3)')}</button>
              </span>
            </div>`;

  return `
  <div class="page-head">
    <div><h1>应用</h1></div>
    <div class="right">
      <div class="seg">
        <button class="${!isGrid?'on':''}" data-act="appView" data-v="list">列表</button>
        <button class="${isGrid?'on':''}" data-act="appView" data-v="grid">网格</button>
      </div>
      <button class="btn btn-primary btn-sm" data-act="addApp">${IC.plus('#fff')}添加应用</button>
    </div>
  </div>

  <div class="board-head">
    <span class="board-title">最近打开的应用</span>
  </div>
  <section class="fav-grid">
    ${fav.map(a => `
      <button class="fav-card" data-act="launch" data-id="${a.id}" title="启动 ${esc(a.name)}">
        <span class="fav-ico">${appIconHTML(a.icon)}</span>
        <span class="fav-body">
          <span class="fav-name">${esc(a.name)}</span>
          <span class="fav-meta">${esc(a.cat)} · 最近 ${esc(a.last)}</span>
        </span>
        ${a.run ? '<span class="badge b-green">运行中</span>' : ''}
      </button>`).join('')}
  </section>

  <div class="board-head" style="margin-top:2px;flex-wrap:wrap;row-gap:8px">
    <span class="board-title">全部应用</span>
    <span class="board-note">${searching
      ? `匹配 ${list.length} 个（关键词「${esc(S.appQuery.trim())}」）`
      : `${list.length} 个${S.appCat === '全部' ? '' : '（已筛选 ' + S.appCat + '）'}`}</span>
    <div style="margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap;row-gap:8px">
      <div class="field sm" style="flex:1 1 150px;min-width:140px;max-width:220px">${IC.search('var(--ink-3)')}<input id="appSearch" placeholder="模糊搜索应用" value="${esc(S.appQuery||'')}"></div>
      <div class="tabs">${cats.map(c => `<button class="tab ${S.appCat===c?'on':''}" data-act="appCat" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    </div>
  </div>
  <section class="card apps-panel${isGrid ? ' is-grid' : ''}">
    ${isGrid
      ? `<div class="apps wide" id="appGrid">${list.map(tile).join('')}</div>`
      : `<div class="apps-panel-body">
          <div class="app-scroll" id="appScroll" tabindex="0" role="listbox" aria-label="全部应用（可拖动 / 滚轮 / 方向键滚动）">
            <div class="app-scroll-inner" id="appScrollInner">
              ${groups.map(g => `
                <div class="app-group" data-k="${g.k}">
                  <div class="app-group-h"><span class="ag-k">${g.k}</span><span class="ag-n">${g.items.length}</span></div>
                  ${g.items.map(rowHTML).join('')}
                </div>`).join('')}
            </div>
          </div>
          <div class="app-scrollbar" id="appScrollBar" aria-hidden="true"><i></i></div>
          <div class="alpha-bar" id="alphaBar" aria-label="按首字母快速定位">
            <button class="alpha-pin${S.favOnly ? ' on' : ''}" data-act="favOnly" aria-pressed="${S.favOnly ? 'true' : 'false'}"
              title="${S.favOnly ? '显示全部应用' : '只看置顶为常用的应用'}" aria-label="常用优先（只看置顶）">${IC.pin(S.favOnly ? '#fff' : 'var(--ink-4)')}</button>
            ${groups.map(g => `<button class="alpha-item${g.k === curAlpha ? ' on' : ''}" data-act="alphaJump" data-v="${g.k}" title="跳到 ${g.k} 分组（${g.items.length} 个）">${g.k}</button>`).join('')}
          </div>
        </div>`}
    ${!list.length ? `<div class="empty">${IC.grid('currentColor')}<span>${searching ? '没有匹配的应用，换个关键词试试' : '这个分类下还没有应用'}</span></div>` : ''}
  </section>
  ${S.confirmRemove ? (() => {
    const r = S.apps.find(x=>x.id===S.confirmRemove);
    return r ? `
  <div class="modal-mask" data-act="cancelRemove"></div>
  <div class="modal" role="dialog" aria-modal="true">
    <div class="m-title">剔除「${esc(r.name)}」？</div>
    <p class="m-desc">预演：将从应用列表移除「${esc(r.name)}」（标签「${esc(r.cat)}」），不会删除其安装目录与本机文件。</p>
    <div class="m-acts">
      <button class="btn btn-ghost btn-sm" data-act="cancelRemove">取消</button>
      <button class="btn btn-sm m-danger" data-act="confirmRemove" data-id="${r.id}">确认剔除</button>
    </div>
  </div>` : '';
  })() : ''}`;
}

/* ---------------- 应用列表：一屏高度锁定 + 字母索引条交互 ---------------- */
/* 行卡片步长（卡片高 + 行距），与 styles.css 的 --app-row-h / --app-row-gap 保持一致 */
const APP_ROW_H = 46, APP_ROW_GAP = 6, APP_ROW_STEP = APP_ROW_H + APP_ROW_GAP;
/* 一屏完整行数：把「全部应用」容器高度锁到「最后一个能完整放下的元素底边」——
   直接读真实布局位置（offsetTop/offsetHeight），不靠累加推算，首屏绝不出现半截卡片；
   超出的部分走容器内部滚动。拿不到真实布局（Node 测试桩）或空间不足时保持 CSS 自然拉伸。 */
function fitAppList(){
  const sc = $('#appScroll');
  if (!sc || !sc.querySelectorAll) return 0;
  if (sc.style) sc.style.height = '';   // 先释放上次的锁定值，取回 flex 给出的真实可用高度（窗口变化才能重算）
  const avail = sc.clientHeight || 0;
  if (avail < APP_ROW_STEP * 2) return 0;
  let last = 0;
  for (const el of sc.querySelectorAll('.app-group-h, .app-row')){
    const bottom = (el.offsetTop || 0) + (el.offsetHeight || 0);
    if (bottom <= avail) last = Math.max(last, bottom);
    else break;
  }
  const full = sc.scrollHeight || 0;
  if (last > 0 && full > avail + 1 && sc.style) sc.style.height = last + 'px';
  return last;
}
/* =========================================================
   物理惯性滚动（应用列表专用）
   ---------------------------------------------------------
   为什么不用原生滚动：scrollTop 会被浏览器 clamp 到 [0, max]，无法表达越界位移，
   做不出边缘回弹；原生滚动条/吸附行为也不可控。
   方案：容器 overflow:hidden，内容层用 transform 位移，位置完全由本模块物理驱动：
   拖动 1:1 跟手 → 松手继承末速度（×增益）→ 指数衰减滑行 → 低速 spring 收尾 → 边缘 spring 回弹。
   性能：单次 rAF 只写一次 transform（合成层，不触发布局）；滚动期间禁用玻璃模糊。
   调参只改 INERTIA 这一处。
   ========================================================= */
const INERTIA = {
  launchGain: 1.02,                 // 松手初速度增益 v0 = 末速度 × 1.0~1.1（取小值更稳）
  decayK: 1.35,                     // 指数衰减系数 k（0.8~1.5 /s，取大值＝减速更快、滑行更短）
  maxLaunch: 1800,                  // 初速度上限 px/s：手速再快也不"甩飞"
  wheelSpin: 1.2,                   // 滚轮位移折算初速度的系数（原 14 → 一格滚轮要滑 1200px 的元凶）
  minSpeed: 8,                      // 低速收尾阈值 px/s（5~10），低于它交给 spring 平滑停住
  maxFlungMs: 4000,                 // 单次惯性最长滑行时间（2~4s 内缓慢停止）
  spring: { stiffness: 220, damping: 26 },  // 边缘回弹 / 低速收尾（180~260、22~30）
  dragSlack: 0.42,                  // 越界拖动阻尼（界内严格 1:1，越界才有橡皮筋手感）
  velWindow: 80,                    // 末速度采样窗口（ms）
  idleBlurDelay: 140,               // 滚动结束后恢复玻璃模糊的延迟（ms）
};
const scrollCtl = new WeakMap();    // 滚动容器 → 控制器（避免重复初始化）
/* 环境兜底：非浏览器（Node 测试桩）没有 rAF/performance 时退化为 setTimeout + Date.now */
const _now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
const _raf = (fn) => (typeof requestAnimationFrame === 'function') ? requestAnimationFrame(fn) : setTimeout(() => fn(_now()), 16);
const _caf = (id) => { if (!id) return; if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id); else clearTimeout(id); };
function appScrollDragBlocked(target){
  return !!(target && target.closest && target.closest('button,a,input,textarea,select,[data-act]'));
}

function initInertialScroll(){
  const sc = $('#appScroll'), track = $('#appScrollInner'), ind = $('#appScrollBar');
  if (!sc || !track || !sc.addEventListener || !track.style || scrollCtl.has(sc)) return null;

  const st = { y:0, v:0, mode:'idle', raf:0, last:0, maxY:0, minY:0, samples:[], blurTimer:0,
               springTarget:null, dragStartY:0, dragStartPos:0, flungAt:0, inited:false };
  const measure = () => {
    const box = sc.clientHeight || 0, full = track.scrollHeight || track.offsetHeight || 0;
    st.maxY = 0; st.minY = Math.min(0, box - full);
  };
  const clampY = (v) => Math.max(st.minY, Math.min(st.maxY, v));
  const paint = () => {
    track.style.transform = 'translate3d(0,' + st.y.toFixed(2) + 'px,0)';
    const bar = ind && ind.firstElementChild;
    if (ind) {
      const box = sc.clientHeight || 1, full = Math.max(1, track.scrollHeight || 0);
      const h = Math.max(28, Math.round(box * box / full));
      const range = Math.max(0, full - box);
      const p = range ? (-st.y) / range : 0;
      if (bar){
        bar.style.height = h + 'px';
        bar.style.transform = 'translate3d(0,' + Math.round(p * (box - h)) + 'px,0)';
      }
      ind.style.opacity = (full > box + 2 && st.y >= st.minY - 1 && st.y <= 1) ? '1' : '0';
    }
  };
  const markScrolling = () => {
    sc.classList.add('is-scrolling');
    if (st.blurTimer) clearTimeout(st.blurTimer);
    st.blurTimer = setTimeout(() => { sc.classList.remove('is-scrolling'); appSpy(); }, INERTIA.idleBlurDelay);
  };
  const stop = () => { if (st.raf) _caf(st.raf); st.raf = 0; };

  /* spring 积分（半隐式欧拉 + 固定子步，保证不同帧率下稳定） */
  const stepSpring = (target, dt) => {
    const { stiffness:k, damping:c } = INERTIA.spring;
    let n = Math.max(1, Math.ceil(dt / (1/240)));
    const h = dt / n;
    for (let i = 0; i < n; i++){
      const a = -k * (st.y - target) - c * st.v;
      st.v += a * h; st.y += st.v * h;
    }
  };
  const settled = (target) => Math.abs(st.y - target) < 0.6 && Math.abs(st.v) < 12;

  const loop = (now) => {
    const dt = Math.min(0.064, Math.max(0.001, (now - st.last) / 1000));  // 掉帧保护：单帧最多按 64ms 积分
    st.last = now;
    if (st.mode === 'fling'){
      st.v *= Math.exp(-INERTIA.decayK * dt);      // 指数衰减
      st.y += st.v * dt;
      if (st.y > st.maxY || st.y < st.minY){       // 越界 → 立即转为边缘 spring
        st.y = Math.max(st.minY - 90, Math.min(st.maxY + 90, st.y));
        st.mode = 'spring';
      } else if (Math.abs(st.v) < INERTIA.minSpeed || now - st.flungAt > INERTIA.maxFlungMs){
        st.mode = 'spring';                        // 低速收尾：不硬停，交给 spring 平滑归位
      }
    } else if (st.mode === 'spring'){
      const target = (typeof st.springTarget === 'number') ? clampY(st.springTarget) : clampY(st.y);
      stepSpring(target, dt);
      if (settled(target)){ st.y = target; st.v = 0; st.springTarget = null; st.mode = 'idle'; }
    } else { stop(); paint(); return; }
    paint();
    if (now - (st.spyAt || 0) > 120){ st.spyAt = now; appSpy(); }   // 索引条高亮节流刷新（~8fps，避免每帧读布局）
    if (st.mode === 'idle'){ stop(); return; }
    st.raf = _raf(loop);
  };
  const start = () => { if (!st.raf){ st.last = _now(); st.raf = _raf(loop); } };

  /* 拖动：界内严格 1:1 跟手（无平滑、无插值）；越界才有橡皮筋阻尼 */
  const onDown = (e) => {
    if (appScrollDragBlocked(e.target)) return;
    measure(); stop(); markScrolling();
    st.mode = 'drag'; st.dragStartY = e.clientY; st.dragStartPos = st.y;
    st.v = 0; st.samples = [{ t: _now(), y: e.clientY }];
    if (sc.setPointerCapture && e.pointerId != null){ try { sc.setPointerCapture(e.pointerId); } catch (err){} }
  };
  const onMove = (e) => {
    if (st.mode !== 'drag') return;
    const dy = e.clientY - st.dragStartY;
    let next = st.dragStartPos + dy;
    if (next > st.maxY) next = st.maxY + (next - st.maxY) * INERTIA.dragSlack;
    if (next < st.minY) next = st.minY + (next - st.minY) * INERTIA.dragSlack;
    st.y = next; paint();
    const t = _now();
    st.samples.push({ t, y: e.clientY });
    while (st.samples.length > 2 && t - st.samples[0].t > INERTIA.velWindow) st.samples.shift();
    if (e.cancelable) e.preventDefault();
  };
  const onUp = () => {
    if (st.mode !== 'drag') return;
    const s = st.samples, n = s.length;
    /* 符号约定：st.y 是内容层的 translateY（负值＝内容上移＝看到下方内容）。
       手指上滑 clientY 减小 → st.y 必须同步减小，故速度直接取 ΔclientY/Δt，不加负号。
       （原来多了一个负号，导致拖动方向正确、松手惯性却反向。） */
    let v = 0;
    if (n >= 2){
      const dt = (s[n-1].t - s[0].t) / 1000;
      if (dt > 0.001) v = (s[n-1].y - s[0].y) / dt;
    }
    st.mode = 'idle'; st.v = 0;
    if (Math.abs(v) >= INERTIA.minSpeed * 6){
      st.v = Math.max(-INERTIA.maxLaunch, Math.min(INERTIA.maxLaunch, v * INERTIA.launchGain));  // 继承末速度并限幅
      st.mode = 'fling'; st.flungAt = _now();
      start();
    } else {
      st.mode = 'spring'; start();                      // 拖到一半松手：spring 归位
    }
  };

  /* 滚轮 / 触控板：并入同一套物理（连续位移 + 轻微惯性），避免原生与自管两套物理打架。
     位移 1:1 跟手；惯性只取很小系数（wheelSpin），否则一格滚轮会滑出大半屏、看着眼花。 */
  const onWheel = (e) => {
    if (e.cancelable) e.preventDefault();
    measure(); markScrolling();
    let d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;      // 行模式折算像素
    d = Math.max(-240, Math.min(240, d));                      // 单次事件限幅：触控板甩动不会一帧跳很远
    st.mode = 'idle'; stop();
    st.y = st.y - d;
    if (st.y > st.maxY) st.y = st.maxY + (st.y - st.maxY) * INERTIA.dragSlack;
    if (st.y < st.minY) st.y = st.minY + (st.y - st.minY) * INERTIA.dragSlack;
    paint();
    st.v = Math.max(-INERTIA.maxLaunch, Math.min(INERTIA.maxLaunch, -d * INERTIA.wheelSpin));
    st.flungAt = _now();
    st.mode = Math.abs(st.v) > INERTIA.minSpeed ? 'fling' : 'spring';
    start();
  };

  /* 键盘：容器可聚焦，方向键 / 翻页 / Home / End 走 spring 定位 */
  const page = () => Math.max(80, (sc.clientHeight || 400) - 60);
  const flyTo = (target) => {
    measure(); stop(); markScrolling();
    st.springTarget = clampY(target);
    st.mode = 'spring'; start();
  };
  const onKey = (e) => {
    const k = e.key; let handled = true;
    if (k === 'ArrowDown') flyTo(st.y - 48);
    else if (k === 'ArrowUp') flyTo(st.y + 48);
    else if (k === 'PageDown' || k === ' ') flyTo(st.y - page());
    else if (k === 'PageUp') flyTo(st.y + page());
    else if (k === 'Home') flyTo(0);
    else if (k === 'End') flyTo(st.minY);
    else handled = false;
    if (handled && e.cancelable) e.preventDefault();
  };

  sc.addEventListener('pointerdown', onDown);
  sc.addEventListener('pointermove', onMove);
  sc.addEventListener('pointerup', onUp);
  sc.addEventListener('pointercancel', onUp);
  sc.addEventListener('wheel', onWheel, { passive:false });
  sc.addEventListener('keydown', onKey);

  const ctl = {
    sc, track, st,
    refresh(){ measure(); st.y = clampY(st.y); paint(); },
    flyTo,
    get pos(){ return st.y; },
  };
  scrollCtl.set(sc, ctl);
  st.inited = true;
  measure(); paint();
  return ctl;
}

/* 索引条高亮同步：直接改类名，不重渲染（滚动时零抖动） */
function syncAlphaBar(k){
  if (k) S.appAlpha = k;
  $$('#alphaBar [data-act="alphaJump"]').forEach(b => b.classList.toggle('on', b.dataset.v === k));
}
/* 点击字母：spring 动画定位到该分组（iOS 索引条式），列表内容不变 */
function alphaJump(k){
  const sc = $('#appScroll');
  if (!sc) return;
  const el = sc.querySelector ? sc.querySelector('.app-group[data-k="' + k + '"]') : null;
  const ctl = scrollCtl.get(sc);
  if (el && typeof el.offsetTop === 'number'){
    if (ctl && ctl.flyTo) ctl.flyTo(-Math.max(0, el.offsetTop - 4));   // 自管物理：transform 位移为负
    else if (sc.scrollTo) sc.scrollTo({ top: Math.max(0, el.offsetTop - 4), behavior:'smooth' });
  }
  syncAlphaBar(k);
}
/* 滚动侦测：自管位移（transform y，负值向上）折算成等效 scrollTop 后高亮当前分组 */
function appSpy(){
  const sc = $('#appScroll');
  if (!sc || !sc.querySelectorAll) return;
  const groups = Array.from(sc.querySelectorAll('.app-group'));
  if (!groups.length) return;
  const ctl = scrollCtl.get(sc);
  const top = (ctl ? -ctl.pos : (sc.scrollTop || 0)) + 8;
  let cur = groups[0].dataset.k;
  groups.forEach(g => { if ((g.offsetTop || 0) <= top) cur = g.dataset.k; });
  syncAlphaBar(cur);
}

/* 行内 ··· 快捷菜单（网格视图用）：启动/置顶/编辑标签/详情/剔除 */
function appPopMenu(btn, id){
  const a = S.apps.find(x=>x.id===id); if(!a || !btn) return;
  const r = btn.getBoundingClientRect();
  const html = `
    <div class="pop-h">${esc(a.name)}</div>
    <button class="pop-item" data-act="launch" data-id="${a.id}">${IC.play('var(--ink-2)')}<span>启动</span></button>
    <button class="pop-item" data-act="toggleAppPin" data-id="${a.id}">${IC.pin(a.st==='常用'?'var(--brand)':'var(--ink-2)')}<span>${a.st==='常用'?'取消置顶':'置顶为常用'}</span></button>
    <button class="pop-item" data-act="editTag" data-id="${a.id}">${IC.tag('var(--ink-2)')}<span>编辑标签</span></button>
    <div class="pop-div"></div>
    <button class="pop-item" data-act="appDetail" data-id="${a.id}">${IC.grid('var(--ink-2)')}<span>查看详情</span></button>
    <button class="pop-item" data-act="askRemove" data-id="${a.id}" style="color:var(--brand)">${IC.trash('var(--brand)')}<span>剔除…</span></button>`;
  openPop('appPop', r.right - 232, r.bottom, html);
  const pop = $('#appPop');
  const h = pop.getBoundingClientRect().height;
  if (r.bottom + h + 16 > window.innerHeight) pop.style.top = Math.max(12, r.top - h - 8) + 'px';
  return html;
}

/* 编辑标签浮层（列表行「标签」按钮）：点选现有标签即切换，或新建并应用 */
function tagPop(btn, id){
  const a = S.apps.find(x=>x.id===id); if(!a || !btn) return;
  const cats = [...new Set(S.apps.map(x => x.cat).filter(Boolean))];
  const r = btn.getBoundingClientRect();
  const html = `
    <div class="pop-h">编辑标签 · ${esc(a.name)}</div>
    ${cats.map(c => `
      <button class="pop-item" data-act="setCat" data-id="${a.id}" data-v="${esc(c)}">
        ${IC.tag(c===a.cat?'var(--brand)':'var(--ink-3)')}<span>${esc(c)}</span>
        ${c===a.cat?'<span style="width:15px;height:15px;margin-left:auto;display:block;color:var(--brand)">'+IC.check('#E8402A')+'</span>':'<span></span>'}
      </button>`).join('')}
    <div class="pop-div"></div>
    <div style="display:flex;gap:6px;padding:2px 2px 0">
      <input id="newTagInput" class="tag-input" placeholder="新标签名，如：写作">
      <button class="btn btn-ghost btn-sm" data-act="newCatFor" data-id="${a.id}">新建并应用</button>
    </div>`;
  openPop('tagPop', r.right - 232, r.bottom, html);
  const pop = $('#tagPop');
  const h = pop.getBoundingClientRect().height;
  if (r.bottom + h + 16 > window.innerHeight) pop.style.top = Math.max(12, r.top - h - 8) + 'px';
  const inp = $('#newTagInput');
  if (inp) inp.addEventListener('keydown', e => { if (e.key==='Enter'){ e.preventDefault(); newCatFor(id); } });
  return html;
}
function setCat(id, v){
  const a = S.apps.find(x=>x.id===id); if(!a || !v) return;
  const done = saved => { closePops(); render(true); toast(`已将 ${saved.name} 归入「${v}」`); };
  if (typeof fetch !== 'function'){ a.cat = v; done(a); return; }
  void updateBackendApp(a, {cat:v}).then(saved => {
    if (!saved) throw new Error('应用保存后无法恢复'); done(saved);
  }).catch(err => toast(err && err.message ? err.message : '应用标签保存失败'));
}
function newCatFor(id){
  const a = S.apps.find(x=>x.id===id); if(!a) return;
  const inp = $('#newTagInput');
  const v = inp ? inp.value.trim() : '';
  if (!v){ toast('先输入新标签名'); return; }
  setCat(id, v);
}
/* 剔除应用（二次确认弹窗在 viewApps 内渲染）：仅移出列表，不动本机文件 */
function removeFromList(id){
  const a = S.apps.find(x=>x.id===id); if(!a) return;
  const done = removed => {
    const index = S.apps.findIndex(item => item.id === removed.id);
    if (index >= 0) S.apps.splice(index, 1);
    if (S.confirmRemove === removed.id) S.confirmRemove = '';
    S.uninstallArm = ''; closeDrawer(); render(true); toast(`已剔除 ${removed.name}`);
    addActivity(`剔除了应用 ${removed.name}`, removed.cat, 'trash', C.amber, '应用');
  };
  if (typeof fetch !== 'function'){ done(a); return; }
  void deleteBackendApp(a).then(done).catch(err => toast(err && err.message ? err.message : '应用移除失败'));
}

/* 应用详情抽屉：主操作启动；固定/卸载收进次操作。卸载走预演 + 两步确认 */
function appDetail(id){
  const a = S.apps.find(x=>x.id===id); if(!a) return;
  openDrawer(`${dHead(a.name, a.cat + ' · 本机应用')}
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${a.run ? '<span class="badge b-green"><span class="dot" style="background:var(--green)"></span>运行中</span>' : '<span class="badge b-slate">未运行</span>'}
      <span class="badge b-slate">${esc(a.cat)}</span>
      <span class="badge b-slate">占用 ${esc(a.size)}</span>
      <span class="badge b-slate">最近 ${esc(a.last)}</span>
    </div>
    <div class="terminal" style="min-height:120px">
      <div class="t-line dim"># 已登记的本机应用</div>
      <div class="t-line">名称　${esc(a.name)}</div>
      <div class="t-line">分类　${esc(a.cat)}</div>
      <div class="t-line">状态　${a.run ? '运行中' : '未运行'}</div>
      <div class="t-line dim">启动入口由后端在每次运行前重新验证</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" data-act="launch" data-id="${a.id}">${IC.play('#fff')}启动</button>
      <button class="btn btn-ghost btn-sm" data-act="toggleAppPinDrawer" data-id="${a.id}">${a.st==='常用'?'取消常用':'固定为常用'}</button>
      ${S.uninstallArm === a.id
        ? `<button class="btn btn-sm" style="background:var(--brand);color:#fff" data-act="uninstallApp" data-id="${a.id}">再次点击确认卸载</button>`
        : `<button class="btn btn-ghost btn-sm" data-act="armUninstall" data-id="${a.id}">卸载…</button>`}
    </div>
    ${S.uninstallArm === a.id ? `<p style="margin:2px 0 0;font-size:11.5px;color:var(--ink-3)">预演：将从应用列表移除「${esc(a.name)}」，不影响其安装目录。</p>` : ''}`);
}
function toggleAppPin(id){
  const a = S.apps.find(x=>x.id===id); if(!a) return;
  const next = a.st==='常用' ? '' : '常用';
  const done = saved => { toast(saved.st==='常用' ? `已将 ${saved.name} 固定为常用` : `已取消 ${saved.name} 的常用`); render(true); };
  if (typeof fetch !== 'function'){ a.st = next; done(a); return; }
  void updateBackendApp(a, {st:next}).then(saved => {
    if (!saved) throw new Error('应用保存后无法恢复'); done(saved);
  }).catch(err => toast(err && err.message ? err.message : '常用状态保存失败'));
}
function uninstallApp(id){
  const a = S.apps.find(x=>x.id===id); if(!a) return;
  const done = removed => {
    const index = S.apps.findIndex(item => item.id === removed.id);
    if (index >= 0) S.apps.splice(index, 1);
    S.uninstallArm = ''; closeDrawer(); render(true); toast(`已从列表移除 ${removed.name}`);
  };
  if (typeof fetch !== 'function'){ done(a); return; }
  void deleteBackendApp(a).then(done).catch(err => toast(err && err.message ? err.message : '应用移除失败'));
}

/* ---------------- 模块页 ----------------
   页面 id 沿用 scripts（历史遗留路由，勿改）。「新增模块」当前提供内置网页模板：
   用户只填名称、网站地址和描述，后端保存为可被任意项目选择的网站模块。
   磁盘清单模块仍会显示，但不在这里改写其执行定义。 */
const MOD_TABS = [['all','全部'],['web','网页'],['folder','目录'],['script','脚本'],['cmd','命令']];
/* 模块唯一键 = 类型 + 入口。ref 里不允许出现「|」——拖拽载荷用「|」分隔类型与入口 */
const moduleKey = (type, ref) => type + '|' + ref;
const splitKey = k => { const i = k.indexOf('|'); return [k.slice(0, i), k.slice(i + 1)]; };
const findModule = (type, ref) => DATA.modules.find(m => m.type === type && m.ref === ref);
const modByName = k => (k ? findModule(...splitKey(k)) : null);

function moduleRowHTML(m){
  const meta = TYPE_META[m.type];
  return `
  <div class="row">
    <span class="ricon-box" style="color:${meta.color};background:${meta.bg}">${tIco(m.type)}</span>
    <div style="flex:1;min-width:0">
      <div class="r-title">${esc(m.name)}<span class="badge b-slate" style="margin-left:6px">${meta.name}</span>${
        m.st ? `<span class="badge ${m.st === '需确认' ? 'b-amber' : 'b-green'}" style="margin-left:4px">${esc(m.st)}</span>` : ''}</div>
      <div class="r-meta" style="font-family:Consolas,monospace">${esc(m.ref)}${m.arg ? ' ' + esc(m.arg) : ''}<span style="font-family:Inter,sans-serif;color:var(--ink-3)"> · ${esc(m.desc || '无描述')}</span></div>
    </div>
    <span class="badge b-slate">${m.manifestBacked ? '由项目清单管理' : '可供项目使用'}</span>
    ${m.manifestBacked ? '' : `<button class="btn btn-ghost btn-sm" data-act="editModule" data-t="${m.type}" data-id="${esc(m.ref)}">${IC.pen('var(--ink-2)')}编辑</button>`}
  </div>`;
}
function viewModules(){
  const q = (S.modQ || '').trim().toLowerCase();
  const list = DATA.modules.filter(m =>
    (S.modTab === 'all' || m.type === S.modTab) &&
    (!q || m.name.toLowerCase().includes(q) || m.ref.toLowerCase().includes(q)
        || String(m.desc || '').toLowerCase().includes(q)));
  return `
  <div class="page-head">
    <div><h1>模块</h1><p>${DATA.modules.length} 个执行模块 · 内置网页模板：名称 / 网站地址 / 描述</p></div>
    <div class="right">
      <button class="btn btn-primary btn-sm" data-act="newModule">${IC.plus('#fff')}新增模块</button>
    </div>
  </div>
  <section class="card">
    <div class="card-head">
      <div class="card-title">执行模块<small>共 ${DATA.modules.length} 个 · 当前显示 ${list.length} 个</small></div>
    </div>
    <div class="tabs">
      ${MOD_TABS.map(([k, n]) => `<button class="tab ${S.modTab === k ? 'on' : ''}" data-act="modTab" data-v="${k}">${n}</button>`).join('')}
    </div>
    <div class="field" style="min-width:0;height:32px">${IC.search('var(--ink-3)')}<input id="modSearch" placeholder="搜索模块名称 / 入口 / 描述" value="${esc(S.modQ || '')}"></div>
    <div class="list">
      ${list.map(moduleRowHTML).join('') || `<div class="empty">${IC.search('currentColor')}<span>没有匹配的执行模块</span></div>`}
    </div>
  </section>
  ${modDeleteModalHTML()}`;
}
/* 新增 / 编辑共用同一份网页模板表单。项目归属不在这里填写：模块创建后可被项目复用，
   实际绑定关系只保存在后端 project_modules。 */
function moduleFormHTML(o){
  return `<input id="${o.nameId}" class="drawer-input"${o.name != null ? ` value="${esc(o.name)}"` : ''} placeholder="模块名称">
    <input id="modEntry" class="drawer-input" value="${esc(o.entry || '')}" placeholder="网站地址，例如：https://example.com">
    <input id="modDesc" class="drawer-input" value="${esc(o.desc || '')}" placeholder="一句话描述这个网站模块（可选）">
    <div class="fld-err" id="modErr" role="alert" hidden></div>`;
}
function modShowErr(msg, fieldId){
  const box = $('#modErr');
  if (box){ box.textContent = msg || ''; box.hidden = !msg; }
  ['modName','modEntry','modDesc'].forEach(id => {
    const el = $('#' + id); if (!el || !el.setAttribute) return;
    if (msg && id === fieldId) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
  });
  const field = fieldId && $('#' + fieldId);
  if (msg && field && field.focus) field.focus();
}
const webModuleFromApi = row => ({
  id:row.id, ref:row.entry || row.id, type:row.type || 'script', name:row.name,
  desc:row.description || '', arg:row.args || '', manifestBacked:!!row.manifest_path,
  st:row.manifest_path ? '就绪' : ''
});
function validWebModuleUrl(value){
  try { const u = new URL(value); return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.host; }
  catch (_) { return false; }
}
/* 新增模块：从模块页进入；网页执行器是后端内置模板，不为每个网站复制脚本。 */
function newModule(){
  S._modKey = '';
  openModal(`${mHead('新增网站模块', '使用内置网页模板；保存后可在任意项目中添加')}
    ${moduleFormHTML({ nameId:'modName' })}
    ${mActs(`<button class="btn btn-primary btn-sm" data-act="saveModule">${IC.check('#fff')}保存</button>
      <button class="btn btn-ghost btn-sm" data-act="closeModal">取消</button>`)}`, { form:true });
  setTimeout(()=>{ const el = $('#modName'); if (el) el.focus(); }, 60);
}
/* 编辑模块：与新增共用 moduleFormHTML()，只多一个「删除」按钮（与任务弹窗同一套约定）。
   _modKey 记住**原始** 类型 + 入口，入口被改写时靠它定位原条目并级联更新运行流程里的引用。 */
function editModule(type, ref){
  const m = findModule(type, ref); if (!m) return;
  if (m.manifestBacked || m.type !== 'web'){ toast('由项目清单管理的模块请在所属仓库中维护'); return; }
  S._modKey = moduleKey(m.type, m.ref);
  openModal(`${mHead('编辑网站模块', '保存后，所有使用它的项目都会读取新地址')}
    ${moduleFormHTML({ nameId:'modName', name:m.name, desc:m.desc, entry:m.ref })}
    ${mActs(`<button class="btn btn-primary btn-sm" data-act="saveModule">${IC.check('#fff')}保存</button>
      <button class="btn btn-ghost btn-sm" data-act="modDeleteAsk" data-k="${esc(S._modKey)}">${IC.trash('var(--ink-2)')}删除</button>
      <button class="btn btn-ghost btn-sm" data-act="closeModal">取消</button>`)}`, { form:true });
}
/* 保存必须以后端成功为准；后端不可用时不写入本地假数据。 */
async function saveModule(){
  const val = id => { const el = $('#' + id); return el ? el.value.trim() : ''; };
  const name = val('modName'), entry = val('modEntry'), desc = val('modDesc');
  if (!name){ modShowErr('先给模块起个名称', 'modName'); return; }
  if (!validWebModuleUrl(entry)){ modShowErr('网站地址必须是完整的 http:// 或 https:// 地址', 'modEntry'); return; }
  const dup = findModule('web', entry);
  if (dup && moduleKey(dup.type, dup.ref) !== S._modKey){
    modShowErr(`「${entry}」已经是这个类型下的一个模块了`, 'modEntry'); return;
  }
  modShowErr('', '');
  const editing = modByName(S._modKey);
  const payload = {name, type:'web', description:desc, entry};
  try {
    const row = await apiRequest(editing ? `/modules/${encodeURIComponent(editing.id)}` : '/modules', {
      method:editing ? 'PATCH' : 'POST', body:JSON.stringify(payload)
    });
    const saved = webModuleFromApi(row);
    if (editing){
      const oldRef = editing.ref;
      Object.assign(editing, saved);
      if (oldRef !== saved.ref)
      DATA.projects.forEach(w => w.steps.forEach(s => {
        if (s.moduleId === saved.id || (s.type === 'web' && s.ref === oldRef)){
          s.type = 'web'; s.ref = saved.ref; s.label = saved.name; s.note = saved.desc;
        }
      }));
    } else DATA.modules.push(saved);
    closeModal(); render(true); toast(`${editing ? '已保存' : '已新增'}网站模块「${name}」`);
  } catch (err){ modShowErr(err && err.message ? err.message : '网站模块保存失败', 'modEntry'); }
}
/* 后端时间串 → 可排序的毫秒数：解析失败 / 缺失一律 0（「从未运行」自然沉底）。
   排序必须用这个，不能拿 backendTimeLabel 的文案排 ——「今天 00:03」和「9月22日 13:30」按字符串比毫无意义。 */
function backendEpoch(value){
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}
function backendTimeLabel(value){
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = n => String(n).padStart(2, '0');
  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const today = new Date();
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()
    && d.getDate() === today.getDate() ? `今天 ${t}` : `${d.getMonth()+1}月${d.getDate()}日 ${t}`;
}
function backendHistoryRow(run){
  const status = run && run.status ? run.status : 'failed';
  const action = run && run.action === 'restart' ? '重启' : '运行';
  return {
    t:backendTimeLabel(run && run.started_at),
    at:backendEpoch(run && run.started_at),      /* 给「最近使用」排序用；t 只负责显示 */
    d:status === 'succeeded' ? `${action}完成`
      : status === 'failed' ? (run && run.error) || `${action}失败` : `${action}中`,
    status
  };
}
/* 后端任务 <-> 前端任务：后端按项目 id 关联，界面只保留项目名用于现有渲染器。 */
function backendTaskFromApi(row, projectMap){
  if (!row || !row.id || !projectMap) return null;
  const project = projectMap.get(row.project_id);
  if (!project) return null;
  const due = typeof row.due_date === 'string' && row.due_date.trim() ? row.due_date.trim() : '今天';
  return {
    id:String(row.id), text:String(row.title || ''), proj:project.name, due,
    urgent:due === '今天', done:row.completed === true || Number(row.completed) === 1,
    kind:row.kind === 'fix' ? 'fix' : 'todo', pri:TASK_PRI.includes(row.priority) ? row.priority : '中'
  };
}
function taskApiPayload(task, changes){
  const next = {...task, ...(changes || {})};
  return {
    title:String(next.text || '').trim(),
    due_date:typeof next.due === 'string' && next.due.trim() ? next.due.trim() : null,
    priority:priOf(next), kind:taskKindOf(next), completed:!!next.done
  };
}
function applyBackendTask(row){
  const projectMap = new Map(DATA.projects.map(project => [project.id, project]));
  const task = backendTaskFromApi(row, projectMap); if (!task) return null;
  const index = S.todos.plan.findIndex(item => item.id === task.id);
  if (index >= 0) S.todos.plan[index] = task;
  else S.todos.plan.push(task);
  BACKEND_TASK_IDS.add(task.id);
  return task;
}
async function createBackendTask(projectName, changes){
  const project = DATA.projects.find(item => item.name === projectName);
  if (!project || !BACKEND_PROJECT_IDS.has(project.id)) throw new Error('任务所属项目不存在');
  const draft = {text:'', due:'今天', pri:'中', kind:'todo', done:false, ...(changes || {})};
  const row = await apiRequest(`/projects/${encodeURIComponent(project.id)}/tasks`, {
    method:'POST', body:JSON.stringify(taskApiPayload(draft))
  });
  return applyBackendTask(row);
}
async function updateBackendTask(task, changes){
  if (!task || !BACKEND_TASK_IDS.has(task.id)) throw new Error('任务尚未由后端保存');
  const row = await apiRequest(`/tasks/${encodeURIComponent(task.id)}`, {
    method:'PATCH', body:JSON.stringify(taskApiPayload(task, changes))
  });
  return applyBackendTask(row);
}
async function deleteBackendTask(task){
  if (!task || !BACKEND_TASK_IDS.has(task.id)) throw new Error('任务尚未由后端保存');
  await apiRequest(`/tasks/${encodeURIComponent(task.id)}`, {method:'DELETE'});
  BACKEND_TASK_IDS.delete(task.id);
  return task;
}
/* 后端项目记录 <-> 前端记录：后端按项目 id 关联，现有视图仍以项目名筛选。 */
function backendNoteFromApi(row, projectMap){
  if (!row || !row.id || !projectMap) return null;
  const project = projectMap.get(row.project_id);
  if (!project) return null;
  return {
    id:String(row.id), title:String(row.title || '无标题记录'), tag:['日常','技术','复盘','灵感'].includes(row.tag) ? row.tag : '日常',
    pinned:row.pinned === true || Number(row.pinned) === 1, time:backendTimeLabel(row.updated_at),
    body:String(row.body || ''), proj:project.name, links:Array.isArray(row.links) ? row.links.filter(link => typeof link === 'string') : []
  };
}
function noteApiPayload(note, changes){
  const next = {...note, ...(changes || {})};
  return {
    title:String(next.title || '').trim(), tag:next.tag || '日常', body:String(next.body || ''),
    pinned:!!next.pinned, links:Array.isArray(next.links) ? next.links.filter(link => typeof link === 'string') : []
  };
}
function applyBackendNote(row){
  const projectMap = new Map(DATA.projects.map(project => [project.id, project]));
  const note = backendNoteFromApi(row, projectMap); if (!note) return null;
  const index = S.notes.findIndex(item => item.id === note.id);
  if (index >= 0) S.notes[index] = note;
  else S.notes.unshift(note);
  BACKEND_NOTE_IDS.add(note.id);
  return note;
}
async function createBackendNote(projectName, changes){
  const project = DATA.projects.find(item => item.name === projectName);
  if (!project || !BACKEND_PROJECT_IDS.has(project.id)) throw new Error('项目记录所属项目不存在');
  const draft = {title:'无标题记录', tag:'日常', body:'', pinned:false, links:[], ...(changes || {})};
  const row = await apiRequest(`/projects/${encodeURIComponent(project.id)}/notes`, {
    method:'POST', body:JSON.stringify(noteApiPayload(draft))
  });
  return applyBackendNote(row);
}
async function updateBackendNote(note, changes){
  if (!note || !BACKEND_NOTE_IDS.has(note.id)) throw new Error('项目记录尚未由后端保存');
  const row = await apiRequest(`/notes/${encodeURIComponent(note.id)}`, {
    method:'PATCH', body:JSON.stringify(noteApiPayload(note, changes))
  });
  return applyBackendNote(row);
}
async function deleteBackendNote(note){
  if (!note || !BACKEND_NOTE_IDS.has(note.id)) throw new Error('项目记录尚未由后端保存');
  await apiRequest(`/notes/${encodeURIComponent(note.id)}`, {method:'DELETE'});
  BACKEND_NOTE_IDS.delete(note.id);
  return note;
}
function backendContextFromApi(row){
  if (!row || !row.project_id) return null;
  return {
    projectId:String(row.project_id), module:String(row.module || ''), moduleId:String(row.module_id || ''),
    modulePath:String(row.module_path || ''), files:Array.isArray(row.files) ? row.files.filter(item => typeof item === 'string') : [],
    status:String(row.dev_status || '开发中'), next:String(row.next_step || ''),
    rules:Array.isArray(row.rules) ? row.rules.filter(item => typeof item === 'string') : [], lastEdit:backendTimeLabel(row.updated_at)
  };
}
function ensureDevContext(project){
  if (!project) return null;
  if (!DATA.devContext[project.name]) DATA.devContext[project.name] = {
    projectId:project.id, module:'', moduleId:'', modulePath:'', files:[], status:'开发中', next:'', lastEdit:'—'
  };
  return DATA.devContext[project.name];
}
function backendProjectFileFromApi(row, projectMap){
  if (!row || !row.id || !projectMap || !projectMap.has(row.project_id)) return null;
  return {id:String(row.id), projectId:String(row.project_id), name:String(row.name || '未命名文件'),
    path:String(row.path || ''), createdAt:String(row.created_at || '')};
}
function projectFilesOf(projectId){
  return S.projectFiles.filter(item => item.projectId === projectId);
}
function replaceProjectFiles(rows, projectMap){
  const items = (rows || []).map(row => backendProjectFileFromApi(row, projectMap)).filter(Boolean);
  S.projectFiles.splice(0, S.projectFiles.length, ...items);
  return items;
}
function backendAppFromApi(row){
  if (!row || !row.id || row.launchable !== true) return null;
  const opened = row.last_opened_at ? new Date(row.last_opened_at).getTime() : 0;
  return {
    id:String(row.id), name:String(row.name || '未命名应用'), cat:String(row.category || '其他'),
    icon:String(row.icon || 'idea'), st:row.favorite ? '常用' : '', size:String(row.size_label || '—'),
    use:Number(row.use_count) || 0, last:opened ? backendTimeLabel(row.last_opened_at) : '从未',
    lastTs:Number.isFinite(opened) ? opened : 0, run:row.running === true || Number(row.running) === 1
  };
}
function appApiPayload(app){
  const opened = app && app.lastTs ? new Date(app.lastTs) : null;
  return {
    name:String((app && app.name) || '').trim(), category:String((app && app.cat) || '').trim(),
    icon:String((app && app.icon) || 'idea'), favorite:!!(app && app.st === '常用'),
    size_label:String((app && app.size) || '—'), use_count:Number(app && app.use) || 0,
    last_opened_at:opened && !Number.isNaN(opened.getTime()) ? opened.toISOString() : null, running:!!(app && app.run)
  };
}
function applyBackendApp(row){
  const app = backendAppFromApi(row); if (!app) return null;
  const index = S.apps.findIndex(item => item.id === app.id);
  if (index >= 0) S.apps[index] = app;
  else S.apps.push(app);
  BACKEND_APP_IDS.add(app.id);
  return app;
}
function replaceBackendApps(rows){
  const apps = (rows || []).map(backendAppFromApi).filter(Boolean);
  S.apps.splice(0, S.apps.length, ...apps);
  BACKEND_APP_IDS.clear(); apps.forEach(app => BACKEND_APP_IDS.add(app.id));
  return apps;
}
async function updateBackendApp(app, changes){
  if (!app || !BACKEND_APP_IDS.has(app.id)) throw new Error('应用尚未由后端保存');
  const row = await apiRequest(`/applications/${encodeURIComponent(app.id)}`, {
    method:'PATCH', body:JSON.stringify(appApiPayload({...app, ...(changes || {})}))
  });
  return applyBackendApp(row);
}
async function deleteBackendApp(app){
  if (!app || !BACKEND_APP_IDS.has(app.id)) throw new Error('应用尚未由后端保存');
  await apiRequest(`/applications/${encodeURIComponent(app.id)}`, {method:'DELETE'});
  BACKEND_APP_IDS.delete(app.id);
  DATA.projects.forEach(project => {
    project.steps = project.steps.filter(step => step.applicationId !== app.id && !(step.type === 'app' && step.ref === app.id));
  });
  REAL_PROJECT_IDS.clear();
  DATA.projects.filter(project => project.steps.some(step => step.moduleId)).forEach(project => REAL_PROJECT_IDS.add(project.id));
  return app;
}
function scannedAppFromApi(row){
  if (!row || !row.id || !row.name) return null;
  return {
    id:String(row.id), name:String(row.name), cat:String(row.category || '效率'),
    icon:String(row.icon || 'idea'), added:row.added === true
  };
}
async function loadScannedApps(){
  const request = ++S.scanRequest;
  S.scanLoading = true; S.scanError = ''; addApp();
  try {
    const rows = await apiRequest('/applications/scan');
    if (request !== S.scanRequest) return;
    S.scanApps = (rows || []).map(scannedAppFromApi).filter(Boolean);
  } catch (err) {
    if (request !== S.scanRequest) return;
    S.scanApps = [];
    S.scanError = err && err.message ? err.message : '无法扫描本机应用';
  } finally {
    if (request !== S.scanRequest) return;
    S.scanLoading = false;
    const modal = $('#noteModal');
    if (modal && modal.classList && modal.classList.contains('on')) addApp();
  }
}
/* 后端把「注册了没」和「Windows 允许它启动吗」分开回答：两者都成立，开机时它才
   真的会跑起来。只认 enabled，被任务管理器禁用时开关仍是绿的 —— 那是假绿。 */
function applyStartupState(state){
  S.startupEnabled = !!state && state.enabled === true;
  S.startupRegistered = !!state && state.registered === true;
  S.startupApproved = !!state && state.approved !== false;
}
async function loadStartupSetting(){
  S.startupLoading = true; S.startupError = '';
  try {
    applyStartupState(await apiRequest('/settings/startup'));
  } catch (err) {
    S.startupEnabled = null; S.startupRegistered = null; S.startupApproved = null;
    S.startupError = err && err.message ? err.message : '无法读取 Windows 启动项';
  } finally {
    S.startupLoading = false;
  }
}
async function updateStartupSetting(enabled){
  if (S.startupLoading || S.startupUpdating) return;
  S.startupUpdating = true; S.startupError = ''; render(true);
  try {
    applyStartupState(await apiRequest('/settings/startup', {method:'PUT', body:JSON.stringify({enabled})}));
    toast(S.startupEnabled
      ? '开机自启动已开启，登录后将自动打开 ControlPod 窗口'
      : '开机自启动已关闭，Windows 启动项已移除');
  } catch (err) {
    S.startupError = err && err.message ? err.message : '无法更新 Windows 启动项';
    toast(`开机自启动未变更：${S.startupError}`);
  } finally {
    S.startupUpdating = false;
    render(true);
  }
}
function applyConsoleWindowState(state){
  S.windowState = {
    available:state && state.available === true,
    topmost:state && state.topmost === true
  };
  syncConsoleWindowControl();
}
function syncConsoleWindowControl(){
  const button = $('#topmostBtn');
  if (!button || !button.classList) return;
  const available = S.windowState.available;
  const topmost = available && S.windowState.topmost;
  button.disabled = !available || S.windowUpdating;
  button.classList.toggle('on', topmost);
  button.setAttribute('aria-pressed', topmost ? 'true' : 'false');
  /* 悬停解释统一口径：只讲这个按钮干什么（「窗口置顶 / 取消窗口置顶」）。
     壳不可用时不改文案 —— 仍由 disabled + 未置顶态表达，原因走 toast（见 updateConsoleWindowTopmost）。 */
  button.title = topmost ? '取消窗口置顶' : '窗口置顶';
}
async function loadConsoleWindowState(){
  try {
    const state = await apiRequest('/window');
    S.windowError = '';
    applyConsoleWindowState(state);
  } catch (err) {
    S.windowError = err && err.message ? err.message : '无法读取固定窗口状态';
    applyConsoleWindowState({available:false, topmost:false});
  }
}
async function updateConsoleWindowTopmost(){
  if (!S.windowState.available || S.windowUpdating) return;
  S.windowUpdating = true; syncConsoleWindowControl();
  try {
    const state = await apiRequest('/window/topmost', {
      method:'PUT', body:JSON.stringify({enabled:!S.windowState.topmost})
    });
    S.windowError = '';
    applyConsoleWindowState(state);
    toast(S.windowState.topmost ? '固定窗口已置顶' : '固定窗口已取消置顶');
  } catch (err) {
    S.windowError = err && err.message ? err.message : '无法更新窗口置顶状态';
    toast(`窗口置顶未变更：${S.windowError}`);
  } finally {
    S.windowUpdating = false;
    syncConsoleWindowControl();
  }
}
/* 后端启动时用真实项目、任务、模块、绑定关系和运行记录替换原型种子。 */
async function loadBackendState(){
  try {
    const payload = await apiRequest('/bootstrap');
    const modules = (payload.modules || []).map(webModuleFromApi);
    const moduleMap = new Map(modules.map(m => [m.id, m]));
    const bindings = payload.projectModules || [];
    const applications = (payload.applications || []).map(backendAppFromApi).filter(Boolean);
    const applicationMap = new Map(applications.map(application => [application.id, application]));
    const applicationBindings = payload.projectApplications || [];
    const runMap = new Map((payload.projectRuns || []).map(item => [item.project_id, item]));
    const executionMap = new Map((payload.projectExecutions || []).map(item => [item.project_id, item]));
    const seedMap = new Map(DATA.projects.map(p => [p.id, p]));
    const projects = (payload.projects || []).map(row => {
      const seed = seedMap.get(row.id);
      const p = JSON.parse(JSON.stringify(seed || DATA.projectTemplate));
      p.id = row.id;
      p.name = row.id === 'apex' && seed ? seed.name : row.name;
      p.desc = row.description || '';
      p.st = row.status || '正常'; p.stCls = projStCls(p.st);
      p.updated = '刚刚'; p.steps = [];
      const orderedSteps = [];
      bindings.filter(link => link.project_id === row.id).forEach((link, index) => {
        const m = moduleMap.get(link.module_id); if (!m) return;
        orderedSteps.push({order:Number(link.sort_order) || 0, key:`module-${m.id}`, step:{
          id:`pm-${row.id}-${index}`, moduleId:m.id, type:m.type, ref:m.ref,
          label:m.name, note:m.desc, wait:true, on:true
        }});
      });
      applicationBindings.filter(link => link.project_id === row.id).forEach((link, index) => {
        const application = applicationMap.get(String(link.application_id)); if (!application) return;
        orderedSteps.push({order:Number(link.sort_order) || 0, key:`application-${application.id}`, step:{
          id:`pa-${row.id}-${index}`, moduleId:String(link.module_id), applicationId:application.id,
          type:'app', ref:application.id, label:application.name, note:application.cat, wait:true, on:true
        }});
      });
      orderedSteps.sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
      p.steps = orderedSteps.map(item => item.step);
      const runInfo = runMap.get(row.id) || {};
      const executionInfo = executionMap.get(row.id) || {};
      p.runs = Number(runInfo.run_count) || 0;
      p.last = backendTimeLabel(runInfo.last_run_at);
      p.lastTs = backendEpoch(runInfo.last_run_at);   /* 「常用项目」按它降序：最近跑过的排最前 */
      p.history = Array.isArray(runInfo.recent) ? runInfo.recent.map(backendHistoryRow) : [];
      p.execution = executionInfo.latest || null;
      return p;
    });
    DATA.modules.splice(0, DATA.modules.length, ...modules);
    DATA.projects.splice(0, DATA.projects.length, ...projects);
    BACKEND_PROJECT_IDS.clear(); projects.forEach(p => BACKEND_PROJECT_IDS.add(p.id));
    const taskProjectMap = new Map(projects.map(project => [project.id, project]));
    const contexts = (payload.projectContexts || []).map(backendContextFromApi).filter(Boolean);
    projects.forEach(project => ensureDevContext(project));
    contexts.forEach(context => {
      const project = taskProjectMap.get(context.projectId); if (!project) return;
      Object.assign(ensureDevContext(project), context);
      if (Array.isArray(context.rules) && context.rules.length) S.projRules[project.id] = context.rules.slice();
      else delete S.projRules[project.id];
    });
    replaceProjectFiles(payload.projectFiles || [], taskProjectMap);
    replaceBackendApps(payload.applications || []);
    const tasks = (payload.tasks || []).map(row => backendTaskFromApi(row, taskProjectMap)).filter(Boolean);
    S.todos.plan.splice(0, S.todos.plan.length, ...tasks);
    BACKEND_TASK_IDS.clear(); tasks.forEach(task => BACKEND_TASK_IDS.add(task.id));
    const notes = (payload.notes || []).map(row => backendNoteFromApi(row, taskProjectMap)).filter(Boolean);
    S.notes.splice(0, S.notes.length, ...notes);
    BACKEND_NOTE_IDS.clear(); notes.forEach(note => BACKEND_NOTE_IDS.add(note.id));
    const heat = buildHeatPayload(payload.activityDays);
    S.heatDays = heat.counts;
    S.heatDetail = heat.detail;
    S.heatFetchedAt = Date.now();
    startHeartbeat();
    S.devTask = {};
    REAL_PROJECT_IDS.clear();
    projects.filter(p => p.steps.length).forEach(p => REAL_PROJECT_IDS.add(p.id));
    const active = projects.map(project => ({project, execution:(executionMap.get(project.id) || {}).active}))
      .find(item => item.execution && (item.execution.status==='queued' || item.execution.status==='running'));
    if (active) restoreBackendExecution(active.project, active.execution);
    else S.running = null;
    if (!DATA.projects.some(p => p.id === S.wf)) S.wf = DATA.projects[0] ? DATA.projects[0].id : '';
    if (!DATA.projects.some(p => p.id === S.proj)) S.proj = DATA.projects[0] ? DATA.projects[0].id : '';
    S.backendReady = true; S.backendError = '';
    return true;
  } catch (err){
    S.backendReady = false; S.backendError = err && err.message ? err.message : '后端不可用';
    S.todos.plan.splice(0, S.todos.plan.length);
    BACKEND_TASK_IDS.clear();
    S.notes.splice(0, S.notes.length);
    BACKEND_NOTE_IDS.clear();
    BACKEND_APP_IDS.clear();
    S.devTask = {};
    return false;
  }
}
/* 删除模块：预演 + 二次确认（硬约束，参考项目删除链路 projDeleteAsk → 预演弹窗 → projDelete）。 */
function modDeleteModalHTML(){
  const m = modByName(S.modConfirm);
  if (!m) return '';
  const used = DATA.projects.filter(w => w.steps.some(s => s.type === m.type && s.ref === m.ref));
  return `
  <div class="modal-mask" data-act="modDeleteCancel"></div>
  <div class="modal" role="dialog" aria-modal="true">
    <div class="m-title">删除模块「${esc(m.name)}」？</div>
    <p class="m-desc">预演：将从模块库移除「${esc(m.name)}」（${TYPE_META[m.type].name} · 入口 ${esc(m.ref)}）。${
      used.length
        ? `它正被 ${used.length} 个项目的运行流程引用（${used.map(w => esc(w.name)).join('、')}），删除后将同时解除这些绑定。`
        : '当前没有项目的运行流程引用它。'
    }确认后会解除这些项目的绑定并保留既有运行记录。</p>
    <div class="m-acts">
      <button class="btn btn-ghost btn-sm" data-act="modDeleteCancel">取消</button>
      <button class="btn btn-sm m-danger" data-act="modDelete" data-k="${esc(S.modConfirm)}">确认删除</button>
    </div>
  </div>`;
}
async function modDelete(k){
  const i = DATA.modules.findIndex(m => moduleKey(m.type, m.ref) === k);
  if (i < 0) return;
  const gone = DATA.modules[i];
  if (gone.manifestBacked){ toast('由项目清单管理的模块请在所属仓库中维护'); return; }
  try {
    await apiRequest(`/modules/${encodeURIComponent(gone.id)}`, {method:'DELETE'});
    DATA.modules.splice(i, 1);
    DATA.projects.forEach(w => { w.steps = w.steps.filter(s => s.moduleId !== gone.id); });
    REAL_PROJECT_IDS.clear();
    DATA.projects.filter(p => p.steps.some(s => s.moduleId)).forEach(p => REAL_PROJECT_IDS.add(p.id));
    S.modConfirm = '';
    render(true); toast(`已删除模块「${gone.name}」`);
  } catch (err){ toast(err && err.message ? err.message : '模块删除失败'); }
}

/* ---------------- 工作流页 ---------------- */
const TYPE_META = {
  app:    {name:'应用',   color:'#2563EB', bg:'var(--blue-bg)'},
  web:    {name:'网页',   color:'#0B8F8F', bg:'var(--teal-bg)'},
  folder: {name:'文件夹', color:'#B0700F', bg:'var(--amber-bg)'},
  script: {name:'脚本',   color:'#7C4DFF', bg:'var(--purple-bg)'},
  cmd:    {name:'命令',   color:'#5C6270', bg:'var(--slate-bg)'}
};
/* 执行模块「所属项目」默认归属：未显式声明 projectName 的条目都归到系统资源 */
const DEFAULT_PROJ = '系统资源';
function tIco(type){
  const c = TYPE_META[type].color;
  return {app:IC.grid, web:IC.web, folder:IC.folder, script:IC.code, cmd:IC.term}[type](c);
}
function wfIcon(k, c){
  const p = {sun:IC.spark, focus:IC.grid, doc:IC.file, moon:IC.clock}[k] || IC.grid;
  return p(c);
}
const shortUrl = u => String(u).replace(/^https?:\/\//,'').replace(/\/$/,'');
function now(){ return new Date().toLocaleTimeString('zh-CN',{hour12:false}); }
function nowShort(){ return '今天 ' + now().slice(0,5); }
/* 流程名是用户自己给项目起的名字：后端 projects 表没有这个字段，走控制台新建的项目也从未填过，
   所以「没有名字」才是常态。以前模板里塞了一个看着像真名的占位流程名，它会跟着 JSON 深拷贝流到
   项目卡、概览与命令面板上，看起来像真有这么个流程。占位符不许当数据用，缺失就如实说「未命名流程」。 */
function flowNameOf(w){ return w && w.flowName ? String(w.flowName) : '未命名流程'; }
/* 最近使用时间的展示口径：后端从未运行过的项目 last 是占位破折号，读作「从未运行」更直白，
   也顺便解释了它为什么排在「常用项目」最后（排序键 lastTs 为 0）。 */
function lastUsedLabel(w){ return w && w.last && w.last !== '—' ? String(w.last) : '从未运行'; }
const curWf = () => DATA.projects.find(w=>w.id===S.wf) || DATA.projects[0];

function stepRow(s, i, animate){
  const m = TYPE_META[s.type], r = S.running;
  let cls = s.on ? '' : ' off';
  if (r && r.wfId === S.wf){
    const st = r.states[s.id];
    if (st==='done') cls += ' run-done';
    else if (st==='now') cls += ' run-now';
    else if (st==='error') cls += ' run-error';
    else if (st==='wait') cls += ' run-wait';
  }
  if (S.flash === s.id) cls += ' just-added';
  return `<div class="step${cls}"${animate?` style="animation-delay:${i*35}ms"`:''}>
    <span class="s-idx" title="第 ${i+1} 个步骤">${i+1}</span>
    <span class="s-ico" style="background:${m.bg}">${tIco(s.type)}</span>
    <div style="min-width:0">
      <div class="s-name">${esc(s.label)}</div>
      <div class="s-note">${esc(m.name)}${s.note?' · '+esc(s.note):''}${s.type==='web'?' · '+esc(shortUrl(s.ref)):''}</div>
    </div>
    <div class="s-flags">
      <button class="sw-mini mv" data-act="moveStep" data-id="${s.id}" data-dir="-1" title="上移一位">↑</button>
      <button class="sw-mini mv" data-act="moveStep" data-id="${s.id}" data-dir="1" title="下移一位">↓</button>
      ${i>0 ? `<button class="link wait-link" data-act="toggleWait" data-id="${s.id}"
        title="${s.wait?'把它改为与上一步并行启动':'取消并行：改为等上一步完成后才启动'}">${s.wait?'与上一步并行':'取消并行'}</button>` : ''}
      <button class="sw-mini ${s.on?'on':''}" data-act="toggleStep" data-id="${s.id}"
        title="${s.on?'参与本次运行':'已停用，本次不会执行'}">启用</button>
      <button class="icon-mini s-del" data-act="delStep" data-id="${s.id}" title="从当前项目流程中移除">${IC.close('currentColor')}</button>
    </div>
  </div>`;
}

/* ---------- 资源库 ---------- */
function resItem(t, ref, label, note, iconHtml, used, proj){
  const owner = proj || DEFAULT_PROJ;
  return `<div class="res-item ${used?'used':''}" draggable="${used?'false':'true'}"
      data-drag="${t}|${esc(ref)}" title="${used?'已在当前项目流程中':'拖到左侧流程列表，或点右侧「添加」'}">
    <span class="li-ico" style="background:${TYPE_META[t].bg}">${iconHtml || tIco(t)}</span>
    <span class="li-info">
      <span class="li-t">${esc(label)}</span>
      <span class="li-s"><span class="li-sn">${used?'已在当前项目流程中':esc(note||'')}</span><span class="li-pj" title="${esc(owner)}">${esc(owner)}</span></span>
    </span>
    ${used?'':`<button class="btn-add" data-act="addStep" data-v="${esc(ref)}" data-t="${t}">＋ 添加</button>`}
  </div>`;
}
function larderItems(){
  const q = S.larderQ.trim().toLowerCase();
  const t = S.larderTab;
  /* 应用走 S.apps（自带图标 / 分类 / 尺寸字段，不并入统一模块库），
     其余四类统一走 DATA.modules —— 一次 filter 取代原来的四个分支 */
  let items = t === 'app'
    ? S.apps.map(a=>({ref:a.id, label:a.name, note:a.cat+' · '+a.size, icon:appIconHTML(a.icon), proj:a.projectName}))
    : DATA.modules.filter(m=>m.type===t).map(m=>({ref:m.ref, label:m.name, note:m.desc,
        proj:m.manifestBacked ? '项目清单模块' : '可供项目使用'}));
  if (q) items = items.filter(i=>i.label.toLowerCase().includes(q) || String(i.note).toLowerCase().includes(q));

  const used = new Set(curWf().steps.map(s=>s.type+':'+s.ref));
  return items.map(i=>resItem(t, i.ref, i.label, i.note, i.icon, used.has(t+':'+i.ref), i.proj)).join('')
    || `<div class="empty">${IC.search('currentColor')}<span>没有匹配的执行模块</span></div>`;
}

/* ---------- 预备检查 ---------- */
/* 把现有 wait 关系归纳成展示条目（唯一推导入口，纯函数，不改数据）：
   第 1 步开一条目；wait=true → 新条目；wait=false → 并入当前条目；
   条目内多于 1 个成员 → parallel=true（纯展示标记）。运行引擎不读 wait，本函数也不改它 */
function wfFlowItems(steps){
  const raw = [];
  steps.forEach((s, i) => {
    if (i === 0 || s.wait) raw.push([]);
    raw[raw.length - 1].push(s);
  });
  return raw.map(members => ({ members, parallel: members.length > 1 }));
}

function preflight(w){
  const on = w.steps.filter(s=>s.on);
  const issues = [];
  on.forEach(s=>{
    if (s.type==='folder' && s.missing)
      issues.push({lv:'warn', mod:s.label, t:`目录 ${s.ref} 不存在，需要先创建`});
    if (s.type==='script'){
      const sc = DATA.modules.find(m=>m.type==='script' && m.ref===s.ref);
      if (sc && sc.st==='需确认') issues.push({lv:'info', mod:s.label, t:`${sc.name} 需要人工确认后才会真正执行`});
    }
  });
  return {issues, ready: !issues.some(i=>i.lv==='warn')};
}

/* ---------- 工作流页 ---------- */
/* 预备检查卡与「执行模块」卡均已删除（2026-09-14）：异常在「运行流程」卡内按模块点名反馈；
   preflight() 保留为判定来源。 */
/* 运行展示层：摘要常驻，完整步骤与日志按需展开；不改变运行引擎 */
function runStepChipHTML(s, r){
  const st = r ? r.states[s.id] : 'done';
  const cls = st==='done' ? 'ok' : st==='now' ? 'now' : st==='error' ? 'err' : '';
  const mark = st==='done' ? '✓' : st==='now' ? '●' : st==='error' ? '!' : '○';
  return `<span class="rf-chip ${cls}">${mark} ${esc(s.label)}</span>`;
}
function runDetailHTML(w, r){
  const on = w.steps.filter(s=>s.on);
  const live = r && r.wfId===w.id ? r : null;
  const lastLog = w.execution ? executionLogEntries(w.execution) : [];
  /* 运行详情（2026-09-14 精简）：只保留日志终端 —— 摘要（上次运行 / 进度 / 结果）已在上方 run-summary 呈现，不再重复 */
  const logs = live && live.log.length ? live.log : lastLog;
  return `<div class="run-detail">
    <div class="terminal" id="termRun" style="min-height:150px;max-height:158px">
      ${logs.length
        ? logs.map(l=>`<div class="t-line ${l.c}">${esc(l.t)}</div>`).join('')
        : '<div class="t-line dim">运行一次项目流程后，这里会保留真实的模块日志。</div>'}
    </div>
  </div>`;
}
/* 运行状态摘要体（无卡片外壳）：供编辑模式独立卡与查看模式「运行流程」合并卡复用 */
function runSummaryBodyHTML(w, r, open){
  const on = w.steps.filter(s=>s.on);
  const live = r && r.wfId===w.id ? r : null;
  const cur = live && live.i >= 0 ? on.find(s=>s.id===live.order[live.i]) : null;
  const failed = !!(live && (live.status === 'failed' || live.status === 'interrupted'));
  const finished = !!(live && (live.status === 'succeeded' || live.done >= live.total));
  const closing = !!(live && live.action === 'stop');
  const restarting = !!(live && live.action === 'restart');
  const pct = live ? Math.round(live.done / live.total * 100) : 0;
  const lastAttempt = Array.isArray(w.history) ? w.history[0] : null;
  const lastSucceeded = !!(lastAttempt && lastAttempt.st === '成功');
  /* 去重提炼（2026-09-14）：空闲态只保留一句关键要点「最近一次运行：时间 · 结果」，
     不再重复「上次运行 / 结果」两组指标；运行中仍突出 当前步骤 + 进度。 */
  return `<div class="run-summary">
      <div class="run-summary-top">
        <div>
          <div class="run-summary-name">${live ? (failed ? (closing ? '关闭失败' : restarting ? '重启失败' : '运行失败') : finished ? (closing ? '关闭完成' : restarting ? '重启完成' : '运行完成') : (closing ? '正在关闭' : restarting ? '正在重启' : '正在运行')) : '最近一次运行'}</div>
          <div class="run-now">${live
            ? (failed ? `<b>${esc(live.error || (closing ? '项目关闭失败' : restarting ? '项目重启失败' : '模块执行失败'))}</b>` : cur ? `当前：正在${closing ? '关闭' : restarting ? '重启' : '启动'} <b>${esc(cur.label)}</b>` : (finished ? (closing ? '项目已经关闭' : restarting ? '项目已经重启' : '本次运行已完成') : `正在准备${closing ? '关闭' : restarting ? '重启' : '运行'}环境…`))
            : (lastAttempt ? `<b>${esc(w.last)} · ${lastSucceeded ? '成功' : '失败'}</b>${!lastSucceeded && lastAttempt.note ? `：${esc(lastAttempt.note)}` : ''}` : '尚无运行记录')}</div>
        </div>
        <div class="right">
          <button class="btn btn-ghost btn-sm" data-act="toggleRunDetail" data-id="${w.id}">${open ? '收起运行详情' : '查看运行详情'}</button>
        </div>
      </div>
      ${live ? `
        <div class="run-summary-progress"><b>${live.done} / ${live.total}</b><div class="prog"><i style="width:${pct}%"></i></div></div>
        <div class="run-flow">${on.map(s=>runStepChipHTML(s, live)).join('')}</div>` : ''}
    </div>
    ${open ? runDetailHTML(w, live) : ''}`;
}
function runSummaryHTML(w, r, open){
  const on = w.steps.filter(s=>s.on);
  const failed = !!(r && r.wfId===w.id && (r.status==='failed' || r.status==='interrupted'));
  const finished = !!(r && r.wfId===w.id && (r.status==='succeeded' || r.done >= r.total));
  const status = r ? (r.wfId===w.id ? (failed ? '失败' : finished ? '已完成' : '运行中') : '空闲') : '空闲';
  const statusCls = r && r.wfId===w.id ? (failed ? 'b-amber' : finished ? 'b-green' : 'b-blue') : 'b-slate';
  return `<section class="card run-console">
    <div class="card-head">
      <span class="step-badge">3</span>
      <div class="card-title">运行状态<small>${esc(w.name)} · ${on.length} 个步骤</small></div>
      <div class="right"><span class="badge ${statusCls}">${status}</span></div>
    </div>
    ${runSummaryBodyHTML(w, r, open)}
  </section>`;
}

/* ---------- 项目工作区（工作流页 · 查看模式骨架） ----------
   查看模式重组为五个区块：概览 → 开发上下文 → 执行模块 → 运行流程 → 设置。
   骨架阶段：只重排信息组织，复用现有 Mock 字段与组件类，不新增交互与数据结构。 */
const secHead = (n, t) =>
  `<div class="board-head"><span class="step-badge">${n}</span><span class="board-title">${t}</span></div>`;

/* 项目元信息归并：项目即运行单元本体，元信息取自身 + projMeta */
function projMetaOf(w){
  const meta = DATA.projMeta[w.name];
  return {
    pj: w,
    name: w.name,
    status: w.st,
    statusCls: w.stCls,
    created: meta ? meta.created : '—',
    files: w.files != null ? w.files : null
  };
}

/* 卡 1 · 身份卡：正常态展示身份 / 时间线 / 工作概况；编辑态整卡换成编辑窗口。
   编辑态不复用展示结构，避免「输入控件与只读信息混排」导致焦点与层级混乱。
   右上角铅笔按钮是编辑窗口的唯一入口。 */
function projIdCardHTML(w, act){
  if (S.projEdit === w.id) return projEditFormHTML(w);
  const m = projMetaOf(w);
  const line = (k, v) => `<div class="d-line"><span class="d-k">${k}</span><span class="d-v">${v}</span></div>`;
  return `<section class="card ov-card">
      <div class="ov-id">
        <span class="ov-ico" style="background:${w.color}1f">${wfIcon(w.ico, w.color)}</span>
        <div class="ov-id-t">
          <div class="ov-name-line">
            <div class="ov-name">${esc(w.name)}</div>
            <button class="ov-edit-btn" data-act="openProjEdit" data-id="${w.id}"
              title="编辑项目标题与正文" aria-label="编辑项目标题与正文">${IC.pen('currentColor')}</button>
          </div>
          <div class="ov-sub">${esc(w.desc)}</div>
        </div>
      </div>
      <div class="ov-tags">
        <span class="badge ${m.statusCls}">${esc(m.status)}</span>
        ${w.tags.map(t=>`<span class="tag-mini">${esc(t)}</span>`).join('')}
      </div>
      <div class="d-lines ov-lines">
        ${line('创建时间', esc(m.created))}
        ${line('最近运行', esc(w.last))}
        ${line('最近更新', esc(w.updated))}
        ${line('最近动态', act
          ? `${esc(act.text)}<span class="ov-time">${esc(act.time)}</span>`
          : '<span class="ov-mute">还没有关联动态</span>')}
      </div>
      <div class="ov-summary"><span>工作概况</span><b>${projTasks(w.name).filter(task => !task.done).length} 项待办 · ${w.steps.filter(step => step.on).length} 个模块已启用</b></div>
    </section>`;
}

/* 区块 2 · 概览：项目信息 / 项目能力 / 项目统计 三卡
   信息分工：卡 1 回答「这是什么」（身份 / 标签 / 时间线 / 工作概况），
             卡 2 回答「它能做什么」（流程 / 模块构成 / 启用明细 / 就绪度），
             卡 3 回答「积累了多少」（文件 / 运行）。
   页面级主操作（运行项目）不在这三张卡里 —— 已上提到页头，避免主按钮沉在信息卡底部导致主次不分 */
function projOverviewHTML(w){
  const m = projMetaOf(w);
  const on = w.steps.filter(s=>s.on);
  const live = S.running && S.running.wfId === w.id ? S.running : null;
  const line = (k, v) => `<div class="d-line"><span class="d-k">${k}</span><span class="d-v">${v}</span></div>`;
  /* 模块构成：按类型聚合，只输出有内容的类型（空项目不会出现一行 0 值） */
  const byType = ['app','web','folder','script','cmd']
    .map(t => ({t, n: on.filter(s=>s.type===t).length, name: TYPE_META[t].name, color: TYPE_META[t].color}))
    .filter(x => x.n > 0);
  /* 本项目最近一条动态（活动流里按项目名筛），没有记录时给中性兜底，避免卡片下半空掉 */
  const act = S.acts.find(a => a.proj === w.name);

  return `<div class="grid g-3 ov-grid">
    ${projIdCardHTML(w, act)}

    <section class="card ov-card">
      <div class="card-head">
        <div class="card-title">项目能力<small>${on.length}/${w.steps.length} 个执行模块启用</small></div>
      </div>
      <div class="d-lines ov-lines">
        ${line('当前流程', `${esc(flowNameOf(w))} · ${live ? '<span class="ov-live">运行中</span>' : '空闲'}` +
          `<span class="ov-flow-note">${esc(w.flowDesc)}</span>`)}
      </div>
      <div class="ov-block">
        <div class="ov-block-t">模块构成</div>
        <div class="ov-chips">
          ${byType.map(x=>`<span class="mod-chip"><span class="dot" style="background:${x.color}"></span>${x.name}<b>${x.n}</b></span>`).join('')
            || '<span class="ov-mute">暂无启用的执行模块</span>'}
        </div>
      </div>
      <div class="ov-block">
        <div class="ov-block-t">启用明细</div>
        <div class="ov-chips">
          ${on.map(s=>`<span class="mod-chip plain" title="${esc(s.note || s.label)}">${esc(s.label)}</span>`).join('')
            || '<span class="ov-mute">还没有绑定执行模块</span>'}
        </div>
      </div>
    </section>

    <section class="card ov-card">
      <div class="card-head">
        <div class="card-title">项目统计<small>累计沉淀</small></div>
      </div>
      <div class="ov-stat">
        <div class="ov-stat-cell"><div class="ov-stat-n">${m.files != null ? m.files : '—'}</div><div class="ov-stat-k">文件数量</div></div>
        <div class="ov-stat-cell"><div class="ov-stat-n">${w.runs}</div><div class="ov-stat-k">历史运行次数</div></div>
      </div>
      <div class="d-lines ov-lines">
        ${line('最近运行', esc(w.last))}
        ${line('运行流程', `${w.steps.length} 个模块 · ${esc(flowNameOf(w))}`)}
      </div>
    </section>
  </div>`;
}

function obsidianHubHTML(w, counts){
  const vault = String(S.obsidian.vault || '').trim();
  const bound = cleanObsidianPath(S.obsidian.bindings[w.id]);
  const path = bound || obsidianSuggestedPath(w);
  const configured = !!vault;
  const open = S.obsidianHubOpen === w.id;
  const bindEdit = S.obsidianBindEdit === w.id;
  const updating = S.obsidianUpdateArm === w.id;
  const unbinding = S.obsidianUnbindArm === w.id;
  const returned = S.obsidianReturnFocus === w.id;
  const state = !configured ? '未配置' : bound ? '路径已保存' : '待连接';
  const stateCls = !configured ? 'is-unconfigured' : bound ? 'is-saved' : 'is-unbound';
  const targetAct = !configured ? 'goPage' : bound ? 'obsidianOpenProject' : 'obsidianConnect';
  const targetV = !configured ? ' data-v="settings"' : '';
  const targetTitle = !configured ? '配置 Obsidian' : bound ? '打开主页' : '连接项目主页';
  const targetMeta = !configured ? '先填写仓库名称' : bound ? path : (path || '选择已有页面或新建主页');
  let panel = '';

  if (bindEdit){
    panel = `<div class="obs-hub-panel">
      <div class="obs-panel-head"><div><b>连接设置</b><span>这里只保存路径，无法确认页面是否存在</span></div></div>
      <div class="field obs-path-field">
        ${IC.note('var(--ink-3)')}
        <input id="obsProjectPath" value="${esc(path)}" placeholder="例如：项目/ControlPod" aria-label="Obsidian 项目主页路径">
      </div>
      <div class="obs-panel-actions">
        <button class="btn btn-ghost btn-sm" data-act="obsidianBind" data-id="${w.id}">保存已有路径</button>
        <button class="btn btn-primary btn-sm" data-act="obsidianNewProject" data-id="${w.id}">${IC.plus('currentColor')}新建主页</button>
        ${bound ? `<button class="link obs-danger-link" data-act="obsidianUnbindAsk" data-id="${w.id}">解除连接</button>` : ''}
      </div>
    </div>`;
  } else if (updating){
    panel = `<div class="obs-hub-panel obs-preflight">
      <div class="obs-panel-head"><div><b>写入前预演</b><span>确认后将覆盖这个路径的页面全文</span></div></div>
      <div class="obs-preflight-grid">
        <span>目标仓库</span><b>${esc(vault)}</b>
        <span>文件路径</span><b>${esc(bound)}</b>
        <span>写入内容</span><b>项目概览、项目任务、项目记录</b>
      </div>
      <div class="obs-panel-actions">
        <button class="btn btn-ghost btn-sm" data-act="obsidianUpdateCancel">返回</button>
        <button class="btn btn-primary btn-sm" data-act="obsidianUpdateProject" data-id="${w.id}">确认写入</button>
      </div>
    </div>`;
  } else if (unbinding){
    panel = `<div class="obs-hub-panel obs-preflight">
      <div class="obs-panel-head"><div><b>解除连接预演</b><span>只移除控制台中的路径，不删除仓库文件</span></div></div>
      <div class="obs-preflight-grid">
        <span>当前主页</span><b>${esc(bound)}</b>
        <span>解除后</span><b>需要重新连接才能打开或更新</b>
      </div>
      <div class="obs-panel-actions">
        <button class="btn btn-ghost btn-sm" data-act="obsidianUnbindCancel">返回</button>
        <button class="btn btn-sm obs-danger" data-act="obsidianUnbindProject" data-id="${w.id}">确认解除</button>
      </div>
    </div>`;
  } else if (open && bound){
    panel = `<div class="obs-hub-panel obs-quick-actions" aria-label="Obsidian 主页操作">
      <div class="obs-panel-actions">
        <button class="btn btn-ghost btn-sm" data-act="obsidianUpdateAsk" data-id="${w.id}">写入项目资料</button>
        <button class="btn btn-ghost btn-sm" data-act="obsidianChange" data-id="${w.id}">连接设置</button>
      </div>
    </div>`;
  }

  return `<div id="obsHub-${w.id}" class="obs-hub ${stateCls}${open?' is-open':''}${returned?' is-returned':''}" data-obs-state="${state}">
    <div class="obs-hub-head">
      <div><div class="obs-hub-title">Obsidian 项目资料</div><div class="obs-hub-sub">项目资料中枢</div></div>
      ${bound ? `<button class="obs-hub-more" data-act="obsidianHubToggle" data-id="${w.id}" aria-label="Obsidian 主页操作" aria-expanded="${open?'true':'false'}">${IC.more('currentColor')}</button>`
              : `<span class="badge ${configured?'b-slate':'b-amber'}">${state}</span>`}
    </div>
    <div class="obs-route">
      <div class="obs-node obs-source">
        <span class="obs-node-icon">${IC.code('currentColor')}</span>
        <span class="obs-node-copy"><b>${esc(w.name)}</b><small>任务 ${counts.todo + counts.fix} · 记录 ${counts.note}</small></span>
      </div>
      <div class="obs-bridge" aria-label="${state}">
        <span class="obs-bridge-line"><i></i></span><small>${state}</small>
      </div>
      <button class="obs-node obs-target" data-act="${targetAct}" data-id="${w.id}"${targetV} aria-label="${targetTitle}">
        <span class="obs-node-icon">${IC.note('currentColor')}</span>
        <span class="obs-node-copy"><b>${targetTitle}</b><small>${esc(targetMeta)}</small></span>
        ${IC.chevR('currentColor')}
      </button>
    </div>
    ${panel}
  </div>`;
}

/* 区块 3 · 开发上下文：项目任务 / 项目记录 / Obsidian / 文件 / Agent 上下文。
   任务和记录只在项目内呈现；S.todos / S.notes 仍是底层单一事实源。 */
function projDevHTML(w){
  const d = DATA.devContext[w.name] || {files:[], lastEdit:'—'};
  const line = (k, v) => `<div class="d-line"><span class="d-k">${k}</span><span class="d-v">${v}</span></div>`;
  const c = devCounts(w.name);
  const tasks = projTasks(w.name).filter(t => !t.done);
  const notes = projNotes(w.name);
  const noteRow = n => `<div class="row">
      <span class="r-title">${esc(n.title)}</span>
      <button class="link" data-act="gotoNote" data-id="${n.id}" title="编辑这条项目记录">编辑</button>
    </div>`;
  const task = devTaskOf(w.id);
  const PRI_C = {cur:'var(--brand)', 高:'var(--brand)', 中:'var(--amber)', 低:'var(--ink-3)'};
  /* 区域看板：当前任务（可多个 / 可为空）+ 高 / 中 / 低 三个优先级区。
     拖拽是主要交互：拖入哪个区域即成为该区域状态（当前 / 优先级），区域间互拖实时联动；
     每个区域底部有手柄可调整高度（S.zoneH 按项目记忆）。 */
  const curIds = devTidsOf(w.id);
  const inCur = id => curIds.includes(id);
  const curTasks = curIds.map(id => tasks.find(t=>t.id===id)).filter(Boolean);
  const zoneRow = (t, inCurZone) => `<div class="row task-row" draggable="true" data-drag-todo="${t.id}"
      title="拖到其他区域可切换状态">
      ${inCurZone ? `<button class="cb ${t.done?'on':''}" data-act="tick" data-id="${t.id}" aria-label="勾选完成">${IC.check('#fff')}</button>` : ''}
      <span class="r-title ${t.done?'done':''}">${esc(t.text)}</span>
      ${inCurZone
        ? `<button class="link" data-act="editCurTask" data-id="${t.id}" title="打开待办编辑抽屉修改">编辑</button>
           <button class="link" data-act="outCurTask" data-id="${w.id}" data-v="${t.id}" title="移出当前任务区，回到原优先级">移出</button>`
        : `<button class="link" data-act="promoteTask" data-id="${w.id}" data-v="${t.id}" title="加入当前任务区">设为当前</button>
           <button class="link" data-act="gotoTodo" data-id="${t.id}" title="编辑这条项目任务">编辑</button>`}
    </div>`;
  const zoneHTML = (key, label, rows, hint) => {
    const h = (S.zoneH[w.id] || {})[key];
    return `<div class="pz" data-zone="${key}" data-proj="${w.id}">
      <div class="pz-head"><i style="width:7px;height:7px;border-radius:50%;background:${PRI_C[key]}"></i>${label}<b>${rows.length}</b></div>
      <div class="pz-body" style="${h ? 'height:' + h + 'px' : ''}">${rows.join('') || `<div class="pz-empty">${hint}</div>`}</div>
      <div class="pz-resize" data-pz-resize="${key}" title="拖动调整区域高度"><i></i></div>
    </div>`;
  };
  const zonesHTML =
    zoneHTML('cur', '当前任务', curTasks.map(t=>zoneRow(t,true)), '拖任务进来即成为当前任务 · 可多个 · 可为空') +
    TASK_PRI.map(p => zoneHTML(p, p + '优先级',
      tasks.filter(t => !inCur(t.id) && priOf(t)===p).map(t=>zoneRow(t,false)),
      `拖入即设为${p}优先级`)).join('');
  /* 卡头已整体删除：原标题「继续开发 <项目名>」与页头 h1、概览卡 ov-name 三处重复，
     同行的 devContext.status 徽章也一并下线（该字段现在只在「编辑基本资料」弹窗的 nm-meta 里出现）。 */
  return `<section class="card">
    <div class="dev-cols">
      <div class="dev-col">
        ${task ? `<div class="d-line"><span class="d-k">本轮任务</span><span class="d-v">${esc(task.text)}</span></div>` : ''}
        <div style="display:flex;gap:20px;padding:2px 0 2px">
          <div class="lead-metric"><span class="lm-k">项目任务</span><span class="lm-v">${c.todo + c.fix}</span></div>
          <div class="lead-metric"><span class="lm-k">项目记录</span><span class="lm-v">${c.note}</span></div>
        </div>
        <div style="display:flex;align-items:baseline;gap:10px;margin-top:8px">
          <div class="card-title" style="font-size:13px;margin-top:0">项目任务<small>当前 / 高 / 中 / 低 · 拖入区域即切换状态</small></div>
          <button class="link" data-act="newTodoFor" data-v="${esc(w.name)}">新建任务</button>
        </div>
        ${zonesHTML}
      </div>
      <div class="dev-col">
        ${obsidianHubHTML(w, c)}
        <div style="display:flex;align-items:baseline;gap:10px;margin-top:12px">
          <div class="card-title" style="font-size:13px;margin-top:0">项目记录<small>灵感、决策与开发过程</small></div>
          <button class="link" data-act="newNoteFor" data-v="${esc(w.name)}">新建记录</button>
        </div>
        ${notes.length ? `<div class="list">${notes.map(noteRow).join('')}</div>`
                       : `<div class="empty">${IC.note('currentColor')}<span>还没有项目记录</span></div>`}
        ${projectFilesHTML(w)}
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:12px">
      <button class="btn btn-ghost btn-sm" data-act="copyAgent" data-id="${w.id}">复制 Agent 上下文</button>
      <button class="btn btn-ghost btn-sm" data-act="editBasicInfo" data-id="${w.id}">编辑基本资料</button>
    </div>
  </section>`;
}

function projectFilesHTML(project){
  const files = projectFilesOf(project.id);
  const row = file => `<div class="row">
    <span class="ricon">${IC.file('#2563EB')}</span>
    <span class="r-title" title="${esc(file.path)}">${esc(file.name)}</span>
    <span class="r-meta" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(file.path)}</span>
    <button class="link" data-act="openProjectFile" data-id="${file.id}">打开</button>
    <button class="link" data-act="projectFileDeleteAsk" data-id="${file.id}">移除</button>
  </div>`;
  return `<div style="display:flex;align-items:baseline;gap:10px;margin-top:12px">
      <div class="card-title" style="font-size:13px;margin-top:0">项目文件<small>仅管理当前项目关联的本机文件</small></div>
      <button class="link" data-act="addProjectFile" data-id="${project.id}">添加文件</button>
    </div>
    ${files.length ? `<div class="list">${files.map(row).join('')}</div>`
      : `<div class="empty">${IC.folder('currentColor')}<span>还没有关联文件</span></div>`}`;
}
function newProjectFile(projectId){
  const project = DATA.projects.find(item => item.id === projectId); if (!project) return false;
  openModal(`${mHead('添加项目文件', project.name)}
    <input id="projectFilePath" class="drawer-input" placeholder="粘贴本机文件完整路径">
    <div class="hint-line">只登记已存在的文件；打开时交给 Windows 默认程序。移除关联不会删除电脑上的原文件。</div>
    ${mActs(`<button class="btn btn-primary btn-sm" data-act="saveProjectFile" data-id="${project.id}">${IC.check('#fff')}添加</button>
      <button class="btn btn-ghost btn-sm" data-act="closeModal">取消</button>`)}`, {form:true});
  setTimeout(()=>{ const field = $('#projectFilePath'); if (field) field.focus(); }, 60);
  return true;
}
function saveProjectFile(projectId){
  const field = $('#projectFilePath'); const path = ((field && field.value) || '').trim();
  if (!path){ toast('请先粘贴文件完整路径'); return false; }
  void apiRequest(`/projects/${encodeURIComponent(projectId)}/files`, {method:'POST', body:JSON.stringify({path})})
    .then(row => {
      const map = new Map(DATA.projects.map(project => [project.id, project]));
      const item = backendProjectFileFromApi(row, map); if (!item) throw new Error('后端返回的项目文件无效');
      S.projectFiles.push(item); closeModal(); render(true); toast(`已关联「${item.name}」`);
    })
    .catch(err => toast(err && err.message ? err.message : '添加项目文件失败'));
  return true;
}
function openProjectFile(fileId){
  const item = S.projectFiles.find(file => file.id === fileId); if (!item) return false;
  void apiRequest(`/project-files/${encodeURIComponent(fileId)}/open`, {method:'POST'})
    .then(() => toast(`已交给系统打开「${item.name}」`))
    .catch(err => toast(err && err.message ? err.message : '打开项目文件失败'));
  return true;
}
function openProjectFiles(projectId){
  const project = DATA.projects.find(item => item.id === projectId); if (!project) return false;
  const files = projectFilesOf(projectId);
  if (!files.length){ toast('当前项目还没有关联文件'); return false; }
  if (files.length === 1) return openProjectFile(files[0].id);
  const rows = files.map(file => `<div class="row">
    <span class="ricon">${IC.file('#2563EB')}</span>
    <span class="r-title" title="${esc(file.path)}">${esc(file.name)}</span>
    <button class="link" data-act="openProjectFile" data-id="${file.id}">打开</button>
  </div>`).join('');
  openModal(`${mHead('打开项目文件', project.name)}
    <div class="hint-line">选择一个已关联的本机文件，交给 Windows 默认程序打开。</div>
    <div class="list">${rows}</div>
    ${mActs(`<button class="btn btn-ghost btn-sm" data-act="closeModal">取消</button>`)}`);
  return true;
}
function requestProjectFileDelete(fileId){
  void apiRequest(`/project-files/${encodeURIComponent(fileId)}/delete-preview`)
    .then(preview => {
      const item = preview && preview.file; if (!item) throw new Error('删除预演无效');
      openModal(`${mHead('移除项目文件关联', item.name)}
        <div class="hint-line">将只移除当前项目内的关联，不会删除电脑上的原文件。</div>
        <div class="d-lines"><div class="d-line"><span class="d-k">文件路径</span><span class="d-v">${esc(item.path)}</span></div></div>
        ${mActs(`<button class="btn btn-danger btn-sm" data-act="projectFileDeleteConfirm" data-id="${item.id}">确认移除关联</button>
          <button class="btn btn-ghost btn-sm" data-act="closeModal">取消</button>`)}`);
    })
    .catch(err => toast(err && err.message ? err.message : '无法读取移除预演'));
  return true;
}
function deleteProjectFile(fileId){
  void apiRequest(`/project-files/${encodeURIComponent(fileId)}`, {method:'DELETE'})
    .then(() => { S.projectFiles = S.projectFiles.filter(file => file.id !== fileId); closeModal(); render(true); toast('已移除项目文件关联，原文件未删除'); })
    .catch(err => toast(err && err.message ? err.message : '移除项目文件关联失败'));
  return true;
}

/* 区块 3 · 运行流程（2026-09-14 与「运行状态」合并为一张卡，并承接原「执行模块」卡：
   「添加模块」入口迁入卡头；模块异常点名也在此反馈。编辑模式下运行状态仍是独立卡。 */
function projRunHTML(w, r, runOpen){
  const on = w.steps.filter(s=>s.on);
  const prep = preflight(w);
  const live = r && r.wfId===w.id ? r : null;
  const failed = !!(live && live.status === 'failed');
  const finished = !!(live && (live.status === 'succeeded' || live.done >= live.total));
  const closing = !!(live && live.action === 'stop');
  const restarting = !!(live && live.action === 'restart');
  const status = live ? (failed
    ? (closing ? '关闭失败' : restarting ? '重启失败' : '运行失败')
    : finished
      ? (closing ? '已关闭' : restarting ? '已重启' : '已完成')
      : (closing ? '关闭中' : restarting ? '重启中' : '运行中')) : '空闲';
  const statusCls = live ? (failed ? 'b-amber' : finished ? 'b-green' : 'b-blue') : 'b-slate';
  /* 线性流程视图（极简）：一条主线串起步骤节点，只留 节点 + 连线 + 状态标识。
     状态：已完成（绿√）→ 进行中（品牌色高亮，随运行进度推进）→ 未开始（空心）；空闲时全部为未开始。
     步骤较多时按每行 5 个折行、蛇形走向（第二行反向），行间用 S 形曲线衔接 —— 走向清晰、连线不交叉。
     并行关系不画在主线上，收进节点 tooltip。 */
  const parIds = new Set();
  wfFlowItems(on).forEach(it => { if (it.parallel) it.members.forEach((s,i) => { if (i > 0) parIds.add(s.id); }); });
  const nodeHTML = s => {
    const st = !live ? 'idle' : (live.states[s.id]==='done' ? 'done' : live.states[s.id]==='now' ? 'now' : 'wait');
    const tip = s.label + (s.note ? ' · ' + s.note : '') + (parIds.has(s.id) ? '（与上一步并行）' : '');
    return `<div class="flow-node ${st}" title="${esc(tip)}">
      <span class="flow-dot">${st==='done' ? '✓' : ''}</span>
      <span class="flow-label">${esc(s.label)}</span>
    </div>`;
  };
  const FLOW_PER_ROW = 5;
  const flowRows = [];
  for (let i = 0; i < on.length; i += FLOW_PER_ROW) flowRows.push(on.slice(i, i + FLOW_PER_ROW));
  /* 转折点箭头：S 弯末端带指向箭头，tip 落在下一行首节点的圆边上（90% ± 9px）；
     左转弯用 scaleX(-1) 镜像，箭头始终指向行进方向。 */
  const turnSVG = rev => `<svg viewBox="0 0 60 30" width="60" height="30" fill="none" aria-hidden="true"${rev ? ' style="transform:scaleX(-1)"' : ''}><path d="M8 2 C 58 2 58 24 22 24" stroke="var(--line)" stroke-width="2" stroke-linecap="round"/><path d="M30 19 L 21 24 L 30 29" stroke="var(--ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
  const flowHTML = flowRows.map((row, ri) => {
    const rev = ri % 2 === 1;
    const items = rev ? row.slice().reverse() : row;
    const line = `<div class="flow-line${rev ? ' rev' : ''}">${items.map(nodeHTML).join('')}</div>`;
    const turn = ri < flowRows.length - 1
      ? `<div class="flow-turn ${rev ? 'turn-left' : 'turn-right'}">${turnSVG(rev)}</div>` : '';
    return line + turn;
  }).join('');
  const hist = Array.isArray(w.history) ? w.history.slice(0, 3) : [];
  return `
  <section class="card run-console">
    <div class="card-head">
      <div class="card-title">运行状态<small>${esc(w.name)} · ${on.length} 个启用模块</small></div>
      <div class="right">
        <span class="badge ${statusCls}">${status}</span>
        <button class="btn btn-ghost btn-sm" data-act="editWf" data-id="${w.id}" title="进入编辑模式，从执行模块库添加 / 编排模块">添加模块</button>
      </div>
    </div>
    ${runSummaryBodyHTML(w, r, runOpen)}
    <div class="card-title" style="font-size:13px;margin-top:8px">主流程</div>
    ${on.length ? flowHTML : `<div class="empty">${IC.plus('currentColor')}<span>暂无启用的执行模块</span></div>`}
    ${prep.issues.length ? `<div class="hint-line" style="display:flex;flex-direction:column;gap:2px;margin-top:6px">
      ${prep.issues.map(i=>`<span>· ${esc(i.mod)}：${esc(i.t)}</span>`).join('')}
    </div>` : ''}
    <div class="card-title" style="font-size:13px;margin-top:10px">历史记录<small>共 ${w.runs} 次 · 最近 ${hist.length} 次</small></div>
    ${hist.length ? `<div class="list">${hist.map(h => {
      const ok = h.status === 'succeeded', failed = h.status === 'failed';
      return `<div class="row"><span class="r-title">${esc(h.t)}</span><span class="r-meta">${esc(h.d)}</span><span class="badge ${ok ? 'b-green' : failed ? 'b-amber' : 'b-blue'}">${ok ? '成功' : failed ? '失败' : '进行中'}</span></div>`;
    }).join('')}</div>` : `<div class="empty">${IC.clock('currentColor')}<span>尚无运行记录</span></div>`}
  </section>`;
}

/* 区块 6 · 设置：项目级开关（Mock，仅前端状态）+ 危险操作（删除项目，预演 + 二次确认） */
function projSettingsHTML(w){
  const sw = (label, desc, on, key) => `
    <div class="set-row">
      <div class="s-txt"><div class="s-t">${label}</div><div class="s-d">${desc}</div></div>
      <button class="switch ${on?'on':''}" data-act="switch" data-k="${key}"><i></i></button>
    </div>`;
  return `<section class="card">
    <div class="card-head"><div class="card-title">项目设置<small>仅当前项目生效（Mock）</small></div></div>
    ${sw('运行完成后通知','项目运行流程跑完推送系统通知', true, 'pjNotify')}
    ${sw('失败自动重试','步骤失败后自动重试一次', false, 'pjRetry')}
  </section>
  <button class="danger-bar" data-act="projDeleteAsk" data-id="${w.id}"
    title="${DATA.projects.length <= 1 ? '至少要保留一个项目' : '删除项目（点击后先预演删除范围，再二次确认）'}">删除项目</button>`;
}

/* 删除项目确认弹窗：先预演删除范围，再二次确认（硬约束：删数据的操作必须有预演） */
function projDeleteModalHTML(){
  const p = DATA.projects.find(x=>x.id===S.projConfirm);
  if (!p) return '';
  const kids = projKids(p.id);
  /* 预演要写清「连带删掉什么」——待办与记录按项目名归属，删项目必须一起清，
     不然新建同名项目时旧条目会原地复活（见 purgeProjRefs）。 */
  const pc = projPurgeCounts(p.name);
  const remote = S.projDeletePreview && S.projDeletePreview.projectId === p.id ? S.projDeletePreview : null;
  const taskCount = remote ? Number(remote.taskCount) || 0 : pc.todos;
  const noteCount = remote ? Number(remote.noteCount) || 0 : pc.notes;
  const bindingCount = remote ? Number(remote.moduleBindingCount) || 0 : p.steps.length;
  const runCount = remote ? Number(remote.runCount) || 0 : Number(p.runs) || 0;
  const purge = (pc.todos || pc.notes)
    ? `当前页面还会清掉它名下的 ${pc.todos} 条待办、${pc.notes} 条项目记录。`
    : '';
  const moved = `执行模块本体不会删除${pc.modules ? `，${pc.modules} 个旧模块归属会回到「${DEFAULT_PROJ}」` : ''}。`;
  return `
  <div class="modal-mask" data-act="projDeleteCancel"></div>
  <div class="modal" role="dialog" aria-modal="true">
    <div class="m-title">删除「${esc(p.name)}」？</div>
    <p class="m-desc">预演：将从本机数据库删除项目「${esc(p.name)}」、${taskCount} 条任务、${noteCount} 条项目记录、${bindingCount} 个执行模块绑定和 ${runCount} 条运行记录。${
      kids.length ? `它下面还有 ${kids.length} 个子项目（${kids.map(k=>esc(k.name)).join('、')}），删除后这些子项目会提升为独立项目，不会被一起删掉。` : ''
    }${purge}${moved}不会删除磁盘上的项目文件。</p>
    <div class="m-acts">
      <button class="btn btn-ghost btn-sm" data-act="projDeleteCancel">取消</button>
      <button class="btn btn-sm m-danger" data-act="projDelete" data-id="${p.id}">确认删除</button>
    </div>
  </div>`;
}
function applyProjectDelete(id, deleted){
  /* 兜底：预演入口已拦「最后一个项目」，这里再挡一次，防止有人直接调到这个函数 */
  if (DATA.projects.length <= 1){ S.projConfirm = ''; render(true); toast('至少要保留一个项目'); return; }
  const i = DATA.projects.findIndex(x=>x.id===id); if (i < 0) return;
  const lifted = unwrapProjKids(id);          // 先把子项目提升为根，再删父项目
  const gone = DATA.projects.splice(i,1)[0];
  const pc = projPurgeCounts(gone.name);      // 先统计再清理
  const removedTaskIds = S.todos.plan.filter(task => task.proj === gone.name).map(task => task.id);
  const removedNoteIds = S.notes.filter(note => note.proj === gone.name).map(note => note.id);
  purgeProjRefs(gone.name, id);               // 待办 / 记录 / 模块归属 / 开发上下文，一并清干净
  removedTaskIds.forEach(taskId => BACKEND_TASK_IDS.delete(taskId));
  removedNoteIds.forEach(noteId => BACKEND_NOTE_IDS.delete(noteId));
  BACKEND_PROJECT_IDS.delete(id); REAL_PROJECT_IDS.delete(id);
  delete S.obsidian.bindings[id];
  persistObsidianState();
  S.projConfirm = ''; S.projDeletePreview = null;
  const wasCurrent = S.wf === id;
  if (wasCurrent){ S.wf = (DATA.projects[0]||{}).id || ''; S.wfEdit = null; S.running = null; }
  addActivity(`删除了项目「${gone.name}」`, '项目模块', 'close', C.amber, '项目');
  const runCount = deleted && Number.isFinite(Number(deleted.runCount)) ? Number(deleted.runCount) : Number(gone.runs) || 0;
  toast(`已删除项目「${gone.name}」` + (lifted ? `，${lifted} 个子项目已提升为独立项目` : '')
    + (runCount ? `，并删除 ${runCount} 条运行记录` : '')
    + (pc.todos || pc.notes ? `，并清掉 ${pc.todos} 条待办、${pc.notes} 条记录` : ''));
  /* 删掉的是当前正打开的项目（或已删空）：回到项目选择页 */
  if (wasCurrent || !DATA.projects.length) go('projects'); else render(true);
}
async function requestProjectDelete(id){
  if (DATA.projects.length <= 1){ toast('至少要保留一个项目，删不了最后一个'); return; }
  if (!BACKEND_PROJECT_IDS.has(id)){ toast('项目尚未由后端保存'); return; }
  try {
    const preview = await apiRequest(`/projects/${encodeURIComponent(id)}/delete-preview`);
    S.projDeletePreview = {projectId:id, ...preview};
    S.projConfirm = id; render(true);
  } catch (err){ toast(err && err.message ? err.message : '项目删除预演失败'); }
}
function projDelete(id){
  if (DATA.projects.length <= 1){ S.projConfirm = ''; render(true); toast('至少要保留一个项目'); return; }
  if (typeof fetch !== 'function') return applyProjectDelete(id, null);
  if (!BACKEND_PROJECT_IDS.has(id)){ toast('项目尚未由后端保存'); return; }
  if (!S.projDeletePreview || S.projDeletePreview.projectId !== id){ toast('请先完成删除预演'); return; }
  void apiRequest(`/projects/${encodeURIComponent(id)}`, {method:'DELETE'})
    .then(deleted => applyProjectDelete(id, deleted))
    .catch(err => toast(err && err.message ? err.message : '项目删除失败'));
}

/* ---------------- 进入项目页 · 标题旁的项目状态切换控件 ----------------
   形态：pill（当前状态色 + 圆点 + 状态名 + chevron）—— 点击展开三态菜单。
   切换后立刻写回 DATA.projects.st / .stCls，卡片 badge、总控台 chip 与抽屉同源更新。 */
function projStatusCtl(w){
  const d = projStDef(w.st);
  return `<button class="st-switch ${d.cls}" data-act="projStMenu" data-id="${w.id}"
      aria-haspopup="true" title="切换项目状态（当前：${esc(d.v)}）">
    <span class="dot"></span><span>${esc(d.v)}</span>
    <span class="st-c"><svg viewBox="0 0 24 24" fill="none"><path d="M7.5 10.5L12 15l4.5-4.5"
      stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
  </button>`;
}
function projStPop(btn, id){
  const w = DATA.projects.find(x=>x.id===id); if (!w) return;
  const r = btn.getBoundingClientRect();
  openPop('projStPop', r.left, r.bottom, `
    <div class="pop-h">项目状态</div>
    ${PROJ_STS.map(s=>`
      <button class="pop-item" data-act="setProjSt" data-id="${w.id}" data-v="${esc(s.v)}">
        <span class="dot" style="background:${s.c}"></span>
        <span style="flex:1">
          <span style="display:block;${s.v===w.st?'font-weight:500':''}">${esc(s.v)}</span>
          <span style="display:block;font-size:11px;color:var(--ink-3)">${esc(s.dsc)}</span>
        </span>
        ${s.v===w.st?`<span style="width:15px;height:15px;display:block;color:${s.c}">${IC.check(s.c)}</span>`:''}
      </button>`).join('')}`);
}
/* 切换项目状态：单点写入 st + stCls 并记一条动态；
   返回是否真的发生了变化（同值 / 未知项目 / 未知状态都不算变化），供 UI 与测试复用 */
function setProjStatus(id, st){
  const w = DATA.projects.find(x=>x.id===id); if (!w) return false;
  const s = PROJ_STS.find(x=>x.v===st); if (!s || w.st === s.v) return false;
  const from = w.st;
  w.st = s.v; w.stCls = s.cls;
  addActivity(`项目「${w.name}」状态：${from} → ${s.v}`, '项目模块', 'check', s.c, '项目');
  toast(`「${w.name}」状态已切换为「${s.v}」`);
  return true;
}

/* 总控台 · 切换当前项目：按钮旁弹出项目清单浮层，点选即把该项目设为当前项目。
   原 focusProj 直接把「切换」逻辑写在分支里，但按钮只出现在当前项目卡上，
   data-id 恒等于 S.proj，`id !== S.proj` 恒假 —— 按钮永远没反应。 */
function projSwitchPop(btn){
  const r = btn.getBoundingClientRect();
  openPop('projSwitchPop', r.left, r.bottom, `
    <div class="pop-h">切换当前项目</div>
    ${DATA.projects.map(p=>{
      const c = projStColor(p.st);
      return `<button class="pop-item" data-act="setCurProj" data-id="${p.id}">
        <span class="dot" style="background:${c}"></span>
        <span style="flex:1;${p.id===S.proj?'font-weight:500':''}">${esc(p.name)}</span>
        ${p.id===S.proj?`<span style="width:15px;height:15px;display:block;color:${c}">${IC.check(c)}</span>`:''}
      </button>`;}).join('')}`);
}

/* ---------------- 概览 · 身份卡：项目内容内联编辑窗口 ----------------
   形态：不弹层、不跳页 —— 直接把身份展示换成编辑表单，保持页面上下文不丢失。
   字段：项目标题（必填）+ 项目正文（必填，多行）；输入时实时字数统计；
        保存前校验，空值在表单内给出明确提示并聚焦到第一个出错项。
   改名副作用：标题一旦变化，必须同步迁移所有「按项目名索引 / 引用」的 Mock 结构
        （projMeta / devContext / 活动流 / 待办 / 执行模块），否则「开发上下文」会查不到
        key 而回落成空态 —— 那等于悄悄丢了功能。删除项目同理，走 purgeProjRefs 清干净。 */
const PE_LIMIT = { name:40, body:200 };

/* 纯校验：不读 DOM、不改数据，便于单测与复用 */
function projEditCheck(nameRaw, bodyRaw){
  const name = String(nameRaw == null ? '' : nameRaw).trim();
  const body = String(bodyRaw == null ? '' : bodyRaw).trim();
  const err = { name:'', body:'' };
  if (!name) err.name = '项目标题不能为空';
  if (!body) err.body = '项目正文不能为空';
  return { name, body, err, ok: !err.name && !err.body };
}

/* 项目删除：把「按项目名 / 项目 id 引用」的 Mock 结构一并清干净。
   与 renameProjRefs 是一对——改名是「搬过去」，删除是「清掉」，两边口径必须对齐，
   否则会出现「删了项目、待办还留着，同名新建之后原地复活」。
   S.acts 活动流虽也带项目名，但那是历史记录，删除项目时保留（改名链路同样会改它）。
   执行模块是共享资源，不会被删掉——所属项目没了就归回默认归属，不留悬空名字。 */
function projPurgeCounts(name){
  return {
    todos:   ((S.todos && S.todos.plan) || []).filter(t => t.proj === name).length,
    notes:   (S.notes || []).filter(n => n.proj === name).length,
    modules: (DATA.modules || []).filter(m => m.proj === name).length
  };
}
function purgeProjRefs(name, id){
  if (!name) return false;
  const own = o => o && Object.prototype.hasOwnProperty.call(o, name);
  if (own(DATA.projMeta))   delete DATA.projMeta[name];
  if (own(DATA.devContext)) delete DATA.devContext[name];
  Object.keys(S.todos || {}).forEach(k => {
    const list = S.todos[k];
    if (!Array.isArray(list)) return;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].proj === name) list.splice(i, 1);
  });
  for (let i = (S.notes || []).length - 1; i >= 0; i--) if (S.notes[i].proj === name) S.notes.splice(i, 1);
  (DATA.modules || []).forEach(m => { if (m.proj === name) m.proj = DEFAULT_PROJ; });
  if (id){ delete S.devTask[id]; delete S.projRules[id]; }
  /* 正在编辑的记录可能刚被删掉，清掉选中态，避免弹窗指向不存在的条目 */
  if (S.noteSel && !(S.notes || []).some(n => n.id === S.noteSel)) S.noteSel = '';
  return true;
}

/* 项目改名：把「按项目名索引 / 按项目名引用」的 Mock 结构一起搬过去，避免引用悬空 */
function renameProjRefs(from, to){
  if (!from || !to || from === to) return false;
  const hasKey = o => o && Object.prototype.hasOwnProperty.call(o, from);
  if (hasKey(DATA.projMeta)){    DATA.projMeta[to]    = DATA.projMeta[from];    delete DATA.projMeta[from]; }
  if (hasKey(DATA.devContext)){  DATA.devContext[to]  = DATA.devContext[from];  delete DATA.devContext[from]; }
  (S.acts || []).forEach(a => { if (a.proj === from) a.proj = to; });
  Object.keys(S.todos || {}).forEach(k => (S.todos[k] || []).forEach(t => { if (t.proj === from) t.proj = to; }));
  (S.notes || []).forEach(n => { if (n.proj === from) n.proj = to; });   // 笔记的所属项目同样按名字引用
  (DATA.modules || []).forEach(m => { if (m.proj === from) m.proj = to; });
  return true;
}

/* 落库（无 DOM 依赖）：校验 → 重名拦截 → 写入 name/desc → 迁移引用 */
function applyProjEdit(id, nameRaw, bodyRaw){
  const w = DATA.projects.find(x => x.id === id);
  if (!w) return { ok:false, err:{ name:'项目不存在', body:'' } };
  const r = projEditCheck(nameRaw, bodyRaw);
  if (!r.ok) return { ok:false, err:r.err };
  if (DATA.projects.some(p => p.id !== id && p.name === r.name))
    return { ok:false, err:{ name:'已有同名项目，换一个标题', body:'' } };
  const from = w.name;
  w.name = r.name; w.desc = r.body; w.updated = '刚刚';
  if (from !== r.name) renameProjRefs(from, r.name);
  return { ok:true, err:{ name:'', body:'' }, from, to:r.name };
}

/* 编辑窗口本体：标题输入框 + 多行正文编辑区 + 实时字数 + 保存 / 取消 */
function projEditFormHTML(w){
  const name = w.name || '', body = w.desc || '';
  return `<section class="card ov-card">
    <div class="ov-edit-h">
      <span class="ov-edit-t">编辑项目内容</span>
      <button class="ov-edit-x" data-act="closeProjEdit" data-id="${w.id}"
        title="关闭编辑窗口" aria-label="关闭编辑窗口">${IC.close('currentColor')}</button>
    </div>
    <label class="fld">
      <span class="fld-k">项目标题<i class="req" aria-hidden="true">*</i></span>
      <input id="peName" class="fld-in" type="text" value="${esc(name)}" maxlength="${PE_LIMIT.name}"
        placeholder="给这个项目起一个名字" autocomplete="off" aria-required="true">
      <span class="fld-foot">
        <span class="fld-hint">必填 · 最多 ${PE_LIMIT.name} 字</span>
        <span class="fld-count" id="peNameCount">${name.length}/${PE_LIMIT.name}</span>
      </span>
    </label>
    <label class="fld">
      <span class="fld-k">项目正文<i class="req" aria-hidden="true">*</i></span>
      <textarea id="peBody" class="fld-in fld-ta" rows="5" maxlength="${PE_LIMIT.body}"
        placeholder="说明这个项目做什么、当前进展与下一步" aria-required="true">${esc(body)}</textarea>
      <span class="fld-foot">
        <span class="fld-hint">必填 · 最多 ${PE_LIMIT.body} 字</span>
        <span class="fld-count" id="peBodyCount">${body.length}/${PE_LIMIT.body}</span>
      </span>
    </label>
    <div class="fld-err" id="peErr" role="alert" hidden></div>
    <div class="ov-edit-acts">
      <button class="btn btn-ghost btn-sm" data-act="closeProjEdit" data-id="${w.id}">取消</button>
      <button class="btn btn-primary btn-sm" data-act="saveProjEdit" data-id="${w.id}">保存</button>
    </div>
  </section>`;
}

function openProjEdit(id){
  const w = DATA.projects.find(x => x.id === id); if (!w) return false;
  S.projEdit = id;
  render(true);
  const el = $('#peName');                      // 打开即聚焦标题，键盘可直接开写
  if (el){ el.focus(); try{ el.setSelectionRange(el.value.length, el.value.length); }catch(_){} }
  return true;
}
function closeProjEdit(id){
  if (S.projEdit == null) return false;
  if (id && S.projEdit !== id) return false;
  S.projEdit = null; render(true);
  return true;
}
/* 校验失败：把提示写进表单（不整页重渲染，保住输入焦点与光标位置） */
function peShowErr(msg, fieldId){
  const box = $('#peErr');
  if (box){ box.textContent = msg || ''; box.hidden = !msg; }
  ['peName','peBody'].forEach(fid => {
    const f = $('#' + fid); if (!f) return;
    const wrap = f.closest ? f.closest('.fld') : null;
    if (wrap) wrap.classList.toggle('bad', !!msg && fid === fieldId);
  });
}
async function saveProjEdit(id){
  const nEl = $('#peName'), bEl = $('#peBody');
  const nameRaw = nEl ? nEl.value : '', bodyRaw = bEl ? bEl.value : '';
  const checked = projEditCheck(nameRaw, bodyRaw);
  const w = DATA.projects.find(x => x.id === id);
  if (!w || !checked.ok || DATA.projects.some(p => p.id !== id && p.name === checked.name)){
    const err = !w ? '项目不存在' : (!checked.ok ? checked.err.name || checked.err.body : '已有同名项目，换一个标题');
    const first = !checked.ok && checked.err.body && !checked.err.name ? 'peBody' : 'peName';
    peShowErr(err, first);
    const f = $('#' + first); if (f && f.focus) f.focus();
    return false;
  }
  if (BACKEND_PROJECT_IDS.has(id)){
    try {
      await apiRequest(`/projects/${id}`, {
        method:'PATCH', body:JSON.stringify({name:checked.name, description:checked.body, status:w.st})
      });
    } catch (err){
      peShowErr(err && err.message ? err.message : '项目保存失败', 'peName');
      if (nEl && nEl.focus) nEl.focus();
      return false;
    }
  }
  const r = applyProjEdit(id, checked.name, checked.body);
  S.projEdit = null;
  addActivity(`更新了项目「${r.to}」的内容`, r.to, 'pen', C.blue, '项目');
  render(true);
  toast(`已保存「${r.to}」`);
  return true;
}
/* 实时字数统计：直接改 DOM，不触发重渲染（中文输入法组合期间重渲染会打断上屏） */
function peSyncCount(which){
  if (which === 'peName'){
    const el = $('#peName'), c = $('#peNameCount');
    if (el && c) c.textContent = el.value.length + '/' + PE_LIMIT.name;
  } else if (which === 'peBody'){
    const el = $('#peBody'), c = $('#peBodyCount');
    if (el && c) c.textContent = el.value.length + '/' + PE_LIMIT.body;
  }
}

/* 新建项目：从 DATA.projectTemplate 深拷贝创建，只填 名称 / 描述 / 初始状态。走居中弹窗（窄版表单） */
const NEW_PROJ_STS = PROJ_STS.map(s=>s.v);
function newProjectDrawer(){
  openModal(`${mHead('新建项目', '从模板创建一个空项目；运行流程之后在「执行模块」里配置')}
    <div class="card-title" style="font-size:13px">项目名称</div>
    <input id="projName" value="" placeholder="例如：数据看板（留空则为「未命名项目」）"
      style="width:100%;height:42px;border-radius:12px;border:1px solid var(--line);background:var(--card-strong);padding:0 14px;font:inherit;font-size:14px;outline:none">
    <div class="card-title" style="font-size:13px;margin-top:12px">项目描述</div>
    <input id="projDesc" value="" placeholder="一句话说明这个项目做什么（可选）"
      style="width:100%;height:42px;border-radius:12px;border:1px solid var(--line);background:var(--card-strong);padding:0 14px;font:inherit;font-size:14px;outline:none">
    <div class="card-title" style="font-size:13px;margin-top:12px">初始状态</div>
    <div class="seg">
      ${NEW_PROJ_STS.map(s=>`<button class="${S.newProjSt===s?'on':''}" data-act="newProjSt" data-v="${s}">${s}</button>`).join('')}
    </div>
    ${mActs(`<button class="btn btn-primary btn-sm" data-act="createProject">创建项目</button>
      <button class="btn btn-ghost btn-sm" data-act="closeModal">取消</button>`)}`, { form:true });
}
function setNewProjectStatus(value, button){
  S.newProjSt = projStDef(value).v;
  const group = button && button.parentElement;
  if (!group || !group.querySelectorAll) return;
  Array.from(group.querySelectorAll('button')).forEach(item => {
    item.classList.toggle('on', item.dataset.v === S.newProjSt);
  });
}
function finishCreateProject(row, name, desc, st){
  const stCls = projStCls(st);
  const p = JSON.parse(JSON.stringify(DATA.projectTemplate));
  p.id = row && row.id ? row.id : 'p' + Date.now().toString(36);
  p.name = name; p.desc = desc; p.st = st; p.stCls = stCls; p.updated = '刚刚';
  DATA.projects.push(p);
  DATA.projMeta[name] = { created: nowShort() };
  if (row && row.id) BACKEND_PROJECT_IDS.add(row.id);
  S.wf = p.id; S.wfEdit = null; S.running = null; S.projConfirm = '';
  closeModal();
  addActivity(`创建了项目「${name}」`, '项目模块', 'plus', C.green, '项目');
  toast(`已创建项目「${name}」，在「执行模块」里添加模块后即可运行`);
  go('workflows');
  return p;
}
async function createProject(){
  const el1 = $('#projName'), el2 = $('#projDesc');
  const name = ((el1 && el1.value) || '').trim() || '未命名项目';
  if (DATA.projects.some(p=>p.name===name)){ toast('已有同名项目，换个名字'); return; }
  const desc = ((el2 && el2.value) || '').trim();
  const st = projStDef(S.newProjSt).v;
  /* smoke-test 没有 fetch；浏览器环境一律以后端成功为准，不静默写入内存。 */
  if (typeof fetch !== 'function') return finishCreateProject(null, name, desc, st);
  try {
    const row = await apiRequest('/projects', {
      method:'POST', body:JSON.stringify({name, description:desc, status:st})
    });
    return finishCreateProject(row, name, desc, st);
  } catch (err){ toast(err && err.message ? err.message : '项目创建失败'); }
}

/* ---------------- 项目选择页 ----------------
   一张卡片 = 一个项目。卡片上半部是信息区（点它进入项目详情），下半部是操作条
            （启动·停止 / 复制 / 刷新 / 编辑 / 删除），操作条与信息区是兄弟节点，互不抢点击。
   排布：栅格自适应列数（minmax(--tile-min,1fr)），尾部跟一张虚线「新建项目」占位卡。
   层级表达：栅格里没法做缩进，改用卡片上的「归属 / 子项目」标记 + 父项目紧邻其子项目的顺序两个信号。 */
function projParentOf(p){ return p && p.parent ? DATA.projects.find(q => q.id === p.parent) || null : null; }
function projKids(id){ return DATA.projects.filter(q => q.parent === id); }
/* 展开成带深度的扁平列表：根在前、子紧随其后。带 visited 防护，数据成环也不会死循环 */
function projFlat(){
  const out = [], seen = {};
  const walk = (p, depth) => {
    if (seen[p.id]) return;
    seen[p.id] = 1;
    out.push({ p, depth });
    projKids(p.id).forEach(k => walk(k, depth + 1));
  };
  DATA.projects.filter(p => !projParentOf(p)).forEach(p => walk(p, 0));
  return out;
}
/* 删除父项目时把子项目提升为根：层级可以丢，数据不该跟着消失 */
function unwrapProjKids(id){
  let n = 0;
  DATA.projects.forEach(q => { if (q.parent === id){ q.parent = null; n++; } });
  return n;
}
const projIsRunning = id => !!(S.running && S.running.wfId === id
  && (!S.running.status || S.running.status==='queued' || S.running.status==='running'));
const projIsStarted = id => REAL_PROJECT_IDS.has(id)
  ? S.projectRuntime[id] === 'running'
  : projIsRunning(id);

/* 项目卡与详情页共用运行状态，卡片使用原有胶囊按钮外观。 */
function projectRunControlsHTML(w, stay, card){
  const on = w.steps.filter(s=>s.on).length;
  const real = REAL_PROJECT_IDS.has(w.id);
  const busy = projIsRunning(w.id);
  const action = busy && S.running ? S.running.action : '';
  const attr = `data-id="${esc(w.id)}"`;
  const runBtn = (disabled, label) => `<button class="${card ? 'pjt-enter' : 'btn btn-primary btn-sm pjt-start'}" data-act="runProject" ${attr} data-stay="${stay ? '1' : '0'}" ${disabled ? 'disabled' : ''}
    title="${on ? '按顺序启动这个项目运行流程里所有已启用的执行模块' : '这个项目还没有启用任何执行模块'}">${IC.play(card ? 'currentColor' : '#fff')}${label}</button>`;
  const stopBtn = (disabled, label) => `<button class="${card ? 'pjt-enter' : 'btn btn-sm pjt-stop'}" data-act="stopProject" ${attr} ${disabled ? 'disabled' : ''}
    title="按原项目关闭流程停止所有关联进程">${IC.stop('currentColor')}${label}</button>`;
  const restartBtn = (disabled, label) => `<button class="${card ? 'pjt-enter' : 'btn btn-ghost btn-sm pjt-restart'}" data-act="restartProject" ${attr} ${disabled ? 'disabled' : ''}
    title="先完整关闭项目，再重新启动">${IC.reset('currentColor')}${label}</button>`;
  if (real && busy){
    if (action === 'stop') return stopBtn(true, '关闭中') + restartBtn(false, '改为重启');
    if (action === 'restart') return stopBtn(false, '改为关闭') + restartBtn(true, '重启中');
    return stopBtn(false, '关闭项目') + restartBtn(false, '重启项目');
  }
  if (real && projIsStarted(w.id)) return stopBtn(false, '关闭项目') + restartBtn(false, '重启项目');
  if (!real && busy) return stopBtn(false, '关闭项目');
  return runBtn(!on, '运行项目');
}

/* 复制：深拷贝项目（含执行模块，步骤重新发 id 避免与源项目碰撞），落地为同级的新项目 */
function dupProject(id){
  const src = DATA.projects.find(x => x.id === id); if (!src) return null;
  const base = src.name + ' 副本';
  let name = base, n = 2;
  while (DATA.projects.some(p => p.name === name)) name = base + ' ' + (n++);
  const c = JSON.parse(JSON.stringify(src));
  c.id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  c.name = name; c.updated = '刚刚';
  c.runs = 0; c.last = '—';                 // 运行数据属于源项目，副本从零开始
  c.steps.forEach((s, i) => { s.id = 'c' + Date.now().toString(36) + '_' + i; });
  DATA.projects.push(c);
  DATA.projMeta[name] = { created: nowShort() };
  addActivity(`复制了项目「${src.name}」`, '项目模块', 'copy', C.indigo, '项目');
  toast(`已创建副本「${name}」`);
  render(true);
  return c;
}

/* 刷新：重新执行预备检查并清掉这个项目的临时视图状态（运行态 / 展开态 / 编辑态）。
   非破坏性 —— 不碰步骤配置与运行历史，所以按规矩不需要二次确认。 */
function refreshProj(id){
  const w = DATA.projects.find(x => x.id === id); if (!w) return false;
  if (projIsRunning(id) && S.running && S.running.real){ toast('真实模块正在执行，完成前不能刷新运行态'); return false; }
  if (projIsRunning(id)){ clearInterval(runTimer); S.running = null; }
  delete S.runOpen[id]; delete S.devTask[id];
  if (S.projEdit === id) S.projEdit = null;
  if (S.wfEdit === id) S.wfEdit = null;
  const p = preflight(w);
  addActivity(`刷新了项目「${w.name}」`, '项目模块', 'reset', C.blue, '项目');
  toast(p.ready ? `「${w.name}」已刷新 · 预备检查全部就绪` : `「${w.name}」已刷新 · ${p.issues.length} 项待处理`);
  render(true);
  return true;
}

function viewProjects(){
  const rows = projFlat();
  const roots = rows.filter(r => r.depth === 0).length;
  return `
  <div class="page-head">
    <div>
      <h1>项目选择</h1>
      <p>${DATA.projects.length} 个项目 · ${roots} 个根项目</p>
    </div>
  </div>

  <section class="pjt-board">
    ${rows.map(r => projTileHTML(r.p)).join('')}
    <button class="pjt-card pjt-new" data-act="newProject" title="从模板新建一个空项目">
      <span class="pjt-new-ico" aria-hidden="true">${IC.plus('currentColor')}</span>
      <span class="pjt-new-t">新建项目</span>
      <span class="pjt-new-s">从模板起一个空项目</span>
    </button>
  </section>
  ${projDeleteModalHTML()}`;
}

/* 单张完整项目卡：主按钮直接运行，铅笔进入完整详情查看和编辑。 */
function projTileHTML(w){
  const parent = projParentOf(w);
  const kidCount = projKids(w.id).length;
  const live = projIsRunning(w.id) || projIsStarted(w.id);
  const accent = /^#[0-9a-fA-F]{6}$/.test(w.color) ? w.color : '#536780';
  const scene = [...String(w.id)].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0) % 3;
  const statusClass = ['pst-ok', 'pst-dev', 'pst-pause'].includes(w.stCls) ? w.stCls : 'pst-pause';
  const relation = parent ? `子项目 · ${esc(parent.name)}` : kidCount ? `${kidCount} 个子项目` : '';
  /* 状态不再和项目名挤在同一行。
     试过「名字 + 状态同行」，截图后发现长项目名会被状态挤成「APEX Automat...」——
     名字是卡面主角，让配角来抢它的宽度是本末倒置。
     现在状态下沉到描述下方，和层级信息并成一条「元信息行」：语义上它们是一类东西
     （都在讲这个项目怎么了），视觉上也不干扰项目名。 */
  const stateChip = live
    ? '<span class="pjt-state pjt-live"><i class="pjt-state-dot"></i>运行中</span>'
    : `<span class="pjt-state ${statusClass}"><i class="pjt-state-dot"></i>${esc(w.st)}</span>`;
  return `<article class="pjt-card" data-id="${esc(w.id)}" data-scene="${scene}" style="--pjt-accent:${accent}">
    <div class="pjt-visual" aria-hidden="true">
    <div class="pjt-scene" aria-hidden="true">
      <span class="pjt-sky"></span>
      <span class="pjt-sun"></span>
      <span class="pjt-ridge pjt-ridge-far"></span>
      <span class="pjt-ridge pjt-ridge-mid"></span>
      <span class="pjt-ridge pjt-ridge-near"></span>
    </div>
    </div>
    <div class="pjt-main">
      <div class="pjt-copy-plane">
      <span class="pjt-name">${esc(w.name)}</span>
      <span class="pjt-desc">${esc(w.desc)}</span>
      <div class="pjt-meta">
        ${stateChip}
        ${relation ? `<span class="pjt-relation">${relation}</span>` : ''}
      </div>
      </div>
      ${projectUpdateChipHTML(w)}
      <div class="pjt-bottom">
        <div class="pjt-run-controls">${projectRunControlsHTML(w, true, true)}</div>
      </div>
    </div>
    <div class="pjt-acts">
      <div class="pjt-icons" role="group" aria-label="项目管理操作">
        <button class="pjt-i" data-act="dupProject" data-id="${esc(w.id)}" title="复制项目（含执行模块）" aria-label="复制项目">${IC.copy('currentColor')}</button>
        <button class="pjt-i" data-act="refreshProj" data-id="${esc(w.id)}" title="刷新：重新执行预备检查并清空临时状态" aria-label="刷新项目">${IC.reset('currentColor')}</button>
        <button class="pjt-i" data-act="enterProj" data-id="${esc(w.id)}" title="编辑并进入项目" aria-label="编辑并进入${esc(w.name)}">${IC.pen('currentColor')}</button>
        <button class="pjt-i pjt-del" data-act="projDeleteAsk" data-id="${esc(w.id)}" title="${DATA.projects.length <= 1 ? '至少要保留一个项目' : '删除项目（会先预演删除范围）'}" aria-label="删除项目">${IC.trash('currentColor')}</button>
      </div>
    </div>
  </article>`;
}

/* 山景内部保持一幅画；底板小幅位移和有限倾斜，文字与控件移动更多。 */
let projectCardParallaxCleanup = null;
function initProjectCardParallax(){
  if (projectCardParallaxCleanup){ projectCardParallaxCleanup(); projectCardParallaxCleanup = null; }
  const board = $('#view .pjt-board');
  if (!board || !globalThis.matchMedia
    || !globalThis.matchMedia('(hover: hover) and (pointer: fine)').matches
    || globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let active = null, frame = 0, point = null;
  const reset = () => {
    if (!active) return;
    active.classList.remove('is-parallax');
    const visual = active.querySelector('.pjt-visual');
    visual.style.left = '';
    visual.style.top = '';
    visual.style.removeProperty('--pjt-rotate-x');
    visual.style.removeProperty('--pjt-rotate-y');
    active.querySelector('.pjt-main').style.left = '';
    active.querySelector('.pjt-main').style.top = '';
    active.querySelector('.pjt-acts').style.left = '';
    active.querySelector('.pjt-acts').style.top = '';
    active = null;
    point = null;
  };
  board.addEventListener('pointermove', e => {
    if (board.classList.contains('is-arming') || board.classList.contains('is-sorting')){ reset(); return; }
    const card = e.target.closest('.pjt-card[data-id]');
    if (!card){ reset(); return; }
    if (active !== card){ reset(); active = card; card.classList.add('is-parallax'); }
    const rect = card.getBoundingClientRect();
    point = {
      x:Math.max(-1, Math.min(1, (e.clientX - rect.left - rect.width / 2) / (rect.width / 2))),
      y:Math.max(-1, Math.min(1, (e.clientY - rect.top - rect.height / 2) / (rect.height / 2)))
    };
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!active || point === null) return;
      const visual = active.querySelector('.pjt-visual');
      visual.style.left = Math.round(point.x * 12) + 'px';
      visual.style.top = Math.round(point.y * 8) + 'px';
      visual.style.setProperty('--pjt-rotate-y', (point.x * 4).toFixed(2) + 'deg');
      visual.style.setProperty('--pjt-rotate-x', (-point.y * 3).toFixed(2) + 'deg');
      const frontX = Math.round(point.x * 20) + 'px';
      const frontY = Math.round(point.y * 12) + 'px';
      for (const selector of ['.pjt-main', '.pjt-acts']){
        const plane = active.querySelector(selector);
        plane.style.left = frontX;
        plane.style.top = frontY;
      }
    });
  });
  board.addEventListener('pointerleave', reset);
  board.addEventListener('pointerdown', e => {
    if (!e.target.closest('button')) reset();
  });
  board.addEventListener('scroll', reset, {passive:true});
  const viewport = typeof window !== 'undefined' && window && window.addEventListener ? window : null;
  if (viewport) viewport.addEventListener('resize', reset);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(reset) : null;
  if (observer) observer.observe(board);
  projectCardParallaxCleanup = () => {
    reset();
    board.removeEventListener?.('scroll', reset);
    if (viewport) viewport.removeEventListener('resize', reset);
    if (observer) observer.disconnect();
  };
}

/* ---------------- 项目选择页：卡片二维拖拽排序 ----------------
   零额外 UI：没有手柄、没有指示线、没有占位卡。长按卡片空白处约 200ms 才起拖；
   卡片内的按钮 / 链接长按不参与 —— 保持进入与管理控件可点击。
   命中判定是**二维**的：只比「拖动卡片的中心离哪个槽位的中心最近」，所以左右换位、跨行、跨列都成立。
   让位不走 CSS transition —— 卡片位移由 JS 的物理弹簧逐帧写 transform（与 initInertialScroll 同一套
   半隐式欧拉 + 固定子步积分），松手后同一套积分把卡片收进槽位，因此没有瞬移与闪烁。
   拖拽期间**不动 DOM**，只改 transform 模拟新顺序；落库成功后重渲染一次把布局落到真实位置
   （此时真实位置与 transform 后的视觉位置一致，所以看不到跳变）。
   窗口尺寸变化由 ResizeObserver 捕获：拖拽中变化 → 安全取消并归位。
   层级约定：卡片顺序就是 projFlat() 的可见顺序，落库时按「视觉名次」重排 DATA.projects，
   子项目仍紧随其父（父子不会被拖散）。 */
const PROJ_SORT = {
  holdMs:200,           // 长按多久起拖
  tolerance:8,          // 起拖前的位移容差：超过就交回原生滚动 / 当点击
  switchMargin:4,       // 换槽位前要比当前槽位近出的额外距离，压住等距处的抖动
  stiffness:260,        // 弹簧刚度
  damping:26,           // 弹簧阻尼
  step:1/240,           // 积分子步
  maxFrame:0.064,       // 单帧最多按 64ms 积分（掉帧保护，与惯性滚动同口径）
  restEps:0.4,          // 判定静止的位移阈值（px）
  restVel:14,           // 判定静止的速度阈值（px/s）
};
/* 起拖黑名单：只排除卡片内的真实控件。卡片空白可拖拽，只有明确的按钮可进入项目。 */
function projSortBlocked(target){
  return !!(target && target.closest && target.closest('button,a,input,textarea,select'));
}
/* 重排本地项目顺序。入参是后端返回的项目行数组：**以后端成功返回为准**，失败时调用方不改本地列表。 */
function applyProjectOrder(rows){
  if (!Array.isArray(rows) || !rows.length) return false;
  const rank = new Map(rows.map((row, index) => [row.id, index]));
  const rankOf = item => rank.has(item.id) ? rank.get(item.id) : Number.MAX_SAFE_INTEGER;
  DATA.projects.sort((a, b) => rankOf(a) - rankOf(b));
  return true;
}
/* 二维命中：离拖动卡片中心最近的槽位就是目标槽位。
   用「指针落在谁身上」在跨行 / 跨列时会漏判，一维顺序判定更是直接把跨行拖拽算错。
   switchMargin 是滞回：新旧槽位距离差不多时先不换，压住等值线上的抖动。 */
function projSortSlotAt(slots, cx, cy, current){
  let best = current, bestD = Infinity, currentD = Infinity;
  slots.forEach((slot, index) => {
    const dx = slot.x + slot.w / 2 - cx, dy = slot.y + slot.h / 2 - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (index === current) currentD = d;
    if (d < bestD){ bestD = d; best = index; }
  });
  return (best !== current && bestD > currentD - PROJ_SORT.switchMargin) ? current : best;
}

let projSortCtl = null;        // 当前看板的控制器（重渲染后解绑上一块）

function initProjSort(){
  if (projSortCtl) projSortCtl.destroy();
  projSortCtl = null;

  const board = $('#view .pjt-board');
  if (!board || !board.addEventListener) return null;
  const cards = $$('.pjt-card[data-id]', board);
  if (cards.length < 2) return null;                    // 0 / 1 张卡没有可换的位置
  const win = (typeof window !== 'undefined' && window && window.addEventListener) ? window : null;

  const st = {
    down:null, drag:null, hold:0, suppressClick:false, gone:false,
    slots:[], order:[], springs:new Map(), raf:0, last:0, onRest:null,
    lift:{ scale:1.03, tilt:1.2 }, observer:null, winResize:false,
  };
  const reduceMotion = !!(globalThis.matchMedia
    && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- 几何：槽位测量与二维命中 ---------- */
  const measure = () => {
    const base = board.getBoundingClientRect();
    st.slots = cards.map(el => {
      const r = el.getBoundingClientRect();
      return { el, id:el.dataset.id, x:r.left - base.left, y:r.top - base.top, w:r.width, h:r.height };
    });
    st.order = st.slots.map(slot => slot.id);
  };

  /* ---------- 弹簧积分与着色 ---------- */
  const seek = (el, tx, ty, tlift) => {
    let rec = st.springs.get(el);
    if (!rec){
      rec = { el, x:0, y:0, vx:0, vy:0, tx:0, ty:0, lift:0, liftV:0, tlift:0, follow:false };
      st.springs.set(el, rec);
    }
    rec.tx = tx; rec.ty = ty;
    if (typeof tlift === 'number') rec.tlift = tlift;
    return rec;
  };
  const paint = rec => {
    const el = rec.el;
    if (!el || !el.style) return;
    if (Math.abs(rec.x) < 0.01 && Math.abs(rec.y) < 0.01 && rec.lift < 0.001){
      el.style.transform = '';                          // 完全归位就别留 transform：否则会吞掉悬停抬升
      return;
    }
    const round = n => Math.round(n * 100) / 100;
    let text = 'translate3d(' + round(rec.x) + 'px,' + round(rec.y) + 'px,0)';
    if (rec.lift > 0.001){
      const scale = 1 + (st.lift.scale - 1) * rec.lift;
      text += ' scale(' + Math.round(scale * 1000) / 1000 + ') rotate(' + round(st.lift.tilt * rec.lift) + 'deg)';
    }
    el.style.transform = text;
  };
  const integrate = (rec, dt) => {
    const k = PROJ_SORT.stiffness, c = PROJ_SORT.damping;
    const steps = Math.max(1, Math.ceil(dt / PROJ_SORT.step));
    const h = dt / steps;
    for (let i = 0; i < steps; i++){
      if (!rec.follow){
        rec.vx += (-k * (rec.x - rec.tx) - c * rec.vx) * h; rec.x += rec.vx * h;
        rec.vy += (-k * (rec.y - rec.ty) - c * rec.vy) * h; rec.y += rec.vy * h;
      }
      rec.liftV += (-k * (rec.lift - rec.tlift) - c * rec.liftV) * h; rec.lift += rec.liftV * h;
    }
  };
  const resting = rec =>
    Math.abs(rec.x - rec.tx) < PROJ_SORT.restEps && Math.abs(rec.y - rec.ty) < PROJ_SORT.restEps
    && Math.abs(rec.vx) < PROJ_SORT.restVel && Math.abs(rec.vy) < PROJ_SORT.restVel
    && Math.abs(rec.lift - rec.tlift) < 0.01 && Math.abs(rec.liftV) < 0.6;
  const settleNow = () => st.springs.forEach(rec => {
    rec.x = rec.tx; rec.y = rec.ty; rec.lift = rec.tlift; rec.vx = rec.vy = rec.liftV = 0; paint(rec);
  });
  const loop = now => {
    st.raf = 0;
    if (st.gone) return;
    const dt = Math.min(PROJ_SORT.maxFrame, Math.max(0.001, (now - st.last) / 1000));
    st.last = now;
    let busy = false;
    st.springs.forEach(rec => { integrate(rec, dt); paint(rec); if (!resting(rec)) busy = true; });
    if (busy){ st.raf = _raf(loop); return; }
    /* 落定：精确吸附到槽位。弹簧只在 0.4px 内判定静止，不收尾的话卡片会停在差一点点的位置。
       跟指针走的那张（follow）不参与，否则会被拉回自己的槽位。 */
    st.springs.forEach(rec => {
      if (rec.follow) return;
      rec.x = rec.tx; rec.y = rec.ty; rec.lift = rec.tlift; rec.vx = rec.vy = rec.liftV = 0; paint(rec);
    });
    const done = st.onRest; st.onRest = null;
    if (done) done();
  };
  const flush = () => {
    if (reduceMotion){
      settleNow();
      const done = st.onRest; st.onRest = null;
      if (done) done();
      return;
    }
    if (st.raf) return;
    st.last = _now(); st.raf = _raf(loop);
  };

  /* ---------- 手势 ---------- */
  const cancelHold = () => {
    if (st.hold){ clearTimeout(st.hold); st.hold = 0; }
    st.down = null;
    board.classList.remove('is-arming');
  };
  const clearVisual = () => {
    if (st.raf){ _caf(st.raf); st.raf = 0; }
    st.onRest = null;
    st.springs.forEach(rec => { if (rec.el && rec.el.style) rec.el.style.transform = ''; });
    st.springs.clear();
  };
  const startDrag = () => {
    const down = st.down;
    if (!down || st.drag || st.gone) return;
    measure();
    const index = st.order.indexOf(down.id);
    if (index < 0){ cancelHold(); return; }
    st.down = null;
    board.classList.remove('is-arming');
    board.classList.add('is-sorting');
    st.lift = readLiftTokens();
    const rec = seek(down.el, 0, 0, 1);
    rec.follow = true;                                  // 起拖阶段跟指针，不归位
    st.drag = { el:down.el, id:down.id, slot:st.slots[index], pid:down.pid, ox:down.x, oy:down.y, dx:0, dy:0 };
    down.el.classList.add('is-dragging');
    flush();
  };
  /* 抬起 / 倾斜是视觉值，读 :root 令牌，不在 JS 里硬写 */
  const readLiftTokens = () => {
    const view = (globalThis.getComputedStyle) ? globalThis.getComputedStyle(board) : null;
    const read = (name, fallback) => {
      if (!view || !view.getPropertyValue) return fallback;
      const value = parseFloat(view.getPropertyValue(name));
      return isFinite(value) ? value : fallback;
    };
    return { scale:read('--pjt-lift-scale', 1.03), tilt:read('--pjt-lift-tilt', 1.2) };
  };
  /* 换位：把拖动卡片搬到 to，其余卡片按新顺序改目标位移，交回弹簧 */
  const applyOrder = to => {
    const from = st.order.indexOf(st.drag.id);
    if (from < 0 || from === to) return;
    st.order.splice(to, 0, st.order.splice(from, 1)[0]);
    st.slots.forEach(slot => {
      if (slot.el === st.drag.el) return;               // 被拖的那张跟指针，不归位
      const target = st.slots[st.order.indexOf(slot.id)];
      seek(slot.el, target.x - slot.x, target.y - slot.y);
    });
    flush();
  };
  /* 松手：所有卡片（含被拖的那张）一起收进各自槽位，落定后再提交 */
  const endDrag = () => {
    const drag = st.drag;
    if (!drag) return;
    st.drag = null;
    st.suppressClick = true;                            // 拖拽结束时拦截可能产生的点击
    setTimeout(() => { st.suppressClick = false; }, 0);
    drag.el.classList.remove('is-dragging');
    board.classList.remove('is-sorting');
    st.slots.forEach(slot => {
      const target = st.slots[st.order.indexOf(slot.id)];
      const rec = seek(slot.el, target.x - slot.x, target.y - slot.y);
      rec.follow = false;
      if (slot.el === drag.el) rec.tlift = 0;           // 落位同时去浮（缩放 / 倾斜回落到 1 / 0）
    });
    const changed = st.order.join('|') !== st.slots.map(slot => slot.id).join('|');
    st.onRest = changed ? commit : null;                // 只抬起又放下：归位即可，不发请求
    flush();
  };
  /* 安全取消：顺序回滚到本轮开始，视觉位置全部归零 */
  const abortDrag = message => {
    if (!st.down && !st.drag) return;
    cancelHold();
    const drag = st.drag;
    st.drag = null;
    if (drag && drag.el) drag.el.classList.remove('is-dragging');
    board.classList.remove('is-sorting', 'is-arming');
    st.order = st.slots.map(slot => slot.id);
    st.slots.forEach(slot => {
      const rec = seek(slot.el, 0, 0);
      rec.follow = false; rec.tlift = 0;
    });
    st.onRest = null;
    flush();
    if (message) toast(message);
  };
  const commit = async () => {
    if (st.gone) return;
    const rank = new Map(st.order.map((id, index) => [id, index]));
    const rankOf = item => rank.has(item.id) ? rank.get(item.id) : Number.MAX_SAFE_INTEGER;
    const ids = DATA.projects.slice().sort((a, b) => rankOf(a) - rankOf(b)).map(item => item.id);
    try {
      const rows = await apiRequest('/projects/order', { method:'PUT', body:JSON.stringify({ project_ids:ids }) });
      if (st.gone) return;
      applyProjectOrder(rows);
      render(true);                                     // 真实位置已与视觉位置一致，重渲染看不到跳变
    } catch (err){
      if (st.gone) return;
      st.slots.forEach(slot => { const rec = st.springs.get(slot.el); if (rec){ rec.tx = 0; rec.ty = 0; } });
      st.onRest = null;
      flush();                                          // 弹回原位
      toast(err && err.message ? err.message : '项目排序未保存');
    }
  };

  /* ---------- 事件 ---------- */
  const onDown = e => {
    if (st.gone || st.down || st.drag) return;
    if (e.button != null && e.button !== 0) return;      // 只认左键 / 触摸
    st.suppressClick = false;
    const target = e.target;
    if (!target || !target.closest) return;
    const card = target.closest('.pjt-card[data-id]');
    if (!card || cards.indexOf(card) < 0) return;
    if (projSortBlocked(target)) return;                 // 卡片内的控件长按不算拖拽
    st.down = { el:card, id:card.dataset.id, x:e.clientX, y:e.clientY, pid:e.pointerId };
    board.classList.add('is-arming');                    // 长按期间禁掉文本选择
    st.hold = setTimeout(startDrag, PROJ_SORT.holdMs);
  };
  const onMove = e => {
    if (st.down){
      if (st.down.pid != null && e.pointerId != null && e.pointerId !== st.down.pid) return;
      const dx = e.clientX - st.down.x, dy = e.clientY - st.down.y;
      if (Math.abs(dx) > PROJ_SORT.tolerance || Math.abs(dy) > PROJ_SORT.tolerance){ cancelHold(); return; }
      st.down.x = e.clientX; st.down.y = e.clientY;      // 起拖前的小抖动跟着走，起点更准
      return;
    }
    const drag = st.drag;
    if (!drag) return;
    if (drag.pid != null && e.pointerId != null && e.pointerId !== drag.pid) return;
    drag.dx = e.clientX - drag.ox; drag.dy = e.clientY - drag.oy;
    const rec = st.springs.get(drag.el);
    if (rec){ rec.x = drag.dx; rec.y = drag.dy; rec.vx = 0; rec.vy = 0; paint(rec); }
    const to = projSortSlotAt(
      st.slots,
      drag.slot.x + drag.slot.w / 2 + drag.dx,
      drag.slot.y + drag.slot.h / 2 + drag.dy,
      st.order.indexOf(drag.id));
    if (to !== st.order.indexOf(drag.id)) applyOrder(to);
  };
  const onUp = () => {
    if (st.down){ cancelHold(); return; }
    if (st.drag) endDrag();
  };
  const onAbort = () => { if (st.down) cancelHold(); if (st.drag) abortDrag(); };
  const onContextMenu = e => { if ((st.down || st.drag) && e.preventDefault) e.preventDefault(); };
  /* 拖拽期间锁住看板自身的滚动：不动 overflow（改了会改变列宽 / 触发重排），只吃掉滚动事件 */
  const onBlockScroll = e => { if (st.drag && e.cancelable) e.preventDefault(); };
  const onClick = e => {
    if (!st.suppressClick) return;
    st.suppressClick = false;
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
  };
  const onBoardResize = () => {
    if (st.drag){ abortDrag('窗口尺寸已改变，已取消这次排序'); return; }
    if (st.down) cancelHold();
    if (st.springs.size) clearVisual();
  };

  board.addEventListener('pointerdown', onDown);
  board.addEventListener('contextmenu', onContextMenu);
  board.addEventListener('wheel', onBlockScroll, { passive:false });
  board.addEventListener('touchmove', onBlockScroll, { passive:false });
  board.addEventListener('click', onClick, true);
  if (win){
    win.addEventListener('pointermove', onMove);
    win.addEventListener('pointerup', onUp);
    win.addEventListener('pointercancel', onAbort);
    win.addEventListener('blur', onAbort);
  }
  if (typeof globalThis.ResizeObserver === 'function'){
    st.observer = new globalThis.ResizeObserver(onBoardResize);
    if (st.observer.observe) st.observer.observe(board);
  } else if (win){
    win.addEventListener('resize', onBoardResize);       // 老环境兜底：没有 ResizeObserver 时监听窗口
    st.winResize = true;
  }

  projSortCtl = {
    board, cards, st, measure, applyOrder, endDrag, abortDrag, startDrag,
    destroy(){
      st.gone = true;
      cancelHold();
      clearVisual();
      st.drag = null;
      if (st.observer && st.observer.disconnect) st.observer.disconnect();
      if (win){
        win.removeEventListener('pointermove', onMove);
        win.removeEventListener('pointerup', onUp);
        win.removeEventListener('pointercancel', onAbort);
        win.removeEventListener('blur', onAbort);
        if (st.winResize) win.removeEventListener('resize', onBoardResize);
      }
      board.removeEventListener('pointerdown', onDown);
      board.removeEventListener('contextmenu', onContextMenu);
      board.removeEventListener('wheel', onBlockScroll);
      board.removeEventListener('touchmove', onBlockScroll);
      board.removeEventListener('click', onClick, true);
    },
  };
  return projSortCtl;
}

function viewWorkflows(animate){
  const wf = curWf();
  /* 兜底：curWf() 在 0 项目时返回 undefined（它是 find(...) || projects[0]），
     这里直接给空态，避免在 wf.steps 上炸掉导致 #view 停在上一屏、整个页面卡死。 */
  if (!wf) return `
  <div class="page-head stick">
    <div>
      <button class="link back-link" data-act="backProj" title="回到项目选择页">${DEV_BACK}项目列表</button>
      <div class="ph-title"><h1>项目详情</h1></div>
      <p>还没有项目</p>
    </div>
  </div>
  <section class="card">
    <div class="empty">${IC.plus('currentColor')}<span>这个项目已经不存在了，回项目列表看看</span>
      <button class="btn btn-ghost btn-sm" data-act="backProj">返回项目列表</button></div>
  </section>`;
  const onSteps = wf.steps.filter(s=>s.on);
  const r = S.running;
  const editing = S.wfEdit === wf.id;
  /* 视觉归组：单步骤原样输出，连续并行成员用 .step-par 包在一起 */
  let si = 0;
  const stepItemsHTML = wfFlowItems(wf.steps).map(it => {
    const rows = it.members.map(s => stepRow(s, si++, animate)).join('');
    return it.parallel ? `<div class="step-par"><span class="sp-tag">并行</span>${rows}</div>` : rows;
  }).join('');

  return `
  <div class="page-head stick">
    <div>
      <button class="link back-link" data-act="backProj" title="回到项目选择页">${DEV_BACK}项目列表</button>
      <div class="ph-title">
        <h1>${esc(wf.name)}</h1>
        ${projStatusCtl(wf)}
      </div>
      <p>${onSteps.length}/${wf.steps.length} 执行模块启用 · 最近运行 ${esc(wf.last)}</p>
    </div>
    <div class="right">
      ${projectRunControlsHTML(wf, false)}
      ${editing ? '' : `<button class="btn btn-ghost btn-sm" data-act="openProjectFiles" data-id="${wf.id}">打开项目文件</button>
      <button class="link" data-act="editWf" data-id="${wf.id}">编辑</button>`}
    </div>
  </div>

  ` + (editing ? `<div class="wf-mode-strip">
    <div><span class="badge b-brand">编辑模式</span><b>正在编辑「${esc(wf.name)}」</b><span>修改只保存在当前前端 Mock 状态</span></div>
    <button class="btn btn-ghost btn-sm" data-act="exitWfEdit" data-id="${wf.id}">退出编辑</button>
  </div>
  <div class="wf-main">
    <section class="card">
      <div class="card-head">
        <div class="card-title">步骤编排<small>${esc(wf.name)} · ${onSteps.length}/${wf.steps.length} 已启用</small></div>
        <div class="right">
          <button class="link" data-act="exportWf">导出配置</button>
          <button class="btn btn-ghost btn-sm" data-act="resetWf" title="恢复到初始的步骤配置">恢复默认</button>
        </div>
      </div>
      <div class="steps-scroll">
        <div class="steps" id="stepsDrop" data-anim="${animate?'1':'0'}">
          ${wf.steps.length
            ? stepItemsHTML
            : `<div class="empty">${IC.plus('currentColor')}<span>还没有步骤 —— 从右侧执行模块库拖一个过来，或点它的「添加」</span></div>`}
        </div>
      </div>
      <div class="steps-hint">
        ${r ? '运行中：步骤会按顺序点亮'
            : '拖动序号可排序 · 从右侧执行模块库拖拽可直接插入到指定位置 · 侧边线框出的「并行」步骤会一起启动'}
      </div>
    </section>

    <div class="wf-side">
      <section class="card res-card">
        <div class="card-head">
          <div class="card-title">执行模块库<small>按类型筛选</small></div>
        </div>
        <div class="tabs">
          ${[['app','应用'],['web','网页'],['folder','目录'],['script','脚本'],['cmd','命令']].map(([k,n])=>
            `<button class="tab ${S.larderTab===k?'on':''}" data-act="larderTab" data-v="${k}">${n}</button>`).join('')}
        </div>
        <div class="field" style="min-width:0;height:32px">${IC.search('var(--ink-3)')}<input id="larderSearch" placeholder="搜索执行模块"></div>
        <div class="res-scroll">${larderItems()}</div>
      </section>
    </div>
  </div>
  ${runSummaryHTML(wf, r, !!S.runOpen[wf.id])}` : `
  ${secHead(1, '概览')}
  ${projOverviewHTML(wf)}

  ${secHead(2, '开发上下文')}
  ${projDevHTML(wf)}

  ${secHead(3, '运行流程')}
  ${projRunHTML(wf, r, !!S.runOpen[wf.id])}

  ${secHead(4, '设置')}
  ${projSettingsHTML(wf)}` + projDeleteModalHTML());
}


/* 页头「项目列表」返回箭头 */
const DEV_BACK = '<svg viewBox="0 0 24 24" fill="none" style="width:13px;height:13px"><path d="M15 5.5L8.5 12L15 18.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* 交给 Agent 的开发约束：固定 Mock，将来由项目自身提供；编辑基本资料保存后可被 S.projRules 按项目覆盖 */
const DEV_RULES = [
  '先分析，再修改。',
  '先列出准备修改的文件。',
  '本轮只处理当前模块。',
  '禁止跨模块重构。',
  '完成后只测试本轮修改内容。'
];
/* 把当前开发上下文整理成可交给 Agent 的任务说明；纯函数，文本只此一处。
   任务 / 灵感笔记 / 开发要求三段全部由 S.todos / S.notes / S.projRules 派生，与页面显示同一份数据。
   2026-09-15：任务类型一律写「待办」（不再出现「待修改」）、优先级高 / 中 / 低条条显式；
   「下一步」定位行与「↳ 引用笔记」续行不再输出 —— 见下方各行注释。 */
function agentContextText(w){
  const d = DATA.devContext[w.name]; if (!d) return '';
  const task = devTaskOf(w.id);
  const tasks = projTasks(w.name).filter(t => !t.done);
  const notes = projNotes(w.name);
  const L = [];
  /* 仅在用户主动选择本轮开发任务时前置追加；未选择时输出与第五步逐字相同 */
  if (task){
    L.push('本轮开发任务：');
    L.push(task.text);
    L.push('');
    L.push('任务来源：');
    L.push(task.source);
    L.push('');
  }
  /* 定位段保持最小必要集：项目 ID（与项目名等价）、模块 ID（路径里已含）、开发状态（静态值）、
     下一步（与待办列表里的目标重复）都是下游 Agent 用不上的噪声，从模板中剔除；
     对应字段仍留在 DATA.devContext 里，解析端 BI_FIELDS 保持宽容（老文本若还带这些行也能吃下），
     只是不再由模板输出。 */
  L.push(`项目：${w.name}`);
  L.push(`当前开发模块：${d.module}`);
  L.push(`模块路径：${d.modulePath}`);
  L.push(`相关文件：${d.files.join(' ')}`);
  L.push('');
  L.push('待办：');
  tasks.forEach((t,i)=>{
    /* ① 类型统一按「待办」输出：普通任务与「待修改」在文本里不再区分（kind 仍存在数据里，
          解析端因此不再回写 kind，避免保存时把 fix 静默改成 todo）。
       ② 优先级 高 / 中 / 低 一律显式标出 —— 文本与界面的三档分组逐条对应，且可无损回写。
       ③ 「↳ 引用笔记」续行已删除（关联入口两侧都已移除，links 是只读历史数据）。 */
    L.push(`${i+1}. [待办][${priOf(t)}] ${t.text}${t.due ? `（${t.due}）` : ''}`);
  });
  L.push('');
  L.push('灵感 / 笔记：');
  notes.forEach(n => L.push(`- [${n.tag}] ${n.title}`));
  L.push('');
  L.push('开发要求：');
  (S.projRules[w.id] || DEV_RULES).forEach((t,i)=> L.push(`${i+1}. ${t}`));
  return L.join('\n');
}

/* ---------------- 编辑基本资料（居中弹窗） ----------------
   内容与「复制 Agent 上下文」是同一份纯文本（都由 agentContextText() 产出），
   弹窗里直接改这份纯文本，保存时反向解析回写：
     字段行 → DATA.devContext；待办 → S.todos；灵感 / 笔记 → S.notes；开发要求 → S.projRules。
   待办与记录按序号映射，多出来的新增；**少掉的属于删数据，必须先预演 + 二次确认**。
   「引用笔记」已不再由模板输出，links 是只读历史数据，这里既不解析也不回写。 */

const BI_FIELDS = {
  '当前开发模块':'module', '模块 ID':'moduleId', '模块路径':'modulePath',
  '相关文件':'files', '开发状态':'status', '下一步':'next'
};
const BI_SEC = { tasks:'待办：', notes:'灵感 / 笔记：', rules:'开发要求：' };

/* 纯解析：只认 agentContextText() 输出过的结构，其余行一律忽略
   （「当前待办：N 项」「当前灵感 / 笔记：K 项」这类派生计数行、「本轮开发任务」块、
   「↳ 引用笔记」续行都自然跳过；字段区见 BI_FIELDS，保留了对「下一步 / 模块 ID / 开发状态」
   这些历史行的宽容读取，只是模板不再输出它们）。 */
function parseBasicInfoText(text){
  const fields = {}, tasks = [], notes = [], rules = [];
  let section = '';
  String(text == null ? '' : text).split(/\r?\n/).forEach(raw => {
    const t = raw.replace(/\s+$/, '').trim();
    if (!t) return;
    if (t === BI_SEC.tasks){ section = 'tasks'; return; }
    if (t === BI_SEC.notes){ section = 'notes'; return; }
    if (t === BI_SEC.rules){ section = 'rules'; return; }
    if (section === 'tasks'){
      const m = t.match(/^(\d+)\.\s*\[([^\]]+)\](?:\[([^\]]+)\])?\s*(.*)$/);
      if (m){
        let body = m[4], due = '';
        const dm = body.match(/^(.*)（([^）]*)）\s*$/);      // 末尾括号是截止，正文里的括号不受影响
        if (dm){ body = dm[1]; due = dm[2]; }
        /* m[2] 是类型徽章（模板恒写「待办」，老文本可能是「待修改」）—— 刻意不解析：
           解析端一旦回写 kind，同一份文本就会在保存时把 fix 静默改成 todo。
           回写只认优先级与正文；新条目的 kind 由 basicInfoApiPayload 兜底成 todo。 */
        tasks.push({ pri:TASK_PRI.includes(m[3]) ? m[3] : '中', text:body.trim(), due });
      }
      return;                                              // 其余续行（如历史文本里的「↳ 引用笔记」）一律忽略
    }
    if (section === 'notes'){
      const m = t.match(/^-\s*\[([^\]]+)\]\s*(.*)$/);
      if (m) notes.push({ tag:m[1].trim(), title:m[2].trim() });
      return;
    }
    if (section === 'rules'){
      const m = t.match(/^(\d+)\.\s*(.*)$/);
      if (m) rules.push(m[2].trim());
      return;
    }
    const fm = t.match(/^([^：]+)：(.*)$/);                  // 字段区只在白名单里取值
    if (fm && BI_FIELDS[fm[1].trim()]) fields[BI_FIELDS[fm[1].trim()]] = fm[2].trim();
  });
  return { fields, tasks, notes, rules };
}

/* 有没有认出可保存的内容：整篇被清空时不允许保存，避免把已有资料清成空 */
const basicInfoParsedHasBody = p => Object.keys(p.fields).length > 0 ||
  p.tasks.length > 0 || p.notes.length > 0 || p.rules.length > 0;

/* 预演数据：文本里已经不存在的尾部条目，就是这次保存会删掉的东西 */
function basicInfoDropList(id, parsed){
  const w = DATA.projects.find(x => x.id === id); if (!w) return null;
  const dropTasks = projTasks(w.name).filter(t => !t.done).slice(parsed.tasks.length)
    .map(t => ({ kind:KIND_SHOW, text:t.text }));
  const dropNotes = projNotes(w.name).slice(parsed.notes.length)
    .map(n => ({ kind:'记录', text:n.title }));
  return { w, drop:dropTasks.concat(dropNotes) };
}

/* 弹窗本体：与项目记录编辑共用 #noteModal 宿主，样式完全沿用居中弹窗那一套 */
function basicInfoModalHTML(w){
  const d = DATA.devContext[w.name];
  const text = agentContextText(w);
  return `<div class="nm-head">
      <div class="nm-id">
        <div class="nm-title">编辑基本资料<small>纯文本 · 保存后回写</small></div>
        <div class="nm-meta">${esc(w.name)} · ${esc(d ? d.status : '未关联')} · 与「复制 Agent 上下文」同一份内容</div>
      </div>
      <button class="note-modal-x" data-act="closeBasicInfo" title="关闭" aria-label="关闭">${IC.close('currentColor')}</button>
    </div>
    <div class="hint-line">字段行与「待办 / 灵感 笔记 / 开发要求」三段会回写（类型统一写「待办」，改它不生效）；删掉行会先弹预演再确认。</div>
    <textarea id="biText" class="drawer-textarea" aria-label="基本资料纯文本">${esc(text)}</textarea>
    <div class="fld-err" id="biErr" role="alert" hidden></div>
    <div class="nm-acts" style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" data-act="saveBasicInfo" data-id="${w.id}">${IC.check('#fff')}保存</button>
      <button class="btn btn-ghost btn-sm" data-act="copyAgent" data-id="${w.id}">复制 Agent 上下文</button>
      <button class="btn btn-ghost btn-sm" data-act="closeBasicInfo">取消</button>
    </div>`;
}

/* 预演：确认后才真正删；返回编辑则原样保留 */
function basicInfoPreflightHTML(w, drop){
  return `<div class="nm-head">
      <div class="nm-id">
        <div class="nm-title">保存前预演<small>${drop.length} 条会被删除</small></div>
        <div class="nm-meta">${esc(w.name)} · 只删下面这些，其余照常保存</div>
      </div>
      <button class="note-modal-x" data-act="closeBasicInfo" title="关闭" aria-label="关闭">${IC.close('currentColor')}</button>
    </div>
    <div class="hint-line">这些条目在文本里已经不存在了。确认后才会真正删除；返回编辑则原样保留。</div>
    <div class="list">${drop.map(x => `<div class="row">
        <span class="badge b-slate">${esc(x.kind)}</span>
        <span class="r-title">${esc(x.text)}</span>
      </div>`).join('')}</div>
    <div class="nm-acts" style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" data-act="backBasicInfo">返回编辑</button>
      <button class="btn btn-sm obs-danger" data-act="confirmBasicInfo" data-id="${w.id}">确认删除并保存</button>
    </div>`;
}

function basicInfoShowErr(msg){
  const box = $('#biErr');
  if (box){ box.textContent = msg || ''; box.hidden = !msg; }
}
function openBasicInfo(id){
  const w = DATA.projects.find(x => x.id === id); if (!w) return false;
  S.basicPending = null;
  openModal(basicInfoModalHTML(w));      // 宽版：含大段纯文本
  return true;
}
/* 与其它弹窗共用同一宿主，关闭时清空内容，避免两种编辑内容串味 */
function closeBasicInfo(){
  S.basicPending = null;
  return closeModal();
}
function basicInfoApiPayload(id, parsed, dropExtras){
  const w = DATA.projects.find(project => project.id === id); if (!w) return null;
  const d = ensureDevContext(w); const f = parsed.fields;
  const tasks = projTasks(w.name).filter(task => !task.done);
  const notes = projNotes(w.name);
  return {
    module:f.module != null ? f.module : d.module,
    module_id:f.moduleId != null ? f.moduleId : d.moduleId,
    module_path:f.modulePath != null ? f.modulePath : d.modulePath,
    files:f.files != null ? f.files.split(/\s+/).filter(Boolean) : d.files,
    dev_status:f.status != null ? f.status : d.status,
    next_step:f.next != null ? f.next : d.next,
    rules:parsed.rules.length ? parsed.rules : (S.projRules[w.id] || DEV_RULES),
    tasks:parsed.tasks.map((item, index) => {
      const old = tasks[index];
      return {id:old ? old.id : null, title:item.text || (old && old.text) || '', due_date:item.due || null,
        priority:item.pri, kind:old ? taskKindOf(old) : 'todo'};
    }),
    notes:parsed.notes.map((item, index) => {
      const old = notes[index];
      return {id:old ? old.id : null, title:item.title || (old && old.title) || '', tag:item.tag || (old && old.tag) || '日常'};
    }),
    drop_extras:!!dropExtras
  };
}
function applyBackendBasicInfo(id, payload){
  const w = DATA.projects.find(project => project.id === id); if (!w || !payload) return null;
  const projectMap = new Map([[w.id, w]]);
  const nextTasks = (payload.tasks || []).map(row => backendTaskFromApi(row, projectMap)).filter(Boolean);
  const nextNotes = (payload.notes || []).map(row => backendNoteFromApi(row, projectMap)).filter(Boolean);
  const previousTaskIds = S.todos.plan.filter(task => task.proj === w.name).map(task => task.id);
  const previousNoteIds = S.notes.filter(note => note.proj === w.name).map(note => note.id);
  S.todos.plan.splice(0, S.todos.plan.length,
    ...S.todos.plan.filter(task => task.proj !== w.name), ...nextTasks);
  S.notes.splice(0, S.notes.length,
    ...S.notes.filter(note => note.proj !== w.name), ...nextNotes);
  previousTaskIds.forEach(taskId => BACKEND_TASK_IDS.delete(taskId));
  nextTasks.forEach(task => BACKEND_TASK_IDS.add(task.id));
  previousNoteIds.forEach(noteId => BACKEND_NOTE_IDS.delete(noteId));
  nextNotes.forEach(note => BACKEND_NOTE_IDS.add(note.id));
  const context = backendContextFromApi(payload.context);
  if (context) Object.assign(ensureDevContext(w), context);
  if (context && context.rules.length) S.projRules[w.id] = context.rules.slice();
  else delete S.projRules[w.id];
  const remainingIds = new Set(nextTasks.map(task => task.id));
  previousTaskIds.filter(taskId => !remainingIds.has(taskId)).forEach(pruneCurTasks);
  return {name:w.name, tasks:nextTasks.length, notes:nextNotes.length, rules:context ? context.rules.length : 0};
}
/* 提交：会删条目时先预演，不删则直接落库 */
function commitBasicInfo(id, parsed, dropExtras){
  const body = basicInfoApiPayload(id, parsed, dropExtras);
  if (!body){ closeBasicInfo(); toast('保存失败：项目不存在'); return false; }
  void apiRequest(`/projects/${encodeURIComponent(id)}/basic-info`, {method:'PUT', body:JSON.stringify(body)})
    .then(payload => {
      const r = applyBackendBasicInfo(id, payload);
      if (!r) throw new Error('基本资料保存后无法恢复');
      closeBasicInfo();
      addActivity(`更新了项目「${r.name}」的基本资料`, r.name, 'pen', C.blue, '项目');
      render(true); toast(`已保存「${r.name}」的基本资料`);
    })
    .catch(err => {
      const pending = S.basicPending;
      if (pending){
        openBasicInfo(id);
        const text = $('#biText'); if (text) text.value = pending.text;
      }
      basicInfoShowErr(err && err.message ? err.message : '基本资料保存失败');
    });
  return true;
}
function saveBasicInfo(id){
  const el = $('#biText');
  const parsed = parseBasicInfoText(el ? el.value : '');
  if (!basicInfoParsedHasBody(parsed)){
    basicInfoShowErr('没认出可保存的内容：至少保留一行「当前开发模块：xxx」这样的字段行');
    return false;
  }
  const diff = basicInfoDropList(id, parsed);
  if (!diff) return false;
  if (diff.drop.length){                     // 删数据 → 预演 + 二次确认
    S.basicPending = { id, text:el.value };
    const m = $('#noteModal');
    if (m) m.innerHTML = basicInfoPreflightHTML(diff.w, diff.drop);
    return false;
  }
  return commitBasicInfo(id, parsed, false);
}
function confirmBasicInfo(id){
  const pd = S.basicPending;
  if (!pd || pd.id !== id) return false;
  return commitBasicInfo(id, parseBasicInfoText(pd.text), true);
}

/* ---------------- 设置页 ---------------- */
let updatePollTimer = null;
let updatePollBusy = false;
const updateSessionStarted = Date.now();
async function loadUpdateState(){
  if (!IN_SHELL || updatePollBusy || S.updateRequestBusy) return;
  updatePollBusy = true;
  const previous = JSON.stringify([S.updates, S.updateError]);
  try {
    S.updates = await apiRequest('/settings/updates');
    S.updateError = '';
    handleUpdateState();
  } catch (err) { S.updateError = err.message || '无法读取更新状态'; }
  finally { updatePollBusy = false; }
  if (previous !== JSON.stringify([S.updates, S.updateError]) && ['settings','projects','home','workflows'].includes(S.page)) render(true);
  /* 侧栏小圈在任何页面都要跟着走：轮询拿到新状态后无条件同步一次。
     不能只靠 render() —— 后台自动检查可能在「模块」这类不在白名单的页面上推进进度，
     那样小圈会停在原地不动，用户以为卡住了。 */
  else syncSideUpdate();
  if (!updatePollTimer) updatePollTimer = setInterval(() => { void loadUpdateState(); }, 5000);
}
async function updateAction(mode, target='controlpod'){
  if (S.updateRequestBusy || !IN_SHELL || (S.updates && S.updates.busy)) return;
  S.updateOperation={mode,target};
  S.updateRequestBusy = true; S.updateRequestTarget = target; S.updateError = ''; render(true);
  try {
    S.updates = await apiRequest('/settings/updates', {method:'POST', body:JSON.stringify({mode, target})});
  } catch (err) {
    S.updateOperation=null;
    S.updateError = err.message || '无法开始更新';
    toast(S.updateError);
  } finally {
    S.updateRequestBusy = false; S.updateRequestTarget = null;
    handleUpdateState(); render(true); void loadUpdateState();
  }
}
async function completeUpdate(){
  if (S.updateRequestBusy || !IN_SHELL || (S.updates && S.updates.busy)) return;
  S.updateRequestBusy = true; S.updateError = ''; render(true);
  try {
    await apiRequest('/settings/updates', {method:'POST', body:JSON.stringify({mode:'apply'})});
    quitForUpdate();
  } catch (err) { S.updateError = err.message || '无法完成更新'; toast(S.updateError); }
  finally { S.updateRequestBusy = false; render(true); }
}
const UPDATE_PROJECTS = {'apex-launcher':['apex-launcher','APEX 一键启动'],'dou-link':['dou-link','抖音链接气泡'], 'runner-lab':['run-analytics','跑步数据分析'], 'bili-peek':['Bili-Peek','Bili-Peek']};
function projectUpdateTargets(w){
  return [...new Set((w.steps || []).map(step => step.moduleId).filter(id=>UPDATE_PROJECTS[id]))].map(id=>UPDATE_PROJECTS[id]);
}
function updateResult(target){
  const u=S.updates;
  if(target==='controlpod') return u && (u.platform || (u.state && !['external','apex-launcher','dou-link','run-analytics','Bili-Peek'].includes(u.state.target) ? u.state : null));
  return u && u.external && Array.isArray(u.external.projects) ? u.external.projects.find(p=>p.id===target) : null;
}
function updateAvailable(result){
  if(!result || !['checked','tested','failed'].includes(result.phase)) return false;
  if(typeof result.updateAvailable === 'boolean') return result.updateAvailable;
  return !!(result.delivery !== 'source' && result.changes && result.changes.length);
}
/* 更新进度：把后端 phase 换算成 0~100。
   **只在真正执行中才有进度** —— 这是修正过的一个错：早先把 checked/tested/pending 这些
   终态一律映射成 100，于是「有更新但还没开始」的空圈被画成满圈，看着永远 100%。
   现在非执行态一律 0（空圈 = 待命），执行态按后端真实阶段推进：
   running → testing → building → installing → 收尾。后端只汇报阶段、不汇报字节数，
   所以按阶段等分是诚实口径；不认识的 phase 给 0，不猜。 */
const UPDATE_PHASE_STEPS = ['running', 'testing', 'building', 'installing'];
function updateProgress(result, busy){
  if(!busy || !result) return 0;
  /* 优先读后端上报的真值（tools/update-local.ps1 的 State() 写入 progress 字段）：
     耗时最长的两个复制循环按「已复制/总数」连续上报，三次外部子进程各算一整步
     （外部程序不吐进度，不编造假爬升）。只有旧状态文件没有该字段时才退回阶段估算。 */
  if(typeof result.progress === 'number' && isFinite(result.progress)) return Math.max(0, Math.min(100, Math.round(result.progress)));
  if(result.phase === 'failed') return 100;              // 失败也是走到底了，环走满并转红
  if(['pending','updated'].includes(result.phase)) return 100;
  const i = UPDATE_PHASE_STEPS.indexOf(result.phase);
  return i < 0 ? 0 : Math.round(((i + 1) / UPDATE_PHASE_STEPS.length) * 100);
}
function updateBusyNow(){
  return !!(S.updateRequestBusy || (S.updates && S.updates.busy));
}
function updateStateNow(){
  const busy = updateBusyNow();
  const result = updateResult('controlpod');
  const progress = updateProgress(result, busy);
  if(busy) return { busy:true, failed:false, progress, restart:false,
    label:(S.updateOperation && S.updateOperation.mode==='update') ? '正在更新' : '正在检查', result };
  if(!result) return { busy:false, failed:false, progress:0, restart:false, label:'', result:null };
  const restart = platformNeedsRestart(result);
  const failed = result.phase === 'failed';
  return { busy:false, failed, progress, restart,
    label: failed ? '更新失败' : restart ? '需要重启' : updateAvailable(result) ? '有可用更新' : '已是最新', result };
}
/* 侧栏小圈进度环：r=16 → 周长 2π×16 ≈ 100.53，弧长 = 周长 ×(1 - 进度)。
   dasharray 由 CSS 的 .su-bar 常驻提供，这里只推进 dashoffset。 */
const UPD_CIRC = 100.53;
function updateRingSVG(){
  return '<svg aria-hidden="true" class="su-ring" viewBox="0 0 40 40">'
    + '<circle class="su-track" cx="20" cy="20" r="16"></circle>'
    + '<circle class="su-bar" cx="20" cy="20" r="16"></circle></svg>';
}
const UPD_GLYPH_DOWN = '<svg fill="none" viewBox="0 0 24 24"><path d="M12 4.5v11" stroke="currentColor" stroke-linecap="round" stroke-width="2.2"/><path d="M7 11.5l5 5 5-5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2"/><path d="M5 19.5h14" stroke="currentColor" stroke-linecap="round" stroke-width="2.2"/></svg>';
const UPD_GLYPH_RESTART = '<svg fill="none" viewBox="0 0 24 24"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" stroke="currentColor" stroke-linecap="round" stroke-width="2.2"/><path d="M4.5 4.5V9H9" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2"/></svg>';
function updateDashOffset(p){
  return (UPD_CIRC * (1 - Math.max(0, Math.min(100, p)) / 100)).toFixed(2);
}
function applyRingProgress(node, p){
  const bar = node && node.querySelector ? node.querySelector('.su-bar') : null;
  if(!bar || !bar.style) return null;
  bar.style.strokeDashoffset = updateDashOffset(p);
  return bar.style.strokeDashoffset;
}
/* 侧栏小圈的显示条件：执行中、失败、有更新、待重启 —— 任一成立才出现；
   其余（含「已是最新」和「还没读过状态」）一律 hidden，不在侧栏留空位。 */
function sideUpdateVisible(st){
  return !!(st.busy || st.failed || st.restart || (st.result && updateAvailable(st.result)));
}
function syncSideUpdate(){
  const btn = $('#sideUpdate');
  if(!btn) return null;
  const st = updateStateNow();
  const show = sideUpdateVisible(st);
  btn.hidden = !show;
  if(!show) return null;
  btn.classList.toggle('busy', st.busy);
  btn.classList.toggle('failed', !st.busy && st.failed);
  btn.classList.toggle('ready', !st.busy && !st.failed && (st.restart || !!(st.result && updateAvailable(st.result))));
  btn.classList.toggle('su-done', !st.busy && (st.restart || st.failed));
  /* 百分比只活在悬停提示里：34px 的圈里塞数字又挤又假（用户明确要求只在悬停时看到）。
     空闲时标题就是状态文案，不硬塞一个「0%」。 */
  btn.title = st.busy ? st.label + ' ' + st.progress + '%' : st.label;
  if(btn.setAttribute) btn.setAttribute('aria-label', 'ControlPod 更新：' + st.label);
  const glyph = $('#sideUpdateGlyph');
  applyRingProgress(btn, st.progress);
  if(glyph) glyph.innerHTML = st.busy ? '' : (st.restart || st.failed ? UPD_GLYPH_RESTART : UPD_GLYPH_DOWN);
  return st;
}
function platformNeedsRestart(result){
  return !!(result && (result.phase==='pending' || result.phase==='restart-required' ||
    (result.phase==='updated' && Date.parse(result.at) >= updateSessionStarted)));
}
function projectUpdateChipHTML(w){
  const target=projectUpdateTargets(w).find(([key])=>updateAvailable(updateResult(key)));
  if(!target) return '';
  /* 卡片上的更新提醒也用同一枚圆环，而不是一块「有更新」文字标签：
     环 = 图形化进度，与侧栏小圈、设置页按钮三处同款；空环表示「还没开始」，
     标题里给百分比。圈本身可点，点了走同一个确认入口。 */
  return '<button class="pjt-update" data-act="projectMaintenance" data-id="'+esc(w.id)+'" data-v="'+esc(target[0])+'"'
    + ' title="'+esc(w.name)+'有可用更新" aria-label="'+esc(w.name)+'有可用更新">'
    + '<svg aria-hidden="true" class="su-ring" viewBox="0 0 40 40">'
    + '<circle class="su-track" cx="20" cy="20" r="16"></circle>'
    + '<circle class="su-bar" cx="20" cy="20" r="16" style="stroke-dashoffset:'+updateDashOffset(0)+'"></circle></svg>'
    + '<span class="sr-only">有更新</span></button>';
}
function askUpdate(target='controlpod'){
  if(S.updateRequestBusy || !S.updates || S.updates.busy || !S.updates.available) return;
  const result=updateResult(target), restart=target==='controlpod' && platformNeedsRestart(result);
  if(!restart && !updateAvailable(result)){ void updateAction('check',target); return; }
  /* 已经准备好新版、只差重启时**不再问**：用户点的本身就是「更新 / 重启」这一个意图，
     更新也已经通过测试，再弹一次「现在重启吗」等于同一个决定问两遍。
     直接重启；替换版走 completeUpdate（它内部才真正退出并拉起替换工具）。 */
  if(restart){ restartAfterUpdate(result); return; }
  const name=target==='controlpod'?'ControlPod':Object.values(UPDATE_PROJECTS).find(([key])=>key===target)?.[1] || target;
  S.updatePanel={target,mode:'update'};
  openModal(mHead('发现可用更新',name+' 有更新，现在更新吗？')+
    '<div class="nm-acts update-confirm-actions"><button class="btn btn-ghost" data-act="closeModal">稍后</button><button class="btn btn-primary" data-act="confirmUpdate">更新</button></div>',{form:true});
  $('#noteModal [data-act="closeModal"]').focus();
}
/* 重启落地：待安装（pending）走 apply → quit-for-update，让替换工具接管；
   其余（界面已同步等）直接壳内重启。两条路径都要「真的重启」，不询问。 */
function restartAfterUpdate(result){
  if(!IN_SHELL || S.updateRequestBusy) return;
  closeModal();
  if(result && result.phase === 'pending'){ void completeUpdate(); return; }
  shellChromeCommand('restart');
}
function confirmUpdate(){
  const panel=S.updatePanel;
  if(!panel || S.updateRequestBusy || !IN_SHELL || !S.updates || S.updates.busy) return;
  closeModal();
  if(panel.mode==='restart'){
    const result=updateResult('controlpod');
    if(!platformNeedsRestart(result)) return;
    restartAfterUpdate(result);
  } else if(updateAvailable(updateResult(panel.target))) void updateAction('update',panel.target);
}
function projectMaintenance(id, target){
  const w=DATA.projects.find(p=>p.id===id);
  if(w && projectUpdateTargets(w).some(([key])=>key===target)) askUpdate(target);
}
function handleUpdateState(){
  const u=S.updates;
  if(!u || u.busy || S.updateRequestBusy) return;
  const op=S.updateOperation;
  if(op){
    S.updateOperation=null;
    const result=updateResult(op.target), state=u.state;
    if((state && state.phase==='failed') || (result && result.phase==='failed')){
      S.updateError=(state && state.phase==='failed'?state.message:result.message) || '更新失败';
      toast(S.updateError);
    } else if(op.mode==='check'){
      if(updateAvailable(result)) askUpdate(op.target);
      else toast('没有可用更新');
    } else if(op.target==='controlpod' && platformNeedsRestart(result)) restartAfterUpdate(result);
    else toast(result && ['restart-required','action-required'].includes(result.phase) ? result.message : '更新完成');
  }
  const projects=u.external && Array.isArray(u.external.projects)?u.external.projects.filter(updateAvailable):[];
  const key=JSON.stringify(projects.map(p=>[p.id,p.changes]));
  if(projects.length && key!==S.updateNotified) toast(projects.length+' 个项目有更新');
  S.updateNotified=key;
}
function updateSettingsHTML(){
  const u=S.updates, result=updateResult('controlpod');
  const busy=S.updateRequestBusy || (u && u.busy);
  const restart=platformNeedsRestart(result);
  const label=busy?(S.updateOperation && S.updateOperation.mode==='update'?'更新中…':'检查中…'):restart?'重启以完成更新':updateAvailable(result)?'更新':'检查更新';
  const error=S.updateError || (result && result.phase==='failed'?result.message:'');
  /* 按钮内嵌与侧栏小圈、卡片提醒同款的圆环。百分比不进界面，只进 title ——
     三处进度环因此读法一致：看圈，悬停看数字。 */
  const st=updateStateNow();
  const ring=updateRingSVG().replace('class="su-bar"','class="su-bar" style="stroke-dashoffset:'+updateDashOffset(st.progress)+'"');
  const tip=st.busy ? label+' '+st.progress+'%' : label;
  return '<div class="set-row"><div class="s-txt"><div class="s-t">ControlPod 更新</div>'+
    (error?'<div class="s-d update-error" role="status">'+esc(error)+'</div>':'')+
    '</div><button class="btn btn-ghost btn-upd'+(busy?' busy':'')+(updateAvailable(result)?' ready':'')+
    '" data-act="checkUpdate" title="'+esc(tip)+'" '+(!IN_SHELL || !u || !u.available || busy?'disabled':'')+' aria-live="polite">'+
    ring+'<span>'+label+'</span></button></div>';
}
function viewSettings(){
  const sw = (label, desc, on, key) => `
    <div class="set-row">
      <div class="s-txt"><div class="s-t">${label}</div><div class="s-d">${desc}</div></div>
      <button class="switch ${on?'on':''}" data-act="switch" data-k="${key}"><i></i></button>
    </div>`;
  const startupBusy = S.startupLoading || S.startupUpdating;
  /* 已登记但被 Windows 侧禁用：必须说清楚「开关为什么是关的、该去哪儿恢复」，
     否则用户只看到一个关着的开关，会以为功能又坏了。 */
  const startupBlocked = S.startupEnabled !== true
    && S.startupRegistered === true && S.startupApproved === false;
  const startupDesc = S.startupError
    ? `未能读取或更新：${esc(S.startupError)}`
    : startupBusy
      ? (S.startupUpdating ? '正在更新 Windows 启动项…' : '正在读取 Windows 启动项…')
      : startupBlocked
        ? '已被 Windows 任务管理器的启动项开关禁用，重新打开即可恢复'
        : '登录系统后自动打开 ControlPod 窗口，并启动后台服务';
  const startupSwitch = `<div class="set-row">
      <div class="s-txt"><div class="s-t">开机自启动</div><div class="s-d">${startupDesc}</div></div>
      <button class="switch ${S.startupEnabled===true?'on':''}" data-act="switch" data-k="auto"
        ${startupBusy || S.startupEnabled===null ? 'disabled aria-disabled="true"' : ''}
        aria-label="${S.startupEnabled===true?'关闭':'开启'}开机自启动"><i></i></button>
    </div>`;
  return `
  <div class="page-head"><div><h1>设置</h1><p>外观、Obsidian、通用行为与快捷键</p></div></div>
  <div class="grid g-2">
    <section class="card">
      <div class="card-head"><div class="card-title">外观</div></div>
      <div class="set-row">
        <div class="s-txt"><div class="s-t">主题</div><div class="s-d">浅色 / 深色，跟随顶部按钮同步</div></div>
        <div class="seg">
          <button class="${S.theme==='light'?'on':''}" data-act="theme" data-v="light">浅色</button>
          <button class="${S.theme==='dark'?'on':''}" data-act="theme" data-v="dark">深色</button>
        </div>
      </div>
      <div class="set-row">
        <div class="s-txt"><div class="s-t">强调色</div><div class="s-d">影响主按钮与高亮状态</div></div>
        <div style="display:flex;gap:8px">
          ${ACCENTS.map(c=>
            `<button class="swatch ${c===S.accent?'on':''}" data-act="accent" data-v="${c}"
              style="background:${c}" aria-label="强调色 ${c}" aria-pressed="${c===S.accent}"></button>`).join('')}
        </div>
      </div>
      <div class="set-row">
        <div class="s-txt"><div class="s-t">信息密度</div><div class="s-d">调整卡片内边距与行高</div></div>
        <input class="slider" id="density" type="range" min="0" max="2" value="${S.density}" step="1"
          aria-label="信息密度：紧凑 / 标准 / 宽松">
      </div>
      <div class="set-row">
        <div class="s-txt"><div class="s-t">玻璃质感</div><div class="s-d">关闭后卡片改为纯色底，降低渲染开销</div></div>
        <button class="switch ${S.glass?'on':''}" data-act="switch" data-k="glass"
          aria-label="${S.glass?'关闭':'开启'}玻璃质感"><i></i></button>
      </div>
    </section>
    <section class="card">
      <div class="card-head"><div class="card-title">通用</div></div>
      ${startupSwitch}
      ${sw('桌面通知','脚本运行完成或失败时推送系统通知', S.notify, 'notify')}
      ${sw('自动保存','编辑中的文件每 30 秒自动落盘', S.save, 'save')}
      ${sw('使用数据统计','匿名上报崩溃与性能数据', S.telemetry, 'telemetry')}
      ${updateSettingsHTML()}
    </section>
    <section class="card">
      <div class="card-head">
        <div class="card-title">Obsidian 连接<small>本机保存 · 打开、新建与单向更新项目主页</small></div>
        <div class="right"><span class="badge ${S.obsidian.vault?'b-green':'b-slate'}">${S.obsidian.vault?'已配置':'未配置'}</span></div>
      </div>
      <div class="set-row">
        <div class="s-txt"><div class="s-t">仓库名称</div><div class="s-d">填写 Obsidian 左下角仓库切换器里显示的名称</div></div>
        <div class="field">
          ${IC.note('var(--ink-3)')}
          <input id="obsVault" value="${esc(S.obsidian.vault)}" placeholder="例如：Codex学习" aria-label="Obsidian 仓库名称">
        </div>
      </div>
      <div class="set-row">
        <div class="s-txt"><div class="s-t">项目资料目录</div><div class="s-d">新项目尚未绑定时，用这个目录生成建议路径</div></div>
        <div class="field">
          ${IC.folder('var(--ink-3)')}
          <input id="obsFolder" value="${esc(S.obsidian.projectFolder)}" placeholder="例如：项目" aria-label="Obsidian 项目资料目录">
        </div>
      </div>
      <div class="set-row">
        <div class="s-txt"><div class="s-t">连接测试</div><div class="s-d">浏览器只能请求系统打开 Obsidian；是否进入正确仓库，需要你在 Obsidian 中确认</div></div>
        <div class="toolbar">
          <button class="btn btn-ghost btn-sm" data-act="obsidianSave">保存设置</button>
          <button class="btn btn-primary btn-sm" data-act="obsidianTest">${IC.play('#fff')}测试连接</button>
        </div>
      </div>
    </section>
  </div>
  <section class="card">
    <div class="card-head"><div class="card-title">快捷键</div><div class="right"><span class="metric">点击任意一行可重绑（原型演示）</span></div></div>
    <div class="list">
      ${[['打开全局搜索','Ctrl','K'],['快速切换项目','Ctrl','P'],['打开模块','Ctrl','M'],['打开设置','Ctrl',',']].map(([n,a,b])=>`
        <div class="row" data-act="noop">
          <span class="r-title">${n}</span>
          <span class="kbd">${a}</span><span class="kbd">${b}</span>
        </div>`).join('')}
    </div>
  </section>
  <section class="card">
    <div class="card-head"><div class="card-title">账号</div></div>
    <div class="set-row">
      <span class="avatar"></span>
      <div class="s-txt"><div class="s-t">Kiro</div><div class="s-d">本地账号 · 上次同步 2 分钟前</div></div>
      <button class="btn btn-ghost btn-sm" data-act="noop">管理设备</button>
    </div>
  </section>`;
}

const PAGES = {home:viewHome, apps:viewApps, projects:viewProjects, modules:viewModules, workflows:viewWorkflows, settings:viewSettings};

function parseAppRoute(hash){
  const raw = String(hash || '').replace(/^#\/?/, '');
  const cut = raw.indexOf('?');
  const path = (cut < 0 ? raw : raw.slice(0, cut)).split('/').filter(Boolean);
  const page = path[0] || 'home';
  if (!PAGES[page]) return null;
  const decode = value => { try { return decodeURIComponent(value || ''); } catch (_) { return ''; } };
  const query = {};
  (cut < 0 ? '' : raw.slice(cut + 1)).split('&').filter(Boolean).forEach(pair => {
    const at = pair.indexOf('=');
    const key = decode(at < 0 ? pair : pair.slice(0, at));
    if (key) query[key] = decode(at < 0 ? '' : pair.slice(at + 1));
  });
  const wf = page === 'workflows' && path[1] ? decode(path[1]) : '';
  return {page, wf:DATA.projects.some(p=>p.id===wf) ? wf : '', focus:query.focus || ''};
}
function applyAppRoute(hash){
  const route = parseAppRoute(hash);
  if (!route) return false;
  S.page = route.page;
  if (route.wf) S.wf = route.wf;
  S.obsidianReturnFocus = route.page === 'workflows' && route.wf && route.focus === 'obsidian' ? route.wf : '';
  return true;
}

let lastKey = '';
function render(keepScroll){
  const sc = keepScroll ? $('#view').scrollTop : 0;
  const key = S.page + '|' + (S.page==='workflows' ? S.wf : '');
  const animate = key !== lastKey;          // 只有切页面/换工作流才播放入场动画
  lastKey = key;
  $('#view').innerHTML = PAGES[S.page](animate);
  $('#view').dataset.anim = animate ? '1' : '0';
  $('#view').classList.toggle('no-scroll', S.page === 'apps');   // 应用页锁屏：滚动交给列表容器内部
  $('#view').classList.toggle('project-view', S.page === 'projects');
  $('#view').scrollTop = sc;
  if (S.page === 'workflows' && S.obsidianReturnFocus){
    const returned = S.obsidianReturnFocus;
    S.obsidianReturnFocus = '';
    setTimeout(() => {
      const hub = $(`#obsHub-${returned}`);
      if (!hub || !hub.scrollIntoView) return;
      const reduce = globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
      hub.scrollIntoView({block:'center', behavior:reduce ? 'auto' : 'smooth'});
    }, 0);
  }
  $$('#nav .nav-item').forEach(b=>b.classList.toggle('on', b.dataset.page===S.page));
  $('#cntApps').textContent = S.apps.length;
  $('#cntWf').textContent = DATA.projects.length;
  $('#bellBadge').style.display = S.notices.some(n=>!n.read) ? 'block' : 'none';
  syncSideUpdate();
  if (S.page === 'apps'){ fitAppList(); const ctl = initInertialScroll(); if (ctl) ctl.refresh(); }
  // 应用页：渲染后锁「一屏整数行」，滚动由自管物理惯性驱动（见 initInertialScroll）
  if (S.page === 'projects'){
    initProjSort();                               // 看板每次重建都要重新绑定拖拽排序
    initProjectCardParallax();
  }
}
const go = (p, keep) => { S.page = p; clearObsidianHubFlow(false); S.obsidianReturnFocus = ''; location.hash = '#/'+p; closeNoteModal(); render(keep); };

/* ---------------- 命令面板 ---------------- */
let palSel = 0, palItems = [];
const PAL_CMD = [
  {t:'新增执行模块', k:'模块', act:()=>{ go('modules'); setTimeout(()=>newModule(), 260); }},
  {t:'切换浅色 / 深色主题', k:'外观', act:()=>toggleTheme()},
  {t:'打开当前项目内容', k:'项目', act:()=>{ const p=DATA.projects.find(x=>x.id===S.proj)||DATA.projects[0]; if (!p){ toast('还没有项目'); return; } S.wf=p.id; go('workflows'); }}
];

const WF_VERB = /(启动|运行|执行|打开|开始|恢复|开工|上班|收工|准备)/;

function looksIntent(q){
  if (!q) return false;
  if (DATA.projects.some(w=>q.includes(w.name))) return true;
  if (WF_VERB.test(q)) return true;
  if (/[？?]$/.test(q)) return true;
  if (/怎么|为什么|帮我|建议|总结|优先|能不能|哪个/.test(q)) return true;
  return false;
}

function aiCard(tag, text, chips, acts){
  return `<div class="ai-card">
    <div class="ai-head"><span class="ai-tag">${tag}</span></div>
    <div class="ai-say">${text}</div>
    ${chips ? `<div class="ai-acts">${chips}</div>` : ''}
    ${acts ? `<div class="ai-acts">${acts}</div>` : ''}
  </div>`;
}

/* 返回 true = 继续展示搜索结果；false = 已被 AI 卡片接管 */
function aiZone(q){
  const z = $('#aiZone');
  if (!q || !looksIntent(q)){ z.innerHTML = ''; return true; }
  const hitWf = DATA.projects.find(w=>q.includes(w.name));

  if (hitWf){
    z.innerHTML = aiCard('指令', `已识别到项目「${esc(hitWf.name)}」，可以直接运行。`,
      `<div class="ai-wf">
        <div class="aw-top">
          <span class="li-ico" style="width:24px;height:24px;border-radius:8px;background:${hitWf.color}1f">${wfIcon(hitWf.ico, hitWf.color)}</span>
          <span class="aw-name">${esc(hitWf.name)}</span>
          <span class="badge b-slate">${hitWf.steps.filter(s=>s.on).length} 个执行模块</span>
        </div>
        <div class="aw-flow">
          ${hitWf.steps.filter(s=>s.on).map((s,i)=>
            `${i?'<span class="aw-arrow">→</span>':''}<span class="chip" style="height:24px;font-size:11px">${esc(s.label)}</span>`).join('')}
        </div>
      </div>`,
      `<button class="btn btn-primary btn-sm" data-act="runWf" data-id="${hitWf.id}">${IC.play('#fff')}运行项目</button>
       <button class="btn btn-ghost btn-sm" data-act="openWf" data-id="${hitWf.id}">打开项目</button>`);
    return false;
  }

  if (WF_VERB.test(q)){
    z.innerHTML = aiCard('指令', '要运行哪个项目？点一下直接开始。',
      DATA.projects.map(w=>`<button class="chip" data-act="runWf" data-id="${w.id}">${IC.play('var(--brand)')}${esc(w.name)}</button>`).join(''));
    return false;
  }

  z.innerHTML = aiCard('问答', aiReply(q),
    `<button class="chip" data-act="askWorkflows">打开项目</button>`);
  return false;
}

function buildPalette(q){
  const raw = (q||'').trim();
  const kw = raw.toLowerCase();
  if (!aiZone(raw)){ palItems = []; $('#paletteList').innerHTML = ''; return; }

  const groups = [];
  const hit = (s) => !kw || String(s).toLowerCase().includes(kw);

  /* 「常用项目」由项目派生，不再写死项目 id —— 原来这两条是硬编码 id 的 startRun 调用，
     项目删掉之后入口还挂在面板上，点下去会因为 startRun 的兜底静默跑到别的项目上。
     分组为空时会被下面的 clean 过滤掉，所以删光了自然就不再出现。
     排序 = 最近使用（lastTs 降序，从没跑过的 0 沉底），提示列显示同一个口径的「最近使用」，
     顺序因此自己就能说明白。标签主体必须用项目名而不是流程名：没起过流程名的项目会拿到同一个
     兜底文案，只写流程名就会出现多条一模一样的条目、看不出该点哪个。 */
  groups.push({name:'常用项目', items:DATA.projects
    .filter(w => hit('运行' + w.name + lastUsedLabel(w)))
    .sort((a, b) => (Number(b.lastTs) || 0) - (Number(a.lastTs) || 0))
    .map(w=>({t:`运行「${w.name}」`, k:lastUsedLabel(w), ico:'run', act:()=>startRun(w.id)}))});
  groups.push({name:'项目', items:DATA.projects.filter(w=>hit(w.name))
    .map(w=>({t:w.name, k:'运行项目', ico:'run', act:()=>startRun(w.id)}))});
  groups.push({name:'页面', items:Object.entries({home:'首页',apps:'应用',files:'文件',modules:'模块',workflows:'项目',settings:'设置'})
    .filter(([id,n])=>hit(n)).map(([id,n])=>({t:n, k:'跳转', ico:'grid', act:()=>go(id)}))});
  groups.push({name:'应用', items:S.apps.filter(a=>hit(a.name)).slice(0,6)
    .map(a=>({t:a.name, k:'启动', ico:'app', app:a, act:()=>launch(a.id)}))});
  groups.push({name:'命令', items:PAL_CMD.filter(c=>hit(c.t)).map(c=>({t:c.t, k:c.k, ico:'spark', act:c.act}))});

  const clean = groups.filter(g=>g.items.length);
  palItems = clean.flatMap(g=>g.items);
  if (palSel >= palItems.length) palSel = 0;

  let i = 0;
  $('#paletteList').innerHTML = clean.length ? clean.map(g=>`
    <div class="p-group">${g.name}</div>
    ${g.items.map(it=>{
      const idx = i++;
      return `<button class="p-item ${idx===palSel?'sel':''}" data-pi="${idx}">
        <span class="p-ico">${it.ico==='app'?`<span style="width:20px;height:20px;display:block">${appIconHTML(it.app.icon)}</span>`:icForPal(it.ico)}</span>
        <span class="p-t">${esc(it.t)}</span><span class="p-k">${esc(it.k)}</span></button>`;
    }).join('')}`).join('') : `<div class="empty">${IC.search('currentColor')}<span>没有匹配结果</span></div>`;
}
function icForPal(k){
  return k==='grid' ? IC.grid('var(--ink-3)')
       : k==='file' ? IC.file('var(--ink-3)')
       : k==='run'  ? IC.play('var(--brand)')
       : k==='spark'? IC.spark('var(--brand)')
       : IC.search('var(--ink-3)');
}
function openPalette(){
  $('#paletteMask').classList.add('on');
  const inp = $('#paletteInput'); inp.value=''; palSel=0; buildPalette('');
  setTimeout(()=>inp.focus(), 30);
}
function closePalette(){ $('#paletteMask').classList.remove('on'); }
function runPalette(i){
  const it = palItems[i];
  if (it){ closePalette(); it.act(); return; }
  const primary = $('#aiZone [data-act]');
  if (primary){ closePalette(); primary.click(); }
}

/* ---------------- 语音指令 ---------------- */
const VOICE_SAMPLES = ['启动晨间开工', '恢复上次打开的网页', '深度开发', '收工归档'];
let voiceTimer = null, voiceRec = null;

function voicePanel(text, listening, reason){
  return `<div class="vp">
    <div class="vp-head">
      ${listening ? '<span class="vp-wave"><i></i><i></i><i></i><i></i><i></i></span>' : ''}
      <span>${listening ? '正在聆听…' : '识别完成'}</span>
    </div>
    <div class="vp-tip">${reason ? esc(reason) + '，已用示例指令演示：' : '试着说：「启动晨间开工」「恢复上次打开的网页」'}</div>
    <div class="vp-text">${text ? `“<b>${esc(text)}</b>”` : '等待说话…'}</div>
    <div class="vp-acts">
      ${listening
        ? `<button class="btn btn-ghost btn-sm" data-act="stopVoice">停止</button>`
        : `<button class="btn btn-primary btn-sm" data-act="useVoice">填入指令栏</button>
           <button class="btn btn-ghost btn-sm" data-act="startVoice">重说一次</button>`}
    </div>
  </div>`;
}
function refreshVoice(listening, reason){
  const pop = $('#voicePop');
  if (!pop || !pop.classList.contains('on')) return;
  pop.innerHTML = voicePanel(S.voiceText, listening, reason);
}
function stopVoice(){
  clearInterval(voiceTimer); voiceTimer = null;
  if (voiceRec){ try { voiceRec.stop(); } catch(e){} voiceRec = null; }
  const b = $('#voiceBtn'); if (b) b.classList.remove('listening');
}
function startVoice(){
  const btn = $('#voiceBtn');
  stopVoice();
  S.voiceText = '';
  btn.classList.add('listening');
  const r = btn.getBoundingClientRect();
  openPop('voicePop', Math.max(16, r.right - 330), r.bottom, voicePanel('', true));

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR){
    try {
      voiceRec = new SR();
      voiceRec.lang = 'zh-CN';
      voiceRec.interimResults = true;
      voiceRec.continuous = false;
      voiceRec.onresult = ev => {
        let t = '';
        for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
        S.voiceText = t;
        refreshVoice(true);
      };
      voiceRec.onerror = () => fallbackVoice('浏览器未授权麦克风');
      voiceRec.onend  = () => { if ($('#voiceBtn').classList.contains('listening')) finishVoice(); };
      voiceRec.start();
      return;
    } catch(e){ /* 降级到演示模式 */ }
  }
  fallbackVoice('当前环境不支持语音识别');
}
function fallbackVoice(reason){
  clearInterval(voiceTimer);
  const phrase = VOICE_SAMPLES[Math.floor(Math.random() * VOICE_SAMPLES.length)];
  S.voiceText = '';
  refreshVoice(true, reason);
  let i = 0;
  voiceTimer = setInterval(() => {
    i++;
    S.voiceText = phrase.slice(0, i);
    refreshVoice(true, reason);
    if (i >= phrase.length){ clearInterval(voiceTimer); voiceTimer = null; setTimeout(finishVoice, 480); }
  }, 95);
}
function finishVoice(){
  const btn = $('#voiceBtn');
  if (btn) btn.classList.remove('listening');
  clearInterval(voiceTimer); voiceTimer = null;
  if (voiceRec){ try { voiceRec.stop(); } catch(e){} voiceRec = null; }
  const pop = $('#voicePop');
  if (pop && pop.classList.contains('on')){
    pop.innerHTML = voicePanel(S.voiceText || VOICE_SAMPLES[0], false);
  }
}
function useVoice(){
  const t = S.voiceText || VOICE_SAMPLES[0];
  stopVoice();
  closePops();
  openPalette();
  const inp = $('#paletteInput');
  inp.value = t;
  buildPalette(t);
  inp.focus();
}

/* ---------------- 浮层 ---------------- */
function closePops(){
  $$('.pop').forEach(p=>p.classList.remove('on'));
  if (voiceTimer || voiceRec) stopVoice();
}
function openPop(id, x, y, html){
  closePops();
  const el = $('#'+id);
  el.innerHTML = html;
  el.classList.add('on');
  const r = el.getBoundingClientRect();
  el.style.left = Math.min(x, window.innerWidth - r.width - 16) + 'px';
  el.style.top  = (y + 8) + 'px';
}
function bellPop(btn){
  const r = btn.getBoundingClientRect();
  openPop('bellPop', r.right - 300, r.bottom, `
    <div class="pop-h" style="display:flex;align-items:center">通知
      <button class="link" style="margin-left:auto" data-act="readAll">全部标为已读</button></div>
    ${S.notices.map((n,i)=>`
      <div class="note">
        <span class="dot" style="margin-top:6px;background:${n.read?'var(--ink-4)':'var(--brand)'}"></span>
        <div style="flex:1;min-width:0"><div class="n-t">${esc(n.t)}</div><div class="n-d">${esc(n.d)}</div></div>
        <span class="n-time">${esc(n.time)}</span>
      </div>`).join('')}
    <div class="pop-div"></div>
    <button class="pop-item" data-act="goSettings">${IC.bell('var(--ink-3)')}<span>通知设置</span></button>`);
}

/* ---------------- 抽屉 ---------------- */
function openDrawer(html){ $('#drawer').innerHTML = html; $('#drawer').classList.add('on'); $('#drawerMask').classList.add('on'); }
function closeDrawer(){ $('#drawer').classList.remove('on'); $('#drawerMask').classList.remove('on'); }
const dHead = (title, sub) => `
  <div class="d-head">
    <div><h2>${esc(title)}</h2>${sub?`<p style="margin:5px 0 0;font-size:12px;color:var(--ink-3)">${esc(sub)}</p>`:''}</div>
    <button class="icon-btn d-close" data-act="closeDrawer" style="width:34px;height:34px">${IC.close('var(--ink-2)')}</button>
  </div>`;

/* ---------------- 居中弹窗：所有「编辑 / 填写」表单的唯一宿主 ----------------
   记录编辑、编辑基本资料、新建 / 编辑任务、新建项目、添加应用、导出配置
   全部走这里（同一个 #noteModal 宿主，样式一套）；只有「纯查看」类详情留在右侧抽屉。
   opts.form === true → 窄版宽度（字段少的表单）；默认宽版（长文本 / 列表）。 */
function openModal(html, opts){
  const m = $('#noteModal'), k = $('#noteModalMask');
  if (!m) return false;
  m.innerHTML = html;
  m.classList.toggle('form', !!(opts && opts.form));
  m.classList.toggle('app-picker', !!(opts && opts.appPicker));
  m.classList.add('on');
  if (k) k.classList.add('on');
  return true;
}
/* 关闭只摘 .on，让面板带着内容淡出 —— 参考 closeDrawer()。
   之前这里顺手 m.innerHTML=''/去掉 .form：面板在 .26s 退出过渡里还在绘制，
   内容却已经没了，只剩 20px 上下内边距，屏幕上就留一条 760×42 的空白横条。
   内容与模式类都不用在这里清：openModal() 每次都会重写 innerHTML 并重新 toggle。 */
function closeModal(){
  S.updatePanel=null;
  const m = $('#noteModal'), k = $('#noteModalMask');
  if (m) m.classList.remove('on');
  if (k) k.classList.remove('on');
  return true;
}
/* 弹窗标题区 / 按钮区：与项目记录、编辑基本资料弹窗同一套骨架（nm-head / nm-acts） */
const mHead = (title, sub) => `
  <div class="nm-head">
    <div class="nm-id">
      <div class="nm-title">${esc(title)}</div>
      ${sub?`<div class="nm-meta">${esc(sub)}</div>`:''}
    </div>
    <button class="note-modal-x" data-act="closeModal" title="关闭" aria-label="关闭">${IC.close('currentColor')}</button>
  </div>`;
const mActs = inner => `<div class="nm-acts" style="display:flex;gap:8px;flex-wrap:wrap">${inner}</div>`;

/* 项目记录编辑：居中模态框只从项目开发上下文打开。 */
function noteModalHTML(id){
  const n = S.notes.find(x=>x.id===id); if(!n) return '';
  return `<div class="nm-head">
      <div class="nm-id">
        <div class="nm-title">编辑项目记录<small>${n.pinned ? '已置顶' : '未置顶'}</small></div>
        <div class="nm-meta">${esc(n.title)} · ${esc(n.tag)} · ${esc(n.time)}</div>
      </div>
      <button class="note-modal-x" data-act="closeNoteModal" title="关闭并返回项目" aria-label="关闭">${IC.close('currentColor')}</button>
    </div>
    <input id="noteTitle" class="drawer-input" value="${esc(n.title)}" placeholder="标题">
    <div class="card-title" style="font-size:13px;margin-top:6px">标签<small>用于区分灵感、技术与复盘记录</small></div>
    <div class="tabs" style="margin:6px 0">
      ${['日常','技术','复盘','灵感'].map(t=>`<button class="tab ${n.tag===t?'on':''}" data-act="noteTag" data-id="${n.id}" data-v="${t}">${t}</button>`).join('')}
    </div>
    <textarea id="noteBody" class="drawer-textarea" placeholder="开始记录…">${esc(n.body)}</textarea>
    <div class="nm-acts" style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" data-act="saveNote" data-id="${n.id}">${IC.check('#fff')}保存</button>
      <button class="btn btn-ghost btn-sm" data-act="togglePinNote" data-id="${n.id}">${n.pinned?'取消置顶':'置顶'}</button>
      <button class="btn btn-ghost btn-sm" data-act="delNote" data-id="${n.id}">删除</button>
    </div>`;
}
function openNote(id){
  const html = noteModalHTML(id); if (!html) return;
  S.noteSel = id;
  openModal(html);                       // 宽版：含长文本 body
}
/* 通用弹窗的关闭入口。名字沿用 closeNoteModal（遮罩与 Esc 都指向它），
   实现已收敛到 closeModal()：不管当前开着哪个表单，关的都是同一个宿主。 */
function closeNoteModal(){
  S.noteSel = '';
  return closeModal();
}

/* 新建项目记录：创建后直接进入唯一编辑入口。 */
function newNote(presetProj){
  const owner = presetProj || ((DATA.projects.find(p=>p.id===S.wf)||DATA.projects[0])||{}).name || '';
  if (typeof fetch !== 'function'){
    const n = { id:'n'+Date.now().toString(36), title:'无标题记录', tag:'日常',
                pinned:false, time:'刚刚', body:'', proj:owner, links:[] };
    S.notes.unshift(n); render(true); openNote(n.id); return;
  }
  void createBackendNote(owner).then(n => {
    if (!n) throw new Error('项目记录创建后无法恢复');
    render(true); openNote(n.id); toast(`已新建「${owner}」的项目记录`);
  }).catch(err => toast(err && err.message ? err.message : '项目记录创建失败'));
}

/* 新建 / 编辑共用的表单骨架：标题 → 截止 → 优先级，两处逐字一致。
   共用的意义是防止再次出现「新建一个样、编辑另一个样」的版式漂移。
   o = { textId, text, due, pri, dueAct, priAct, idAttr }（编辑态多带 idAttr 指向任务 id）。 */
function todoFormHTML(o){
  const attrs = o.idAttr || '';
  return `<input id="${o.textId}" class="drawer-input"${o.text != null ? ` value="${esc(o.text)}"` : ''} placeholder="要做什么？">
    <div class="card-title" style="font-size:13px;margin-top:6px">截止</div>
    <div class="tabs" style="margin:6px 0">
      ${['今天','明天','本周'].map(d=>`<button class="tab ${o.due===d?'on':''}" data-act="${o.dueAct}"${attrs} data-v="${d}">${d}</button>`).join('')}
    </div>
    <div class="card-title" style="font-size:13px;margin-top:6px">优先级</div>
    <div class="tabs" style="margin:6px 0">
      ${TASK_PRI.map(p=>`<button class="tab ${o.pri===p?'on':''}" data-act="${o.priAct}"${attrs} data-v="${p}">${p}</button>`).join('')}
    </div>`;
}

/* 新建项目任务：只从项目开发上下文进入，创建后归属当前项目。走居中弹窗（窄版表单）。 */
function newTodo(presetProj){
  S._todoDue = '今天';
  S._todoPri = '中';
  S._todoProj = presetProj || ((DATA.projects.find(p=>p.id===S.wf)||DATA.projects[0])||{}).name || '';
  openModal(`${mHead('新建项目任务', S._todoProj)}
    ${todoFormHTML({ textId:'todoText', due:S._todoDue, pri:S._todoPri, dueAct:'todoDue', priAct:'todoPri' })}
    ${mActs(`<button class="btn btn-primary btn-sm" data-act="saveTodo">${IC.check('#fff')}保存</button>
      <button class="btn btn-ghost btn-sm" data-act="closeModal">取消</button>`)}`, { form:true });
  setTimeout(()=>{ const el = $('#todoText'); if (el) el.focus(); }, 60);
}

/* 项目任务编辑弹窗：任务条目的唯一编辑入口。
   表单骨架与「新建项目任务」共用 todoFormHTML()，两处顺序 / 样式逐字一致。
   只保留「标题 / 截止 / 优先级」——所属项目（改为标题副标题只读展示）与
   「关联项目记录」整块已按需求删除，见 AGENTS.md §11。 */
function todoMenu(id){
  const t = S.todos.plan.find(x=>x.id===id); if(!t) return;
  openModal(`${mHead('项目任务编辑', t.proj)}
    ${todoFormHTML({ textId:'todoEditText', text:t.text, due:t.due, pri:priOf(t),
                     dueAct:'reschedule', priAct:'todoSetPri', idAttr:` data-id="${t.id}"` })}
    ${mActs(`<button class="btn btn-primary btn-sm" data-act="saveTodoEdit" data-id="${t.id}">${IC.check('#fff')}保存</button>
      <button class="btn btn-ghost btn-sm" data-act="delTodoItem" data-id="${t.id}">${IC.trash('var(--ink-2)')}删除</button>
      <button class="btn btn-ghost btn-sm" data-act="closeModal">取消</button>`)}`, { form:true });
}

/* ---------------- 行为 ---------------- */
/* 深色从接触点向外揭开，返回浅色时旧深色从接触点向内收回。
   键盘、减少动态效果和旧版 WebView2 即时换肤。
   View Transition 只截取旧 / 新画面，不克隆 DOM，页面内容与滚动位置始终原位。 */
let activeThemeTransition = null;
let themeChangeId = 0;
let pendingTheme = null;
let themeCancelRequested = false;
function setTheme(next, event){
  if (activeThemeTransition){
    if (next === (pendingTheme ?? S.theme)) return;
    pendingTheme = next;
    if (!themeCancelRequested){
      themeCancelRequested = true;
      activeThemeTransition.skipTransition();
    }
    return;
  }
  if (next === S.theme) return;
  S.theme = next;
  const changeId = ++themeChangeId;
  const commit = () => {
    if (changeId !== themeChangeId) return;
    applyTheme(S.theme);          /* 同步壳底色，避免 WebView2 顶部系统保留区露出白带 */
    persistPrefs();
    /* 设置页只更新两枚选项，不在快照阶段重建整个页面。 */
    if (S.page === 'settings') $$('[data-act="theme"]').forEach(b => b.classList.toggle('on', b.dataset.v === S.theme));
  };
  const announce = () => toast(S.theme === 'light' ? '已切换到浅色主题' : '已切换到深色主题');
  const reduce = globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pointer = event && event.detail > 0 && Number.isFinite(event.clientX) && Number.isFinite(event.clientY);
  if (!pointer || reduce || !document.startViewTransition || !document.documentElement.animate){ commit(); announce(); return; }

  const x = event.clientX, y = event.clientY;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const darkExpands = next === 'dark';
  const root = document.documentElement;
  root.classList.add('theme-transition-active');
  root.classList.toggle('theme-transition-contract', !darkExpands);
  let transition;
  try { transition = document.startViewTransition(commit); }
  catch (_) { root.classList.remove('theme-transition-active', 'theme-transition-contract'); commit(); announce(); return; }
  activeThemeTransition = transition;
  transition.ready.then(() => {
    if (activeThemeTransition !== transition || themeCancelRequested) return;
    const style = getComputedStyle(root);
    const small = `circle(0px at ${x}px ${y}px)`;
    const large = `circle(${radius}px at ${x}px ${y}px)`;
    root.animate({ clipPath:darkExpands ? [small, large] : [large, small] }, {
      duration:parseFloat(style.getPropertyValue('--motion-theme')) || 420,
      easing:style.getPropertyValue('--ease-in-out').trim() || 'cubic-bezier(.77,0,.175,1)',
      fill:'both',
      pseudoElement:darkExpands ? '::view-transition-new(root)' : '::view-transition-old(root)'
    });
  }).catch(() => {
    if (activeThemeTransition === transition && !themeCancelRequested) transition.skipTransition();
  });
  const finish = () => {
    if (activeThemeTransition !== transition) return;
    activeThemeTransition = null;
    themeCancelRequested = false;
    root.classList.remove('theme-transition-active', 'theme-transition-contract');
    if (pendingTheme !== null){
      const requested = pendingTheme;
      pendingTheme = null;
      if (requested !== S.theme){ setTheme(requested); return; }
    }
    announce();                 /* 提示条不参与整页快照，减少多余合成 */
  };
  transition.finished.then(finish, finish);
}
function toggleTheme(event){ setTheme((pendingTheme ?? S.theme) === 'light' ? 'dark' : 'light', event); }
function launch(id){
  const a = S.apps.find(x=>x.id===id); if(!a) return;
  const done = saved => {
    if (typeof fetch !== 'function'){ saved.lastTs = Date.now(); saved.last = '刚刚'; }
    toast(`正在启动 ${saved.name}`);
    addActivity(`启动了 ${saved.name}`, saved.cat, 'ext', C.indigo, '应用'); render(true);
  };
  if (typeof fetch !== 'function'){ done(a); return; }
  if (!BACKEND_APP_IDS.has(a.id)){ toast('应用尚未由后端保存'); return; }
  void apiRequest(`/applications/${encodeURIComponent(a.id)}/launch`, {method:'POST'}).then(row => {
    const saved = applyBackendApp(row); if (!saved) throw new Error('应用启动记录无法恢复'); done(saved);
  }).catch(err => toast(err && err.message ? err.message : '应用启动记录保存失败'));
}
/* 添加应用：只接受后端实时扫描到的 Windows 开始菜单应用。 */
function addApp(){
  if (S.addStep === 'confirm') return addAppConfirm();
  const q = (S.scanQuery || '').trim().toLowerCase();
  const pool = q ? S.scanApps.filter(p => fuzzyMatch(p.name, q) || fuzzyMatch(p.cat, q)) : S.scanApps;
  const picked = S.scanApps.find(p => p.id === S.addPick);
  const html = `${mHead('添加本机应用','识别 Windows 本机可启动应用，只显示具有真实启动入口的应用')}
    <div class="board-head app-picker-toolbar" style="margin:0 0 8px">
      <span class="card-title" style="font-size:13px">扫描结果<small>${S.scanLoading ? '正在识别…' : `${S.scanApps.length} 个可启动应用`}</small></span>
      <div style="margin-left:auto;width:150px"><div class="field sm">${IC.search('var(--ink-3)')}<input id="scanSearch" placeholder="搜索扫描结果" value="${esc(S.scanQuery||'')}"></div></div>
    </div>
    <div class="list app-picker-list" id="scanAppList">
      ${pool.map(p => {
        const added = p.added || S.apps.some(a => a.id === p.id);
        const on = S.addPick === p.id;
        return `<div class="row scan-row ${on?'on':''}${added?' off':''}"${added?'':` data-act="pickScan" data-id="${p.id}"`} role="${added?'':'button'}" tabindex="${added?-1:0}" title="${added ? '已在应用列表中' : '点击选中 ' + esc(p.name)}">
          <span class="ricon" style="width:24px;height:24px">${appIconHTML(p.icon)}</span>
          <span class="r-title">${esc(p.name)}</span>
          <span class="r-meta">${esc(p.cat)}</span>
          ${added ? '<span class="badge b-slate">已添加</span>' : `<span class="scan-check">${on ? IC.check('var(--brand)') : ''}</span>`}
        </div>`;
      }).join('')}
      ${S.scanLoading ? `<div class="empty">${IC.clock('currentColor')}<span>正在读取本机开始菜单…</span></div>` : ''}
      ${!S.scanLoading && S.scanError ? `<div class="empty">${IC.close('currentColor')}<span>${esc(S.scanError)}</span></div>` : ''}
      ${!S.scanLoading && !S.scanError && !pool.length ? `<div class="empty">${IC.search('currentColor')}<span>${S.scanApps.length ? '没有匹配的应用，换个关键词试试' : '没有发现可启动应用'}</span></div>` : ''}
    </div>
    <div class="app-picker-actions">
      <span class="app-picker-picked" aria-live="polite">${picked ? `已选择：<strong>${esc(picked.name)}</strong>` : '选择一个应用后继续'}</span>
      ${mActs(`<button class="btn btn-ghost btn-sm" data-act="refreshAppScan">重新扫描</button>
        <button class="btn ${picked?'btn-primary':'btn-ghost'} btn-sm" data-act="beginAdd" ${picked?'':'disabled'}>${picked ? '下一步' : '选择应用'}</button>`)}
    </div>`;
  openModal(html, { form:true, appPicker:true });
  const list = $('#scanAppList');
  if (list){
    list.scrollTop = Number(S.scanScroll) || 0;
    list.addEventListener('scroll', () => { S.scanScroll = list.scrollTop; }, {passive:true});
  }
  return html;
}
/* 第二步：命名确认——预填原始名称，不改即沿用原名 */
function addAppConfirm(){
  const p = S.scanApps.find(x => x.id === S.addPick);
  if (!p){ S.addStep = 'form'; return addApp(); }
  const name = (S.addName || '').trim();
  const cat = S.addCat || p.cat;
  const cats = [...new Set(S.apps.map(a => a.cat).filter(Boolean).concat(p.cat))];
  const html = `${mHead('命名确认','不改名称将直接使用应用的原始名称')}
    <div class="add-head">
      <span class="add-ico">${appIconHTML(p.icon)}</span>
      <div class="add-lead"><b>${esc(p.name)}</b><span>来自本机扫描 · 原始名称作为默认名称</span></div>
    </div>
    <div class="field" style="min-width:0;width:100%">${IC.grid('var(--ink-3)')}<input id="appName" placeholder="应用名称（留空则使用原始名称「${esc(p.name)}」）" value="${esc(name)}"></div>
    <div class="card-title" style="font-size:13px;margin-top:4px">标签</div>
    <div class="cat-chips">
      ${cats.map(c => `<button class="cat-chip ${cat===c?'on':''}" data-act="pickCat" data-v="${esc(c)}">${esc(c)}</button>`).join('')}
    </div>
    ${mActs(`<button class="btn btn-ghost btn-sm" data-act="backToAdd">返回选择</button>
      <button class="btn btn-primary btn-sm" data-act="createFromScan">${IC.check('#fff')}确认添加</button>`)}`;
  openModal(html, { form:true });
  return html;
}
/* 弹窗重开前暂存已填内容，避免切换标签时丢输入 */
function stashAddForm(){
  const n = $('#appName');
  if (n) S.addName = n.value.trim();
}
function pickAddCat(v){
  stashAddForm();
  S.addCat = (S.addCat === v) ? '' : v;
  addApp();
}
function refreshAppScan(){
  S.addStep = 'form'; S.addPick = ''; S.scanQuery = ''; S.scanScroll = 0;
  void loadScannedApps();
}
/* 扫描结果两步流程：选中 → 添加 → 命名确认（不命名沿用原始名称） */
function pickScan(id){
  stashAddForm();
  S.addPick = (S.addPick === id) ? '' : id;          // 再点一次取消选中
  S.addStep = 'form';
  addApp();
}
function beginAdd(){
  stashAddForm();
  const p = S.scanApps.find(x => x.id === S.addPick);
  if (!p){ toast('先在扫描结果中选中一个应用'); return; }
  if (p.added || S.apps.some(a => a.id === p.id)){ S.addPick = ''; toast('该应用已在列表中'); addApp(); return; }
  S.addStep = 'confirm';
  S.addName = p.name;                                 // 预填原始名称，改或不改由用户决定
  S.addCat = p.cat;
  addApp();
}
function backToAdd(){
  stashAddForm();
  S.addStep = 'form';                                 // 返回第一步，保留选中与搜索词
  addApp();
}
function createFromScan(){
  stashAddForm();
  const p = S.scanApps.find(x => x.id === S.addPick); if (!p) return;
  const name = (S.addName || '').trim() || p.name;    // 不命名 → 直接使用原始名称
  let cat = S.addCat;
  if (!cat) cat = p.cat;
  if (S.apps.some(a => a.name === name)){ toast('列表里已有同名应用'); return; }
  const done = saved => {
    p.added = true;
    S.addName=''; S.addCat='';
    S.addStep='form'; S.addPick=''; S.scanQuery=''; S.scanScroll=0; closeModal(); render(true);
    toast(saved.name === p.name ? `已添加 ${saved.name}（沿用原始名称）` : `已添加 ${saved.name}（自定义命名）`);
    addActivity(`添加了应用 ${saved.name}`, saved.cat, 'ext', C.indigo, '应用');
  };
  if (typeof fetch !== 'function'){ toast('后端未连接，不能添加本机应用'); return; }
  void apiRequest('/applications/from-scan', {
    method:'POST', body:JSON.stringify({scan_id:p.id, name, category:cat})
  }).then(row => {
    const saved = applyBackendApp(row);
    if (!saved) throw new Error('应用创建后无法恢复'); done(saved);
  }).catch(err => toast(err && err.message ? err.message : '应用创建失败'));
}
/* ---------- 项目执行 ---------- */
let runTimer = null, runToken = 0;
const REAL_PROJECT_IDS = new Set(['apex']);
const BACKEND_PROJECT_IDS = new Set();
const BACKEND_TASK_IDS = new Set();
const BACKEND_NOTE_IDS = new Set();
const BACKEND_APP_IDS = new Set();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function backendLogClass(line){
  if (/\[ERROR\]/.test(line)) return 'err';
  if (/\[OK\]/.test(line)) return 'ok';
  if (/\[(WARN|STEP)\]/.test(line)) return 'dim';
  return '';
}
function executionLogEntries(execution){
  if (!execution || !Array.isArray(execution.steps)) return [];
  const rows = [{c:'cmd', t:`$ cpod ${execution.action || 'run'} 项目执行`}];
  execution.steps.forEach((step, index) => {
    const prefix = `${index + 1}. ${step.module_name || step.module_id || '未命名模块'}`;
    const status = step.status || 'queued';
    rows.push({c:status==='failed' ? 'err' : status==='succeeded' || status==='stopped' ? 'ok' : 'dim',
      t:`${status==='failed' ? '✗' : status==='succeeded' || status==='stopped' ? '✓' : '·'} ${prefix}：${status==='succeeded' ? '完成' : status==='stopped' ? '已关闭' : status==='failed' ? (step.error || '失败') : '等待中'}`});
    const logs = step.run && Array.isArray(step.run.logs) ? step.run.logs : [];
    logs.forEach(line => rows.push({c:backendLogClass(String(line)), t:String(line)}));
  });
  if (execution.error && !rows.some(row => row.t.includes(execution.error))) rows.push({c:'err', t:`✗ ${execution.error}`});
  return rows;
}
function executionState(status){
  if (status==='succeeded' || status==='stopped') return 'done';
  if (status==='running') return 'now';
  if (status==='failed' || status==='interrupted') return 'error';
  return 'wait';
}
function applyExecutionSteps(wf, r, steps){
  if (!Array.isArray(steps)) return false;
  const enabled = wf.steps.filter(s=>s.on);
  enabled.forEach(step => { r.states[step.id] = 'wait'; });
  enabled.forEach((step, index) => {
    const matches = steps.filter(item => item && item.module_id === step.moduleId);
    const current = matches.find(item => item.status==='running' || item.status==='failed' || item.status==='interrupted')
      || matches[matches.length - 1];
    if (current) r.states[step.id] = executionState(current.status);
    if (r.states[step.id] === 'now' || r.states[step.id] === 'error') r.i = index;
  });
  r.done = enabled.filter(step => r.states[step.id] === 'done').length;
  return true;
}
function backendRuntimeState(payload){
  const steps = payload && Array.isArray(payload.steps) ? payload.steps : [];
  const runs = steps.map(step => step && step.run).filter(Boolean);
  const latest = runs[runs.length - 1];
  const state = latest && latest.result && latest.result.status && latest.result.status.state;
  return state === 'running' || state === 'stopped' ? state : '';
}
function restoreBackendExecution(wf, payload){
  if (!wf || !payload) return false;
  const enabled = wf.steps.filter(s=>s.on);
  S.running = {
    token:++runToken, wfId:wf.id, i:-1, done:0, total:enabled.length || 1, states:{}, log:[],
    order:enabled.map(step=>step.id), real:true, action:payload.action || 'run',
    status:payload.status || 'queued', runId:payload.id || '', restored:true
  };
  applyBackendRun(wf, S.running.token, payload);
  return true;
}
function markBackendRunFailed(wf, token, message){
  const r = S.running;
  if (!r || r.token!==token) return;
  const stepId = r.order[0];
  if (stepId) r.states[stepId] = 'error';
  r.status = 'failed'; r.error = message || '模块执行失败'; r.i = stepId ? 0 : -1;
  r.log.push({c:'err', t:`✗ ${r.error}`});
  S.runOpen[wf.id] = true;
  if (S.page==='workflows' || S.page==='projects') render(true);
  const verb = r.action==='stop' ? '关闭' : r.action==='restart' ? '重启' : '运行';
  toast(`「${wf.name}」${verb}失败`);
  shellToast(`「${wf.name}」${verb}失败：${r.error || ''}`, '运行失败');
}
function rememberBackendAttempt(wf, payload){
  if (!wf || !payload || payload.action === 'stop') return;
  const item = backendHistoryRow(payload);
  if (!Array.isArray(wf.history) || !wf.history.some(row => row.id === item.id)){
    wf.runs = (Number(wf.runs) || 0) + 1;
    wf.history = [item, ...(Array.isArray(wf.history) ? wf.history : [])].slice(0, 3);
  }
  wf.last = item.t;
  /* 本次会话刚跑过 → 就地刷新排序键，不用等下次启动，「常用项目」的顺序立刻跟着变。
     后端没给 started_at 时保留旧值，不要用 Date.now() 凭空造一个时间。 */
  wf.lastTs = item.at || wf.lastTs || 0;
  wf.execution = payload;
}
function applyBackendRun(wf, token, payload){
  const r = S.running;
  if (!r || r.token!==token || !payload) return false;
  r.runId = payload.id || r.runId;
  r.status = payload.status || r.status;
  r.action = payload.action || r.action || 'run';
  const closing = r.action === 'stop';
  const restarting = r.action === 'restart';
  const stepId = r.order[0];
  const lines = Array.isArray(payload.logs) ? payload.logs : [];
  r.log = Array.isArray(payload.steps) ? executionLogEntries(payload) : [
    {c:'cmd', t:`$ cpod ${r.action} "${wf.name}"`},
    {c:'dim', t:`[${now()}] 已交给后端模块执行`},
    ...lines.map(line=>({c:backendLogClass(String(line)), t:String(line)})
  )];
  applyExecutionSteps(wf, r, payload.steps);
  if (r.status==='queued'){
    r.i = -1; r.done = 0; if (stepId) r.states[stepId] = 'wait';
  } else if (r.status==='running'){
    r.i = stepId ? 0 : -1; r.done = 0; if (stepId) r.states[stepId] = 'now';
  } else if (r.status==='succeeded' || r.status==='stopped'){
    if (!Array.isArray(payload.steps)){ r.i = stepId ? 0 : -1; r.done = r.total; if (stepId) r.states[stepId] = 'done'; }
    const runtimeState = backendRuntimeState(payload) || (payload.result && payload.result.status && payload.result.status.state);
    if (REAL_PROJECT_IDS.has(wf.id) && (runtimeState === 'running' || runtimeState === 'stopped')) S.projectRuntime[wf.id] = runtimeState;
    if (!r.settled){
      r.settled = true;
      rememberBackendAttempt(wf, payload);
      const verb = closing ? '关闭' : restarting ? '重启' : '启动';
      addActivity(`${verb}了项目「${wf.name}」`, `真实模块${verb}成功`, closing ? 'close' : 'play', C.green, '项目');
      toast(`「${wf.name}」${closing ? '已关闭' : restarting ? '已重启' : '已完成'}`);
      shellToast(`「${wf.name}」${closing ? '已关闭' : restarting ? '已重启' : '已完成'}`, '运行完成');
    }
  } else if (r.status==='failed' || r.status==='interrupted'){
    const message = payload.error || (payload.result && payload.result.error) || (closing ? '项目关闭失败' : restarting ? '项目重启失败' : '模块执行失败');
    r.error = message; r.i = stepId ? 0 : -1; if (stepId) r.states[stepId] = 'error';
    if (!lines.some(line=>String(line).includes(message))) r.log.push({c:'err', t:`✗ ${message}`});
    S.runOpen[wf.id] = true;
    if (!r.settled){
      r.settled = true;
      rememberBackendAttempt(wf, payload);
      toast(`「${wf.name}」${closing ? '关闭' : restarting ? '重启' : '运行'}失败`);
      shellToast(`「${wf.name}」${closing ? '关闭' : restarting ? '重启' : '运行'}失败：${message}`, '运行失败');
    }
  }
  /* 首次落到终态时刷新活跃度聚合：这次真实执行要立刻反映到色格上 */
  if (r.settled && !r.heatBumped){ r.heatBumped = true; void refreshHeatCounts(); }
  /* 轮询每 ~150ms 拉一次执行状态；内容没变就不重绘 —— render 是全量重建 DOM，
     重建后鼠标下方卡片的 hover 上浮过渡与运行指示动画都会从头重播，
     观感就是卡片反复弹跳、闪烁。指纹相同（status/步骤/日志/结果均未变）时跳过。 */
  const appliedKey = JSON.stringify([r.status, payload.steps || null, payload.logs || null, payload.error || '', payload.result || null]);
  if (appliedKey !== r.appliedKey){
    r.appliedKey = appliedKey;
    if (S.page==='workflows' || S.page==='projects') render(true);
  }
  return r.status==='queued' || r.status==='running';
}
async function startBackendAction(wf, token, action){
  try {
    let payload = await apiRequest(`/projects/${encodeURIComponent(wf.id)}/executions`, {method:'POST', body:JSON.stringify({action})});
    if (!applyBackendRun(wf, token, payload)) return;
    while (S.running && S.running.token===token){
      await delay(150);
      if (!S.running || S.running.token!==token) return;
      payload = await apiRequest(`/executions/${encodeURIComponent(S.running.runId)}`);
      if (!applyBackendRun(wf, token, payload)) return;
    }
  } catch (err){
    markBackendRunFailed(wf, token, err && err.message ? err.message : String(err));
  }
}
function stopProject(id){
  const wf = DATA.projects.find(w=>w.id===id);
  if (!wf){ toast('这个项目已经不存在了'); return false; }
  if (!REAL_PROJECT_IDS.has(wf.id)){
    if (projIsRunning(id)){ clearInterval(runTimer); S.running = null; toast(`已停止「${wf.name}」`); render(true); return true; }
    toast('这个项目没有真实关闭动作'); return false;
  }
  const steps = wf.steps.filter(s=>s.on);
  runToken++;
  S.running = {token:runToken, wfId:wf.id, i:-1, done:0, total:steps.length || 1, states:{}, log:[], order:steps.map(s=>s.id), real:true, action:'stop', status:'queued'};
  steps.forEach(s=>S.running.states[s.id]='wait');
  S.running.log.push({c:'cmd', t:`$ cpod stop "${wf.name}"`});
  S.running.log.push({c:'dim', t:`[${now()}] 正在连接 APEX 常驻后端…`});
  S.runOpen[wf.id] = true;
  render(true);
  void startBackendAction(wf, runToken, 'stop');
  return true;
}
function restartProject(id){
  const wf = DATA.projects.find(w=>w.id===id);
  if (!wf){ toast('这个项目已经不存在了'); return false; }
  if (!REAL_PROJECT_IDS.has(wf.id)){ toast('这个项目没有真实重启动作'); return false; }
  if (!projIsStarted(id) && !projIsRunning(id)){ toast('项目尚未启动，不需要重启'); return false; }
  const steps = wf.steps.filter(s=>s.on);
  runToken++;
  S.running = {token:runToken, wfId:wf.id, i:-1, done:0, total:steps.length || 1, states:{}, log:[], order:steps.map(s=>s.id), real:true, action:'restart', status:'queued'};
  steps.forEach(s=>S.running.states[s.id]='wait');
  S.running.log.push({c:'cmd', t:`$ cpod restart "${wf.name}"`});
  S.running.log.push({c:'dim', t:`[${now()}] 正在关闭项目并重新启动…`});
  S.runOpen[wf.id] = true;
  render(true);
  void startBackendAction(wf, runToken, 'restart');
  return true;
}
async function syncProjectRuntime(){
  let changed = false;
  await Promise.all(Array.from(REAL_PROJECT_IDS).map(async id => {
    try {
      const payload = await apiRequest(`/projects/${encodeURIComponent(id)}/runtime`);
      if (payload && (payload.state === 'running' || payload.state === 'stopped') && S.projectRuntime[id] !== payload.state){
        S.projectRuntime[id] = payload.state;
        changed = true;
      }
    } catch (_) {
      /* 后端不可用时保留未知态，不伪造项目正在运行。 */
    }
  }));
  if (changed && (S.page==='workflows' || S.page==='projects')) render(true);
  return changed;
}
/* 真实项目（桥）的存活是**异步落地**的事实：用户可能直接关掉看板、从任务管理器
   杀掉桥，甚至只是合上笔记本再回来。所以「运行态」不能只在页面初始化问一次 ——
   那会让卡片永远停在「运行中/关闭中」。这里每 5 秒静默对一次账，只在状态真的
   变了才重绘（render 是全量重建 DOM，无脑重绘会让 hover 过渡和运行动画不停重播）。 */
let runtimeTimer = null;
const RUNTIME_POLL_MS = 5000;
function startRuntimePoll(){
  if (typeof document === 'undefined' || runtimeTimer !== null) return;
  /* 页面在后台时不必按点对账：回来那一刻 visibilitychange 会补一发。 */
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void syncProjectRuntime(); });
  runtimeTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (!S.backendReady) return;
    void syncProjectRuntime();
  }, RUNTIME_POLL_MS);
}
function stopRuntimePoll(){
  clearInterval(runtimeTimer); runtimeTimer = null;
}
/* opts.stay=true：就地启动（停在当前页，用于项目选择页的「启动」），否则跳到项目详情页看运行控制台 */
function startRun(id, opts){
  /* 明确判存在：以前是 find(...) || curWf()，项目不存在时会静默拿第一个项目顶上，
     用户以为跑的是自己点的那个 —— 这比直接报错更难发现。 */
  const wf = DATA.projects.find(w=>w.id===id);
  if (!wf){ toast('这个项目已经不存在了'); return; }
  const steps = wf.steps.filter(s=>s.on);
  if (!steps.length){ toast('这个项目还没有启用任何执行模块'); return; }
  S.wf = wf.id;
  runToken++;
  const real = REAL_PROJECT_IDS.has(wf.id);
  S.running = {token:runToken, wfId:wf.id, i:-1, done:0, total:steps.length, states:{}, log:[], order:steps.map(s=>s.id), real, action:'run', status:real?'queued':''};
  steps.forEach(s=>S.running.states[s.id]='wait');
  S.running.log.push({c:'cmd', t:`$ cpod run "${wf.name}"`});
  S.running.log.push({c:'dim', t: real ? `[${now()}] 正在连接本地后端…` : `[${now()}] 配置已确认：${steps.length} 个步骤，按顺序启动`});
  const stay = !!(opts && opts.stay);
  if (!stay && S.page !== 'workflows') go('workflows'); else render(true);
  if (real){ void startBackendAction(wf, runToken, 'run'); return; }
  clearInterval(runTimer);
  runTimer = setInterval(advanceRun, 760);
}
function advanceRun(){
  const r = S.running;
  if (!r){ clearInterval(runTimer); return; }
  if (r.real) return;
  /* 运行中实时重绘：项目选择页也有「运行中」状态，不只是项目详情页 */
  const livePage = S.page === 'workflows' || S.page === 'projects';
  const wf = DATA.projects.find(w=>w.id===r.wfId);
  if (!wf){ clearInterval(runTimer); S.running = null; return; }
  const steps = r.order.map(id=>wf.steps.find(s=>s.id===id)).filter(Boolean);

  if (r.i >= 0 && r.i < steps.length){
    const prev = steps[r.i];
    r.states[prev.id] = 'done'; r.done++;
    r.log.push({c:'ok', t:`✓ ${prev.label} 已就绪`});
  }
  r.i++;
  if (r.i >= steps.length){
    clearInterval(runTimer);
    r.log.push({c:'ok', t:`✓ ${wf.name} 全部就位，用时 ${(steps.length*0.76).toFixed(1)}s`});
    wf.runs++; wf.last = nowShort();
    addActivity(`启动了项目「${wf.name}」`, `${steps.length} 项就绪`, 'play', C.green, '项目');
    const finished = wf.name, token = r.token;
    if (livePage) render(true);
    setTimeout(()=>{
      if (!S.running || S.running.token !== token) return;
      S.running = null; toast(`${finished} 已就绪`);
      if (livePage) render(true);
    }, 1500);
    return;
  }
  const s = steps[r.i];
  r.states[s.id] = 'now';
  r.log.push({c:'', t:`→ 启动${TYPE_META[s.type].name}：${s.label}`});
  if (s.type==='script') r.log.push({c:'dim', t:'  等待进程退出 …'});
  if (s.type==='cmd')    r.log.push({c:'dim', t:`  在工作目录执行：${s.ref}`});
  if (livePage) render(true);
}

/* ---------- 步骤编排 ---------- */
const stepById = id => curWf().steps.find(s=>s.id===id);
function appendProjectStep(wf, ref, type, at, module){
  const t = type;
  const base = {id:'s'+Date.now().toString(36), type:t, ref, wait:true, on:true};
  if (module) base.moduleId = module.module_id || module.id;
  if (t === 'app'){
    const a = S.apps.find(x=>x.id===ref);
    base.applicationId = ref;
    base.label = a ? a.name : ref; base.note = a ? a.cat : '';
  } else {
    base.label = module ? module.name : (t==='web' ? shortUrl(ref) : ref);
    base.note = module ? (module.arg || module.desc) : (t==='web' ? '自定义网页' : '');
  }
  const idx = (typeof at === 'number' && at >= 0 && at <= wf.steps.length) ? at : wf.steps.length;
  wf.steps.splice(idx, 0, base);
  S.flash = base.id;
  setTimeout(()=>{ S.flash = null; }, 700);
  toast(`已添加「${base.label}」到第 ${idx+1} 位`);
  if (S.page!=='workflows') go('workflows'); else render(true);
  return base;
}
function addStep(ref, type, at){
  const t = type || S.larderTab, wf = curWf();
  if (wf.steps.some(s=>s.type===t && s.ref===ref)){ toast('这个执行模块已经在当前项目流程里了'); return; }
  const m = t === 'app' ? null : DATA.modules.find(x=>x.type===t && x.ref===ref);
  if (BACKEND_PROJECT_IDS.has(wf.id)){
    if (t === 'app'){
      const application = S.apps.find(item => item.id === ref);
      if (!application || !BACKEND_APP_IDS.has(application.id)){ toast('这个应用没有可验证的本机启动入口'); return; }
      void apiRequest(`/projects/${encodeURIComponent(wf.id)}/applications/${encodeURIComponent(ref)}`, {method:'PUT'})
        .then(binding => { appendProjectStep(wf, ref, t, at, binding); REAL_PROJECT_IDS.add(wf.id); })
        .catch(err => toast(err && err.message ? err.message : '应用添加失败'));
      return;
    }
    if (!m || !m.id){ toast('这个条目还不是后端执行模块'); return; }
    void apiRequest(`/projects/${encodeURIComponent(wf.id)}/modules/${encodeURIComponent(m.id)}`, {method:'PUT'})
      .then(() => { appendProjectStep(wf, ref, t, at, m); REAL_PROJECT_IDS.add(wf.id); })
      .catch(err => toast(err && err.message ? err.message : '模块添加失败'));
    return;
  }
  return appendProjectStep(wf, ref, t, at, m);
}
function removeStep(id){
  const wf = curWf(); const i = wf.steps.findIndex(s=>s.id===id);
  if (i < 0) return;
  const step = wf.steps[i];
  const finish = () => {
    wf.steps.splice(i, 1);
    if (!wf.steps.some(s => s.moduleId)) REAL_PROJECT_IDS.delete(wf.id);
    toast(`已把「${step.label}」移出当前项目流程`); render(true);
  };
  if (BACKEND_PROJECT_IDS.has(wf.id) && step.moduleId){
    const path = step.type === 'app' && step.applicationId
      ? `/projects/${encodeURIComponent(wf.id)}/applications/${encodeURIComponent(step.applicationId)}`
      : `/projects/${encodeURIComponent(wf.id)}/modules/${encodeURIComponent(step.moduleId)}`;
    void apiRequest(path, {method:'DELETE'})
      .then(finish).catch(err => toast(err && err.message ? err.message : '模块移除失败'));
  } else finish();
}

/* ---------- 内置助手（指令栏回答） ---------- */
function aiReply(q){
  const wf = curWf();
  if (/项目|步骤|编排|模块/.test(q))
    return `你现在有 ${DATA.projects.length} 个项目，当前正在查看「${wf.name}」：运行流程共 ${wf.steps.length} 个执行模块、启用 ${wf.steps.filter(s=>s.on).length} 个。把要串起来的执行模块从右侧执行模块库拖到流程列表，或者点它右侧的「添加」；然后按右上角「运行项目」按顺序执行。`;
  if (/跑|运行|start\.sh|脚本/.test(q)) return 'start.sh 已经跑完，退出码 0，耗时 4.2s。输出里有一条警告：有 2 个模块存在未使用的依赖，不影响运行。需要我把这条警告整理成待办吗？';
  if (/待办|先做|优先/.test(q)) return '按「今天到期 + 阻塞其他任务」排序，我建议先收掉「完善自动化脚本的异常处理」——它挂着两项依赖它的任务。其次是「整理项目文档结构」，大约 20 分钟能完成。';
  if (/活动|总结|今天/.test(q)) return '今天你一共产生了 6 条活动：3 条文件修改集中在 APEX Automation，1 次脚本运行，1 次网页浏览，1 次提交。主要精力在自动化脚本的异常处理上。';
  if (/设计稿|文档|整理/.test(q)) return '设计稿_v3.fig 目前放在 D:/Design/ControlPod，还没登记进项目。可以在 APEX Automation 下建一个 docs/design 目录，把路径写进项目索引。要我执行吗？';
  return '这一步可以拆成：先定位相关文件与脚本，再给出可执行的改动，最后等你确认落地。也可以直接说「启动晨间开工」，我立即执行。';
}

/* ---------------- 事件 ---------------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t){ if (!e.target.closest('.pop')) closePops(); return; }
  const act = t.dataset.act;
  const v = t.dataset.v, id = t.dataset.id, k = t.dataset.k;

  switch(act){
    case 'heatMode': {
      if (S.heatMode === v) break;
      S.heatMode = v;
      render(true);
      break;
    }
    case 'focusProj': projSwitchPop(t); break;
    case 'setCurProj': {
      closePops();
      const p = DATA.projects.find(x=>x.id===id);
      if (!p || id === S.proj) break;
      S.proj = id;
      render(true);
      toast(`已切换到「${p.name}」`);
      addActivity(`切换到项目 ${p.name}`, p.name, 'git', C.green, '项目');
      break;
    }
    case 'tick': {
      const t0 = S.todos.plan.find(x=>x.id===id); if (!t0) break;
      void updateBackendTask(t0, {done:!t0.done}).then(saved => {
        if (!saved) throw new Error('任务保存后无法恢复');
        if (saved.done) pruneCurTasks(saved.id);   /* 完成后自动移出所有当前任务区（一致性） */
        render(true);
        if (saved.done) toast(`已完成「${saved.text}」`);
      }).catch(err => toast(err && err.message ? err.message : '任务状态保存失败'));
      break;
    }
    case 'todoMenu': todoMenu(id); break;
    /* 项目任务 / 项目记录在当前项目内互相打开 */
    case 'gotoTodo': {
      const t0 = allTodos().find(x=>x.id===id); if (!t0) break;
      closeNoteModal();
      todoMenu(id);
      break;
    }
    case 'gotoNote': {
      if (!S.notes.some(x=>x.id===id)) break;
      closeModal();
      openNote(id);
      break;
    }
    case 'todoDue': {
      S._todoDue = v;
      if (t.parentElement) t.parentElement.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
      break;
    }
    case 'saveTodo': {
      const el = $('#todoText');
      const text = el ? el.value.trim() : '';
      if (!text){ toast('先写下要做什么'); break; }
      void createBackendTask(S._todoProj, {
        text, due:S._todoDue || '今天', done:false, kind:'todo', pri:S._todoPri || '中'
      }).then(saved => {
        if (!saved) throw new Error('任务保存后无法恢复');
        closeModal(); render(true); toast(`已添加项目任务「${saved.text}」`);
      }).catch(err => toast(err && err.message ? err.message : '项目任务创建失败'));
      break;
    }
    /* 就地切换优先级：开发上下文的分组即时联动 */
    case 'todoSetPri': {
      const t0 = allTodos().find(x=>x.id===id);
      if (t0 && TASK_PRI.includes(v)) void updateBackendTask(t0, {pri:v}).then(saved => {
        if (!saved) throw new Error('任务保存后无法恢复');
        render(true); todoMenu(saved.id); toast(`已设为${v}优先级`);
      }).catch(err => toast(err && err.message ? err.message : '任务优先级保存失败'));
      break;
    }
    /* 新建弹窗里的优先级暂存 */
    case 'todoPri': {
      S._todoPri = v;
      if (t.parentElement) t.parentElement.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
      break;
    }
    /* 提升为当前任务：按钮入口（拖放入当前任务区走 moveTaskZone 的 drop 分支） */
    case 'promoteTask': moveTaskZone(id, v, 'cur'); break;
    /* 移出当前任务区：回到该任务自己的优先级区 */
    case 'outCurTask': {
      S.devTask[id] = { tids: devTidsOf(id).filter(x=>x!==v) };
      render(true); toast('已移出当前任务');
      break;
    }
    /* 当前任务就地编辑：打开的正是待办编辑抽屉（唯一编辑入口） */
    case 'editCurTask': todoMenu(id); break;
    case 'saveTodoEdit': {
      const t0 = allTodos().find(x=>x.id===id); if (!t0) break;
      const el = $('#todoEditText');
      const text = el ? el.value.trim() : '';
      if (!text){ toast('先写下要做什么'); break; }
      void updateBackendTask(t0, {text}).then(saved => {
        if (!saved) throw new Error('任务保存后无法恢复');
        closeModal(); render(true); toast('已保存修改');
      }).catch(err => toast(err && err.message ? err.message : '任务修改保存失败'));
      break;
    }
    case 'reschedule': {
      const t0 = S.todos.plan.find(x=>x.id===id);
      if (t0) void updateBackendTask(t0, {due:v}).then(saved => {
        if (!saved) throw new Error('任务保存后无法恢复');
        render(true); todoMenu(saved.id); toast(`已改期到「${v}」`);
      }).catch(err => toast(err && err.message ? err.message : '任务改期保存失败'));
      break;
    }
    case 'delTodoItem': {
      const t0 = S.todos.plan.find(x=>x.id===id); if (!t0) break;
      void deleteBackendTask(t0).then(removed => {
        const i = S.todos.plan.findIndex(item=>item.id===removed.id);
        if (i >= 0) S.todos.plan.splice(i,1);
        detachTodoRefs(removed.id);   /* 清理笔记侧的悬空引用 */
        pruneCurTasks(removed.id);    /* 从所有当前任务区移除（一致性） */
        closeModal(); render(true); toast(`已删除「${removed.text}」`);
      }).catch(err => toast(err && err.message ? err.message : '任务删除失败'));
      break;
    }
    case 'newNoteFor': newNote(v); break;      /* 开发上下文新建：预置所属项目 */
    case 'newTodoFor': newTodo(v); break;
    case 'openNote': openNote(id); break;
    case 'noteTag': {
      const n = S.notes.find(x=>x.id===id);
      if (n) void updateBackendNote(n, {tag:v}).then(saved => {
        if (!saved) throw new Error('项目记录保存后无法恢复');
        openNote(saved.id);
      }).catch(err => toast(err && err.message ? err.message : '项目记录标签保存失败'));
      break;
    }
    case 'saveNote': {
      const n = S.notes.find(x=>x.id===id); const t = $('#noteTitle'), b = $('#noteBody');
      if (n){
        const title = t && t.value.trim() ? t.value.trim() : n.title;
        const body = b ? b.value.trim() : n.body;
        void updateBackendNote(n, {title, body}).then(saved => {
          if (!saved) throw new Error('项目记录保存后无法恢复');
          closeNoteModal(); render(true); toast('项目记录已保存');
        }).catch(err => toast(err && err.message ? err.message : '项目记录保存失败'));
      }
      break;
    }
    case 'togglePinNote': {
      const n = S.notes.find(x=>x.id===id);
      if (n) void updateBackendNote(n, {pinned:!n.pinned}).then(saved => {
        if (!saved) throw new Error('项目记录保存后无法恢复');
        openNote(saved.id);
      }).catch(err => toast(err && err.message ? err.message : '项目记录置顶保存失败'));
      break;
    }
    case 'delNote': {
      const n = S.notes.find(x=>x.id===id);
      if (n) void deleteBackendNote(n).then(removed => {
        const index = S.notes.findIndex(item => item.id === removed.id);
        if (index >= 0) S.notes.splice(index, 1);
        closeNoteModal(); render(true); toast('已删除项目记录');
      }).catch(err => toast(err && err.message ? err.message : '项目记录删除失败'));
      break;
    }
    case 'closeNoteModal': closeNoteModal(); break;
    case 'allActs':  toast(`共 ${S.acts.length} 条活动记录`); break;
    case 'launch':   closePops(); launch(id); break;
    case 'addApp':   S.addName=''; S.addCat=''; S.addStep='form'; S.addPick=''; S.scanQuery=''; S.scanScroll=0; S.scanApps=[]; S.scanError=''; addApp(); void loadScannedApps(); break;
    case 'refreshAppScan': refreshAppScan(); break;
    case 'pickScan': pickScan(id); break;
    case 'beginAdd': beginAdd(); break;
    case 'backToAdd': backToAdd(); break;
    case 'createFromScan': createFromScan(); break;
    case 'pickCat':  pickAddCat(v); break;
    case 'appMenu':  S.uninstallArm = ''; closePops(); appPopMenu(t, id); break;
    case 'appDetail': closePops(); S.uninstallArm = ''; appDetail(id); break;
    case 'toggleAppPin': closePops(); toggleAppPin(id); break;
    case 'toggleAppPinDrawer': toggleAppPin(id); appDetail(id); break;
    case 'armUninstall': closePops(); S.uninstallArm = id; appDetail(id); break;   // 预演步：先亮出将移除的内容
    case 'uninstallApp': uninstallApp(id); break;
    case 'editTag':  closePops(); tagPop(t, id); break;
    case 'setCat':   setCat(id, v); break;
    case 'newCatFor': newCatFor(id); break;
    case 'askRemove': closePops(); S.confirmRemove = id; render(true); break;      // 二次确认弹窗
    case 'cancelRemove': S.confirmRemove = ''; render(true); break;
    case 'confirmRemove': removeFromList(id); break;
    case 'appCat':   S.appCat = v; render(true); break;
    case 'favOnly':  S.favOnly = !S.favOnly; render(true); break;   // 常用优先（索引条顶部置顶图标）：只看置顶为常用的应用
    case 'appView':  S.appView = v; render(true); break;
    case 'alphaJump': alphaJump(v); break;                          // 字母索引条：平滑滚动定位到该分组（列表内容不变）
    case 'askWorkflows': closePalette(); go('projects'); break;
    case 'theme':    setTheme(v === 'dark' ? 'dark' : 'light', e); break;
    case 'checkUpdate': askUpdate(); break;
    case 'confirmUpdate': confirmUpdate(); break;
    case 'projectMaintenance': projectMaintenance(id, v); break;

    case 'accent': {
      S.accent = v;
      applyAccent(v);
      // 同步强调色选中态（不整页重渲染）
      if (t.parentElement) t.parentElement.querySelectorAll('.swatch').forEach(s => s.classList.toggle('on', s === t));
      persistPrefs();
      toast('强调色已更新');
      break;
    }
    case 'switch': {
      if (k === 'auto') { void updateStartupSetting(S.startupEnabled !== true); break; }
      /* 外观偏好是真状态：写进 S 并落 localStorage，重渲染后不弹回。
         项目级开关（pjNotify / pjRetry 等）仍是原型演示，只切当次显示，不入偏好。 */
      if (!PREF_KEYS.includes(k)){ t.classList.toggle('on'); toast('设置已保存'); break; }
      S[k] = !S[k];
      t.classList.toggle('on', S[k]);
      applyGlass(S.glass);
      persistPrefs();
      toast(k === 'glass'  ? (S.glass     ? '玻璃质感已开启' : '玻璃质感已关闭（卡片改为纯色底）')
          : k === 'notify' ? (S.notify    ? '桌面通知已开启' : '桌面通知已关闭')
          : k === 'save'   ? (S.save      ? '自动保存已开启（每 30 秒落盘）' : '自动保存已关闭')
          :                  (S.telemetry ? '使用数据统计已开启' : '使用数据统计已关闭'));
      break;
    }
    case 'obsidianSave':        saveObsidianSettings(); break;
    case 'obsidianTest':        testObsidianConnection(); break;
    case 'obsidianHubToggle':   toggleObsidianHub(id); break;
    case 'obsidianConnect':     editObsidianBinding(id); break;
    case 'obsidianChange':      editObsidianBinding(id); break;
    case 'obsidianBind':        bindObsidianProject(id); break;
    case 'obsidianOpenProject': openObsidianProject(id); break;
    case 'obsidianNewProject':  newObsidianProject(id); break;
    case 'obsidianUpdateAsk':   S.obsidianHubOpen = id; S.obsidianBindEdit = ''; S.obsidianUnbindArm = ''; S.obsidianUpdateArm = id; render(true); break;
    case 'obsidianUpdateCancel':S.obsidianUpdateArm = ''; render(true); break;
    case 'obsidianUpdateProject': updateObsidianProject(id); render(true); break;
    case 'obsidianUnbindAsk':   armObsidianUnbind(id); break;
    case 'obsidianUnbindCancel':S.obsidianUnbindArm = ''; render(true); break;
    case 'obsidianUnbindProject': unbindObsidianProject(id); break;
    case 'closeDrawer': closeDrawer(); break;
    case 'closeModal':  closeModal(); break;
    /* ---- 工作流 / 步骤编排 ---- */
    case 'enterProj': { const w = DATA.projects.find(x=>x.id===id); if (!w) break;
                        S.wf = w.id; S.wfEdit = null; S.projEdit = null; S.projConfirm = '';
                        go('workflows'); toast(`已进入「${w.name}」`); break; }
    case 'backProj':  S.wfEdit = null; S.projEdit = null; go('projects'); break;
    /* ---- 进入项目页 · 标题旁的项目状态三态切换 ---- */
    case 'projStMenu': projStPop(t, id); break;
    case 'setProjSt':  closePops(); if (setProjStatus(id, v)) render(true); break;
    /* ---- 概览 · 身份卡：项目内容内联编辑窗口 ---- */
    case 'openProjEdit':  openProjEdit(id); break;
    case 'closeProjEdit': closeProjEdit(id); break;
    case 'saveProjEdit':  saveProjEdit(id); break;
    case 'openWf':   closePalette(); S.wf = id; S.wfEdit = null; S.projEdit = null; S.running = null; go('workflows'); break;
    case 'runWf':    closePalette(); startRun(id); break;
    case 'runProject': startRun(id, {stay:t.dataset.stay==='1'}); break;
    case 'stopProject': stopProject(id); break;
    case 'restartProject': restartProject(id); break;
    case 'toggleStep': { const s = stepById(id); if (s){ s.on = !s.on; render(true); } break; }
    case 'toggleWait': { const s = stepById(id); if (s){ s.wait = !s.wait; render(true); } break; }
    case 'moveStep': {
      const wf = curWf(); const i = wf.steps.findIndex(s=>s.id===id); const j = i + Number(t.dataset.dir);
      if (i >= 0 && j >= 0 && j < wf.steps.length){
        const tmp = wf.steps[i]; wf.steps[i] = wf.steps[j]; wf.steps[j] = tmp; render(true);
      }
      break;
    }
    case 'delStep': {
      removeStep(id); break;
    }
    case 'addStep':   addStep(v, t.dataset.t); break;
    case 'larderTab': S.larderTab = v; S.larderQ = ''; render(true); break;
    /* ---- 模块页 ---- */
    case 'modTab':    S.modTab = v; render(true); break;
    case 'newModule': newModule(); break;
    case 'editModule':editModule(t.dataset.t, id); break;
    case 'saveModule':saveModule(); break;
    case 'modDeleteAsk': S.modConfirm = t.dataset.k; closeModal(); render(true); break;   // 预演 + 二次确认
    case 'modDeleteCancel': S.modConfirm = ''; render(true); break;
    case 'modDelete': modDelete(t.dataset.k); break;
    case 'resetWf': {
      const i = DATA.projects.findIndex(w=>w.id===S.wf); if (i < 0) break;
      const seed = WF_SEED.find(w=>w.id===S.wf); if (!seed) break;
      DATA.projects[i] = JSON.parse(JSON.stringify(seed));
      S.running = null; render(true); toast('已恢复到初始的步骤配置'); break;
    }
    case 'exportWf': {
      const wf = curWf();
      openModal(`${mHead('导出配置', wf.name)}
        <div class="card-title" style="font-size:14px">复制下面的 JSON，可以在别的设备上复用这套步骤</div>
        <textarea readonly style="width:100%;min-height:220px;border-radius:12px;border:1px solid var(--line);
          background:var(--card-strong);padding:12px;font-family:Consolas,monospace;font-size:11.5px;resize:vertical;outline:none">${esc(JSON.stringify({name:wf.name,desc:wf.desc,steps:wf.steps.map(s=>({type:s.type,ref:s.ref,label:s.label,wait:s.wait,on:s.on}))},null,2))}</textarea>
        ${mActs(`<button class="btn btn-ghost btn-sm" data-act="closeModal">关闭</button>`)}`);
      break;
    }
    /* ---- 项目主操作 ---- */
    case 'editWf':   closeDrawer(); S.wf = id; S.wfEdit = id; S.projEdit = null; S.running = null;
                     if (S.page !== 'workflows') go('workflows'); else render(true);
                     toast(`正在编辑「${(DATA.projects.find(w=>w.id===id)||{}).name||''}」`);
                     break;
    case 'exitWfEdit': S.wfEdit = null; render(true); toast('已返回查看模式'); break;
    case 'copyAgent':    { const w = DATA.projects.find(x=>x.id===id); if (!w) break;
                           copyText(agentContextText(w)).then(ok =>
                             toast(ok ? 'Agent 上下文已复制' : '复制失败，请手动选择文本'));
                           break; }
    /* ---- 编辑基本资料（居中弹窗）：内容与「复制 Agent 上下文」同一份纯文本，保存时反向回写 ---- */
    case 'editBasicInfo':    openBasicInfo(id); break;
    case 'closeBasicInfo':   closeBasicInfo(); break;
    case 'backBasicInfo':    if (S.basicPending) openBasicInfo(S.basicPending.id); break;
    case 'saveBasicInfo':    saveBasicInfo(id); break;
    case 'confirmBasicInfo': confirmBasicInfo(id); break;
    case 'addProjectFile': newProjectFile(id); break;
    case 'saveProjectFile': saveProjectFile(id); break;
    case 'openProjectFile': openProjectFile(id); break;
    case 'openProjectFiles': openProjectFiles(id); break;
    case 'projectFileDeleteAsk': requestProjectFileDelete(id); break;
    case 'projectFileDeleteConfirm': deleteProjectFile(id); break;
    /* ---- 项目设置：删除项目（预演 + 二次确认） ---- */
    case 'dupProject':    closePops(); dupProject(id); break;
    case 'refreshProj':   closePops(); refreshProj(id); break;
    case 'projDeleteAsk': void requestProjectDelete(id); break;
    case 'projDeleteCancel': S.projConfirm = ''; S.projDeletePreview = null; render(true); break;
    case 'projDelete':       projDelete(id); break;
    /* ---- 新建项目（模板创建） ---- */
    case 'newProject': S.newProjSt = '开发中'; newProjectDrawer(); break;
    case 'newProjSt':  setNewProjectStatus(v, t); break;
    case 'createProject': createProject(); break;
    /* ---- 运行状态：摘要 / 详情 ---- */
    case 'toggleRunDetail': S.runOpen[id] = !S.runOpen[id]; render(true); break;
    /* ---- 语音指令 ---- */
    case 'startVoice': startVoice(); break;
    case 'stopVoice':  stopVoice(); closePops(); break;
    case 'useVoice':   useVoice(); break;
    /* ---- 项目 ---- */
    case 'noop':     break;
    /* 通用页内跳转：data-v 为 PAGES 键。 */
    case 'goPage':   { const p = t.dataset.v; if (PAGES[p]) go(p); break; }
    case 'goSettings': closePops(); go('settings'); break;
    case 'readAll':  S.notices.forEach(n=>n.read = true); $('#bellBadge').style.display='none';
                     toast('已全部标为已读'); closePops(); break;
  }
});

$('#nav').addEventListener('click', e => {
  const b = e.target.closest('.nav-item'); if(!b) return;
  const p = b.dataset.page;
  if (p){ if (p==='workflows') S.wfEdit = null; go(p); }
});

$('#searchBox').addEventListener('click', openPalette);
$('#searchBox').addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openPalette(); }});
$('#paletteMask').addEventListener('click', e => { if (e.target.id==='paletteMask') closePalette(); });
$('#paletteInput').addEventListener('input', e => { palSel = 0; buildPalette(e.target.value); });
$('#paletteList').addEventListener('click', e => {
  const b = e.target.closest('[data-pi]'); if (b) runPalette(+b.dataset.pi);
});
$('#bellBtn').addEventListener('click', e => { e.stopPropagation(); bellPop(e.currentTarget); });
$('#voiceBtn').addEventListener('click', e => {
  e.stopPropagation();
  if (e.currentTarget.classList.contains('listening')){ stopVoice(); closePops(); }
  else startVoice();
});
$('#themeBtn').addEventListener('click', toggleTheme);
/* 折叠按钮双模：宽窗口走 .mini 常驻折叠；紧凑窗口（≤1199，W1 把侧栏锁成 76px 图标条）
   改走 .side-open —— 让侧栏占回 240px 那一列、把主区推开。不加这个类的话按钮在这个区间
   是死的（CSS 锁 76px，加不加 .mini 都没变化，侧栏永远出不来）。
   收起两条路：再点一次按钮；把窗口拉宽（拉宽后 W1 规则不再生效，展开态自动作废）。
   ⚠️ **不要**再挂「点侧栏以外收起」：展开态是把主区推窄的常驻布局，不是模态浮层，
   点内容区就收起会让整个主区连同光标下的卡片横移 164px（2026-10-04 撤掉）。 */
$('#miniBtn').addEventListener('click', () => {
  const app = $('#app');
  if (window.matchMedia('(max-width:1199.98px)').matches) app.classList.toggle('side-open');
  else app.classList.toggle('mini');
});
window.matchMedia('(max-width:1199.98px)').addEventListener('change', (e) => {
  if (!e.matches) $('#app').classList.remove('side-open');
});
$('#drawerMask').addEventListener('click', closeDrawer);
const topmostBtn = $('#topmostBtn');
if (topmostBtn) topmostBtn.addEventListener('click', () => { void updateConsoleWindowTopmost(); });

/* ---------- 全屏：无边框壳里「全屏」= 铺满整块屏幕 ----------
   原来的浏览器 Fullscreen API 在 WebView2 里走不通（壳没接 ContainsFullScreenElementChanged），
   现在改成发 chrome-command 让壳走 OverlappedPresenter；壳回推 chrome-state 再切 body.is-fullscreen，
   「按钮点出来的最大化」和「双击拖拽区的最大化」两条路都会同步，状态不漂移。
   CSS 沿用 .is-fullscreen 给主内容限宽居中（不做连续 resize 计算）。 */
const fsBtn = $('#fsBtn');
if (fsBtn) fsBtn.addEventListener('click', () => shellChromeCommand('toggle-maximize'));

/* 缩小到托盘：进程常驻，托盘左键 / Ctrl+Alt+A 唤起，彻底退出走托盘右键「退出」。
   点击给一条即时反馈 —— 窗口是「消失」而不是「缩小」，没有提示会让人以为程序崩了；
   反馈里带上怎么回来，是这类隐藏动作唯一能让用户安心的说法。 */
const trayBtn = $('#trayBtn');
if (trayBtn) trayBtn.addEventListener('click', () => {
  shellChromeCommand('hide');
  toast('已缩小到托盘，后台常驻：托盘图标左键或 Ctrl+Alt+A 随时唤起');
});

/* 壳回推窗口状态：同步 body.is-fullscreen 与全屏按钮按下态（浏览器 / vm 无此通道，自动跳过） */
if (IN_SHELL) window.chrome.webview.addEventListener('message', (e) => {
  try {
    const msg = JSON.parse(e.data);
    if (!msg || msg.type !== 'chrome-state') return;
    const on = msg.maximized === true;
    document.body.classList.toggle('is-fullscreen', on);
    const btn = $('#fsBtn');
    if (btn){
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('on', on);          // 全屏态：四角停在「撑开」位并轻微呼吸（见 .win-btn-full.on）
      btn.title = on ? '退出全屏' : '全屏';
    }
  } catch (_) {}
});

/* 应用列表：滚动由自管物理驱动 → 索引条高亮在 rAF 循环里节流调用（见 initInertialScroll 的 loop） */
/* 窗口尺寸变化 → 重新锁定「一屏完整行数」并让物理滚动重算边界（没有真实 window 的环境自动跳过） */
if (typeof window !== 'undefined' && window.addEventListener)
  window.addEventListener('resize', () => {
    if (S.page !== 'apps') return;
    fitAppList();
    const c = scrollCtl.get($('#appScroll')); if (c) c.refresh();
  });
/* 活跃度热力图不再需要 resize 重算：格子尺寸由 CSS Grid 的 1fr 列 + 格子 ::before 撑正方形自己跟随卡宽 */

/* 中文输入法兼容：组合输入（拼音候选）期间绝不重渲染，否则 IME 缓冲被打断导致无法上屏/重复字符 */
/* 两个搜索框共用同一套规格：应用页 appSearch / 添加抽屉扫描列表 scanSearch——模糊匹配 + 150ms 输入防抖 + 组合结束立即上屏 */
const SEARCH_IDS = ['appSearch','scanSearch','modSearch'];
const imeState = {};             // 各搜索框独立的组合输入态
const searchDebounce = {};       // 输入防抖：停顿 150ms 才过滤
function focusKeep(sel){
  const inp = $(sel);
  if (inp){ inp.focus(); const n = inp.value.length; try{ inp.setSelectionRange(n, n); }catch(_){} }
}
function applySearchInput(id, val){
  if (id === 'appSearch'){ S.appQuery = val; render(true); focusKeep('#appSearch'); }
  else if (id === 'modSearch'){ S.modQ = val; render(true); focusKeep('#modSearch'); }   // 模块页：按名称 / 入口 / 描述过滤
  else { S.scanQuery = val; S.scanScroll = 0; addApp(); focusKeep('#scanSearch'); }   // 弹窗内列表实时过滤
}
document.addEventListener('compositionstart', e => { if (SEARCH_IDS.includes(e.target.id)) imeState[e.target.id] = true; });
document.addEventListener('compositionend', e => {
  if (!SEARCH_IDS.includes(e.target.id)) return;
  imeState[e.target.id] = false;
  applySearchInput(e.target.id, e.target.value);   // 组合结束立即上屏过滤
});
document.addEventListener('input', e => {
  /* 项目内容编辑窗口：实时字数 + 输入即清除上一次的错误提示（纯 DOM 更新，不重渲染） */
  if (e.target.id === 'peName' || e.target.id === 'peBody'){
    peSyncCount(e.target.id);
    peShowErr('', '');
  }
  if (SEARCH_IDS.includes(e.target.id)){
    if (imeState[e.target.id] || e.isComposing) return;   // 组合中的中间态不处理
    const id = e.target.id, val = e.target.value;
    clearTimeout(searchDebounce[id]);
    searchDebounce[id] = setTimeout(() => applySearchInput(id, val), 150);
  }
  if (e.target.id==='fileSearch'){
    const q = e.target.value.trim().toLowerCase();
    $$('#view .row').forEach(r=>{
      const txt = r.textContent.toLowerCase();
      r.style.display = (!q || txt.includes(q)) ? '' : 'none';
    });
  }
  if (e.target.id==='larderSearch'){
    const q = e.target.value.trim().toLowerCase();
    $$('#view .res-item').forEach(r=>{
      r.style.display = (!q || r.textContent.toLowerCase().includes(q)) ? '' : 'none';
    });
  }
  if (e.target.id==='density'){
    /* 拖动即生效：只写 :root 令牌 + 落偏好，不整页重渲染（重渲染会在拖动中重建滑块，看着像弹回去） */
    const i = applyDensity(+e.target.value);
    persistPrefs();
    toast('信息密度已调整：' + DENSITY_LABELS[i]);
  }
});

document.addEventListener('change', e => { if (e.target.id==='density'){ /* handled in input */ } });

/* ---------------- 拖拽：资源库 → 步骤列表 ---------------- */
let dragPayload = null, dragAt = -1;
document.addEventListener('dragstart', e => {
  const it = e.target.closest('[data-drag]');
  if (!it || it.dataset.drag === undefined) return;
  dragPayload = it.dataset.drag;
  it.classList.add('dragging');
  try { e.dataTransfer.setData('text/plain', dragPayload); e.dataTransfer.effectAllowed = 'copy'; } catch(err){}
});
document.addEventListener('dragend', () => {
  dragPayload = null; dragAt = -1;
  $$('.res-item.dragging').forEach(x => x.classList.remove('dragging'));
  $$('.step.drop-hint').forEach(x => x.classList.remove('drop-hint'));
  const z = $('#stepsDrop'); if (z) z.classList.remove('drag-over');
});
document.addEventListener('dragover', e => {
  const zone = e.target.closest('#stepsDrop');
  if (!zone) return;
  e.preventDefault();
  try { e.dataTransfer.dropEffect = 'copy'; } catch(err){}
  zone.classList.add('drag-over');
  const rows = Array.from(zone.querySelectorAll('.step'));
  let idx = rows.length;
  for (let i = 0; i < rows.length; i++){
    const r = rows[i].getBoundingClientRect();
    if (e.clientY < r.top + r.height / 2){ idx = i; break; }
  }
  rows.forEach((x, i) => x.classList.toggle('drop-hint', i === idx));
  dragAt = idx;
});
document.addEventListener('drop', e => {
  const zone = e.target.closest('#stepsDrop');
  if (!zone) return;
  e.preventDefault();
  const payload = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || dragPayload;
  const at = dragAt >= 0 ? dragAt : undefined;
  zone.classList.remove('drag-over');
  $$('.step.drop-hint').forEach(x => x.classList.remove('drop-hint'));
  dragPayload = null; dragAt = -1;
  if (!payload || payload.indexOf('|') < 0) return;
  const parts = payload.split('|');
  const type = parts.shift();
  addStep(parts.join('|'), type, at);
});

/* ---------------- 拖拽：待办条目 → 优先级 / 当前任务区域 ----------------
   与上面步骤列表的拖拽相互独立：载荷是纯待办 id（不含 |），误投到步骤列表会被忽略；
   反之资源库载荷（含 |）投到区域也查不到条目，同样安全。
   拖入哪个区域即成为该区域状态：cur=加入当前任务（可多个），高/中/低=切换优先级。 */
let dragTodoId = null;
document.addEventListener('dragstart', e => {
  const row = e.target.closest('[data-drag-todo]');
  if (!row) return;
  dragTodoId = row.dataset.dragTodo;
  row.classList.add('dragging');
  try { e.dataTransfer.setData('text/plain', dragTodoId); e.dataTransfer.effectAllowed = 'copy'; } catch(err){}
});
document.addEventListener('dragend', () => {
  dragTodoId = null;
  $$('.task-row.dragging').forEach(x => x.classList.remove('dragging'));
  $$('.pz.drag-over').forEach(x => x.classList.remove('drag-over'));
});
document.addEventListener('dragover', e => {
  const z = e.target.closest('.pz');
  if (!z) return;
  e.preventDefault();
  try { e.dataTransfer.dropEffect = 'copy'; } catch(err){}
  z.classList.add('drag-over');
});
document.addEventListener('drop', e => {
  const z = e.target.closest('.pz');
  if (!z) return;
  e.preventDefault();
  z.classList.remove('drag-over');
  const tid = dragTodoId || ((e.dataTransfer && e.dataTransfer.getData('text/plain')) || '');
  dragTodoId = null;
  if (tid) moveTaskZone(z.dataset.proj, tid, z.dataset.zone);
});

/* ---------------- 区域高度手柄：纵向拖拽调整，按项目记忆在 S.zoneH ---------------- */
let pzRz = null;
document.addEventListener('pointerdown', e => {
  const h = e.target.closest('[data-pz-resize]');
  if (!h) return;
  const zone = h.closest('.pz');
  const body = zone && zone.querySelector('.pz-body');
  if (!body) return;
  pzRz = { key: h.dataset.pzResize, proj: zone.dataset.proj, el: body,
           y: e.clientY, h0: body.getBoundingClientRect().height || 72 };
  e.preventDefault();
});
document.addEventListener('pointermove', e => {
  if (!pzRz) return;
  const nh = Math.max(48, Math.min(420, Math.round(pzRz.h0 + (e.clientY - pzRz.y))));
  pzRz.el.style.height = nh + 'px';
  S.zoneH[pzRz.proj] = S.zoneH[pzRz.proj] || {};
  S.zoneH[pzRz.proj][pzRz.key] = nh;
  if (e.cancelable) e.preventDefault();
});
document.addEventListener('pointerup', () => { pzRz = null; });

document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
  if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); openPalette(); return; }
  if ((e.ctrlKey||e.metaKey) && e.key===','){ e.preventDefault(); go('settings'); return; }
  if (e.key==='Escape'){ closePalette(); closePops(); closeNoteModal(); closeDrawer(); return; }

  if ($('#paletteMask').classList.contains('on')){
    if (e.key==='ArrowDown'){ e.preventDefault(); palSel = Math.min(palSel+1, palItems.length-1); buildPalette($('#paletteInput').value); scrollPal(); }
    if (e.key==='ArrowUp'){ e.preventDefault(); palSel = Math.max(palSel-1, 0); buildPalette($('#paletteInput').value); scrollPal(); }
    if (e.key==='Enter'){ e.preventDefault(); runPalette(palSel); }
    return;
  }
  if (e.key==='Enter' && document.activeElement && document.activeElement.id==='larderSearch'){
    e.preventDefault();
    const first = $$('#view .res-item').find(b => !b.classList.contains('used'));
    if (first) first.querySelector('.btn-add') && first.querySelector('.btn-add').click();
  }
  /* 非 button 的可点击元素（如工作流卡片 div）的 Enter 键盘兜底 */
  const ae = document.activeElement;
  if (e.key==='Enter' && ae && ae.dataset && ae.dataset.act && ae.tagName !== 'BUTTON'){
    e.preventDefault(); ae.click();
  }
});
function scrollPal(){
  const sel = $('.p-item.sel'); if (sel) sel.scrollIntoView({block:'nearest'});
}

/* ---------------- 启动 ---------------- */
(function init(){
  loadObsidianState();
  loadPrefs();
  applyPrefs();                /* 刷新后按上次的偏好还原主题 / 强调色 / 信息密度 / 玻璃质感 */
  if (globalThis.addEventListener){
    globalThis.addEventListener('hashchange', () => {
      const before = S.page + '|' + S.wf;
      if (applyAppRoute(location.hash) && (before !== S.page + '|' + S.wf || S.obsidianReturnFocus)) render();
    });
  }
  const finish = () => {
    applyAppRoute(location.hash);
    render();
    if (S.backendError) toast(`后端数据加载失败：${S.backendError}`);
    void syncProjectRuntime();
    startRuntimePoll();
  };
  if (typeof fetch === 'function') void loadBackendState().then(async () => {
    await Promise.all([loadStartupSetting(), loadConsoleWindowState(), loadUpdateState()]);
    finish();
  });
  else finish();
})();
