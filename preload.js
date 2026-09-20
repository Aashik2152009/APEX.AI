const { contextBridge, ipcRenderer } = require('electron');
const inv = (c, ...a) => ipcRenderer.invoke(c, ...a);
contextBridge.exposeInMainWorld('apex', {
  send: (persona, text) => inv('chat:send', { persona, text }),
  speak: (persona, text, test) => inv('tts:speak', { persona, text, test }),
  reset: (persona) => inv('chat:reset', persona),
  status: () => inv('engine:status'),
  getSettings: () => inv('settings:get'),
  setEngine: (e) => inv('settings:engine', e),
  setGeminiModel: (m) => inv('settings:geminiModel', m),
  setLocalModel: (n) => inv('settings:localModel', n),
  setVoice: (persona, voice) => inv('settings:voice', { persona, voice }),
  setKey: (k) => inv('settings:key', k),
  testGemini: () => inv('gemini:test'),
  pullLocal: () => inv('local:pull'),
  openLink: (w) => inv('open:link', w),
  onChunk: (cb) => ipcRenderer.on('chat:chunk', (_e, d) => cb(d)),
  onPull: (cb) => ipcRenderer.on('local:progress', (_e, d) => cb(d)),
});
