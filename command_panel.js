/* ============================================================
 * 命令面板 v1.4 —— 酒馆助手(JS-Slash-Runner)插件脚本
 *
 * 使用方法：
 *   酒馆助手 → 导入本 JSON 或新建脚本粘贴全部内容 → 启用
 *   酒馆助手按钮栏会出现「🐧企鹅·命令面板」按钮，点击打开面板
 *
 * 功能：
 *   把酒馆自带 Slash 命令（/hide、/trigger 等）做成带功能注释的按钮，
 *   点击即执行，不用手打；底部还支持手动输入任意命令运行。
 *   命令通过官方接口 triggerSlash() 执行，与手打完全等效。
 *
 * 更新记录：
 *   v1.4  修复 /del、/cut 的二次确认从未生效：危险标记只写在无参分支，
 *         而这两条命令带参数、走的是带参分支，导致确认框根本不弹（本次修复）；
 *         移动端适配：窄屏（≤600px）改为贴边全宽布局，避让顶栏并给底部
 *         输入区留出空间；按钮与格式化格点击目标加大到 40px；
 *         窄屏输入框字号提到 16px，避免 iOS 聚焦时自动缩放；
 *         键盘弹出时按可视视口（visualViewport）收缩面板，不遮住输入框；
 *         支持 iOS 安全区与滚动链隔离（overscroll-behavior）；
 *         拖动改为 Pointer Events 优先、mouse/touch 事件兜底
 *         （部分 WebView 不支持 Pointer Events）；外层补 catch 兜底
 *   v1.3  参数输入框支持 Shift+Enter 换行；
 *         多行/含特殊字符参数自动加引号转义，防止正文被管道截断；
 *         /del、/cut 危险命令增加二次确认；
 *         搜索筛选不再丢失已填参数；拖动改用 Pointer Events 修复监听器泄漏
 *   v1.2  修复代码标识符损坏；底部命令输入框支持 Shift+Enter 换行
 *   v1.0  首个版本
 * ============================================================ */
