const I = (() => {
  const s = d => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  return {
    home: s('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
    music: s('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
    mic: s('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>'),
    chart: s('<path d="M3 21h18M6 17v-6M12 17V5M18 17v-9"/>'),
    swords: s('<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2"/>'),
    search: s('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'),
    play: s('<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>'),
    pause: s('<path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z" fill="currentColor"/>'),
    stop: s('<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/>'),
    retry: s('<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>'),
    crown: s('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>'),
    headphones: s('<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/>'),
    chevron: s('<path d="m6 9 6 6 6-6"/>'),
    logo: s('<path d="M9 18V5l10-2v12"/><circle cx="6.5" cy="18" r="2.5" fill="currentColor"/><circle cx="16.5" cy="15" r="2.5" fill="currentColor"/>')
  };
})();

const KEY = 'karaoke-battle';
const LEVELS = ['', 'Легко', 'Средне', 'Сложно'];
const PALETTE = ['#1ec468', '#f0468c', '#a855f7', '#e8b10b', '#38bdf8', '#ff7a59'];
const SEED = [
  ['Лиза', 'volna', 88, 82], ['Анна К.', 'plamya', 86, 80, 'duel'], ['Даша', 'sneg', 84, 79],
  ['Макс', 'neon', 79, 76], ['Анна К.', 'neon', 74, 81], ['Кира', 'puls', 63, 69, 'duel'],
  ['Тимур', 'polnoch', 58, 67], ['Макс', 'plamya', 69, 72]
];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const view = $('#view');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const byId = id => TRACKS.find(t => t.id === id);
const grad = t => `--a:${t.colors[0]};--b:${t.colors[1]}`;
const badge = t => `<span class="badge lv${t.level}">${LEVELS[t.level]}</span>`;
const hue = name => PALETTE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
const avatar = (name, cls = '') => `<span class="avatar ${cls}" style="--c:${hue(name)}">${esc((name[0] || '?').toUpperCase())}</span>`;

const db = (() => {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d?.scores) return d;
  } catch {}
  return {
    name: 'Гость',
    scores: SEED.map(([name, track, melody, rhythm, mode = 'solo'], i) => ({
      name, track, melody, rhythm, mode, total: Math.round(6 * melody + 4 * rhythm), date: Date.now() - i * 36e5
    }))
  };
})();
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
};
const addScore = s => {
  db.scores.push(s);
  if (db.scores.length > 400) db.scores.shift();
  save();
};
const bestOf = (id, name = db.name) => {
  const list = db.scores.filter(s => s.track === id && s.name === name).map(s => s.total);
  return list.length ? Math.max(...list) : null;
};

const state = { q: '', level: 0, top: 'all', guide: true, pick: TRACKS[0].id, p2: 'Соперник', duel: null, session: null, raf: 0, sound: null, rec: null, last: null, redraw: null };

const io = window.IntersectionObserver && new IntersectionObserver(
  es => es.forEach(e => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))),
  { threshold: 0.1 }
);

function render(html, animate = true) {
  view.innerHTML = html;
  if (animate) {
    view.classList.remove('enter');
    void view.offsetWidth;
    view.classList.add('enter');
  }
  $$('[data-reveal]', view).forEach(el => (io && !reduced ? io.observe(el) : el.classList.add('in')));
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4500);
}

function micError(e) {
  if (e.name === 'NotAllowedError') return 'Браузер не дал доступ к микрофону. Нажми на значок слева от адреса сайта и разреши микрофон.';
  if (e.name === 'NotFoundError') return 'Микрофон не найден. Подключи гарнитуру или наушники с микрофоном.';
  if (e.name === 'InsecureError') return 'Микрофон работает только по https или на localhost. Открой сайт через Live Server или GitHub Pages.';
  return `Не получилось включить микрофон: ${e.message}`;
}

function cover(t) {
  const S = Sound.parse(t), span = S.duration - S.intro, rng = S.hi - S.lo || 1;
  const bars = S.notes.map(n =>
    `<rect x="${(8 + ((n.t - S.intro) / span) * 84).toFixed(1)}" y="${(56 - ((n.midi - S.lo) / rng) * 38).toFixed(1)}" width="${Math.max(1.4, (n.d / span) * 84 - 0.8).toFixed(1)}" height="3.4" rx="1.7"/>`
  ).join('');
  return `<svg viewBox="0 0 100 75" aria-hidden="true"><g fill="#fff">${bars}</g></svg>`;
}

