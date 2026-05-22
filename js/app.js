const el = id => document.getElementById(id);
const delay = ms => new Promise(r => setTimeout(r, ms));
let isRun = false, mode = 'enc';

function setMode(m) {
  if (isRun) return;
  mode = m;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  el('main-input').placeholder = m === 'enc' ? 'Ketik teks (A-Z, 0-9)' : 'Contoh: .... . .-.. .-.. ---';
  el('mode-title').textContent = m === 'enc' ? 'Input Teks' : 'Input Kode Morse';
  el('out-title').textContent = m === 'enc' ? 'Output Morse' : 'Output Teks';
  el('lbl-char').textContent = m === 'enc' ? 'char' : 'token';
  el('lbl-emit').textContent = m === 'enc' ? 'Output' : 'Emit';
  reset();
}

function reset() {
  isRun = false;
  if (el('main-input')) el('main-input').value = '';
  document.querySelectorAll('.state-node').forEach(g => g.classList.remove('active', 'error'));
  el('q_idle')?.classList.add('active');
  if (el('main-tape')) el('main-tape').innerHTML = '';
  if (el('main-output')) el('main-output').textContent = '—';
  if (el('main-log')) el('main-log').innerHTML = '<span class="s-state">Siap.</span>';
}

async function fsmStep(s, err, msg, toks, aIdx, dSet, eIdx, spd) {
  document.querySelectorAll('.state-node').forEach(g => g.classList.remove('active', 'error'));
  if (s) el(s)?.classList.add('active');
  if (err) el(err)?.classList.add('error');
  if (toks && el('main-tape')) {
    el('main-tape').innerHTML = toks.map((t, i) => 
      `<div class="tape-cell ${i===aIdx?'active':i===eIdx?'error':dSet.has(i)?'done':''}">${t===' '?'␣':t}</div>`
    ).join('');
  }
  if (msg && el('main-log')) {
    const l = el('main-log'); l.innerHTML += msg + '<br>'; l.scrollTop = l.scrollHeight;
  }
  if (spd) await delay(spd);
}

async function runFSM() {
  if (isRun) return;
  const raw = el('main-input').value.trim().toUpperCase();
  if (!raw) return;
  isRun = true;
  el('main-log').innerHTML = '';
  el('main-output').textContent = '';
  const spd = parseInt(el('main-speed').value);
  const done = new Set();
  let out = '';

  let toks = [];
  if (mode === 'enc') toks = raw.split('');
  else {
    raw.split(raw.includes('/') ? '//' : '   ').forEach((w, wi, arr) => {
      w.trim().split(raw.includes('/') ? /[/ ]+/ : ' ').filter(Boolean).forEach(l => toks.push({ code: l }));
      if (wi < arr.length - 1) toks.push({ word: true });
    });
    toks = toks.map(g => g.word ? '␣' : g.code);
  }

  await fsmStep('q_idle', null, `<span class="s-state">q₀</span> → Memulai proses mesin`, toks, -1, done, -1, spd);

  for (let i = 0; i < toks.length; i++) {
    if (!isRun) break;
    const t = toks[i], isSpc = t === ' ' || t === '␣';

    await fsmStep('q_read', null, `<span class="s-state">q₁</span> → Membaca simbol: <span class="s-input">${t}</span>`, toks, i, done, -1, spd);
    if (!isRun) break;

    if (isSpc) {
      out += mode === 'enc' ? ' / ' : ' ';
      el('main-output').textContent = out.trim() || out; done.add(i);
      await fsmStep('q_output', null, `<span class="s-state">q₃</span> → Mencetak jeda kata: <span class="s-output">[spasi]</span>`, toks, -1, done, -1, spd);
      continue;
    }

    const res = mode === 'enc' ? MORSE_TABLE[t] : MORSE_REV[t];
    await fsmStep('q_lookup', null, `<span class="s-state">q₂</span> → Diterjemahkan menjadi: <span class="s-input">${res || '?'}</span>`, toks, i, done, -1, spd);
    if (!isRun) break;

    if (!res) {
      await fsmStep(null, 'q_reject', `<span class="s-err">✗ q_rej → Simbol tidak dikenal! Proses ditolak.</span>`, toks, -1, done, i, spd);
      isRun = false; break;
    }

    if (mode === 'enc' && out && !out.endsWith('/ ')) out += ' ';
    out += res;
    el('main-output').textContent = out.trim(); done.add(i);
    await fsmStep('q_output', null, `<span class="s-state">q₃</span> → Mencetak hasil: <span class="s-output">${res}</span>`, toks, -1, done, -1, spd);
  }

  if (isRun) await fsmStep('q_accept', null, `<span class="s-state">q_acc</span> → ✓ Translasi selesai (diterima)`, toks, -1, done, -1, 0);
  isRun = false;
}

function copyOut(id) {
  const t = el(id)?.textContent;
  if (!t || t === '—') return;
  navigator.clipboard.writeText(t).then(() => {
    const b = el(id).parentElement.querySelector('.btn-copy');
    if (b) { const old = b.textContent; b.textContent = '✓ Copied!'; setTimeout(() => b.textContent = old, 1500); }
  });
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