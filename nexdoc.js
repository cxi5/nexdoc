// ────────────────────────────────────────────────
// ARMAZENAMENTO — localStorage + fallback memória
// ────────────────────────────────────────────────
const STORAGE_KEY = 'nexdoc_v3';
let _memFallback = [];

function _lsWorks() {
  try { localStorage.setItem('__nx__', '1'); localStorage.removeItem('__nx__'); return true; }
  catch (e) { return false; }
}
const HAS_LS = _lsWorks();

function loadDocs() {
  if (HAS_LS) {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) { return []; }
  }
  return _memFallback.slice();
}
function saveDocs() {
  if (HAS_LS) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(documents)); return; } catch (e) {}
  }
  _memFallback = documents.slice();
}

// ────────────────────────────────────────────────
// ESTADO
// ────────────────────────────────────────────────
let documents = loadDocs();
let currentSheetId = null;
let currentEditId = null;
let sigCtx = null, drawing = false;

// ────────────────────────────────────────────────
// UTILITÁRIOS
// ────────────────────────────────────────────────
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
function kz(v) {
  return v && Number(v) > 0 ? Number(v).toLocaleString('pt-PT') + ' Kz' : '—';
}
function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}
function statusLabel(s) {
  return { rascunho: 'Rascunho', pendente: 'Pendente', assinado: 'Assinado' }[s] || s;
}
function chip(s) {
  return `<span class="chip chip-${s}">${statusLabel(s)}</span>`;
}
function uid() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function showToast(msg, dur = 2400) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), dur);
}

// ────────────────────────────────────────────────
// MODAL DE CONFIRMAÇÃO
// ────────────────────────────────────────────────
function openModal(title, msg, cb) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalMsg').textContent = msg;
  document.getElementById('modalConfirm').onclick = () => { closeModal(); cb(); };
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

// ────────────────────────────────────────────────
// NAVEGAÇÃO
// ────────────────────────────────────────────────
function switchView(view) {
  ['dashboard', 'archive', 'editor'].forEach(v => {
    document.getElementById('view-' + v).style.display = v === view ? 'block' : 'none';
  });
  document.querySelectorAll('.nav-btn').forEach(el =>
    el.classList.toggle('active', el.dataset.view === view)
  );
  const titles = { dashboard: '', archive: 'Arquivo', editor: '' };
  const titleEl = document.getElementById('topbarTitle');
  titleEl.textContent = titles[view];
  titleEl.style.display = titles[view] ? 'block' : 'none';
  if (view === 'dashboard') renderDashboard();
  if (view === 'archive') renderArchive();
  window.scrollTo(0, 0);
}

// ────────────────────────────────────────────────
// LISTAGENS
// ────────────────────────────────────────────────
function renderDashboard() {
  document.getElementById('kpiTotal').textContent = documents.length;
  document.getElementById('kpiRascunho').textContent = documents.filter(d => d.status === 'rascunho').length;
  document.getElementById('kpiPendente').textContent = documents.filter(d => d.status === 'pendente').length;
  document.getElementById('kpiAssinado').textContent = documents.filter(d => d.status === 'assinado').length;
  const list = documents.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  document.getElementById('dashboardList').innerHTML = buildList(list);
}

function renderArchive() {
  const q = (document.getElementById('archiveSearch').value || '').toLowerCase();
  const list = documents
    .filter(d => !q || d.title.toLowerCase().includes(q) || (d.partyA || '').toLowerCase().includes(q) || (d.partyB || '').toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);
  document.getElementById('archiveList').innerHTML = buildList(list);
}

function buildList(list) {
  if (!list.length) return `
    <div class="empty-state">
      <div class="empty-ring">
        <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      </div>
      <h3>Sem contratos</h3>
      <p>Prima + para criar o primeiro contrato.</p>
      <button class="btn-primary" onclick="openEditor(null)">Novo contrato</button>
    </div>`;
  return `<div class="doc-list">${list.map(d => `
    <div class="doc-card s-${d.status}" onclick="openSheet(${d.id})">
      <div class="doc-card-body">
        <div class="doc-card-title">${esc(d.title)}</div>
        <div class="doc-card-meta">${esc(d.partyA || '')}${d.partyA && d.partyB ? ' · ' : ''}${esc(d.partyB || '')}</div>
      </div>
      <div class="doc-card-right">
        ${chip(d.status)}
        <span class="doc-card-value">${kz(d.value)}</span>
      </div>
    </div>`).join('')}</div>`;
}