function card(t, i) {
  const best = bestOf(t.id);
  return `<a class="card" href="#/sing/${t.id}" data-reveal style="${grad(t)};--i:${i}">
    <div class="cover">${cover(t)}<span class="play">${I.play}</span></div>
    <div class="card-body">
      <b>${t.title}</b><span>${t.artist}</span>
      <div class="card-meta">${badge(t)}${best !== null ? `<span class="best">Рекорд ${best}</span>` : ''}</div>
    </div>
  </a>`;
}

function fit(cv) {
  const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(r.width * d);
  cv.height = Math.round(r.height * d);
  const c = cv.getContext('2d');
  c.setTransform(d, 0, 0, d, 0, 0);
  return { cv, c, w: r.width, h: r.height };
}

function refNote(S, t) {
  let ref = S.notes[0];
  for (const n of S.notes) {
    if (n.t > t) break;
    ref = n;
  }
  return ref;
}

function drawRoll(g, S, o) {
  if (g.cv.clientWidth && Math.abs(g.cv.clientWidth - g.w) > 1) Object.assign(g, fit(g.cv));
  const { c, w, h } = g, lo = S.lo - 3, hi = S.hi + 3, pad = 26;
  const X = t => ((t - o.from) / (o.to - o.from)) * w;
  const Y = m => h - pad - ((m - lo) / (hi - lo)) * (h - pad * 2);
  const bh = Math.max(7, ((h - pad * 2) / (hi - lo)) * 0.8);
  const near = (t, m) => {
    const n = refNote(S, t), v = m + 12 * Math.round((n.midi - m) / 12);
    return { v, on: t >= n.t && t < n.t + n.d && Math.abs(v - n.midi) <= 0.75 };
  };

  c.clearRect(0, 0, w, h);
  c.shadowBlur = 0;
  c.fillStyle = 'rgba(255,255,255,.035)';
  for (let m = lo; m <= hi; m++) c.fillRect(0, Math.round(Y(m)), w, 1);

  c.font = '600 11px Inter, system-ui, sans-serif';
  c.textBaseline = 'bottom';
  S.notes.forEach((n, i) => {
    const x = X(n.t), x2 = X(n.t + n.d);
    if (x2 < 0 || x > w) return;
    const active = o.now >= n.t && o.now < n.t + n.d, past = o.now >= n.t + n.d;
    c.fillStyle = active ? '#fff'
      : past && o.live ? (o.live[i] ? '#1ec468' : 'rgba(240,70,140,.55)')
      : `rgba(255,255,255,${o.dim ? 0.13 : 0.18})`;
    c.shadowColor = 'rgba(255,255,255,.8)';
    c.shadowBlur = active ? 18 : 0;
    c.beginPath();
    c.roundRect(x + 1, Y(n.midi) - bh / 2, Math.max(4, x2 - x - 2), bh, bh / 2);
    c.fill();
    if (o.labels && c.measureText(n.syl).width < x2 - x + 4) {
      c.shadowBlur = 0;
      c.fillStyle = active ? '#fff' : 'rgba(255,255,255,.42)';
      c.fillText(n.syl, x + 2, Y(n.midi) - bh / 2 - 4);
    }
  });

  if (o.samples?.length) {
    c.lineWidth = 3;
    c.lineCap = c.lineJoin = 'round';
    c.shadowBlur = 10;
    let prev = null, color = null;
    for (const s of o.samples) {
      if (s.t < o.from - 0.2 || s.t > o.now || s.m == null) {
        prev = null;
        continue;
      }
      const { v, on } = near(s.t, s.m), p = { t: s.t, v, x: X(s.t), y: Y(v) }, col = on ? '#1ec468' : '#f0468c';
      if (col !== color) {
        if (color) c.stroke();
        color = col;
        c.strokeStyle = c.shadowColor = col;
        c.beginPath();
        if (prev) c.moveTo(prev.x, prev.y);
      }
      prev && s.t - prev.t < 0.12 && Math.abs(v - prev.v) < 4 ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y);
      prev = p;
    }
    if (color) c.stroke();
  }

  c.shadowBlur = 0;
  if (o.head) {
    const x = X(o.now), gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr;
    c.fillRect(x - 1, 0, 2, h);
    if (o.cur != null) {
      const { v, on } = near(o.now, o.cur);
      c.fillStyle = c.shadowColor = on ? '#1ec468' : '#f0468c';
      c.shadowBlur = 16;
      c.beginPath();
      c.arc(x, Y(v), 6, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;
    }
  }
}

