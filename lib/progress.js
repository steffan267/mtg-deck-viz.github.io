function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}h${String(minutes).padStart(2, '0')}m${String(seconds).padStart(2, '0')}s`;
  if (minutes) return `${minutes}m${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

function defaultEvery(total) {
  if (!Number.isFinite(total) || total <= 0) return 100;
  if (total <= 50) return 1;
  if (total <= 500) return 25;
  if (total <= 5000) return 100;
  return 1000;
}

function formatRate(done, elapsedMs) {
  if (!done || elapsedMs <= 0) return '0/s';
  const perSecond = done / (elapsedMs / 1000);
  if (perSecond >= 100) return `${Math.round(perSecond)}/s`;
  if (perSecond >= 10) return `${perSecond.toFixed(1)}/s`;
  return `${perSecond.toFixed(2)}/s`;
}

function formatDetail(detail) {
  return String(detail || '').replace(/\s+/g, ' ').trim().slice(0, 220);
}

function progressLine(label, current, total, startMs, detail = '') {
  const elapsedMs = Date.now() - startMs;
  const parts = [`[progress] ${label}`];
  if (Number.isFinite(total) && total > 0) {
    const pct = Math.min(100, Math.max(0, (current / total) * 100));
    parts.push(`${current}/${total}`, `${pct.toFixed(1)}%`);
    if (current > 0 && current < total) {
      const etaMs = (elapsedMs / current) * (total - current);
      parts.push(`eta ${formatDuration(etaMs)}`);
    }
  } else {
    parts.push(String(current));
  }
  parts.push(`elapsed ${formatDuration(elapsedMs)}`, `rate ${formatRate(current, elapsedMs)}`);
  const cleanDetail = formatDetail(detail);
  if (cleanDetail) parts.push(`| ${cleanDetail}`);
  return parts.join(' ');
}

function createProgress(label, total, options = {}) {
  const stream = options.stream || process.stderr;
  const every = options.every === 0 ? 0 : Math.max(1, Number(options.every || defaultEvery(total)));
  const enabled = options.enabled !== false && every > 0;
  const minIntervalMs = Math.max(0, Number(options.minIntervalMs ?? 1000));
  const startMs = Date.now();
  let current = 0;
  let lastWriteMs = 0;
  let started = false;

  function write(force = false, detail = '') {
    if (!enabled) return;
    const now = Date.now();
    if (!force && now - lastWriteMs < minIntervalMs) return;
    lastWriteMs = now;
    stream.write(progressLine(label, current, total, startMs, detail) + '\n');
  }

  function start(detail = '') {
    if (started) return;
    started = true;
    write(true, detail);
  }

  function tick(nextCurrent, detail = '') {
    start();
    if (typeof nextCurrent === 'number') current = nextCurrent;
    else {
      detail = typeof nextCurrent === 'string' ? nextCurrent : detail;
      current += 1;
    }
    const complete = Number.isFinite(total) && total > 0 && current >= total;
    if (complete || current % every === 0) write(true, detail);
    else write(false, detail);
  }

  function done(detail = '') {
    if (Number.isFinite(total) && total > 0) current = Math.max(current, total);
    write(true, detail || 'done');
  }

  return { start, tick, done };
}

module.exports = {
  createProgress,
  defaultEvery,
  formatDetail,
  formatDuration,
  progressLine,
};
