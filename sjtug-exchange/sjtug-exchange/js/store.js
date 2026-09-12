/* store.js — 上海交通大学二手·技能交换平台 数据层 (基于 localStorage) */
const Store = (function () {
  const KEYS = {
    items: 'sjtuex_items',
    posts: 'sjtuex_posts',
    messages: 'sjtuex_messages',
    users: 'sjtuex_users',
    currentUser: 'sjtuex_current',
    rooms: 'sjtuex_rooms',
    vision: 'sjtuex_vision'
  };

  // 固定技能维度（用于雷达图与契合度比较）
  const SKILL_DIMS = ['编程', '摄影', '高数', '外语', '运动', '音乐', '厨艺', '社交'];
  // 破冰任务模板
  const ICE_TASKS = [
    '互相分享一首喜欢的歌',
    '聊聊自己的院系和专业',
    '分享一个有趣的冷知识',
    '约一个线下见面的地点',
    '确认一个线下交接的时间'
  ];

  function defaultSkills() {
    const o = {}; SKILL_DIMS.forEach(d => o[d] = 50); return o;
  }
  function anonName() {
    const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    return '神秘同学 ' + L[Math.floor(Math.random() * L.length)] + Math.floor(Math.random() * 90 + 10);
  }
  function defaultProfile() {
    return { tags: ['#上海交通大学', '#闵行校区'], skills: defaultSkills(), anonName: anonName(), wechat: '', phone: '' };
  }
  // 归一化：保证任何版本/来源的用户都带有完整的资料字段（兼容早期无 skills/tags/anonName 的数据）
  function normalize(u) {
    u = u || {};
    const nu = Object.assign({}, defaultProfile(), u);
    nu.id = u.id || ('u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    nu.name = u.name || '匿名同学';
    nu.tags = (Array.isArray(u.tags) && u.tags.length) ? u.tags.slice() : ['#上海交通大学', '#闵行校区'];
    nu.skills = Object.assign({}, defaultSkills(), (u.skills && typeof u.skills === 'object') ? u.skills : {});
    SKILL_DIMS.forEach(d => { if (typeof nu.skills[d] !== 'number' || isNaN(nu.skills[d])) nu.skills[d] = 50; });
    if (!nu.anonName) nu.anonName = anonName();
    return nu;
  }

  function read(key, def) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
    catch (e) { return def; }
  }
  function write(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  /* ---------- 用户 ---------- */
  function getUsers() { return read(KEYS.users, []); }
  function saveUsers(u) { write(KEYS.users, u); }
  function addUser(name) {
    name = (name || '').trim();
    if (!name) return null;
    let users = getUsers();
    let u = users.find(x => x.name === name);
    if (!u) {
      u = Object.assign({ id: 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name }, defaultProfile());
      users.push(u); saveUsers(users);
    }
    return u;
  }
  function getUser(id) { return getUsers().find(x => x.id === id) || null; }
  function updateUser(id, patch) {
    const users = getUsers().map(u => u.id === id ? Object.assign({}, u, patch) : u);
    saveUsers(users); return getUser(id);
  }
  function getCurrentUser() {
    const c = read(KEYS.currentUser, null);
    if (!c) return null;
    // 始终以用户表中的最新（已归一化）对象为准，避免旧版缓存的当前用户缺字段
    const live = getUser(c.id);
    return live ? live : normalize(c);
  }
  /* ---------- 视觉大模型配置（仅存本机） ---------- */
  function getVisionConfig() { return read(KEYS.vision, null); }
  function setVisionConfig(cfg) { write(KEYS.vision, cfg || null); }
  function setCurrentUser(u) { write(KEYS.currentUser, u); }
  // 为新老用户补齐资料字段
  function ensureProfiles() {
    const users = getUsers().map(u => normalize(u));
    saveUsers(users);
    // 同步当前用户缓存，防止 sjtuex_current 仍是旧版缺字段对象
    const c = read(KEYS.currentUser, null);
    if (c) {
      const live = users.find(u => u.id === c.id);
      if (live) setCurrentUser(live);
    }
  }

  /* ---------- 物品 ---------- */
  function getItems() { return read(KEYS.items, []); }
  function saveItems(a) { write(KEYS.items, a); }
  function addItem(it) { const a = getItems(); a.unshift(it); saveItems(a); }
  function deleteItem(id) { saveItems(getItems().filter(x => x.id !== id)); }
  function getItem(id) { return getItems().find(x => x.id === id) || null; }

  /* ---------- 需求/技能 ---------- */
  function getPosts() { return read(KEYS.posts, []); }
  function savePosts(a) { write(KEYS.posts, a); }
  function addPost(p) { const a = getPosts(); a.unshift(p); savePosts(a); }
  function deletePost(id) { savePosts(getPosts().filter(x => x.id !== id)); }
  function getPost(id) { return getPosts().find(x => x.id === id) || null; }

  /* ---------- 普通消息 ---------- */
  function getMessages() { return read(KEYS.messages, []); }
  function saveMessages(a) { write(KEYS.messages, a); }
  function addMessage(m) { const a = getMessages(); a.push(m); saveMessages(a); }
  function getThread(uid1, uid2) {
    return getMessages()
      .filter(m => (m.from === uid1 && m.to === uid2) || (m.from === uid2 && m.to === uid1))
      .sort((a, b) => a.ts - b.ts);
  }
  function getConversations(uid) {
    const msgs = getMessages();
    const map = {};
    msgs.forEach(m => {
      if (m.from !== uid && m.to !== uid) return;
      const other = m.from === uid ? m.to : m.from;
      if (!map[other]) map[other] = { other, last: m, unread: 0 };
      map[other].last = m;
      if (m.to === uid && !m.read) map[other].unread++;
    });
    return Object.values(map).sort((a, b) => b.last.ts - a.last.ts);
  }
  function markRead(uid1, uid2) {
    const a = getMessages().map(m => {
      if (m.to === uid1 && m.from === uid2 && !m.read) return Object.assign({}, m, { read: true });
      return m;
    });
    saveMessages(a);
  }
  function totalUnread(uid) {
    return getMessages().filter(m => m.to === uid && !m.read).length;
  }

  /* ---------- 盲盒房间（本地隔离存储） ---------- */
  function getRooms() { return read(KEYS.rooms, []); }
  function saveRooms(a) { write(KEYS.rooms, a); }
  function pairKey(a, b) { return [a, b].sort().join('|'); }
  function getRoom(id) { return getRooms().find(r => r.id === id) || null; }
  function getRoomBetween(a, b) { return getRooms().find(r => pairKey(r.ua, r.ub) === pairKey(a, b)) || null; }
  function ensureRoom(a, b) {
    let r = getRoomBetween(a, b);
    if (r) return r;
    const ua = a < b ? a : b, ub = a < b ? b : a;
    const uaU = getUser(ua), ubU = getUser(ub);
    r = {
      id: 'room_' + Date.now().toString(36),
      ua, ub,
      anonA: uaU ? uaU.anonName : anonName(),
      anonB: ubU ? ubU.anonName : anonName(),
      tasks: ICE_TASKS.map(t => ({ text: t, doneA: false, doneB: false })),
      litBy: [],
      messages: [],
      createdAt: Date.now()
    };
    const all = getRooms(); all.push(r); saveRooms(all);
    return r;
  }
  function saveRoom(r) {
    saveRooms(getRooms().map(x => x.id === r.id ? r : x));
  }
  function toggleTask(rid, idx, uid) {
    const r = getRoom(rid); if (!r) return;
    if (uid === r.ua) r.tasks[idx].doneA = true; else r.tasks[idx].doneB = true;
    saveRoom(r);
  }
  function lightRoom(rid, uid) {
    const r = getRoom(rid); if (!r || r.litBy.includes(uid)) return;
    r.litBy.push(uid); saveRoom(r);
  }
  function addRoomMsg(rid, uid, text) {
    const r = getRoom(rid); if (!r) return;
    r.messages.push({ from: uid, text, ts: Date.now() });
    saveRoom(r);
  }
  function progressOf(r) {
    const done = r.tasks.filter(t => t.doneA && t.doneB).length;
    return Math.round(done / r.tasks.length * 100);
  }
  function isLit(r) { return r.litBy.includes(r.ua) && r.litBy.includes(r.ub); }

  /* ---------- 契合度 ---------- */
  function compatibility(a, b) {
    let diff = 0;
    SKILL_DIMS.forEach(d => { diff += Math.abs((a.skills[d] || 0) - (b.skills[d] || 0)); });
    const sim = 1 - diff / (SKILL_DIMS.length * 100); // 0..1
    const ta = new Set(a.tags || []), tb = new Set(b.tags || []);
    let inter = 0; ta.forEach(t => { if (tb.has(t)) inter++; });
    const union = new Set([...(a.tags || []), ...(b.tags || [])]).size || 1;
    const tagOverlap = inter / union;
    let score = Math.round((0.62 * sim + 0.38 * tagOverlap) * 100);
    score = Math.max(42, Math.min(99, score));
    return { score, sim, tagOverlap, shared: inter };
  }

  /* ---------- 种子数据 ---------- */
  function seed() {
    if (localStorage.getItem(KEYS.items) && localStorage.getItem(KEYS.posts)) { ensureProfiles(); return; }
    const u1 = addUser('交大-小林');
    const u2 = addUser('交大-阿May');
    const u3 = addUser('交大-学长');
    const me = addUser('我');
    setCurrentUser(me);

    // 为种子用户填充差异化资料，便于演示契合度
    updateUser(u1.id, {
      tags: ['#MBTI为INTJ', '#闵行校区', '#喜欢后摇音乐', '#想找人一起夜跑'],
      skills: { 编程: 85, 摄影: 55, 高数: 90, 外语: 70, 运动: 60, 音乐: 75, 厨艺: 30, 社交: 45 },
      wechat: 'xiaolin_sjtu', phone: '13800000001'
    });
    updateUser(u2.id, {
      tags: ['#闵行校区', '#喜欢摄影', '#想找人一起夜跑', '#ENFP'],
      skills: { 编程: 40, 摄影: 88, 高数: 65, 外语: 80, 运动: 78, 音乐: 60, 厨艺: 55, 社交: 82 },
      wechat: 'amay_sjtu', phone: '13800000002'
    });
    updateUser(u3.id, {
      tags: ['#闵行校区', '#CS研究生', '#可帮调试代码'],
      skills: { 编程: 95, 摄影: 35, 高数: 85, 外语: 60, 运动: 50, 音乐: 40, 厨艺: 65, 社交: 55 },
      wechat: 'senior_cs', phone: '13800000003'
    });
    updateUser(me.id, {
      tags: ['#上海交通大学', '#闵行校区', '#想找人一起夜跑'],
      skills: { 编程: 70, 摄影: 50, 高数: 75, 外语: 65, 运动: 70, 音乐: 55, 厨艺: 45, 社交: 60 }
    });

    const items = [
      {
        id: 'seed_it1', title: '九成新 Kindle Paperwhite', ownerId: u1.id,
        desc: '考研用完的 Kindle，屏幕无划痕，带原装皮套，看书神器。',
        price: 320, conditionSelf: 9, conditionAI: 9, aiNote: '图像清晰、对比度高，估算约九成新。',
        photos: [], createdAt: Date.now() - 1000 * 60 * 60 * 30
      },
      {
        id: 'seed_it2', title: '自行车（二手）', ownerId: u2.id,
        desc: '校园通勤用，链条刚上油，刹车灵敏，适合闵行校区代步。',
        price: 150, conditionSelf: 7, conditionAI: 6, aiNote: '图像整体偏暗、边缘磨损明显，估算约六成新。',
        photos: [], createdAt: Date.now() - 1000 * 60 * 60 * 8
      },
      {
        id: 'seed_it3', title: '几乎全新的罗技鼠标', ownerId: u3.id,
        desc: '买多了，拆封试用一次，无线静音，原价 199。',
        price: 99, conditionSelf: 10, conditionAI: 10, aiNote: '图像干净、亮度高，估算约十成新。',
        photos: [], createdAt: Date.now() - 1000 * 60 * 60 * 2
      }
    ];
    const posts = [
      { id: 'seed_p1', kind: 'need', title: '求租单反相机一周', ownerId: u2.id, category: '摄影',
        desc: '下周去春游想拍点照片，求租一台入门单反，可付租金。', createdAt: Date.now() - 1000 * 60 * 60 * 20 },
      { id: 'seed_p2', kind: 'skill', title: '提供 Python 辅导', ownerId: u3.id, category: '编程',
        desc: 'CS 研一，可帮做作业/项目调试，价格好商量。', createdAt: Date.now() - 1000 * 60 * 60 * 12 },
      { id: 'seed_p3', kind: 'skill', title: '约拍证件照/校园写真', ownerId: u1.id, category: '摄影',
        desc: '有相机和后期，闵行校内可约拍，成片快。', createdAt: Date.now() - 1000 * 60 * 60 * 5 }
    ];
    saveItems(items); savePosts(posts);
    addMessage({ id: 'seed_m1', from: u2.id, to: me.id, text: '你好，相机可以租你，周末方便吗？', ts: Date.now() - 1000 * 60 * 30, read: false });
    ensureProfiles();
  }

  return {
    KEYS, SKILL_DIMS, ICE_TASKS,
    getUsers, saveUsers, addUser, getUser, updateUser, getCurrentUser, setCurrentUser, ensureProfiles,
    getVisionConfig, setVisionConfig,
    getItems, saveItems, addItem, deleteItem, getItem,
    getPosts, savePosts, addPost, deletePost, getPost,
    getMessages, saveMessages, addMessage, getThread, getConversations, markRead, totalUnread,
    getRooms, getRoom, getRoomBetween, ensureRoom, toggleTask, lightRoom, addRoomMsg, progressOf, isLit,
    compatibility,
    seed
  };
})();