// ────────────────────────────────────────────────
// EDITOR
// ────────────────────────────────────────────────
function openEditor(id) {
  currentEditId = id;
  const ea = document.getElementById('editorArea');
  if (id) {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;
    document.getElementById('editorHeading').textContent = 'Editar contrato';
    document.getElementById('fTitle').value = doc.title || '';
    document.getElementById('fType').value = doc.type || 'Prestação de Serviços';
    document.getElementById('fValue').value = doc.value || '';
    document.getElementById('fPartyA').value = doc.partyA || '';
    document.getElementById('fPartyB').value = doc.partyB || '';
    ea.innerHTML = doc.contentHtml || '';
    document.getElementById('importZone').style.display = 'none';
  } else {
    document.getElementById('editorHeading').textContent = 'Novo contrato';
    document.getElementById('fTitle').value = '';
    document.getElementById('fType').value = 'Prestação de Serviços';
    document.getElementById('fValue').value = '';
    document.getElementById('fPartyA').value = '';
    document.getElementById('fPartyB').value = '';
    ea.innerHTML = '';
    document.getElementById('importZone').style.display = 'block';
  }
  closeSheet();
  switchView('editor');
  setTimeout(() => ea.focus(), 200);
}

function cancelEdit() {
  currentEditId = null;
  switchView('dashboard');
}

function cmd(command, value) {
  document.execCommand(command, false, value || null);
  document.getElementById('editorArea').focus();
}

function insertHR() {
  document.execCommand('insertHTML', false, '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.15);margin:14px 0">');
  document.getElementById('editorArea').focus();
}

function insertLink() {
  const url = prompt('URL da hiperligação:');
  if (url) document.execCommand('createLink', false, url);
  document.getElementById('editorArea').focus();
}

function saveDocument(status) {
  const title = document.getElementById('fTitle').value.trim() || 'Sem título';
  const type = document.getElementById('fType').value;
  const value = document.getElementById('fValue').value;
  const partyA = document.getElementById('fPartyA').value.trim();
  const partyB = document.getElementById('fPartyB').value.trim();
  const contentHtml = document.getElementById('editorArea').innerHTML;

  if (currentEditId) {
    const doc = documents.find(d => d.id === currentEditId);
    const wasSigned = doc.status === 'assinado';
    Object.assign(doc, { title, type, value, partyA, partyB, contentHtml, status, updatedAt: Date.now() });
    if (wasSigned) { doc.signatureDataUrl = null; doc.hash = null; doc.signedAt = null; }
  } else {
    documents.push({
      id: uid(), title, type, value, partyA, partyB,
      contentHtml, status, createdAt: Date.now(),
      updatedAt: Date.now(), signedAt: null, signatureDataUrl: null, hash: null
    });
  }
  saveDocs();
  currentEditId = null;
  showToast(status === 'rascunho' ? 'Rascunho guardado' : 'Enviado para assinatura');
  switchView('dashboard');
}

// ────────────────────────────────────────────────
// IMPORTAR FICHEIRO
// ────────────────────────────────────────────────
function importFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    let content = e.target.result;
    const ea = document.getElementById('editorArea');
    if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
      const tmp = document.createElement('div');
      tmp.innerHTML = content;
      const body = tmp.querySelector('body');
      ea.innerHTML = body ? body.innerHTML : content;
    } else {
      const lines = content.split('\n');
      ea.innerHTML = lines.map(l => l.trim() ? `<p>${esc(l)}</p>` : '<p><br></p>').join('');
    }
    const titleField = document.getElementById('fTitle');
    if (!titleField.value) {
      titleField.value = file.name.replace(/\.[^/.]+$/, '');
    }
    document.getElementById('importZone').style.display = 'none';
    showToast('Ficheiro carregado — pode editar');
  };
  reader.readAsText(file, 'UTF-8');
  event.target.value = '';
}

// ────────────────────────────────────────────────
// FOLHA DE DETALHE
// ────────────────────────────────────────────────
function openSheet(id) {
  currentSheetId = id;
  renderSheet();
  document.getElementById('sheetOverlay').classList.add('open');
}
function closeSheet() {
  document.getElementById('sheetOverlay').classList.remove('open');
  currentSheetId = null;
}
function handleOverlayClick(e) {
  if (e.target === document.getElementById('sheetOverlay')) closeSheet();
}

