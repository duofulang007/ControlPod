/* 冒烟测试：用最小 DOM 桩跑一遍全部页面渲染器与核心交互逻辑
   用法： node smoke-test.js      （只依赖 Node，不需要装任何包）   */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function el(){
  return {
    innerHTML:'', textContent:'', value:'', id:'', disabled:false,
    style:{ setProperty(){}, width:'', display:'', opacity:'', transform:'', transition:'', left:'', top:'' },
    dataset:{}, classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, appendChild(){}, insertAdjacentHTML(){}, remove(){}, focus(){}, click(){},
    scrollIntoView(){}, scrollTop:0, scrollHeight:0,
    getBoundingClientRect(){ return { left:0, top:0, right:1200, bottom:60, width:220, height:120 }; },
    querySelector:() => el(), querySelectorAll:() => []
  };
}
const storageData = Object.create(null);
const ctx = {
  document:{
    addEventListener(){}, createElement:() => el(),
    /* __stubVals：可编程桩 —— 测试可预置 querySelector('#xxx') 返回的输入值 */
    querySelector:(s) => { const e = el(); const v = ctx.__stubVals ? ctx.__stubVals[s] : undefined; if (v !== undefined) e.value = v; return e; },
    querySelectorAll:() => [],
    activeElement:{ tagName:'BODY', id:'' },
    documentElement:{
      dataset:{ theme:'light' },
      style:{ _vars:{}, setProperty(k, v){ this._vars[k] = v; } },
      /* classList 要有真实记忆：applyGlass 靠它切换 <html class="no-blur">，
         桩若不记录，断言就只能看「没抛错」，测不出玻璃质感到底开没开 */
      classList:(() => {
        const set = new Set();
        return {
          _set:set,
          add(c){ set.add(c); },
          remove(c){ set.delete(c); },
          toggle(c, force){ const on = force === undefined ? !set.has(c) : !!force; on ? set.add(c) : set.delete(c); return on; },
          contains(c){ return set.has(c); }
        };
      })()
    }
  },
  location:{ hash:'' },
  localStorage:{
    getItem:(k) => Object.prototype.hasOwnProperty.call(storageData, k) ? storageData[k] : null,
    setItem:(k, v) => { storageData[k] = String(v); },
    removeItem:(k) => { delete storageData[k]; }
  },
  setInterval:() => 0, clearInterval(){}, setTimeout:() => 0,
  console, Date, Math, JSON, Intl, Number, String, Array, Object, RegExp, Error, URL
};
ctx.globalThis = ctx;
ctx.window = ctx;          // 浏览器里 window === globalThis
ctx.innerWidth = 1600;
ctx.innerHeight = 900;
ctx.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){} });   // 媒体查询桩：vm 里无实现，折叠按钮双模逻辑加载时要用
vm.createContext(ctx);

let src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
src += `\nglobalThis.__T = { viewHome, viewApps, viewProjects, viewModules, viewWorkflows, viewSettings, appIconHTML,
  buildPalette, aiZone, aiReply, startRun, advanceRun, addStep, openNote, noteModalHTML, closeNoteModal,
  openModal, closeModal,
  preflight, startVoice, stopVoice, useVoice, launch, render, S, DATA, WF_SEED, fuzzyMatch,
  buildHeatPayload, heatLevel, dashboardHeatmapHTML, heatSeries, heatWeeklySeries, heatCumulativeSeries, heatCardRecords, heatTipHTML,
  projRunHTML,
  projDevHTML, projSettingsHTML, projDelete, requestProjectDelete, applyProjectDelete, createProject, setNewProjectStatus, agentContextText, copyText, wfFlowItems,
  basicInfoModalHTML, basicInfoPreflightHTML, parseBasicInfoText, basicInfoParsedHasBody,
  basicInfoDropList, openBasicInfo, closeBasicInfo, saveBasicInfo, confirmBasicInfo,
  cleanObsidianPath, obsidianUri, obsidianSuggestedPath, obsidianProjectPath, consoleProjectUrl, readObsidianSettings,
  saveObsidianSettings, testObsidianConnection, bindObsidianProject, openObsidianProject,
  obsidianProjectNote, newObsidianProject, updateObsidianProject, obsidianHubHTML,
  toggleObsidianHub, editObsidianBinding, armObsidianUnbind, unbindObsidianProject,
  parseAppRoute, applyAppRoute, OBSIDIAN_STORE_KEY,
  normalizeObsidianState, persistObsidianState, loadObsidianState,
  PREFS_STORE_KEY, DENSITY_STEPS, DENSITY_LABELS, normalizePrefs, persistPrefs, loadPrefs, applyDensity,
  THEME_VALUES, ACCENTS, PREF_KEYS, BOOL_PREF_DEFAULTS, isDensityStep, applyTheme, applyAccent, applyGlass, applyPrefs,
  toggleTheme,
  TASK_KIND, KIND_SHOW, taskKindOf, allTodos, projTasks, projTodos, projFixes, projNotes, devCounts, devTaskOf,
  noteLinksOf, detachTodoRefs, newNote,
  priOf, moveTaskZone, pruneCurTasks, devTidsOf,
  PROJ_STS, projStDef, projStCls, projStColor, projStatusCtl, setProjStatus, projOverviewHTML,
  flowNameOf, lastUsedLabel, backendEpoch, applyStartupState,
  projIdCardHTML, projEditFormHTML, projEditCheck, applyProjEdit, renameProjRefs, PE_LIMIT,
  projTileHTML, projFlat, projKids, projParentOf, unwrapProjKids,
  initProjSort, projSortBlocked, projSortSlotAt, applyProjectOrder, PROJ_SORT,
  projectRunControlsHTML, projIsRunning, projIsStarted, stopProject, restartProject, dupProject, refreshProj,
  alphaOf, groupByAlpha, fitAppList, alphaJump, appScrollDragBlocked,
  addApp, appPopMenu, tagPop, setCat, newCatFor, removeFromList,
  scannedAppFromApi, loadScannedApps, pickScan, beginAdd, backToAdd, createFromScan,
  moduleFormHTML, modShowErr, newModule, editModule, saveModule, modDelete, modDeleteModalHTML,
  moduleKey, splitKey, findModule, MOD_TABS, larderItems, DEFAULT_PROJ, TYPE_META, tIco,
  validWebModuleUrl, webModuleFromApi, backendTaskFromApi, taskApiPayload, applyBackendTask,
  createBackendTask, updateBackendTask, deleteBackendTask, backendNoteFromApi, noteApiPayload, applyBackendNote,
  createBackendNote, updateBackendNote, deleteBackendNote, backendContextFromApi, ensureDevContext,
  backendProjectFileFromApi, projectFilesOf, replaceProjectFiles, projectFilesHTML, newProjectFile, saveProjectFile, openProjectFile, openProjectFiles, requestProjectFileDelete, deleteProjectFile,
  basicInfoApiPayload, applyBackendBasicInfo, backendAppFromApi, appApiPayload, applyBackendApp,
  replaceBackendApps, updateBackendApp, deleteBackendApp, loadBackendState, removeStep,
  executionLogEntries, executionState, applyExecutionSteps, backendRuntimeState, restoreBackendExecution, applyBackendRun,
  REAL_PROJECT_IDS, BACKEND_PROJECT_IDS, BACKEND_TASK_IDS, BACKEND_NOTE_IDS, BACKEND_APP_IDS,
  purgeProjRefs, projPurgeCounts, projDeleteModalHTML };
/* palItems 是 app.js 里的 let 变量、每次 buildPalette 都会整体重写，导出时会快照成空数组，
   所以要用 getter 取实时值（否则「命令面板排序」这类断言永远看到空列表）。 */
Object.defineProperty(globalThis.__T, 'palItems', { get(){ return palItems; } });\n`;

try { vm.runInContext(src, ctx); }
catch (e){ console.log('LOAD_FAIL: ' + e.message); process.exit(1); }

const T = ctx.__T;
let fail = 0;
const check = (ok, label) => { console.log((ok ? 'OK   ' : 'WARN ') + label); if (!ok) fail++; };

/* 生产代码不再附带假应用；渲染规格使用隔离测试夹具。 */
const TEST_APPS = [
  {id:'vscode',name:'VS Code',cat:'开发',icon:'vscode',st:'常用',size:'本机',use:12,last:'刚刚',lastTs:1200},
  {id:'chrome',name:'Chrome',cat:'浏览',icon:'chrome',st:'常用',size:'本机',use:11,last:'刚刚',lastTs:1100},
  {id:'steam',name:'Steam',cat:'娱乐',icon:'steam',st:'常用',size:'本机',use:10,last:'刚刚',lastTs:1000},
  {id:'discord',name:'Discord',cat:'娱乐',icon:'discord',st:'常用',size:'本机',use:9,last:'刚刚',lastTs:900},
  {id:'spotify',name:'Spotify',cat:'娱乐',icon:'spotify',st:'常用',size:'本机',use:8,last:'刚刚',lastTs:800},
  {id:'bilibili',name:'哔哩哔哩',cat:'娱乐',icon:'movie',st:'常用',size:'本机',use:7,last:'刚刚',lastTs:700},
  {id:'epic',name:'Epic Games',cat:'娱乐',icon:'game',st:'',size:'本机',use:6,last:'刚刚',lastTs:600},
  {id:'minecraft',name:'Minecraft',cat:'娱乐',icon:'game',st:'',size:'本机',use:5,last:'刚刚',lastTs:500},
  {id:'netease',name:'网易云音乐',cat:'娱乐',icon:'music',st:'',size:'本机',use:4,last:'从未',lastTs:0},
  {id:'qqmusic',name:'QQ音乐',cat:'娱乐',icon:'music',st:'',size:'本机',use:3,last:'从未',lastTs:0},
  {id:'douyin',name:'抖音',cat:'娱乐',icon:'movie',st:'',size:'本机',use:2,last:'从未',lastTs:0},
  {id:'obsidian',name:'Obsidian',cat:'效率',icon:'notion',st:'',size:'本机',use:1,last:'从未',lastTs:0}
];
T.S.apps.splice(0, T.S.apps.length, ...TEST_APPS.map(app => ({...app})));
TEST_APPS.forEach(app => T.BACKEND_APP_IDS.add(app.id));

/* 1. 全部页面渲染 */
['viewHome','viewApps','viewProjects','viewModules','viewWorkflows','viewSettings'].forEach(p => {
  try {
    const html = T[p](true);
    check(typeof html === 'string' && html.length > 300 && !html.includes('undefined'), p + ' len=' + html.length);
  } catch (e) { console.log('FAIL ' + p + ' → ' + e.message); fail++; }
});

/* 1b. 侧栏导航只保留在 PAGES 中登记的页面 */
try {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const navPages = Array.from(html.matchAll(/data-page="([a-z]+)"/g)).map(m => m[1]);
  const ok = ['home','projects','modules','apps','settings'];
  const bad = navPages.filter(p => !ok.includes(p));
  check(bad.length === 0, '侧栏导航项都在页面表里（' + navPages.length + ' 项）' + (bad.length ? ' 未登记：' + bad.join(',') : ''));
  const order = navPages.join(',');
  check(order === 'home,projects,modules,apps,settings',
    '侧栏顺序 = 总控台 / 项目 / 模块 / 应用 / 设置：' + order);
  check(!navPages.includes('downloads') && !navPages.includes('files'),
    '全局「下载」与「文件」入口已移除，文件改在项目内管理');
  const appSrc = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  check(['viewStorage','storagePlan','DATA.storage','DATA.snaps',"case 'planPick'","case 'nameGen'"].every(token => !appSrc.includes(token))
      && !html.includes('data-page="storage"') && !html.includes('cntStore'),
    '版本模块已完全移除：没有页面、演示数据、动作分支或侧栏入口');
  check(html.includes('data-page="projects"') && !html.includes('data-page="workflows"'),
    '侧栏「项目」指向独立的选择页（workflows 只作为详情页内部路由）');
  check(!html.includes('>首页<') && html.includes('>总控台<'), '首页已统一命名为「总控台」');
  check(!html.includes('最近项目') && !html.includes('sideProjects'), '左下角「最近项目」冗余入口已移除');
  check(!html.includes('data-page="inbox"'), '「收件」不再是独立导航项（收件箱模块已整体删除）');
  check(/href="styles\.css\?v=[^"]+"/.test(html) && /src="app\.js\?v=[^"]+"/.test(html),
    '入口为样式和脚本附带版本参数，首次启用 no-store 时也能绕开旧浏览器缓存');
} catch (e) { console.log('FAIL 导航 → ' + e.message); fail++; }
/* 1b. 专注视图整体移除（2026-09-23）：状态字段、渲染分支、顶栏入口、命令面板项、
   Ctrl+. 快捷键、动作分支与样式一次性清干净 —— 删功能不留死代码 */
