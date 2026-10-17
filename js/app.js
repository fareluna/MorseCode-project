const el = id => document.getElementById(id);
const delay = ms => new Promise(r => setTimeout(r, ms));
let isRun = false, mode = 'enc', currentRunId = 0;

// ================= Audio Engine (Web Audio API) =================
let audioCtx = null;
let soundEnabled = true;

function getAudioCtx() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioCtx = new AudioContext();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function toggleAudio() {
  soundEnabled = !soundEnabled;
  const icon = el('audio-icon');
  const lbl = el('audio-lbl');
  const btn = el('btn-audio');
  if (icon) icon.textContent = soundEnabled ? '🔊' : '🔇';
  if (lbl) lbl.textContent = soundEnabled ? 'Audio ON' : 'Muted';
  if (btn) btn.classList.toggle('muted', !soundEnabled);
  if (soundEnabled) getAudioCtx();
}

function playBeep(freq = 720, durationMs = 70) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (durationMs / 1000));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (durationMs / 1000));
  } catch (e) {}
}

async function playMorseTone(code) {
  if (!soundEnabled || !code) return;
  for (const c of code) {
    if (!isRun) break;
    if (c === '.') {
      playBeep(750, 60);
      await delay(80);
    } else if (c === '-') {
      playBeep(750, 180);
      await delay(200);
    } else if (c === ' ' || c === '/') {
      await delay(90);
    }
  }
}

// ================= HUD & UI Helpers =================
function updateHUD(stateKey, stateDesc, token, progressStr, isErr = false) {
  const hudState = el('hud-state');
  const hudToken = el('hud-token');
  const hudProgress = el('hud-progress');

  if (hudState) {
    const ledClass = isErr ? 'led-reject' : stateKey === 'q_accept' ? 'led-accept' : stateKey === 'q_idle' ? 'led-idle' : 'led-active';
    hudState.innerHTML = `<span class="hud-led ${ledClass}"></span> ${stateDesc}`;
  }
  if (hudToken && token !== undefined) {
    hudToken.textContent = token === ' ' || token === '␣' ? '[Spasi]' : (token || '—');
  }
  if (hudProgress && progressStr !== undefined) {
    hudProgress.textContent = progressStr;
  }
}

function loadSample(key) {
  if (isRun) reset();
  const encSamples = {
    'SOS': 'SOS',
    'HELLO': 'HELLO WORLD',
    'TBO': 'TBO 2026',
    'AUTOMATA': 'AUTOMATA FSM'
  };
  const decSamples = {
    'SOS': '... --- ...',
    'HELLO': '.... . .-.. .-.. --- / .-- --- .-. .-.. -..',
    'TBO': '- -... --- / ..--- ----- ..--- -....',
    'AUTOMATA': '.- ..- - --- -- .- - .-'
  };
  const val = mode === 'enc' ? encSamples[key] : decSamples[key];
  if (val && el('main-input')) {
    el('main-input').value = val;
    el('main-input').focus();
  }
}

function setMode(m) {
  if (isRun) reset();
  mode = m;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  el('main-input').placeholder = m === 'enc' ? 'Ketik teks (A-Z, 0-9)' : 'Contoh: .... . .-.. .-.. --- / .-- --- .-. .-.. -..';
  el('mode-title').textContent = m === 'enc' ? 'Input Teks' : 'Input Kode Morse';
  el('out-title').textContent = m === 'enc' ? 'Output Morse' : 'Output Teks';
  el('lbl-char').textContent = m === 'enc' ? 'char' : 'token';
  el('lbl-emit').textContent = m === 'enc' ? 'Output' : 'Emit';
  if (el('lbl-sigma')) {
    el('lbl-sigma').textContent = m === 'enc' ? '{A-Z, 0-9, Simbol, Spasi}' : '{·, -, /, Spasi}';
  }
  reset();
}

function reset() {
  currentRunId++;
  isRun = false;
  if (el('btn-run')) el('btn-run').disabled = false;
  if (el('main-input')) el('main-input').value = '';
  document.querySelectorAll('.state-node').forEach(g => g.classList.remove('active', 'error'));
  el('q_idle')?.classList.add('active');
  highlightTransition(null);
  updateHUD('q_idle', 'q₀ (Idle)', '—', '0 / 0');
  if (el('main-tape')) el('main-tape').innerHTML = '';
  if (el('main-output')) el('main-output').textContent = '—';
  if (el('main-log')) el('main-log').innerHTML = '<span class="s-state">Siap.</span>';
}

function highlightTransition(rowId, isError = false) {
  document.querySelectorAll('#trans-table tbody tr').forEach(r => r.classList.remove('tr-active', 'tr-error'));
  if (rowId) {
    const row = el(rowId);
    if (row) row.classList.add(isError ? 'tr-error' : 'tr-active');
  }
}

function toggleTBOSection() {
  const content = el('tbo-content');
  const icon = el('tbo-toggle-icon');
  if (!content) return;
  const isHidden = content.style.display === 'none';
  content.style.display = isHidden ? 'block' : 'none';
  if (icon) icon.textContent = isHidden ? 'Tutup ▼' : 'Buka ▶';
}