const around = (g, now) => {
  const k = g.w < 600 ? 0.6 : 1;
  return { from: now - 2.2 * k, to: now + 4 * k, now };
};

function fakeVoice(S, now) {
  const out = [];
  for (let t = Math.ceil((now - 2.8) * 30) / 30; t <= now; t += 1 / 30) {
    const n = S.notes.find(n => t >= n.t + 0.05 && t < n.t + n.d - 0.04);
    const slip = Math.sin(t * 0.8) > 0.9 ? 1.3 : 0;
    out.push({ t, m: n ? n.midi + Math.sin(t * 21) * 0.15 + Math.sin(t * 2.3) * 0.3 + slip : null });
  }
  return out;
}

function viewHome() {
  render(`
  <section class="hero">
    <h1>Спой хит</h1>
    <p class="lead">Выбери трек, включи микрофон и получи оценку за попадание в мелодию и ритм</p>
    <div class="hero-card">
      <canvas id="heroRoll"></canvas>
      <div class="hero-copy">
        <h2>Караоке-баттл</h2>
        <p>Твой голос рисуется поверх нот прямо во время песни. В конце покажем, где ты попал, а где ушёл мимо.</p>
        <div class="actions">
          <a class="btn btn-sing" href="#/sing">${I.mic}Начать петь</a>
          <a class="btn btn-glass" href="#/duel">${I.swords}Дуэль</a>
        </div>
      </div>
    </div>
    <ol class="steps">
      <li><b>Выбери фрагмент</b><span>Шесть треков трёх уровней сложности</span></li>
      <li><b>Пой в микрофон</b><span>Подсказка покажет, брать выше или ниже</span></li>
      <li><b>Получи разбор</b><span>Баллы за мелодию и ритм и советы, что подтянуть</span></li>
    </ol>
  </section>
  <section>
    <div class="sec-head"><h2>Фрагменты</h2><a href="#/tracks">Все подборки</a></div>
    <div class="grid">${TRACKS.map(card).join('')}</div>
  </section>`);

  const S = Sound.parse(byId('neon')), len = S.duration - S.intro, g = fit($('#heroRoll'));
  const frame = () => {
    const now = S.intro + ((performance.now() / 1000) % len), samples = fakeVoice(S, now);
    drawRoll(g, S, { from: now - 2.6, to: now + 3.6, now, samples, cur: samples.at(-1)?.m, head: true, dim: true });
    if (!reduced) state.raf = requestAnimationFrame(frame);
  };
  frame();
}

function viewTracks(animate = true) {
  const q = state.q.trim().toLowerCase();
  const list = TRACKS.filter(t => (!state.level || t.level === state.level) && (!q || `${t.title} ${t.artist}`.toLowerCase().includes(q)));
  render(`
  <section>
    <h1>Подборки</h1>
    <p class="lead">Шесть фрагментов трёх уровней. Начни с лёгких, чтобы распеться.</p>
    <div class="chips">${['Все', ...LEVELS.slice(1)].map((l, i) => `<button class="chip${state.level === i ? ' on' : ''}" data-l="${i}">${l}</button>`).join('')}</div>
    ${list.length
      ? `<div class="grid">${list.map(card).join('')}</div>`
      : `<div class="empty"><p>По запросу «${esc(state.q)}» ничего не нашлось. Попробуй название трека или исполнителя.</p></div>`}
  </section>`, animate);
  $$('[data-l]').forEach(b => (b.onclick = () => {
    state.level = +b.dataset.l;
    viewTracks(false);
  }));
}

function showLine(S, i) {
  const l = S.lines[i];
  $('#lineNow').innerHTML = l.words.map(w => w.map(s => `<span class="s" data-n="${s.n}">${esc(s.text)}</span>`).join('')).join(' ');
  $('#lineNext').textContent = S.lines[i + 1]?.text || '';
}

