const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const PERSONAS = require('./personas');

const OLLAMA = 'http://127.0.0.1:11434';
const DEFAULT_LOCAL = 'qwen2.5:3b'; // only used if you have no Qwen installed and press Download
let installed = [];
// Use the model you chose; otherwise any Qwen ~3B you already have; otherwise any Qwen; otherwise the first model.
function pickLocal() {
  if (settings.localModel && installed.includes(settings.localModel)) return settings.localModel;
  return installed.find((n) => /qwen.*3b/i.test(n)) || installed.find((n) => /qwen/i.test(n)) || installed[0] || '';
}
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.1-flash-lite'];

/* ---------------- settings (saved on this PC only) ---------------- */
// The Gemini key is encrypted with Windows' own protection (DPAPI via Electron safeStorage)
// and lives in %APPDATA%\Apex AI\settings.json. It is never sent anywhere except Google.
const defaults = { engine: 'local', geminiModel: GEMINI_MODELS[0], keyEnc: '', keyPlain: false, localModel: '', rezeVoice: 'en-US-AriaNeural', alfredVoice: 'en-GB-RyanNeural' };
const VOICES = {
  reze: [['en-US-AriaNeural', 'Aria (warm, natural)'], ['en-US-JennyNeural', 'Jenny (friendly)'], ['en-US-MichelleNeural', 'Michelle (soft)'], ['en-GB-SoniaNeural', 'Sonia (British)'], ['en-US-AnaNeural', 'Ana (child voice)']],
  alfred: [['en-GB-RyanNeural', 'Ryan (British)'], ['en-GB-ThomasNeural', 'Thomas (British)'], ['en-US-ChristopherNeural', 'Christopher (US)'], ['en-US-GuyNeural', 'Guy (US)']],
};
let settings = { ...defaults };
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try { settings = { ...defaults, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch (_) {}
}
function saveSettings() {
  try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings)); } catch (_) {}
}
function getKey() {
  if (!settings.keyEnc) return '';
  try {
    if (settings.keyPlain) return Buffer.from(settings.keyEnc, 'base64').toString('utf8');
    return safeStorage.decryptString(Buffer.from(settings.keyEnc, 'base64'));
  } catch (_) { return ''; }
}
function setKey(raw) {
  const key = String(raw || '').replace(/["'\s]/g, '');
  if (!key) { settings.keyEnc = ''; return saveSettings(); }
  if (safeStorage.isEncryptionAvailable()) { settings.keyEnc = safeStorage.encryptString(key).toString('base64'); settings.keyPlain = false; }
  else { settings.keyEnc = Buffer.from(key, 'utf8').toString('base64'); settings.keyPlain = true; }
  saveSettings();
}

/* ---------------- Alfred's app launcher ---------------- */
// Alfred may only launch apps on this list. Add your own in
// %APPDATA%\Apex AI\apps.json, e.g. {"discord": "C:\\Users\\Ryan\\AppData\\Local\\Discord\\Update.exe"}
const APPS = {
  chrome: 'chrome', browser: 'chrome', edge: 'msedge',
  notepad: 'notepad', calculator: 'calc', calc: 'calc',
  terminal: 'wt', cmd: 'cmd', powershell: 'powershell',
  explorer: 'explorer', vscode: 'code', code: 'code',
  spotify: 'spotify', settings: 'ms-settings:',
  taskmanager: 'taskmgr', paint: 'mspaint',
};
function loadApps() {
  try {
    const f = path.join(app.getPath('userData'), 'apps.json');
    if (fs.existsSync(f)) return { ...APPS, ...JSON.parse(fs.readFileSync(f, 'utf8')) };
  } catch (_) {}
  return APPS;
}

const histories = { reze: [], alfred: [] };

// Hide the leading JSON action line from the visible reply while streaming.
function visible(raw) {
  const t = raw.trimStart();
  if (t.startsWith('{')) {
    const i = t.indexOf('}');
    return i === -1 ? '' : t.slice(i + 1).trim();
  }
  return raw;
}

function runAction(raw) {
  const m = raw.trimStart().match(/^(\{[^}]*\})/);
  if (!m) return null;
  let act;
  try { act = JSON.parse(m[1]); } catch (_) { return null; }
  if (act.action === 'launch') {
    const key = String(act.target || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cmd = loadApps()[key];
    if (!cmd) return { ok: false, text: `"${act.target}" isn't on my app list yet.` };
    try {
      spawn('cmd.exe', ['/c', 'start', '', cmd], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      return { ok: true, text: `Launched ${key}` };
    } catch (e) {
      return { ok: false, text: `Couldn't launch ${key}: ${e.message}` };
    }
  }
  return { ok: false, text: `Action "${act.action}" isn't supported yet.` };
}

/* ---------------- engines ---------------- */
async function streamLocal(p, msgs, onText) {
  await localStatus();
  const LOCAL_MODEL = pickLocal();
  if (!LOCAL_MODEL) throw new Error('No local model found in Ollama. Open Settings and press "Download local model".');
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LOCAL_MODEL, stream: true, keep_alive: '30m',
      messages: [{ role: 'system', content: p.prompt }, ...msgs],
      options: { temperature: p.temperature, num_ctx: 2048 },
    }),
  });
  if (!res.ok) throw new Error(`The local model isn't ready yet (Ollama said ${res.status}). Open Settings and press "Download local model".`);
  await readLines(res, (line) => {
    try { const j = JSON.parse(line); if (j.message && j.message.content) onText(j.message.content); } catch (_) {}
  });
}