function renderSheet() {
  const doc = documents.find(d => d.id === currentSheetId);
  if (!doc) return;
  const panel = document.getElementById('sheetPanel');

  let sigSection = '';
  if (doc.status === 'assinado') {
    sigSection = `
      <div class="sheet-section">
        <h4>Assinatura digital</h4>
        <div class="sig-proof">
          <img src="${doc.signatureDataUrl}" alt="Assinatura">
          <div style="font-size:12px;color:var(--text-muted);margin-top:6px">Assinado em ${fmtDate(doc.signedAt)}</div>
          <div class="sig-hash">${doc.hash}</div>
        </div>
      </div>`;
  } else if (doc.status === 'pendente') {
    sigSection = `
      <div class="sheet-section">
        <h4>Assinar documento</h4>
        <div class="sig-pad-wrap"><canvas id="sigCanvas"></canvas></div>
        <div style="display:flex;gap:10px;margin-top:12px">
          <button class="btn-secondary btn-sm" onclick="clearSignature()">Limpar</button>
          <button class="btn-primary btn-sm" style="flex:1" onclick="confirmSignature()">Confirmar assinatura</button>
        </div>
      </div>`;
  }

  panel.innerHTML = `
    <div class="sheet-topbar">
      <button class="sheet-close" onclick="closeSheet()">
        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      ${chip(doc.status)}
    </div>
    <div class="sheet-title">${esc(doc.title)}</div>
    <div class="sheet-meta">
      <span>${esc(doc.type)}</span>
      ${doc.partyA ? `<span class="meta-dot"></span><span>${esc(doc.partyA)}${doc.partyB ? ' &amp; ' + esc(doc.partyB) : ''}</span>` : ''}
      <span class="meta-dot"></span><span>${kz(doc.value)}</span>
      <span class="meta-dot"></span><span>${fmtDate(doc.createdAt)}</span>
    </div>
    <div class="doc-render">${doc.contentHtml || '<em style="color:var(--text-muted)">Sem conteúdo</em>'}</div>
    ${sigSection}
    <div class="sheet-actions">
      <button class="btn-secondary" onclick="openEditor(${doc.id})">
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Editar
      </button>
      <button class="btn-secondary" onclick="printDocument(${doc.id})">
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Imprimir / PDF
      </button>
      <button class="btn-secondary btn-danger" onclick="confirmDelete(${doc.id})">
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        Eliminar
      </button>
    </div>
  `;
  if (doc.status === 'pendente') requestAnimationFrame(initSignaturePad);
}

// ────────────────────────────────────────────────
// ELIMINAR
// ────────────────────────────────────────────────
function confirmDelete(id) {
  const doc = documents.find(d => d.id === id);
  openModal('Eliminar documento', `"${doc.title}" será eliminado permanentemente. Continuar?`, () => {
    documents = documents.filter(d => d.id !== id);
    saveDocs();
    closeSheet();
    renderDashboard();
    renderArchive();
    showToast('Documento eliminado');
  });
}

