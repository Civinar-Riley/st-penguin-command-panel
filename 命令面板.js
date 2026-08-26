/* ============================================================
 * 命令面板 v1.0 —— 酒馆助手(JS-Slash-Runner)插件脚本
 *
 * 使用方法：
 *   酒馆助手 → 导入本 JSON 或新建脚本粘贴全部内容 → 启用
 *   酒馆助手按钮栏会出现「📜 命令面板」按钮，点击打开面板
 *
 * 功能：
 *   把酒馆自带 Slash 命令（/hide、/trigger 等）做成带功能注释的按钮，
 *   点击即执行，不用手打；底部还支持手动输入任意命令运行。
 *   命令通过官方接口 triggerSlash() 执行，与手打完全等效。
 * ============================================================ */
(async () => {
  'use strict';

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
  function escHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    { cat: '🗂 楼层管理', cmd: '/del', desc: '删除指定楼层层数（危险操作，不可撤回！）', args: '楼层数' },
    { cat: '🗂 楼层管理', cmd: '/cut', desc: '剪切掉指定楼层并使其后楼层上移（危险操作！）', args: '楼号' },

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
  max-height:calc(100vh - 90px);display:none;flex-direction:column;background:#171a21;color:#e2dfd7;
  border:1px solid #383e4d;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,.6);
  font-family:"Noto Sans SC","Segoe UI","Microsoft YaHei",sans-serif;font-size:13px;line-height:1.55}
#cmdpanel-panel.open{display:flex}
.cmdp-head{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid #282d38;
  font-family:"Noto Serif SC","Songti SC",serif;font-weight:700;font-size:15px;cursor:move;touch-action:none;user-select:none;flex-shrink:0}
.cmdp-head .sub{font-weight:400;font-size:11px;color:#8b90a0}
.cmdp-close{margin-left:auto;background:none;border:none;color:#8b90a0;font-size:17px;cursor:pointer}
.cmdp-close:hover{color:#e2dfd7}
.cmdp-toolbar{padding:10px 14px;border-bottom:1px solid #282d38;display:flex;gap:8px;flex-shrink:0}
.cmdp-toolbar input{flex:1;background:#101217;color:#e2dfd7;border:1px solid #282d38;border-radius:5px;padding:6px 10px;
  font-family:inherit;font-size:12.5px;outline:none;box-sizing:border-box}
.cmdp-toolbar input:focus{border-color:rgba(184,149,106,.35)}
.cmdp-body{overflow:auto;padding:10px 14px 14px}
.cmdp-cat{color:#b8956a;font-family:"Noto Serif SC","Songti SC",serif;font-weight:600;font-size:13px;margin:12px 0 6px;letter-spacing:.5px}
.cmdp-cat:first-child{margin-top:2px}
.cmdp-item{background:#1d212b;border:1px solid #282d38;border-radius:6px;padding:8px 10px;margin-bottom:6px}
.cmdp-row{display:flex;align-items:center;gap:8px}
.cmdp-run{background:#b8956a;border:1px solid #b8956a;color:#1a1a1a;border-radius:5px;padding:4px 11px;
  font-size:12px;cursor:pointer;white-space:nowrap;font-family:Consolas,monospace;font-weight:600;transition:all .15s}
.cmdp-run:hover{background:#9a7a52;color:#fff}
.cmdp-run:disabled{opacity:.45;cursor:not-allowed}
.cmdp-desc{color:#8b90a0;font-size:11.5px;flex:1}
.cmdp-argrow{display:flex;gap:6px;margin-top:6px}
.cmdp-argrow input{flex:1;background:#101217;color:#e2dfd7;border:1px solid #282d38;border-radius:5px;
  padding:4px 9px;font-family:inherit;font-size:12px;outline:none;box-sizing:border-box}
.cmdp-argrow input:focus{border-color:rgba(184,149,106,.35)}
.cmdp-argrow input::placeholder{color:#5c6170}
#cmdpanel-status{padding:7px 14px;border-top:1px solid #282d38;font-size:12px;min-height:18px;color:#8b90a0;
  max-height:110px;overflow:auto;white-space:pre-wrap;word-break:break-all;flex-shrink:0}
#cmdpanel-status.ok{color:#6a9b7e}
#cmdpanel-status.err{color:#c46a5e}
#cmdpanel-status.run{color:#b8956a}
.cmdp-fmtgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}
.cmdp-fmtgrid button{background:#101217;border:1px solid #282d38;color:#e2dfd7;border-radius:5px;
  padding:5px 4px;font-size:11.5px;cursor:pointer;font-family:inherit;transition:all .15s;text-align:center}
.cmdp-fmtgrid button:hover{border-color:rgba(184,149,106,.35);color:#b8956a;background:rgba(184,149,106,.08)}
`;
  doc.head.appendChild(style);

  const panel = doc.createElement('div');
  panel.id = 'cmdpanel-panel';
  panel.innerHTML = `
<div class="cmdp-head">🐧企鹅·命令面板 <span class="sub">点击即执行 · 不用手打</span>
  <button type="button" class="cmdp-close" title="关闭">✕</button></div>
<div class="cmdp-toolbar"><input id="cmdp-search" placeholder="🔍 输入关键字筛选命令…"></div>
<div class="cmdp-body">
  <div id="cmdp-list"></div>
  <div class="cmdp-cat" style="margin-top:14px">✨ 文本格式化（填文本 → 点格式 → 输出到输入框）</div>
  <div class="cmdp-item">
    <div class="cmdp-argrow"><input id="cmdp-fmt-text" placeholder="要格式化的文本"></div>
    <div class="cmdp-argrow"><input id="cmdp-fmt-url" placeholder="网址（仅「超链接」「图像」需要）"></div>
    <div class="cmdp-fmtgrid" id="cmdp-fmt-grid"></div>
  </div>
</div>
<div class="cmdp-toolbar" style="border-top:1px solid #282d38;border-bottom:none">
  <input id="cmdp-custom" placeholder='手动输入任意命令，例：/hide 3 或 /send 你好'>
  <button type="button" class="cmdp-run" id="cmdp-custom-run">▶ 运行</button>
</div>
<div id="cmdpanel-status">待命中。点按钮直接执行；带输入框的命令可先填参数。</div>`;

  doc.body.appendChild(panel);
  const $ = id => panel.querySelector('#' + id);
  const elList = $('cmdp-list'), elSearch = $('cmdp-search'),
        elCustom = $('cmdp-custom'), elStatus = $('cmdpanel-status');

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
    const kw = (filter || '').trim().toLowerCase();
    const cats = [];
    const html = [];
    COMMANDS.forEach(c => {
      if (kw && !(c.cmd.toLowerCase().includes(kw) || c.desc.toLowerCase().includes(kw))) return;
      if (!cats.includes(c.cat)) { cats.push(c.cat); html.push(`<div class="cmdp-cat">${escHtml(c.cat)}</div>`); }
      if (c.args === null && !c.fields) {
        html.push(
          `<div class="cmdp-item"><div class="cmdp-row">` +
          `<button type="button" class="cmdp-run" data-cmd="${escHtml(c.cmd)}"${c.special ? ` data-special="${escHtml(c.special)}"` : ''}>${escHtml(c.cmd)}</button>` +
          `<span class="cmdp-desc">${escHtml(c.desc)}</span></div></div>`);
      } else if (c.fields) {
        const inputs = c.fields.map(f =>
          `<input data-argfor="${escHtml(c.cmd)}" data-field="${escHtml(f.key)}" placeholder="${escHtml(f.ph)}" style="flex:1">`
        ).join('');
        html.push(
          `<div class="cmdp-item"><div class="cmdp-row">` +
          `<button type="button" class="cmdp-run" data-cmd="${escHtml(c.cmd)}" data-hasfields="1">${escHtml(c.cmd)}</button>` +
          `<span class="cmdp-desc">${escHtml(c.desc)}</span></div>` +
          `<div class="cmdp-argrow">${inputs}</div></div>`);
      } else {
        html.push(
          `<div class="cmdp-item"><div class="cmdp-row">` +
          `<button type="button" class="cmdp-run" data-cmd="${escHtml(c.cmd)}" data-hasarg="1">${escHtml(c.cmd)}</button>` +
          `<span class="cmdp-desc">${escHtml(c.desc)}</span></div>` +
          `<div class="cmdp-argrow"><input data-argfor="${escHtml(c.cmd)}" placeholder="${escHtml(c.args)}"></div></div>`);
      }
    });
    elList.innerHTML = html.join('') || '<div class="cmdp-desc" style="text-align:center;padding:16px 0">没有匹配的命令</div>';
  }

  /* 多字段命令：/sendas 改用 createChatMessages 直写接口，绕过 slash 管道（避免正文丢失） */
  elList.addEventListener('click', e => {
    const btn = e.target.closest('.cmdp-run');
    if (!btn) return;
    const cmd = btn.dataset.cmd;
    if (btn.dataset.hasfields) {
      const inputs = [...elList.querySelectorAll(`input[data-argfor="${CSS.escape(cmd)}"]`)];
      const values = {};
      inputs.forEach(inp => values[inp.dataset.field] = inp.value.trim());
      if (!values.name || !values.text) { setStatus('❌ 请把角色名和消息内容都填上再执行', 'err'); return; }
      if (cmd === '/sendas') runSendas(values);
      return;
    }
    let full = cmd;
    if (btn.dataset.hasarg) {
      const argInput = elList.querySelector(`input[data-argfor="${CSS.escape(cmd)}"]:not([data-field])`);
      const val = (argInput?.value || '').trim();
      if (val) full = cmd + ' ' + val;
    }
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
    const input = e.target.closest('input[data-argfor]');
    if (!input) return;
    const btn = elList.querySelector(`.cmdp-run[data-cmd="${CSS.escape(input.dataset.argfor)}"]`);
    btn?.click();
  });
  elSearch.addEventListener('input', () => renderList(elSearch.value));

  $('cmdp-custom-run').addEventListener('click', () => runCommand(elCustom.value));
  elCustom.addEventListener('keydown', e => { if (e.key === 'Enter') runCommand(elCustom.value); });

  /* ---------- 文本格式化 ---------- */
  const elFmtText = $('cmdp-fmt-text'), elFmtUrl = $('cmdp-fmt-url'), elFmtGrid = $('cmdp-fmt-grid');
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
      navigator.clipboard.writeText(text);
      setStatus(`⚠️ 未找到酒馆输入框，已复制到剪贴板：\n${text}`, 'err');
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

  /* ---------- 拖动（标题栏） ---------- */
  function makeDraggable(el, handle) {
    let dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
    handle.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (e.target.closest && e.target.closest('button,input')) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && getComputedStyle(el).right !== 'auto') {
        el.style.left = r.left + 'px'; el.style.top = r.top + 'px';
        el.style.right = 'auto'; el.style.bottom = 'auto';
      }
      dragging = true; moved = false; sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      e.preventDefault();
    });
    doc.addEventListener('mousemove', e => {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true;
      el.style.left = Math.min(Math.max(ox + dx, 0), doc.documentElement.clientWidth - el.offsetWidth) + 'px';
      el.style.top = Math.min(Math.max(oy + dy, 0), doc.documentElement.clientHeight - el.offsetHeight) + 'px';
    });
    doc.addEventListener('mouseup', () => { dragging = false; });
  }
  makeDraggable(panel, panel.querySelector('.cmdp-head'));

  /* ---------- 入口：酒馆助手脚本按钮（与 NPC 生成器同款位置） ---------- */
  const SCRIPT_BUTTON_NAME = '🐧企鹅·命令面板';
  appendInexistentScriptButtons([{ name: SCRIPT_BUTTON_NAME, visible: true }]);
  eventOn(getButtonEvent(SCRIPT_BUTTON_NAME), togglePanel);

  renderList('');
  setStatus('待命中。点按钮直接执行；带输入框的命令可先填参数。', '');
})();
