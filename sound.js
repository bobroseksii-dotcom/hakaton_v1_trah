const Sound = (() => {
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const NAMES = ['До', 'До♯', 'Ре', 'Ре♯', 'Ми', 'Фа', 'Фа♯', 'Соль', 'Соль♯', 'Ля', 'Ля♯', 'Си'];
  let ctx, noise, stream, analyser, buf, diff, rec, chunks;

  const toMidi = s => {
    const [, l, acc, oct] = s.match(/^([A-G])([#b]?)(\d)$/);
    return PC[l] + (acc === '#') - (acc === 'b') + 12 * (+oct + 1);
  };
  const hz = m => 440 * 2 ** ((m - 69) / 12);
  const noteName = m => NAMES[((Math.round(m) % 12) + 12) % 12];

  function context() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function chord(name) {
    const [, root, minor] = name.match(/^([A-G][#b]?)(m?)$/);
    const r = toMidi(root + '3');
    return [r, r + (minor ? 3 : 4), r + 7];
  }

  function parse(track) {
    if (track._s) return track._s;
    const beat = 60 / track.bpm, bar = beat * 4, notes = [], lines = [];
    let t = bar;
    track.lines.forEach(([text, seq], li) => {
      const words = text.split(' ').map(w => w.split('_').map(s => ({ text: s, n: -1 })));
      const syl = words.flat(), t0 = t;
      let k = 0;
      seq.split(' ').forEach(tok => {
        const [p, len = '1'] = tok.split(':');
        const d = parseFloat(len) * beat;
        if (p !== '-') {
          syl[k].n = notes.length;
          notes.push({ midi: toMidi(p), t, d, syl: syl[k++].text, line: li });
        }
        t += d;
      });
      lines.push({ words, t0, t1: t, text: words.map(w => w.map(s => s.text).join('')).join(' ') });
    });
    const ms = notes.map(n => n.midi);
    return (track._s = {
      notes, lines, beat, bar, intro: bar, duration: t + 0.6,
      chords: track.chords.split(' ').map(chord),
      lo: Math.min(...ms), hi: Math.max(...ms)
    });
  }

  function play(track, { guide = true } = {}) {
    const c = context(), S = parse(track), t0 = c.currentTime + 0.1;
    const out = c.createGain(), comp = c.createDynamicsCompressor();
    out.gain.value = 0.85;
    out.connect(comp).connect(c.destination);

    const env = (g, t, d, peak, a = 0.01, r = 0.08) => {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.setValueAtTime(peak, Math.max(t + a, t + d - r));
      g.gain.linearRampToValueAtTime(0, t + d);
    };
    const tone = (type, f, t, d, peak, dest = out, a, r) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.value = f;
      env(g, t, d, peak, a, r);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + d + 0.05);
    };
    const hit = (t, freq, peak, decay) => {
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = noise;
      f.type = 'highpass';
      f.frequency.value = freq;
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + decay);
      s.connect(f).connect(g).connect(out);
      s.start(t, Math.random() * 0.5);
      s.stop(t + decay + 0.02);
    };
    const kick = t => {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.35);
    };

    const padF = c.createBiquadFilter(), bassF = c.createBiquadFilter();
    padF.type = bassF.type = 'lowpass';
    padF.frequency.value = 1100;
    bassF.frequency.value = 420;
    padF.connect(out);
    bassF.connect(out);

    for (let b = 0; b < 4; b++) tone('sine', b ? 1100 : 1650, t0 + b * S.beat, 0.06, 0.18);
    S.chords.forEach((ch, i) => {
      const t = t0 + S.intro + i * S.bar;
      ch.forEach(m => tone('sawtooth', hz(m), t, S.bar, 0.045, padF, 0.25, 0.4));
      [[0, 0.9], [1.5, 0.4], [2, 0.9]].forEach(([at, len]) =>
        tone('sawtooth', hz(ch[0] - 12), t + at * S.beat, len * S.beat, 0.28, bassF));
      for (let b = 0; b < 4; b++) {
        const x = t + b * S.beat;
        b % 2 ? hit(x, 1400, 0.32, 0.16) : kick(x);
        hit(x, 7500, 0.07, 0.05);
        hit(x + S.beat / 2, 7500, 0.045, 0.04);
      }
    });
    if (guide) S.notes.forEach(n => tone('triangle', hz(n.midi), t0 + n.t, n.d, 0.32, out, 0.02, 0.06));

    return {
      t0,
      stop() {
        out.gain.setTargetAtTime(0, c.currentTime, 0.03);
        setTimeout(() => out.disconnect(), 400);
      }
    };
  }

  async function micOn() {
    context();
    if (stream) return;
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('insecure'), { name: 'InsecureError' });
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true }
    });
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    buf = new Float32Array(analyser.fftSize);
    diff = new Float32Array(analyser.fftSize / 2);
    ctx.createMediaStreamSource(stream).connect(analyser);
  }

  function micOff() {
    stream?.getTracks().forEach(t => t.stop());
    stream = analyser = null;
  }

  function yin(x, sr) {
    const W = x.length >> 1, min = Math.floor(sr / 1100), max = Math.min(W - 2, Math.floor(sr / 70));
    let sum = 0;
    for (let tau = 1; tau <= max + 1; tau++) {
      let s = 0;
      for (let i = 0; i < W; i++) {
        const v = x[i] - x[i + tau];
        s += v * v;
      }
      sum += s;
      diff[tau] = (s * tau) / (sum || 1);
    }
    let tau = min;
    while (tau <= max && diff[tau] >= 0.15) tau++;
    if (tau > max) return 0;
    while (tau < max && diff[tau + 1] < diff[tau]) tau++;
    const a = diff[tau - 1], b = diff[tau], c = diff[tau + 1], den = a + c - 2 * b;
    return sr / (tau + (den ? (a - c) / (2 * den) : 0));
  }

  function pitch() {
    if (!analyser) return { m: null, rms: 0 };
    analyser.getFloatTimeDomainData(buf);
    let rms = 0;
    for (const v of buf) rms += v * v;
    rms = Math.sqrt(rms / buf.length);
    if (rms < 0.01) return { m: null, rms };
    const f = yin(buf, ctx.sampleRate);
    return { m: f ? 69 + 12 * Math.log2(f / 440) : null, rms };
  }

  function latency() {
    return (ctx?.outputLatency || 0) + (ctx?.baseLatency || 0) + 0.04;
  }

  function recStart() {
    if (!stream || !window.MediaRecorder) return;
    chunks = [];
    rec = new MediaRecorder(stream);
    rec.ondataavailable = e => chunks.push(e.data);
    rec.start();
  }

  function recStop() {
    return new Promise(done => {
      if (!rec || rec.state === 'inactive') return done(null);
      rec.onstop = () => done(new Blob(chunks, { type: rec.mimeType }));
      rec.stop();
    });
  }

  return { context, parse, play, micOn, micOff, pitch, latency, recStart, recStop, noteName };
})();