function viewSing(t, duelInfo) {
  state.last = t.id;
  const S = Sound.parse(t);
  render(`
  ${duelInfo
    ? `<div class="duel-banner p${duelInfo.turn + 1}">${avatar(duelInfo.name)}<span>Дуэль, ход ${duelInfo.turn + 1} из 2. Поёт <b>${esc(duelInfo.name)}</b></span></div>`
    : `<nav class="chips scroll">${TRACKS.map(x => `<a class="chip${x === t ? ' on' : ''}" href="#/sing/${x.id}">${x.title}</a>`).join('')}</nav>`}
  <div class="stage-head" style="${grad(t)}">
    <div class="mini-cover">${cover(t)}</div>
    <div class="stage-title">
      <h1>${t.title}</h1>
      <div class="meta"><span>${t.artist}</span>${badge(t)}<span>${t.bpm} BPM</span></div>
    </div>
    <label class="switch"><input type="checkbox" id="guide"${state.guide ? ' checked' : ''}><span></span>Подсказка мелодии</label>
  </div>
  <div class="stage">
    <canvas id="roll"></canvas>
    <div class="hud"><span id="hudNote">Готов?</span><span id="hudHint"></span><span id="hudHits">0 из ${S.notes.length} нот</span></div>
    <div class="count" id="count"></div>
  </div>
  <div class="lyrics"><p class="line" id="lineNow"></p><p class="line next" id="lineNext"></p></div>
  <div class="controls">
    <button class="btn btn-ghost" id="listen">${I.headphones}<span>Послушать эталон</span></button>
    <button class="mic" id="mic" aria-label="Петь">${I.mic}</button>
    <p class="hint">Пой в наушниках, тогда микрофон слышит только тебя</p>
  </div>`);

  const g = fit($('#roll'));
  const idle = () => {
    showLine(S, 0);
    drawRoll(g, S, { ...around(g, S.intro - 0.01), labels: true, head: true });
  };
  idle();
  state.redraw = () => !state.session && idle();
  $('#guide').onchange = e => (state.guide = e.target.checked);
  $('#mic').onclick = () => (state.session ? endSession(true) : startSession(t, duelInfo));
  $('#listen').onclick = () => (state.session ? endSession(true) : startSession(t, duelInfo, true));
}

function setStageLive(on, demo) {
  const mic = $('#mic');
  if (!mic) return;
  mic.classList.toggle('live', on && !demo);
  mic.innerHTML = on ? I.stop : I.mic;
  mic.setAttribute('aria-label', on ? 'Остановить' : 'Петь');
  mic.style.setProperty('--lvl', 0);
  $('#listen').innerHTML = on && demo ? `${I.stop}<span>Остановить</span>` : `${I.headphones}<span>Послушать эталон</span>`;
  $('#guide').disabled = on;
  $('.stage').classList.toggle('on', on);
}

const setText = (el, text, cls) => {
  if (el.textContent !== text) el.textContent = text;
  if (cls !== undefined && el.className !== cls) el.className = cls;
};

async function startSession(t, duelInfo, demo = false) {
  stopSound();
  if (!demo) {
    try {
      await Sound.micOn();
    } catch (e) {
      return toast(micError(e));
    }
  }
  const S = Sound.parse(t), c = Sound.context(), lat = Sound.latency();
  const player = Sound.play(t, { guide: demo || state.guide });
  if (!demo) Sound.recStart();
  const ses = (state.session = {
    t, S, player, demo, duelInfo, raf: 0, line: 0, label: '',
    samples: [], live: S.notes.map(() => [0, 0]), g: fit($('#roll')), spans: $$('#lineNow .s')
  });
  const hud = { note: $('#hudNote'), hint: $('#hudHint'), hits: $('#hudHits'), mic: $('#mic') };
  setStageLive(true, demo);
  setText(hud.note, demo ? 'Эталон' : '—');
  if (demo) setText(hud.hits, '');

  const tick = () => {
    if (state.session !== ses) return;
    const now = c.currentTime - player.t0, ts = now - lat;
    let cur = null;
    if (!demo) {
      const p = Sound.pitch();
      hud.mic.style.setProperty('--lvl', Math.min(1, p.rms * 8).toFixed(2));
      if (ts >= 0) {
        cur = p.m;
        ses.samples.push({ t: ts, m: cur });
        const ni = S.notes.findIndex(n => ts >= n.t && ts < n.t + n.d);
        const d = ni >= 0 && cur != null ? fold(cur - S.notes[ni].midi) : null;
        if (ni >= 0) {
          ses.live[ni][0]++;
          if (d !== null && Math.abs(d) <= 0.75) ses.live[ni][1]++;
        }
        setText(hud.note, cur != null ? `♪ ${Sound.noteName(cur)}` : '—');
        if (ni < 0) setText(hud.hint, '', '');
        else if (d === null) setText(hud.hint, 'Пой!', 'go');
        else if (Math.abs(d) <= 0.5) setText(hud.hint, 'В ноту', 'ok');
        else setText(hud.hint, d < 0 ? 'Выше ↑' : 'Ниже ↓', 'warn');
      }
    }
    const live = ses.live.map(([n, h]) => n > 0 && h / n >= 0.35);
    if (!demo) setText(hud.hits, `${S.notes.filter((n, i) => live[i] && n.t + n.d <= ts).length} из ${S.notes.length} нот`);
    lyricsTick(ses, now);
    countTick(ses, now);
    drawRoll(ses.g, S, { ...around(ses.g, now), samples: ses.samples, live: demo ? null : live, labels: true, head: true, cur });
    if (now >= S.duration) return endSession(false);
    ses.raf = requestAnimationFrame(tick);
  };
  tick();
}