try {
  const vh = T.viewHome();
  const appGone = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const idxGone = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const cssGone = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  check(!appGone.includes('专注视图') && !appGone.includes('S.focus') && !appGone.includes('S.expanded')
    && !appGone.includes('expandMod') && !appGone.includes('collapseMod') && !appGone.includes('IC.list')
    && !idxGone.includes('focusBtn') && !vh.includes('collapse-row') && !vh.includes('data-act="focus"'),
    '专注视图已整体移除（状态 / 渲染分支 / 顶栏入口 / 动作分支 / 快捷键全部清空）');
  check(!/\.focus-layout|\.focus-mods|\.collapse-row|\.collapse-trigger|\.expanded-mod|\.hero\{|\.hero-main|\.hero-title|\.hero-actions|\.hero-project-facts/.test(cssGone),
    '专注视图孤儿样式已清理（专注布局 / 收起行 / 展开行 / 大标题家族）');
} catch (e) { console.log('FAIL 专注视图移除 → ' + e.message); fail++; }

/* 1c. 项目文件只按项目 id 关联，打开与移除都必须走受限后端接口。 */
try {
  const project = T.DATA.projects[0];
  const map = new Map(T.DATA.projects.map(item => [item.id, item]));
  const file = T.backendProjectFileFromApi({id:'pf-test', project_id:project.id, name:'说明.md', path:'D:/Projects/说明.md'}, map);
  T.replaceProjectFiles([file && {id:file.id, project_id:file.projectId, name:file.name, path:file.path}], map);
  const html = T.projectFilesHTML(project);
  const appSrc = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  check(html.includes('项目文件') && html.includes('说明.md') && html.includes('data-act="openProjectFile"') && html.includes('data-act="projectFileDeleteAsk"'),
    '项目开发上下文内展示本项目文件，并提供打开与移除关联操作');
  check(appSrc.includes('/project-files/${encodeURIComponent(fileId)}/open') && appSrc.includes('/delete-preview') && appSrc.includes('原文件未删除'),
    '项目文件打开与移除都有受限接口；移除明确不删除电脑原文件');
  T.S.projectFiles.splice(0, T.S.projectFiles.length);
} catch (e) { console.log('FAIL 项目文件 → ' + e.message); fail++; }

/* 2. 每个项目都能渲染，且预备检查卡不再出现（异常改在执行模块区块反馈） */
try {
  T.DATA.projects.forEach(w => {
    T.S.wf = w.id;
    const html = T.viewWorkflows(true);
    const p = T.preflight(w);
    check(html.includes('运行项目') && !html.includes('预备检查'),
      '项目「' + w.name + '」· 执行模块 ' + w.steps.length + ' · ' + (p.ready ? '就绪' : p.issues.length + ' 项异常在执行模块反馈'));
  });
  T.S.wf = 'apex';
} catch (e) { console.log('FAIL 项目渲染 → ' + e.message); fail++; }

/* 3. 选择页：卡片栅格（一卡一项目）+ 尾部「新建项目」占位卡 */
try {
  const html = T.viewProjects();
  const cards = (html.match(/class="pjt-card"/g) || []).length;
  check(cards === T.DATA.projects.length, '项目选择页卡片数 = 项目数（' + cards + '）');
  check(html.includes('class="pjt-board"'), '项目以卡片栅格排布（.pjt-board）');
  check(html.includes('data-act="newProject"') && html.includes('新建项目'),
    '栅格尾部保留「新建项目」占位卡');
} catch (e) { console.log('FAIL 卡片栅格 → ' + e.message); fail++; }

/* 3b. 选择页每张卡：进入入口 + 卡面字段 + 详情抽屉内容（详情抽屉供页内导航复用） */
try {
  const html = T.viewProjects();
  const entries = (html.match(/data-act="enterProj"/g) || []).length;
  check(entries === T.DATA.projects.length, '每张卡都是「进入项目」入口（' + entries + ' 个）');
  check(html.includes('role="button"') && !html.includes('data-act="pickWf"'),
    '卡面信息区以 role=button 承载进入动作（旧的页内切换 pickWf 已移除）');
  /* 卡面字段：名称 / 状态 / 当前流程 / 模块数（启用/总数）/ 运行次数 / 预备状态 */
  const w0 = T.DATA.projects[0];
  check(html.includes('APEX 一键启动') && html.includes('深度开发') && html.includes('日常助理'),
    '卡面展示当前运行流程（APEX 真实启动 / 深度开发 / 日常助理）');
  check((html.match(/\d+\/\d+ 模块</g) || []).length >= 3 && html.includes('次运行') && html.includes(w0.st),
    '卡面展示 模块数（启用/总数）/ 累计运行次数 / 项目状态');
  check(html.includes('pjt-enter') && html.includes('进入'),
    '卡面保留「进入」提示（悬停点亮）');
  check(html.includes('pjt-desc') && html.includes('调用 APEX 启动核心'), '每张卡保留一句话描述');
  const w1 = T.DATA.projects[0];
  /* 「完整开发上下文」移除后，右侧项目详情抽屉（wfDetailHTML）失去唯一入口，一并清掉；
     项目信息与操作统一由项目卡 / 项目详情页承载 —— 这里是负向守护 */
  check(typeof T.wfDetailHTML === 'undefined',
    '右侧项目详情抽屉已彻底移除（wfDetailHTML 不再存在）');
  check(T.projDevHTML(w1).includes('data-act="editBasicInfo"') && T.projDevHTML(w1).includes('编辑基本资料'),
    '开发上下文卡底部改用「编辑基本资料」入口（打开居中弹窗）');
} catch (e) { console.log('FAIL 项目详情 → ' + e.message); fail++; }

/* 3c. 每张卡统一运行控件 / 复制 / 刷新 / 编辑 / 删除 */
try {
  T.S.running = null; T.S.projectRuntime = {};
  const html = T.viewProjects();
  const n = T.DATA.projects.length;
  const cnt = re => (html.match(re) || []).length;
  check(cnt(/data-act="runProject"/g) === n, '每张卡都有统一的项目运行控件（' + n + '）');
  check(cnt(/data-act="dupProject"/g) === n, '每张卡都有「复制」控件');
  check(cnt(/data-act="refreshProj"/g) === n, '每张卡都有「刷新」控件');
  check(cnt(/data-act="editWf"/g) === n, '每张卡都有「编辑」控件');
  check(cnt(/data-act="projDeleteAsk"/g) === n, '每张卡都有「删除」控件');
  check(cnt(/class="pjt-i(?:\s+pjt-del)?"/g) === n * 4, '图标操作组固定 4 个（复制 / 刷新 / 编辑 / 删除）');
  check(html.includes('pjt-start') && html.includes('运行项目</button>') && !html.includes('关闭项目</button>') && !html.includes('重启项目</button>'),
    '未启动时只显示「运行项目」');
  /* 结构纪律：操作条与「进入」信息区是兄弟节点 —— 否则点按钮会同时触发进入 */
  const blocks = html.match(/<article class="pjt-card"[\s\S]*?<\/article>/g) || [];
  check(blocks.length === n && blocks.every(b => {
    const m = b.indexOf('class="pjt-main"'), a = b.indexOf('class="pjt-acts"'), e = b.indexOf('data-act="enterProj"');
    return m > -1 && a > m && e > m && e < a;
  }), '每张卡 = 信息区（承载进入）+ 独立操作条（不抢点击）');
  const bare = Object.assign({}, T.DATA.projectTemplate, { id:'__proj0', name:'探针项目0', parent:null, steps:[] });
  check(T.projTileHTML(bare).includes('disabled'), '没有启用执行模块的项目：启动按钮置灰');
} catch (e) { console.log('FAIL 卡片操作 → ' + e.message); fail++; }

/* 3d. 层级呈现：父子关系一目了然（归属标记 + 父项目紧邻其子项目的顺序） */
try {
  const html = T.viewProjects();
  const rows = T.projFlat();
  check(rows.length === T.DATA.projects.length, 'projFlat 覆盖全部项目（' + rows.length + '）');
  const subs = rows.filter(r => r.depth > 0);
  check(subs.length === 1 && subs[0].p.id === 'ops' && subs[0].depth === 1,
    '层级数据：local-ops 是 APEX Automation 的子项目（depth=1）');
  check(rows[0].p.id === 'apex' && rows[1].p.id === 'ops', '栅格顺序：父项目紧接其子项目');
  check(html.includes('子项目 · 归属 APEX Automation'), '子项目卡片标注「归属哪个父项目」');
  check(html.includes('1 个子项目'), '父项目卡片标注「有几个子项目」');
  check(html.includes('pjt-up') && html.includes('pjt-down'), '归属 / 子项目标记是两个独立样式钩子');
  check(T.projParentOf(T.DATA.projects.find(p => p.id === 'ops')).id === 'apex', 'projParentOf 可反查父项目');
  check(!T.projParentOf(T.DATA.projects.find(p => p.id === 'apex')), '根项目没有父项目');
  check(T.projKids('apex').length === 1 && T.projKids('ai').length === 0, 'projKids 按父 id 取子项目');
  const root = Object.assign({}, T.DATA.projectTemplate, { id:'__projH0', name:'探针层级0', parent:null, steps:[] });
  check(!T.projTileHTML(root).includes('pjt-up') && !T.projTileHTML(root).includes('pjt-down'),
    '无父无子的项目：不渲染层级标记（不留空壳元素）');
  const cssSrc = require('fs').readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  check(cssSrc.includes('--tile-min:290px')
    && /\.pjt-board\{[\s\S]{0,300}?minmax\(min\(var\(--tile-min\),100%\),1fr\)/.test(cssSrc),
    '卡片列宽走设计令牌 --tile-min + minmax 自适应，不硬写像素');
} catch (e) { console.log('FAIL 层级 → ' + e.message); fail++; }

/* 3e. 运行 / 关闭 / 重启与列表就地操作 */
try {
  T.S.page = 'projects'; T.S.wf = 'ops'; T.S.wfEdit = null; T.S.projEdit = null; T.S.running = null;
  const apex = T.DATA.projects.find(p => p.id === 'ops');

  /* 启动：就地进入运行态（不跳页），按钮切成「关闭项目」 */
  T.startRun('ops', {stay:true});
  check(T.S.running && T.S.running.wfId === 'ops', '「运行项目」进入运行态');
  check(T.S.page === 'projects', '启动后仍停在项目选择页（就地运行，不跳页）');
  const liveRow = T.projTileHTML(apex);
  check(liveRow.includes('pjt-stop') && liveRow.includes('关闭项目') && liveRow.includes('pjt-live'),
    '运行中：主操作切成「关闭项目」并显示运行中标记');
  check(T.stopProject('ops') === true && T.S.running === null, '关闭非真实项目后回到未启动态');
  check(T.projTileHTML(apex).includes('pjt-start'), '关闭后主操作回到「运行项目」');

  const real = T.DATA.projects.find(p => p.id === 'apex');
  T.S.projectRuntime.apex = 'running'; T.S.wf = 'apex'; T.S.running = null;
  const cardControls = T.projectRunControlsHTML(real, true);
  const detailControls = T.projectRunControlsHTML(real, false);
  check([cardControls, detailControls].every(x=>x.includes('关闭项目') && x.includes('重启项目') && !x.includes('运行项目')),
    '真实项目启动后：项目卡与详情页头同时显示「关闭项目 + 重启项目」');
  T.S.running = {wfId:'apex', action:'run', status:'running'};
  const busyControls = [T.projectRunControlsHTML(real, true), T.projectRunControlsHTML(real, false)];
  check(busyControls.every(x=>x.includes('data-act="stopProject"') && x.includes('data-act="restartProject"')
    && !/data-act="(?:stopProject|restartProject)"[^>]*disabled/.test(x)),
    '真实项目运行中：关闭和重启仍可点击，以便强制接管当前执行');
  T.S.running = null;
  check(!T.projRunHTML(real, null, false).includes('data-act="stopProject"'),
    '运行流程卡不再单独放关闭按钮，项目操作只保留在两处统一位置');
  T.S.projectRuntime.apex = 'stopped';
  check([T.projectRunControlsHTML(real, true), T.projectRunControlsHTML(real, false)]
    .every(x=>x.includes('运行项目') && !x.includes('关闭项目') && !x.includes('重启项目')),
    '真实项目关闭后：两处都恢复为单一「运行项目」按钮');

  /* 复制：同级新增、步骤重新发 id、运行数据归零 */
  const before = T.DATA.projects.length;
  const src = T.DATA.projects.find(p => p.id === 'ops');
  const srcIds = src.steps.map(s => s.id).join(',');
  const c1 = T.dupProject('ops');
  check(!!c1 && T.DATA.projects.length === before + 1, '「复制」新增一个项目');
  check(c1.name === 'local-ops 副本' && c1.parent === 'apex',
    '副本沿用源项目的层级归属（仍是 APEX Automation 的子项目）');
  check(c1.steps.length === src.steps.length && c1.steps.map(s => s.id).join(',') !== srcIds,
    '副本步骤数量一致、id 全部重发（不与源项目碰撞）');
  check(c1.runs === 0 && c1.last === '—', '副本运行数据从零开始');
  check(!!T.DATA.projMeta[c1.name], '副本写入创建时间');
  const c2 = T.dupProject('ops');
  check(c2.name !== c1.name, '连续复制自动改名，不产生同名项目');
  check(T.dupProject('__nope__') === null, '未知项目：复制安全返回 null');
  /* 清理副本，避免污染后续断言 */
  [c1, c2].forEach(x => { const i = T.DATA.projects.findIndex(p => p.id === x.id); if (i > -1){ delete T.DATA.projMeta[x.name]; T.DATA.projects.splice(i, 1); } });

  /* 刷新：非破坏性 —— 只清临时态 + 重算预备检查 */
  T.S.runOpen['ops'] = true; T.S.devTask['ops'] = { text:'x' };
  T.S.projEdit = 'ops'; T.S.wfEdit = 'ops';
  const stepSig = JSON.stringify(apex.steps), runsBefore = apex.runs;
  check(T.refreshProj('ops') === true, '「刷新」返回成功');
  check(!T.S.runOpen['ops'] && !T.S.devTask['ops']
        && T.S.projEdit === null && T.S.wfEdit === null,
    '刷新清空该项目的临时状态（展开态 / 编辑态）');
  check(JSON.stringify(apex.steps) === stepSig && apex.runs === runsBefore,
    '刷新是非破坏性的：步骤配置与运行历史不变（因此不需要二次确认）');
  check(T.refreshProj('__nope__') === false, '未知项目：刷新安全返回 false');

  /* 删除：预演 + 二次确认；删父项目时子项目提升为根（用临时项目验证，之后清理） */
  T.S.projConfirm = '';
  check(!T.viewProjects().includes('modal-mask'), '未点删除时不渲染确认弹窗');
  const tmpl = { id:'tpm', name:'临时父项目', st:'正常', stCls:'pst-ok', parent:null, desc:'临时',
    files:0, commits:0, tags:[], updated:'刚刚', ico:'focus', color:'#2563EB',
    flowName:'默认流程', flowDesc:'', last:'—', runs:0, steps:[] };
  T.DATA.projects.push(tmpl, Object.assign({}, tmpl, { id:'tkd', name:'临时子项目', parent:'tpm' }));
  T.S.projConfirm = 'tpm';
  const modal = T.viewProjects();
  check(modal.includes('modal-mask') && modal.includes('确认删除') && modal.includes('删除「临时父项目」'),
    '点「删除」先出预演弹窗（二次确认）');
  check(modal.includes('提升为独立项目'), '预演文案说明：子项目会被提升为独立项目，不会被一起删掉');
  T.S.projConfirm = '';
  T.projDelete('tpm');
  const leftKid = T.DATA.projects.find(p => p.id === 'tkd');
  check(!T.DATA.projects.some(p => p.id === 'tpm') && !!leftKid && leftKid.parent === null,
    '确认删除：父项目移除、子项目提升为根（数据没跟着消失）');
  const ti = T.DATA.projects.findIndex(p => p.id === 'tkd'); if (ti > -1) T.DATA.projects.splice(ti, 1);
  T.S.projConfirm = ''; T.S.running = null; T.S.wf = 'apex'; T.S.wfEdit = null; T.S.projEdit = null;
  T.S.page = 'home';
} catch (e) { console.log('FAIL 行操作行为 → ' + e.message); fail++; }


/* 3b-2. 项目状态三态 +「进入项目」页标题旁的状态切换控件 */
try {
  const w1 = T.DATA.projects[0];
  const prevWf = T.S.wf; T.S.wf = w1.id;
  const actsBackup = T.S.acts.slice();

  check(T.PROJ_STS.map(s=>s.v).join('/') === '正常/开发中/已暂停',
    '项目状态固定三态：正常 / 开发中 / 已暂停');
  check(T.PROJ_STS.every(s=>/^pst-(ok|dev|pause)$/.test(s.cls)),
    '三态各自绑定 pst-* 类（颜色统一走 :root 令牌）');
  /* styles.css 里三态必须各有落地规则：漏掉一条，那条的 dot 就会退化成 currentColor（黑点） */
  const stCss = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  check(T.PROJ_STS.every(s => new RegExp('\\.' + s.cls + '\\{').test(stCss)),
    '三态在 styles.css 里都有落地规则（.pst-ok / .pst-dev / .pst-pause 一个都不能少）');
  check(/\.pst-ok\{[^}]*color:var\(--st-ok\)/.test(stCss),
    '「正常」显式给前景色：否则 .st-switch .dot{background:currentColor} 会退化成黑色圆点');
  check(T.projStColor('正常')==='#16A34A' && T.projStColor('开发中')==='#2563EB' && T.projStColor('已暂停')==='#6B7280',
    '三态取色：正常=绿 / 开发中=蓝 / 已暂停=灰');
  check(T.projStDef('__nope__').v === '正常' && T.projStCls(undefined) === 'pst-ok',
    '未知状态回落「正常」，脏数据不会渲染成无底 badge');

  const view = T.viewWorkflows(false);
  const iHead = view.indexOf('class="ph-title"'), iName = view.indexOf('<h1>'+w1.name+'</h1>'), iCtl = view.indexOf('data-act="projStMenu"');
  check(iHead > -1 && iName > iHead && iCtl > iName,
    '「进入项目」页：项目名旁（同一标题行、名字之后）渲染状态切换控件');
  check(view.includes('st-switch ' + w1.stCls), '控件底色跟随当前状态（' + w1.st + ' → ' + w1.stCls + '）');
  check(view.includes('aria-haspopup="true"'), '控件是弹出菜单触发器（aria-haspopup）');
  check(T.projTileHTML(w1).includes(w1.stCls), '项目卡上的状态 badge 与标题控件同源（同一份 stCls）');

  check(T.setProjStatus(w1.id,'已暂停') === true && w1.st==='已暂停' && w1.stCls==='pst-pause',
    '切换状态写回 st + stCls');
  check(T.setProjStatus(w1.id,'已暂停') === false, '重复选择同一状态算无变化（幂等，不重复记动态）');
  check(T.setProjStatus('__nope__','正常') === false && T.setProjStatus(w1.id,'__nope__') === false,
    '未知项目 id / 未知状态：不写数据、不抛异常');
  const card = T.viewProjects(), ov = T.projOverviewHTML(w1, T.preflight(w1));
  check(card.includes('pst-pause') && ov.includes('pst-pause'),
    '选择页卡片与概览卡的项目状态同步为「已暂停」');
  check(T.setProjStatus(w1.id,'正常') && w1.st==='正常' && w1.stCls==='pst-ok', '可切回「正常」');

  T.S.acts.splice(0, T.S.acts.length, ...actsBackup); T.S.wf = prevWf;
} catch (e) { console.log('FAIL 项目状态三态 → ' + e.message); fail++; }

/* 3c. 编辑基本资料：居中弹窗（内容 = Agent 上下文那同一份纯文本，可编辑可保存） */
try {
  const w1 = T.DATA.projects[0];
  const dev = T.projDevHTML(w1);
  const ord = ['data-act="copyAgent"','data-act="editBasicInfo"'].map(k => dev.indexOf(k));
  check(ord[0] > -1 && ord[1] > ord[0] && dev.includes('>编辑基本资料</button>'),
    '开发上下文卡底部：复制 Agent 上下文 → 编辑基本资料（原地替换旧的「完整开发上下文」）');
  check(!dev.includes('完整开发上下文') && !dev.includes('wfDev'),
    '「完整开发上下文」入口与动作已从项目页移除');

  const modal = T.basicInfoModalHTML(w1);
  check(modal.includes('编辑基本资料') && modal.includes('id="biText"')
    && modal.includes('data-act="saveBasicInfo"') && modal.includes('data-act="closeBasicInfo"'),
    '弹窗提供 标题 / 纯文本域 / 保存 / 取消');
  check(modal.includes(T.agentContextText(w1)),
    '弹窗里的纯文本与「复制 Agent 上下文」逐字相同（同一份 agentContextText）');
  check(modal.includes('data-act="copyAgent"'), '弹窗内保留与复制功能对应的入口');
  check(modal.includes('class="note-modal-x"') && !modal.includes('class="card'),
    '复用居中弹窗骨架（沿用 #noteModal 宿主，不再占用右侧面板）');

  const w2 = T.DATA.projects.find(w => w.name === 'local-ops');
  check(T.basicInfoModalHTML(w2).includes(T.agentContextText(w2))
    && T.agentContextText(w2) !== T.agentContextText(w1),
    '弹窗内容按项目取值（不是固定第一份文本）');

  const bare = Object.assign({}, T.DATA.projectTemplate, {id:'__probe', name:'探针项目'});
  check(T.agentContextText(bare) === '' && !T.basicInfoModalHTML(bare).includes('APEX'),
    '无开发上下文的新项目：弹窗可打开但纯文本为空（保存会要求先填字段行）');
} catch (e) { console.log('FAIL 编辑基本资料弹窗 → ' + e.message); fail++; }

/* 3c-2. 编辑基本资料：纯文本 → 数据的解析回写（无损往返 + 删数据预演） */
try {
  const w1 = T.DATA.projects[0];
  const d1 = T.DATA.devContext[w1.name];
  const text = T.agentContextText(w1);
  const p = T.parseBasicInfoText(text);
  const openTasks = T.projTasks(w1.name).filter(t => !t.done);

  /* 精简后的模板不再输出这五类噪声行（负向断言锁定，防止又被加回来） */
  ['项目 ID：','模块 ID：','开发状态：','当前待办：','当前灵感 / 笔记：']
    .forEach(k => check(!text.includes(k), '精简模板已不含：' + k));
  check(p.fields.module === d1.module && p.fields.modulePath === d1.modulePath
    && p.fields.next === undefined
    && p.fields.moduleId === undefined && p.fields.status === undefined,
    '字段行解析回写：只认模板实际输出的 模块 / 路径（下一步、模块 ID、状态均已剔除）');
  check(T.parseBasicInfoText('下一步：手工补的目标').fields.next === '手工补的目标',
    '解析端保持宽容：模板不再输出「下一步」，但手填 / 老文本里的这一行仍能读回');
  check(T.parseBasicInfoText('模块 ID：ak-accelerator\n开发状态：开发中').fields.moduleId === 'ak-accelerator',
    '解析端保持宽容：老文本仍带「模块 ID / 开发状态」行也能吃下（不丢历史数据）');
  check(p.fields.files === d1.files.join(' '), '「相关文件」按空白还原为原串');

  check(p.tasks.length === openTasks.length
    && p.tasks[0].text === '完善自动化脚本的异常处理' && p.tasks[0].due === '今天',
    '待办区按序号完整解析（' + openTasks.length + ' 条，计数行不入列）');
  check(p.tasks.every(t => t.kind === undefined),
    '类型徽章只作展示：解析结果里没有 kind（否则保存时会把「待修改」静默改成「待办」）');
  check(p.tasks[0].pri === '中' && p.tasks[3].pri === '高' && p.tasks[4].pri === '低',
    '优先级无损往返：高 / 中 / 低三档全部按显式标记还原');
  check((text.match(/^\d+\. \[待办\]\[[高中低]\] .+（.+）$/gm) || []).length === openTasks.length,
    '每一条待办都写全「[待办][优先级]」（高 / 中 / 低不再有缺标记的条目）');
  check(p.notes.length === T.projNotes(w1.name).length
    && p.notes[0].tag === '技术' && p.notes[0].title === 'APEX 架构备忘',
    '灵感 / 笔记区按序号解析（tag + 标题）');
  check(p.rules.length === 5 && p.rules[0] === '先分析，再修改。', '开发要求按序号解析');

  check(T.basicInfoParsedHasBody(p) === true
    && T.basicInfoParsedHasBody(T.parseBasicInfoText('当前待办：5 项（含待修改 3 项）')) === false,
    '整篇清空 / 只剩计数行判为「无可保存内容」，拒绝保存');

  /* 尾部少行 = 会删数据：预演按序号算出被删条目，此步不改任何数据 */
  const pDrop = { fields:p.fields, tasks:p.tasks.slice(0, openTasks.length - 1),
                  notes:p.notes.slice(0, p.notes.length - 1), rules:p.rules };
  const diff = T.basicInfoDropList(w1.id, pDrop);
  check(diff && diff.drop.length === 2
    && diff.drop.some(x => x.text === openTasks[openTasks.length - 1].text)
    && diff.drop.some(x => x.text === T.projNotes(w1.name).slice(-1)[0].title),
    '文本少掉的尾部条目进入删除预演（尾部任务 + 尾部记录各 1 条）');
  check(T.basicInfoDropList('__nope__', p) === null, '未知项目：预演返回 null，不抛异常');


} catch (e) { console.log('FAIL 基本资料解析回写 → ' + e.message); fail++; }

/* 3d. 「复制 Agent 上下文」入口 + Agent Context 文本生成 */
try {
  const w1 = T.DATA.projects[0];
  const dev1 = T.projDevHTML(w1);
  check(dev1.includes('data-act="copyAgent"') && dev1.includes('复制 Agent 上下文'), '项目页含「复制 Agent 上下文」入口');
  check(!dev1.includes('btn-primary btn-sm" data-act="copyAgent"'), '复制入口未抢主操作样式');

  const txt = T.agentContextText(w1);
  ['项目：APEX Automation','当前开发模块：AK 自动加速',
   '模块路径：src/modules/ak-accelerator/','相关文件：window.py state.py runner.py',
   /* 类型统一写「待办」（不再出现「待修改」），优先级高 / 中 / 低条条显式 */
   '1. [待办][中] 完善自动化脚本的异常处理（今天）',
   '2. [待办][中] 整理项目文档结构（今天）',
   '3. [待办][中] 窗口前置偶发失败（本周）',
   '4. [待办][高] 第二次启动状态判断错误（本周）',
   '5. [待办][低] 点击后缺少成功状态确认（本周）',
   '- [技术] APEX 架构备忘','- [灵感] 尝试 UI Automation 替代部分图像识别',
   '开发要求：','1. 先分析，再修改。','5. 完成后只测试本轮修改内容。']
    .forEach(k => check(txt.includes(k), 'Agent 上下文含：' + k));
  check(!txt.includes('待修改') && !txt.includes('↳') && !txt.includes('下一步：'),
    '模板已剔除：「待修改」类型徽章、「↳ 引用笔记」续行、「下一步：」定位行');
  check(txt.split('\n')[0] === '项目：APEX Automation' && /\n待办：\n/.test(txt),
    '精简后首行仍是「项目：」，定位段直接接「待办：」（中间不再夹计数行）');

  const w2 = T.DATA.projects.find(w => w.name === 'local-ops');
  const txt2 = T.agentContextText(w2);
  check(txt2.includes('模块路径：src/modules/environment-watch/')
    && txt2.includes('相关文件：watcher.py backup.py logger.py')
    && !/当前待办：|当前灵感/.test(txt2), 'local-ops 上下文：定位信息保留，派生计数已剔除');

  let pr = null, threw = false;
  try { pr = T.copyText('probe'); } catch (e) { threw = true; }
  check(!threw && pr && typeof pr.then === 'function', 'copyText 在无 navigator/body 的桩环境不抛异常且返回 Promise');
} catch (e) { console.log('FAIL 复制 Agent 上下文 → ' + e.message); fail++; }

/* 3e. 「设为本轮开发任务」：行内入口 / 选中态 / 取消 / 上下文与文本 / 跨项目隔离 */
try {
  const w1 = T.DATA.projects[0];
  const w2 = T.DATA.projects.find(w => w.name === 'local-ops');
  const openTasks = T.projTasks(w1.name).filter(t => !t.done);
  const total = openTasks.length;

  const base = T.projDevHTML(w1);
  check((base.match(/data-act="promoteTask"/g) || []).length === total,
    '每条项目任务都有「设为当前」入口（' + total + ' 个）');
  check((base.match(/data-act="gotoTodo"/g) || []).length === total, '每条任务都有项目内编辑入口');
  check((base.match(/data-act="gotoNote"/g) || []).length === T.projNotes(w1.name).length,
    '每条项目记录都有编辑入口');

  const t0 = T.agentContextText(w1);
  check(t0.split('\n')[0] === '项目：APEX Automation' && !t0.includes('本轮开发任务'),
    '未选择任务时 Agent Context 首行仍为「项目：」且不含本轮任务（第五步输出不变）');
  check(!t0.includes('下一步'), '未选择任务时文本不含「下一步」定位行（已从模板剔除）');

  T.S.devTask[w1.id] = { tid:'f3', source:'待修改' };
  const sel = T.projDevHTML(w1);
  check((sel.match(/data-act="outCurTask"/g) || []).length === 1
    && sel.includes('点击后缺少成功状态确认'),
    '选中后任务进入「当前任务」区，并带「移出」入口');
  check((sel.match(/data-act="promoteTask"/g) || []).length === total - 1,
    '被选中的任务不再出现在优先级区（其余 ' + (total - 1) + ' 条仍可点）');

  const t1 = T.agentContextText(w1);
  check(t1.startsWith('本轮开发任务：\n点击后缺少成功状态确认\n\n任务来源：\n待办\n\n项目：APEX Automation'),
    '选中后 Agent Context 顶部追加 本轮开发任务 / 任务来源（类型统一写「待办」）');
  ['项目：APEX Automation','当前开发模块：AK 自动加速','模块路径：src/modules/ak-accelerator/',
   '相关文件：window.py state.py runner.py','开发要求：']
    .forEach(k => check(t1.includes(k), '选中后仍保留：' + k));
  check(!t1.includes('下一步'), '选中任务后同样不再输出「下一步」定位行');
  check(!/Codex|Claude|Cursor|Copilot/i.test(t1), 'Agent Context 不含具体 Agent 产品名');

  const dev2 = T.projDevHTML(w2), t2 = T.agentContextText(w2);
  check(!dev2.includes('点击后缺少成功状态确认') && !t2.includes('本轮开发任务'),
    '切换到另一个项目不继承上一项目的任务（按项目隔离）');

  delete T.S.devTask[w1.id];
  const off = T.projDevHTML(w1);
  check(!off.includes('data-act="outCurTask"') && !T.agentContextText(w1).includes('下一步'),
    '取消选择后任务回到优先级区，文本仍不含「下一步」');

  const nb = T.projDevHTML(Object.assign({}, T.DATA.projectTemplate, {id:'__probe2', name:'探针项目2'}));
  check(!nb.includes('data-act="promoteTask"') && !nb.includes('data-act="outCurTask"'),
    '没有任务的项目不渲染任何任务区操作入口');
} catch (e) { console.log('FAIL 本轮开发任务 → ' + e.message); fail++; }

/* 3e-2. 待办/待修改合并 + 笔记/灵感同源：单一事实源、派生计数与双向联动 */
try {
  const w1 = T.DATA.projects[0];
  const d1 = T.DATA.devContext[w1.name];
  /* 1) 不再存第二份数据 */
  check(!('counts' in d1) && !('recentChanges' in d1) && !('recentIdeas' in d1),
    'devContext 不再保存待办/待修改/灵感数据（单一事实源）');
  /* 2) kind 模型与派生计数 */
  check(T.TASK_KIND.todo.label === '待办' && T.TASK_KIND.fix.label === '待修改', 'TASK_KIND 定义两种类型（数据词表，不再对外呈现）');
  check(T.KIND_SHOW === '待办', 'KIND_SHOW：对外呈现统一写「待办」，「待修改」不再出现在任何输出里');
  const taskFromApi = T.backendTaskFromApi({
    id:'api-fix', project_id:w1.id, title:'后端待修改', due_date:'本周', priority:'高', kind:'fix', completed:1
  }, new Map([[w1.id, w1]]));
  check(taskFromApi && taskFromApi.proj === w1.name && taskFromApi.kind === 'fix'
    && taskFromApi.done && taskFromApi.pri === '高' && taskFromApi.due === '本周',
    '后端任务按项目 id 恢复为现有项目任务模型，保留类型、优先级、截止与完成状态');
  const noteFromApi = T.backendNoteFromApi({
    id:'api-note', project_id:w1.id, title:'后端项目记录', tag:'技术', body:'已落库', pinned:1,
    updated_at:'2026-09-19T08:00:00+00:00', links:['api-fix']
  }, new Map([[w1.id, w1]]));
  check(noteFromApi && noteFromApi.proj === w1.name && noteFromApi.tag === '技术'
    && noteFromApi.pinned && noteFromApi.body === '已落库' && noteFromApi.links[0] === 'api-fix',
    '后端项目记录按项目 id 恢复标签、正文、置顶和历史关联');
  check(!/TASK_KIND\[taskKindOf\(t\)\]\.label/.test(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8')),
    '源码级：对外不再读 TASK_KIND 的 label（Agent 文本 / 任务来源 / 删除预演 / Obsidian 主页统一走 KIND_SHOW）');
  check(T.projTodos(w1.name).length === 2 && T.projFixes(w1.name).length === 3,
    'APEX 派生计数：待办 2 / 待修改 3');
  check(T.devCounts(w1.name).note === 4, 'APEX 派生计数：灵感 / 笔记 4');
  check(T.projNotes(w1.name).length > 0 && T.projNotes(w1.name).every(n => n.proj === w1.name),
    '项目笔记全部通过 proj 指向本项目');
  check(T.S.notes.filter(n => n.tag === '灵感').length > 0, '灵感与项目记录共用同一份 S.notes（靠 tag 区分，不另立字段）');
  /* 3) 一处修改，处处一致：在待办侧完成一条待修改 */
  const before = T.projFixes(w1.name).length;
  const f1 = T.allTodos().find(x => x.id === 'f1');
  f1.done = true;
  check(T.projFixes(w1.name).length === before - 1
    && !T.projDevHTML(w1).includes('窗口前置偶发失败')
    && !T.agentContextText(w1).includes('窗口前置偶发失败'),
    '待办侧完成一条待修改：开发上下文与 Agent 文本同步更新');
  f1.done = false;
  /* 4) 本轮任务存 id：待办侧改措辞，开发上下文自动跟上 */
  T.S.devTask[w1.id] = { tid:'f3', source:'待修改' };
  const f3 = T.allTodos().find(x => x.id === 'f3');
  const oldText = f3.text; f3.text = '改过措辞的任务';
  check(T.devTaskOf(w1.id).text === '改过措辞的任务', '本轮任务按 id 实时解析：改文案自动同步');
  f3.text = oldText; delete T.S.devTask[w1.id];
  /* 5) 笔记挂到项目：计数即时联动 */
  const n0 = T.devCounts(w1.name).note;
  const nn = T.S.notes.find(x => x.id === 'n1');
  nn.proj = w1.name;
  check(T.devCounts(w1.name).note === n0 + 1, '笔记设置所属项目：开发上下文计数同步 +1');
  nn.proj = '';
  /* 6) 项目改名迁移覆盖新的按名引用 */
  check(T.renameProjRefs('APEX Automation', 'APEX Automation X')
    && T.allTodos().some(t => t.proj === 'APEX Automation X')
    && T.S.notes.some(n => n.proj === 'APEX Automation X'),
    '项目改名迁移覆盖 S.todos 与 S.notes');
  T.renameProjRefs('APEX Automation X', 'APEX Automation');
  /* 7) 编辑入口只留在项目开发上下文 */
  const projectContent = T.projDevHTML(w1);
  check(projectContent.includes('项目任务') && projectContent.includes('项目记录'),
    '任务与记录统一呈现在项目开发上下文');
  check(projectContent.includes('data-act="newTodoFor"') && projectContent.includes('data-act="newNoteFor"'),
    '项目内提供新建任务与新建记录入口');
} catch (e) { console.log('FAIL 待办笔记合并联动 → ' + e.message); fail++; }

/* 3e-3. 待办 ↔ 笔记相互引用 + 统一编辑入口（2026-09-14 二轮合并） */
try {
  const w1 = T.DATA.projects[0];
  const appSrc2 = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  /* 1) 引用单点存储：links 只存笔记侧，待办侧派生读取 */
  const n2 = T.S.notes.find(n => n.id === 'n2');
  const n5 = T.S.notes.find(n => n.id === 'n5');
  check(T.noteLinksOf(n2).join(',') === 't1' && T.noteLinksOf(n5).join(',') === 'f2',
    '种子引用就位：架构备忘↔完善异常处理，UI Automation 灵感↔第二次启动状态判断');
  check(T.noteLinksOf({}).length === 0 && T.noteLinksOf({links:'x'}).length === 0
    && T.noteLinksOf(null).length === 0, 'links 缺失 / 脏数据 / null 一律按空引用处理（不抛异常）');
  check(!/notesLinkedTo|refBadgeOf|linkBadgeOf/.test(require('fs').readFileSync(path.join(__dirname, 'app.js'), 'utf8')),
    '待办侧引用派生函数与引用徽标已彻底移除（渲染宿主消失，零残留）');
  check(T.allTodos().find(x=>x.id==='t1').links === undefined,
    '待办条目不存第二份引用（避免多处维护）');
  /* 2) 待办改文案：引用按 id 不断；文本已不再输出「↳ 引用笔记」续行 */
  const t1 = T.allTodos().find(x=>x.id==='t1');
  const oldT1 = t1.text; t1.text = '换过措辞的待办';
  check(!T.agentContextText(w1).includes('↳'),
    'Agent 文本不再输出「↳ 引用笔记」续行（引用已无渲染宿主）');
  const txtSaid = T.agentContextText(w1);
  t1.kind = 'fix';
  check(T.agentContextText(w1) === txtSaid
    && txtSaid.includes('1. [待办][中] 换过措辞的待办（今天）'),
    '待办切类型：Agent 文本逐字不变（类型统一写「待办」，kind 只留在数据里）');
  t1.text = oldT1; t1.kind = 'todo';
  /* 3) 写入侧已移除：两侧关联入口删除后，links 变成只读历史数据，只剩 detachTodoRefs 兜底 */
  const n1 = T.S.notes.find(n=>n.id==='n1');
  n1.links = (n1.links || []).concat('t9');
  check(T.noteLinksOf(n1).includes('t9'), '引用仍由笔记侧 links 单一存储');
  T.detachTodoRefs('t9');
  check(!T.noteLinksOf(n1).includes('t9'), 'detachTodoRefs：删除待办后笔记侧无悬空引用');
  const appSrcRef = require('fs').readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  check(!/function toggleNoteLink/.test(appSrcRef) && !appSrcRef.includes("case 'todoNoteLink'"),
    '关联写入动作已删除（toggleNoteLink / todoNoteLink 零残留）');
  /* 4) 死代码清扫（2026-09-24）：宿主消失后留存的纯展示函数、占位映射与只写不读字段已彻底移除 */
  check(!/notesLinkedTo|refBadgeOf|linkBadgeOf|noteIsIdea|MOD_ENTRY_PH/.test(appSrcRef),
    '无宿主的引用派生 / 灵感判定 / 四类入口占位映射已彻底移除（零残留）');
  check(!/\b_modId\b|\bprepOpen\b|projectFileDeletePreview/.test(appSrcRef),
    '只写不读的状态字段已清除（模块 id / 预备检查展开态 / 文件删除预演缓存）—— 这里按裸名字查：只查 S.xxx 点号形式会漏掉「以键的形式写回 S 字面量」');
  check(!/^ {2}(pause|skip|down|send|gear|chip):\s+c => sv\(/m.test(appSrcRef),
    '生产零引用的图标键已清除（IC 只保留有宿主的图标）');
  /* 6) 死代码清扫（2026-09-25）：零引用状态字段 + 零规则类钩子 */
  check(!/\b_modType\b|\b_modProj\b/.test(appSrcRef),
    '模块表单的零引用选中态字段已清除（只剩 _modKey 一个键，类型与所属项目由条目自身派生）');
  const idxSrcRef = require('fs').readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  check(!/dashboard-head|tile-menu|wf-steps-card|class="txt"/.test(appSrcRef + idxSrcRef)
    && !appSrcRef.includes('class="card ov-card ov-edit"'),
    '零规则类钩子已清除（这几个类名在 styles.css 里从来没有规则，是删功能留下的残骸）');
  const devCtx = T.projDevHTML(w1);
  check((devCtx.match(/data-act="gotoTodo"/g) || []).length === T.projTasks(w1.name).filter(t=>!t.done).length
    && (devCtx.match(/data-act="gotoNote"/g) || []).length === T.projNotes(w1.name).length,
    '任务 / 记录行的编辑入口计数不受影响');
  check(devCtx.includes('lm-k">项目任务</span><span class="lm-v">5</span>')
    && devCtx.includes('lm-k">项目记录</span><span class="lm-v">4</span>'),
    '开发上下文卡的派生计数：项目任务 5（待办并入，不单列）/ 项目记录 4');
  /* 5) 编辑入口统一（源码级接线断言） */
  check(appSrc2.includes("case 'saveTodoEdit'") && appSrc2.includes("textId:'todoEditText'"),
    '待办编辑抽屉：文本编辑入口 + 保存动作就位');
  /* 新建 / 编辑共用同一段骨架，两个抽屉的表单不可能再各自漂移 */
  check(appSrc2.includes('function todoFormHTML(')
    && /function newTodo\([\s\S]{0,400}?todoFormHTML\(/.test(appSrc2)
    && /function todoMenu\([\s\S]{0,900}?todoFormHTML\(/.test(appSrc2),
    '新建 / 编辑共用同一段表单骨架（防止版式再次各自漂移）');
  const skel = appSrc2.slice(appSrc2.indexOf('function todoFormHTML('), appSrc2.indexOf('function newTodo('));
  check(skel.indexOf('>截止</div>') > -1 && skel.indexOf('>截止</div>') < skel.indexOf('>优先级</div>'),
    '共用骨架字段顺序：标题 → 截止 → 优先级');
  check(!skel.includes('<small>'), '共用骨架不带灰字说明（保持与新建一致的干净版式）');
  const editForm = appSrc2.slice(appSrc2.indexOf('function todoMenu('), appSrc2.indexOf('function toggleTheme('));
  check(!editForm.includes('<small>') && !editForm.includes('hint-line'),
    '编辑弹窗去掉全部灰字说明（含已失效的「其余记录可从项目记录编辑窗口关联」）');
  check(editForm.includes('保存</button>') && editForm.includes('删除</button>')
    && editForm.includes('取消</button>')
    && !editForm.includes('保存修改') && !editForm.includes('关闭</button>'),
    '编辑弹窗底部按钮文案对齐新建：保存 / 删除 / 取消');
  /* 所属项目选择器 + 「关联项目记录」整块已删除（所属项目只在标题下只读展示） */
  check(!editForm.includes('关联项目记录') && !editForm.includes('所属项目')
    && !editForm.includes('data-act="todoSetProj"') && !editForm.includes('data-act="todoNoteLink"'),
    '编辑弹窗已删除「所属项目」选择器与「关联项目记录」整块');
  check(!/case 'todoSetProj'/.test(appSrc2) && !/case 'todoNoteLink'/.test(appSrc2)
    && !appSrc2.includes("case 'noteTodoLink'"),
    '失去入口的动作分支已清理：todoSetProj / todoNoteLink（记录侧本就无任务清单）');
  check(/case 'newNoteFor':\s*newNote\(/.test(appSrc2) && /function newNote\(/.test(appSrc2),
    '项目内新建记录直接进入统一编辑弹窗');
  check(appSrc2.includes('detachTodoRefs(removed.id)'), '删除待办时自动清理笔记侧悬空引用');
  /* 6) 开发上下文提供预置项目的新建入口（落到同一套编辑器） */
  check(devCtx.includes('data-act="newTodoFor"') && devCtx.includes('data-act="newNoteFor"'),
    '开发上下文可新建待办 / 笔记（预置所属项目）');
  /* 7) 区域化：当前任务区（可多个 / 可为空）+ 高/中/低优先级区，拖入即切换状态 */
  check(T.priOf({}) === '中' && T.priOf({pri:'高'}) === '高' && T.priOf({pri:'超大'}) === '中',
    'priOf：缺省 / 非法优先级回落「中」');
  check(T.priOf(T.allTodos().find(x=>x.id==='f2')) === '高' && T.priOf(T.allTodos().find(x=>x.id==='f3')) === '低',
    '种子优先级就位：f2 高 / f3 低');
  const v2 = T.viewWorkflows(false);
  const dsec = v2.slice(v2.indexOf('board-title">开发上下文'), v2.indexOf('board-title">运行流程'));
  check((dsec.match(/class="pz" data-zone="cur"/g) || []).length === 1
    && (dsec.match(/class="pz" data-zone="高"/g) || []).length === 1
    && (dsec.match(/class="pz" data-zone="中"/g) || []).length === 1
    && (dsec.match(/class="pz" data-zone="低"/g) || []).length === 1,
    '四个区域就位：当前任务 + 高 / 中 / 低（均可投放）');
  check((dsec.match(/data-pz-resize=/g) || []).length === 4 && appSrc2.includes('S.zoneH'),
    '每个区域带高度调整手柄（可绘制可调整）');
  check(dsec.includes('pz-empty') && dsec.includes('可为空') && dsec.includes('可多个'),
    '当前任务区默认为空：明确提示可多个 / 可为空');
  check((dsec.match(/data-drag-todo=/g) || []).length === T.projTasks('APEX Automation').filter(t=>!t.done).length,
    '每个待办行均可拖拽（区域间移动的主要交互）');
  check(appSrc2.includes("closest('.pz')") && appSrc2.includes('moveTaskZone(z.dataset.proj, tid, z.dataset.zone)'),
    '投放接线：拖入区域 → moveTaskZone 按区域切换状态');
  check(/case 'outCurTask'/.test(appSrc2) && /case 'promoteTask'/.test(appSrc2) && /case 'editCurTask'/.test(appSrc2),
    '当前区行（编辑/移出）与优先级区行（设为当前）的按钮接线就位');
  /* 区域移动语义：入 cur 区成当前任务（多个共存）；入优先级区切换 pri 并移出当前区 */
  T.moveTaskZone('apex', 't2', 'cur');
  T.moveTaskZone('apex', 'f1', 'cur');
  check(T.devTidsOf('apex').join(',') === 't2,f1',
    '当前任务区支持多个任务同时存在');
  T.moveTaskZone('apex', 't2', '高');
  check(T.priOf(T.allTodos().find(x=>x.id==='t2')) === '高' && T.devTidsOf('apex').join(',') === 'f1',
    '拖入优先级区：切换 pri 并自动移出当前任务区（互斥一致）');
  const v3 = T.viewWorkflows(false);
  const dsec2 = v3.slice(v3.indexOf('board-title">开发上下文'), v3.indexOf('board-title">运行流程'));
  check((dsec2.match(/data-act="outCurTask"/g) || []).length === 1
    && dsec2.includes('data-act="editCurTask"') && dsec2.includes('data-act="tick"'),
    '当前区行：勾选完成 + 编辑 + 移出；f1 仍在当前区（t2 已回到高优先级区）');
  /* 完成清理：勾选完成 / 删除后自动从所有当前任务区移除 */
  T.S.devTask.apex = { tids:['t2','t3'] };
  const t2z = T.allTodos().find(x=>x.id==='t2');
  t2z.done = true; T.pruneCurTasks('t2z-wrong'); T.pruneCurTasks('t2');
  check(T.devTidsOf('apex').join(',') === 't3', 'pruneCurTasks：完成 / 删除后从当前任务区移除（只清目标）');
  t2z.done = false; delete T.S.devTask.apex;
  /* Agent 上下文：高优先级标注不变 */
  const t1x = T.allTodos().find(x=>x.id==='t1');
  t1x.pri = '高';
  check(T.agentContextText(w1).includes('1. [待办][高] '), 'Agent 上下文标注高优先级');
  t1x.pri = '中';
} catch (e) { console.log('FAIL 条目引用与编辑入口 → ' + e.message); fail++; }

/* 3f. 模块异常反馈：预备检查卡与执行模块卡均已删，异常在「运行流程」卡按模块点名 */
try {
  const w1 = T.DATA.projects[0];   /* apex：就绪 */
  const w3 = T.DATA.projects[2];   /* ai：笔记目录缺失（warn） */
  const w4 = T.DATA.projects[1];   /* ops：就绪 */
  const p1 = T.preflight(w1), p3 = T.preflight(w3), p4 = T.preflight(w4);

  check(p1.ready && p3.ready === false && p4.ready === true,
    '（前置）preflight 判定未变：apex 就绪 / ai 待确认 / ops 就绪');
  check(p3.issues.every(i => i.mod), '每条异常都携带所属模块名（点名到模块）');

  T.S.wf = w1.id;
  const c1 = T.viewWorkflows(false);
  check(!c1.includes('预备检查') && !c1.includes('查看详情') && !c1.includes('查看全部检查'),
    '预备检查卡已整体移除（正常 / 异常都不再单独成卡）');
  check(!c1.includes('ov-ready') && !c1.includes('已绑定模块'), '概览就绪度块与执行模块卡均已移除');

  /* 异常项目（ai）：运行流程卡内逐条点名模块与原因 */
  T.S.wf = w3.id;
  const c3 = T.viewWorkflows(false);
  check(c3.includes('data-act="editWf"') && c3.includes('笔记目录'),
    '异常项目：运行流程卡提供「添加模块」入口并出现异常点名');
  check(p3.issues.every(i => c3.includes('· ' + i.mod + '：' + i.t)),
    '异常项目：运行流程卡内逐条点名「模块：原因」');

  /* 就绪项目（ops）：运行流程卡无任何异常反馈 */
  T.S.wf = w4.id;
  const c4 = T.viewWorkflows(false);
  check(!c4.includes('需要先创建') && !c4.includes('需要人工确认') , '就绪项目：运行流程卡零异常反馈');

  /* 构造项目：warn 与 info 两类问题都点名到模块 */
  const mixW = {id:'__mix', name:'混合检查项', steps:[
    {id:'mx1', type:'script', ref:'db_migrate.py', label:'db_migrate.py', wait:true, on:true},
    {id:'mx2', type:'folder', ref:'D:/缺省', label:'缺失目录',      wait:true, on:true, missing:true}
  ]};
  T.DATA.modules.push({id:'__confirm',type:'script',ref:'db_migrate.py',name:'db_migrate.py',desc:'',arg:'',st:'需确认'});
  const mixHTML = T.projRunHTML(mixW, null, false);
  check(mixHTML.indexOf('缺失目录：') > -1 && mixHTML.indexOf('db_migrate.py：') > -1,
    'warn / info 级问题都点名到模块');
  T.DATA.modules.pop();

  T.S.wf = 'apex';
} catch (e) { console.log('FAIL 模块异常反馈 → ' + e.message); fail++; }

/* 3g. 运行状态降级：摘要常驻，完整日志按需展开 */
try {
  const w1 = T.DATA.projects.find(p=>p.id==='ops');
  const total = w1.steps.filter(s => s.on).length;
  T.S.wf = w1.id; T.S.running = null; T.S.runOpen = {};
  w1.history = [{id:'run-ops', t:'昨天 21:10', st:'成功', note:''}];
  w1.execution = {action:'run', status:'succeeded', steps:[{
    module_id:w1.steps[0].moduleId, module_name:w1.steps[0].label, action:'run', status:'succeeded',
    run:{logs:['[STEP] local ops','[OK] local ops done']}
  }]};

  const idle = T.viewWorkflows(false);
  check(idle.includes('运行状态') && idle.includes('空闲') && idle.includes('最近一次运行') && idle.includes('成功') && idle.includes('查看运行详情'),
    '空闲态摘要提炼为一句关键要点（最近一次运行：时间 · 成功），不再重复两组指标');
  check(!idle.includes('上次运行') && !idle.includes('>结果 <'), '空闲态冗余的「上次运行 / 结果」指标已去除');
  check(!idle.includes('id="termRun"'), '空闲态默认不显示完整日志');

  T.S.runOpen[w1.id] = true;
  const idleDetail = T.viewWorkflows(false);
  check(idleDetail.includes('id="termRun"') && idleDetail.includes('收起运行详情') && idleDetail.includes('$ apex-console run 项目执行'),
    '空闲态一次点击可展开最近运行详情');

  const restored = T.restoreBackendExecution(w1, {id:'exec-ops', action:'run', status:'running', steps:[{
    module_id:w1.steps[0].moduleId, module_name:w1.steps[0].label, action:'run', status:'running', run:{logs:['[STEP] local ops']}
  }]});
  check(restored && T.S.running.status==='running' && T.S.running.states[w1.steps[0].id]==='now'
    && T.S.running.log.some(row=>row.t.includes('[STEP] local ops')),
    '刷新后按后端执行步骤恢复当前模块与真实日志');

  T.S.runOpen[w1.id] = false;
  T.startRun(w1.id);
  const running = T.viewWorkflows(false);
  check(running.includes('运行中') && running.includes(`0 / ${total}`) && running.includes('关闭项目') && running.includes('查看运行详情')
    && !running.includes('data-act="stopRun"'),
    '运行中进度保留，关闭操作统一放在详情页头');
  check(!running.includes('id="termRun"'), '运行中默认不显示完整日志');
  check(running.includes('flow-node wait') && !running.includes('flow-node now'),
    '线性流程视图：启动后节点全部待命（尚未推进）');
  T.advanceRun();
  check(T.viewWorkflows(false).includes('flow-node now'),
    '线性流程视图：进行中节点高亮定位当前位置');
  T.advanceRun();
  check(T.viewWorkflows(false).includes('flow-node done') && T.viewWorkflows(false).includes('flow-node now'),
    '线性流程视图：随进度推进，已完成打勾、未开始空心');

  T.S.runOpen[w1.id] = true;
  const runningDetail = T.viewWorkflows(false);
  check(runningDetail.includes('id="termRun"') && runningDetail.includes('$ apex-console run') && runningDetail.includes('收起运行详情'),
    '运行中一次点击可查看实时完整日志');

  T.S.running = null; T.S.runOpen = {};
} catch (e) { console.log('FAIL 运行状态降级 → ' + e.message); fail++; }

/* 3g-2. 线性流程：多步骤 S 形蛇形折行，行间曲线衔接、不交叉 */
try {
  const manyW = {id:'__many', name:'多步骤项目', runs:0, last:'—',
    steps: Array.from({length:12}, (_,i)=>({id:'mn'+i, type:'app', ref:'vscode', label:'步骤'+(i+1), wait:true, on:true}))};
  const mh = T.projRunHTML(manyW, null, false);
  check((mh.match(/class="flow-line/g) || []).length === 3 && (mh.match(/class="flow-turn/g) || []).length === 2,
    '12 个步骤折为 3 行、2 个 S 形转弯（每行 5 个，蛇形走向）');
  check(mh.includes('turn-right') && mh.includes('turn-left'), 'S 形转弯左右交替衔接，连线不交叉');
  check((mh.match(/L 21 24/g) || []).length === 2 && mh.includes('scaleX(-1)'),
    '每个转折点一枚箭头（指向下一行首节点），左转弯镜像后箭头仍指向行进方向');
  check((mh.match(/class="flow-node /g) || []).length === 12, '每个步骤恰好一个节点');
  /* 回归：反序行必须挂 rev 类右对齐（否则蛇形第二行左对齐、与 S 弯端点错位） */
  check(mh.includes('class="flow-line rev"') && mh.indexOf('步骤10') < mh.indexOf('步骤6'),
    '反序行带 rev 类右对齐，节点按蛇形读序排列（步骤10 在 步骤6 左侧）');
  const fewW = Object.assign({}, manyW, {steps: manyW.steps.slice(0,4)});
  check(!T.projRunHTML(fewW, null, false).includes('flow-turn'), '步骤少时单行直排，不出现转弯');
  /* 回归：转弯 SVG 硬编码宽高 + 非整行时节点槽位恒定，端点对齐不断线 */
  const elevenW = Object.assign({}, manyW, {steps: manyW.steps.slice(0,11)});
  const eh = T.projRunHTML(elevenW, null, false);
  check(eh.includes('<svg viewBox="0 0 60 30" width="60" height="30"'),
    '转弯曲线带硬编码宽高（样式缺失时也不会被裁成残段）');
  check((eh.match(/class="flow-line/g) || []).length === 3 && eh.includes('turn-left') && (eh.match(/class="flow-node /g) || []).length === 11,
    '11 步折 3 行（5/5/1）：末行单节点槽位恒定，S 弯端点对齐不断线');
} catch (e) { console.log('FAIL 线性流程 S 形 → ' + e.message); fail++; }

/* 4. 运行引擎整轮 */
try {
  T.startRun('ops');
  for (let i = 0; i < 12; i++) T.advanceRun();
  check(true, '运行引擎跑完整轮，日志 ' + (T.S.running ? T.S.running.log.length : 0) + ' 行');
} catch (e) { console.log('FAIL startRun → ' + e.message); fail++; }
T.S.running = null;

/* 4a. 真实项目轮询去重：执行状态没变不重复重绘（全量重建会让卡片 hover 反复弹跳、闪烁） */
try {
  const wfA = T.DATA.projects.find(p => T.REAL_PROJECT_IDS.has(p.id));
  const savedPage = T.S.page, savedRunning = T.S.running, savedRender = ctx.render;
  T.S.page = 'projects';
  T.S.running = {token:9001, wfId:wfA.id, i:0, done:0, total:1, states:{}, log:[], order:[wfA.steps[0].id], real:true, action:'run', status:'running', runId:'exec-x'};
  const pollPayload = {id:'exec-x', action:'run', status:'running', steps:[
    {module_id:wfA.steps[0].moduleId, module_name:wfA.steps[0].label, action:'run', status:'running', run:{logs:['[STEP] local ops']}}
  ]};
  let paints = 0;
  try {
    ctx.render = () => { paints++; };
    T.applyBackendRun(wfA, 9001, pollPayload);            // 首次上报：渲染
    T.applyBackendRun(wfA, 9001, pollPayload);            // 内容未变：不渲染
    const next = JSON.parse(JSON.stringify(pollPayload));
    next.status = 'queued';                               // 状态推进：必须渲染
    T.applyBackendRun(wfA, 9001, next);
  } finally {
    ctx.render = savedRender;
    T.S.page = savedPage; T.S.running = savedRunning;
  }
  check(paints===2, '真实项目轮询去重：相同执行状态只重绘一次，状态变化才重绘（3 次轮询重绘 ' + paints + ' 次）');
} catch (e) { console.log('FAIL 轮询去重 → ' + e.message); fail++; }

/* 4b. 项目查看 / 编辑模式分离 */
try {
  const w1 = T.DATA.projects[0];
  T.S.wf = w1.id; T.S.wfEdit = null;
  const view = T.viewWorkflows(false);
  check(view.includes('ov-name') && view.includes(w1.name) && view.includes(w1.desc)
     && ['创建时间','最近运行','最近更新','工作概况'].every(k => view.includes(k)),
    '概览区 · 项目信息卡：身份（名称 / 描述 / 技术栈）+ 时间线 + 工作概况');
  check(['项目能力','项目统计','当前流程','模块构成','启用明细','文件数量','历史运行次数']
     .every(k => view.includes(k)) && view.includes('ov-flow-note') && view.includes(w1.flowDesc),
    '概览区三卡内容齐全：能力（流程 / 构成 / 明细）+ 统计（文件 / 运行）');
  /* 主操作上提到页头：概览区只承载信息，不再有主按钮 —— 这是本次「主次分明」的核心约束 */
  const ovStart = view.indexOf('ov-grid');
  const ovEnd   = view.indexOf('开发上下文', ovStart);
  const ovBody  = view.slice(ovStart, ovEnd);
  const headBlock = view.slice(view.indexOf('class="page-head'), ovStart);
  check(ovStart > -1 && ovEnd > ovStart && !ovBody.includes('btn-primary') && !ovBody.includes('data-act="runProject"'),
    '概览区不含主按钮（运行项目已移出信息卡）');
  check(headBlock.includes('data-act="runProject"') && headBlock.includes('btn-primary'),
    '运行项目作为页面级主操作落在页头操作区');
  const hOrd = ['data-act="runProject"','data-act="openProjectFiles"','data-act="editWf"'].map(k => headBlock.indexOf(k));
  check(hOrd[0] > -1 && hOrd[0] < hOrd[1] && hOrd[1] < hOrd[2] && headBlock.includes('>打开项目文件</button>'),
    '查看模式页头三操作：运行项目 → 打开项目文件 → 编辑');
  check(!headBlock.includes('继续开发'),
    '页头已移除「继续开发」入口（开发上下文改由开发上下文区的入口承载）');
  /* 开发上下文卡头整行已删除：原标题「继续开发 <项目名>」与页头 h1、概览卡 ov-name 三处重复，
     同行的 devContext.status 徽章一并下线 —— 卡片直接以内容开场。 */
  const devCard = view.slice(view.indexOf('board-title">开发上下文'), view.indexOf('board-title">运行流程'));
  check(devCard.length > 0 && !devCard.includes('继续开发') && !view.includes('继续开发'),
    '开发上下文卡不再出现「继续开发 <项目名>」标题（整页零残留）');
  check(/开发上下文<\/span><\/div>\s*<section class="card">\s*<div class="dev-cols">/.test(view),
    '开发上下文卡直接以内容开场：card-head 整行（标题 + 状态徽章）已删除');
  check(!devCard.includes('class="card-head"') && !devCard.includes('badge b-blue'),
    '开发上下文卡内无 card-head、无状态徽章（devContext.status 只剩弹窗 nm-meta 一个宿主）');
  check(!headBlock.includes('data-act="editBasicInfo"') && view.includes('data-act="editBasicInfo"'),
    '编辑基本资料入口只落在开发上下文卡，不挤进页头操作区');
  const appSrcHead = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  check(appSrcHead.includes("case 'openProjectFiles': openProjectFiles(id)")
    && appSrcHead.includes("case 'openProjectFile': openProjectFile(id)")
    && appSrcHead.includes('function openProjectFiles(projectId)')
    && appSrcHead.includes('当前项目还没有关联文件'),
    '接线：项目页头打开已关联文件；添加文件仍在项目文件卡片中');
  check(!view.includes('id="stepsDrop"') && !view.includes('>执行模块库<') && !view.includes('data-act="toggleStep"'),
    '查看模式默认隐藏步骤编排与编辑控件（添加模块入口仅为跳转编辑模式的按钮）');

  T.S.wfEdit = w1.id;
  const edit = T.viewWorkflows(false);
  check(edit.includes('正在编辑') && edit.includes('data-act="exitWfEdit"'), '编辑模式提供明确状态与退出入口');
  check(edit.includes('id="stepsDrop"') && edit.includes('执行模块库') && edit.includes('data-act="toggleStep"') &&
        edit.includes('data-act="exportWf"') && edit.includes('data-act="resetWf"'),
    '编辑模式完整保留原步骤编排能力');

  T.S.wfEdit = 'ops';
  check(!T.viewWorkflows(false).includes('id="stepsDrop"'), '编辑状态只对对应项目生效');
  T.S.wfEdit = null; T.S.wf = 'apex';
} catch (e) { console.log('FAIL 查看编辑分离 → ' + e.message); fail++; }

/* 4b-3. 概览 · 身份卡内联编辑窗口（标题输入 / 多行正文 / 校验 / 字数统计 / 改名迁移） */
try {
  const w1 = T.DATA.projects[0];
  T.S.wf = w1.id; T.S.wfEdit = null; T.S.projEdit = null;

  /* 非编辑态：只有铅笔入口，不渲染任何表单控件 */
  const plain = T.projIdCardHTML(w1, null);
  check(plain.includes('data-act="openProjEdit"') && plain.includes('ov-edit-btn')
        && !plain.includes('<input') && !plain.includes('<textarea'),
    '身份卡非编辑态：有编辑入口、不渲染表单控件');
  check(plain.includes('ov-name') && plain.includes('ov-sub') && plain.includes('ov-summary'),
    '身份卡非编辑态：身份 / 描述 / 工作概况仍在（功能未改动）');

  /* 编辑态：整卡换成表单 */
  T.S.projEdit = w1.id;
  const editOv = T.projOverviewHTML(w1, T.preflight(w1));
  check(editOv.includes('id="peName"') && editOv.includes('id="peBody"') && editOv.includes('<textarea'),
    '编辑窗口含项目标题输入框 + 多行正文编辑区');
  check(editOv.includes('id="peNameCount"') && editOv.includes('id="peBodyCount"'),
    '编辑窗口含两个实时字数统计节点');
  check(editOv.includes('data-act="saveProjEdit"') && editOv.includes('data-act="closeProjEdit"')
        && editOv.includes('>保存<') && editOv.includes('>取消<'),
    '编辑窗口含保存与取消按钮');
  check(editOv.includes('class="req"')
        && editOv.includes('maxlength="' + T.PE_LIMIT.name + '"')
        && editOv.includes('maxlength="' + T.PE_LIMIT.body + '"'),
    '必填标记与长度上限就位（' + T.PE_LIMIT.name + ' / ' + T.PE_LIMIT.body + ' 字）');
  check(editOv.includes('>' + w1.name.length + '/' + T.PE_LIMIT.name + '<')
        && editOv.includes('>' + w1.desc.length + '/' + T.PE_LIMIT.body + '<'),
    '打开时字数统计与当前内容一致（初始不是 0）');
  check(!editOv.includes('工作概况'), '编辑态整卡替换：不残留只读时间线 / 工作概况');

  /* 校验：空值给出明确提示，且提示文案非空 */
  check(T.projEditCheck('', 'x').ok === false && T.projEditCheck('', 'x').err.name.length > 0,
    '标题为空 → 校验不通过并给出提示');
  check(T.projEditCheck('a', '   ').ok === false && T.projEditCheck('a', '   ').err.body.length > 0,
    '正文只有空白 → 按空处理并给出提示');
  check(T.projEditCheck(' 标题 ', ' 正文 ').name === '标题' && T.projEditCheck(' 标题 ', ' 正文 ').body === '正文',
    '保存前自动 trim 首尾空白');
  check(T.projEditCheck(undefined, null).ok === false, '空值入参（undefined / null）不抛异常，按空处理');
  check(T.projEditCheck('a', 'b').ok === true, '标题与正文都有内容 → 校验通过');

  /* 落库 + 改名迁移 + 还原 */
  const snap = { name: w1.name, desc: w1.desc, updated: w1.updated };
  const metaSnap = JSON.stringify(T.DATA.projMeta);
  const devSnap  = JSON.stringify(T.DATA.devContext);
  const newName = snap.name + '·改名';

  const r1 = T.applyProjEdit(w1.id, newName, '改后的正文');
  check(r1.ok && w1.name === newName && w1.desc === '改后的正文' && w1.updated === '刚刚',
    '保存写回标题 / 正文 / 更新时间');
  check(!!T.DATA.projMeta[newName] && !T.DATA.projMeta[snap.name]
        && !!T.DATA.devContext[newName] && !T.DATA.devContext[snap.name],
    '改名同步迁移按项目名索引的结构（projMeta / devContext）');
  check(T.S.acts.every(a => a.proj !== snap.name), '改名后活动流不再残留旧项目名');
  check(T.applyProjEdit(w1.id, T.DATA.projects[1].name, 'x').ok === false,
    '重名拦截：改成已有项目名被拒绝');
  check(T.applyProjEdit('__nope__', 'a', 'b').ok === false, '未知项目 id：不写数据、不抛异常');

  T.renameProjRefs(newName, snap.name);
  w1.name = snap.name; w1.desc = snap.desc; w1.updated = snap.updated;
  T.DATA.projMeta = JSON.parse(metaSnap);
  T.DATA.devContext = JSON.parse(devSnap);
  T.S.projEdit = null;

  /* 事件接线：三个动作 + 输入事件都在，否则 UI 点了没反应 */
  const appSrc = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  check(['openProjEdit','closeProjEdit','saveProjEdit'].every(a => appSrc.includes("case '" + a + "'")),
    '编辑窗口三个动作已接入事件委托 switch');
  check(appSrc.includes("e.target.id === 'peName'") && appSrc.includes('peSyncCount'),
    '输入事件已接入实时字数统计');
  const saveProjSeg = appSrc.slice(appSrc.indexOf('function saveProjEdit('), appSrc.indexOf('function peSyncCount('));
  check(saveProjSeg.includes("apiRequest(`/projects/${id}`") && saveProjSeg.includes("method:'PATCH'")
    && saveProjSeg.indexOf('apiRequest(') < saveProjSeg.indexOf('applyProjEdit('),
    '真实项目先经后端保存成功，再更新页面内存，刷新后名称和描述不回退');
} catch (e) { console.log('FAIL 项目编辑窗口 → ' + e.message); fail++; }

/* 4b-2. 项目页面区块骨架：概览 / 开发上下文 / 运行流程 / 设置（执行模块卡已并入运行流程） */
try {
  T.S.wf = 'apex'; T.S.wfEdit = null; T.S.running = null;
  const v = T.viewWorkflows(false);
  const secs = ['概览','开发上下文','运行流程','设置'].map(k => v.indexOf('board-title">' + k + '</span>'));
  check(secs.every(i => i > -1) && secs.every((x,i) => i===0 || x > secs[i-1]),
    '区块顺序：概览 → 开发上下文 → 运行流程 → 设置（执行模块区块已移除）');
  check(!v.includes('board-title">执行模块') && !v.includes('已绑定模块'),
    '「执行模块」卡与页面区块无残留');
  check(['文件数量','历史运行次数'].every(k => v.includes(k)), '项目统计字段齐全');
  check(['当前任务','项目任务','项目记录','Obsidian 项目资料','文件','复制 Agent 上下文'].every(k => v.includes(k)),
    '开发上下文区块六项齐全');
  check(v.includes('class="dev-cols"') && (v.match(/class="dev-col"/g) || []).length === 2,
    '开发上下文卡内部两栏布局（宽屏不留大段空白）');
  const devSec = v.slice(v.indexOf('board-title">开发上下文'), v.indexOf('board-title">运行流程'));
  check(!devSec.includes('引用 ') && !devSec.includes('关联 ') && !devSec.includes('b-slate">待办<') && !devSec.includes('b-slate">待修改<') && !devSec.includes('b-amber'),
    '开发上下文卡行内无徽章堆叠：每行只留标题 + 一个动作');
  check(devSec.includes('当前 / 高 / 中 / 低'), '项目任务区说明四种任务状态');
  check(v.includes('添加模块') && !v.includes('data-act="toggleStep"'),
    '「添加模块」入口保留（已迁入运行流程卡，查看模式无编辑控件）');
  check(v.includes('主流程') && v.includes('历史记录'), '运行流程区块：主流程 + 历史记录');
  const runSec = v.slice(v.indexOf('board-title">运行流程'), v.indexOf('board-title">设置'));
  check((runSec.match(/<section class="card/g) || []).length === 1 && runSec.includes('run-console')
    && runSec.includes('运行状态') && runSec.includes('toggleRunDetail'),
    '运行流程与运行状态已合并为单张卡（状态徽章 + 摘要 + 主流程 + 历史）');
  check(runSec.includes('data-act="editWf"') && runSec.includes('添加模块'),
    '「添加模块」入口位于运行流程卡头（原执行模块区块迁入）');
  check((runSec.match(/class="flow-node /g) || []).length === T.DATA.projects[0].steps.filter(s=>s.on).length
    && runSec.includes('flow-node idle') && !runSec.includes('flow-node now'),
    '主流程为线性流程视图：空闲态每步一个节点且全部未开始');
  check(v.includes('项目设置') && v.includes('删除项目') && !v.includes('危险操作'),
    '设置区块：项目设置卡 + 裸红色删除长条（标题与说明文字、白色卡片背景均已移除）');
  check(/<button class="danger-bar" data-act="projDeleteAsk"/.test(v),
    '删除项目为红色长条模块，点击进入预演 + 二次确认弹窗');
  const stickCss = require('fs').readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  check(v.includes('class="page-head stick"')
    && /\.page-head\.stick\{[^}]*position:sticky[^}]*z-index:20/.test(stickCss)
    && /\.page-head\.stick\{[^}]*border-radius:var\(--r-card\)/.test(stickCss)
    && /\.page-head\.stick\{[^}]*backdrop-filter/.test(stickCss),
    '项目页页头吸顶：悬浮圆角卡片（--r-card 圆角 + 毛玻璃 + z-index），右侧三按钮不跳动');
  check(/--term-bg:#2E3440/.test(stickCss) && /\.terminal\{[^}]*background:var\(--term-bg\)/.test(stickCss),
    '日志终端背景板为深板岩灰，且走 --term-bg 令牌（其他元素颜色不变）');
  check(!v.includes('data-v="storage"') && !v.includes('版本数量'), '项目详情不再保留版本入口或版本统计');
  check(!v.includes('guide-strip') && !v.includes('上手 3 步'), '「上手 3 步」引导条已移除（不再渲染）');
  const bare = Object.assign({}, T.DATA.projectTemplate, {id:'__probe3', name:'探针项目3'});
  check(T.projDevHTML(bare).includes('项目任务') && T.projDevHTML(bare).includes('Obsidian 项目资料'),
    '新项目也直接提供任务、记录与 Obsidian 入口');
  /* 选择页布局：卡片栅格（列数自适应，不写宽度断点） */
  const cssSrc = require('fs').readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  check(cssSrc.includes('--tile-min:290px') && cssSrc.includes('--board-gap:14px')
    && cssSrc.includes('--tile-pad:16px'),
    '选择页卡片令牌就位：列宽 --tile-min / 间距 --board-gap / 内边距 --tile-pad');
  check(!cssSrc.includes('.wf-tile') && !cssSrc.includes('.pjt-list') && !cssSrc.includes('.pjt-sub'),
    '旧磁贴样式与已废弃的层级列表样式都不残留（不留死代码）');
  check(cssSrc.includes('.pjt-board{') && cssSrc.includes('repeat(auto-fill,minmax(min(var(--tile-min),100%),1fr))')
    && cssSrc.includes('.pjt-acts{display:flex'),
    '卡片栅格自适应列数 + 操作条 flex-wrap 自然换行（无新增宽度断点）');
  /* 横向溢出防线：容器比 --tile-min 还窄时，轨道必须跟着缩，而不是撑破容器出横向滚动条 */
  check(!/minmax\(var\(--tile-min\),1fr\)/.test(cssSrc)
    && /minmax\(min\(var\(--tile-min\),100%\),1fr\)/.test(cssSrc),
    '栅格轨道下限用 min(--tile-min,100%) 兜底：容器更窄时轨道收缩，不撑出横向滚动条');
  check(/\.pjt-board\{[\s\S]{0,300}?overflow:hidden auto/.test(cssSrc),
    '卡片栅格横向禁滚、纵向可滚（overflow:hidden auto）');
  check(/\.pjt-chip\{[\s\S]{0,220}?min-width:0/.test(cssSrc),
    '长 chip 允许收缩（min-width:0）：窄卡里不会顶出卡片边界');
  check(/\.view\{[^}]*scrollbar-width:none/.test(cssSrc) && /\.view::-webkit-scrollbar\{display:none\}/.test(cssSrc),
    '页面侧边滚动条已隐藏（滚动能力保留，仅视觉去除）');
  check(/\.pjt-acts\{[^}]*min-width:0/.test(cssSrc),
    '操作条 min-width:0：窄卡里 flex-wrap 正常生效');
  check(/\.pjt-icons\{[^}]*flex-wrap:wrap/.test(cssSrc),
    '图标组允许换行：4 个定宽按钮不会顶住卡片最小宽度');
  check(!/\.icon-btns\{[^}]*flex:0 0 auto[^}]*\}/.test(cssSrc),
    '顶栏图标组可收缩换行：窄窗口下不再把主内容最小宽度顶到 400px 以上');
  check(!/@media\s*\(max-width:860px\)/.test(cssSrc),
    '未引入宽度断点：适配仍走「标准窗口 / 全屏」两态约定');
  T.S.wf = 'apex';
} catch (e) { console.log('FAIL 项目化骨架 → ' + e.message); fail++; }

/* 4c. 执行关系视觉归组：只根据现有 wait 做展示，不改数据与运行 */try {
  const w1 = T.DATA.projects[0];
  const w2 = T.DATA.projects[1];
  const w3 = T.DATA.projects[2];
  const f1 = T.wfFlowItems(w1.steps), f2 = T.wfFlowItems(w2.steps), f3 = T.wfFlowItems(w3.steps);
  check(f1.length === 1 && f1[0].members[0].ref === 'apex-launcher' && !f1[0].parallel,
    'apex 只保留 APEX 一键启动真实模块');
  check(f2.length === 3 && f2.filter(x => x.parallel).length === 2
    && f2[1].members.map(s => s.label).join(' / ') === 'Terminal / npm run dev', 'ops 深度开发 → 3 条，并行成员正确');
  check(f3.length === 3 && f3.every(x => !x.parallel), 'ai 日常助理 → 3 条，全部单步骤、不套组');

  T.S.wf = w1.id; T.S.wfEdit = w1.id; T.S.prepOpen = {}; T.S.runOpen = {};
  const edit = T.viewWorkflows(false);
  check(edit.includes('id="stepsDrop"') && (edit.match(/class="step"/g) || []).length === w1.steps.length,
    '编辑模式步骤仍为 .step，数量不变（数据顺序未破坏）');
  check((edit.match(/class="step-par"/g) || []).length === f1.filter(x => x.parallel).length,
    '.step-par 只包住真正的并行条目（单步骤不套组）');
  check(!edit.includes('等待前序'), '编辑模式不再出现「等待前序」旧术语');
  check((edit.match(/data-act="toggleWait"/g) || []).length === w1.steps.length - 1,
    '保留兼容入口：除第一步外每步仍有「与上一步并行」（原 toggleWait）');
  T.S.wfEdit = null;
} catch (e) { console.log('FAIL 执行关系视觉归组 → ' + e.message); fail++; }

/* 5. 五个资源分组 */
try {
  T.S.wf = 'apex'; T.S.wfEdit = 'apex';
  const tempModules = [
    {id:'__web',type:'web',ref:'https://example.com',name:'示例网页',desc:'',arg:''},
    {id:'__folder',type:'folder',ref:'D:/Example',name:'示例目录',desc:'',arg:''},
    {id:'__cmd',type:'cmd',ref:'example command',name:'示例命令',desc:'',arg:''}
  ];
  tempModules.forEach(m=>T.DATA.modules.push(m));
  ['app','web','folder','script','cmd'].forEach(k => {
    T.S.larderTab = k;
    check(T.viewWorkflows(false).includes('data-drag="' + k + '|'), '资源库分组：' + k);
  });
  T.DATA.modules.splice(T.DATA.modules.length-tempModules.length, tempModules.length);
  T.S.larderTab = 'app';
} catch (e) { console.log('FAIL 资源库 → ' + e.message); fail++; }

/* 5b. 右侧卡片已统一改名为「执行模块库」（原「资源库」） */
try {
  const html = T.viewWorkflows(false);
  check(html.includes('执行模块库') && !html.includes('资源库'), '卡片标题统一为「执行模块库」');
  check(html.includes('按类型筛选'), '卡片标题带「按类型筛选」副标');
  T.S.larderTab = 'web';
  check(T.viewWorkflows(false).includes('搜索执行模块'), '搜索框占位符已改为「搜索执行模块」');
  T.S.larderTab = 'app';
} catch (e) { console.log('FAIL 执行模块库 → ' + e.message); fail++; }

/* 5c. 网站模块可复用，不在创建时归属某个项目 */
try {
  T.S.larderTab = 'app';
  check(T.viewWorkflows(false).includes('li-pj" title="系统资源"'), '执行模块默认归属显示「系统资源」');
  T.S.larderTab = 'script';
  check(T.viewWorkflows(false).includes('li-pj" title="内置模块"'), 'APEX 清单显示为内置模块');
  T.DATA.modules.push({id:'__web',type:'web',ref:'https://example.com',name:'示例网页',desc:'',arg:'',builtIn:false});
  T.S.larderTab = 'web';
  check(T.viewWorkflows(false).includes('li-pj" title="可供项目使用"'), '网站模块标明可供项目复用');
  T.DATA.modules.pop();
  T.S.larderTab = 'app';
} catch (e) { console.log('FAIL 所属项目 → ' + e.message); fail++; }

/* 6. 资源条目：既有拖拽载荷，也有显式「添加」按钮 */
try {
  T.DATA.modules.push({id:'__web',type:'web',ref:'https://example.com',name:'示例网页',desc:'',arg:'',builtIn:false});
  T.S.larderTab = 'web';
  const html = T.viewWorkflows(false);
  check(html.includes('draggable="true"') && html.includes('data-act="addStep"'),
    '资源条目同时支持拖拽与「添加」');
  T.DATA.modules.pop();
  T.S.larderTab = 'app';
} catch (e) { console.log('FAIL 资源条目 → ' + e.message); fail++; }
T.S.wfEdit = null;

/* 7. 指令栏意图识别 */
try {
  ['启动晨间开工','恢复上次打开的网页','帮我看看今天该先做什么','收工归档'].forEach(q =>
    check(!T.aiZone(q), '指令识别为 AI 卡片："' + q + '"'));
  check(T.aiZone('chr'), '关键词走搜索："chr"');
  T.buildPalette('');
} catch (e) { console.log('FAIL 指令栏 → ' + e.message); fail++; }

/* 8. 语音：无 SpeechRecognition 时应降级到演示模式而不报错 */
try {
  T.startVoice();
  check(!!T.S.voiceText || T.S.voiceText === '', '语音降级到演示模式');
  T.stopVoice();
  check(true, 'stopVoice 正常');
} catch (e) { console.log('FAIL 语音 → ' + e.message); fail++; }

/* 9. 新增网页步骤（含指定插入位置） */
try {
  T.S.larderTab = 'web';
  T.addStep('https://linear.app', 'web', 0);
  const wf = T.DATA.projects.find(w => w.id === T.S.wf);
  check(wf.steps[0].ref === 'https://linear.app', '新增网页步骤插入到第 1 位');
  check(!('mem' in wf.steps[0]) && !('memory' in T.DATA),
    '网页记忆已整体移除：步骤不再带 mem 字段、DATA 不再有 memory');
} catch (e) { console.log('FAIL 新增步骤 → ' + e.message); fail++; }

/* 9b. 网页记忆已整体移除：页面不再渲染任何相关入口 */
try {
  const html = [T.viewHome(false), T.viewProjects(), T.viewWorkflows(false)].join('');
  const relics = ['网页记忆','openMemory','memDetail','restoreMem','toggleMem','clearMem','mem-card','memKeep']
    .filter(k => html.includes(k));
  check(relics.length === 0, '网页记忆已移除：页面不再渲染相关入口' + (relics.length ? '（残留：' + relics.join('/') + '）' : ''));
} catch (e) { console.log('FAIL 网页记忆移除 → ' + e.message); fail++; }

/* 10. 术语检查：不应再出现生活化表达 */
try {
  const html = ['viewHome','viewWorkflows','viewModules','viewApps'].map(p => T[p](false)).join('');
  const bad = ['菜谱','备菜','食材','开火','烹饪'].filter(w => html.includes(w));
  check(bad.length === 0, '界面文案已统一为专业术语' + (bad.length ? '（残留：' + bad.join('/') + '）' : ''));
} catch (e) { console.log('FAIL 术语检查 → ' + e.message); fail++; }

/* 11. 恢复默认：快照存在且可回填 */
try {
  check(T.WF_SEED.length === T.DATA.projects.length, '恢复默认快照可用（' + T.WF_SEED.length + ' 个项目）');
} catch (e) { console.log('FAIL 快照 → ' + e.message); fail++; }

/* 12. 信息密度：应用 / 文件 都做了「常用优先 + 折叠」 */
try {
  const apps = T.viewApps();
  const favN = (apps.match(/class="fav-card"/g) || []).length;
  check(favN === 6, '应用页：最近打开固定 6 张（实际 ' + favN + '）');
  check(apps.includes('<span class="board-title">最近打开的应用</span>') && !apps.includes('按最近打开时间倒序'),
    '应用页板块标题为「最近打开的应用」（说明文字已移除，排序仍按打开时刻、与置顶解耦）');
  /* 15a. A-Z 分组 + 悬浮字母索引条（原「展开其余」折叠改由容器内部滚动承载） */
  check(!apps.includes('展开其余'), '全部应用不再折叠「展开其余」——改由列表容器内部滚动承载');
  check(apps.includes('class="app-group"') && apps.includes('id="appScroll"') && apps.includes('id="alphaBar"'),
    '全部应用默认按首字母 A-Z 分组 + 悬浮字母索引条 + 内部滚动容器');
  check(T.alphaOf('VS Code') === 'V' && T.alphaOf('微信') === '#' && T.alphaOf('7-Zip') === '#' && T.alphaOf('  notion ') === 'N',
    '首字母归类：拉丁字母取首字母；中文 / 数字 / 符号开头统一进 # 分组');
  const groupKeys = [...apps.matchAll(/class="app-group" data-k="([^"]+)"/g)].map(m => m[1]);
  check(groupKeys.length > 0 && groupKeys[groupKeys.length - 1] === '#' &&
    !groupKeys.slice(0, -1).some((k, i, arr) => i < arr.length - 1 && k > arr[i + 1]),
    '分组顺序：A-Z 升序在前、# 恒排最后（' + groupKeys.join('') + '）');
  const barItems = [...apps.matchAll(/data-act="alphaJump" data-v="([^"]+)"/g)].map(m => m[1]);
  check(barItems.length === groupKeys.length && barItems.every(k => groupKeys.includes(k)),
    '索引条只列有内容的分组字母（' + barItems.join(' · ') + '）');
  check(apps.includes('class="alpha-pin') && apps.includes('data-act="favOnly"'),
    '索引条顶部为置顶图标，承担原「常用优先」开关');
  check(!apps.includes('class="cat-chip'), '工具栏旧「常用优先」按钮已移除（功能迁至索引条顶部置顶图标）');
  const g2 = T.groupByAlpha([{name:'Zed'},{name:'Atom'},{name:'微信'},{name:'7-Zip'}]);
  check(g2.length === 3 && g2.map(x=>x.k).join('') === 'AZ#' && g2[0].items[0].name === 'Atom' && g2[2].items.length === 2,
    '分组规则：A-Z 升序、# 组恒居最后（中文 / 数字开头同归 #）');
  check(T.groupByAlpha([{name:'Zed'},{name:'Zap'}])[0].items.map(a=>a.name).join(',') === 'Zap,Zed',
    '分组内按名称升序排列');
  check(T.fuzzyMatch('VS Code','vscde') && !T.fuzzyMatch('网易云音乐','wyy'),
    '应用搜索为模糊匹配（容忍漏字，非子序列不误命中）');
  check(apps.includes('data-act="appView"') && apps.includes('data-act="editTag"'),
    '应用页有 列表/网格 切换与行内快捷操作');
  T.S.appView = 'grid';
  const gridHtml = T.viewApps();
  check(gridHtml.includes('data-act="appMenu"'), '网格视图 tile 有 ··· 快捷菜单');
  check(/class="tile-btn tile-launch"[^>]*data-act="launch"/.test(gridHtml) && !/<button class="app-tile/.test(gridHtml),
    '网格 tile 同样只由独立「启动」按钮触发（模块整体不再启动）');
  T.S.appView = 'list';
  /* 行内直出启动按钮 + 置顶/编辑标签/剔除 三个快捷操作（无三点菜单） */
  check(apps.includes('ar-launch') && apps.includes('data-act="editTag"') && apps.includes('data-act="askRemove"')
    && apps.includes('icon-mini pin') && !apps.includes('>···</button>'),
    '全部应用行：启动按钮 + 置顶/编辑标签/剔除 三快捷操作，无三点菜单');
  check(apps.includes('ar-tag') && apps.includes('badge b-slate ar-tag'),
    '标签显示在应用名称后面');
  /* 启动交互：模块整体（行卡片）不再触发启动，只有行内「启动」按钮是启动入口 */
  const rowAttrs = [...apps.matchAll(/<div class="app-row"([^>]*)>/g)].map(m => m[1]);
  check(rowAttrs.length > 0 && rowAttrs.every(a => !a.includes('data-act')),
    '全部应用行不再整块触发启动（仅行内「启动」按钮可启动，' + rowAttrs.length + ' 行）');
  /* 模糊搜索匹配标签：搜「娱乐」只命中娱乐类应用行（名称本身不含「娱乐」） */
  T.S.appQuery = '娱乐';
  const byTag = T.viewApps();
  const hitRows = (byTag.match(/ar-launch/g) || []).length;
  check(byTag.includes('>Steam<') && hitRows === 9,
    '模糊搜索同时匹配标签内容（「娱乐」命中 9 行，实际 ' + hitRows + '）');
  T.S.appQuery = '';
  /* 常用优先开关：单个 toggle，开启后列表严格只显示置顶为常用的应用（不混入未置顶） */
  check(apps.includes('data-act="favOnly"') && !apps.includes('data-act="appSort"') && !apps.includes('>最近启动<'),
    '排序已简化为单个「常用优先」开关（无「最近启动」按钮）');
  check(apps.includes('>全部应用</span>') && !apps.includes('按首字母 A-Z 分组'),
    '「全部应用」标题保留、旁边只留数量统计（「· 按首字母 A-Z 分组」描述已移除）');
  check(apps.indexOf('id="appSearch"') > apps.indexOf('board-note'),
    '搜索框位于统计文案行右侧（不在页头）');
  /* 计数不重复：页头副标题已删，应用总数只在「全部应用」旁出现一次 */
  const totalOcc = (apps.match(new RegExp(T.S.apps.length + ' 个', 'g')) || []).length;
  check(totalOcc === 1 && !apps.includes('上方为最近打开的应用'),
    '应用页总数只在「全部应用」旁出现一次（不重复计数，实际 ' + totalOcc + ' 次）');
  T.S.favOnly = true;
  const favHtml = T.viewApps();
  const favNames = [...favHtml.matchAll(/ar-name">([^<]+)/g)].map(m => m[1].trim());
  const commonNames = T.S.apps.filter(a => a.st === '常用').map(a => a.name);
  check(favNames.length === commonNames.length && favNames.every(n => commonNames.includes(n)),
    '常用优先开启：恰好全部常用应用（' + commonNames.length + ' 个），无未置顶混入');
  T.S.favOnly = false;
  const allN = [...T.viewApps().matchAll(/ar-name">/g)].length;
  check(allN === T.S.apps.length,
    '关闭开关恢复全部应用（' + allN + ' 个）');
  /* 剔除二次确认：askRemove 态渲染预演弹窗 */
  T.S.confirmRemove = T.S.apps[0].id;
  const confirmHtml = T.viewApps();
  check(confirmHtml.includes('modal') && confirmHtml.includes('预演') && confirmHtml.includes('确认剔除') && confirmHtml.includes('不会删除其安装目录'),
    '剔除走二次确认弹窗（含预演说明）');
  T.S.confirmRemove = '';
  /* 首页：项目仪表盘只保留项目数据，不重复应用页入口。 */
  const home = T.viewHome();
  check(home.includes('项目仪表盘') && home.includes('活跃度') && !home.includes('最近打开的应用'),
    '首页改为项目仪表盘，不再重复应用入口');
  const projectRows = (home.match(/class="dashboard-project-row/g) || []).length;
  check(projectRows === T.DATA.projects.length, '仪表盘按项目呈现总览行（实际 ' + projectRows + '）');
  /* 中文输入法：三个搜索框（应用 / 扫描添加 / 模块）都有 composition 门控 + 防抖（源码级断言） */
  const src = require('fs').readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  check(src.includes("addEventListener('compositionstart'") && src.includes('imeState[e.target.id] || e.isComposing')
    && src.includes("const SEARCH_IDS = ['appSearch','scanSearch','modSearch']") && src.includes('searchDebounce[id] = setTimeout'),
    '三个搜索框有中文输入法门控 + 150ms 输入防抖（规格一致）');
  /* 最近打开板块：按真实打开时刻倒序、与置顶解耦、启动即时刷新 */
  check(src.includes('lastTs = Date.now()') && src.includes('(b.lastTs || 0) - (a.lastTs || 0)'),
    'launch 记录真实打开时刻，最近打开按其倒序（不再是静态 ts 清零）');
  const favSeq = () => [...T.viewApps().matchAll(/fav-name">([^<]+)/g)].map(m => m[1].trim());
  const favBefore = favSeq();
  const outsider = T.S.apps.find(a => a.st !== '常用' && !a.lastTs);
  check(!!outsider && !favBefore.includes(outsider.name), '存在从未启动的未置顶应用（探针前置）');
  T.launch(outsider.id);
  const favAfter = favSeq();
  check(favAfter[0] === outsider.name,
    '打开应用立即进入「最近打开」首位（' + favBefore[0] + ' → ' + favAfter[0] + '）');
  const stBackup = T.S.apps.map(a => a.st);
  T.S.apps.forEach(a => { a.st = ''; });
  check(JSON.stringify(favSeq()) === JSON.stringify(favAfter),
    '取消全部置顶不影响「最近打开」（不再沿用全部应用列表的排序结果）');
  T.S.apps.forEach((a,i) => { a.st = stBackup[i]; });
} catch (e) { console.log('FAIL 信息密度 → ' + e.message); fail++; }

/* 15a-2. 应用列表：物理惯性滚动（自管 transform 位移，替代原生滚动） */
try {
  const srcR = require('fs').readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const cssR = require('fs').readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  const appsR = T.viewApps();
  check(appsR.includes('app-scroll-inner') && appsR.includes('id="appScrollBar"'),
    '列表含 transform 位移层与自绘滚动指示条');
  check(/launchGain:\s*1\.0\d/.test(srcR), '松手初速度 = 手指末速度 × 1.0~1.1（当前 1.02）');
  check(/v = \(s\[n-1\]\.y - s\[0\]\.y\) \/ dt/.test(srcR) && !/-\(s\[n-1\]\.y/.test(srcR),
    '松手速度与拖动同向（ΔclientY 不取负，惯性不再反向）');
  check(/maxLaunch:\s*\d{4}/.test(srcR) && /wheelSpin:\s*1\.\d/.test(srcR) && !/-d \* 14/.test(srcR),
    '初速度有上限 + 滚轮系数令牌化（原 ×14 过大已移除）');
  check(/decayK:\s*1\.\d/.test(srcR) && srcR.includes('Math.exp(-INERTIA.decayK * dt)'),
    '惯性滑行 = 指数衰减 v·e^(-k·dt)（k=1.35/s，规格 0.8~1.5，取大值减速更快）');
  check(/minSpeed:\s*(?:[5-9]|10)\b/.test(srcR), '低速阈值 8px/s（规格 5~10）→ 交给 spring 收尾');
  check(/stiffness:\s*(?:1[89]\d|2[0-5]\d)/.test(srcR) && /damping:\s*(?:2[2-9]|30)\b/.test(srcR),
    '边缘回弹 spring：stiffness 220 / damping 26（规格 180~260 / 22~30）');
  check(/maxFlungMs:\s*[234]\d{3}/.test(srcR), '惯性最长滑行 4000ms（规格 2~4s 缓慢停止）');
  check(!/scroll-snap/.test(cssR), '无逐项吸附对齐（未使用 scroll-snap，视觉连续）');
  check(cssR.includes('touch-action:none'), '拖动由自管物理接管（touch-action:none）');
  check(/\.app-scroll\{[\s\S]*?overflow:hidden/.test(cssR), '容器脱离原生滚动（overflow:hidden）');
  check(cssR.includes(':has(.app-scroll.is-scrolling)'), '滚动期间禁用玻璃模糊（防掉帧）');
  check(/translate3d/.test(srcR), '位移只写 transform（合成层，不触发布局）');
  check(T.appScrollDragBlocked({closest:() => ({})}) === true
    && T.appScrollDragBlocked({closest:() => null}) === false,
    '按钮等交互控件不进入拖动捕获，列表空白区域仍可拖动');
} catch (e) { console.log('FAIL 物理滚动 → ' + e.message); fail++; }

/* 15b. 添加应用：真实扫描 → 选择 → 命名确认；快捷菜单含全套操作 */
try {
  T.S.addName=''; T.S.addCat='';
  T.S.addStep='form'; T.S.addPick=''; T.S.scanQuery='';
  T.S.scanApps = [
    {id:'scan-warp',name:'Warp',cat:'开发',icon:'terminal',added:false},
    {id:'scan-linear',name:'Linear',cat:'效率',icon:'notion',added:false}
  ];
  T.S.scanLoading=false; T.S.scanError='';
  const form = T.addApp();
  check(form.includes('添加本机应用') && form.includes('识别 Windows 本机可启动应用')
    && !form.includes('data-act="createApp"') && !form.includes('data-act="addNewCat"'),
    '添加应用只接受真实扫描结果，不再创建无法启动的自定义假应用');
  check(form.includes('id="scanSearch"') && form.includes('data-act="pickScan"') && !form.includes('data-act="doAdd"'),
    '扫描结果：搜索框 + 点行选中（不再有行内直接「添加」按钮）');
  check(form.includes('data-act="refreshAppScan"') && form.includes('2 个可启动应用'),
    '扫描弹窗显示真实结果数量并允许重新扫描');
  check(T.appIconHTML('native:scan-demo').includes('native-app-icon')
    && T.appIconHTML('native:scan-demo').includes('/api/applications/scan/scan-demo/icon'),
    '真实扫描应用使用 Windows 原生图标地址，而非名称猜测图标');
  check(form.includes('id="scanAppList"') && form.includes('class="app-picker-actions"')
    && form.includes('选择一个应用后继续'),
    '扫描结果独立滚动，底部选择状态与操作区始终留在弹窗内');
  const menu = T.appPopMenu({getBoundingClientRect:()=>({right:800,bottom:100})}, T.S.apps[0].id);
  check(menu && menu.includes('data-act="launch"') && menu.includes('data-act="toggleAppPin"')
    && menu.includes('data-act="editTag"') && menu.includes('data-act="appDetail"') && menu.includes('data-act="askRemove"'),
    '网格 ··· 快捷菜单：启动/置顶/编辑标签/详情/剔除');
  /* 编辑标签浮层：列出现有标签 + 新建并应用 */
  const tp = T.tagPop({getBoundingClientRect:()=>({right:800,bottom:100})}, T.S.apps[0].id);
  check(tp && tp.includes('data-act="setCat"') && tp.includes('newTagInput') && tp.includes('data-act="newCatFor"'),
    '编辑标签浮层：点选切换 + 新建并应用');
  /* 扫描列表搜索：模糊匹配 + 空结果提示（与外部搜索框同一套 fuzzyMatch） */
  ctx.__stubVals = {'#appName':''};
  T.S.scanQuery = 'ln';
  const filtered = T.addApp();
  check(filtered.includes('>Linear<') && !filtered.includes('>Warp<'), '扫描列表实时模糊搜索（「ln」只命中 Linear）');
  T.S.scanQuery = 'zzz';
  check(T.addApp().includes('没有匹配的应用'), '扫描列表空结果提示与外部规格一致');
  T.S.scanQuery = '';
  /* 两步流程：选中 → 添加（尚未入库）→ 命名确认 → 未改名则沿用原始名称 */
  T.pickScan('scan-warp');
  check(T.S.addPick === 'scan-warp' && T.S.addStep === 'form', '扫描结果点选只做选中，不直接添加');
  const beforeN = T.S.apps.length;
  T.beginAdd();
  check(T.S.addStep === 'confirm' && T.S.apps.length === beforeN, '点「添加」进入命名确认，应用尚未入库');
  const confirmHtml = T.addApp();
  check(confirmHtml.includes('命名确认') && confirmHtml.includes('data-act="createFromScan"') && confirmHtml.includes('data-act="backToAdd"'),
    '命名确认步骤：可返回选择、确认添加');
  T.createFromScan();
  check(T.S.apps.length === beforeN, '后端不可用时不伪造添加成功');
  T.S.addStep='form'; T.S.addPick='';
  /* 改名字段仍只在真实扫描项的确认步骤出现 */
  T.pickScan('scan-linear'); T.beginAdd();
  ctx.__stubVals = {'#appName':'我的任务板'};
  const renamed = T.addApp();
  check(renamed.includes('value="我的任务板"') || renamed.includes('value="Linear"'),
    '命名确认允许修改真实应用的显示名称');
  const appSrc15 = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const appCss15 = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  check(appSrc15.includes("apiRequest('/applications/from-scan'") && !appSrc15.includes('const ADD_POOL'),
    '确认添加提交扫描标识给后端，生产代码不再含假扫描池');
  check(appSrc15.includes("openModal(html, { form:true, appPicker:true })")
    && appSrc15.includes('list.scrollTop = Number(S.scanScroll) || 0')
    && /\.note-modal\.app-picker\{overflow:hidden\}/.test(appCss15)
    && /\.app-picker-list\{[^}]*overflow:hidden auto/.test(appCss15),
    '长扫描列表只滚动内容区，操作栏固定可见，点选与返回保持原滚动位置');
  ctx.__stubVals = null;
  T.S.addStep='form'; T.S.addPick=''; T.S.scanQuery='';
} catch (e) { console.log('FAIL 添加应用/快捷菜单 → ' + e.message); fail++; }

/* 16. 首页不再平铺应用或全局条目 */
try {
  const home = T.viewHome();
  check(home.includes('dashboard-project-list') && !home.includes('class="apps"'), '首页项目总览替代重复的应用快捷启动');
  check(home.includes('dashboard-activity-list') && !home.includes('展开其余'), '首页最近活动以紧凑项目追踪呈现，不再留展开空白');
} catch (e) { console.log('FAIL 首页密度 → ' + e.message); fail++; }

/* 17. 生产源码不再附带假应用 */
try {
  const appSrc = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  check(T.DATA.apps.length === 0 && appSrc.includes('apps: []') && !appSrc.includes('const APP_USAGE'),
    '应用种子与静态使用次数已移除，生产列表只来自后端真实数据');
} catch (e) { console.log('FAIL 排序 → ' + e.message); fail++; }

/* 18. Obsidian：设置连接 + 项目绑定 + 打开 / 新建 / 单向更新（不伪造同步） */
try {
  T.S.startupEnabled = true; T.S.startupRegistered = true; T.S.startupApproved = true;
  T.S.startupLoading = false; T.S.startupUpdating = false; T.S.startupError = '';
  const settings = T.viewSettings();
  const startupSrc = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  check(settings.includes('开机自启动') && settings.includes('登录系统后自动打开 APEX 总控台窗口')
    && settings.includes('class="switch on"') && !settings.includes('开机自启动已开启'),
    '开机自启动显示后端读回状态，不再只展示前端假成功提示');
  /* 后端把「注册了没」（registered）和「Windows 允许它启动吗」（approved）分开回答：
     只认 enabled 的话，被任务管理器禁用时开关仍是绿的 —— 那是假绿。 */
  T.applyStartupState({ enabled: false, registered: true, approved: false });
  check(T.S.startupEnabled === false && T.viewSettings().includes('已被 Windows 任务管理器的启动项开关禁用'),
    '启动项被任务管理器禁用时开关不显示假绿，并说清该去哪儿恢复');
  T.applyStartupState({ enabled: true, registered: true, approved: true });
  check(T.S.startupEnabled === true && T.S.startupApproved === true
    && T.viewSettings().includes('登录系统后自动打开 APEX 总控台窗口'),
    'Windows 侧为启用态时开关如实点亮');
  check(startupSrc.includes("apiRequest('/settings/startup')")
    && startupSrc.includes("apiRequest('/settings/startup', {method:'PUT'")
    && startupSrc.includes('startupRegistered') && startupSrc.includes('startupApproved')
    && startupSrc.includes('updateStartupSetting(S.startupEnabled !== true)'),
    '开机自启动开关读取并更新真实后端启动项（含 Windows 侧禁用状态），不再只切换 CSS 类');
  check(settings.includes('Obsidian 连接') && settings.includes('打开、新建与单向更新项目主页'),
    '设置页说明当前只提供 URI 打开、新建与单向更新');
  check(settings.includes('本机保存'), '设置页明确 Obsidian 配置会保存在当前浏览器本机');
  check(settings.includes('id="obsVault"') && settings.includes('id="obsFolder"'),
    '连接卡可填写仓库名称与项目资料目录');
  check(settings.includes('data-act="obsidianSave"') && settings.includes('data-act="obsidianTest"'),
    '连接卡提供保存设置与测试连接入口');
  check(!settings.includes('Obsidian：已连接') && settings.includes('需要你在 Obsidian 中确认'),
    '浏览器无法回读外部应用状态时不伪造“已连接”');

  const apex = T.DATA.projects.find(p => p.id === 'apex');
  const ai = T.DATA.projects.find(p => p.id === 'ai');
  const projDev = T.projDevHTML(apex);
  const projSettings = T.projSettingsHTML(apex);
  check(projDev.includes('Obsidian 项目资料') && projDev.includes('项目资料中枢')
    && projDev.includes('class="obs-node obs-source"') && projDev.includes('class="obs-node obs-target"')
    && projDev.includes('data-obs-state="路径已保存"'),
    '项目开发上下文用左右端点与连接线呈现 Obsidian 资料中枢');
  check(projDev.includes('data-act="obsidianOpenProject"') && projDev.includes('data-act="obsidianHubToggle"')
    && !projDev.includes('id="obsProjectPath"') && !projDev.includes('data-act="obsidianUpdateAsk"'),
    '已保存路径的默认态只保留一次点击打开主页与一个管理入口');

  delete T.S.obsidian.bindings.ai;
  T.S.obsidianHubOpen = ''; T.S.obsidianBindEdit = '';
  const unboundDev = T.projDevHTML(ai);
  check(unboundDev.includes('data-obs-state="待连接"') && unboundDev.includes('data-act="obsidianConnect"')
    && !unboundDev.includes('obsidianHubToggle') && !unboundDev.includes('id="obsProjectPath"'),
    '未绑定默认态只显示连接项目主页这一个下一步');
  T.S.obsidianHubOpen = 'ai'; T.S.obsidianBindEdit = 'ai';
  const bindDev = T.projDevHTML(ai);
  check(bindDev.includes('id="obsProjectPath"') && bindDev.includes('保存已有路径')
    && bindDev.includes('新建主页') && !bindDev.includes('>取消<'),
    '连接设置展开后才显示路径，并明确保存路径不会验证页面');

  T.S.obsidianHubOpen = 'apex'; T.S.obsidianBindEdit = '';
  const manageDev = T.projDevHTML(apex);
  check(['obsidianUpdateAsk','obsidianChange'].every(a => manageDev.includes(`data-act="${a}"`))
    && manageDev.includes('写入项目资料') && manageDev.includes('连接设置'),
    '一级管理区只保留写入项目资料与连接设置');
  check(!manageDev.includes('更新主页') && !manageDev.includes('更换主页')
    && !manageDev.includes('解除绑定') && !manageDev.includes('>收起<')
    && !manageDev.includes('class="obs-scope"'),
    '一级管理区移除相似动作、装饰标签与额外收起按钮');
  check(!projDev.includes('data-act="obsidianUpdateProject"'),
    '未确认时不渲染最终覆盖写入动作');
  T.S.obsidianHubOpen = 'apex'; T.S.obsidianUpdateArm = 'apex';
  const armedDev = T.projDevHTML(apex);
  check(armedDev.includes('写入前预演') && armedDev.includes('确认后将覆盖这个路径的页面全文')
    && armedDev.includes('目标仓库') && armedDev.includes('文件路径') && armedDev.includes('写入内容')
    && armedDev.includes('data-act="obsidianUpdateCancel"')
    && armedDev.includes('data-act="obsidianUpdateProject"'),
    '写入项目资料前先在卡内显示目标与覆盖范围，再提供第二次确认');
  T.S.obsidianUpdateArm = '';
  T.S.obsidianUnbindArm = 'apex';
  const unbindDev = T.projDevHTML(apex);
  check(unbindDev.includes('解除连接预演') && unbindDev.includes('不删除仓库文件')
    && unbindDev.includes('data-act="obsidianUnbindCancel"')
    && unbindDev.includes('data-act="obsidianUnbindProject"'),
    '解除连接先预演影响，再提供第二次确认');
  T.S.obsidianUnbindArm = ''; T.S.obsidianHubOpen = ''; T.S.obsidianBindEdit = '';

  const configuredVault = T.S.obsidian.vault;
  T.S.obsidian.vault = '';
  const unconfiguredDev = T.projDevHTML(ai);
  check(unconfiguredDev.includes('data-obs-state="未配置"')
    && unconfiguredDev.includes('data-act="goPage"') && unconfiguredDev.includes('data-v="settings"'),
    '未配置仓库时资料中枢只引导前往设置');
  T.S.obsidian.vault = configuredVault;
  check(!projSettings.includes('Obsidian 项目主页') && !projSettings.includes('id="obsProjectPath"'),
    'Obsidian 项目功能已从项目设置移入开发上下文');

  const uri = T.obsidianUri('open', {vault:'Codex学习', file:'Codex学习/项目 A'});
  check(uri.startsWith('obsidian://open?') && uri.includes('vault=Codex%E5%AD%A6%E4%B9%A0')
    && uri.includes('file=Codex%E5%AD%A6%E4%B9%A0%2F%E9%A1%B9%E7%9B%AE%20A'),
    'Obsidian URI 对中文、空格与路径分隔符正确编码');
  check(T.cleanObsidianPath('\\项目\\APEX Console\\') === '项目/APEX Console',
    '项目笔记路径统一为仓库内正斜杠格式');

  const oldObs = JSON.parse(JSON.stringify(T.S.obsidian));
  ctx.__stubVals = {'#obsVault':'验收仓库', '#obsFolder':'项目\\资料'};
  check(T.readObsidianSettings() === true && T.S.obsidian.vault === '验收仓库'
    && T.S.obsidian.projectFolder === '项目/资料',
    '保存连接设置会写入当前前端状态');
  ctx.__stubVals = {'#obsProjectPath':'项目\\APEX 主页'};
  check(T.bindObsidianProject('apex') === true && T.S.obsidian.bindings.apex === '项目/APEX 主页',
    '项目绑定按稳定项目 id 保存，不依赖项目名称');
  const savedPathDev = T.projDevHTML(apex);
  check(savedPathDev.includes('路径已保存') && !savedPathDev.includes('已绑定'),
    '仅保存路径时不伪报已识别或已绑定 Obsidian 主页');
  const persisted = JSON.parse(storageData[T.OBSIDIAN_STORE_KEY]);
  check(persisted.vault === '验收仓库' && persisted.projectFolder === '项目/资料'
    && persisted.bindings.apex === '项目/APEX 主页',
    '仓库名、项目目录与项目绑定会保存到浏览器本机');
  check(Object.keys(persisted).sort().join(',') === 'bindings,projectFolder,vault'
    && !JSON.stringify(persisted).includes('obsidianUpdateArm'),
    '本机存储只包含 Obsidian 配置，不包含任务、记录或临时确认状态');
  ctx.location.href = '';
  check(T.openObsidianProject('apex') === true && ctx.location.href.startsWith('obsidian://open?')
    && ctx.location.href.includes('file=%E9%A1%B9%E7%9B%AE%2FAPEX%20%E4%B8%BB%E9%A1%B5'),
    '打开项目笔记会发起准确的 obsidian:// 请求');
  const note = T.obsidianProjectNote(apex);
  check(note.includes('project_id: apex') && note.includes('# APEX Automation')
    && note.includes('## 项目任务') && note.includes('## 项目记录'),
    '项目主页内容带稳定项目 id 与任务 / 记录结构');
  check(note.includes('完善自动化脚本的异常处理') && note.includes('APEX 架构备忘')
    && note.includes('状态：') && !note.includes('完成度：'),
    '项目主页汇总当前状态、任务和项目记录，不写项目完成百分比');
  check(note.includes('[返回 APEX 控制台当前项目](')
    && note.includes('#/workflows/apex?focus=obsidian'),
    '项目主页写入返回当前项目的稳定链接');

  const deepRoute = T.parseAppRoute('#/workflows/apex?focus=obsidian');
  check(deepRoute && deepRoute.page === 'workflows' && deepRoute.wf === 'apex' && deepRoute.focus === 'obsidian',
    '项目深链接可解析项目 id 与 Obsidian 返回定位');
  T.S.page = 'home'; T.S.wf = 'ai'; T.S.obsidianReturnFocus = '';
  check(T.applyAppRoute('#/workflows/apex?focus=obsidian') === true
    && T.S.page === 'workflows' && T.S.wf === 'apex' && T.S.obsidianReturnFocus === 'apex',
    '打开返回链接会恢复对应项目并标记资料中枢定位');
  T.S.obsidianReturnFocus = '';
  ctx.location.href = '';
  check(T.updateObsidianProject('apex') === false && ctx.location.href === '',
    '未经过二次确认时拒绝覆盖写入');
  T.S.obsidianUpdateArm = 'apex';
  check(T.updateObsidianProject('apex') === true
    && ctx.location.href.startsWith('obsidian://new?')
    && ctx.location.href.includes('overwrite=true')
    && ctx.location.href.includes('content='),
    '确认后通过官方 overwrite 参数单向更新绑定主页');
  check(T.S.obsidianUpdateArm === '', '发出更新请求后自动清除二次确认状态');

  storageData[T.OBSIDIAN_STORE_KEY] = JSON.stringify({
    vault:' 刷新后仓库 ', projectFolder:'项目\\资料\\',
    bindings:{apex:'项目\\APEX 持久主页\\', missing:'项目/已删除项目'}
  });
  T.S.obsidian = {vault:'临时值', projectFolder:'', bindings:{}};
  check(T.loadObsidianState() === true && T.S.obsidian.vault === '刷新后仓库'
    && T.S.obsidian.projectFolder === '项目/资料'
    && T.S.obsidian.bindings.apex === '项目/APEX 持久主页'
    && !T.S.obsidian.bindings.missing,
    '页面启动时恢复并清理本机 Obsidian 配置，已不存在项目的绑定不会带回');
  const beforeBrokenLoad = JSON.stringify(T.S.obsidian);
  storageData[T.OBSIDIAN_STORE_KEY] = '{broken';
  check(T.loadObsidianState() === false && JSON.stringify(T.S.obsidian) === beforeBrokenLoad,
    '本机配置损坏时安全忽略，不覆盖当前状态或阻断页面');
  T.S.obsidianUnbindArm = '';
  check(T.unbindObsidianProject('apex') === false && !!T.S.obsidian.bindings.apex,
    '解除绑定未经过预演时拒绝删除连接');
  check(T.armObsidianUnbind('apex') === true && T.S.obsidianUnbindArm === 'apex'
    && T.unbindObsidianProject('apex') === true && !T.S.obsidian.bindings.apex,
    '解除绑定经过预演与第二次确认后只移除项目连接');
  T.S.obsidian = oldObs;
  T.S.obsidianHubOpen = ''; T.S.obsidianBindEdit = ''; T.S.obsidianUpdateArm = '';
  T.S.obsidianUnbindArm = ''; T.S.obsidianReturnFocus = '';
  T.S.startupEnabled = null; T.S.startupRegistered = null; T.S.startupApproved = null;
  delete storageData[T.OBSIDIAN_STORE_KEY];
  delete ctx.__stubVals;

  const appSrcObs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  check(['obsidianSave','obsidianTest','obsidianHubToggle','obsidianConnect','obsidianChange',
    'obsidianBind','obsidianOpenProject','obsidianNewProject','obsidianUpdateAsk','obsidianUpdateCancel',
    'obsidianUpdateProject','obsidianUnbindAsk','obsidianUnbindCancel','obsidianUnbindProject']
    .every(a => appSrcObs.includes(`case '${a}'`)),
    'Obsidian 中枢卡全部动作均接入全局事件委托');
  const obsCss = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  const obsCssBlock = obsCss.slice(obsCss.indexOf('.obs-hub{'), obsCss.indexOf('/* 任务区域看板'));
  check(obsCss.includes('--motion-press:140ms') && obsCss.includes('--motion-panel:200ms')
    && obsCssBlock.includes('transform var(--motion-press) var(--ease-out)')
    && obsCssBlock.includes('animation:obsPanelIn var(--motion-panel) var(--ease-out)'),
    '资料中枢按压与卡内展开使用统一动效令牌');
  check(obsCss.includes('@media (hover:hover) and (pointer:fine)')
    && obsCss.includes('@media (prefers-reduced-motion:reduce)')
    && obsCss.includes('.obs-hub-panel{animation-name:obsFade'),
    '资料中枢动效包含精细指针门控与减少动态效果降级');
  check(!/transition\s*:\s*all/.test(obsCssBlock) && !/\b(?:width|height|margin|padding|top|left)\s+var\(--motion/.test(obsCssBlock),
    '资料中枢动效不使用 transition all，也不动画布局属性');
  check(appSrcObs.includes('delete S.obsidian.bindings[id]'),
    '删除项目时同步清理其 Obsidian 绑定，不留下悬空配置');
  check(appSrcObs.includes('(function init(){\n  loadObsidianState();')
    && appSrcObs.includes('delete S.obsidian.bindings[id];\n  persistObsidianState();'),
    '启动时恢复配置，删除项目时同步更新本机绑定');
} catch (e) { console.log('FAIL Obsidian 连接 → ' + e.message); fail++; }

/* 18d. 各模块副标题不再含说明句，只剩状态数字 */
try {
  const cases = [
    {p:'viewHome',     must: ['项目仪表盘'], mustNot: ['当前会话','正在做','工作流','次级模块收起','集中查看项目状态']},
    {p:'viewApps',     must: ['<h1>应用</h1>'], mustNot: ['按使用频率排序','其余默认收起','最常用的','上方为最近打开的应用']},
    {p:'viewProjects', must: ['个项目 ·', '点任意卡片进入详情'], mustNot: ['全部在一屏内可选','选中后立即在下方展开']},
    {p:'viewWorkflows',must: ['执行模块启用'], mustNot: ['个 · 当前选中']}
  ];
  cases.forEach(c => {
    const html = T[c.p]();
    const hit = c.must.every(s => html.includes(s));
    const bad = c.mustNot.filter(s => html.includes(s));
    check(hit && bad.length === 0, c.p + ' 副标题是状态数据而非说明句' + (bad.length ? '（残留：' + bad.join('/') + '）' : ''));
  });
} catch (e) { console.log('FAIL 副标题 → ' + e.message); fail++; }

/* 19. 项目化迁移：旧「工作流 / 项目」双轨已合并为单轨项目模块 */
try {
  check(T.DATA.workflows === undefined, 'DATA.workflows 旧键已删除（项目 = 独立运行单元）');
  check(T.DATA.projects.length === 3 && T.DATA.projects.map(p=>p.id).join(',') === 'apex,ops,ai',
    '项目列表 = ' + T.DATA.projects.map(p=>p.name).join(' / '));
  const vp = T.viewProjects();
  const v = T.viewWorkflows(false);
  check(vp.includes('<h1>项目选择</h1>') && vp.includes('data-act="enterProj"'), '独立项目选择页：标题 + 进入项目入口');
  check(v.includes('data-act="backProj"') && v.includes('项目列表'), '项目详情页提供「← 项目列表」返回入口');
  check(vp.includes('APEX 一键启动') && vp.includes('深度开发') && vp.includes('日常助理'),
    '选择页卡片标注当前运行流程（flowName 已上卡）');
  check(!v.includes('data-act="enterProj"') && !v.includes('class="pjt'), '详情页不再渲染选择列表（职责已拆分）');
  /* 删除项目：预演 + 二次确认 */
  T.S.projConfirm = 'apex';
  const mv = T.viewWorkflows(false);
  check(mv.includes('预演') && mv.includes('确认删除') && mv.includes('删除「APEX Automation」'),
    '删除项目弹窗：预演删除范围 + 二次确认');
  T.S.projConfirm = '';
  check(!T.viewWorkflows(false).includes('确认删除'), '取消后弹窗关闭');
  const probe = Object.assign({}, T.DATA.projectTemplate, {id:'__probe', name:'探针项目'});
  T.DATA.projects.push(probe);
  T.projDelete('__probe');
  check(!T.DATA.projects.some(p=>p.id==='__probe') && T.DATA.projects.length === 3,
    '确认删除移除项目、复位弹窗态，其余项目不受影响');
  /* 新建项目：模板创建 + 重名拒绝 + 默认名 + 删除闭环 */
  check(T.viewProjects().includes('data-act="newProject"'), '项目选择页提供「新建项目」入口');
  const newProjStatusCase = src.slice(src.indexOf("case 'newProjSt':"), src.indexOf("case 'createProject':"));
  check(newProjStatusCase.includes('setNewProjectStatus(v, t)') && !newProjStatusCase.includes('newProjectDrawer()'),
    '新建项目切换状态只更新选中态，不重绘弹窗清空已输入的名称和描述');
  ctx.__stubVals = {'#projName':'探针新项目', '#projDesc':'一句话描述'};
  T.S.newProjSt = '已暂停';
  T.createProject();
  const np = T.DATA.projects.find(p=>p.name==='探针新项目');
  check(!!np && np.st==='已暂停' && np.stCls==='pst-pause' && np.desc==='一句话描述' && np.steps.length===0,
    '新建项目：从模板创建，名称/描述/状态生效，执行模块为空');
  check(T.S.wf === np.id && T.DATA.projects.length===4 && !!T.DATA.projMeta['探针新项目'],
    '新建项目：自动选中新项目、进入列表并写入创建时间');
  ctx.__stubVals = {'#projName':'APEX Automation', '#projDesc':''};
  T.createProject();
  check(T.DATA.projects.length===4, '重名项目被拒绝创建');
  ctx.__stubVals = {'#projName':'', '#projDesc':''};
  T.createProject();
  const un = T.DATA.projects.find(p=>p.name==='未命名项目');
  check(!!un && T.DATA.projects.length===5, '名称留空 → 默认「未命名项目」');
  T.projDelete(un.id); T.projDelete(np.id);
  check(T.DATA.projects.length===3 && !T.DATA.projects.some(p=>p.name==='探针新项目'||p.name==='未命名项目'),
    '新建项目可被删除（创建 → 删除闭环）');
  T.S.wf = 'apex';
} catch (e) { console.log('FAIL 项目化迁移 → ' + e.message); fail++; }

/* 18. 总控台单屏 bento 网格：项目仪表盘只呈现当前项目、项目总览、活跃度与最近活动 */
try {
  /* 活跃度 = 在线分钟（底色）+ 代码增删（气泡），后端真实聚合：测试给 S.heatDays / S.heatDetail 喂已知数据再渲染 */
  T.S.backendReady = true;
  const heatDow = (new Date().getDay() + 6) % 7;
  const heatTodayIdx = 364 + heatDow;   /* 53 列全窗（周一为首列）：今天下标 = 364 + 周内偏移；卡片只渲染末尾 13 周 */
  const heatKeyOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const heatKey = heatKeyOf(new Date());
  const heatPrevDay = new Date(); heatPrevDay.setDate(heatPrevDay.getDate() - 1);
  T.S.heatDays = new Array(371).fill(0);
  T.S.heatDays[heatTodayIdx] = 16; T.S.heatDays[heatTodayIdx - 1] = 1000;   /* 今天 16 分钟 / 昨天 1000 分钟 */
  T.S.heatDetail = { [heatKey]: { online: 16, adds: 2100, dels: 240 }, [heatKeyOf(heatPrevDay)]: { online: 1000, adds: 10, dels: 5 } };
  const home = T.viewHome();
  check(home.includes('home-grid'), '总控台使用单屏网格布局（home-grid）');
  const cards = (home.match(/<section class="card/g) || []).length;
  check(cards === 4, '总控台保留 4 张项目仪表盘卡：当前项目 / 活跃度 / 项目总览 / 最近活动');
  check(home.includes('dashboard-overview') && home.includes('dashboard-heat')
    && home.includes('dashboard-projects') && home.includes('dashboard-activity')
    && !home.includes('launch-card') && !home.includes('todo-card') && !home.includes('notes-card'),
    '仪表盘不再重复应用、待办或笔记入口');
  check((home.match(/class="heat-cell/g) || []).length === 91,
    '热力图 13 周 × 7 行共 91 格（一个季度，格子铺满卡宽）：1 格 = 1 天，底色只表达在线时长');
  check(home.includes('data-act="heatMode"') && home.includes('>每日</button>')
    && home.includes('>每周</button>') && home.includes('>累计</button>')
    && /class="heat-tab on" data-act="heatMode" data-v="daily"/.test(home),
    '活跃度卡右上角提供 每日 / 每周 / 累计 三口径切换，默认选中「每日」');
  const heatTodayLabel = `${new Date().getMonth() + 1}月${new Date().getDate()}日`;
  check(home.includes(`<span class="heat-tip-l1">${heatTodayLabel} · 在线16分钟</span>`)
    && home.includes('<span class="heat-add">+2100</span>')
    && home.includes('<span class="heat-del">-240</span>'),
    '悬停气泡两行：第一行「日期 · 在线16分钟」，第二行「+2100 / -240」（+ 绿 / - 红）');
  const heatFuture = 6 - heatDow;   /* 末列里今天之后的格子数（今天一定落在最后一列） */
  check((home.match(/class="heat-cell future"/g) || []).length === heatFuture
    && home.includes('<span class="heat-cell future" aria-hidden="true"></span>')
    && (home.match(/class="heat-tip"/g) || []).length === 91 - heatFuture,
    '今天之后的格子只作浅灰占位、不可交互、不生成气泡 —— 悬停不可能出现未来日期');
  /* 月份刻度行：与格子共用同一套 13 列模板，所以必定逐格 13 个 span；
     ① 不能有逗号 —— 刻度串拼数组会走 Array.join(',') 往格子间塞逗号，必须 join('')；
     ② 两个标之间至少隔 3 列 —— 靠近的「残月」让位给紧随的整月，不出现「6月 8月 9月」独缺 7月 */
  const monthsBlock = (home.match(/<div class="heat-months" aria-hidden="true">([\s\S]*?)<\/div>/) || [])[1] || '';
  const monthCells = monthsBlock.match(/<span>[^<]*<\/span>/g) || [];
  const markCols = monthCells.reduce((acc, cell, col) => (/^<span>\d+月<\/span>$/.test(cell) ? (acc.push(col), acc) : acc), []);
  check(monthCells.length === 13 && !monthsBlock.includes(',')
    && monthCells.every(c => c === '<span></span>' || /^<span>\d+月<\/span>$/.test(c))
    && markCols.every((col, i) => i === 0 || col - markCols[i - 1] >= 3),
    '月份刻度逐格 13 个 span、无逗号（join(\'\') 拼接），且两个标至少隔 3 列');
  check(/run\.len >= 2 && run\.col - prevMark >= 3/.test(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8')),
    '月份刻度源码级：残月（不足 2 列）不打标，且标与标至少隔 3 列');
  check(/class="heat-cell h2 today"/.test(home) && (home.match(/heat-cell h4/g) || []).length === 1,
    '每日口径：今天格 h2（16 分钟）带 today 描边，昨天 1000 分钟 h4');
  check(!home.includes('data-act="heatFull"') && !home.includes('heat-full-btn'),
    '活跃度卡不再有「放大」入口：全屏弹窗外壳与 x 关闭按钮已删除');
  T.S.heatMode = 'weekly';
  const homeWeekly = T.viewHome();
  const heatWeekH4 = heatDow === 0 ? 7 : heatDow + 1;   /* 含 1000 分钟那一列里「已过去」的格子数（周一那天算在上一个整列） */
  check((homeWeekly.match(/heat-cell h4/g) || []).length === heatWeekH4
    && /heat-tip-l1">\d+月\d+日–\d+月\d+日 · 在线\d+分钟</.test(homeWeekly),
    '每周口径：整列 7 格统一显示所在周合计（1 格 = 1 周），气泡显示该周日期区间与周在线合计');
  T.S.heatMode = 'total';
  const homeTotal = T.viewHome();
  check((homeTotal.match(/heat-cell h4/g) || []).length === 2
    && homeTotal.includes(`<span class="heat-tip-l1">截至${heatTodayLabel} · 累计在线1016分钟</span>`),
    '累计口径：1 格 = 截至该日的累计（1000 → 1016 分钟滚动递增），气泡显示截至该日的累计在线与增删');
  T.S.heatMode = 'daily';
  check(!home.includes('heat-sum') && !home.includes('heat-delta') && !home.includes('heat-days') && !home.includes('近 12 周'),
    '活跃度卡极简：无摘要行/增减徽章/周几标签/副题/统计卡，明细只进 tooltip');
  T.S.backendReady = false;
  const homeNoBackend = T.viewHome();
  check(homeNoBackend.includes('后端未连接 · 活跃度暂不可用') && !homeNoBackend.includes('heat-cell'),
    '后端断开时活跃度如实显示不可用，不给「全空 = 没有活动」的假象');
  T.S.backendReady = true;
  const heatPayload = T.buildHeatPayload([{ date: heatKey, online: 5, adds: 7, dels: 2, count: 14 }]);
  check(heatPayload.counts.length === 371 && heatPayload.counts[heatTodayIdx] === 5 && heatPayload.counts[heatTodayIdx - 1] === 0
    && heatPayload.detail[heatKey].online === 5 && heatPayload.detail[heatKey].adds === 7 && heatPayload.detail[heatKey].dels === 2,
    '后端 date→计数对齐 53 周窗口：底色取 online（5 分钟），不再混进 count（14）里的代码行数');
  check(T.heatLevel(0) === 0 && T.heatLevel(9) === 1 && T.heatLevel(10) === 2 && T.heatLevel(999) === 3 && T.heatLevel(1000) === 4,
    '色阶对数五档：0 / 1-9 / 10-99 / 100-999 / 1000+（分钟量级跨度大，线性分档会糊成一片）');
  check(T.heatSeries([1,2,3,4,5,6,7,8], 'daily').join() === '1,2,3,4,5,6,7,8'
    && T.heatSeries([1,2,3,4,5,6,7,8], 'weekly').join() === '28,28,28,28,28,28,28,8'
    && T.heatSeries([1,2,3,4,5,6,7,8], 'total').join() === '1,3,6,10,15,21,28,36',
    '三口径聚合：每日原样 / 每周整列 7 天求和（1 格 = 1 周）/ 累计逐日滚动和（1 格 = 截至该日）；三个序列走同一套聚合');
  check((home.match(/class="dashboard-kpis"/g) || []).length === 1 && home.includes('dashboard-overview-foot'),
    '当前项目卡纵向流式：指标条独占底部一行，窄窗口下主操作与指标不再被裁剪');
  check(!home.includes('hero-metrics') && !home.includes('CPU '), 'Hero 系统指标行已删除（极简）');
  check(!home.includes('data-act="actFilter"'), '最近活动卡筛选 tabs 已精简');
  check(!home.includes('tile-use'), '仪表盘不展示无关的应用使用次数');
  check(home.includes('项目总览') && (home.match(/dashboard-project-row/g) || []).length >= 1,
    '总控台明确以项目为管理单元：项目总览逐项目成行');
  check(!home.includes('heat-foot') && !home.includes('悬停格子查看') && !home.includes('每个项目独立管理')
    && !home.includes('按项目追踪') && !home.includes('可执行单元') && !home.includes('项目内任务'),
    '总控台说明文字极简：活跃度脚注、卡片副题、KPI 术语注释、页头说明句已删，只留数据');
} catch (e) { console.log('FAIL 总控台网格 → ' + e.message); fail++; }

/* 22. 独立待办 / 笔记模块已整体删除：内容只在项目里管理 */
try {
  const home = T.viewHome();
  const index = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const appSrc = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  check(!index.includes('data-page="todos"') && !index.includes('data-page="notes"'),
    '侧栏已删除待办与笔记入口');
  check(!/function viewTodos\(|function viewNotes\(/.test(appSrc)
    && !/todos:viewTodos|notes:viewNotes/.test(appSrc),
    '独立待办页与笔记页的渲染器、页面注册已彻底移除');
  check(!home.includes('data-act="openTodos"') && !home.includes('data-act="goNotes"'),
    '总控台没有通往旧模块的隐藏入口');
  const projectNames = new Set(T.DATA.projects.map(p => p.name));
  check(T.DATA.todosPlan.every(t => projectNames.has(t.proj)) && T.DATA.notes.every(n => projectNames.has(n.proj)),
    '所有任务与项目记录均有有效项目归属，不会因删除独立入口而失联');
  check(!('inbox' in T.S.todos) && !('todoTab' in T.S) && !('todosInbox' in T.DATA),
    '收件箱的状态与数据种子已彻底移除（无残留字段）');
  check(!/inboxMenu|delInboxItem|clearInbox|'todoTab'|todosInbox/.test(appSrc),
    '收件箱相关的函数与动作分支无残留（不留死代码）');
} catch (e) { console.log('FAIL 收件箱移除 → ' + e.message); fail++; }

/* 23. 项目记录：项目内新建 + 居中弹窗编辑 */
try {
  check(T.DATA.notes.length === 11, '项目记录数据保留（' + T.DATA.notes.length + ' 条）');
  const projectContent = T.projDevHTML(T.DATA.projects[0]);
  check(projectContent.includes('项目记录') && projectContent.includes('data-act="newNoteFor"'),
    '项目开发上下文提供项目记录列表与新建入口');
  /* 侧栏「Apex 启动脚本（开机自启）」小卡已整体删除（2026-09-15） */
  const idxNo = require('fs').readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const cssNo = require('fs').readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  const appNo = require('fs').readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  check(!idxNo.includes('bootState') && !idxNo.includes('bootCap') && !idxNo.includes('mini-block') && !idxNo.includes('Apex 启动脚本'),
    '侧栏不再渲染启动脚本小卡（DOM 无 bootState / bootCap / mini-block）');
  check(!appNo.includes('runBoot') && !appNo.includes('S.boot') && !/boot:true/.test(appNo),
    '启动脚本的动作分支与状态字段已移除（无残留引用）');
  /* 「打开项目」入口与动作分支已整体移除（2026-09-15）：
     projDevHTML / devContextHTML 两处按钮 + case 'wfOpenProject' 一起清，不留死代码 */
  check(!appNo.includes('wfOpenProject') && !projectContent.includes('打开项目'),
    '「打开项目」按钮与 wfOpenProject 动作分支已彻底移除（无残留引用）');
  check(!/\.mini-block|\.mini-head|\.mini-cap/.test(cssNo),
    '启动脚本小卡的孤儿样式已清理（不留死代码）');
  /* 死代码防线（2026-09-15 清理 75 条孤儿规则后加）：styles.css 里不允许存在
     在 app.js / index.html 中从不出现的类名 —— 与历史迭代遗骸的回归护栏 */
  const cssClasses = [...new Set([...cssNo.replace(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map(m => m[1]))];
  const orphans = cssClasses.filter(c => !(appNo + idxNo).includes(c));
  check(orphans.length === 0,
    '无孤儿样式类（' + cssClasses.length + ' 个类全部有引用）' + (orphans.length ? '，残留：' + orphans.join(', ') : ''));
  check(!/\.(wf-card|statusbar|larder-item|proj-tab|ov-ready|st-chip|lead-card|pc-top|album|big-run|run-panel)\b/.test(cssNo),
    '本轮删除的 50 个历史遗骸类名不再出现在样式表');
  /* 死代码清扫（2026-09-26 第四轮）：子串护栏拦不住的伪装类 + 无生产宿主的抽屉 / 落库函数 */
  check(!/\.chat\b|\.msg\b|\.typing\b|@keyframes bob|\.anim\{|\.larder\{|\.track\{|\.metrics\{|\.split\{|\.cnt\.warn|\.cnt\.live|\.app-tile\.add|\.cat-chip\.ghost|\.metric b/.test(cssNo),
    '第四轮清理的孤儿规则不再出现在样式表（对话气泡 / 打字动画 / 云同步 / 旧栅格壳）');
  check(!appNo.includes('function openTool(') && !appNo.includes("case 'syncNow'") && !appNo.includes('dataset.tool')
    && !appNo.includes('function applyBasicInfo('),
    '无生产宿主的抽屉与本地落库兜底已清除（保存一律以后端成功为准）');
  /* 交接说明书：给外部 agent 的入口，不能被静默删掉 */
  const agentsMd = require('fs').readFileSync(path.join(__dirname, 'AGENTS.md'), 'utf8');
  check(agentsMd.includes('术语') && agentsMd.includes('硬约束') && agentsMd.includes('ALL_PASS')
    && agentsMd.includes('已删除的模块'),
    '交接说明书 AGENTS.md 就位（术语 / 硬约束 / 验证方式 / 已删模块清单齐全）');
  /* 根目录瘦身护栏：只保留源码、Git 元数据和工具元数据。
     `.git` 与 `.workbuddy` 都是工具自己写的元数据目录，不是产物，一并排除；
     不排除的话 WorkBuddy 一旦在根目录生成 .workbuddy/ 就会让这条断言无端测挂。 */
  const dirFiles = require('fs').readdirSync(__dirname).filter(name=>name!=='.git' && name!=='.workbuddy' && name!=='.workbuddy-ai').sort();
  const expectedFiles = ['.gitattributes', '.gitignore', 'AGENTS.md', 'README.md', 'app.js', 'backend', 'index.html', 'shell', 'smoke-test.js', 'styles.css'].sort();
  check(JSON.stringify(dirFiles) === JSON.stringify(expectedFiles),
    '根目录只保留源码与 Git 配置（实际：' + dirFiles.join(', ') + '）');
  /* 启动入口只在桌面：`00-启动 APEX 总控台.lnk` 已删除，且代码里禁止重建
     （见 shell/ShortcutMaker.cs 的 CreateDesktopShortcut）。 */
  check(!dirFiles.some(name=>name.endsWith('.lnk')),
    '根目录不再放启动快捷方式（唯一入口是桌面「APEX 总控台」）');
  const n0 = T.DATA.notes.length;
  T.S.notes.unshift({id:'nX', title:'t', tag:'日常', pinned:false, time:'刚刚', body:'b', proj:T.DATA.projects[0].name});
  check(T.S.notes.length === n0 + 1, '新建项目记录会追加到底层记录（' + (n0 + 1) + ' 条）');
  T.S.notes.shift();

  /* 编辑方式：居中弹窗（不再走右侧抽屉） */
  const appSrc3 = require('fs').readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const nm = T.noteModalHTML('n1');
  check(nm.includes('class="nm-title"') && nm.includes('编辑项目记录') && nm.includes('class="nm-meta"') && nm.includes('晨间记录'),
    '弹窗内展示项目记录的标题 / 标签 / 时间');
  check(nm.includes('id="noteTitle"') && nm.includes('id="noteBody"') && nm.includes('data-act="saveNote"'),
    '编辑能力保留：标题输入 + 正文文本域 + 保存动作');
  check(!nm.includes('所属项目') && !nm.includes('关联项目任务')
    && !nm.includes('data-act="noteProj"') && !nm.includes('data-act="noteTodoLink"')
    && !nm.includes('data-act="gotoProjDev"'),
    '记录编辑器不重复选择项目、不铺开任务关联，也不显示返回当前项目按钮');
  check(!appSrc3.includes("case 'noteProj'") && !appSrc3.includes("case 'noteTodoLink'")
    && !appSrc3.includes("case 'gotoProjDev'"),
    '已删除记录编辑器对应的无入口动作分支');
  check(nm.includes('data-act="closeNoteModal"') && nm.includes('data-act="togglePinNote"') && nm.includes('data-act="delNote"'),
    '弹窗提供关闭按钮，置顶 / 删除等原有操作保留');
  check(!/openDrawer/.test(nm) && !appSrc3.slice(appSrc3.indexOf('function noteModalHTML'), appSrc3.indexOf('function closeNoteModal')).includes('openDrawer('),
    '项目记录编辑不使用侧边抽屉（弹窗内容不调用 openDrawer）');
  check(!appSrc3.includes("dHead('笔记'"), '旧的「笔记」抽屉标题已无残留');
  check(!nm.includes('无归属'), '项目记录必须归属项目，不提供无归属入口');
  /* 交互与自适应：遮罩、关闭按钮、Esc、过渡动画、移动端宽度 */
  const idxHtml = require('fs').readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  check(idxHtml.includes('id="noteModalMask"') && idxHtml.includes('data-act="closeNoteModal"'),
    '遮罩层存在且点击可关闭');
  const cssN = require('fs').readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  check(/\.note-mask\{[^}]*transition:opacity/.test(cssN) && /\.note-modal\{[^}]*transition:transform/
    && /\.note-modal\.on\{[^}]*translate\(-50%,-50%\)/.test(cssN),
    '弹窗打开 / 关闭有平滑过渡（遮罩淡入 + 弹窗位移缩放）');
  check(/\.note-modal\{[^}]*width:min\(var\(--modal-w\),calc\(100vw - 32px\)\)/.test(cssN)
    && /\.note-modal\{[^}]*max-height:min\(86vh/.test(cssN),
    '桌面与移动端自适应：宽度取视口比例、超高时弹窗内滚动');
  check(/--modal-w:760px/.test(cssN) && /--modal-w-form:480px/.test(cssN)
    && /\.note-modal\.form\{[^}]*width:min\(var\(--modal-w-form\),calc\(100vw - 32px\)\)/.test(cssN),
    '弹窗宽度分两档令牌：宽版（长文本 / 列表）/ 窄版（字段少的表单）');
  check(/case 'closeNoteModal'/.test(appSrc3)
    && appSrc3.includes("if (e.key==='Escape'){ closePalette(); closePops(); closeNoteModal();"),
    '关闭接线：动作分支 + Esc 键');
} catch (e) { console.log('FAIL 笔记模块 → ' + e.message); fail++; }

/* 24b. 弹窗化：所有「编辑 / 填写」表单走居中弹窗，只有「纯查看」详情留在右侧抽屉 */
try {
  const src4 = require('fs').readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const seg = (a, b) => { const i = src4.indexOf(a), j = src4.indexOf(b); return (i > -1 && j > i) ? src4.slice(i, j) : ''; };
  /* 通用弹窗 API 就位 */
  check(src4.includes('function openModal(') && src4.includes('function closeModal(')
    && src4.includes('const mHead =') && src4.includes('const mActs =')
    && typeof T.openModal === 'function' && typeof T.closeModal === 'function',
    '通用居中弹窗 API 就位：openModal / closeModal / mHead / mActs');
  check(/function openModal\([\s\S]{0,200}\$\('#noteModal'\)/.test(src4)
    && src4.includes("case 'closeModal'"),
    '弹窗宿主复用 #noteModal，并有独立的关闭动作分支');
  /* 关闭时不得清空面板内容：.26s 退出过渡期间面板仍在绘制，
     内容一空就只剩内边距，会留下一条空白横条（同 closeDrawer 的做法：带着内容淡出）。 */
  check(!seg('function closeModal(', 'const mHead =').includes('innerHTML'),
    '关闭弹窗保留面板内容，不留空白横条');

  /* 编辑类：不再出现 openDrawer */
  const editSegs = {
    '新建项目任务': seg('function newTodo(', 'function todoMenu('),
    '项目任务编辑': seg('function todoMenu(', 'function toggleTheme('),
    '新建项目': seg('function newProjectDrawer(', 'function createProject('),
    '添加应用·选择': seg('function addApp(', 'function addAppConfirm('),
    '添加应用·命名': seg('function addAppConfirm(', 'function stashAddForm('),
    '导出配置': seg("case 'exportWf'", "case 'editWf'")
  };
  Object.keys(editSegs).forEach(k => check(editSegs[k].length > 0 && !editSegs[k].includes('openDrawer('),
    '编辑类已弹窗化（不再走抽屉）：' + k));
  Object.keys(editSegs).forEach(k => check(editSegs[k].includes('mHead('),
    '编辑类弹窗使用统一标题区 mHead：' + k));
  ['新建项目任务','项目任务编辑','新建项目','添加应用·选择','添加应用·命名']
    .forEach(k => check(editSegs[k].includes('{ form:true'), '窄版表单宽度：' + k));

  /* 纯查看类：仍走右侧抽屉 */
  const viewSegs = {
    '应用详情': seg('function appDetail(', 'function toggleAppPin(')
  };
  Object.keys(viewSegs).forEach(k => check(viewSegs[k].includes('openDrawer('),
    '纯查看类仍用右侧抽屉：' + k));

  /* 保存后关的是弹窗，不是抽屉 */
  check(src4.includes("case 'saveTodo':") && !seg("case 'saveTodo':", "case 'todoSetProj'").includes('closeDrawer()'),
    '新建任务保存后关闭弹窗');
  check(!seg("case 'saveTodoEdit'", "case 'todoNoteLink'").includes('closeDrawer()'),
    '编辑任务保存后关闭弹窗');
} catch (e) { console.log('FAIL 弹窗化 → ' + e.message); fail++; }

/* 24. 项目切换：真正切换 S.proj 并产生反馈 */
try {
  const before = T.S.proj;
  T.S.proj = 'ops';
  const cur = T.DATA.projects.find(p => p.id === 'ops');
  check(T.S.proj === 'ops' && T.viewHome().includes(cur.name), '切换项目后 Hero 与 S.proj 同步为「' + cur.name + '」');
  T.S.proj = before;
} catch (e) { console.log('FAIL 项目切换 → ' + e.message); fail++; }

/* 26. 项目内容唯一入口：旧的 AI 待办摘要与全局新建动作已移除 */
try {
  const appSrc = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  check(!/function aiGenToday\(|case 'aiGenToday'|case 'newTodo'|case 'newNote'/.test(appSrc),
    '旧的全局待办摘要与全局新建动作无残留');
  check(/case 'newTodoFor':\s*newTodo\(v\)/.test(appSrc)
    && /case 'newNoteFor':\s*newNote\(v\)/.test(appSrc),
    '新建任务与记录只通过项目入口接线');
} catch (e) { console.log('FAIL 项目内容唯一入口 → ' + e.message); fail++; }

/* 27. 窗口规格：「1260×840 标准窗口 / 全屏」两态 + 定稿 v2.1 四断点（宽 960/1200 + 高 659/799） */
try {
  const css2 = require('fs').readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  const html2 = require('fs').readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  check(!/@media\s*\(max-width:(1280|1180|1100|1080|900|860|640|560)px\)/.test(css2),
    '历史废弃断点不再回潮（860/900/1080/1180/1280 等保持移除）');
  check(!/@media\s*\(max-height:(820|760)px\)/.test(css2), '历史废弃矮屏断点（820/760）保持移除');
  check(css2.includes('@media (max-width:1199.98px)') && css2.includes('@media (max-width:959.98px)'),
    '定稿 v2.1 宽度断点就位：W1 ≤1199 紧凑档 / W2 ≤960 堆叠档');
  check(css2.includes('@media (max-height:799px)') && css2.includes('@media (max-height:659px)'),
    '定稿 v2.1 高度断点就位：H1 ≤799 密度降档 / H2 ≤659 解除单屏');
  check(/--dash-title:clamp\(/.test(css2) && /--dash-stat:clamp\(/.test(css2)
    && /--dash-card-pad:clamp\(/.test(css2),
    '密度令牌走 clamp 连续缩放（断点之间不跳变）');
  check(css2.includes('@media (prefers-reduced-motion:reduce)') && css2.includes('@media (hover:none)'),
    '无障碍媒体查询保留（动效降级 / 触屏）');
  check(css2.includes('--side-w:240px') && css2.includes('--main-max:1440px'),
    '规格令牌就位：侧栏 240px / 全屏主内容上限 1440px');
  check(css2.includes('.is-fullscreen .view{') && css2.includes('margin-inline:auto'),
    '全屏模式：主内容 max-width + 居中（禁止无脑拉伸）');
  /* 卡片内元素限宽令牌已移除：它们在 1260 标准窗口下就把内容缩成孤岛
     （旧进度条 520px / 应用网格 420px 居中，卡内左右各空 113~226px）。
     宽度改由 .home-grid 的列比例决定，超宽屏交给 --main-max 兜底。 */
  check(!/--hero-track-max|--hero-proj-max|--quick-max/.test(css2),
    '已彻底移除卡内限宽令牌（hero-track / hero-proj / quick-max）');
  check(/\.home-grid\{[^}]*grid-template-areas:"overview heat" "projects activity"/.test(css2),
    '仪表盘以当前项目 / 活跃度 / 项目总览 / 最近活动四区填满单屏');
  check(/\.heat-grid\{[^}]*grid-auto-columns:minmax\(0,1fr\)/.test(css2)
    && /\.heat-grid\{[^}]*repeat\(7,auto\)/.test(css2)
    && /\.heat-months\{[^}]*grid-auto-columns:minmax\(0,1fr\)/.test(css2)
    && /\.heat-cell::before\{[^}]*padding-top:100%/.test(css2)
    && !/\.heat-cell\{[^}]*aspect-ratio/.test(css2)
    && !/\.heat-wrap\{[^}]*overflow-x/.test(css2)
    && !css2.includes('--heat-cell')
    && /\.heat-cell\.h4\{background:var\(--dash-heat-4\)\}/.test(css2),
    '热力图纯 CSS Grid 自适应卡宽：1fr 平分列宽 + 百分比 padding 撑正方形，格宽恒等于列宽，不可能撑出横向滚动；五档色阶走令牌');
  check(/--dash-heat-0:#EBEDF0/.test(css2) && /--dash-heat-1:#BFDBFE/.test(css2) && /--dash-heat-4:#2563EB/.test(css2),
    '底色单色系五档：未活跃 #EBEDF0，在线越久越深直至 #2563EB（不掺任何红绿）');
  check(/\.heat-months\{[^}]*grid-auto-columns:minmax\(0,1fr\)/.test(css2)
    && /\.heat-cell\.today\{box-shadow:0 0 0 1px var\(--ink-2\)\}/.test(css2),
    '月份刻度与格子共用同一套 1fr 列模板（逐列严格对齐），今天格用令牌描边标记');
  check(!/\.heat-full-btn/.test(css2) && !/\.heat-full-mask/.test(css2)
    && !/\.heat-full-card/.test(css2) && !/\.heat-full-head/.test(css2),
    '放大按钮 / 全屏弹窗外壳 / x 关闭按钮的样式已连删除干净（不留死代码）');
  check(/\.heat-tip\{[^}]*background:var\(--heat-tip-bg\)/.test(css2)
    && /\.heat-tip\{[^}]*transition:all \.3s ease/.test(css2)
    && /\.heat-cell:hover \.heat-tip\{[^}]*opacity:1/.test(css2)
    && /\.heat-add\{color:var\(--heat-tip-add\)/.test(css2)
    && /\.heat-del\{color:var\(--heat-tip-del\)/.test(css2),
    '悬停气泡是深色胶囊（两种主题同底），带淡入 + 上浮（transition:all .3s ease），+ 绿 / - 红');
  check(/\.heat-cell\.future\{pointer-events:none\}/.test(css2)
    && /\.heat-cell\{[^}]*background:var\(--dash-heat-0\)/.test(css2),
    '未来格只继承未活跃浅灰底且不可交互（JS 也不给它气泡），不为它另写一套样式');
  const monthsRuleHeat = (css2.match(/\.heat-months\{[^}]*\}/) || [''])[0];
  const gridRuleHeat = (css2.match(/\.heat-grid\{[^}]*\}/) || [''])[0];
  check(monthsRuleHeat.indexOf('1fr') > -1 && gridRuleHeat.indexOf('1fr') > -1
    && /\.heat-body\{[^}]*width:100%/.test(css2)
    && !/\.heat-body\{[^}]*margin:0 auto/.test(css2),
    '月历与格子同容器、同列模板、整幅铺满卡宽（不再是「按卡宽算出来的固定块居中」）');
  check(/\.heat-tab\.on\{color:var\(--ink\)\}/.test(css2) && /\.heat-empty\{/.test(css2),
    '三口径 tab 与后端断开空态样式齐备');
  check(!/\.heat-sum\{|\.heat-delta\{|\.heat-days\{/.test(css2),
    '摘要行/增减徽章/周几标签样式已连删除干净（不留死代码）');
  check(/\.dashboard-project-list\{[^}]*overflow:hidden auto/.test(css2)
    && /\.dashboard-project-list::-webkit-scrollbar\{width:6px\}/.test(css2),
    '项目总览列表自身滚动：项目多于卡高时出细滚动条可看全');
  check(css2.includes('--win-min:720px') && /body\{[^}]*min-width:var\(--win-min\)/.test(css2)
    && /body\{[^}]*overflow:auto/.test(css2),
    '全站最小压缩宽度 720px 地板：窗口再窄布局不跟缩，body 出横向滚动条（逐字竖排从此绝迹）');
  const app27 = require('fs').readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  check(app27.includes("classList.toggle('side-flyout')")
    && /matchMedia\('\(max-width:1199\.98px\)'\)\.matches/.test(app27)
    && css2.includes('.app.side-flyout .sidebar{position:fixed')
    && /\.app:not\(\.mini\):not\(\.side-flyout\)/.test(css2),
    '折叠按钮双模：宽窗口 .mini 常驻折叠，紧凑窗口 side-flyout 浮层展开（点外部收起）——按钮在 W1 区间不再是死按钮');
  check(/\.dashboard-kpis\{[^}]*repeat\(4,minmax\(72px,1fr\)\)/.test(css2)
    && /\.dashboard-kpis>div\{[^}]*min-height:0/.test(css2),
    '当前项目指标为固定 4 列紧凑条，格子有 72px 下限（窄窗口压不烂、标签不叠数字）');
  check(!/\.dashboard-progress\{|\.dashboard-project-bar\{|\.hero-progress\{|\.ov-prog\{/.test(css2),
    '项目完成百分比及其进度条样式已彻底移除');
  check(/--dash-card-pad:/.test(css2) && /--dash-heat-gap:/.test(css2) && /--dash-heat-label:/.test(css2),
    '仪表盘密度和活跃图尺寸均走顶部设计令牌');
  check(/grid-template-rows:minmax\(0,1\.06fr\) minmax\(0,\.94fr\)/.test(css2),
    '仪表盘两行按内容密度分配，不再把高度留给空白');
  check(/grid-template-columns:minmax\(min\(320px,100%\),1\.38fr\) minmax\(min\(var\(--dash-side-min\),100%\),\.92fr\)/.test(css2),
    '当前项目与活跃度保持不对称列宽（1.38fr:.92fr），且两列都有下限——窄窗口下谁也不许被压没');
  check(!/font-size:[^;}]*vw/.test(css2), '字号未使用 vw 单位');
  check(html2.includes('id="fsBtn"') && html2.includes('id="topmostBtn"')
    && !html2.includes('id="sceneBtn"'),
    '顶栏保留全屏切换，并以窗口置顶替换旧工作模式');
  /* 无边框壳的拖拽区宽度由壳去量「搜索框左边缘」，侧栏折叠后必须主动通报重量，
     否则壳还按旧宽度占着拖拽区，会把搜索框左半截压在下面点不动。 */
  const app2 = require('fs').readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  check(/data-drag/.test(html2) && /closest\('\[data-drag\]'\)/.test(app2)
    && app2.includes("shellChromeCommand('drag')") && app2.includes("shellChromeCommand('toggle-maximize')"),
    '顶栏拖动层 / 侧栏品牌区声明 data-drag：按下即拖窗，双击即最大化');
  /* 拖动层必须铺满「整条顶栏 + 上方空白」，鼠标压到顶栏以上也要能拖：
     单条 inset 放不下（左侧 -18px 会被 .main 的 overflow:hidden 裁掉），
     所以纵向 / 右侧走负 inset、左侧换成 ::before 假墙——两处都丢了就等于退回旧行为。 */
  const tbDrag = (css2.match(/\.tb-drag\{([^}]*)\}/) || [,''])[1];
  check(/inset:calc\(-1 \* var\(--tb-drag-out\)\)/.test(css2)
    && /--tb-drag-out:calc\(var\(--pad\) \+ 8px\)/.test(css2)
    && /inset:calc\(-1 \* var\(--tb-drag-out\)\)[\s\S]{0,90}?calc\(-1 \* var\(--pad\)\) 0 0/.test(tbDrag),
    '顶栏拖动层向「上（含 8px 保留区）/ 右 / 下」扩到 .main 内边距之外，顶栏以上照旧可拖');
  check(/\.tb-drag::before\{[^}]*left:calc\(-1 \* var\(--pad\)\)[^}]*width:var\(--pad\)/.test(css2),
    '拖动层左侧用 ::before 假墙补齐 --pad（负 inset 向左会被 .main 的 overflow:hidden 裁掉）');
  /* .app 必须 overflow:clip：拖动层的越界矩形（顶部 8px 保留区、侧栏左右内边距）
     只有在这里不被裁掉，才轮得到 .main / .brand 自己裁；侧栏顶棚的拖动带是 .brand::before。
     **两条不可回退的教训**（2026-09-26 连续踩两次，见 §10.19b）：
     ① 拖动带必须挂在 **带 data-drag 的那个元素**上 —— 伪元素命中时 elementFromPoint 返回宿主元素，
        宿主不带 data-drag 就永远匹配不到，按下纹丝不动；
     ② `.brand` 必须 isolation:isolate，把内部 z-index 收在行内，否则 .brand-header 的 z-index:1
        会跑出去跟 .nav / .user（z-index:auto）按 DOM 顺序比较，整条导航被拖动带盖住、文字全不见。 */
  check(/\.app\{[^}]*overflow:clip/.test(css2) && /--side-pad:16px/.test(css2)
    && /--brand-drag-h:/.test(css2) && /--brand-head-h:/.test(css2) && /--brand-drag-up:/.test(css2)
    && /\.brand::before\{[^}]*left:calc\(-1 \* var\(--side-pad\)\)[^}]*right:calc\(-1 \* var\(--side-pad\)\)/.test(css2)
    && /\.brand::before\{[^}]*top:calc\(-1 \* var\(--brand-drag-up\)\)[^}]*height:var\(--brand-drag-h\)/.test(css2),
    '侧栏顶棚拖动带的几何全走令牌：左右吃满 --side-pad、上沿 --brand-drag-up、高度 --brand-drag-h');
  check(/\.brand\{[^}]*isolation:isolate/.test(css2),
    '.brand 建独立层叠上下文：品牌行的 z-index 不外溢，侧栏导航不会被拖动带盖住（文字描述必须可见）');
  check(/class="brand"[^>]*data-drag/.test(html2),
    'data-drag 落在 .brand 自己身上：::before 拖动带的命中返回宿主元素，宿主不带 data-drag 就永远拖不动');
  check(html2.includes('class="brand-header"') && /\.brand-header\{[^}]*z-index:1;isolation:isolate/.test(css2),
    '折叠按钮包在 .brand-header 里：它自带层叠上下文，压得住 .brand::before 拖动带（按钮照常能点）');
  const app3 = require('fs').readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  check(/closest\('\[data-drag\]'\)/.test(app3)
    && !/\.brand>[^,{]*(?<!:not\(\.brand-header\))\{[^}]*z-index:1\}/.test(css2)
    && !/\.brand\[data-drag\]>\*\{/.test(css2),
    '拖动判定统一走 closest([data-drag])；不给 .brand 子元素乱上 z-index（那会连带把导航拉进同一场比较）');
  check(app2.includes("type:'chrome-command'") && /function shellChromeCommand\(/.test(app2)
    && /shellChromeCommand\('toggle-maximize'\)/.test(app2)
    && /shellChromeCommand\('hide'\)/.test(app2),
    '顶栏「全屏 / 缩小到托盘」走壳的 WebMessage 命令通道（chrome-command）');
  check(!/requestFullscreen|webkitRequestFullscreen|fullscreenchange/.test(app2),
    '浏览器 Fullscreen API 已彻底移除（壳里走不通，负向断言不许回潮）');
  check(/msg\.type !== 'chrome-state'/.test(app2) && /is-fullscreen/.test(app2)
    && html2.includes('id="trayBtn"') && html2.includes('id="fsBtn"'),
    '壳回推 chrome-state 驱动 body.is-fullscreen，顶栏保留「缩小到托盘 + 全屏」两个窗口控件');
  /* 窗口组三个控件的悬停解释只讲它自己干什么：置顶 =「窗口置顶」，全屏 =「全屏」。
     「铺满工作区」这种解释实现细节的措辞一律不再出现在文案里（用户不关心怎么实现的），
     有它就得连负向断言一起改。 */
  check(!/铺满工作区/.test(html2) && !/铺满工作区/.test(app2),
    '窗口控件的悬停解释已去掉「铺满工作区」：全屏就叫全屏，不解释实现方式');
  check(/id="topmostBtn"[^>]*title="窗口置顶"/.test(html2)
    && /id="fsBtn"[^>]*title="全屏"/.test(html2)
    && !/id="topmostBtn"[^>]*title="[^"]*：/.test(html2),
    '置顶按钮首屏悬停解释就是「窗口置顶」，全屏按钮是「全屏」（不带后缀 / 冒号解释）');
  check(/取消窗口置顶/.test(app2) && /on \? '退出全屏' : '全屏'/.test(app2),
    '开关翻转后悬停解释跟着翻转：置顶 ↔ 取消窗口置顶，全屏 ↔ 退出全屏');
  /* 三个窗口控件共用 .win-btn，动效全部走 :root 的 --win-* 令牌（组件里不许硬写时长 / 位移）。 */
  check(/--win-ease:/.test(css2) && /--win-dur-fast:/.test(css2) && /--win-dur:/.test(css2)
    && /--win-lift:/.test(css2) && /--win-pop:/.test(css2) && /--win-press:/.test(css2)
    && /--win-pin-turn:/.test(css2),
    '窗口控件的交互动效走 --win-* 令牌（缓动 / 时长 / 抬升 / 放大 / 回弹 / 图钉角度），组件不硬写数值');
  check((html2.match(/icon-btn win-btn/g) || []).length === 3,
    '窗口组三个按钮统一挂 .win-btn（置顶 / 缩小到托盘 / 全屏共一套交互语法）');
  /* 置顶：悬停图钉拧半圈、钉住停在整圈 —— 这一条是「带旋转动效」的落点，不能退化成只换色。 */
  check(/\.win-btn-pin:hover[^{]*\.win-glyph\{[^}]*rotate\(calc\(var\(--win-pin-turn\) \/ 2\)\)/.test(css2)
    && /\.win-btn-pin\.on \.win-glyph\{[^}]*rotate\(var\(--win-pin-turn\)\)/.test(css2),
    '置顶按钮：悬停图钉旋转半圈，已置顶停在整圈（旋转动效不是只换底色）');
  check(/\.win-ring\{/.test(css2) && /@keyframes winPulse\{/.test(css2)
    && /\.win-btn-pin\.on \.win-ring\{[^}]*animation:winPulse/.test(css2),
    '已置顶时按钮带呼吸脉冲圈：状态变化有交代，不只靠描边变色');
  /* 缩小到托盘：**只有一根居中横杠**（托盘口那条缝），不再有竖箭头 / 折角箭头。
     动作也只能给它自己：悬停下沉 + 收短，按下再深一点、收得更短 —— 语义就是「缩进去」。 */
  check(/class="win-tray-bar" d="M4\.6 12h14\.8"/.test(html2)
    && !/win-tray-chevron/.test(html2) && !/win-tray-chevron/.test(css2)
    && /\.win-btn-tray:hover \.win-tray-bar\{[^}]*translateY\(1\.6px\)[^}]*scaleX\(\.86\)/.test(css2)
    && /\.win-btn-tray:active \.win-tray-bar\{[^}]*translateY\(2\.6px\)[^}]*scaleX\(\.72\)/.test(css2),
    '缩小到托盘：图标就是一根居中横杠（无竖箭头 / 折角），悬停下沉收短、按下更深更短');
  /* 全屏：悬停 / 全屏态四角向外撑开，进全屏后角标呼吸；on 态由 chrome-state 回推驱动。 */
  check((html2.match(/class="win-corner win-corner-/g) || []).length === 4
    && /\.win-btn-full:hover \.win-corner-tl,\.win-btn-full\.on \.win-corner-tl\{[^}]*translate\(-/.test(css2)
    && /@keyframes winBreathe\{/.test(css2),
    '全屏按钮四个角标各自向外撑开，全屏态（.on）停在撑开位并呼吸');
  check(/prefers-reduced-motion:reduce/.test(css2)
    && /\.win-btn:hover,\.win-btn:active,/.test(css2)
    && /\.win-btn-tray:hover \.win-tray-bar,\.win-btn-tray:active \.win-tray-bar\{transform:none\}/.test(css2),
    '窗口控件动效尊重系统「减少动态」偏好：关掉位移与动画（含横杠下沉 / 收短），只留颜色反馈');
  check(/shellChromeCommand\('hide'\)[\s\S]{0,160}?toast\(/.test(app2),
    '缩小到托盘的点击给即时反馈：窗口是「消失」不是「缩小」，不能默默无响应');
  /* 壳顶部有 8px 系统保留区（WebView2 盖不住，壳用 XAML 底色兜底）：applyTheme 必须把
     归一后的主题推给壳（shellChromeCommand('theme', t)），深色下壳底色才不会留着 F3F3F3 白带。
     必须走统一出口 + 传对象：壳用 WebMessageAsJson 解析，自己 JSON.stringify 会把消息
     降成 JSON 字符串、壳侧 type 取不到，命令被静默丢弃（2026-09-26 实测踩到）。 */
  check(/function applyTheme\(v\)\{[\s\S]*?shellChromeCommand\('theme',\s*t\)[\s\S]*?\}/.test(app2),
    'applyTheme 经 shellChromeCommand 推送归一后主题给壳，壳底色跟随页面主题');
  check(/function shellChromeCommand\(command,\s*value\)\{[\s\S]*?msg\.value = value[\s\S]*?\}/.test(app2)
    && /postMessage\(msg\)/.test(app2),
    'shellChromeCommand 支持可选 value，且一律传对象（不经 JSON.stringify 自拼消息）');
  check(!/postMessage\(JSON\.stringify/.test(app2),
    '页面侧不再自拼 JSON 字符串发壳消息（必须传对象，否则壳解析不到 type）');
  /* 首帧主题预置脚本已按需求删除：<head> 只留样式表链接，不再预读 localStorage。
     （删掉后深色用户在启动首帧会按 markup 的浅色初值渲染一次，随即由 app.js 的
       loadPrefs 翻到深色 —— 这是「只换肤、不做过渡」的取舍，不再做预置对齐。） */
  const headSeg = html2.slice(0, html2.indexOf('</head>'));
  check(!headSeg.includes('apex-console.prefs.v1') && !headSeg.includes('dataset.theme'),
    '<head> 不再内联预置 data-theme（预置脚本已删，只留样式表链接）');
  /* 全局交互基线：禁用文本选择 + 输入控件放行（顺序不能反，否则输入框无法打字） */
  const iNone = css2.indexOf('user-select:none');
  const iText = css2.indexOf('user-select:text !important');
  check(iNone > -1 && iText > -1 && iNone < iText,
    '全局禁用文本选择，且放行规则（input/textarea/contenteditable）在其后生效');
  check(/\[contenteditable="true"\]\{[\s\S]*?user-select:text !important/.test(css2),
    'contenteditable 放行 user-select:text !important');
  check(css2.includes('-webkit-user-select:none') && css2.includes('-moz-user-select:none') && css2.includes('-ms-user-select:none'),
    '覆盖 Chromium / Firefox / 旧 Edge 全内核前缀（Electron/WebView2 兼容）');
  check(/\.terminal,\.t-line,pre,code\{user-select:text/.test(css2),
    '终端 / 运行日志 / 代码预览放行，可手动选中复制');
} catch (e) { console.log('FAIL 窗口规格 → ' + e.message); fail++; }

/* 28. 通知红点：图标按钮上的未读圆点必须是正圆（padding 会把 border-box 的 8px 撑成 16px 椭圆） */
try {
  const css3 = require('fs').readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  const html3 = require('fs').readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const appSrc3b = require('fs').readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const mb = css3.match(/\.icon-btn \.badge\{([^}]*)\}/);
  check(!!mb && /width:8px/.test(mb[1]) && /height:8px/.test(mb[1]) && /padding:0/.test(mb[1]),
    '图标按钮未读红点显式归零 padding（否则 8×8 被 .badge 的 padding 撑成 16×8 扁椭圆）');
  check(/\.badge\{[\s\S]{0,120}padding:2px 8px/.test(css3),
    '通用 .badge 保留文字胶囊内边距（红点的修复不影响文字徽章）');
  check(html3.includes('class="badge" id="bellBadge"') && appSrc3b.includes("$('#bellBadge').style.display"),
    '通知红点挂在顶栏铃铛上，由未读状态驱动显隐');
} catch (e) { console.log('FAIL 通知红点 → ' + e.message); fail++; }

/* 29. 模块页：旧「脚本」页已取消，改为统一封装标准的执行模块编辑 / 添加入口 */
try {
  const html5 = require('fs').readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const app5 = require('fs').readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  check(html5.includes('data-page="modules"') && html5.includes('>模块<'),
    '侧栏第 5 项为「模块」（data-page="modules"）');
  check(!html5.includes('data-page="scripts"') && !html5.includes('>脚本<'),
    '侧栏不再有「脚本」入口（已彻底移除）');

  /* 模块库启动时只保留真实 APEX 模块；网站条目由网页模板创建并从后端恢复 */
  const mods = T.DATA.modules || [];
  const types = ['web','folder','script','cmd'];
  check(mods.length === 1 && mods[0].ref === 'apex-launcher' && mods[0].builtIn,
    '源码种子只保留真实 APEX 内置模块（演示网站已清除）');
  check(mods.every(m => typeof m.ref === 'string' && m.ref && types.includes(m.type)
    && typeof m.name === 'string' && m.name && typeof m.desc === 'string'),
    '每个模块都带统一字段 ref / type / name / desc（' + mods.length + ' 条）');
  check(!mods.some(m => /Product Hunt|Notion|GitHub PR|Gmail|Calendar|Linear|Figma|Hacker News/.test(m.name)),
    '旧网页演示模块已彻底移除');
  check(!mods.some(m => m.type === 'app'), '应用不在统一模块库里（仍由 S.apps 承载）');
  check(!T.DATA.scripts && !T.DATA.webLib && !T.DATA.folderLib && !T.DATA.cmdLib,
    '旧的四份分散数据（scripts / webLib / folderLib / cmdLib）已彻底移除');

  /* 旧脚本页与运行终端：整页删干净，运行输出统一看项目「运行流程」卡 */
  check(!app5.includes('viewScripts') && !app5.includes('runScript') && !app5.includes('clearTerm'),
    '旧脚本页渲染器 / 运行动作 / 清空输出已彻底移除');
  check(!app5.includes('id="term"') && !app5.includes('termStatus'),
    '脚本页的运行输出终端宿主已彻底移除（输出统一在项目运行流程卡）');

  /* 页面骨架 */
  T.S.modTab = 'all'; T.S.modQ = '';
  const page = T.viewModules();
  check(page.includes('<h1>模块</h1>'), '模块页有独立页头');
  check(page.includes('data-act="newModule"'), '页头提供「新增模块」入口');
  check(T.MOD_TABS.map(([k]) => `data-act="modTab" data-v="${k}"`).every(s => page.includes(s)),
    '类型筛选覆盖：全部 / 网页 / 目录 / 脚本 / 命令');
  check(page.includes('内置网页模板：名称 / 网站地址 / 描述'),
    '页头说明网页模块模板的三个输入字段');
  const rows = (page.match(/data-act="editModule"/g) || []).length;
  check(rows === mods.filter(m=>!m.builtIn).length, '只有用户创建的网站模块提供编辑入口');

  /* 新增 / 编辑共用一份表单骨架，编辑只多一个「删除」（与任务弹窗同一套约定） */
  check((app5.match(/moduleFormHTML\(/g) || []).length >= 3,
    '新增与编辑共用 moduleFormHTML()（全站只有这一份模块表单骨架）');
  const form = T.moduleFormHTML({ nameId:'modName' });
  check(['modName','modDesc','modEntry'].every(id => form.includes(`id="${id}"`)) && !form.includes('modArg'),
    '网页模板只填写名称 / 网站地址 / 描述');
  check(!form.includes('data-act="modFormType"') && !form.includes('data-act="modFormProj"'),
    '网页模板不要求选择类型或所属项目');
  check(T.validWebModuleUrl('https://example.com') && !T.validWebModuleUrl('file:///C:/Windows'),
    '网页模板只接受完整的 http / https 地址');
  check(form.includes('id="modErr"') && app5.includes('function modShowErr(')
    && app5.includes("modShowErr('网站地址必须是完整的 http:// 或 https:// 地址'"),
    '网站模块校验失败时在弹窗内显示错误，不依赖会被遮挡的全局提示');

  /* 删除模块：预演 + 二次确认（硬约束） */
  T.S.modConfirm = '';
  check(T.modDeleteModalHTML() === '', '未进入删除流程时不渲染预演弹窗');
  const d = {id:'web-test', ref:'https://example.com', type:'web', name:'测试网站', desc:'', arg:'', builtIn:false};
  mods.push(d);
  T.S.modConfirm = T.moduleKey(d.type, d.ref);
  const ask = T.modDeleteModalHTML();
  check(ask.includes('预演：') && ask.includes('data-act="modDelete"') && ask.includes('data-act="modDeleteCancel"'),
    '删除模块走「预演 + 二次确认」弹窗');
  T.S.modConfirm = ''; mods.pop();

  /* 四类模块在读取与添加处都收敛成一次查找 */
  check(app5.includes('DATA.modules.filter(m=>m.type===t)'), '执行模块库面板对四类只做一次 filter');
  check(app5.includes('DATA.modules.find(x=>x.type===t && x.ref===ref)'), 'addStep 对四类只做一次查找');
  check(app5.includes('s.moduleId === saved.id') && app5.includes('s.ref = saved.ref; s.label = saved.name'),
    '改写网站地址时，使用模块 id 的项目步骤同步更新（不留悬空引用）');
  check(app5.includes("await apiRequest(editing ? `/modules/") && app5.includes("method:editing ? 'PATCH' : 'POST'"),
    '网站模块新增与编辑以后端保存成功为准');
} catch (e) { console.log('FAIL 模块页 → ' + e.message); fail++; }

/* 30. 0 项目 / 删项目残留：一批「点了就死」的兜底（2026-09-16 缺陷审计修复） */
try {
  const app6 = require('fs').readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const D = T.DATA, S = T.S;

  /* 30a. 至少要保留一个项目 —— 0 项目会让总控台 / 项目详情没有可渲染的对象 */
  check(/case 'projDeleteAsk': void requestProjectDelete\(id\);/.test(app6)
    && /async function requestProjectDelete\(id\)\{[\s\S]{0,180}DATA\.projects\.length <= 1[\s\S]{0,120}至少/.test(app6),
    '预演入口委托后端预演，并拦住「删除最后一个项目」');
  check(/function projDelete\(id\)\{[\s\S]{0,200}DATA\.projects\.length <= 1/.test(app6),
    'projDelete 本身也兜一层（防止绕过预演直接调用）');
  check(/function projDelete\(id\)\{[\s\S]{0,620}S\.projDeletePreview[\s\S]{0,100}请先完成删除预演/.test(app6),
    '浏览器侧必须先取得删除预演，才能提交实际删除');

  /* 30b. 页面级兜底：0 项目下两个页面都不能抛 */
  const bakProjects = D.projects.slice();
  let homeHtml = '', wfHtml = '', threw = '';
  try {
    D.projects.length = 0;
    homeHtml = T.viewHome();
    wfHtml = T.viewWorkflows(false);
  } catch (e) { threw = e.message; }
  D.projects.length = 0; bakProjects.forEach(p => D.projects.push(p));
  check(!threw, '0 项目时总控台 / 项目详情不再抛异常' + (threw ? '（' + threw + '）' : ''));
  check(homeHtml.includes('还没有项目'), '0 项目时总控台渲染空态而不是白屏');
  check(wfHtml.includes('还没有项目'), '0 项目时项目详情渲染空态而不是白屏');
  check(D.projects.length === bakProjects.length, '兜底测试后项目数据已还原（' + D.projects.length + ' 个）');

  /* 30c. purgeProjRefs：删项目要连带清掉按项目名引用的结构，否则同名新建会「复活」 */
  const TMP = '__审计临时项目';
  D.projects.push({ id:'__tmp', name:TMP, st:'正常', stCls:'pst-ok', parent:null, desc:'', files:0, commits:0, tags:[], updated:'', ico:'sun', color:'#000', flowName:'临时流程', flowDesc:'', last:'—', runs:0, steps:[] });
  S.todos.plan.push({ id:'__t1', text:'临时待办', proj:TMP, due:'今天', urgent:false, done:false, kind:'todo' });
  S.notes.push({ id:'__n1', title:'临时记录', tag:'日常', pinned:false, time:'刚刚', body:'', proj:TMP, links:[] });
  D.projMeta[TMP] = { note:'临时元信息' };
  D.devContext[TMP] = { module:'m', modulePath:'p', files:[], lastEdit:'—' };
  D.modules.push({id:'legacy-1',ref:'legacy-1',type:'script',name:'旧模块 1',desc:'',arg:'',proj:TMP});
  D.modules.push({id:'legacy-2',ref:'legacy-2',type:'cmd',name:'旧模块 2',desc:'',arg:'',proj:TMP});
  const cnt = T.projPurgeCounts(TMP);
  check(cnt.todos === 1 && cnt.notes === 1 && cnt.modules === 2,
    '预演计数准确（待办 ' + cnt.todos + ' / 记录 ' + cnt.notes + ' / 模块 ' + cnt.modules + '）');
  T.purgeProjRefs(TMP, '__tmp');
  check(!S.todos.plan.some(t => t.proj === TMP), '删除后该项目名下待办已清空（同名新建不再复活）');
  check(!S.notes.some(n => n.proj === TMP), '删除后该项目名下记录已清空');
  check(!Object.prototype.hasOwnProperty.call(D.projMeta, TMP) && !Object.prototype.hasOwnProperty.call(D.devContext, TMP),
    '项目元信息 / 开发上下文按名索引一并清掉');
  check(D.modules[D.modules.length-2].proj === T.DEFAULT_PROJ && D.modules[D.modules.length-1].proj === T.DEFAULT_PROJ,
    '执行模块本身不被删除，所属项目归回默认归属（' + T.DEFAULT_PROJ + '）');
  D.modules.splice(D.modules.length-2, 2);
  D.projects.pop();

  /* 30d. 预演弹窗必须写明连带删除的范围 */
  S.projConfirm = 'ai';
  const dHtml = T.projDeleteModalHTML();
  check(dHtml.includes('预演：') && /条待办/.test(dHtml) && /条项目记录/.test(dHtml),
    '删除预演弹窗写明会连带清掉多少条待办与记录');
  S.projConfirm = '';

  /* 30e. 命令面板「常用项目」不再硬编码项目 id（删掉项目后会静默跑错项目） */
  check(!/startRun\('apex'\)|startRun\('ops'\)/.test(app6),
    '命令面板不再写死 startRun(\'apex\'/\'ops\')');
  check(/name:'常用项目', items:DATA\.projects[\s\S]{0,160}lastUsedLabel/.test(app6),
    '「常用项目」由项目表动态派生、按最近使用排序（项目删掉后入口自动消失）');

  /* 30f. startRun 不再用 curWf() 静默兜底 */
  check(/const wf = DATA\.projects\.find\(w=>w\.id===id\);\n\s*if \(!wf\)\{ toast\('这个项目已经不存在了'\); return; \}/.test(app6),
    'startRun 明确判存在，不再静默拿第一个项目顶上');
  S.running = null;
  T.startRun('__不存在的项目id__');
  check(!S.running, '运行一个不存在的项目不会启动任何流程');

  /* 30g. 两处未判空的 find */
  check(/case 'focusProj': projSwitchPop\(t\); break;/.test(app6)
    && /function projSwitchPop\(btn\)\{[\s\S]{0,140}openPop\('projSwitchPop'/.test(app6)
    && /case 'setCurProj':[\s\S]{0,200}if \(!p \|\| id === S\.proj\) break;/.test(app6),
    '切换当前项目改为浮层选单：focusProj 只负责开弹层，setCurProj 判空且同项目不重切');
  check(!/sceneModes|scenePop|sceneBtn|sceneName|场景联动|S\.scene/.test(app6),
    '旧工作模式的数据、浮层、交互与设置项已彻底移除');
} catch (e) { console.log('FAIL 0 项目兜底 → ' + e.message); fail++; }

/* 31. 真实后端模块：APEX 启动不再走旧前端 */
try {
  const fs31 = require('fs');
  const app31 = fs31.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const main31 = fs31.readFileSync(path.join(__dirname, 'backend/app/main.py'), 'utf8');
  const runner31 = fs31.readFileSync(path.join(__dirname, 'backend/app/module_runner.py'), 'utf8');
  const db31 = fs31.readFileSync(path.join(__dirname, 'backend/app/db.py'), 'utf8');
  const projectRepo31 = fs31.readFileSync(path.join(__dirname, 'backend/app/repositories/project_repository.py'), 'utf8');
  const projectService31 = fs31.readFileSync(path.join(__dirname, 'backend/app/services/project_service.py'), 'utf8');
  const launcher31 = fs31.readFileSync(path.join(__dirname, 'backend/modules/apex-launcher/runner.py'), 'utf8');
  const consoleLauncher31 = fs31.readFileSync(path.join(__dirname, 'backend/console_launcher.py'), 'utf8');
  const startPs31 = fs31.readFileSync(path.join(__dirname, 'backend/start.ps1'), 'utf8');
  const startup31 = fs31.readFileSync(path.join(__dirname, 'backend/app/startup_manager.py'), 'utf8');
  const bootstrapPs31 = fs31.readFileSync(path.join(__dirname, 'backend/bootstrap.ps1'), 'utf8');
  const manifest31 = JSON.parse(fs31.readFileSync(path.join(__dirname, 'backend/modules/apex-launcher/module.json'), 'utf8'));
  const apex31 = T.WF_SEED.find(p=>p.id==='apex');

  check(apex31.steps.length === 1 && apex31.steps[0].ref === 'apex-launcher',
    'APEX 项目只保留一个真实启动模块');
  check(T.DATA.modules.some(m=>m.ref==='apex-launcher' && m.type==='script'),
    '统一模块库登记 APEX 启动模块');
  check(app31.includes("const REAL_PROJECT_IDS = new Set(['apex'])")
    && app31.includes('/projects/${encodeURIComponent(wf.id)}/executions')
    && app31.includes("startBackendAction(wf, runToken, 'run')")
    && app31.includes('/executions/${encodeURIComponent(S.running.runId)}')
    && app31.includes('payload.projectExecutions'),
    '前端通过项目执行接口轮询真实步骤、错误与历史');
  check(!app31.includes('最近的 Mock 运行详情'), '运行日志不再声称是 Mock');
  check(main31.includes('@app.post("/api/projects/{project_id}/run"')
    && main31.includes('@app.post("/api/projects/{project_id}/stop"')
    && main31.includes('@app.post("/api/projects/{project_id}/restart"')
    && main31.includes('@app.get("/api/projects/{project_id}/runtime"')
    && main31.includes('@app.get("/api/runs/{run_id}"'),
    '后端提供项目运行、关闭、重启与运行状态恢复接口');
  check(main31.includes('@app.post("/api/projects/{project_id}/tasks"')
    && main31.includes('@app.patch("/api/tasks/{task_id}"')
    && main31.includes('@app.delete("/api/tasks/{task_id}"')
    && projectService31.includes('def create_task(')
    && projectRepo31.includes('INSERT INTO tasks') && db31.includes('def _migration_2_task_kind'),
    '后端任务支持迁移、创建、更新与删除的完整持久化接口');
  check(main31.includes('@app.post("/api/projects/{project_id}/notes"')
    && main31.includes('@app.patch("/api/notes/{note_id}"')
    && main31.includes('@app.delete("/api/notes/{note_id}"')
    && db31.includes('def _migration_3_project_notes')
    && app31.includes('payload.notes') && app31.includes('function updateBackendNote('),
    '项目记录支持数据库迁移、加载、创建、保存、置顶与删除');
  check(main31.includes('@app.get("/api/activity/daily"')
    && main31.includes('"activityDays": activity_daily_counts(371)')
    && main31.includes('@app.post("/api/activity/heartbeat"')
    && main31.includes('def git_code_changes(')
    && db31.includes('def _migration_9_activity_heartbeats')
    && app31.includes('function buildHeatPayload(')
    && app31.includes('function heatSeries(')
    && app31.includes('function heatWeeklySeries(')
    && app31.includes('function heatCumulativeSeries(')
    && app31.includes('function heatTipHTML(')
    && app31.includes('function dashboardHeatmapHTML(')
    && !app31.includes('function sizeHeat(') && !app31.includes('--heat-cell')
    && !app31.includes('heatFullHTML')
    && app31.includes('S.heatDays = next.counts;')
    && app31.includes('S.heatDetail = next.detail;')
    && app31.includes('startHeartbeat();')
    && app31.includes("apiRequest('/activity/heartbeat', { method: 'POST' })")
    && app31.includes('dashboardHeatmapHTML(S.heatDays)')
    && app31.includes('function refreshHeatCounts('),
    '项目活跃度按本机本地日聚合在线分钟（页面 60s 心跳）与全局代码目录 git 增删行数，卡片 13 周自适应热力图（底色 = 在线时长，气泡 = 代码增删），随 bootstrap 与 60s 节流刷新');
  check(main31.includes('@app.put("/api/projects/{project_id}/basic-info"')
    && db31.includes('def _migration_4_project_context')
    && projectService31.includes('def save_basic_info(')
    && projectService31.includes('with self.repository.transaction() as conn:')
    && projectRepo31.includes('def upsert_context_in_transaction(')
    && app31.includes('function basicInfoApiPayload(') && app31.includes('function applyBackendBasicInfo('),
    '编辑基本资料通过一次后端提交同步开发字段、任务、记录与开发要求');
  check(main31.includes('@app.get("/api/applications/scan"')
    && main31.includes('@app.post("/api/applications/from-scan"')
    && main31.includes('open_local_application(candidate["launch_path"])')
    && main31.includes('@app.post("/api/applications/{app_id}/launch"')
    && main31.includes('@app.patch("/api/applications/{app_id}"')
    && main31.includes('@app.delete("/api/applications/{app_id}"')
    && db31.includes('def _migration_8_application_launch_targets')
    && app31.includes('function backendAppFromApi(') && app31.includes('function loadScannedApps(')
    && !app31.includes('importBackendApps(S.apps.slice())'),
    '应用清单由 Windows 真实扫描添加并真实启动，不再迁入演示清单');
  check(app31.includes('function appScrollDragBlocked(')
    && app31.includes('if (appScrollDragBlocked(e.target)) return;'),
    '应用列表拖动不会抢占启动、置顶、标签与移除按钮的鼠标点击');
  check(main31.includes('@app.put("/api/projects/{project_id}/applications/{application_id}"')
    && main31.includes('@app.delete("/api/projects/{project_id}/applications/{application_id}"')
    && app31.includes('payload.projectApplications')
    && app31.includes('/applications/${encodeURIComponent(ref)}'),
    '真实应用可以保存为项目执行步骤并在刷新后恢复');
  check(main31.includes('@app.get("/api/projects/{project_id}/delete-preview"')
    && main31.includes('@app.delete("/api/projects/{project_id}")')
    && main31.includes('FROM runs WHERE project_id=?')
    && app31.includes('/projects/${encodeURIComponent(id)}/delete-preview')
    && app31.includes("method:'DELETE'"),
    '项目删除先预演任务、模块绑定和运行历史，再由后端原子级联清理');
  check(main31.includes('@app.post("/api/modules"')
    && main31.includes('@app.patch("/api/modules/{module_id}"')
    && main31.includes('@app.put("/api/projects/{project_id}/modules/{module_id}"')
    && runner31.includes('async def _execute_web('),
    '网页模板支持后端持久化、项目绑定与共享执行器');
  check(app31.includes('payload.projectRuns') && app31.includes('backendTimeLabel('),
    '项目刷新后从后端恢复真实运行次数、最近时间和历史记录');
  check(app31.includes('function rememberBackendAttempt(')
    && (app31.match(/rememberBackendAttempt\(wf, payload\)/g) || []).length === 3,
    '真实运行成功或失败后立即更新页面历史，关闭项目不计为新运行');
  check(!app31.includes('最近 3 次（Mock）') && !app31.includes('9月10日 21:36')
    && !app31.includes('9月9日 08:12'),
    '项目运行历史不再混入固定日期的假记录');
  check(runner31.includes('asyncio.create_subprocess_exec') && !runner31.includes('create_subprocess_shell'),
    '模块运行器分离程序与参数，不执行拼接 shell 字符串');
  check(runner31.includes('program = self._expand(action_def.program, values)')
    && runner31.includes('if module.requires_admin') && runner31.includes('process.stderr.log')
    && runner31.includes('_read_process_output'),
    '程序路径支持模块占位符，需要提权时保留 UAC 且子进程错误写回运行记录');
  check(manifest31.id === 'apex-launcher' && manifest31.projectId === 'apex'
    && manifest31.singleInstance === true && manifest31.requiresAdmin === true
    && manifest31.actions.run && manifest31.actions.stop && manifest31.actions.restart,
    '模块清单声明稳定 id、运行/关闭/重启动作、单实例和管理员权限');
  check(app31.includes('function projectRunControlsHTML')
    && app31.includes('data-act="stopProject"') && app31.includes('data-act="restartProject"')
    && app31.includes('/projects/${encodeURIComponent(wf.id)}/executions')
    && app31.includes("startBackendAction(wf, runToken, 'stop')")
    && app31.includes("startBackendAction(wf, runToken, 'restart')")
    && !T.projRunHTML(apex31, null, false).includes('data-act="stopProject"'),
    '项目卡与详情页头共用运行控件，关闭和重启接入后端且运行流程卡不再重复');
  const failed31 = T.projRunHTML(apex31, {
    wfId:'apex', action:'run', status:'failed', done:0, total:1,
    i:0, order:[apex31.steps[0].id], states:{[apex31.steps[0].id]:'error'}, log:[], error:'启动失败'
  }, false);
  check(failed31.includes('运行失败') && !failed31.includes('badge b-blue">运行中'),
    '真实启动失败时状态徽标显示失败，不再误报运行中');
  const worker31 = fs31.readFileSync(path.join(__dirname, 'backend/apex_worker.py'), 'utf8');
  check(launcher31.includes('WORKER_PORT = 8766') && launcher31.includes('def ensure_worker(')
    && launcher31.includes('def execute_action(') && launcher31.includes('/actions/{action}')
    && worker31.includes('get_service') && worker31.includes('ApexOneClickService') === false
    && worker31.includes('service.adopt_running_environment()')
    && worker31.includes('host="127.0.0.1"') && worker31.includes('port=8766'),
    'APEX 模块复用内置常驻工作进程，重启严格执行先关闭再启动');
  check(!fs31.existsSync(path.join(__dirname, 'backend/modules/apex-launcher/adapter.py')),
    '短命适配器已移除，不再伪造跨进程关闭状态');
  check(!launcher31.includes('5173') && !launcher31.includes('frontend'),
    'APEX 模块不启动旧 Vue/Vite 前端或打开旧页面');
  check(launcher31.includes('execute.lpVerb = "runas"') && launcher31.includes('execute.nShow = 0'),
    '仅 APEX 模块执行时请求管理员权限，提权子进程隐藏');
  check(!fs31.existsSync(path.join(__dirname, 'backend/modules/apex-launcher/run.ps1'))
    && Object.values(manifest31.actions).every(action=>!action.program.toLowerCase().includes('powershell')
      && !action.args.some(arg=>arg.toLowerCase().includes('executionpolicy'))),
    '真实执行入口已移除被安全软件拦截的 PowerShell 与执行策略绕过');
  check(consoleLauncher31.includes('def plan_launch(')
    && consoleLauncher31.includes('payload.get("service") == "apex-console"')
    && consoleLauncher31.includes('def source_fingerprint(')
    && consoleLauncher31.includes('def terminate_process(')
    && consoleLauncher31.includes('kernel32.TerminateProcess')
    && consoleLauncher31.includes('subprocess.CREATE_NO_WINDOW')
    && consoleLauncher31.includes('def open_site(')
    && consoleLauncher31.includes('f"--app={url}"')
    && consoleLauncher31.includes('APP_WINDOW_WIDTH = 990')
    && consoleLauncher31.includes('APP_WINDOW_HEIGHT = 700')
    && consoleLauncher31.includes('APP_WINDOW_PROFILE_DIR')
    && consoleLauncher31.includes('f"--user-data-dir={APP_WINDOW_PROFILE_DIR}"')
    && consoleLauncher31.includes('f"--window-size={APP_WINDOW_WIDTH},{APP_WINDOW_HEIGHT}"')
    && consoleLauncher31.includes('f"--window-position={x},{y}"'),
    '桌面一键入口安全启动或重启后，默认打开居中的 990×700 独立窗口');
  check(app31.includes("apiRequest('/window')")
    && app31.includes("apiRequest('/window/topmost'")
    && app31.includes('function syncConsoleWindowControl()')
    && main31.includes('@app.get("/api/window")')
    && main31.includes('@app.put("/api/window/topmost")'),
    '窗口置顶控件读取并更新后端验证的固定窗口状态，不伪造成功');
  check(app31.includes('function shellToast')
    && app31.includes("type:'shell-toast'")
    && (app31.match(/shellToast\(/g) || []).length >= 4,
    '壳通知桥：运行终态（完成/失败/关闭）会经 WebMessage 发系统 Toast，浏览器环境空操作');
  check(startup31.includes('ApexShell.exe') && startup31.includes('shell_exe.exists()'),
    '开机自启动注册命令改指 WinUI 壳 exe（壳未构建时回退 console_launcher）');
  check(startPs31.includes('Push-Location $backend') && startPs31.includes('finally') && startPs31.includes('Pop-Location'),
    'Apex Console 启动脚本不依赖调用者当前目录');
  check([startPs31, bootstrapPs31].every(text=>!/[^\x00-\x7F]/.test(text)),
    'Windows PowerShell 5 入口脚本全部保持纯 ASCII，避免无 BOM UTF-8 被错误解码');
} catch (e) { console.log('FAIL 真实后端模块 → ' + e.message); fail++; }

/* 32. 项目选择页卡片拖拽排序：二维命中 + 长按起拖 + 弹簧让位 + 后端持久化 */
try {
  const app32 = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const css32 = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  const main32 = fs.readFileSync(path.join(__dirname, 'backend/app/main.py'), 'utf8');
  const db32 = fs.readFileSync(path.join(__dirname, 'backend/app/db.py'), 'utf8');
  const repo32 = fs.readFileSync(path.join(__dirname, 'backend/app/repositories/project_repository.py'), 'utf8');
  const service32 = fs.readFileSync(path.join(__dirname, 'backend/app/services/project_service.py'), 'utf8');

  /* 二维命中：3 列 × 2 行，每格 300×200、卡片 290×180 */
  const grid32 = [];
  for (let i = 0; i < 6; i++) grid32.push({ x:(i % 3) * 300, y:Math.floor(i / 3) * 200, w:290, h:180 });
  check(T.projSortSlotAt(grid32, 300 + 145, 200 + 90, 0) === 4,
    '二维命中：从第一格拖到第二行第二格落在下标 4（按一维顺序会错判成 1）');
  check(T.projSortSlotAt(grid32, 600 + 145, 0 + 90, 0) === 2,
    '二维命中：同一行拖到第三格落在下标 2');
  check(T.projSortSlotAt(grid32, 0 + 145, 0 + 90, 0) === 0, '回到原位仍命中下标 0');
  check(T.projSortSlotAt(grid32, 296, 90, 0) === 0 && T.projSortSlotAt(grid32, 300, 90, 0) === 1,
    '等距滞回：槽位边界附近不来回换位，越过边界才换');

  check(T.PROJ_SORT.holdMs === 200 && T.PROJ_SORT.tolerance > 0,
    '长按 200ms 才起拖，起拖前位移超过容差就交回原生滚动');
  check(typeof T.initProjSort === 'function' && /S\.page === 'projects'\)\s*initProjSort\(\)/.test(app32),
    '项目选择页每次渲染都重新绑定拖拽排序');
  check(T.projSortBlocked({ closest:() => ({}) }) === true && T.projSortBlocked({ closest:() => null }) === false,
    '卡片内的按钮 / 链接长按不参与拖拽，卡片空白处可以起拖');
  check(/function projSortBlocked\(target\)\{[\s\S]{0,140}closest\('button,a,input,textarea,select'\)/.test(app32)
    && !/projSortBlocked\(target\)\{[\s\S]{0,140}data-act/.test(app32),
    '起拖黑名单只排真控件：不用 appScrollDragBlocked，否则 [data-act] 会让整张卡都拖不动');
  check(app32.includes('.pjt-card[data-id]') && T.viewProjects().includes('class="pjt-card pjt-new"'),
    '尾部「新建项目」占位卡没有 data-id，不参与拖拽，始终留在最后');
  check(/const integrate = \(rec, dt\)/.test(app32) && app32.includes('PROJ_SORT.stiffness')
    && app32.includes('Math.ceil(dt / PROJ_SORT.step)') && app32.includes('rec.follow'),
    '让位与落位共用一个物理弹簧积分器：位移逐帧写 transform，没有瞬移与闪烁');
  check(app32.includes('ResizeObserver') && app32.includes('窗口尺寸已改变，已取消这次排序'),
    '窗口尺寸变化会重新测量；拖拽中变化则安全取消并归位');
  check(app32.includes("board.addEventListener('touchmove', onBlockScroll, { passive:false })")
    && !/[^{}]*is-(?:sorting|arming)[^{}]*\{[^}]*overflow/.test(css32),
    '拖拽期间只吃掉滚动事件，不改看板 overflow（改 overflow 会变更列宽并触发重排）');
  check(app32.includes("apiRequest('/projects/order'") && app32.includes("method:'PUT'")
    && app32.includes('applyProjectOrder(rows)')
    && app32.includes("toast(err && err.message ? err.message : '项目排序未保存')"),
    '顺序落库成功后才重排本地列表；失败只弹回原位并如实提示');

  check(css32.includes('.pjt-board.is-sorting .pjt-card{transition-property:border-color,box-shadow,background}'),
    '拖拽期间卡片不再对 transform 做过渡，位移完全由弹簧驱动');
  check(css32.includes('.pjt-card.is-dragging{cursor:grabbing;z-index:30')
    && css32.includes('box-shadow:var(--pjt-sh-drag)'),
    '被拖卡片只加抬起态（阴影加深 + 层级抬到最上），圆角 / 内边距 / 内容布局不变');
  check(css32.includes('--pjt-lift-scale:1.035') && css32.includes('--pjt-lift-tilt:1.4deg')
    && css32.includes('--pjt-sh-drag:0 22px 46px rgba(46,26,20,.24)')
    && app32.includes("read('--pjt-lift-scale'") && app32.includes("read('--pjt-lift-tilt'"),
    '抬起幅度与拖拽阴影走 :root 令牌，JS 与组件里都不硬写视觉值');
  check(!/drag-handle|pjt-handle|拖拽图标|把手/.test(T.projTileHTML(T.DATA.projects[0])),
    '卡片模板里没有拖拽手柄、把手或指示线（零额外 UI）');

  /* 后端：只追加的迁移 + 全量校验的排序接口 */
  check(db32.includes('_migration_10_project_order') && db32.includes('(10, _migration_10_project_order)'),
    '新增只追加的迁移：projects 加 sort_order，旧库按原展示顺序回填');
  check(repo32.includes('ORDER BY sort_order, created_at, id')
    && repo32.includes('COALESCE(MAX(sort_order),-1)+1'),
    '项目按 sort_order 读取，新建的项目排在末尾');
  check(main32.includes('@app.put("/api/projects/order")') && main32.includes('class ProjectOrderWrite')
    && service32.includes('排序请求缺少项目，已拒绝整批写入'),
    '排序接口只接受全量且唯一的 id 列表，缺项 / 重复 / 未知整批拒绝');
  check(main32.includes('ORDER BY sort_order, created_at, id'), 'bootstrap 同样按 sort_order 返回项目');
} catch (e) { console.log('FAIL 卡片拖拽排序 → ' + e.message); fail++; }

/* 33. 外观 · 信息密度：可调 + 跨刷新保留
   （原实现 value="1" 写死、无状态字段：拖动只改内联令牌，任何重绘都把滑块弹回「标准」，刷新即丢） */
try {
  T.S.density = 2;
  const setLoose = T.viewSettings();
  T.S.density = 0;
  const setTight = T.viewSettings();
  T.S.density = 1;
  check(/id="density" type="range" min="0" max="2" value="2" step="1"/.test(setLoose)
    && /id="density" type="range" min="0" max="2" value="0" step="1"/.test(setTight),
    '信息密度滑块的值由 S.density 渲染：重绘后停在上次选中的档位，不再固定弹回「标准」');

  check(T.DENSITY_STEPS.length === 3 && T.DENSITY_STEPS[1].join(',') === '18,16',
    '信息密度三档预设，中档（标准）与 :root 的 --pad:18px / --gap:16px 同值');
  const densVars = ctx.document.documentElement.style._vars;
  T.applyDensity(0);
  const tightVars = densVars['--pad'] + '|' + densVars['--gap'];
  T.applyDensity(2);
  const looseVars = densVars['--pad'] + '|' + densVars['--gap'];
  T.applyDensity('x');                       // 非法档位 → 回退标准
  check(tightVars === '14px|12px' && looseVars === '24px|22px' && T.S.density === 1
    && densVars['--pad'] === '18px' && densVars['--gap'] === '16px',
    '信息密度只改 --pad / --gap 两个令牌（紧凑 14/12、宽松 24/22），非法档位回退标准 18/16');

  const cssDens = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  check(cssDens.includes('--pad:18px') && cssDens.includes('--gap:16px'),
    '标准档就是 :root 的默认令牌值，滑块默认态与样式起点一致');
  T.S.density = 2; T.persistPrefs();
  check(JSON.parse(storageData[T.PREFS_STORE_KEY]).density === 2,
    '信息密度写入浏览器本机偏好（apex-console.prefs.v1），与 Obsidian 配置共用同一套 store 包装');
  T.S.density = 1;
  check(T.loadPrefs() === true && T.S.density === 2, '刷新后从本机偏好还原上次选中的信息密度');
  storageData[T.PREFS_STORE_KEY] = '{"density":9}';
  check(T.loadPrefs() === true && T.S.density === 1, '偏好档位越界时回退「标准」，不把非法值写进状态');
  storageData[T.PREFS_STORE_KEY] = '{broken';
  T.S.density = 2;
  check(T.loadPrefs() === false && T.S.density === 2, '偏好 JSON 损坏时安全回退且不动当前状态，不阻断页面');
  delete storageData[T.PREFS_STORE_KEY];

  const appDens = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  check(appDens.includes('loadPrefs();\n  applyPrefs();'),
    '启动流程读取偏好并回写令牌：刷新后卡片内边距真的还原，而不只是记住一个数字');
  const densBranch = (appDens.match(/if \(e\.target\.id==='density'\)\{([\s\S]*?)\n  \}/) || [])[1] || '';
  check(/applyDensity\(/.test(densBranch) && /persistPrefs\(\);/.test(densBranch) && !/render\(/.test(densBranch),
    '拖动滑块只落偏好与令牌、不整页重渲染（重渲染会在拖动过程中重建滑块，观感就是弹回去）');
} catch (e) { console.log('FAIL 信息密度 → ' + e.message); fail++; }

/* 34. 外观偏好：主题 / 强调色 / 玻璃质感 / 通用开关 —— 可调 + 跨刷新保留
   （原实现把开关初值写死在 markup 里、事件分支只改内联样式不落偏好：重绘即弹回，刷新即丢） */
try {
  check(T.PREF_KEYS.join(',') === 'theme,accent,density,glass,notify,save,telemetry',
    '外观偏好恰好 7 个字段：主题 / 强调色 / 信息密度 / 玻璃质感 / 桌面通知 / 自动保存 / 使用数据统计');
  check(T.ACCENTS.length === 4 && T.THEME_VALUES.join(',') === 'light,dark' && T.ACCENTS[0] === '#E8402A',
    '强调色 4 色、主题两值，色板首项与 :root 的 --brand 默认值同色');

  const htmlEl = ctx.document.documentElement;
  const prefVars = htmlEl.style._vars;
  T.applyTheme('dark');
  const themeDark = htmlEl.dataset.theme;
  T.applyTheme('neon');                                  // 非法值 → 回退浅色
  check(themeDark === 'dark' && htmlEl.dataset.theme === 'light',
    'applyTheme 只写 <html data-theme>，非法值回退浅色，不把脏值落到文档根');

  T.applyAccent('#2563EB');
  const accentSet = prefVars['--brand'];
  T.applyAccent('#000000');                              // 不在色板内 → 回退首项
  check(accentSet === '#2563EB' && prefVars['--brand'] === '#E8402A',
    'applyAccent 只写 --brand 令牌，色板外的值回退默认强调色');

  T.applyGlass(false);
  const glassOff = htmlEl.classList.contains('no-blur');
  T.applyGlass(true);
  check(glassOff === true && htmlEl.classList.contains('no-blur') === false,
    'applyGlass 用 <html class="no-blur"> 表达「关闭玻璃质感」，组件里不硬写视觉值');

  const np = T.normalizePrefs({ theme:'dark', accent:'#000000', density:9, glass:'yes', notify:false, save:true, telemetry:true });
  check(np && np.theme === 'dark' && np.accent === '#E8402A' && np.density === 1 && np.glass === true
     && np.notify === false && np.save === true && np.telemetry === true,
    'normalizePrefs 逐字段白名单：坏字段各自回默认，好字段一个不丢');
  check(T.normalizePrefs(null) === null && T.normalizePrefs([1,2]) === null && T.normalizePrefs('x') === null,
    '偏好根不是对象时返回 null，交由调用方保留当前状态（不阻断页面）');

  T.S.theme='dark'; T.S.accent='#7C4DFF'; T.S.density=0; T.S.glass=false;
  T.S.notify=false; T.S.save=false; T.S.telemetry=true;
  T.persistPrefs();
  const savedP = JSON.parse(storageData[T.PREFS_STORE_KEY]);
  check(savedP.theme==='dark' && savedP.accent==='#7C4DFF' && savedP.density===0 && savedP.glass===false
     && savedP.notify===false && savedP.save===false && savedP.telemetry===true,
    'persistPrefs 一次落盘全部 7 个外观偏好');
  T.S.theme='light'; T.S.accent='#E8402A'; T.S.density=1; T.S.glass=true;
  T.S.notify=true; T.S.save=true; T.S.telemetry=false;
  check(T.loadPrefs() === true && T.S.theme==='dark' && T.S.accent==='#7C4DFF' && T.S.density===0
     && T.S.glass===false && T.S.notify===false && T.S.save===false && T.S.telemetry===true,
    '刷新后 7 个外观偏好整体还原，不再「刷新即回默认」');
  delete storageData[T.PREFS_STORE_KEY];

  /* 源码级接线：分支必须走 applier + 落偏好，而不是直接写内联样式 */
  const appPref = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const seg = (from, to) => {
    const i = appPref.indexOf(from);
    const j = appPref.indexOf(to, i + from.length);
    return i >= 0 && j > i ? appPref.slice(i, j) : '';
  };
  check(appPref.includes('function applyPrefs(){ applyTheme(S.theme); applyAccent(S.accent); applyDensity(S.density); applyGlass(S.glass); }'),
    'applyPrefs 是唯一入口：启动时一次把主题 / 强调色 / 密度 / 玻璃质感都写回');
  const themeBranch = seg("case 'theme':", "case 'accent':");
  check(themeBranch.includes('applyTheme(S.theme)') && themeBranch.includes('persistPrefs()'),
    '设置页切换主题走 applier + 落偏好，不直接写 dataset');
  const accentBranch = seg("case 'accent': {", "case 'switch': {");
  check(accentBranch.includes('applyAccent(v)') && accentBranch.includes('persistPrefs()'),
    '设置页切换强调色走 applier + 落偏好');
  const toggleBranch = seg('function toggleTheme(){', 'function launch(');
  check(toggleBranch.includes('applyTheme(S.theme)') && toggleBranch.includes('persistPrefs()'),
    '顶栏主题按钮与设置页共用同一套 applier + 落偏好，不出现两套写法');
  const switchBranch = seg("case 'switch': {", "case 'obsidianSave':");
  check(switchBranch.includes('PREF_KEYS.includes(k)') && switchBranch.includes('persistPrefs()'),
    'switch 分支只把 PREF_KEYS 里的开关当持久状态，项目级演示开关不污染偏好');

  /* 渲染侧：开关初值必须来自 S，而不是写死在 markup 里 */
  T.S.notify=false; T.S.save=false; T.S.telemetry=true; T.S.accent='#0E8A3C'; T.S.glass=false;
  const setView2 = T.viewSettings();
  check(setView2.includes('class="switch " data-act="switch" data-k="notify"')
     && setView2.includes('class="switch " data-act="switch" data-k="save"')
     && setView2.includes('class="switch on" data-act="switch" data-k="telemetry"'),
    '通用区三个开关的 on 态由 S.notify / S.save / S.telemetry 渲染（重绘后不弹回写死值）');
  check(setView2.includes('class="swatch on" data-act="accent" data-v="#0E8A3C"'),
    '强调色选中态由 S.accent 渲染');
  check(setView2.includes('data-k="glass"') && !setView2.includes('class="switch on" data-act="switch" data-k="glass"'),
    '玻璃质感开关的 on 态由 S.glass 渲染');
  T.S.notify=true; T.S.save=true; T.S.telemetry=false; T.S.accent='#E8402A'; T.S.glass=true;

  check(!appPref.includes('tight'),
    '死类名 tight 在 app.js 里零残留（样式侧 0 条规则，markup 侧也必须 0 次）');
} catch (e) { console.log('FAIL 外观偏好 → ' + e.message); fail++; }

/* 34b. 主题切换：只换肤，不做过渡动效（用户决定撤掉整套切换动画）
   （历史上试过「全屏渐变交叉淡出」「独立涟漪层」「按钮 ::after 扩张体」「背景板」
     「快照揭罩 + 呼吸节拍」五版，全部否掉。这里既不实现，也钉成负向断言防回潮。） */
try {
  const cssT = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  const htmlT = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const appT = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

  /* ---- 形态仍在：太阳（浅色）/ 月亮（深色）由 data-theme 切换，但走硬切 ---- */
  check(/class="icon-btn theme-btn"[^>]*id="themeBtn"/.test(htmlT),
    '主题按钮仍挂 #themeBtn（app.js 的绑定按这个 id 取元素）');
  check(htmlT.includes('class="theme-rays"') && htmlT.includes('class="theme-moon-fill"'),
    '主题按钮仍是「日盘 + 光条 + 月盘」这一套图元，不是两张图片替换');
  check(/\.theme-ico \.theme-rays path\{[\s\S]*?transform:scale\(1\)\}/.test(cssT)
     && /\[data-theme="dark"\] \.theme-ico \.theme-rays path\{transform:scale\(0\)\}/.test(cssT),
    '光条：浅色 scale(1) 显示、深色 scale(0) 收起');
  check(/\.theme-ico \.theme-moon-fill\{[\s\S]*?transform:scale\(0\)\}/.test(cssT)
     && /\[data-theme="dark"\] \.theme-ico \.theme-moon-fill\{[\s\S]*?rotate\(var\(--theme-moon-turn\)\)/.test(cssT),
    '月盘：浅色 scale(0) 隐藏、深色撑开并转出月牙开口');
  check(/--theme-moon-turn:\s*-?\d+deg/.test(cssT),
    '月牙开口角度有独立令牌 --theme-moon-turn（与太阳光芒方向拉开差别）');

  /* ---- 零过渡：本按钮不许再有任何 transition / animation ---- */
  check(!/\.theme-ico[^{]*\{[^}]*transition/.test(cssT)
     && !/\.theme-btn[^{]*\{[^}]*animation/.test(cssT)
     && !/themeIconBreath/.test(cssT),
    '主题图元零过渡：没有 transition、没有呼吸 keyframes（形态随主题硬切）');

  /* ---- 整套切换动效的痕迹必须清干净 ---- */
  check(!/theme-mask/.test(cssT) && !/theme-mask/.test(htmlT),
    '揭罩层已删净（.theme-mask 在 CSS 与 markup 里都为零）');
  check(!/themeHoleOpen|theme-hole-r|theme-hole-x|theme-hole-y|--theme-floor/.test(cssT),
    '揭罩的几何与地板令牌已删净（themeHoleOpen / --theme-hole-* / --theme-floor-*）');
  check(!/--theme-breath|--theme-reveal|--theme-morph|--theme-rays-scale/.test(cssT),
    '切换动效的时长 / 曲线令牌已删净（--theme-breath / --theme-reveal / --theme-morph / --theme-rays-scale）');
  check(!/@property/.test(cssT),
    '@property 注册块已删净（那些注册只为补间服务，动效撤掉后不该留）');
  check(!/maskAutoRefresh|armThemeBurst|themeBurstDurations|burstOriginOf|burstRadiusFor|burstSkinFrom/.test(appT),
    '切换动效的 JS 函数已删净（burstOriginOf / burstRadiusFor / burstSkinFrom / armThemeBurst / themeBurstDurations）');
  check(!/theme-burst|theme-cascading|theme-breathing/.test(cssT + htmlT + appT),
    '历代被否的方案零残留（theme-burst-* / theme-cascading / theme-breathing）');

  /* ---- 首帧主题预置脚本也已删除：<head> 只留样式表链接 ---- */
  check(!/localStorage\.getItem\('apex-console\.prefs\.v1'\)/.test(htmlT),
    '首帧主题预置内联脚本已删除（head 不再预读 localStorage 猜主题）');

  /* ---- 行为：一次 toggle 必须真的换肤（同步、无动画） ---- */
  T.applyTheme(T.S.theme);                       /* 先对齐状态与 DOM，不受前面用例污染 */
  const beforeTheme = T.S.theme;
  const beforeDom = ctx.document.documentElement.dataset.theme;
  let threw = false;
  try { T.toggleTheme(); } catch (_) { threw = true; }
  check(!threw, 'toggleTheme 在任何环境下都不抛错');
  check(T.S.theme !== beforeTheme && ctx.document.documentElement.dataset.theme === T.S.theme,
    'toggleTheme 同步翻转主题：S.theme 与 <html data-theme> 一起变，且同拍到位');
  ctx.document.documentElement.dataset.theme = beforeDom; T.S.theme = beforeTheme;   /* 复原 */
} catch (e) { console.log('FAIL 主题切换 → ' + e.message); fail++; }

/* 35. 流程名缺失时的呈现：占位符不许当数据
   （后端 projects 表没有流程名字段，走控制台新建的项目也从未填过 —— 「没有名字」才是常态。
    模板里曾预置一个看着像真名的占位流程名，它跟着 JSON 深拷贝流到项目卡 / 概览 / 命令面板，
    看起来像真有这么个流程；命令面板「常用」组更因此出现多条完全同名、看不出指哪个项目的条目） */
try {
  check(T.DATA.projectTemplate.flowName === '',
    '新建项目模板不再预置占位流程名：缺名字就如实缺，不塞一个像真名的值当数据');

  check(T.flowNameOf({ flowName:'深度开发' }) === '深度开发'
     && T.flowNameOf({ flowName:'' }) === '未命名流程'
     && T.flowNameOf({}) === '未命名流程'
     && T.flowNameOf(null) === '未命名流程',
    'flowNameOf 是流程名的唯一出口：有名字用名字，没名字显示「未命名流程」，不返回空串或 undefined');

  const noName = { id:'__noname', name:'临时无名项目', st:'正常', stCls:'pst-ok', parent:null, desc:'',
    files:0, commits:0, tags:[], updated:'刚刚', ico:'focus', color:'#2563EB', flowName:'', flowDesc:'', last:'—', runs:0, steps:[] };
  T.DATA.projects.push(noName);
  const vp2 = T.viewProjects();
  check(vp2.includes('未命名流程'),
    '项目选择页的卡片 chip 对没有流程名的项目显示「未命名流程」，不再显示空值');

  const wfBefore = T.S.wf;
  T.S.wf = '__noname';
  const vw2 = T.viewWorkflows(false);
  check(vw2.includes('未命名流程') && !vw2.includes('undefined'),
    '项目详情概览的「当前流程 / 运行流程」显示「未命名流程」，且不漏 undefined');
  T.S.wf = wfBefore;
  T.DATA.projects.pop();

  const palSrc = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const pa = palSrc.indexOf("{name:'常用项目'");
  const pb = palSrc.indexOf("{name:'项目'", pa);
  const commonGroup = pa >= 0 && pb > pa ? palSrc.slice(pa, pb) : '';
  check(commonGroup.includes('t:`运行「${w.name}」`') && !commonGroup.includes('w.flowName'),
    '命令面板「常用项目」条目标签以项目名为主体：不再出现多条只写流程名、彼此完全相同的条目');
  check(!/默认流程/.test(palSrc),
    '占位流程名在 app.js 里零残留（连注释都不留，否则同字面量会污染这类反向断言）');
} catch (e) { console.log('FAIL 流程名呈现 → ' + e.message); fail++; }

/* 36. 命令面板「常用项目」：按最近使用排序
   （原来叫「常用」，装的却是全部项目、顺序就是数据顺序，既名不副实也看不出「常」在哪。
    排序键必须是可比的毫秒数，不能拿 backendTimeLabel 的展示文案排 ——「今天 00:03」与「9月22日 13:30」按字符串比毫无意义） */
try {
  check(T.lastUsedLabel({ last:'今天 00:03' }) === '今天 00:03'
     && T.lastUsedLabel({ last:'—' }) === '从未运行'
     && T.lastUsedLabel({}) === '从未运行'
     && T.lastUsedLabel(null) === '从未运行',
    'lastUsedLabel：「最近使用」缺失时读作「从未运行」，而不是显示占位破折号');
  check(T.backendEpoch('2026-09-23T16:52:03.205790+00:00') > T.backendEpoch('2026-09-23T08:19:20.289151+00:00')
     && T.backendEpoch('2026-09-23T16:52:03.205790+00:00') > 0
     && T.backendEpoch(null) === 0 && T.backendEpoch('') === 0 && T.backendEpoch('不是时间') === 0,
    'backendEpoch 把后端时间串转成可比毫秒数，缺失 / 非法一律 0（从未运行自然沉底）');

  /* 端到端：塞三个项目，只有排序键不同，看 buildPalette 的「常用项目」分组是否真的按它降序 */
  const keep = T.DATA.projects.slice();
  const mk = (id, name, lastTs, last) => ({ id, name, st:'正常', stCls:'pst-ok', parent:null, desc:'',
    files:0, commits:0, tags:[], updated:'', ico:'focus', color:'#2563EB', flowName:'', flowDesc:'',
    last, lastTs, runs:0, steps:[] });
  T.DATA.projects.length = 0;
  T.DATA.projects.push(
    mk('p-old',  '很久没跑的项目', T.backendEpoch('2026-08-01T00:00:00+00:00'), '8月1日 08:00'),
    mk('p-new',  '刚跑过的项目',   T.backendEpoch('2026-09-23T16:52:03+00:00'), '今天 00:52'),
    mk('p-never','从没跑过的项目', 0, '—')
  );
  T.buildPalette('');
  /* palItems 是全部面板条目的扁平数组，「常用项目」是第一个分组 → 取前 3 条即该分组 */
  const order = T.palItems.slice(0, 3).map(it => it.t).join(' | ');
  check(order === '运行「刚跑过的项目」 | 运行「很久没跑的项目」 | 运行「从没跑过的项目」',
    '「常用项目」按最近使用降序：刚跑过的在最前，从没跑过的沉底（顺序 = ' + order + '）');
  check(T.palItems[2].k === '从未运行' && T.palItems[0].k === '今天 00:52',
    '每条右侧提示列就是排序用的那个「最近使用」口径，顺序自己就能说明白');
  T.DATA.projects.length = 0;
  keep.forEach(p => T.DATA.projects.push(p));
} catch (e) { console.log('FAIL 常用项目 → ' + e.message); fail++; }

console.log(fail === 0 ? '\nALL_PASS' : '\nFAIL_COUNT=' + fail);
process.exit(fail === 0 ? 0 : 1);