// ────────────────────────────────────────────────
// IMPRIMIR / PDF
// ────────────────────────────────────────────────
function printDocument(id) {
  const doc = documents.find(d => d.id === id);
  if (!doc) return;
  const win = window.open('', '_blank');
  if (!win) { showToast('Permite janelas pop-up para imprimir'); return; }
  win.document.write(`<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8">
<title>${esc(doc.title)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', Arial, sans-serif; color: #1A1A1A; background: white; padding: 52px 60px; max-width: 800px; margin: 0 auto; }
  .header { border-bottom: 2px solid #C9A84C; padding-bottom: 20px; margin-bottom: 28px; }
  .header h1 { font-family: 'Instrument Serif', serif; font-size: 24px; color: #1A1A1A; margin-bottom: 8px; }
  .header .meta { font-size: 12px; color: #666; display: flex; gap: 14px; flex-wrap: wrap; }
  .meta-item { display: flex; gap: 4px; align-items: center; }
  .content { font-size: 14px; line-height: 1.85; color: #1A1A1A; }
  .content h1 { font-family: 'Instrument Serif', serif; font-size: 22px; margin: 16px 0 8px; }
  .content h2 { font-family: 'Instrument Serif', serif; font-size: 18px; margin: 14px 0 6px; }
  .content h3 { font-family: 'Instrument Serif', serif; font-size: 15px; margin: 12px 0 6px; color: #444; }
  .content ul, .content ol { padding-left: 22px; margin: 8px 0; }
  .content blockquote { border-left: 3px solid #C9A84C; padding-left: 14px; color: #444; margin: 10px 0; font-style: italic; }
  .content hr { border: none; border-top: 1px solid #ddd; margin: 14px 0; }
  .sig-section { margin-top: 50px; border-top: 1px solid #ddd; padding-top: 20px; }
  .sig-section h4 { font-size: 12px; color: #888; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 12px; }
  .sig-section img { max-height: 60px; display: block; }
  .sig-hash { font-family: monospace; font-size: 9px; color: #aaa; word-break: break-all; margin-top: 10px; }
  .footer { margin-top: 50px; font-size: 11px; color: #aaa; text-align: center; }
  @media print { @page { margin: 18mm 20mm; } }
</style>
</head><body>
<div class="header">
  <h1>${esc(doc.title)}</h1>
  <div class="meta">
    <span class="meta-item"><b>Tipo:</b> ${esc(doc.type)}</span>
    ${doc.partyA ? `<span class="meta-item"><b>Partes:</b> ${esc(doc.partyA)}${doc.partyB ? ' &amp; ' + esc(doc.partyB) : ''}</span>` : ''}
    ${Number(doc.value) > 0 ? `<span class="meta-item"><b>Valor:</b> ${kz(doc.value)}</span>` : ''}
    <span class="meta-item"><b>Data:</b> ${fmtDate(doc.createdAt)}</span>
    <span class="meta-item"><b>Estado:</b> ${statusLabel(doc.status)}</span>
  </div>
</div>
<div class="content">${doc.contentHtml || ''}</div>
${doc.status === 'assinado' ? `
<div class="sig-section">
  <h4>Assinatura digital</h4>
  <img src="${doc.signatureDataUrl}" alt="Assinatura">
  <div style="font-size:12px;color:#666;margin-top:8px">Assinado em ${fmtDate(doc.signedAt)}</div>
  <div class="sig-hash">${doc.hash}</div>
</div>` : ''}
<div class="footer">NexDoc · Gerado em ${new Date().toLocaleDateString('pt-PT')}</div>
</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
}

// ────────────────────────────────────────────────
// ASSINATURA DIGITAL
// ────────────────────────────────────────────────
function initSignaturePad() {
  const canvas = document.getElementById('sigCanvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * 2;
  canvas.height = rect.height * 2;
  sigCtx = canvas.getContext('2d');
  sigCtx.scale(2, 2);
  sigCtx.strokeStyle = '#F0EDE6';
  sigCtx.lineWidth = 2.2;
  sigCtx.lineCap = 'round';
  sigCtx.lineJoin = 'round';
  drawing = false;

  const pos = e => {
    const r = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  };
  const start = e => { drawing = true; const p = pos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); };
  const move = e => { if (!drawing) return; e.preventDefault(); const p = pos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); };
  const end = () => drawing = false;

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseleave', end);
  canvas.addEventListener('touchstart', start, { passive: true });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);
}

function clearSignature() {
  if (!sigCtx) return;
  const c = document.getElementById('sigCanvas');
  sigCtx.clearRect(0, 0, c.width, c.height);
}

async function confirmSignature() {
  const canvas = document.getElementById('sigCanvas');
  const blank = document.createElement('canvas');
  blank.width = canvas.width;
  blank.height = canvas.height;
  if (canvas.toDataURL() === blank.toDataURL()) {
    showToast('Desenhe a assinatura antes de confirmar');
    return;
  }
  const doc = documents.find(d => d.id === currentSheetId);
  doc.signatureDataUrl = canvas.toDataURL();
  const enc = new TextEncoder().encode(doc.contentHtml);
  const hashBuf = await crypto.subtle.digest('SHA-256', enc);
  doc.hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  doc.status = 'assinado';
  doc.signedAt = Date.now();
  saveDocs();
  renderSheet();
  showToast('Documento assinado com sucesso');
  renderDashboard();
}

// ────────────────────────────────────────────────
// INIT
// ────────────────────────────────────────────────
renderDashboard();