(async () => {
  'use strict';

  /* 版本号的唯一来源：状态栏显示、打包脚本的 info 字段都从这里取 */
  const VERSION = 'v1.4';

  /* ---------- 等待环境就绪 ---------- */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let waited = 0;
  while (typeof triggerSlash !== 'function'
    || typeof appendInexistentScriptButtons !== 'function'
    || typeof getButtonEvent !== 'function'
    || typeof eventOn !== 'function') {
    if ((waited += 500) > 15000) {
      console.error('[命令面板] 未检测到酒馆助手接口(triggerSlash/脚本按钮)，请确认酒馆助手已启用');
      return;
    }
    await sleep(500);
  }

  function hostDoc() {
    try { const d = window.parent.document; if (d && d.body) return d; } catch (e) {}
    return document;
  }
  /* 脚本跑在 iframe 里，尺寸与可视视口都要问宿主窗口，否则拿到的是隐藏 iframe 自己的 */
  function hostWin() {
    try { const w = window.parent; if (w && w.document) return w; } catch (e) {}
    return window;
  }
  function escHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function quoteArg(v) {
    return /[\s"|]/.test(v)
      ? '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
      : v;
  }

  /* ---------- 命令定义（args 为 null 表示无需参数） ---------- */
  const COMMANDS = [
    { cat: '🚀 生成与发言', cmd: '/trigger', desc: '立即触发一次 AI 回复', args: null },
    { cat: '🚀 生成与发言', cmd: '/continue', desc: '让 AI 从最后一条消息继续往下写', args: null },
    { cat: '🚀 生成与发言', cmd: '/impersonate', desc: 'AI 以你的口吻代写一条发言，写入输入框供你确认', args: null },
    { cat: '🚀 生成与发言', cmd: '/swipe', desc: '给最后的 AI 回复换一个新版本（等同左划）', args: '补充提示词（可留空）' },
    { cat: '🚀 生成与发言', cmd: '/send', desc: '以你的身份追加一条消息（不会触发回复）', args: '消息内容' },
    { cat: '🚀 生成与发言', cmd: '/sendas', desc: '以指定角色的身份追加一条消息',
      fields: [{ key: 'name', ph: '角色名' }, { key: 'text', ph: '消息内容' }] },
    { cat: '🚀 生成与发言', cmd: '/sys', desc: '插入一条系统旁白楼层（AI 能看到的舞台指示）', args: '旁白内容' },

    { cat: '🗂 楼层管理', cmd: '/hide', desc: '隐藏楼层：不发送给 AI，但界面上仍可见（默认最后一楼）', args: '楼号（可留空＝最后一楼）' },
    { cat: '🗂 楼层管理', cmd: '/unhide', desc: '取消隐藏，恢复把该楼层发给 AI', args: '楼号（可留空＝最后一楼）' },
    { cat: '🗂 楼层管理', cmd: '/del', desc: '删除指定楼层层数（危险操作，不可撤回！）', args: '楼层数', danger: true },
    { cat: '🗂 楼层管理', cmd: '/cut', desc: '剪切掉指定楼层并使其后楼层上移（危险操作！）', args: '楼号', danger: true },
    { cat: '🗂 楼层管理', cmd: '/chat-jump', desc: '将聊天视图滚动到指定的消息索引', args: '消息索引（从 0 开始）' },

    { cat: '💬 聊天管理', cmd: '/newchat', desc: '新开一个空白聊天', args: null },
    { cat: '💬 聊天管理', cmd: '/getchatname', desc: '查看当前聊天的文件名（结果显示在状态栏）', args: null },

    { cat: '🔧 其他', cmd: '/echo', desc: '在酒馆界面弹出一条提示文字', args: '要显示的文字' },
    { cat: '🔧 其他', cmd: '/help', desc: '打开酒馆自带的命令帮助面板', args: null },

    { cat: '🖥 界面切换', cmd: '/bubble', desc: '切换为消息气泡模式', args: null },
    { cat: '🖥 界面切换', cmd: '/flat', desc: '切换为扁平消息模式', args: null },
    { cat: '🖥 界面切换', cmd: '/single', desc: '切换为单行消息模式', args: null },
    { cat: '🖥 界面切换', cmd: '/panels', desc: '显示 / 隐藏 UI 面板', args: null },
    { cat: '🖥 界面切换', cmd: '/reload-page', desc: '刷新酒馆页面（未发送的输入内容会丢失！）', args: null },
  ];

  /* ---------- 文本格式化（包装后输出到酒馆输入框，不直接发送） ---------- */
  const FORMATS = [
    { label: '斜体', hint: '*文本*', wrap: t => `*${t}*` },
    { label: '粗体', hint: '**文本**', wrap: t => `**${t}**` },
    { label: '粗斜体', hint: '***文本***', wrap: t => `***${t}***` },
    { label: '下划线', hint: '__文本__', wrap: t => `__${t}__` },
    { label: '删除线', hint: '~~文本~~', wrap: t => `~~${t}~~` },
    { label: '行内代码', hint: '`文本`', wrap: t => '`' + t + '`' },
    { label: '代码块', hint: '```文本```', wrap: t => '\n```\n' + t + '\n```\n' },
    { label: '引用', hint: '> 文本', wrap: t => `> ${t}` },
    { label: '大标题', hint: '# 文本', wrap: t => `# ${t}` },
    { label: '中标题', hint: '## 文本', wrap: t => `## ${t}` },
    { label: '小标题', hint: '### 文本', wrap: t => `### ${t}` },
    { label: '超链接', hint: '[文本](网址)', needUrl: true, wrap: (t, u) => `[${t}](${u})` },
    { label: '图像', hint: '![文本](网址)', needUrl: true, wrap: (t, u) => `![${t}](${u})` },
  ];

  /* ---------- 界面 ---------- */
  const doc = hostDoc();
  ['cmdpanel-entry', 'cmdpanel-entry-fallback', 'cmdpanel-panel', 'cmdpanel-style'].forEach(id => doc.getElementById(id)?.remove());

  const style = doc.createElement('style');
  style.id = 'cmdpanel-style';
  style.textContent = `
#cmdpanel-panel{position:fixed;right:24px;top:64px;z-index:99991;width:min(480px,calc(100vw - 30px));
  max-height:calc(var(--cmdp-vvh,100vh) - 90px);display:none;flex-direction:column;background:#171a21;color:#e2dfd7;
  border:1px solid #383e4d;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,.6);
  -webkit-text-size-adjust:100%;overscroll-behavior:contain;
  font-family:"Noto Sans SC","Segoe UI","Microsoft YaHei",sans-serif;font-size:13px;line-height:1.55}
#cmdpanel-panel.open{display:flex}
.cmdp-head{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid #282d38;
  font-family:"Noto Serif SC","Songti SC",serif;font-weight:700;font-size:15px;cursor:move;touch-action:none;user-select:none;flex-shrink:0}
.cmdp-head .sub{font-weight:400;font-size:11px;color:#8b90a0}
.cmdp-close{margin-left:auto;background:none;border:none;color:#8b90a0;font-size:17px;cursor:pointer;touch-action:manipulation}
.cmdp-close:hover{color:#e2dfd7}
.cmdp-toolbar{padding:10px 14px;border-bottom:1px solid #282d38;display:flex;gap:8px;flex-shrink:0}
.cmdp-toolbar input{flex:1;background:#101217;color:#e2dfd7;border:1px solid #282d38;border-radius:5px;padding:6px 10px;
  font-family:inherit;font-size:12.5px;outline:none;box-sizing:border-box}
.cmdp-toolbar input:focus{border-color:rgba(184,149,106,.35)}
#cmdp-custom{flex:1;background:#101217;color:#e2dfd7;border:1px solid #282d38;border-radius:5px;padding:6px 10px;
  font-family:inherit;font-size:12.5px;line-height:1.5;outline:none;box-sizing:border-box;
  resize:none;min-height:34px;max-height:160px;overflow-y:auto}
#cmdp-custom:focus{border-color:rgba(184,149,106,.35)}
.cmdp-body{overflow:auto;padding:10px 14px 14px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.cmdp-cat{color:#b8956a;font-family:"Noto Serif SC","Songti SC",serif;font-weight:600;font-size:13px;margin:12px 0 6px;letter-spacing:.5px}
.cmdp-cat:first-child{margin-top:2px}
.cmdp-item{background:#1d212b;border:1px solid #282d38;border-radius:6px;padding:8px 10px;margin-bottom:6px}
.cmdp-row{display:flex;align-items:center;gap:8px}
.cmdp-run{background:#b8956a;border:1px solid #b8956a;color:#1a1a1a;border-radius:5px;padding:4px 11px;
  font-size:12px;cursor:pointer;white-space:nowrap;font-family:Consolas,monospace;font-weight:600;transition:all .15s;
  touch-action:manipulation}
.cmdp-run:hover{background:#9a7a52;color:#fff}
.cmdp-run:disabled{opacity:.45;cursor:not-allowed}
.cmdp-desc{color:#8b90a0;font-size:11.5px;flex:1}
.cmdp-argrow{display:flex;gap:6px;margin-top:6px}
.cmdp-argrow input{flex:1;background:#101217;color:#e2dfd7;border:1px solid #282d38;border-radius:5px;
  padding:4px 9px;font-family:inherit;font-size:12px;outline:none;box-sizing:border-box}
.cmdp-argrow input:focus{border-color:rgba(184,149,106,.35)}
.cmdp-argrow input::placeholder{color:#5c6170}
.cmdp-argrow textarea{flex:1;background:#101217;color:#e2dfd7;border:1px solid #282d38;border-radius:5px;
  padding:4px 9px;font-family:inherit;font-size:12px;line-height:1.5;outline:none;box-sizing:border-box;
  resize:none;min-height:30px;max-height:140px;overflow-y:auto}
.cmdp-argrow textarea:focus{border-color:rgba(184,149,106,.35)}
.cmdp-argrow textarea::placeholder{color:#5c6170}
#cmdpanel-status{padding:7px 14px;border-top:1px solid #282d38;font-size:12px;min-height:18px;color:#8b90a0;
  max-height:110px;overflow:auto;white-space:pre-wrap;word-break:break-all;flex-shrink:0}
#cmdpanel-status.ok{color:#6a9b7e}
#cmdpanel-status.err{color:#c46a5e}
#cmdpanel-status.run{color:#b8956a}
.cmdp-fmtgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}
.cmdp-fmtgrid button{background:#101217;border:1px solid #282d38;color:#e2dfd7;border-radius:5px;
  padding:5px 4px;font-size:11.5px;cursor:pointer;font-family:inherit;transition:all .15s;text-align:center;
  touch-action:manipulation}
.cmdp-fmtgrid button:hover{border-color:rgba(184,149,106,.35);color:#b8956a;background:rgba(184,149,106,.08)}

/* ---------- 移动端 / 窄屏适配 ---------- */
@media (max-width:600px){
  #cmdpanel-panel{left:8px;right:8px;top:56px;width:auto;border-radius:12px;
    max-height:calc(var(--cmdp-vvh,100vh) * .62);
    padding-bottom:env(safe-area-inset-bottom,0)}
  .cmdp-head{padding:12px 14px;cursor:default}
  .cmdp-head .sub{display:none}
  /* margin 简写会覆盖掉上面的 margin-left:auto，导致 ✕ 掉到标题后面，这里补回来 */
  .cmdp-close{font-size:22px;min-width:44px;min-height:44px;margin:-8px -10px -8px auto}
  .cmdp-body{padding:8px 12px 12px}
  .cmdp-toolbar{padding:8px 12px}
  .cmdp-item{padding:9px 10px;margin-bottom:8px}
  .cmdp-row{flex-wrap:wrap}
  .cmdp-desc{font-size:12.5px;min-width:0}
  .cmdp-run{padding:10px 14px;font-size:13px;min-height:40px}
  .cmdp-fmtgrid{grid-template-columns:repeat(3,1fr);gap:7px}
  .cmdp-fmtgrid button{padding:10px 4px;font-size:12.5px;min-height:40px}
  #cmdpanel-status{font-size:12.5px}
  /* 手动命令框与「运行」并排时占位提示会被挤掉，窄屏改成上下两行 */
  .cmdp-sendbar{flex-direction:column}
  .cmdp-sendbar .cmdp-run{width:100%}
  /* 16px 是 iOS Safari 触发聚焦自动缩放的阈值，低于它点输入框会整页放大 */
  .cmdp-toolbar input,#cmdp-custom,.cmdp-argrow input,.cmdp-argrow textarea{font-size:16px}
}
@media (pointer:coarse){
  /* 宽屏触屏设备（如横屏平板）走不到上面的窄屏规则，这里单独保证点击目标 */
  .cmdp-run,.cmdp-fmtgrid button{min-height:40px}
}
`;
  doc.head.appendChild(style);

  const panel = doc.createElement('div');
  panel.id = 'cmdpanel-panel';
  panel.innerHTML = `
<div class="cmdp-head">🐧企鹅·命令面板 <span class="sub">${VERSION} · 点击即执行</span>
  <button type="button" class="cmdp-close" title="关闭">✕</button></div>
<div class="cmdp-toolbar"><input id="cmdp-search" placeholder="🔍 输入关键字筛选命令…"></div>
<div class="cmdp-body">
  <div id="cmdp-list"></div>
  <div class="cmdp-cat" style="margin-top:14px">✨ 文本格式化（填文本 → 点格式 → 输出到输入框）</div>
  <div class="cmdp-item">
    <div class="cmdp-argrow"><textarea rows="1" id="cmdp-fmt-text" placeholder="要格式化的文本（Shift+Enter 换行）"></textarea></div>
    <div class="cmdp-argrow"><input id="cmdp-fmt-url" placeholder="网址（仅「超链接」「图像」需要）"></div>
    <div class="cmdp-fmtgrid" id="cmdp-fmt-grid"></div>
  </div>
</div>
<div class="cmdp-toolbar cmdp-sendbar" style="border-top:1px solid #282d38;border-bottom:none">
  <textarea id="cmdp-custom" rows="1" placeholder='手动输入任意命令，例：/hide 3 或 /send 你好（Enter 运行，Shift+Enter 换行）'></textarea>
  <button type="button" class="cmdp-run" id="cmdp-custom-run">▶ 运行</button>
</div>
<div id="cmdpanel-status">待命中（${VERSION}）。点按钮直接执行；带输入框的命令可先填参数。</div>`;

  doc.body.appendChild(panel);
  const $ = id => panel.querySelector('#' + id);
  const elList = $('cmdp-list'), elSearch = $('cmdp-search'),
        elCustom = $('cmdp-custom'), elStatus = $('cmdpanel-status');

  /* ---------- 移动端：面板高度跟随可视视口 ----------
     手机浏览器地址栏收放、软键盘弹出都会改变 visualViewport 高度；用 100vh 会算上被遮住的
     部分，导致面板底部（状态栏、手动命令框）被软键盘盖住。这里把可视高度写进 CSS 变量，
     面板的 max-height 跟着变，键盘弹起时自动收缩。 */
  try {
    const vv = hostWin().visualViewport;
    if (vv) {
      const syncViewport = () => panel.style.setProperty('--cmdp-vvh', Math.round(vv.height) + 'px');
      syncViewport();
      vv.addEventListener('resize', syncViewport);
      vv.addEventListener('scroll', syncViewport);
    }
  } catch (e) {
    console.warn('[命令面板] 可视视口自适应不可用，回退 100vh', e);
  }

  function setStatus(text, cls) {
    elStatus.textContent = text;
    elStatus.className = cls || '';
  }

  /* ---------- 执行命令 ---------- */
  let running = false;
  async function runCommand(cmd) {
    if (!cmd || !cmd.trim()) return;
    if (running) return;
    running = true;
    setStatus(`正在执行 ${cmd.split(/\s+/)[0]} …`, 'run');
    const t0 = performance.now();
    try {
      const result = await triggerSlash(cmd.trim());
      const cost = (performance.now() - t0).toFixed(1);
      const head = cmd.trim().split(/\s+/)[0];
      if (result === undefined || result === '') {
        setStatus(`✅ ${head} 执行成功（${cost}ms，无返回值）`, 'ok');
      } else {
        setStatus(`✅ ${head} 执行成功（${cost}ms），返回值：\n${result}`, 'ok');
      }
    } catch (e) {
      console.error('[命令面板]', e);
      setStatus(`❌ 执行失败：${e.message}\n请检查参数格式是否正确`, 'err');
    } finally {
      running = false;
    }
  }

  /* ---------- 渲染命令列表 ---------- */
  function renderList(filter) {
    const prev = {};
    elList.querySelectorAll('[data-argfor]').forEach(t => {
      prev[t.dataset.argfor + '|' + (t.dataset.field || '')] = t.value;
    });
    const kw = (filter || '').trim().toLowerCase();
    const cats = [];
    const html = [];
    COMMANDS.forEach(c => {
      if (kw && !(c.cmd.toLowerCase().includes(kw) || c.desc.toLowerCase().includes(kw))) return;
      if (!cats.includes(c.cat)) { cats.push(c.cat); html.push(`<div class="cmdp-cat">${escHtml(c.cat)}</div>`); }
      /* 危险标记三个分支都要带：/del 与 /cut 是带参命令，走的是最后一个分支，
         只在无参分支输出的话二次确认永远不会触发 */
      const danger = c.danger ? ' data-danger="1"' : '';
      if (c.args === null && !c.fields) {
        html.push(
          `<div class="cmdp-item"><div class="cmdp-row">` +
          `<button type="button" class="cmdp-run" data-cmd="${escHtml(c.cmd)}"${danger}>${escHtml(c.cmd)}</button>` +
          `<span class="cmdp-desc">${escHtml(c.desc)}</span></div></div>`);
      } else if (c.fields) {
        const inputs = c.fields.map(f =>
          `<textarea rows="1" data-argfor="${escHtml(c.cmd)}" data-field="${escHtml(f.key)}" placeholder="${escHtml(f.ph)}" style="flex:1"></textarea>`
        ).join('');
        html.push(
          `<div class="cmdp-item"><div class="cmdp-row">` +
          `<button type="button" class="cmdp-run" data-cmd="${escHtml(c.cmd)}" data-hasfields="1"${danger}>${escHtml(c.cmd)}</button>` +
          `<span class="cmdp-desc">${escHtml(c.desc)}</span></div>` +
          `<div class="cmdp-argrow">${inputs}</div></div>`);
      } else {
        html.push(
          `<div class="cmdp-item"><div class="cmdp-row">` +
          `<button type="button" class="cmdp-run" data-cmd="${escHtml(c.cmd)}" data-hasarg="1"${danger}>${escHtml(c.cmd)}</button>` +
          `<span class="cmdp-desc">${escHtml(c.desc)}</span></div>` +
          `<div class="cmdp-argrow"><textarea rows="1" data-argfor="${escHtml(c.cmd)}" placeholder="${escHtml(c.args)}"></textarea></div></div>`);
      }
    });
    elList.innerHTML = html.join('') || '<div class="cmdp-desc" style="text-align:center;padding:16px 0">没有匹配的命令</div>';
    elList.querySelectorAll('[data-argfor]').forEach(t => {
      const v = prev[t.dataset.argfor + '|' + (t.dataset.field || '')];
      if (v) { t.value = v; t.style.height = Math.min(t.scrollHeight, 140) + 'px'; }
    });
  }

  /* 多字段命令：/sendas 改用 createChatMessages 直写接口，绕过 slash 管道（避免正文丢失） */
  elList.addEventListener('click', e => {
    const btn = e.target.closest('.cmdp-run');
    if (!btn) return;
    const cmd = btn.dataset.cmd;
    if (btn.dataset.hasfields) {
      const inputs = [...elList.querySelectorAll(`[data-argfor="${CSS.escape(cmd)}"]`)];
      const values = {};
      inputs.forEach(inp => values[inp.dataset.field] = inp.value.trim());
      if (!values.name || !values.text) { setStatus('❌ 请把角色名和消息内容都填上再执行', 'err'); return; }
      if (cmd === '/sendas') runSendas(values);
      return;
    }
    let full = cmd;
    if (btn.dataset.hasarg) {
      const argInput = elList.querySelector(`[data-argfor="${CSS.escape(cmd)}"]:not([data-field])`);
      const val = (argInput?.value || '').trim();
      if (val) full = cmd + ' ' + quoteArg(val);
    }
    if (btn.dataset.danger && !confirm(`确认执行 ${cmd}？该操作不可撤回！`)) return;
    runCommand(full);
  });

  async function runSendas(v) {
    if (running) return;
    running = true;
    setStatus(`正在以「${v.name}」的身份追加消息…`, 'run');
    const t0 = performance.now();
    try {
      await createChatMessages([{ name: v.name, role: 'assistant', message: v.text }]);
      const cost = (performance.now() - t0).toFixed(1);
      setStatus(`✅ 已以「${v.name}」的身份追加一条消息（${cost}ms）：\n${v.text}`, 'ok');
    } catch (err) {
      console.error('[命令面板] /sendas 失败', err);
      setStatus(`❌ 发送失败：${err.message}`, 'err');
    } finally {
      running = false;
    }
  }
  elList.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.shiftKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    const ta = e.target.closest('textarea[data-argfor]');
    if (!ta) return;
    e.preventDefault();
    const btn = elList.querySelector(`.cmdp-run[data-cmd="${CSS.escape(ta.dataset.argfor)}"]`);
    btn?.click();
  });
  elList.addEventListener('input', e => {
    const ta = e.target.closest('textarea[data-argfor]');
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  });
  elSearch.addEventListener('input', () => renderList(elSearch.value));

  $('cmdp-custom-run').addEventListener('click', () => runCommand(elCustom.value));
  elCustom.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    e.preventDefault();
    runCommand(elCustom.value);
  });
  elCustom.addEventListener('input', () => {
    elCustom.style.height = 'auto';
    elCustom.style.height = Math.min(elCustom.scrollHeight, 160) + 'px';
  });

  /* ---------- 文本格式化 ---------- */
  const elFmtText = $('cmdp-fmt-text'), elFmtUrl = $('cmdp-fmt-url'), elFmtGrid = $('cmdp-fmt-grid');
  elFmtText.addEventListener('input', () => {
    elFmtText.style.height = 'auto';
    elFmtText.style.height = Math.min(elFmtText.scrollHeight, 140) + 'px';
  });
  elFmtGrid.innerHTML = FORMATS.map((f, i) =>
    `<button type="button" data-fi="${i}" title="${escHtml(f.hint)}">${escHtml(f.label)}</button>`
  ).join('');
  function outputToInputBox(text) {
    const ta = doc.querySelector('#send_textarea');
    if (ta) {
      const existing = ta.value.replace(/\s+$/, '');
      ta.value = existing ? existing + '\n' + text : text;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      setStatus(`✅ 已输出到输入框：\n${text}`, 'ok');
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
        .then(() => setStatus(`⚠️ 未找到酒馆输入框，已复制到剪贴板：\n${text}`, 'err'))
        .catch(err => setStatus(`❌ 复制到剪贴板失败：${err.message}\n已生成：\n${text}`, 'err'));
    } else {
      setStatus(`已生成：\n${text}`, 'ok');
    }
  }
  elFmtGrid.addEventListener('click', e => {
    const btn = e.target.closest('button[data-fi]');
    if (!btn) return;
    const f = FORMATS[+btn.dataset.fi];
    const text = elFmtText.value.trim();
    if (!text) { setStatus('❌ 请先填写要格式化的文本', 'err'); return; }
    let url = elFmtUrl.value.trim();
    if (f.needUrl && !url) { setStatus(`❌ 「${f.label}」需要填写网址`, 'err'); return; }
    if (!f.needUrl) url = '';
    outputToInputBox(f.wrap(text, url));
  });

  function togglePanel() {
    panel.classList.toggle('open');
  }
  panel.querySelector('.cmdp-close').addEventListener('click', () => panel.classList.remove('open'));

  /* ---------- 拖动（标题栏） ----------
     Pointer Events 优先：可用指针捕获，指针移出标题栏也不丢事件，且监听器只挂一次不泄漏。
     但部分 WebView 没有 Pointer Events，因此退回 mousedown/mousemove + touchstart/touchmove，
     否则手机上将完全拖不动。 */
  function makeDraggable(el, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    const canDrag = t => !(t.closest && t.closest('button,input,textarea'));
    function begin(x, y) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && getComputedStyle(el).right !== 'auto') {
        el.style.left = r.left + 'px'; el.style.top = r.top + 'px';
        el.style.right = 'auto'; el.style.bottom = 'auto';
      }
      sx = x; sy = y; ox = r.left; oy = r.top; dragging = true;
    }
    function move(x, y) {
      if (!dragging) return;
      el.style.left = Math.min(Math.max(ox + x - sx, 0), doc.documentElement.clientWidth - el.offsetWidth) + 'px';
      el.style.top = Math.min(Math.max(oy + y - sy, 0), doc.documentElement.clientHeight - el.offsetHeight) + 'px';
    }
    const stop = () => { dragging = false; };

    if (typeof hostWin().PointerEvent === 'function' && handle.setPointerCapture) {
      const captured = e => !handle.hasPointerCapture || handle.hasPointerCapture(e.pointerId);
      handle.addEventListener('pointerdown', e => {
        if (e.button !== 0 || !canDrag(e.target)) return;
        begin(e.clientX, e.clientY);
        try { handle.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault();
      });
      handle.addEventListener('pointermove', e => { if (captured(e)) move(e.clientX, e.clientY); });
      handle.addEventListener('pointerup', e => { stop(); try { handle.releasePointerCapture(e.pointerId); } catch (err) {} });
      handle.addEventListener('pointercancel', e => { stop(); try { handle.releasePointerCapture(e.pointerId); } catch (err) {} });
    } else {
      handle.addEventListener('mousedown', e => {
        if (e.button !== 0 || !canDrag(e.target)) return;
        begin(e.clientX, e.clientY);
        e.preventDefault();
      });
      handle.addEventListener('touchstart', e => {
        if (e.touches.length !== 1 || !canDrag(e.target)) return;
        begin(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: true });
      doc.addEventListener('mousemove', e => move(e.clientX, e.clientY));
      doc.addEventListener('mouseup', stop);
      doc.addEventListener('touchmove', e => {
        if (!dragging || e.touches.length !== 1) return;
        move(e.touches[0].clientX, e.touches[0].clientY);
        e.preventDefault();   // 拖动期间拦住页面滚动；touch-action 不被支持时靠这里兜底
      }, { passive: false });
      doc.addEventListener('touchend', stop);
      doc.addEventListener('touchcancel', stop);
    }
  }
  makeDraggable(panel, panel.querySelector('.cmdp-head'));

  /* ---------- 入口：酒馆助手脚本按钮（与 NPC 生成器同款位置） ---------- */
  const SCRIPT_BUTTON_NAME = '🐧企鹅·命令面板';
  appendInexistentScriptButtons([{ name: SCRIPT_BUTTON_NAME, visible: true }]);
  eventOn(getButtonEvent(SCRIPT_BUTTON_NAME), togglePanel);

  renderList('');
  setStatus(`待命中（${VERSION}）。点按钮直接执行；带输入框的命令可先填参数。`, '');
})().catch(e => console.error('[命令面板] 启动失败：', e));