async function fsmStep(s, err, msg, toks, aIdx, dSet, eIdx, spd, runId, trRowId) {
  if (runId !== currentRunId) return false;
  document.querySelectorAll('.state-node').forEach(g => g.classList.remove('active', 'error'));
  if (s) el(s)?.classList.add('active');
  if (err) el(err)?.classList.add('error');
  highlightTransition(trRowId, Boolean(err));

  const token = aIdx >= 0 && toks ? toks[aIdx] : '—';
  const prog = toks && toks.length > 0 ? `${aIdx >= 0 ? aIdx + 1 : 0} / ${toks.length}` : '0 / 0';
  const sLabelMap = {
    'q_idle': 'q₀ (Idle)',
    'q_read': 'q₁ (Read)',
    'q_lookup': 'q₂ (Lookup)',
    'q_output': 'q₃ (Output)',
    'q_accept': '✓ q_acc (Accept)',
    'q_reject': '✗ q_rej (Reject)'
  };
  const stateKey = err || s;
  updateHUD(stateKey, sLabelMap[stateKey] || stateKey, token, prog, Boolean(err));

  if (toks && el('main-tape')) {
    el('main-tape').innerHTML = toks.map((t, i) => 
      `<div class="tape-cell ${i===aIdx?'active':i===eIdx?'error':dSet.has(i)?'done':''}">
        <span class="cell-idx">${i}</span>
        <span class="cell-val">${t===' '?'␣':t}</span>
      </div>`
    ).join('');

    const activeCell = el('main-tape').querySelector('.tape-cell.active, .tape-cell.error');
    if (activeCell) {
      activeCell.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }

  if (msg && el('main-log')) {
    const l = el('main-log');
    l.innerHTML += msg + '<br>';
    l.scrollTop = l.scrollHeight;
  }

  if (spd) await delay(spd);
  return runId === currentRunId;
}

async function runFSM() {
  if (isRun) return;
  getAudioCtx();
  const raw = el('main-input').value.trim().toUpperCase();
  if (!raw) return;

  const runId = ++currentRunId;
  isRun = true;
  if (el('btn-run')) el('btn-run').disabled = true;
  el('main-log').innerHTML = '';
  el('main-output').textContent = '';
  const spd = parseInt(el('main-speed').value);
  const done = new Set();
  let out = '';

  let toks = [];
  if (mode === 'enc') {
    toks = raw.split('');
  } else {
    const words = raw.includes('/') ? raw.split('/') : raw.split(/\s{2,}/);
    words.forEach((w, wi) => {
      const letters = w.trim().split(/\s+/).filter(Boolean);
      letters.forEach(l => toks.push(l));
      if (wi < words.length - 1 && letters.length > 0) {
        toks.push('␣');
      }
    });
  }

  if (!(await fsmStep('q_idle', null, `<span class="s-state">q₀</span> → Memulai mesin transduser`, toks, -1, done, -1, spd, runId, 'tr-start'))) return;

  for (let i = 0; i < toks.length; i++) {
    if (!isRun || runId !== currentRunId) break;
    const t = toks[i], isSpc = t === ' ' || t === '␣';

    if (!(await fsmStep('q_read', null, `<span class="s-state">q₁</span> → Membaca simbol pita: <span class="s-input">${t}</span>`, toks, i, done, -1, spd, runId, i > 0 ? 'tr-next' : 'tr-start'))) break;

    if (isSpc) {
      out += mode === 'enc' ? ' / ' : ' ';
      el('main-output').textContent = out.trim() || out;
      done.add(i);
      playBeep(450, 40);
      if (!(await fsmStep('q_output', null, `<span class="s-state">q₃</span> → Mencetak jeda kata: <span class="s-output">[spasi]</span>`, toks, -1, done, -1, spd, runId, 'tr-read-spc'))) break;
      continue;
    }

    const res = mode === 'enc' ? MORSE_TABLE[t] : MORSE_REV[t];
    if (!(await fsmStep('q_lookup', null, `<span class="s-state">q₂</span> → Diterjemahkan menjadi: <span class="s-input">${res || '?'}</span>`, toks, i, done, -1, spd, runId, 'tr-read-sym'))) break;

    if (!res) {
      playBeep(320, 220);
      await fsmStep(null, 'q_reject', `<span class="s-err">✗ q_rej → Simbol tidak dikenal! Proses ditolak.</span>`, toks, -1, done, i, spd, runId, 'tr-lookup-rej');
      isRun = false;
      break;
    }

    if (mode === 'enc' && out && !out.endsWith('/ ')) out += ' ';
    out += res;
    el('main-output').textContent = out.trim();
    done.add(i);

    // Audio cue: play morse sound
    if (mode === 'enc') {
      playMorseTone(res);
    } else {
      playMorseTone(t);
    }

    if (!(await fsmStep('q_output', null, `<span class="s-state">q₃</span> → Mencetak hasil: <span class="s-output">${res}</span>`, toks, -1, done, -1, spd, runId, 'tr-lookup-found'))) break;
  }

  if (isRun && runId === currentRunId) {
    playBeep(880, 120);
    await fsmStep('q_accept', null, `<span class="s-state">q_acc</span> → ✓ Translasi selesai (diterima)`, toks, -1, done, -1, 0, runId, 'tr-accept');
  }

  if (runId === currentRunId) {
    isRun = false;
    if (el('btn-run')) el('btn-run').disabled = false;
  }
}

function copyOut(id) {
  const target = el(id);
  const t = target?.textContent;
  if (!t || t === '—') return;

  const showSuccess = () => {
    const b = target.parentElement?.querySelector('.btn-copy');
    if (b) {
      const old = b.textContent;
      b.textContent = '✓ Tersalin!';
      setTimeout(() => b.textContent = old, 1500);
    }
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(t).then(showSuccess).catch(() => fallbackCopy(t, showSuccess));
  } else {
    fallbackCopy(t, showSuccess);
  }
}

function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    cb?.();
  } catch (e) {
    console.error('Copy gagal', e);
  }
  document.body.removeChild(ta);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab-btn').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  el('main-speed')?.addEventListener('input', e => el('speed-lbl').textContent = e.target.value + 'ms');
  el('btn-run').onclick = runFSM;
  document.onkeydown = e => {
    if (e.key === 'Enter' && !e.shiftKey) runFSM();
    if (e.key === 'Escape') reset();
  };
  reset();
});