function lyricsTick(ses, now) {
  const S = ses.S;
  let li = S.lines.findIndex(l => now < l.t1 - 0.3);
  if (li < 0) li = S.lines.length - 1;
  if (li !== ses.line) {
    ses.line = li;
    showLine(S, li);
    ses.spans = $$('#lineNow .s');
  }
  ses.spans.forEach(sp => {
    const n = S.notes[sp.dataset.n], p = clamp((now - n.t) / n.d, 0, 1);
    sp.style.setProperty('--p', `${(p * 100).toFixed(1)}%`);
    sp.classList.toggle('done', p >= 1);
  });
}

function countTick(ses, now) {
  const S = ses.S;
  const label = now < 0 ? '' : now < S.intro ? String(4 - Math.floor(now / S.beat)) : now < S.intro + 0.6 ? (ses.demo ? 'Слушай' : 'Пой!') : '';
  if (label === ses.label) return;
  ses.label = label;
  const el = $('#count');
  if (!el || !label) return;
  el.textContent = label;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

async function endSession(cancel) {
  const ses = state.session;
  if (!ses) return;
  state.session = null;
  cancelAnimationFrame(ses.raf);
  ses.player.stop();
  const blob = ses.demo ? null : await Sound.recStop();

  if (cancel || ses.demo) {
    setStageLive(false);
    if ($('#hudNote')) {
      setText($('#hudNote'), 'Готов?');
      setText($('#hudHint'), '', '');
      setText($('#hudHits'), `0 из ${ses.S.notes.length} нот`);
      state.redraw?.();
    }
    return;
  }

  const res = scoreTake(ses.t, ses.samples);
  const name = ses.duelInfo?.name || db.name;
  const prev = bestOf(ses.t.id, name);
  if (!res.silent) addScore({ name, track: ses.t.id, total: res.total, melody: res.melody, rhythm: res.rhythm, mode: ses.duelInfo ? 'duel' : 'solo', date: Date.now() });
  if (state.rec) URL.revokeObjectURL(state.rec);
  state.rec = blob?.size ? URL.createObjectURL(blob) : null;
  ses.duelInfo ? duelNext(res) : viewResult(ses.t, res, prev);
}

function stopSound() {
  if (!state.sound) return;
  state.sound.stop();
  state.sound = null;
  $$('[data-playing]').forEach(b => {
    b.removeAttribute('data-playing');
    b.querySelector('svg').outerHTML = I.play;
  });
}

function toggleSound(btn, start) {
  const was = btn.hasAttribute('data-playing');
  stopSound();
  if (was) return;
  const h = start(() => state.sound === h && stopSound());
  state.sound = h;
  btn.setAttribute('data-playing', '');
  btn.querySelector('svg').outerHTML = I.pause;
}

const playRecording = done => {
  const a = new Audio(state.rec);
  a.onended = done;
  a.play();
  return { stop: () => a.pause() };
};

const playReference = t => done => {
  const p = Sound.play(t), id = setTimeout(done, (Sound.parse(t).duration + 0.3) * 1000);
  return { stop() { clearTimeout(id); p.stop(); } };
};

const ring = v => `<div class="ring">
  <svg viewBox="0 0 120 120" aria-hidden="true">
    <defs><linearGradient id="rg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#1ec468"/><stop offset="1" stop-color="#b6f5cf"/></linearGradient></defs>
    <circle class="bg" cx="60" cy="60" r="52"/><circle class="val" cx="60" cy="60" r="52" pathLength="100" style="--v:${v / 10}"/>
  </svg>
  <div class="ring-num"><b data-count="${v}">0</b><span>из 1000</span></div>
</div>`;

const meter = (name, v, note, cls = '') => `<div class="meter ${cls}">
  <div class="meter-head"><b>${name}</b><span>${v}%</span></div>
  <div class="bar"><i style="--w:${v}%"></i></div>
  <p>${note}</p>
</div>`;

function countUp() {
  $$('[data-count]', view).forEach(el => {
    const to = +el.dataset.count, t0 = performance.now();
    if (reduced) return (el.textContent = to);
    const step = now => {
      const p = Math.min(1, (now - t0) / 1400);
      el.textContent = Math.round(to * (1 - (1 - p) ** 3));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function confetti() {
  if (reduced) return;
  const cv = document.createElement('canvas');
  cv.className = 'confetti';
  document.body.append(cv);
  const { c, w, h } = fit(cv);
  const ps = Array.from({ length: 140 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3, y: h * 0.35,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
    r: Math.random() * 6, s: 5 + Math.random() * 5, c: PALETTE[(Math.random() * PALETTE.length) | 0]
  }));
  let f = 0;
  (function draw() {
    c.clearRect(0, 0, w, h);
    ps.forEach(p => {
      p.vy += 0.35;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += 0.15;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.r);
      c.fillStyle = p.c;
      c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      c.restore();
    });
    ++f < 160 ? requestAnimationFrame(draw) : cv.remove();
  })();
}

function viewResult(t, res, prev) {
  const S = Sound.parse(t), record = prev !== null && res.total > prev;
  render(`
  <section class="result">
    <div class="result-top">
      ${ring(res.total)}
      <div class="result-title">
        <span class="grade g${res.grade}">${res.grade}</span>
        <h1>${res.title}</h1>
        <p class="lead">${t.title}, ${t.artist}</p>
        ${record ? `<span class="pill gold">${I.crown}Новый рекорд, было ${prev}</span>`
          : prev !== null ? `<span class="pill">Твой рекорд на треке ${prev}</span>` : ''}
      </div>
    </div>
    <div class="meters">
      ${meter('Мелодия', res.melody, `${res.hits} из ${res.notes} нот спето точно`)}
      ${meter('Ритм', res.rhythm, `${res.onTime} из ${res.notes} нот начато вовремя`, 'rhythm')}
    </div>
    <div class="panel">
      <div class="panel-head">
        <h3>Ты и эталон</h3>
        <div class="legend"><span><i class="lg-ref"></i>ноты эталона</span><span><i class="lg-ok"></i>попал</span><span><i class="lg-miss"></i>мимо</span></div>
      </div>
      <canvas class="cmp" id="cmp"></canvas>
    </div>
    <ul class="insights">${res.insights.map(([k, s], i) => `<li class="${k}" data-reveal style="--i:${i}">${esc(s)}</li>`).join('')}</ul>
    <div class="actions">
      <button class="btn btn-sing" id="again">${I.retry}Ещё раз</button>
      ${state.rec ? `<button class="btn" id="playMe">${I.play}<span>Твоя запись</span></button>` : ''}
      <button class="btn" id="playRef">${I.play}<span>Эталон</span></button>
      <button class="btn btn-ghost" id="toDuel">${I.swords}Позвать на дуэль</button>
    </div>
  </section>`);

  const g = fit($('#cmp'));
  state.redraw = () => drawRoll(g, S, { from: S.intro - 0.4, to: S.duration, now: Infinity, samples: res.samples, live: res.live });
  state.redraw();
  countUp();
  if (record || res.total >= 750) confetti();
  $('#again').onclick = () => {
    viewSing(t);
    startSession(t);
  };
  if (state.rec) $('#playMe').onclick = e => toggleSound(e.currentTarget, playRecording);
  $('#playRef').onclick = e => toggleSound(e.currentTarget, playReference(t));
  $('#toDuel').onclick = () => {
    state.pick = t.id;
    location.hash = '#/duel';
  };
}

function viewDuel() {
  render(`
  <section>
    <h1>Дуэль</h1>
    <p class="lead">Двое по очереди поют один фрагмент. Побеждает тот, кто точнее попадёт в ноты и ритм.</p>
    <div class="vs-inputs">
      <label class="pl p1"><span>Игрок 1</span><input id="p1" maxlength="18" value="${esc(db.name)}"></label>
      <b class="vs">VS</b>
      <label class="pl p2"><span>Игрок 2</span><input id="p2" maxlength="18" value="${esc(state.p2)}"></label>
    </div>
    <h2 class="sub-h">Трек для баттла</h2>
    <div class="pick">${TRACKS.map(t => `<button class="${t.id === state.pick ? 'on' : ''}" data-id="${t.id}" style="${grad(t)}">
      <span class="mini">${cover(t)}</span><b>${t.title}</b>${badge(t)}</button>`).join('')}</div>
    <button class="btn btn-sing btn-lg" id="go">${I.swords}Начать баттл</button>
  </section>`);
  $$('.pick button').forEach(b => (b.onclick = () => {
    state.pick = b.dataset.id;
    $$('.pick button').forEach(x => x.classList.toggle('on', x === b));
  }));
  $('#go').onclick = () => {
    const names = [$('#p1').value.trim() || 'Игрок 1', $('#p2').value.trim() || 'Игрок 2'];
    if (names[0] === names[1]) names[1] += ' 2';
    state.p2 = names[1];
    state.duel = { t: byId(state.pick), names, turn: 0, res: [] };
    duelTurn();
  };
}

function duelTurn() {
  const d = state.duel;
  viewSing(d.t, { turn: d.turn, name: d.names[d.turn] });
  scrollTo(0, 0);
}

function duelNext(res) {
  const d = state.duel;
  if (!d) return;
  d.res[d.turn] = res;
  if (d.turn === 0) {
    d.turn = 1;
    return viewHandoff();
  }
  viewVersus();
}

function viewHandoff() {
  const d = state.duel, r = d.res[0];
  render(`
  <section class="handoff">
    <div class="score-card p1">${avatar(d.names[0], 'lg')}<span>${esc(d.names[0])}</span><b data-count="${r.total}">0</b><small>Мелодия ${r.melody}%, ритм ${r.rhythm}%</small></div>
    <h1>Теперь поёт ${esc(d.names[1])}</h1>
    <p class="lead">Передай микрофон. Чтобы победить, нужно набрать больше ${r.total} баллов.</p>
    <button class="btn btn-sing btn-lg" id="ready">${I.mic}Я готов петь</button>
  </section>`);
  countUp();
  $('#ready').onclick = duelTurn;
}

function viewVersus() {
  const d = state.duel, [a, b] = d.res, w = a.total === b.total ? -1 : a.total > b.total ? 0 : 1;
  const side = i => {
    const r = d.res[i];
    return `<div class="side p${i + 1}${w === i ? ' win' : ''}">
      ${w === i ? `<span class="crown">${I.crown}</span>` : ''}
      ${avatar(d.names[i], 'lg')}<b class="nm">${esc(d.names[i])}</b>
      <b class="big" data-count="${r.total}">0</b><small>баллов</small>
      <div class="duo"><span>Мелодия<b>${r.melody}%</b></span><span>Ритм<b>${r.rhythm}%</b></span></div>
    </div>`;
  };
  let why = 'Счёт равный, нужен реванш.';
  if (w >= 0) {
    const W = d.res[w], L = d.res[1 - w], gap = Math.abs(a.total - b.total), dm = W.melody - L.melody, dr = W.rhythm - L.rhythm;
    why = `Отрыв ${gap} ${plural(gap, 'балл', 'балла', 'баллов')}. ${
      Math.max(dm, dr) <= 0 ? 'Всё решили мелочи.' : dm >= dr ? `Решила мелодия: точнее на ${dm}%.` : `Решил ритм: точнее на ${dr}%.`}`;
  }
  render(`
  <section>
    <p class="kicker">${d.t.title}, ${LEVELS[d.t.level].toLowerCase()}</p>
    <h1>${w < 0 ? 'Ничья' : `Побеждает ${esc(d.names[w])}`}</h1>
    <p class="lead">${why}</p>
    <div class="versus">${side(0)}<b class="vs">VS</b>${side(1)}</div>
    <div class="actions">
      <button class="btn btn-sing" id="rematch">${I.retry}Реванш</button>
      <button class="btn" id="newDuel">${I.swords}Новая дуэль</button>
      <a class="btn btn-ghost" href="#/top">${I.chart}Таблица лидеров</a>
    </div>
  </section>`);
  countUp();
  if (w >= 0) confetti();
  $('#rematch').onclick = () => {
    Object.assign(d, { turn: 0, res: [] });
    duelTurn();
  };
  $('#newDuel').onclick = () => {
    state.duel = null;
    viewDuel();
  };
}

function viewTop(animate = true) {
  const f = state.top, me = db.name, best = new Map();
  db.scores.filter(s => f === 'all' || s.track === f).forEach(s => {
    const b = best.get(s.name);
    if (!b || s.total > b.total) best.set(s.name, s);
  });
  const list = [...best.values()].sort((a, b) => b.total - a.total);
  const place = list.findIndex(s => s.name === me) + 1;
  const sub = s => `${byId(s.track)?.title || ''}${s.mode === 'duel' ? ', дуэль' : ''}`;
  const pod = i => {
    const s = list[i];
    if (!s) return '<div></div>';
    return `<div class="pod p${i + 1}${s.name === me ? ' me' : ''}" style="--d:${[0.12, 0, 0.24][i]}s">
      <span class="place">${i + 1}</span>${avatar(s.name, 'lg')}<b>${esc(s.name)}</b><span class="sub">${sub(s)}</span><span class="pts">${s.total}</span>
    </div>`;
  };
  render(`
  <section>
    <p class="kicker">Бейся за первое место</p>
    <h1>Таблица лидеров</h1>
    <p class="lead">Сравнивай результаты и попробуй подняться выше. Собери максимум баллов.</p>
    <div class="chips">${[['all', 'Все треки'], ...TRACKS.map(t => [t.id, t.title])].map(([id, l]) =>
      `<button class="chip${f === id ? ' on' : ''}" data-f="${id}">${l}</button>`).join('')}</div>
    ${place ? `<p class="me-place">${avatar(me)}<span>${esc(me)}, ты на ${place}-м месте из ${list.length}</span></p>` : ''}
    ${list.length
      ? `<div class="podium">${[1, 0, 2].map(pod).join('')}</div>
         <ol class="board">${list.slice(3).map((s, i) => `<li class="row${s.name === me ? ' me' : ''}" data-reveal style="--i:${i}">
           <span class="rank">${i + 4}</span>${avatar(s.name)}
           <div class="who"><b>${esc(s.name)}</b><span class="sub">${sub(s)}</span></div>
           <span class="sub split">мелодия ${s.melody}%, ритм ${s.rhythm}%</span><span class="pts">${s.total}</span>
         </li>`).join('')}</ol>`
      : `<div class="empty"><p>На этом треке ещё никто не пел. Первое место свободно.</p><a class="btn btn-sing" href="#/sing/${f}">${I.mic}Спеть первым</a></div>`}
  </section>`, animate);
  $$('[data-f]').forEach(b => (b.onclick = () => {
    state.top = b.dataset.f;
    viewTop(false);
  }));
}

const ROUTES = {
  home: viewHome,
  tracks: viewTracks,
  sing: id => viewSing(byId(id) || byId(state.last) || TRACKS[0]),
  top: viewTop,
  duel: viewDuel
};

function route() {
  cancelAnimationFrame(state.raf);
  endSession(true);
  stopSound();
  state.duel = null;
  state.redraw = null;
  const [page, arg] = location.hash.replace(/^#\/?/, '').split('/');
  const go = ROUTES[page] ? page : 'home';
  $$('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.route === go));
  if (go !== 'tracks' && state.q) state.q = $('#search').value = '';
  if (go !== 'sing' && go !== 'duel') Sound.micOff();
  ROUTES[go](go === 'sing' ? arg : undefined);
  scrollTo(0, 0);
}

function paintUser() {
  $('#userName').textContent = db.name;
  $('#avatar').textContent = db.name[0].toUpperCase();
  $('#avatar').style.setProperty('--c', hue(db.name));
}

$$('[data-i]').forEach(el => (el.outerHTML = I[el.dataset.i]));

$('#search').addEventListener('input', e => {
  state.q = e.target.value;
  location.hash === '#/tracks' ? viewTracks(false) : (location.hash = '#/tracks');
});

$('#user').onclick = () => {
  $('#nameInput').value = db.name === 'Гость' ? '' : db.name;
  $('#nameDlg').showModal();
};

$('#nameDlg').addEventListener('close', () => {
  const v = $('#nameInput').value.trim().slice(0, 18);
  if ($('#nameDlg').returnValue !== 'ok' || !v || v === db.name) return;
  db.scores.forEach(s => s.name === db.name && (s.name = v));
  db.name = v;
  save();
  paintUser();
  toast(`Готово, ${v}. Твои результаты теперь под этим именем.`);
  if (!state.session && !state.duel) route();
});

addEventListener('hashchange', route);
addEventListener('resize', () => state.redraw?.());
paintUser();
route();
