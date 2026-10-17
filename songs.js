const Songs = (() => {
  const SR = 16000, HOP = 160, FPS = SR / HOP, VERSION = 2, CACHE = 'karaoke-song:';
  const PAIRS = [['#f0468c', '#a855f7'], ['#1fb6ff', '#6366f1'], ['#ff7a59', '#e8b10b'], ['#1ec468', '#0ea5e9'], ['#a855f7', '#312e81'], ['#ef4444', '#f0468c']];
  const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const tick = () => new Promise(r => setTimeout(r));
  const pct = (arr, p) => {
    const s = Array.from(arr).sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0;
  };

  const db = (() => {
    let conn;
    const open = () => conn || (conn = new Promise((ok, fail) => {
      const r = indexedDB.open('karaoke-battle', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('songs', { keyPath: 'id' });
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    }));
    const run = (mode, fn) => open().then(d => new Promise((ok, fail) => {
      const tx = d.transaction('songs', mode), q = fn(tx.objectStore('songs'));
      tx.oncomplete = () => ok(q.result);
      tx.onerror = () => fail(tx.error);
    }));
    return {
      all: () => run('readonly', s => s.getAll()),
      put: v => run('readwrite', s => s.put(v)),
      del: id => run('readwrite', s => s.delete(id))
    };
  })();

  function restore(a) {
    const notes = a.notes.map(([midi, t, d]) => ({ midi, t, d, syl: '', line: -1 }));
    const lines = a.lines.map(([t0, t1, text]) => ({ t0, t1, text, words: null }));
    notes.forEach(n => (n.line = lines.findLastIndex(l => l.t0 <= n.t + 0.25)));
    const ms = notes.map(n => n.midi);
    return {
      song: true, notes, lines, from: a.from, lag: a.lag, duration: a.duration, approx: a.approx,
      beat: 60 / a.bpm, intro: lines[0]?.t0 ?? notes[0].t, lo: Math.min(...ms), hi: Math.max(...ms)
    };
  }

  function make(rec, origin) {
    const a = rec.analysis?.v === VERSION ? rec.analysis : null;
    return {
      id: rec.id, title: rec.title, artist: rec.artist || 'Неизвестный исполнитель', song: true, origin, rec,
      colors: PAIRS[hash(rec.id) % PAIRS.length],
      cover: rec.cover ? (rec.cover instanceof Blob ? URL.createObjectURL(rec.cover) : rec.cover) : null,
      level: a?.level || 0, bpm: a?.bpm || 0, hasMinus: !!rec.minus,
      _s: a ? restore(a) : null
    };
  }

  async function fromFolder(entry) {
    const e = typeof entry === 'string' ? { folder: entry } : entry, dir = `music/${e.folder}/`, id = `music-${e.folder}`;
    const rec = {
      id, title: e.title, artist: e.artist, length: e.length ?? 60, from: e.from,
      plus: dir + (e.plus || 'plus.mp3'), minus: e.minus === false ? null : dir + (e.minus || 'minus.mp3'),
      cover: e.cover === false ? null : dir + (e.cover || 'cover.jpg'), lrc: dir + (e.lrc || 'lyrics.lrc'), optional: true
    };
    if (!rec.title || !rec.artist) {
      const text = await fetch(rec.lrc).then(r => (r.ok ? r.text() : '')).catch(() => '');
      rec.title ||= text.match(/\[ti:\s*([^\]]+)\]/i)?.[1].trim() || e.folder.replace(/[-_]+/g, ' ');
      rec.artist ||= text.match(/\[ar:\s*([^\]]+)\]/i)?.[1].trim();
    }
    try { rec.analysis = JSON.parse(localStorage.getItem(CACHE + id)); } catch {}
    return make(rec, 'music');
  }

  async function load() {
    const site = await Promise.all((typeof MUSIC === 'undefined' ? [] : MUSIC).map(fromFolder));
    let local = [];
    try { local = (await db.all()).sort((a, b) => a.added - b.added).map(r => make(r, 'local')); } catch {}
    return [...site, ...local];
  }

  async function add(form) {
    const rec = { ...form, id: `my-${Date.now().toString(36)}`, added: Date.now() };
    await db.put(rec);
    return make(rec, 'local');
  }

  const remove = t => db.del(t.id);

  async function store(t, analysis) {
    if (t.origin === 'local') {
      t.rec.analysis = analysis;
      await db.put(t.rec).catch(() => {});
    } else {
      try { localStorage.setItem(CACHE + t.id, JSON.stringify(analysis)); } catch {}
    }
  }

  function parseLrc(text) {
    const out = [];
    for (const line of String(text || '').split(/\r?\n/)) {
      const stamps = [...line.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
      const words = line.replace(/\[[^\]]*\]/g, '').trim();
      stamps.forEach(m => out.push({ t: +m[1] * 60 + parseFloat(m[2].replace(':', '.')), text: words }));
    }
    return out.sort((a, b) => a.t - b.t);
  }

  async function findLyrics(title, artist) {
    const ask = async (path, params) => {
      const r = await fetch(`https://lrclib.net/api/${path}?${new URLSearchParams(params)}`);
      return r.ok ? r.json() : null;
    };
    try {
      const exact = await ask('get', { track_name: title, artist_name: artist });
      if (exact?.syncedLyrics) return exact.syncedLyrics;
      const list = await ask('search', { q: `${artist} ${title}` });
      return list?.find(x => x.syncedLyrics)?.syncedLyrics || '';
    } catch {
      return '';
    }
  }

  async function lyricsOf(t) {
    let text = t.rec.lrc || '';
    if (text && !text.includes('[')) text = await fetch(text).then(r => (r.ok ? r.text() : '')).catch(() => '');
    if (!text) {
      text = await findLyrics(t.title, t.artist);
      if (text && t.origin === 'local') t.rec.lrc = text;
    }
    return parseLrc(text);
  }

  async function resample(buffer) {
    const oc = new OfflineAudioContext(1, Math.ceil(buffer.duration * SR), SR);
    const s = oc.createBufferSource();
    s.buffer = buffer;
    s.connect(oc.destination);
    s.start();
    return (await oc.startRendering()).getChannelData(0);
  }

  function envelope(x) {
    const e = new Float32Array(Math.floor(x.length / HOP));
    for (let k = 0; k < e.length; k++) {
      let s = 0;
      for (let i = k * HOP, end = i + HOP; i < end; i++) s += Math.abs(x[i]);
      e[k] = s / HOP;
    }
    return e;
  }

  function align(P, M, eP, eM) {
    const n = Math.min(eP.length, eM.length, 6000), R = 50;
    const mean = a => a.slice(0, n).reduce((s, v) => s + v, 0) / n;
    const mp = mean(eP), mm = mean(eM);
    let best = -Infinity, L = 0;
    for (let lag = -R; lag <= R; lag++) {
      let s = 0;
      for (let k = R; k < n - R; k++) s += (eP[k] - mp) * (eM[k + lag] - mm);
      if (s > best) [best, L] = [s, lag];
    }
    let loud = R;
    for (let k = R; k < n - R; k++) if (eM[k] > eM[loud]) loud = k;
    const a = Math.max(HOP * R, loud * HOP - SR), len = Math.min(2 * SR, P.length - a - 2 * HOP * R);
    let fine = L * HOP;
    best = -Infinity;
    for (let lag = L * HOP - HOP; lag <= L * HOP + HOP; lag++) {
      let s = 0;
      for (let i = a; i < a + len; i++) s += P[i] * (M[i + lag] || 0);
      if (s > best) [best, fine] = [s, lag];
    }
    return fine;
  }

  function separate(P, M, lag) {
    let pm = 0, mm = 0;
    for (let i = 0; i < P.length; i += 4) {
      const m = M[i + lag] || 0;
      pm += P[i] * m;
      mm += m * m;
    }
    const g = mm ? pm / mm : 0, V = new Float32Array(P.length);
    let ev = 0, ep = 0;
    for (let i = 0; i < P.length; i++) {
      V[i] = P[i] - g * (M[i + lag] || 0);
      if (!(i & 3)) {
        ev += V[i] * V[i];
        ep += P[i] * P[i];
      }
    }
    return ep && ev / ep < 0.85 && g > 0.5 && g < 2 ? V : null;
  }

  function tempo(x, from, to) {
    const a = Math.floor(from * SR), n = Math.floor(((to - from) * SR) / HOP), o = new Float32Array(n);
    let prev = 0, mean = 0;
    for (let k = 0; k < n; k++) {
      let s = 0;
      for (let i = a + k * HOP, end = i + HOP; i < end; i++) s += (x[i] || 0) ** 2;
      const e = Math.log(1e-6 + s / HOP);
      o[k] = Math.max(0, e - prev);
      prev = e;
    }
    for (let k = n - 2; k > 0; k--) o[k] = 0.25 * o[k - 1] + 0.5 * o[k] + 0.25 * o[k + 1];
    o.forEach(v => (mean += v / n));
    const ac = lag => {
      let s = 0;
      for (let k = 0; k + lag < n; k++) s += (o[k] - mean) * (o[k + lag] - mean);
      return s / (n - lag);
    };
    let best = -Infinity, L = 50;
    for (let lag = 33; lag <= 100; lag++) {
      const s = (ac(lag) + 0.5 * ac(2 * lag) + 0.25 * ac(4 * lag)) * Math.exp(-0.5 * (Math.log2(6000 / lag / 120) / 0.7) ** 2);
      if (s > best) [best, L] = [s, lag];
    }
    let bpm = 6000 / L;
    while (bpm < 75) bpm *= 2;
    while (bpm > 170) bpm /= 2;
    return Math.round(bpm);
  }

  function segment(raw) {
    const m = raw.map((_, i) => {
      const w = raw.slice(Math.max(0, i - 2), i + 3).filter(v => v != null).sort((a, b) => a - b);
      return raw[i] != null && w.length >= 3 ? w[w.length >> 1] : null;
    });
    let sx = 0, sy = 0;
    m.forEach(v => {
      if (v == null) return;
      sx += Math.cos(2 * Math.PI * v);
      sy += Math.sin(2 * Math.PI * v);
    });
    const tune = Math.atan2(sy, sx) / (2 * Math.PI), notes = [];
    let cur = null, last = -1;
    const close = end => {
      if (cur && end - cur.k0 >= 8) {
        const s = cur.vals.sort((a, b) => a - b);
        notes.push({ midi: Math.round(s[s.length >> 1]), t: cur.k0 / FPS, d: (end - cur.k0) / FPS });
      }
      cur = null;
    };
    for (let k = 0; k <= m.length; k++) {
      let v = k < m.length && m[k] != null ? m[k] - tune : null;
      if (cur && v != null && Math.abs(v - cur.ref) > 9) v -= 12 * Math.round((v - cur.ref) / 12);
      if (cur && (v == null ? k - last > 3 : Math.abs(v - cur.ref) > 0.8)) close(last + 1);
      if (v == null) continue;
      if (!cur) cur = { k0: k, vals: [], ref: v };
      cur.vals.push(v);
      cur.ref = cur.vals.length < 5 ? v : cur.ref * 0.9 + v * 0.1;
      last = k;
    }
    return notes.reduce((out, n) => {
      const p = out.at(-1);
      if (p && p.midi === n.midi && n.t - (p.t + p.d) <= 0.06) p.d = n.t + n.d - p.t;
      else out.push(n);
      return out;
    }, []);
  }

  async function analyze(t, progress) {
    const { plus, minus } = t._buf;
    progress('Разбираю звук', 0.05);
    const P = await resample(plus), M = minus ? await resample(minus) : null;
    progress('Ищу текст песни', 0.12);
    const lrc = await lyricsOf(t);
    progress('Отделяю голос от музыки', 0.2);
    await tick();
    let lag = 0, V = null;
    if (M) {
      lag = align(P, M, envelope(P), envelope(M));
      V = separate(P, M, lag);
    }
    const approx = !V;
    V = V || P;

    const dur = P.length / SR, sung = lrc.filter(l => l.text);
    let from = Number.isFinite(t.rec.from) ? t.rec.from : null;
    if (from === null && sung.length) from = Math.max(0, sung[0].t - 4);
    if (from === null) {
      const e = envelope(V), thr = pct(e, 0.9) * 0.3;
      const k = e.findIndex((v, i) => v > thr && e[i + 15] > thr && e[i + 30] > thr);
      from = Math.max(0, k / FPS - 4);
    }
    const len = +t.rec.length || 0;
    let to = len ? Math.min(dur, from + len) : dur;
    const cut = sung.find(l => l.t >= to - 0.5);
    if (len && cut && cut.t - from < len + 12) to = Math.min(dur, cut.t);

    const a = Math.floor(from * SR), n = Math.floor(((to - from) * SR - 1024) / HOP), W = 512;
    const rms = new Float32Array(n), d = new Float32Array(W), raw = new Array(n).fill(null);
    for (let k = 0; k < n; k++) {
      let s = 0;
      for (let i = a + k * HOP, e = i + W; i < e; i++) s += V[i] * V[i];
      rms[k] = Math.sqrt(s / W);
    }
    const gate = Math.max(1e-4, pct(rms, 0.9) * 0.18);
    for (let k = 0; k < n; k++) {
      if (rms[k] > gate) {
        const f = Sound.yin(V, SR, a + k * HOP, W, d, approx ? 0.12 : 0.18);
        if (f) raw[k] = 69 + 12 * Math.log2(f / 440);
      }
      if (k % 250 === 0) {
        progress('Нахожу ноты исполнителя', 0.25 + 0.65 * (k / n));
        await tick();
      }
    }
    const notes = segment(raw);
    if (notes.length < 5) throw new Error('В плюсе не нашлось вокала. Проверь, что загружен трек с голосом.');

    progress('Считаю темп и сложность', 0.95);
    const bpm = tempo(M || P, from, to);
    const span = notes.at(-1).t + notes.at(-1).d - notes[0].t;
    const density = notes.length / span, mids = notes.map(x => x.midi);
    const range = pct(mids, 0.9) - pct(mids, 0.1);
    const level = density > 3.4 || range > 17 || bpm > 150 ? 3 : density > 2.4 || range > 12 || bpm > 125 ? 2 : 1;
    const lines = sung
      .map((l, i) => [l.t - from, (lrc.find(x => x.t > l.t)?.t ?? to) - from, l.text])
      .filter(([t0]) => t0 >= -0.5 && t0 < to - from)
      .map(([t0, t1, text]) => [Math.max(0, t0), Math.min(t1, t0 + 12, to - from), text]);

    return {
      v: VERSION, from, lag: lag / SR, approx, bpm, level, duration: to - from + 0.4, lines,
      notes: notes.map(x => [x.midi, +x.t.toFixed(2), +x.d.toFixed(2)])
    };
  }

  async function prepare(t, progress = () => {}) {
    if (!t.rec.plus) throw new Error('Для трека нужен плюс: версия песни с голосом.');
    if (!t._buf) {
      progress('Загружаю аудио', 0);
      const get = async (f, optional) => {
        if (!f) return null;
        if (f instanceof Blob) return Sound.decode(f);
        const r = await fetch(f).catch(() => null);
        if (!r?.ok) {
          if (optional) return null;
          throw new Error(`Не найден файл ${f}`);
        }
        return Sound.decode(await r.arrayBuffer());
      };
      const [plus, minus] = await Promise.all([get(t.rec.plus), get(t.rec.minus, true)]);
      t._buf = { plus, minus };
      t.hasMinus = !!minus;
    }
    if (!t._s) {
      const a = await analyze(t, progress);
      t._s = restore(a);
      t.level = a.level;
      t.bpm = a.bpm;
      await store(t, a);
    }
    progress('Готово', 1);
  }

  return { load, add, remove, prepare, findLyrics, parseLrc, segment };
})();
