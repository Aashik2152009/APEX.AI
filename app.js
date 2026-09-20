const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const PERSONA = {
  reze: {
    greet: "Hey, you made it. Sit with me a while?",
    voice: { prefer: ['Jenny', 'Aria', 'Zira', 'Hazel', 'Susan', 'Female'], pitch: 1.35, rate: 1.05 },
    idle: 'Here with you',
  },
  alfred: {
    greet: "Terminal's up, Ryan Gosling. What are we conquering today?",
    voice: { prefer: ['Ryan', 'George', 'Mark', 'David', 'Male'], pitch: 0.92, rate: 0.98 },
    idle: 'Ready when you are',
  },
};

const state = { view: 'hub', voiceOn: true, busy: false, tools: [], counts: { reze: 0, alfred: 0 } };
let liveEl = null;

/* ---------- views ---------- */
function go(view) {
  state.view = view;
  document.body.dataset.view = view;
  $$('.view').forEach((v) => (v.hidden = v.id !== view));
  const cur = $('#' + view); cur.classList.remove('enter'); void cur.offsetWidth; cur.classList.add('enter');
  if (view !== 'hub') {
    const log = $(`[data-log="${view}"]`);
    if (!log.children.length) addMsg(view, 'ai', PERSONA[view].greet);
    setTimeout(() => $(`[data-composer="${view}"] input`).focus(), 50);
  }
  stopSpeaking();
  setState('idle');
}
$$('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.view !== 'hub') go('hub'); });

/* ---------- ui state ---------- */
function setState(s) {
  document.body.dataset.state = s;
  const label = { idle: PERSONA[state.view]?.idle, thinking: 'Thinking...', speaking: 'Speaking...', listening: 'Listening...' }[s];
  $$('[data-status]').forEach((el) => (el.textContent = label || ''));
}

function addMsg(persona, role, text) {
  const log = $(`[data-log="${persona}"]`);
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  if (role === 'user' || role === 'ai') { state.counts[persona]++; updateCount(); }
  return el;
}
function updateCount() { const c = $('[data-count]'); if (c) c.textContent = `${state.counts.alfred} message${state.counts.alfred === 1 ? '' : 's'}`; }

/* ---------- engine status + switcher ---------- */
let eng = null;
function engineLabel(s) {
  if (s.engine === 'gemini') return s.hasKey ? ['on', 'Gemini \u00b7 cloud'] : ['', 'add Gemini key'];
  const l = s.local;
  return !l.online ? ['', 'local engine offline'] : !l.modelReady ? ['', 'download local model'] : ['on', (l.model || 'local').replace(/:latest$/, '') + ' \u00b7 local'];
}
async function refreshEngine() {
  const s = eng = await window.apex.status();
  const [on, label] = engineLabel(s);
  $$('[data-engine]').forEach((el) => { el.classList.toggle('on', Boolean(on)); $('b', el).textContent = label; });
  $$('[data-engine-pick]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.enginePick === s.engine)));
  const note = $('[data-engine-note]');
  if (note) {
    note.classList.toggle('warn', !on);
    note.textContent = on ? (s.engine === 'gemini' ? `Cloud \u00b7 ${s.geminiModel}` : `Running ${(s.local.model || '').replace(/:latest$/, '')} on this PC \u00b7 works offline`)
      : (s.engine === 'gemini' ? 'Open Settings (\u2699) to paste your Gemini key' : 'Open Settings (\u2699) to set up the local model');
  }
  return s;
}
async function pickEngine(e) { await window.apex.setEngine(e); refreshEngine(); }
$$('[data-engine-pick]').forEach((b) => b.addEventListener('click', () => pickEngine(b.dataset.enginePick)));
$$('.pill[data-engine]').forEach((p) => p.addEventListener('click', () => pickEngine(eng && eng.engine === 'gemini' ? 'local' : 'gemini')));
refreshEngine(); setInterval(refreshEngine, 8000);

/* ---------- settings ---------- */
const modal = $('#settings');
const say = (id, text, cls = '') => { const el = $(id); el.textContent = text; el.className = 'msgline ' + cls; };
async function openSettings() {
  const s = await refreshEngine();
  const sel = $('#modelSel'); sel.innerHTML = '';
  s.geminiModels.forEach((m) => { const o = document.createElement('option'); o.value = m; o.textContent = m; o.selected = m === s.geminiModel; sel.appendChild(o); });
  $('#keyInput').value = ''; $('#keyInput').placeholder = s.hasKey ? 'Key saved. Paste a new one to replace it' : 'Paste Gemini API key';
  say('#keyMsg', s.hasKey ? 'A key is saved on this PC.' : 'No key saved yet.');
  const l = s.local;
  const ls = $('#localSel'); ls.innerHTML = '';
  if (!l.models.length) ls.innerHTML = '<option>(no local models found)</option>';
  l.models.forEach((n) => { const o = document.createElement('option'); o.value = n; o.textContent = n; o.selected = n === l.model; ls.appendChild(o); });
  ['reze', 'alfred'].forEach((who) => {
    const vs = $('#' + who + 'Voice'); vs.innerHTML = '';
    s.voices[who].forEach(([id, name]) => { const o = document.createElement('option'); o.value = id; o.textContent = name; o.selected = id === s[who + 'Voice']; vs.appendChild(o); });
  });
  $('#localHint').textContent = !l.online ? 'Ollama is not running. Install it once (Get Ollama), open it, then come back.' : l.modelReady ? `Ready. Using ${l.model}.` : 'Ollama is running. Press Download to get the model (about 2 GB).';
  $('#pullBtn').disabled = !l.online || l.modelReady;
  say('#pullMsg', '');
  modal.hidden = false;
}
$$('[data-open-settings]').forEach((b) => b.addEventListener('click', openSettings));
$('[data-close]').addEventListener('click', () => (modal.hidden = true));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) { modal.hidden = true; e.stopPropagation(); } }, true);
$$('[data-link]').forEach((b) => b.addEventListener('click', () => window.apex.openLink(b.dataset.link)));
$('#keySave').addEventListener('click', async () => {
  const v = $('#keyInput').value.trim();
  if (!v) return say('#keyMsg', 'Paste your key first.', 'bad');
  await window.apex.setKey(v); $('#keyInput').value = '';
  say('#keyMsg', 'Saved. Testing it now...');
  await window.apex.setEngine('gemini');
  $('#keyTest').click(); refreshEngine();
});
$('#keyClear').addEventListener('click', async () => { await window.apex.setKey(''); say('#keyMsg', 'Key removed.'); refreshEngine(); });
$('#localSel').addEventListener('change', async (e) => { await window.apex.setLocalModel(e.target.value); refreshEngine(); });
['reze', 'alfred'].forEach((who) => $('#' + who + 'Voice').addEventListener('change', (e) => window.apex.setVoice(who, e.target.value)));
$$('[data-vtest]').forEach((b) => b.addEventListener('click', () => speak(b.dataset.vtest, '', true)));
$('#modelSel').addEventListener('change', async (e) => { await window.apex.setGeminiModel(e.target.value); refreshEngine(); });
$('#keyTest').addEventListener('click', async () => {
  say('#keyMsg', 'Testing...');
  const r = await window.apex.testGemini();
  say('#keyMsg', r.ok ? 'Gemini is working.' : r.error, r.ok ? 'ok' : 'bad');
});
window.apex.onPull(({ status, pct }) => {
  $('#prog').hidden = false;
  if (pct != null) $('#prog i').style.width = pct + '%';
  say('#pullMsg', pct != null ? `${status} ${pct}%` : status);
});
$('#pullBtn').addEventListener('click', async () => {
  $('#pullBtn').disabled = true; say('#pullMsg', 'Starting download...');
  const r = await window.apex.pullLocal();
  $('#prog').hidden = true;
  if (r.error) { say('#pullMsg', r.error, 'bad'); $('#pullBtn').disabled = false; }
  else { say('#pullMsg', 'Local model is ready.', 'ok'); refreshEngine(); }
});