async function streamGemini(p, msgs, onText) {
  const key = getKey();
  if (!key) throw new Error('No Gemini key saved yet. Open Settings and paste your key.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.geminiModel)}:streamGenerateContent?alt=sse`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: p.prompt }] },
      contents: msgs.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { temperature: p.temperature },
    }),
  });
  if (!res.ok) throw new Error(await geminiError(res));
  await readLines(res, (line) => {
    if (!line.startsWith('data:')) return;
    try {
      const j = JSON.parse(line.slice(5).trim());
      const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
      for (const part of parts) if (part.text && !part.thought) onText(part.text);
    } catch (_) {}
  });
}

async function geminiError(res) {
  let msg = '';
  try { msg = (await res.json()).error.message || ''; } catch (_) {}
  if (res.status === 400 && /api key/i.test(msg)) return 'Google rejected the Gemini key. Re-copy it from aistudio.google.com/apikey and paste it again in Settings.';
  if (res.status === 401 || res.status === 403) return 'Google refused this key (' + res.status + '). Check the key in Settings, or make a new one.';
  if (res.status === 404) return `Gemini model "${settings.geminiModel}" isn't available to this key. Pick another Gemini model in Settings.`;
  if (res.status === 429) return 'Gemini free limit reached for now. Wait a minute, or pick a lighter Gemini model in Settings.';
  return `Gemini error ${res.status}${msg ? ': ' + msg.slice(0, 140) : ''}`;
}

async function readLines(res, onLine) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) onLine(line);
    }
  }
  if (buf.trim()) onLine(buf.trim());
}

async function streamChat(sender, persona, userText) {
  const p = PERSONAS[persona];
  const hist = histories[persona];
  hist.push({ role: 'user', content: userText });
  const msgs = hist.slice(-12);
  let raw = '';
  const onText = (t) => { raw += t; sender.send('chat:chunk', { persona, text: visible(raw) }); };
  if (settings.engine === 'gemini') await streamGemini(p, msgs, onText);
  else await streamLocal(p, msgs, onText);
  if (!raw.trim()) throw new Error('The model sent back an empty reply. Try again.');
  hist.push({ role: 'assistant', content: raw });
  const action = persona === 'alfred' ? runAction(raw) : null;
  return { reply: visible(raw), action };
}

ipcMain.handle('chat:send', async (e, { persona, text }) => {
  try { return await streamChat(e.sender, persona, text); }
  catch (err) {
    histories[persona].pop();
    const m = String(err.message || err);
    if (/fetch failed|ECONNREFUSED/i.test(m)) {
      return { error: settings.engine === 'gemini'
        ? 'Can\'t reach Google. Check your internet connection, or switch to Local.'
        : 'The local engine is offline. Open Settings to set it up, or switch to Gemini.' };
    }
    return { error: m };
  }
});

