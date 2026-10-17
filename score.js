const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fold = d => (((d % 12) + 18) % 12) - 6;
const plural = (n, one, few, many) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;

const GRADES = [
  [900, 'S', 'Легенда сцены'],
  [750, 'A', 'Звезда вечера'],
  [600, 'B', 'Уверенный вокал'],
  [400, 'C', 'Хороший старт'],
  [0, 'D', 'Разогрев']
];

function scoreTake(track, samples, until = Infinity) {
  const S = Sound.parse(track);
  const count = S.notes.filter(n => n.t + n.d <= until + 0.05).length;
  if (count < 3) return null;

  const per = S.notes.slice(0, count).map((n, i) => {
    const prev = S.notes[i - 1], end = n.t + n.d;
    const legato = prev && prev.midi === n.midi && Math.abs(prev.t + prev.d - n.t) < 0.01;
    const w0 = n.t - (legato ? 0.05 : 0.35), w1 = n.t + Math.min(n.d * 0.9, 0.6);
    let frames = 0, voiced = 0, acc = 0, dev = 0, devN = 0, onset = null;

    for (const s of samples) {
      if (s.t > w1 && s.t >= end) break;
      if (onset === null && s.m != null && s.t >= w0 && s.t <= w1 && Math.abs(fold(s.m - n.midi)) <= 1) onset = s.t - n.t;
      if (s.t < n.t || s.t >= end) continue;
      frames++;
      if (s.m == null) continue;
      voiced++;
      const d = fold(s.m - n.midi);
      acc += clamp(1.6 - Math.abs(d), 0, 1);
      if (Math.abs(d) < 2.5) {
        dev += d;
        devN++;
      }
    }

    const cover = frames ? voiced / frames : 0;
    const mel = (voiced ? acc / voiced : 0) * Math.min(1, cover / 0.45);
    const timing = onset === null ? 0 : clamp(1 - (Math.abs(onset) - 0.13) / 0.32, 0, 1);
    return { n, mel, rhy: 0.6 * timing + 0.4 * Math.min(1, cover / 0.65), onset, dev, devN, hit: mel >= 0.6 };
  });

  const full = S.notes.reduce((a, n) => a + n.d, 0), dur = per.reduce((a, p) => a + p.n.d, 0);
  const part = count === S.notes.length ? 1 : dur / full;
  const melody = per.reduce((a, p) => a + p.mel * p.n.d, 0) / dur;
  const rhythm = per.reduce((a, p) => a + p.rhy, 0) / per.length;
  const quality = 0.6 * melody + 0.4 * rhythm;
  const total = Math.round(1000 * quality * (0.5 + 0.5 * part));
  const [, grade, title] = GRADES.find(([min]) => total >= min);
  const hits = per.filter(p => p.hit).length;
  const onTime = per.filter(p => p.onset !== null && Math.abs(p.onset) <= 0.18).length;

  const devN = per.reduce((a, p) => a + p.devN, 0);
  const dev = devN ? per.reduce((a, p) => a + p.dev, 0) / devN : 0;
  const ons = per.filter(p => p.onset !== null).map(p => p.onset);
  const lag = ons.length ? ons.reduce((a, b) => a + b, 0) / ons.length : 0;
  const lines = S.lines.map((l, i) => {
    const ps = per.filter(p => p.n.line === i);
    return { text: l.text, v: ps.length ? ps.reduce((a, p) => a + p.mel, 0) / ps.length : null };
  }).filter(l => l.v !== null && l.text);
  const best = lines.reduce((a, b) => (b.v > a.v ? b : a), lines[0]);
  const worst = lines.reduce((a, b) => (b.v < a.v ? b : a), lines[0]);
  const sung = samples.filter(s => s.t >= S.intro && s.t <= until);
  const heard = sung.length ? sung.filter(s => s.m != null).length / sung.length : 0;

  const insights = [];
  if (part < 1) {
    const pp = Math.round(part * 100);
    insights.push(['warn', `Ты спел ${pp}% песни. Балл посчитан по спетой части с поправкой на полноту: качество ${Math.round(quality * 100)}%, полнота ${pp}%. Спой до конца, чтобы получить полный разбор голоса.`]);
  }
  if (heard < 0.08) {
    insights.push(['bad', 'Микрофон почти тебя не услышал. Проверь, что в браузере выбран нужный микрофон, и пой погромче.']);
  } else {
    const semis = Math.round(Math.abs(dev));
    insights.push(
      Math.abs(dev) < 0.3
        ? ['good', 'Высоту держишь ровно: голос не сползает ни вверх, ни вниз.']
        : ['warn', `Чаще уходил ${dev > 0 ? 'выше' : 'ниже'} эталона${semis ? ` примерно на ${semis} ${plural(semis, 'полутон', 'полутона', 'полутонов')}` : ', но совсем чуть-чуть'}. Следи за подсказкой над нотой.`]
    );
    const ms = Math.round(Math.abs(lag) * 1000);
    insights.push(
      Math.abs(lag) < 0.08
        ? ['good', 'С темпом всё чётко: вступаешь вместе с музыкой.']
        : ['warn', lag > 0
            ? `В среднем вступаешь на ${ms} мс позже. Начинай ноту, когда она касается белой линии.`
            : `Торопишься примерно на ${ms} мс. Дай музыке тебя догнать.`]
    );
    if (best && best !== worst) {
      insights.push(['good', `Лучше всего получилась строчка «${best.text}».`]);
      if (worst.v < 0.7) insights.push(['bad', `Сложнее всего далась «${worst.text}». Попробуй её ещё раз отдельно.`]);
    }
    insights.push(['tip', part < 0.5
      ? 'Совет: спой хотя бы половину песни, тогда разбор станет заметно точнее.'
      : total >= 900
      ? 'Совет: этот трек покорён. Попробуй посложнее или вызови друга на дуэль.'
      : melody < rhythm
        ? 'Совет: включи подсказку мелодии и пой вместе с ней, пока не запомнишь мотив.'
        : 'Совет: в ноты ты уже попадаешь, теперь целься точно в начало каждой ноты.']);
  }

  return {
    total, grade, title, hits, onTime, insights, samples, part, until,
    silent: heard < 0.08,
    melody: Math.round(melody * 100),
    rhythm: Math.round(rhythm * 100),
    notes: per.length,
    live: per.map(p => p.hit)
  };
}