/* ---------- chat ---------- */
window.apex.onChunk(({ persona, text }) => { if (liveEl && liveEl.dataset.p === persona) { liveEl.classList.remove('typing'); liveEl.textContent = text; liveEl.parentElement.scrollTop = 1e9; } });

async function send(persona, text) {
  if (!text.trim() || state.busy) return;
  state.busy = true;
  stopSpeaking();
  addMsg(persona, 'user', text);
  liveEl = addMsg(persona, 'ai', '');
  liveEl.classList.add('typing'); liveEl.innerHTML = '<i></i><i></i><i></i>';
  liveEl.dataset.p = persona;
  setState('thinking');

  const r = await window.apex.send(persona, text);
  state.busy = false;

  if (r.error) {
    liveEl.remove(); liveEl = null;
    addMsg(persona, 'err', r.error);
    setState('idle');
    return;
  }
  liveEl.classList.remove('typing');
  liveEl.textContent = r.reply || (r.action ? '' : '...');
  if (!r.reply) liveEl.remove();
  liveEl = null;

  if (r.action) {
    addMsg(persona, 'sys', (r.action.ok ? '▸ ' : '✕ ') + r.action.text);
    if (r.action.ok) { state.tools.unshift(r.action.text); renderTools(); }
  }
  if (r.reply) speak(persona, r.reply); else setState('idle');
}

