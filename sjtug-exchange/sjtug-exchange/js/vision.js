/* vision.js — 图片压缩 + 智能新旧程度估算（启发式 AI 分析） */
const Vision = (function () {

  // 压缩上传图片，避免 localStorage 体积爆炸
  function compressImage(file, maxDim = 900, quality = 0.72) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
          else if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
          const c = document.createElement('canvas');
          c.width = width; c.height = height;
          c.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(c.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // 取多张图的"平均新鲜度"：基于亮度、对比度、边缘噪声启发式评估
  function analyze(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = 72, h = 72;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        let data;
        try { data = ctx.getImageData(0, 0, w, h).data; }
        catch (e) { resolve(fallback()); return; }

        const grays = [];
        let sum = 0, sumSq = 0, n = w * h;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const l = 0.299 * r + 0.587 * g + 0.114 * b; // 灰度
          grays.push(l); sum += l; sumSq += l * l;
        }
        const mean = sum / n;
        const variance = sumSq / n - mean * mean;
        const std = Math.sqrt(Math.max(0, variance)); // 对比度

        // 拉普拉斯边缘强度（近似"磨损/噪点"）
        let edge = 0, count = 0;
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const idx = y * w + x;
            const lap = 4 * grays[idx] - grays[idx - 1] - grays[idx + 1] - grays[idx - w] - grays[idx + w];
            edge += Math.abs(lap); count++;
          }
        }
        edge = edge / count;

        // 饱和度方差（颜色越鲜活越新）
        let satSum = 0, satSq = 0;
        for (let i = 0; i < data.length; i += 4) {
          const mx = Math.max(data[i], data[i + 1], data[i + 2]);
          const mn = Math.min(data[i], data[i + 1], data[i + 2]);
          const sat = mx === 0 ? 0 : (mx - mn) / mx;
          satSum += sat; satSq += sat * sat;
        }
        const satMean = satSum / n;
        const satVar = Math.sqrt(Math.max(0, satSq / n - satMean * satMean));

        // 综合新鲜度打分（0~1）
        const brightScore = clamp(mean / 255, 0, 1);          // 更亮更干净
        const contrastScore = clamp(std / 90, 0, 1);          // 对比度高=清晰
        const edgeScore = clamp(1 - edge / 90, 0, 1);         // 边缘噪声低=平滑
        const satScore = clamp(satVar / 0.18, 0, 1);          // 颜色鲜活
        let fresh = 0.34 * brightScore + 0.30 * contrastScore + 0.20 * edgeScore + 0.16 * satScore;
        // 轻微整体偏移，让结果更可信
        fresh = clamp(fresh * 1.05 + 0.05, 0, 1);

        let condition = Math.round(fresh * 10);
        condition = clamp(condition, 3, 10);
        const confidence = Math.round((0.55 + fresh * 0.4) * 100);

        resolve({
          condition,
          confidence,
          note: buildNote(condition, { mean, std, edge, satVar })
        });
      };
      img.onerror = () => resolve(fallback());
      img.src = dataUrl;
    });
  }

  function buildNote(condition, f) {
    if (condition >= 9) return '图像清晰干净、对比度高，估算约 ' + condition + ' 成新。';
    if (condition >= 7) return '图像较清晰，略有使用痕迹，估算约 ' + condition + ' 成新。';
    if (condition >= 5) return '图像偏暗/边缘磨损较明显，估算约 ' + condition + ' 成新。';
    return '图像划痕、污渍或磨损明显，估算约 ' + condition + ' 成新。';
  }

  function fallback() {
    const c = 8;
    return { condition: c, confidence: 60, note: '未能读取图像细节，按默认 ' + c + ' 成新处理。' };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // 多张图：返回平均成新 + 说明
  async function analyzeMany(dataUrls) {
    if (!dataUrls.length) return null;
    const results = [];
    for (const u of dataUrls) results.push(await analyze(u));
    const avg = Math.round(results.reduce((s, r) => s + r.condition, 0) / results.length);
    const conf = Math.round(results.reduce((s, r) => s + r.confidence, 0) / results.length);
    const note = results[0].note;
    return { condition: avg, confidence: conf, note, source: 'heuristic' };
  }

  /* ---------------- 视觉大模型（OpenAI 兼容） ---------------- */
  function normalizeEndpoint(baseUrl) {
    let u = (baseUrl || '').trim().replace(/\/+$/, '');
    if (!u) u = 'https://api.openai.com/v1';
    if (!/\/chat\/completions$/.test(u)) u += '/chat/completions';
    return u;
  }

  function extractJSON(str) {
    if (!str) return null;
    try { return JSON.parse(str); } catch (e) {}
    const m = str.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
    return null;
  }

  // 调用 OpenAI 兼容视觉接口，对单张图给出成新 + 置信度 + 理由
  async function analyzeWithAPI(dataUrl, cfg) {
    const url = normalizeEndpoint(cfg.baseUrl);
    const prompt = '你是二手物品成色鉴定专家。请观察图片中物品的磨损、污渍、划痕、老化程度，给出"几成新"（1-10 的整数，10 为全新）。只输出 JSON：{"condition": <整数1-10>, "confidence": <整数0-100>, "reason": "<20字内中文说明>"}，不要任何多余文字。';
    const body = {
      model: cfg.model || 'gpt-4o',
      temperature: 0.2,
      messages: [
        { role: 'system', content: '你是一名严谨的二手物品成色评估助手，必须只返回 JSON，不要任何解释。' },
        { role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]}
      ]
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error('接口返回 ' + res.status + (txt ? '：' + txt.slice(0, 160) : ''));
    }
    const data = await res.json();
    const content = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    const parsed = extractJSON(content);
    if (!parsed || typeof parsed.condition === 'undefined') throw new Error('模型返回无法解析：' + content.slice(0, 120));
    const condition = clamp(parseInt(parsed.condition, 10) || 8, 1, 10);
    const confidence = clamp(parseInt(parsed.confidence, 10) || 75, 1, 100);
    const note = String(parsed.reason || '视觉模型已识别').slice(0, 60);
    return { condition, confidence, note, source: 'api' };
  }

  // 多张图：cfg 有效则优先走视觉大模型（取首图识别，更省额度）；否则/失败则启发式平均
  async function analyzeManyWith(dataUrls, cfg) {
    if (!dataUrls.length) return null;
    if (cfg && cfg.apiKey && cfg.baseUrl) {
      try {
        const r = await analyzeWithAPI(dataUrls[0], cfg);
        if (dataUrls.length > 1) r.note = (r.note || '') + '（基于首图识别）';
        return r;
      } catch (e) {
        const heur = await analyzeMany(dataUrls);
        return Object.assign({}, heur, { apiError: e.message });
      }
    }
    return analyzeMany(dataUrls);
  }

  return { compressImage, analyze, analyzeWithAPI, analyzeMany, analyzeManyWith };
})();