/* ---------------- voice ---------------- */
// Neural voices via Microsoft Edge TTS (same service as the Python edge-tts package). Needs internet.
async function synth(voice, text) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const r = tts.toStream(text);
  const stream = r && r.audioStream ? r.audioStream : r;
  const chunks = [];
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('TTS timeout')), 15000);
    const done = () => { clearTimeout(t); resolve(); };
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', done); stream.on('close', done);
    stream.on('error', (e) => { clearTimeout(t); reject(e); });
  });
  try { tts.close && tts.close(); } catch (_) {}
  const buf = Buffer.concat(chunks);
  if (!buf.length) throw new Error('empty audio');
  return buf;
}
ipcMain.handle('tts:speak', async (_e, { persona, text, test }) => {
  const p = PERSONAS[persona];
  const voice = settings[persona + 'Voice'] || p.voice;
  try { return { audio: await synth(voice, test ? p.test : text) }; }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle('chat:reset', (_e, persona) => { histories[persona] = []; return true; });

/* ---------------- status + settings IPC ---------------- */
async function localStatus() {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 1500);
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: ctl.signal }); clearTimeout(t);
    const j = await r.json();
    installed = (j.models || []).map((x) => x.name);
    return { online: true, models: installed, model: pickLocal(), modelReady: installed.length > 0 };
  } catch (_) { installed = []; return { online: false, models: [], model: '', modelReady: false }; }
}
function publicSettings() {
  return { engine: settings.engine, geminiModel: settings.geminiModel, geminiModels: GEMINI_MODELS, hasKey: Boolean(getKey()), localModel: settings.localModel, voices: VOICES, rezeVoice: settings.rezeVoice, alfredVoice: settings.alfredVoice };
}
ipcMain.handle('engine:status', async () => ({ ...publicSettings(), local: await localStatus() }));
ipcMain.handle('settings:get', () => publicSettings());
ipcMain.handle('settings:engine', (_e, engine) => { settings.engine = engine === 'gemini' ? 'gemini' : 'local'; saveSettings(); return publicSettings(); });
ipcMain.handle('settings:geminiModel', (_e, m) => { if (GEMINI_MODELS.includes(m)) { settings.geminiModel = m; saveSettings(); } return publicSettings(); });
ipcMain.handle('settings:localModel', (_e, n) => { settings.localModel = String(n || ''); saveSettings(); return publicSettings(); });
ipcMain.handle('settings:voice', (_e, { persona, voice }) => {
  if (VOICES[persona] && VOICES[persona].some((v) => v[0] === voice)) { settings[persona + 'Voice'] = voice; saveSettings(); }
  return publicSettings();
});
ipcMain.handle('settings:key', (_e, key) => { setKey(key); return publicSettings(); });
ipcMain.handle('open:link', (_e, which) => {
  const links = { key: 'https://aistudio.google.com/apikey', ollama: 'https://ollama.com/download/windows' };
  if (links[which]) shell.openExternal(links[which]);
});

// Quick check that the saved key + model actually work.
ipcMain.handle('gemini:test', async () => {
  try {
    let got = '';
    await streamGemini({ prompt: 'Reply with the single word: ready', temperature: 0 }, [{ role: 'user', content: 'ping' }], (t) => { got += t; });
    return { ok: true, text: got.trim().slice(0, 40) || 'ok' };
  } catch (err) { return { ok: false, error: String(err.message || err) }; }
});

// One-click local model download (replaces typing "ollama pull" in a command prompt).
ipcMain.handle('local:pull', async (e) => {
  const st = await localStatus();
  if (!st.online) return { error: 'Ollama isn\'t running. Install it from ollama.com (button in Settings), open it once, then try again.' };
  try {
    const res = await fetch(`${OLLAMA}/api/pull`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: DEFAULT_LOCAL, stream: true }) });
    if (!res.ok) return { error: `Ollama said ${res.status}.` };
    let failed = '';
    await readLines(res, (line) => {
      try {
        const j = JSON.parse(line);
        if (j.error) failed = j.error;
        const pct = j.total ? Math.round((j.completed || 0) / j.total * 100) : null;
        e.sender.send('local:progress', { status: j.status || '', pct });
      } catch (_) {}
    });
    return failed ? { error: failed } : { ok: true };
  } catch (err) { return { error: 'Download failed: ' + err.message + '. Check your internet connection.' }; }
});

// If Ollama is installed but not running, start it quietly in the background.
async function ensureOllama() {
  if ((await localStatus()).online) return;
  try {
    const exe = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe');
    const cmd = fs.existsSync(exe) ? exe : 'ollama';
    const c = spawn(cmd, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true });
    c.on('error', () => {}); c.unref();
  } catch (_) {}
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 620,
    backgroundColor: '#05050d', autoHideMenuBar: true, title: 'Apex AI',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => { loadSettings(); createWindow(); ensureOllama(); });
app.on('window-all-closed', () => app.quit());