function renderTools() {
  const ul = $('[data-tools]');
  ul.innerHTML = '';
  state.tools.slice(0, 5).forEach((t) => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
}

$$('[data-composer]').forEach((form) => {
  const persona = form.dataset.composer;
  const input = $('input', form);
  form.addEventListener('submit', (e) => { e.preventDefault(); const t = input.value; input.value = ''; send(persona, t); });
  $('[data-mic]', form).addEventListener('click', () => toggleMic(persona, input, $('[data-mic]', form)));
  $('[data-voice]', form).addEventListener('click', (e) => {
    state.voiceOn = !state.voiceOn;
    $$('[data-voice]').forEach((b) => b.classList.toggle('off', !state.voiceOn));
    if (!state.voiceOn) { stopSpeaking(); setState('idle'); }
  });
});
$$('[data-reset]').forEach((b) => b.addEventListener('click', async () => {
  const p = b.dataset.reset; await window.apex.reset(p);
  $(`[data-log="${p}"]`).innerHTML = ''; state.counts[p] = 0; updateCount(); addMsg(p, 'ai', PERSONA[p].greet);
}));

/* ---------- voice out (Windows built-in voices, works offline) ---------- */
let voices = [];
const loadVoices = () => (voices = speechSynthesis.getVoices());
loadVoices(); speechSynthesis.onvoiceschanged = loadVoices;

function pickVoice(prefer) {
  const en = voices.filter((v) => v.lang.startsWith('en'));
  for (const key of prefer) {
    const v = en.find((x) => x.name.includes(key));
    if (v) return v;
  }
  return en[0] || null;
}
function clean(t) { return t.replace(/[*_`#]/g, '').replace(/\p{Extended_Pictographic}/gu, '').trim(); }

let audioEl = null;
function stopSpeaking() {
  speechSynthesis.cancel();
  if (audioEl) { audioEl.pause(); audioEl = null; }
}

function speakLocal(persona, text) {
  const cfg = PERSONA[persona].voice;
  const u = new SpeechSynthesisUtterance(clean(text));
  const v = pickVoice(cfg.prefer);
  if (v) u.voice = v;
  u.pitch = cfg.pitch; u.rate = cfg.rate;
  u.onstart = () => setState('speaking');
  u.onend = u.onerror = () => setState('idle');
  speechSynthesis.speak(u);
}

// Neural voices (Alfred: en-GB-RyanNeural, Reze: see personas.js) via the main process.
// If the neural service can't be reached (offline), fall back to Windows' built-in voices.
async function speak(persona, text, test = false) {
  if (!state.voiceOn && !test) { setState('idle'); return; }
  stopSpeaking();
  const r = await window.apex.speak(persona, clean(text), test);
  if (r.error || !r.audio) { if (!test) speakLocal(persona, text); else addMsg(persona, 'err', 'Neural voice unavailable (' + (r.error || 'no audio') + ').'); if (test) setState('idle'); return; }
  const url = URL.createObjectURL(new Blob([r.audio], { type: 'audio/mpeg' }));
  const a = new Audio(url); audioEl = a;
  a.onplay = () => setState('speaking');
  a.onended = a.onerror = () => { URL.revokeObjectURL(url); if (audioEl === a) audioEl = null; setState('idle'); };
  a.play().catch(() => setState('idle'));
}
$$('[data-testvoice]').forEach((b) => b.addEventListener('click', () => speak(b.dataset.testvoice, '', true)));

/* ---------- voice in ---------- */
// Electron's Chromium usually can't reach Google's cloud speech service, so this may fail.
// The planned offline replacement is a local Whisper module.
let rec = null;
function toggleMic(persona, input, btn) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return addMsg(persona, 'err', 'Voice input needs the offline Whisper module, which is the next step.');
  if (rec) { rec.stop(); return; }
  rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true;
  btn.classList.add('live'); setState('listening');
  const live = $('[data-live]');
  rec.onresult = (e) => {
    const t = [...e.results].map((r) => r[0].transcript).join('');
    input.value = t; if (live) live.textContent = t;
    if (e.results[e.results.length - 1].isFinal) { input.value = ''; send(persona, t); }
  };
  rec.onerror = (e) => addMsg(persona, 'err', e.error === 'network'
    ? 'Speech service unreachable. Voice input will work once the offline Whisper module is added.'
    : `Mic error: ${e.error}`);
  rec.onend = () => { btn.classList.remove('live'); rec = null; if (live) live.textContent = 'Mic is idle'; if (!state.busy) setState('idle'); };
  rec.start();
}

/* ---------- custom images (your own Reze / logo art) ---------- */
function applyImg(who, url) {
  $$(`[data-img="${who}"]`).forEach((el) => {
    const i = new Image();
    i.className = 'custom'; i.alt = '';
    i.onload = () => { $$(':scope > .custom', el).forEach((x) => x.remove()); el.prepend(i); };
    i.src = url;
  });
}
const picker = $('#picker'); let pickFor = null;
$$('[data-setimg]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); pickFor = b.dataset.setimg; picker.value = ''; picker.click(); }));
picker.addEventListener('change', () => {
  const f = picker.files[0]; if (!f || !pickFor) return;
  const who = pickFor, fr = new FileReader();
  fr.onload = () => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, 800 / Math.max(im.width, im.height));
      const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      const url = c.toDataURL(who === 'alfred' ? 'image/png' : 'image/jpeg', 0.9);
      try { localStorage.setItem('apex.img.' + who, url); } catch (_) {}
      applyImg(who, url);
    };
    im.src = fr.result;
  };
  fr.readAsDataURL(f);
});
['reze', 'alfred'].forEach((w) => { let u = null; try { u = localStorage.getItem('apex.img.' + w); } catch (_) {} if (u) applyImg(w, u); else ['jpg', 'png', 'svg'].forEach((x) => applyImg(w, `${w}.${x}`)); });

/* ---------- decoration ---------- */
const wave = $('[data-wave]');
for (let i = 0; i < 48; i++) {
  const s = document.createElement('span');
  const h = 8 + Math.round(40 * Math.exp(-Math.pow((i - 24) / 12, 2)) * (0.4 + Math.random() * 0.6));
  s.style.setProperty('--h', h + 'px');
  s.style.animationDelay = (Math.random() * -0.9).toFixed(2) + 's';
  wave.appendChild(s);
}
setInterval(() => { const c = $('[data-clock]'); if (c) c.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 1000);
setState('idle');

/* ---------- extra motion ---------- */
const petals = $('[data-petals]');
for (let i = 0; i < 22; i++) {
  const s = document.createElement('span');
  s.style.setProperty('--x', Math.random() * 100 + '%');
  s.style.setProperty('--d', 9 + Math.random() * 12 + 's');
  s.style.setProperty('--s', 3 + Math.random() * 5 + 'px');
  s.style.setProperty('--dx', (Math.random() * 60 - 30) + 'px');
  s.style.animationDelay = (-Math.random() * 20).toFixed(1) + 's';
  petals.appendChild(s);
}
$$('.mind-wrap').forEach((w) => {
  w.addEventListener('mousemove', (e) => {
    const r = w.getBoundingClientRect();
    w.style.setProperty('--ry', ((e.clientX - r.left) / r.width - .5) * 8 + 'deg');
    w.style.setProperty('--rx', (-((e.clientY - r.top) / r.height - .5)) * 6 + 'deg');
  });
  w.addEventListener('mouseleave', () => { w.style.setProperty('--ry', '0deg'); w.style.setProperty('--rx', '0deg'); });
});
$('#hub').classList.add('enter');
