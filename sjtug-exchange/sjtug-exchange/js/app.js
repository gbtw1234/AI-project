/* app.js — 上海交通大学二手·技能交换平台 主逻辑 */
(function () {
  Store.seed();

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const view = $('#view');

  const marketFilters = { q: '', min: '', max: '', cond: '' };
  const exFilters = { kind: 'need', q: '', cat: '' };
  let activeChat = null; // other user id

  /* ---------------- 工具 ---------------- */
  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtTime(ts) {
    const d = new Date(ts), now = Date.now();
    const diff = (now - ts) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前';
    return d.getMonth() + 1 + '-' + d.getDate();
  }
  function money(v) { return '¥' + Number(v).toFixed(Number.isInteger(v) ? 0 : 2); }
  function condClass(c) {
    c = Number(c);
    if (c >= 9) return 'c-new';
    if (c >= 7) return 'c-good';
    if (c >= 5) return 'c-ok';
    return 'c-old';
  }
  function condBadge(c) { return '<span class="cond ' + condClass(c) + '">' + c + ' 成新</span>'; }
  function photoHtml(photos, alt) {
    if (photos && photos.length) {
      return '<div class="card-photos">' + photos.slice(0, 3).map(p =>
        '<img src="' + p + '" alt="' + escapeHtml(alt) + '">').join('') + '</div>';
    }
    const ch = (alt || '?').trim().charAt(0);
    return '<div class="card-photo-ph">' + escapeHtml(ch) + '</div>';
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1800);
  }

  /* ---------------- 头部 / 身份 ---------------- */
  function renderHeader() {
    const u = Store.getCurrentUser();
    const chip = $('#userChip');
    chip.innerHTML = '<span class="avatar">' + escapeHtml(u.name.charAt(0)) + '</span><span>' +
      escapeHtml(u.name) + '</span><span class="switch">切换 ▾</span>';
    chip.onclick = openIdentity;
    const badge = $('#msgBadge');
    const un = Store.totalUnread(u.id);
    badge.textContent = un ? un : '';
    badge.style.display = un ? 'inline-block' : 'none';
  }

  function openIdentity() {
    const users = Store.getUsers();
    const cur = Store.getCurrentUser();
    modal('切换 / 新增身份', `
      <p class="hint">本平台数据保存在本地浏览器。切换身份可模拟不同同学，体验双方互发消息。</p>
      <div class="user-list">
        ${users.map(u => `<div class="user-row ${u.id === cur.id ? 'cur' : ''}" data-uid="${u.id}">
            <span class="avatar">${escapeHtml(u.name.charAt(0))}</span>
            <span class="uname">${escapeHtml(u.name)}</span>
            <span class="tag">${u.id === cur.id ? '当前' : '点击切换'}</span>
          </div>`).join('')}
      </div>
      <div class="row" style="margin-top:12px">
        <input id="newName" placeholder="输入新昵称（如 交大-小王）" />
        <button class="btn" id="addUserBtn">新增并切换</button>
      </div>
    `);
    $$('.user-row', $('#modal-body')).forEach(r => r.onclick = () => {
      const u = Store.getUser(r.dataset.uid);
      Store.setCurrentUser(u); closeModal(); renderHeader(); renderAll();
    });
    $('#addUserBtn').onclick = () => {
      const n = $('#newName').value.trim();
      if (!n) return toast('请输入昵称');
      const u = Store.addUser(n); Store.setCurrentUser(u);
      closeModal(); renderHeader(); renderAll(); toast('已切换为 ' + n);
    };
  }

  /* ---------------- 物品市场 ---------------- */
  function renderMarket() {
    const items = Store.getItems();
    const f = marketFilters;
    const filtered = items.filter(it => {
      if (f.q && !(it.title + it.desc).toLowerCase().includes(f.q.toLowerCase())) return false;
      if (f.min !== '' && Number(it.price) < Number(f.min)) return false;
      if (f.max !== '' && Number(it.price) > Number(f.max)) return false;
      if (f.cond !== '' && Number(it.conditionSelf) < Number(f.cond)) return false;
      return true;
    });

    view.innerHTML = `
      <div class="filters">
        <input id="fQ" placeholder="🔍 搜索物品 / 关键词" value="${escapeHtml(f.q)}">
        <div class="price-range">
          <input id="fMin" type="number" placeholder="最低价" value="${escapeHtml(f.min)}">
          <span>—</span>
          <input id="fMax" type="number" placeholder="最高价" value="${escapeHtml(f.max)}">
        </div>
        <select id="fCond">
          <option value="">几成新（不限）</option>
          ${[10,9,8,7,6,5,4,3].map(c => `<option value="${c}" ${f.cond == c ? 'selected' : ''}>≥ ${c} 成新</option>`).join('')}
        </select>
        <button class="btn ghost" id="fReset">重置</button>
      </div>
      <div class="count">共 ${filtered.length} 件物品</div>
      <div class="grid">
        ${filtered.length ? filtered.map(itemCard).join('') : '<div class="empty">没有符合条件的物品，换个筛选试试～</div>'}
      </div>`;

    $('#fQ').oninput = e => { f.q = e.target.value; renderMarket(); };
    $('#fMin').onchange = e => { f.min = e.target.value; renderMarket(); };
    $('#fMax').onchange = e => { f.max = e.target.value; renderMarket(); };
    $('#fCond').onchange = e => { f.cond = e.target.value; renderMarket(); };
    $('#fReset').onclick = () => { marketFilters.q = marketFilters.min = marketFilters.max = marketFilters.cond = ''; renderMarket(); };
  }

  function itemCard(it) {
    const owner = Store.getUser(it.ownerId) || { name: '未知用户' };
    const me = Store.getCurrentUser();
    const isMine = it.ownerId === me.id;
    return `
      <div class="card ${isMine ? 'mine' : ''}">
        ${photoHtml(it.photos, it.title)}
        <div class="card-body">
          <div class="card-title">${escapeHtml(it.title)}</div>
          <div class="card-meta">
            ${condBadge(it.conditionSelf)}
            <span class="price">${money(it.price)}</span>
          </div>
          <div class="card-desc">${escapeHtml(it.desc)}</div>
          <div class="card-foot">
            <span class="owner">${escapeHtml(owner.name)}</span>
            ${isMine
              ? `<button class="btn tiny danger" data-act="del-item" data-id="${it.id}">删除</button>`
              : `<button class="btn tiny" data-act="chat" data-uid="${it.ownerId}">💬 私信</button>`}
          </div>
          ${it.aiNote ? `<div class="ai-note">🤖 AI 估算 ${it.conditionAI} 成新（${it.aiNote}）${it.aiSource === 'api' ? ' <span class="src-badge">🧠 模型</span>' : ''}</div>` : ''}
        </div>
      </div>`;
  }

  /* ---------------- 需求 · 技能 ---------------- */
  function renderExchange() {
    const f = exFilters;
    const posts = Store.getPosts().filter(p => p.kind === f.kind).filter(p => {
      if (f.q && !(p.title + p.desc + p.category).toLowerCase().includes(f.q.toLowerCase())) return false;
      if (f.cat && p.category !== f.cat) return false;
      return true;
    });
    const cats = [...new Set(Store.getPosts().filter(p => p.kind === f.kind).map(p => p.category))];

    view.innerHTML = `
      <div class="seg">
        <button class="${f.kind === 'need' ? 'on' : ''}" data-ex="need">🙋 需求（${Store.getPosts().filter(p=>p.kind==='need').length}）</button>
        <button class="${f.kind === 'skill' ? 'on' : ''}" data-ex="skill">🛠️ 技能（${Store.getPosts().filter(p=>p.kind==='skill').length}）</button>
      </div>
      <div class="filters">
        <input id="eQ" placeholder="🔍 搜索 ${f.kind === 'need' ? '需求' : '技能'} / 分类" value="${escapeHtml(f.q)}">
        <select id="eCat">
          <option value="">全部分类</option>
          ${cats.map(c => `<option value="${escapeHtml(c)}" ${f.cat === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
        </select>
        <button class="btn ghost" id="eReset">重置</button>
      </div>
      <div class="grid">
        ${posts.length ? posts.map(postCard).join('') : '<div class="empty">暂无内容，点击右上角「＋发布」来发布' + (f.kind === 'need' ? '需求' : '技能') + '吧～</div>'}
      </div>`;

    $$('.seg button', view).forEach(b => b.onclick = () => { f.kind = b.dataset.ex; f.q = ''; f.cat = ''; renderExchange(); });
    $('#eQ').oninput = e => { f.q = e.target.value; renderExchange(); };
    $('#eCat').onchange = e => { f.cat = e.target.value; renderExchange(); };
    $('#eReset').onclick = () => { f.q = ''; f.cat = ''; renderExchange(); };
  }

  function postCard(p) {
    const owner = Store.getUser(p.ownerId) || { name: '未知用户' };
    const me = Store.getCurrentUser();
    const isMine = p.ownerId === me.id;
    const kindLabel = p.kind === 'need' ? '需求' : '技能';
    const opposite = p.kind === 'need' ? '我能提供这个技能' : '我需要这个需求';
    return `
      <div class="card ${isMine ? 'mine' : ''}">
        <div class="card-body">
          <div class="tag-row">
            <span class="kind ${p.kind}">${kindLabel}</span>
            <span class="cat">${escapeHtml(p.category)}</span>
          </div>
          <div class="card-title">${escapeHtml(p.title)}</div>
          <div class="card-desc">${escapeHtml(p.desc)}</div>
          <div class="card-foot">
            <span class="owner">${escapeHtml(owner.name)}</span>
            ${isMine
              ? `<button class="btn tiny danger" data-act="del-post" data-id="${p.id}">删除</button>`
              : `<button class="btn tiny" data-act="chat" data-uid="${p.ownerId}">💬 ${opposite}</button>`}
          </div>
        </div>
      </div>`;
  }

  /* ---------------- 消息 / 聊天 ---------------- */
  function renderMessages() {
    const me = Store.getCurrentUser();
    if (!activeChat) {
      const convs = Store.getConversations(me.id);
      view.innerHTML = `
        <div class="count">与同学的对话（${convs.length}）</div>
        <div class="conv-list">
          ${convs.length ? convs.map(c => {
            const o = Store.getUser(c.other) || { name: '未知' };
            return `<div class="conv" data-uid="${c.other}">
              <span class="avatar">${escapeHtml(o.name.charAt(0))}</span>
              <div class="conv-main">
                <div class="conv-top"><span class="conv-name">${escapeHtml(o.name)}</span>
                  <span class="conv-time">${fmtTime(c.last.ts)}</span></div>
                <div class="conv-last">${escapeHtml(c.last.text)}</div>
              </div>
              ${c.unread ? `<span class="badge">${c.unread}</span>` : ''}
            </div>`;
          }).join('') : '<div class="empty">还没有对话。去物品市场或需求·技能里点「私信」开始聊天吧～</div>'}
        </div>`;
      $$('.conv', view).forEach(c => c.onclick = () => { activeChat = c.dataset.uid; renderMessages(); });
      return;
    }

    // 会话窗口
    const other = Store.getUser(activeChat);
    const thread = Store.getThread(me.id, activeChat);
    Store.markRead(me.id, activeChat);
    renderHeader();
    view.innerHTML = `
      <div class="chat">
        <div class="chat-head">
          <button class="btn tiny ghost" id="backChat">← 返回</button>
          <span class="chat-with">与 ${escapeHtml(other.name)} 的对话</span>
        </div>
        <div class="chat-body" id="chatBody">
          ${thread.length ? thread.map(m => `
            <div class="bubble ${m.from === me.id ? 'me' : 'them'}">
              <div class="bubble-text">${escapeHtml(m.text)}</div>
              <div class="bubble-time">${fmtTime(m.ts)}</div>
            </div>`).join('') : '<div class="empty">开始你们的对话吧～</div>'}
        </div>
        <div class="chat-input">
          <input id="msgInput" placeholder="输入消息，回车发送…" autocomplete="off">
          <button class="btn" id="sendBtn">发送</button>
        </div>
      </div>`;
    $('#backChat').onclick = () => { activeChat = null; renderMessages(); };
    const input = $('#msgInput');
    const send = () => {
      const text = input.value.trim();
      if (!text) return;
      Store.addMessage({ id: 'm_' + Date.now(), from: me.id, to: activeChat, text, ts: Date.now(), read: false });
      input.value = ''; renderMessages();
    };
    $('#sendBtn').onclick = send;
    input.onkeydown = e => { if (e.key === 'Enter') send(); };
    const body = $('#chatBody'); body.scrollTop = body.scrollHeight;
  }

  function openChatWith(uid) {
    activeChat = uid;
    setView('messages');
  }

  /* ---------------- 我的 ---------------- */
  function renderMine() {
    const me = Store.getCurrentUser();
    const myItems = Store.getItems().filter(i => i.ownerId === me.id);
    const myPosts = Store.getPosts().filter(p => p.ownerId === me.id);
    const cfg = Store.getVisionConfig() || {};
    view.innerHTML = `
      <div class="mine-head">
        <span class="avatar big">${escapeHtml(me.name.charAt(0))}</span>
        <div>
          <div class="mine-name">${escapeHtml(me.name)}</div>
          <div class="hint">已发布 ${myItems.length} 件物品、${myPosts.length} 条需求/技能</div>
        </div>
        <button class="btn ghost" id="switchId">切换身份</button>
      </div>

      <div class="panel set-card">
        <h3>🧠 AI 视觉设置（视觉大模型）</h3>
        <div class="hint">用于「AI 智能判断新旧程度」。支持 OpenAI 兼容接口（GPT-4o / 通义 Qwen-VL / 智谱 GLM-4V 等）。Key 仅存本机浏览器，不写进代码。未配置时使用本地启发式估算。</div>
        <label>API Base URL（如 https://api.openai.com/v1，或厂商的 compatible 地址）</label>
        <input id="vBase" placeholder="https://api.openai.com/v1" value="${escapeHtml(cfg.baseUrl || '')}">
        <label>API Key</label>
        <input id="vKey" type="password" placeholder="sk-..." value="${escapeHtml(cfg.apiKey || '')}">
        <label>模型名（如 gpt-4o / qwen-vl-max / glm-4v）</label>
        <input id="vModel" placeholder="gpt-4o" value="${escapeHtml(cfg.model || '')}">
        <div class="row" style="margin-top:10px">
          <button class="btn ghost tiny" id="vTest">测试连接</button>
          <button class="btn tiny" id="vSave">保存</button>
          <span id="vStatus" class="hint"></span>
        </div>
      </div>

      <h3>我发布的物品</h3>
      <div class="grid">
        ${myItems.length ? myItems.map(itemCard).join('') : '<div class="empty">还没有发布物品</div>'}
      </div>
      <h3>我发布的需求 / 技能</h3>
      <div class="grid">
        ${myPosts.length ? myPosts.map(postCard).join('') : '<div class="empty">还没有发布需求或技能</div>'}
      </div>`;
    $('#switchId').onclick = openIdentity;
    $('#vSave').onclick = () => {
      const nc = { baseUrl: $('#vBase').value.trim(), apiKey: $('#vKey').value.trim(), model: $('#vModel').value.trim() };
      if (!nc.baseUrl || !nc.apiKey) return toast('请填写 Base URL 和 Key');
      Store.setVisionConfig(nc); $('#vStatus').textContent = '✅ 已保存'; toast('AI 视觉配置已保存');
    };
    $('#vTest').onclick = async () => {
      const nc = { baseUrl: $('#vBase').value.trim(), apiKey: $('#vKey').value.trim(), model: $('#vModel').value.trim() };
      if (!nc.baseUrl || !nc.apiKey) return toast('请先填写 Base URL 和 Key');
      const st = $('#vStatus'); st.textContent = '连接中…';
      try {
        const r = await Vision.analyzeWithAPI(makeTestImage(), nc);
        st.textContent = '✅ 成功（识别 ' + r.condition + ' 成新）';
      } catch (e) {
        st.textContent = '❌ ' + e.message;
      }
    };
  }

  // 生成一张测试图，用于「测试连接」
  function makeTestImage() {
    const c = document.createElement('canvas'); c.width = 80; c.height = 80;
    const x = c.getContext('2d');
    x.fillStyle = '#e9eef7'; x.fillRect(0, 0, 80, 80);
    x.fillStyle = '#0167DE'; x.font = 'bold 16px sans-serif'; x.fillText('TEST', 18, 46);
    return c.toDataURL('image/png');
  }

  /* ---------------- 发布 ---------------- */
  function openPublish(kind) {
    if (kind === 'item') return openPublishItem();
    return openPublishPost(kind);
  }

  function openPublishItem() {
    modal('发布二手物品', `
      <form id="itemForm">
        <label>物品名称 *</label>
        <input id="itTitle" required placeholder="例如：九成新 Kindle">
        <label>物品描述 *</label>
        <textarea id="itDesc" rows="3" required placeholder="写清楚物品的成色、用途、配件等"></textarea>
        <label>价格（元）*</label>
        <input id="itPrice" type="number" min="0" required placeholder="0">
        <label>你自评的几成新 *</label>
        <div class="row">
          <input id="itSelf" type="range" min="1" max="10" value="8" style="flex:1">
          <span id="selfVal" class="selfval">8 成新</span>
        </div>
        <label>上传照片（可多张）</label>
        <input id="itPhotos" type="file" accept="image/*" multiple>
        <div id="photoPreview" class="photo-preview"></div>
        <button type="button" class="btn ghost" id="aiBtn">🤖 AI 智能判断新旧程度</button>
        <div id="aiResult" class="ai-result"></div>
        <button type="submit" class="btn primary" style="margin-top:14px">发布物品</button>
      </form>`);

    let compressed = [];
    const selfSlider = $('#itSelf');
    selfSlider.oninput = () => $('#selfVal').textContent = selfSlider.value + ' 成新';

    $('#itPhotos').onchange = async (e) => {
      const files = Array.from(e.target.files);
      compressed = [];
      const prev = $('#photoPreview'); prev.innerHTML = '压缩中…';
      for (const f of files) {
        try { compressed.push(await Vision.compressImage(f)); } catch (err) { /* skip */ }
      }
      prev.innerHTML = compressed.map(p => `<img src="${p}">`).join('');
      $('#aiBtn').disabled = !compressed.length;
    };

    $('#aiBtn').onclick = async () => {
      if (!compressed.length) return toast('请先上传照片');
      const cfg = Store.getVisionConfig();
      const btn = $('#aiBtn'); btn.disabled = true; btn.textContent = '🧠 分析中…';
      const r = await Vision.analyzeManyWith(compressed, cfg);
      btn.disabled = false; btn.textContent = '🤖 AI 智能判断新旧程度';
      const srcLabel = r.source === 'api' ? '🧠 视觉大模型' : '📐 本地启发式';
      const warn = r.apiError ? `<div class="ai-conf" style="color:var(--orange)">⚠ ${escapeHtml(r.apiError)}，已降级为启发式</div>` : '';
      $('#aiResult').innerHTML = `<div class="ai-card">
        <div class="ai-cond ${condClass(r.condition)}">AI 估算：${r.condition} 成新 <span class="src-badge">${srcLabel}</span></div>
        <div class="ai-conf">置信度 ${r.confidence}%</div>
        ${warn}
        <div class="ai-note">${escapeHtml(r.note)}</div>
      </div>`;
      $('#aiResult').dataset.cond = r.condition;
      $('#aiResult').dataset.note = r.note;
      $('#aiResult').dataset.source = r.source;
    };

    $('#itemForm').onsubmit = (e) => {
      e.preventDefault();
      const me = Store.getCurrentUser();
      const title = $('#itTitle').value.trim();
      const desc = $('#itDesc').value.trim();
      const price = Number($('#itPrice').value);
      const selfC = Number($('#itSelf').value);
      if (!title || !desc || !price) return toast('请填写完整信息');
      const aiBox = $('#aiResult');
      const aiCond = aiBox.dataset.cond ? Number(aiBox.dataset.cond) : selfC;
      const aiNote = aiBox.dataset.note || '';
      Store.addItem({
        id: 'it_' + Date.now(), title, desc, price,
        conditionSelf: selfC, conditionAI: aiCond, aiNote,
        aiSource: aiBox.dataset.source || 'heuristic',
        photos: compressed, ownerId: me.id, createdAt: Date.now()
      });
      closeModal(); renderHeader(); renderMarket(); toast('物品已发布 🎉');
    };
  }

  function openPublishPost(kind) {
    const isNeed = kind === 'need';
    modal('发布' + (isNeed ? '需求' : '技能'), `
      <form id="postForm">
        <label>${isNeed ? '需求' : '技能'}标题 *</label>
        <input id="pTitle" required placeholder="${isNeed ? '例如：求租单反相机一周' : '例如：提供 Python 辅导'}">
        <label>分类 *</label>
        <input id="pCat" required placeholder="例如：${isNeed ? '摄影 / 生活' : '编程 / 设计'}">
        <label>详细描述 *</label>
        <textarea id="pDesc" rows="3" required placeholder="写清楚你想求/能提供的东西，以及报酬或要求"></textarea>
        <button type="submit" class="btn primary" style="margin-top:14px">发布${isNeed ? '需求' : '技能'}</button>
      </form>`);
    $('#postForm').onsubmit = (e) => {
      e.preventDefault();
      const me = Store.getCurrentUser();
      const title = $('#pTitle').value.trim();
      const category = $('#pCat').value.trim();
      const desc = $('#pDesc').value.trim();
      if (!title || !category || !desc) return toast('请填写完整信息');
      Store.addPost({
        id: 'p_' + Date.now(), kind, title, category, desc,
        ownerId: me.id, createdAt: Date.now()
      });
      closeModal(); renderExchange(); toast((isNeed ? '需求' : '技能') + '已发布 🎉');
    };
  }

  /* ---------------- 通用 Modal ---------------- */
  function modal(title, bodyHtml) {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-mask" id="modalMask">
      <div class="modal">
        <div class="modal-head"><span>${escapeHtml(title)}</span><button id="modalClose">✕</button></div>
        <div id="modal-body">${bodyHtml}</div>
      </div></div>`;
    $('#modalClose').onclick = closeModal;
    $('#modalMask').onclick = (e) => { if (e.target.id === 'modalMask') closeModal(); };
  }
  function closeModal() { $('#modal-root').innerHTML = ''; }

  function openPublishChooser() {
    modal('选择发布类型', `
      <div class="choose">
        <button class="choose-btn" data-k="item">📦 发布二手物品</button>
        <button class="choose-btn" data-k="need">🙋 发布需求</button>
        <button class="choose-btn" data-k="skill">🛠️ 发布技能</button>
      </div>`);
    $$('.choose-btn', $('#modal-body')).forEach(b => b.onclick = () => openPublish(b.dataset.k));
  }

  /* ---------------- 人际交往：盲盒社交 + 技能雷达 ---------------- */
  function renderSocial() {
    const me = Store.getCurrentUser();
    view.innerHTML = `
      <div class="social">
        <div class="social-head">
          <div>
            <h2>🎲 盲盒社交 · 匿名破冰</h2>
            <div class="hint">剥离外貌与真实身份，靠「契合度」与「破冰任务」认识同频的人。聊天本地隔离存储，双方爆灯后才交换真实联系方式。</div>
          </div>
          <button class="btn" id="editProfileBtn">✏️ 编辑我的资料</button>
        </div>
        <div class="social-grid">
          <div class="panel">
            <h3>我的技能雷达</h3>
            <canvas id="myRadar" width="300" height="300"></canvas>
            <div class="tags">${(me.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
          </div>
          <div class="panel">
            <h3>开始一次盲盒匹配</h3>
            <p class="hint">系统为你随机匹配一位同学，进入匿名聊天室，完成 5 项破冰任务即可「💡 爆灯」交换微信 / 手机号。</p>
            <button class="btn primary big" id="matchBtn">🎲 开始盲盒匹配</button>
            <div id="matchResult"></div>
            <h3 style="margin-top:18px">我的匿名聊天室</h3>
            <div id="roomList"></div>
          </div>
        </div>
      </div>`;
    Radar.single($('#myRadar'), Store.SKILL_DIMS, Store.SKILL_DIMS.map(d => me.skills[d] || 0), '#0167DE');
    $('#editProfileBtn').onclick = openProfileEditor;
    $('#matchBtn').onclick = doMatch;
    renderRoomList();
  }

  function doMatch() {
    const me = Store.getCurrentUser();
    const others = Store.getUsers().filter(u => u.id !== me.id);
    if (!others.length) return toast('暂无可匹配的同学');
    const other = others[Math.floor(Math.random() * others.length)];
    showMatch(other);
  }

  function showMatch(other) {
    const me = Store.getCurrentUser();
    const comp = Store.compatibility(me, other);
    $('#matchResult').innerHTML = `
      <div class="match-card">
        <div class="gears"><span class="gear g1">⚙️</span><span class="fit">契合度 ${comp.score}%</span><span class="gear g2">⚙️</span></div>
        <canvas id="cmpRadar" width="300" height="300"></canvas>
        <div class="cmp-legend"><span class="dot me"></span>我<span class="dot other"></span>${escapeHtml(other.anonName || other.name)}</div>
        <div class="hint">共同标签 ${comp.shared} 个 · 雷达相似度 ${Math.round(comp.sim * 100)}% · 重合面积越大越「同频」</div>
        <button class="btn primary" id="enterRoom">进入匿名聊天室 →</button>
      </div>`;
    Radar.compare($('#cmpRadar'), Store.SKILL_DIMS,
      Store.SKILL_DIMS.map(d => me.skills[d] || 0),
      Store.SKILL_DIMS.map(d => other.skills[d] || 0));
    $('#enterRoom').onclick = () => { const r = Store.ensureRoom(me.id, other.id); openRoom(r.id); };
  }

  function renderRoomList() {
    const me = Store.getCurrentUser();
    const box = $('#roomList'); if (!box) return;
    const rooms = Store.getRooms().filter(r => r.ua === me.id || r.ub === me.id);
    if (!rooms.length) { box.innerHTML = '<div class="empty">还没有匿名聊天室，点上面开始匹配吧～</div>'; return; }
    box.innerHTML = rooms.map(r => {
      const otherAnon = r.ua === me.id ? r.anonB : r.anonA;
      const lit = Store.isLit(r);
      const prog = Store.progressOf(r);
      return `<div class="room-item" data-rid="${r.id}">
        <span class="avatar">🎲</span>
        <div class="ri-main"><div class="ri-name">与 ${escapeHtml(otherAnon)} 的匿名聊天</div>
        <div class="hint">破冰进度 ${prog}% ${lit ? '· 已爆灯 💡' : '· 破冰中…'}</div></div>
      </div>`;
    }).join('');
    $$('.room-item', box).forEach(it => it.onclick = () => openRoom(it.dataset.rid));
  }

  function openRoom(rid) {
    const me = Store.getCurrentUser();
    const r = Store.getRoom(rid); if (!r) return;
    const isA = r.ua === me.id;
    const myAnon = isA ? r.anonA : r.anonB;
    const otherAnon = isA ? r.anonB : r.anonA;
    const otherId = isA ? r.ub : r.ua;
    const other = Store.getUser(otherId) || { wechat: '', phone: '' };
    const prog = Store.progressOf(r);
    const lit = Store.isLit(r);
    const iLit = r.litBy.includes(me.id);

    view.innerHTML = `
      <div class="room">
        <div class="room-head">
          <button class="btn tiny ghost" id="backRoom">← 返回</button>
          <span class="room-title">匿名聊天室 · ${escapeHtml(myAnon)} ⚡ ${escapeHtml(otherAnon)}</span>
        </div>
        <div class="ice">
          <div class="ice-label">破冰任务进度 <b>${prog}%</b></div>
          <div class="bar"><div class="bar-fill" style="width:${prog}%"></div></div>
          <div class="tasks">
            ${r.tasks.map((t, i) => `
              <div class="task ${t.doneA && t.doneB ? 'done' : ''}">
                <span class="t-text">${i + 1}. ${escapeHtml(t.text)}</span>
                <span class="t-status">${t.doneA && t.doneB ? '✅ 双方完成' : (isA ? (t.doneA ? '🟡 待对方完成' : '⚪ 未完成') : (t.doneB ? '🟡 待对方完成' : '⚪ 未完成'))}</span>
                ${(isA ? !t.doneA : !t.doneB) ? `<button class="btn tiny" data-task="${i}">我已完成</button>` : ''}
              </div>`).join('')}
          </div>
        </div>
        <div class="chat-body" id="roomChat">
          ${r.messages.length ? r.messages.map(m => {
            const mine = m.from === me.id;
            const name = mine ? myAnon : otherAnon;
            return `<div class="bubble ${mine ? 'me' : 'them'}"><div class="bubble-name">${escapeHtml(name)}</div><div class="bubble-text">${escapeHtml(m.text)}</div><div class="bubble-time">${fmtTime(m.ts)}</div></div>`;
          }).join('') : '<div class="empty">匿名聊天开始，打个招呼吧～</div>'}
        </div>
        ${prog < 100 ? '' :
          (lit ? `<div class="reveal">🎉 双方已爆灯！真实联系方式：<br>对方微信：<b>${escapeHtml(other.wechat || '（未填写）')}</b> ｜ 对方手机：<b>${escapeHtml(other.phone || '（未填写）')}</b></div>`
                : `<button class="btn light" id="lightBtn">${iLit ? '✅ 你已爆灯，等待对方…' : '💡 爆灯（交换真实联系方式）'}</button>`)}
        <div class="chat-input">
          <input id="roomInput" placeholder="匿名文字聊天…" autocomplete="off">
          <button class="btn" id="roomSend">发送</button>
        </div>
      </div>`;

    $('#backRoom').onclick = () => { setView('social'); };
    $$('[data-task]', view).forEach(b => b.onclick = () => { Store.toggleTask(rid, Number(b.dataset.task), me.id); openRoom(rid); });
    if ($('#lightBtn')) $('#lightBtn').onclick = () => { Store.lightRoom(rid, me.id); openRoom(rid); };
    const input = $('#roomInput');
    const send = () => {
      const text = input.value.trim(); if (!text) return;
      Store.addRoomMsg(rid, me.id, text); openRoom(rid);
    };
    $('#roomSend').onclick = send;
    input.onkeydown = e => { if (e.key === 'Enter') send(); };
    const body = $('#roomChat'); body.scrollTop = body.scrollHeight;
  }

  function openProfileEditor() {
    const me = Store.getCurrentUser();
    modal('编辑我的资料', `
      <label>灵魂标签（输入后回车添加，如 #MBTI为INTJ）</label>
      <div class="tag-edit">
        <input id="tagInput" placeholder="输入标签后回车">
        <div id="tagChips" class="chips">${(me.tags || []).map(t => `<span class="chip">${escapeHtml(t)}<b data-x="${escapeHtml(t)}">✕</b></span>`).join('')}</div>
      </div>
      <label>技能自评（0–100，用于生成雷达图）</label>
      <div id="skillSliders">
        ${Store.SKILL_DIMS.map(d => `
          <div class="skill-row"><span class="sl-name">${d}</span>
            <input type="range" min="0" max="100" value="${me.skills[d] || 0}" data-dim="${d}">
            <span class="sv">${me.skills[d] || 0}</span></div>`).join('')}
      </div>
      <label>真实微信（仅双方爆灯后展示给对方）</label>
      <input id="wxInput" value="${escapeHtml(me.wechat || '')}" placeholder="微信号">
      <label>真实手机（仅双方爆灯后展示给对方）</label>
      <input id="phInput" value="${escapeHtml(me.phone || '')}" placeholder="手机号">
      <button class="btn primary" id="saveProfile" style="margin-top:14px">保存资料</button>`);
    const chips = $('#tagChips'); let tags = (me.tags || []).slice();
    const renderChips = () => {
      chips.innerHTML = tags.length ? tags.map(t => `<span class="chip">${escapeHtml(t)}<b data-x="${escapeHtml(t)}">✕</b></span>`).join('') : '<span class="hint">暂无标签</span>';
      $$('#tagChips b', $('#modal-body')).forEach(b => b.onclick = () => { tags = tags.filter(x => x !== b.dataset.x); renderChips(); });
    };
    $('#tagInput').onkeydown = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = e.target.value.trim();
        if (v && !tags.includes(v)) { tags.push(v); e.target.value = ''; renderChips(); }
      }
    };
    $$('#skillSliders input', $('#modal-body')).forEach(s => s.oninput = () => { s.nextElementSibling.textContent = s.value; });
    $('#saveProfile').onclick = () => {
      const skills = {};
      Store.SKILL_DIMS.forEach(d => { const el = $(`#skillSliders input[data-dim="${d}"]`, $('#modal-body')); skills[d] = Number(el.value); });
      Store.updateUser(me.id, { tags, skills, wechat: $('#wxInput').value.trim(), phone: $('#phInput').value.trim() });
      closeModal(); renderHeader(); renderSocial(); toast('资料已保存 🎉');
    };
  }

  /* ---------------- 路由 ---------------- */
  const views = { market: renderMarket, exchange: renderExchange, messages: renderMessages, mine: renderMine, social: renderSocial };
  function setView(name) {
    $$('.nav button[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    views[name]();
  }
  function renderAll() {
    const active = $('.nav button[data-view].active');
    setView(active ? active.dataset.view : 'market');
  }

  /* ---------------- 事件委托 ---------------- */
  view.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'chat') openChatWith(el.dataset.uid);
    if (act === 'del-item') { Store.deleteItem(el.dataset.id); renderMarket(); toast('已删除'); }
    if (act === 'del-post') { Store.deletePost(el.dataset.id); renderExchange(); toast('已删除'); }
  });

  /* ---------------- 绑定 ---------------- */
  $$('.nav button[data-view]').forEach(b => b.onclick = () => { activeChat = null; setView(b.dataset.view); });
  $('#publishBtn').onclick = openPublishChooser;

  /* ---------------- 启动 ---------------- */
  renderHeader();
  setView('market');
})();
