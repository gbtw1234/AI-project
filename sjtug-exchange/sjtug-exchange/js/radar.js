/* radar.js — 多维技能雷达图（canvas 绘制 + 双人重叠对比） */
const Radar = (function () {
  function draw(canvas, dims, series) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.34;
    const n = dims.length;
    const angle = i => -Math.PI / 2 + i * 2 * Math.PI / n;

    // 网格环
    for (let level = 1; level <= 4; level++) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const r = R * level / 4;
        const x = cx + r * Math.cos(angle(i)), y = cy + r * Math.sin(angle(i));
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = '#e3e6ef'; ctx.lineWidth = 1; ctx.stroke();
    }
    // 轴线 + 标签
    ctx.fillStyle = '#6b7280'; ctx.font = '12px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const x = cx + R * Math.cos(angle(i)), y = cy + R * Math.sin(angle(i));
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y);
      ctx.strokeStyle = '#e3e6ef'; ctx.stroke();
      const lx = cx + (R + 16) * Math.cos(angle(i)), ly = cy + (R + 16) * Math.sin(angle(i));
      ctx.fillText(dims[i], lx, ly);
    }
    // 数据多边形
    series.forEach(s => {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const r = R * (Math.max(0, Math.min(100, s.values[i] || 0)) / 100);
        const x = cx + r * Math.cos(angle(i)), y = cy + r * Math.sin(angle(i));
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = s.fill; ctx.fill();
      ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.stroke();
      for (let i = 0; i < n; i++) {
        const r = R * (Math.max(0, Math.min(100, s.values[i] || 0)) / 100);
        const x = cx + r * Math.cos(angle(i)), y = cy + r * Math.sin(angle(i));
        ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fillStyle = s.color; ctx.fill();
      }
    });
  }

  function single(canvas, dims, values, color) {
    draw(canvas, dims, [{ values, color, fill: hexA(color, 0.18) }]);
  }

  function compare(canvas, dims, v1, v2) {
    draw(canvas, dims, [
      { values: v1, color: '#0167DE', fill: 'rgba(1,103,222,.20)' },
      { values: v2, color: '#00C8FF', fill: 'rgba(0,200,255,.16)' }
    ]);
  }

  function hexA(hex, a) {
    const m = hex.replace('#', '');
    const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  return { draw, single, compare };
})();
