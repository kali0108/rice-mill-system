// Small dependency-free charts (SVG) — work offline, print well, and scroll
// sideways on a phone when there are many points.
import { parseYmd } from '../lib/dates';

export const PALETTE = ['#2F5D7C', '#C9962F', '#4C7A3D', '#B23B2E', '#8B6544', '#6B5B95', '#1F2E1A'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 950 -> 950 · 45,000 -> 45K · 2,660,000 -> 26.6 L · 125,000,000 -> 12.5 Cr
export function fmtShort(n) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const t = (x) => (x >= 100 ? Math.round(x).toString() : x.toFixed(1).replace(/\.0$/, ''));
  if (a >= 1e7) return sign + t(a / 1e7) + ' Cr';
  if (a >= 1e5) return sign + t(a / 1e5) + ' L';
  if (a >= 1e3) return sign + t(a / 1e3) + 'K';
  return sign + (Number.isInteger(a) ? a : a.toFixed(1));
}

export function bucketLabel(dateStr, bucket) {
  const d = parseYmd(String(dateStr || '').slice(0, 10));
  if (!d) return String(dateStr || '');
  if (bucket === 'month') return `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function Legend({ series }) {
  return (
    <div className="chart-legend">
      {series.map((s, i) => (
        <span key={s.name}><i style={{ background: s.color || PALETTE[i % PALETTE.length] }} />{s.name}</span>
      ))}
    </div>
  );
}

function Axis({ max, width, height, pad, format }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return ticks.map((t) => {
    const y = pad.top + (1 - t) * (height - pad.top - pad.bottom);
    return (
      <g key={t}>
        <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="grid" />
        <text x={pad.left - 6} y={y + 4} textAnchor="end" className="tick">{format(max * t)}</text>
      </g>
    );
  });
}

function xLabels(labels, xOf, height, pad) {
  const step = Math.max(1, Math.ceil(labels.length / 12));
  return labels.map((l, i) => (i % step === 0 || i === labels.length - 1
    ? <text key={i} x={xOf(i)} y={height - pad.bottom + 16} textAnchor="middle" className="tick">{l}</text>
    : null));
}

export function BarChart({ labels, series, height = 230, format = fmtShort }) {
  const n = labels.length;
  const groupW = Math.max(22, Math.min(64, 14 * series.length + 10));
  const pad = { top: 12, right: 10, bottom: 26, left: 52 };
  const width = Math.max(320, pad.left + pad.right + n * groupW);
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values.map((v) => Number(v) || 0))));
  const plotH = height - pad.top - pad.bottom;
  const barW = Math.max(4, (groupW - 8) / series.length);
  const xOf = (i) => pad.left + i * groupW + groupW / 2;
  if (!n) return <div className="empty">Is muddat mein data nahi.</div>;
  return (
    <div className="chart">
      <Legend series={series} />
      <div className="chart-scroll">
        <svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: Math.min(width, 900) }} role="img">
          <Axis max={max} width={width} height={height} pad={pad} format={format} />
          {series.map((s, si) => s.values.map((v, i) => {
            const val = Math.max(0, Number(v) || 0);
            const h = (val / max) * plotH;
            const x = pad.left + i * groupW + 4 + si * barW;
            return (
              <rect key={`${si}-${i}`} x={x} y={pad.top + plotH - h} width={barW - 1} height={h} rx="1.5"
                fill={s.color || PALETTE[si % PALETTE.length]}>
                <title>{`${labels[i]} — ${s.name}: ${format(val)}`}</title>
              </rect>
            );
          }))}
          {xLabels(labels, xOf, height, pad)}
        </svg>
      </div>
    </div>
  );
}

export function LineChart({ labels, series, height = 230, format = fmtShort, minZero = true }) {
  const n = labels.length;
  const pad = { top: 12, right: 14, bottom: 26, left: 52 };
  const stepX = n > 1 ? Math.max(18, Math.min(60, 700 / (n - 1))) : 40;
  const width = Math.max(320, pad.left + pad.right + (n - 1) * stepX);
  const vals = series.flatMap((s) => s.values.filter((v) => v != null && Number.isFinite(Number(v))).map(Number));
  if (!n || !vals.length) return <div className="empty">Is muddat mein data nahi.</div>;
  const vMin = Math.min(...vals);
  const vMax = Math.max(...vals);
  let lo = 0;
  let max = niceMax(vMax);
  if (!minZero) {
    // rates etc.: zoom in around the data instead of starting at zero
    const pad = vMax - vMin > 0 ? (vMax - vMin) * 0.15 : Math.abs(vMax) * 0.05 || 1;
    lo = vMin - pad;
    max = vMax + pad;
  }
  const plotH = height - pad.top - pad.bottom;
  const xOf = (i) => pad.left + (n > 1 ? i * ((width - pad.left - pad.right) / (n - 1)) : (width - pad.left - pad.right) / 2);
  const yOf = (v) => pad.top + (1 - (v - lo) / (max - lo || 1)) * plotH;
  return (
    <div className="chart">
      <Legend series={series} />
      <div className="chart-scroll">
        <svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: Math.min(width, 900) }} role="img">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = pad.top + (1 - t) * plotH;
            return (
              <g key={t}>
                <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="grid" />
                <text x={pad.left - 6} y={y + 4} textAnchor="end" className="tick">{format(lo + (max - lo) * t)}</text>
              </g>
            );
          })}
          {series.map((s, si) => {
            const color = s.color || PALETTE[si % PALETTE.length];
            const segs = [];
            let cur = [];
            s.values.forEach((v, i) => {
              if (v == null || !Number.isFinite(Number(v))) {
                if (cur.length) segs.push(cur);
                cur = [];
              } else cur.push([xOf(i), yOf(Number(v)), v, i]);
            });
            if (cur.length) segs.push(cur);
            return (
              <g key={s.name}>
                {segs.map((seg, k) => (
                  <polyline key={k} points={seg.map((p) => `${p[0]},${p[1]}`).join(' ')} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" />
                ))}
                {segs.flat().map((p) => (
                  <circle key={p[3]} cx={p[0]} cy={p[1]} r="3" fill={color}><title>{`${labels[p[3]]} — ${s.name}: ${format(p[2])}`}</title></circle>
                ))}
              </g>
            );
          })}
          {xLabels(labels, xOf, height, pad)}
        </svg>
      </div>
    </div>
  );
}

// Horizontal bars — best for rankings (top parties, categories) on a phone
export function HBarChart({ items, format = fmtShort, color = PALETTE[0], empty = 'Data nahi.' }) {
  if (!items.length) return <div className="empty">{empty}</div>;
  const max = Math.max(...items.map((i) => Math.abs(Number(i.value) || 0)), 1);
  return (
    <div className="hbars">
      {items.map((it) => (
        <div className="hbar" key={it.label} title={`${it.label}: ${format(it.value)}`}>
          <div className="hbar-label">{it.label}{it.sub ? <span className="muted"> · {it.sub}</span> : null}</div>
          <div className="hbar-track"><div className="hbar-fill" style={{ width: `${(Math.abs(Number(it.value) || 0) / max) * 100}%`, background: it.color || color }} /></div>
          <div className="hbar-value">{format(it.value)}</div>
        </div>
      ))}
    </div>
  );
}

export function ProgressBar({ pct, warn }) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <div className={`progress ${warn ? 'warn' : ''}`} title={`${p.toFixed(1)}%`}>
      <div style={{ width: `${p}%` }} />
    </div>
  );
}
