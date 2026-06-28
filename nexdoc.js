// ────────────────────────────────────────────────
// SPLASH SCREEN
// ────────────────────────────────────────────────
(function() {
  const canvas = document.getElementById('splash-canvas');
  const ctx = canvas.getContext('2d');
  let W, H, particles = [], raf;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function Particle() {
    this.reset = function() {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.r = Math.random() * 1.5 + 0.4;
      this.vx = (Math.random() - 0.5) * 0.3;
      this.vy = (Math.random() - 0.5) * 0.3;
      this.alpha = Math.random() * 0.6 + 0.2;
      this.gold = Math.random() > 0.6;
    };
    this.reset();
  }

  function init() {
    resize();
    particles = Array.from({ length: 60 }, () => new Particle());
    loop();
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) p.reset();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.gold
        ? `rgba(201,168,76,${p.alpha})`
        : `rgba(240,237,230,${p.alpha * 0.4})`;
      ctx.fill();
    });
    raf = requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  init();

  // Esconde a splash após ~2.8s
  window.addEventListener('load', function() {
    setTimeout(function() {
      const splash = document.getElementById('splash');
      splash.classList.add('hide');
      cancelAnimationFrame(raf);
      setTimeout(() => { splash.style.display = 'none'; }, 550);
    }, 2800);
  });
})();

// ────────────────────────────────────────────────
// ARMAZENAMENTO — localStorage + fallback memória
// ────────────────────────────────────────────────
const STORAGE_KEY = 'nexdoc_v3';
let _memFallback = [];

function _lsWorks() {
  try { localStorage.setItem('__nx__','1'); localStorage.removeItem('__nx__'); return true; }
  catch(e) { return false; }
}
const HAS_LS = _lsWorks();

function loadDocs() {
  if (HAS_LS) {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch(e) { return []; }
  }
  return _memFallback.slice();
}
function saveDocs() {
  if (HAS_LS) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(documents)); return; } catch(e) {}
  }
  _memFallback = documents.slice();
}

// ────────────────────────────────────────────────
// ESTADO
// ────────────────────────────────────────────────
let documents = loadDocs();
let currentSheetId = null;
let currentEditId = null;
let _editorSnapshot = null;
let sigCtx = null, drawing = false;

// ────────────────────────────────────────────────
// UTILITÁRIOS
// ────────────────────────────────────────────────
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function kz(v, currency) {
  if (!v || Number(v) <= 0) return '—';
  const c = (typeof ALL_CURRENCIES !== 'undefined' ? ALL_CURRENCIES : []).find(x => x.code === currency);
  const sym = c ? c.symbol : (currency || 'Kz');
  const num = Number(v).toLocaleString(fmtLocale());
  return currency === 'AOA' || !currency ? `${num} ${sym}` : `${sym} ${num}`;
}
const LANG_LOCALE = { en:'en-GB', pt:'pt-PT', fr:'fr-FR', es:'es-ES' };
function fmtLocale() { return LANG_LOCALE[currentLang] || 'en-GB'; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString(fmtLocale(), { day:'2-digit', month:'short', year:'numeric' }) : '—'; }
function statusLabel(s) { return { rascunho:t('statusDraft'), pendente:t('statusPending'), assinado:t('statusSigned') }[s] || s; }
function chip(s) { return `<span class="chip chip-${s}">${statusLabel(s)}</span>`; }
function uid() { return Date.now() + Math.floor(Math.random()*1000); }

const EXPIRY_WARN_DAYS = 7;
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}
// Devolve null | 'a-expirar' | 'expirado'
function expiryStatus(doc) {
  if (!doc || !doc.expiresAt) return null;
  const diff = daysUntil(doc.expiresAt);
  if (diff === null) return null;
  if (diff < 0) return 'expirado';
  if (diff <= EXPIRY_WARN_DAYS) return 'a-expirar';
  return null;
}
function expiryChip(doc) {
  const s = expiryStatus(doc);
  if (!s) return '';
  const label = s === 'expirado' ? t('chipExpired') : t('chipExpiringSoon');
  return `<span class="chip chip-${s}">${label}</span>`;
}
function fmtDateOnly(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(fmtLocale(), { day:'2-digit', month:'short', year:'numeric' });
}

function showToast(msg, dur = 2400) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), dur);
}

// ────────────────────────────────────────────────
// MODAL DE CONFIRMAÇÃO
// ────────────────────────────────────────────────
let _modalCb = null;
function openModal(title, msg, cb, confirmLabel) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalMsg').textContent = msg;
  document.getElementById('modalConfirm').textContent = confirmLabel || t('btnDelete');
  document.getElementById('modalConfirm').onclick = () => { closeModal(); cb(); };
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }

// ────────────────────────────────────────────────
// NAVEGAÇÃO
// ────────────────────────────────────────────────
function switchView(view) {
  ['dashboard','archive','editor'].forEach(v => {
    document.getElementById('view-'+v).style.display = v === view ? 'block' : 'none';
  });
  document.querySelectorAll('.nav-btn').forEach(el =>
    el.classList.toggle('active', el.dataset.view === view)
  );
  const titles = { dashboard:'', archive:'', editor:'' };
  const titleEl = document.getElementById('topbarTitle');
  titleEl.textContent = titles[view];
  titleEl.style.display = titles[view] ? 'block' : 'none';
  // Esconde a nav quando editor está aberto
  const nav = document.querySelector('.bottomnav');
  if (view === 'editor') {
    nav.classList.add('editor-mode');
    document.body.style.paddingBottom = '20px';
  } else {
    nav.classList.remove('editor-mode');
    document.body.style.paddingBottom = '';
  }
  if (view === 'dashboard') renderDashboard();
  if (view === 'archive') renderArchive();
  window.scrollTo(0,0);
}

// ────────────────────────────────────────────────
// LISTAGENS
// ────────────────────────────────────────────────
function renderDashboard() {
  document.getElementById('kpiTotal').textContent = documents.length;
  document.getElementById('kpiRascunho').textContent = documents.filter(d=>d.status==='rascunho').length;
  document.getElementById('kpiPendente').textContent = documents.filter(d=>d.status==='pendente').length;
  document.getElementById('kpiAssinado').textContent = documents.filter(d=>d.status==='assinado').length;
  const list = documents.slice().sort((a,b)=>b.createdAt-a.createdAt).slice(0,10);
  document.getElementById('dashboardList').innerHTML = buildList(list);
}

let currentStatusFilter = 'todos';

function setStatusFilter(status) {
  currentStatusFilter = status;
  document.querySelectorAll('#statusFilterChips .filter-chip').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.status === status)
  );
  renderArchive();
}

function renderArchive() {
  const q = (document.getElementById('archiveSearch').value||'').toLowerCase();
  const sortBy = document.getElementById('archiveSort').value;
  let list = documents
    .filter(d => currentStatusFilter === 'todos' || d.status === currentStatusFilter)
    .filter(d => !q || d.title.toLowerCase().includes(q) || (d.partyA||'').toLowerCase().includes(q) || (d.partyB||'').toLowerCase().includes(q));

  const sorters = {
    'date-desc':  (a,b) => b.createdAt - a.createdAt,
    'date-asc':   (a,b) => a.createdAt - b.createdAt,
    'value-desc': (a,b) => (Number(b.value)||0) - (Number(a.value)||0),
    'value-asc':  (a,b) => (Number(a.value)||0) - (Number(b.value)||0),
  };
  list = list.slice().sort(sorters[sortBy] || sorters['date-desc']);

  document.getElementById('archiveList').innerHTML = buildList(list);
}

function buildList(list) {
  if (!list.length) return `
    <div class="empty-state">
      <div class="empty-ring"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
      <h3>${t('emptyTitle')}</h3>
      <p>${t('emptyMsg')}</p>
      <button class="btn-primary" onclick="openEditor(null)">${t('emptyBtn')}</button>
    </div>`;
  return `<div class="doc-list">${list.map(d=>`
    <div class="doc-card s-${d.status}" onclick="openSheet(${d.id})">
      <div class="doc-card-body">
        <div class="doc-card-title">${esc(d.title)}</div>
        <div class="doc-card-meta">${esc(d.partyA||'')}${d.partyA&&d.partyB?' · ':''}${esc(d.partyB||'')}</div>
      </div>
      <div class="doc-card-right">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
          ${chip(d.status)}
          ${expiryChip(d)}
        </div>
        <span class="doc-card-value">${kz(d.value, d.currency)}</span>
      </div>
    </div>`).join('')}</div>`;
}

// ────────────────────────────────────────────────
// EDITOR
// ────────────────────────────────────────────────
function openEditor(id) {
  currentEditId = id;
  const ea = document.getElementById('editorArea');
  // Reset custom type field
  document.getElementById('fTypeCustom').style.display = 'none';
  document.getElementById('fTypeCustom').value = '';
  if (id) {
    const doc = documents.find(d=>d.id===id);
    if (!doc) return;
    document.getElementById('editorHeading').textContent = t('editContract');
    document.getElementById('fTitle').value = doc.title || '';
    // Restaurar tipo: doc.typeCode é o código neutro (ex: 'service', 'other').
    const stdCodes = ['service','nda','lease','sale','employment','poa','other'];
    const savedCode = doc.typeCode || '';
    if (stdCodes.includes(savedCode)) {
      document.getElementById('fType').value = savedCode;
      if (savedCode === 'other') {
        document.getElementById('fTypeCustom').style.display = 'block';
        document.getElementById('fTypeCustom').value = doc.typeCustom || '';
      }
    } else {
      // Documento legado (sem typeCode): tenta mapear doc.type para um código
      const legacyMap = {
        'Prestação de Serviços':'service','Acordo de Confidencialidade':'nda',
        'Arrendamento':'lease','Compra e Venda':'sale',
        'Contrato de Trabalho':'employment','Procuração':'poa','Outro':'other',
        'Service Agreement':'service','Non-Disclosure Agreement':'nda',
        'Lease':'lease','Sale & Purchase':'sale',
        'Employment Contract':'employment','Power of Attorney':'poa','Other':'other',
        'Prestation de Services':'service','Accord de Confidentialité':'nda',
        'Bail':'lease','Vente & Achat':'sale',
        'Contrat de Travail':'employment','Procuration':'poa','Autre':'other',
        'Prestación de Servicios':'service','Acuerdo de Confidencialidad':'nda',
        'Arrendamiento':'lease','Compraventa':'sale',
        'Contrato de Trabajo':'employment','Poder Notarial':'poa','Otro':'other',
      };
      const mappedCode = legacyMap[doc.type] || '';
      if (mappedCode && mappedCode !== 'other') {
        document.getElementById('fType').value = mappedCode;
      } else {
        document.getElementById('fType').value = 'other';
        document.getElementById('fTypeCustom').style.display = 'block';
        document.getElementById('fTypeCustom').value = legacyMap[doc.type] ? '' : (doc.type || '');
      }
    }
    setCurrency(doc.currency || null);
    document.getElementById('fValue').value = doc.value || '';
    document.getElementById('fPartyA').value = doc.partyA || '';
    document.getElementById('fPartyB').value = doc.partyB || '';
    document.getElementById('fExpiry').value = doc.expiresAt || '';
    document.getElementById('fNotes').value = doc.notes || '';
    ea.innerHTML = doc.contentHtml || '';
    document.getElementById('importZone').style.display = 'none';
  } else {
    document.getElementById('editorHeading').textContent = t('newContract');
    document.getElementById('fTitle').value = '';
    document.getElementById('fType').value = 'service';
    setCurrency(null);
    document.getElementById('fValue').value = '';
    document.getElementById('fPartyA').value = '';
    document.getElementById('fPartyB').value = '';
    document.getElementById('fExpiry').value = '';
    document.getElementById('fNotes').value = '';
    ea.innerHTML = '';
    document.getElementById('importZone').style.display = 'block';
  }
  closeSheet();
  switchView('editor');
  _editorSnapshot = getEditorSnapshot();
  setTimeout(() => ea.focus(), 200);
}

function getEditorSnapshot() {
  return JSON.stringify({
    title: document.getElementById('fTitle').value,
    type: document.getElementById('fType').value,
    typeCustom: document.getElementById('fTypeCustom').value,
    currency: selectedCurrency,
    value: document.getElementById('fValue').value,
    partyA: document.getElementById('fPartyA').value,
    partyB: document.getElementById('fPartyB').value,
    expiresAt: document.getElementById('fExpiry').value,
    notes: document.getElementById('fNotes').value,
    content: document.getElementById('editorArea').innerHTML
  });
}

function cancelEdit() {
  if (_editorSnapshot !== null && getEditorSnapshot() !== _editorSnapshot) {
    openModal(t('modalCancelTitle'), t('modalCancelMsg'), () => {
      currentEditId = null;
      _editorSnapshot = null;
      switchView('dashboard');
    }, t('btnDiscard'));
    return;
  }
  currentEditId = null;
  _editorSnapshot = null;
  switchView('dashboard');
}

function cmd(command, value) {
  document.execCommand(command, false, value || null);
  document.getElementById('editorArea').focus();
}

// Toggling bold/italic/underline/strike com feedback visual
const FMT_MAP = {
  bold:          { cmd: 'bold',         btn: 'tbBold' },
  italic:        { cmd: 'italic',       btn: 'tbItalic' },
  underline:     { cmd: 'underline',    btn: 'tbUnderline' },
  strikeThrough: { cmd: 'strikeThrough',btn: 'tbStrike' }
};

function toggleFmt(name) {
  const f = FMT_MAP[name];
  document.execCommand(f.cmd, false, null);
  document.getElementById('editorArea').focus();
  updateFmtButtons();
}

function updateFmtButtons() {
  Object.entries(FMT_MAP).forEach(([name, f]) => {
    const active = document.queryCommandState(f.cmd);
    const btn = document.getElementById(f.btn);
    if (btn) btn.classList.toggle('fmt-active', active);
  });
}

function handleTypeChange(val) {
  const custom = document.getElementById('fTypeCustom');
  custom.style.display = val === 'other' ? 'block' : 'none';
  if (val === 'other') custom.focus();
}

function insertHR() {
  document.execCommand('insertHTML', false, '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.15);margin:14px 0">');
  document.getElementById('editorArea').focus();
}

function insertLink() {
  const url = prompt(t('promptInsertLink'));
  if (url) document.execCommand('createLink', false, url);
  document.getElementById('editorArea').focus();
}

function saveDocument(status) {
  const title = document.getElementById('fTitle').value.trim() || t('unnamedFallback');
  const typeCode = document.getElementById('fType').value; // código neutro: 'service', 'other', etc.
  const typeCustom = document.getElementById('fTypeCustom').value.trim();
  const typeKeyMap = { service:'typeService', nda:'typeNDA', lease:'typeLease', sale:'typeSale', employment:'typeEmployment', poa:'typePOA', other:'typeOther' };
  const type = typeCode === 'other'
    ? (typeCustom || t('typeOther'))
    : t(typeKeyMap[typeCode] || typeCode);
  const value = document.getElementById('fValue').value;
  const currency = selectedCurrency;
  const partyA = document.getElementById('fPartyA').value.trim();
  const partyB = document.getElementById('fPartyB').value.trim();
  const expiresAt = document.getElementById('fExpiry').value || null;
  const notes = document.getElementById('fNotes').value.trim();
  const contentHtml = document.getElementById('editorArea').innerHTML;

  if (currentEditId) {
    const doc = documents.find(d=>d.id===currentEditId);
    const wasSigned = doc.status === 'assinado';
    Object.assign(doc, { title, type, typeCode, typeCustom, value, currency, partyA, partyB, expiresAt, notes, contentHtml, status, updatedAt: Date.now() });
    if (wasSigned) { doc.signatureDataUrl = null; doc.hash = null; doc.signedAt = null; }
  } else {
    documents.push({
      id: uid(), title, type, typeCode, typeCustom, value, currency, partyA, partyB, expiresAt, notes,
      contentHtml, status, createdAt: Date.now(),
      updatedAt: Date.now(), signedAt: null, signatureDataUrl: null, hash: null
    });
  }
  saveDocs();
  currentEditId = null;
  _editorSnapshot = null;
  showToast(status === 'rascunho' ? t('toastDraft') : t('toastSentSign'));
  switchView('dashboard');
}

// ────────────────────────────────────────────────
// IMPORTAR FICHEIRO
// ────────────────────────────────────────────────
function importFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';

  const ea = document.getElementById('editorArea');
  const titleField = document.getElementById('fTitle');

  function setTitle() {
    if (!titleField.value) titleField.value = file.name.replace(/\.[^/.]+$/, '');
  }

  // DOCX — usar mammoth para converter para HTML limpo
  if (file.name.toLowerCase().endsWith('.docx')) {
    if (typeof mammoth === 'undefined') {
      showToast('⚠️ mammoth.js não carregado — verifica a ligação à internet');
      return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      mammoth.convertToHtml({ arrayBuffer: e.target.result })
        .then(function(result) {
          ea.innerHTML = result.value || '<p><br></p>';
          setTitle();
          document.getElementById('importZone').style.display = 'none';
          showToast(t('toastFileLoaded'));
        })
        .catch(function() {
          showToast('⚠️ Erro ao converter o ficheiro DOCX');
        });
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  // HTML
  if (file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm')) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const tmp = document.createElement('div');
      tmp.innerHTML = e.target.result;
      const body = tmp.querySelector('body');
      ea.innerHTML = body ? body.innerHTML : e.target.result;
      setTitle();
      document.getElementById('importZone').style.display = 'none';
      showToast(t('toastFileLoaded'));
    };
    reader.readAsText(file, 'UTF-8');
    return;
  }

  // TXT — converte quebras de linha em parágrafos
  const reader = new FileReader();
  reader.onload = function(e) {
    const lines = e.target.result.split('\n');
    ea.innerHTML = lines.map(l => l.trim() ? `<p>${esc(l)}</p>` : '<p><br></p>').join('');
    setTitle();
    document.getElementById('importZone').style.display = 'none';
    showToast(t('toastFileLoaded'));
  };
  reader.readAsText(file, 'UTF-8');
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
  const doc = documents.find(d=>d.id===currentSheetId);
  if (!doc) return;
  const panel = document.getElementById('sheetPanel');

  let sigSection = '';
  if (doc.status === 'assinado') {
    sigSection = `
      <div class="sheet-section">
        <h4>${t('sigSectionSigned')}</h4>
        <div class="sig-proof">
          <img src="${doc.signatureDataUrl}" alt="${t('sigSectionSigned')}">
          <div style="font-size:12px;color:var(--text-muted);margin-top:6px">${t('sigDate')} ${fmtDate(doc.signedAt)}</div>
          <div class="sig-hash">${doc.hash}</div>
        </div>
      </div>`;
  } else if (doc.status === 'pendente') {
    sigSection = `
      <div class="sheet-section">
        <h4>${t('sigSectionSign')}</h4>
        <div class="sig-pad-wrap"><canvas id="sigCanvas"></canvas></div>
        <div style="display:flex;gap:10px;margin-top:12px">
          <button class="btn-secondary btn-sm" onclick="clearSignature()">${t('sigClear')}</button>
          <button class="btn-primary btn-sm" style="flex:1" onclick="confirmSignature()">${t('sigConfirm')}</button>
        </div>
      </div>`;
  }

  panel.innerHTML = `
    <div class="sheet-topbar">
      <button class="sheet-close" onclick="closeSheet()">
        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div style="display:flex;gap:6px">
        ${chip(doc.status)}
        ${expiryChip(doc)}
      </div>
    </div>
    <div class="sheet-title">${esc(doc.title)}</div>
    <div class="sheet-meta">
      <span>${esc(getDocTypeLabel(doc))}</span>
      ${doc.partyA ? `<span class="meta-dot"></span><span>${esc(doc.partyA)}${doc.partyB ? ' &amp; '+esc(doc.partyB) : ''}</span>` : ''}
      <span class="meta-dot"></span><span>${kz(doc.value, doc.currency)}</span>
      <span class="meta-dot"></span><span>${fmtDate(doc.createdAt)}</span>
      ${doc.expiresAt ? `<span class="meta-dot"></span><span>${t('labelExpiry')}: ${fmtDateOnly(doc.expiresAt)}</span>` : ''}
    </div>
    ${doc.notes ? `
    <div class="sheet-section">
      <h4>${t('labelNotes')}</h4>
      <div class="notes-box">${esc(doc.notes).replace(/\n/g,'<br>')}</div>
    </div>` : ''}
    <div class="doc-render">${doc.contentHtml || `<em style="color:var(--text-muted)">${t('sheetNoContent')}</em>`}</div>
    ${sigSection}
    <div class="sheet-actions">
      <button class="btn-secondary" onclick="openEditor(${doc.id})">
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        ${t('btnEdit')}
      </button>
      <button class="btn-secondary" onclick="printDocument(${doc.id})">
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        ${t('btnPrint')}
      </button>
      <button class="btn-secondary" onclick="exportDocumentTxt(${doc.id})">
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>
        ${t('btnExportTxt')}
      </button>
      <button class="btn-secondary" onclick="duplicateDocument(${doc.id})">
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        ${t('btnDuplicate')}
      </button>
      <button class="btn-secondary btn-danger" onclick="confirmDelete(${doc.id})">
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        ${t('btnDelete')}
      </button>
    </div>
  `;
  if (doc.status === 'pendente') requestAnimationFrame(initSignaturePad);
}

// ────────────────────────────────────────────────
// ELIMINAR
// ────────────────────────────────────────────────
function confirmDelete(id) {
  const doc = documents.find(d=>d.id===id);
  openModal(t('modalDeleteTitle'), t('modalDeleteMsg', doc.title), () => {
    documents = documents.filter(d=>d.id!==id);
    saveDocs();
    closeSheet();
    renderDashboard();
    renderArchive();
    showToast(t('toastDeleted'));
  });
}

// ────────────────────────────────────────────────
// IMPRIMIR / PDF
// ────────────────────────────────────────────────
function printDocument(id) {
  const doc = documents.find(d=>d.id===id);
  if (!doc) return;
  const logoDataUrl = localStorage.getItem('nexdoc_logo') || '';

  const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8">
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
  @media print {
    @page { margin: 18mm 20mm; size: A4; }
    body { padding: 0; }
  }
</style>
<script>
  // Força o diálogo de impressão/PDF assim que a página e as fontes carregam
  window.onload = function() {
    // Aguarda renderização das fontes remotas antes de imprimir
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function() {
        setTimeout(function() {
          window.print();
          // Fecha a janela após o utilizador dispensar o diálogo
          window.onfocus = function() { setTimeout(function() { window.close(); }, 800); };
        }, 300);
      });
    } else {
      setTimeout(function() {
        window.print();
        window.onfocus = function() { setTimeout(function() { window.close(); }, 800); };
      }, 800);
    }
  };
<\/script>
</head><body>
<div class="header">
  ${logoDataUrl ? `<img src="${logoDataUrl}" alt="Logo" style="max-height:52px;max-width:160px;object-fit:contain;display:block;margin-bottom:14px">` : ''}
  <h1>${esc(doc.title)}</h1>
  <div class="meta">
    <span class="meta-item"><b>${t('printType')}:</b> ${esc(getDocTypeLabel(doc))}</span>
    ${doc.partyA ? `<span class="meta-item"><b>${t('printParties')}:</b> ${esc(doc.partyA)}${doc.partyB?' &amp; '+esc(doc.partyB):''}</span>` : ''}
    ${Number(doc.value)>0 ? `<span class="meta-item"><b>${t('printValue')}:</b> ${kz(doc.value, doc.currency)}</span>` : ''}
    <span class="meta-item"><b>${t('printDate')}:</b> ${fmtDate(doc.createdAt)}</span>
    <span class="meta-item"><b>${t('printStatus')}:</b> ${statusLabel(doc.status)}</span>
    ${doc.expiresAt ? `<span class="meta-item"><b>${t('labelExpiry')}:</b> ${fmtDateOnly(doc.expiresAt)}</span>` : ''}
  </div>
</div>
<div class="content">${doc.contentHtml || ''}</div>
${doc.status === 'assinado' ? `
<div class="sig-section">
  <h4>${t('printSigTitle')}</h4>
  <img src="${doc.signatureDataUrl}" alt="${t('printSigTitle')}">
  <div style="font-size:12px;color:#666;margin-top:8px">${t('printSignedOn')} ${fmtDate(doc.signedAt)}</div>
  <div class="sig-hash">${doc.hash}</div>
</div>` : ''}
<div class="footer">NexDoc · ${t('printFooter')} ${new Date().toLocaleDateString(fmtLocale())} · Dev: Leonardo Sebastião (Cxi5)</div>
</body></html>`;

  // Usa iframe oculto — tudo dentro do mesmo documento, sem abrir nova aba
  let printFrame = document.getElementById('_nexdoc_print_frame');
  if (printFrame) printFrame.remove();
  printFrame = document.createElement('iframe');
  printFrame.id = '_nexdoc_print_frame';
  printFrame.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;border:none;opacity:0;pointer-events:none';
  document.body.appendChild(printFrame);

  const frameDoc = printFrame.contentDocument || printFrame.contentWindow.document;
  frameDoc.open();
  frameDoc.write(html.replace(/<script>[\s\S]*?<\/script>/i, '')); // remove o auto-print interno
  frameDoc.close();

  // Aguarda fontes/imagens e depois imprime via iframe
  const doprint = function() {
    try {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
    } catch(e) {
      window.print(); // last resort
    }
  };

  if (printFrame.contentDocument.fonts && printFrame.contentDocument.fonts.ready) {
    printFrame.contentDocument.fonts.ready.then(function() { setTimeout(doprint, 250); });
  } else {
    setTimeout(doprint, 600);
  }
}

function _printFallback(html) {
  // Mantido por compatibilidade, agora não é chamado
  showToast(t('popupWarn'));
}

// ────────────────────────────────────────────────
// EXPORTAR COMO .TXT
// ────────────────────────────────────────────────
function htmlToPlainText(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  // Quebras de linha para elementos de bloco e <br>
  tmp.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  const blockTags = 'p,div,h1,h2,h3,h4,h5,h6,li,tr,blockquote,hr';
  tmp.querySelectorAll(blockTags).forEach(el => {
    el.appendChild(document.createTextNode('\n'));
  });
  let text = tmp.textContent || '';
  // Normaliza espaços/linhas em excesso
  text = text.replace(/\u00A0/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.split('\n').map(l => l.replace(/[ \t]+$/,'')).join('\n');
  return text.trim();
}

function slugifyFileName(name) {
  return (name || 'documento')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\-_ ]/g, '')
    .trim().replace(/\s+/g, '-') || 'documento';
}

function exportDocumentTxt(id) {
  const doc = documents.find(d=>d.id===id);
  if (!doc) return;

  const lines = [];
  lines.push(doc.title || t('unnamedFallback'));
  lines.push('');
  lines.push(`${t('printType')}: ${getDocTypeLabel(doc) || '—'}`);
  if (doc.partyA) lines.push(`${t('printParties')}: ${doc.partyA}${doc.partyB ? ' & ' + doc.partyB : ''}`);
  if (Number(doc.value) > 0) lines.push(`${t('printValue')}: ${kz(doc.value, doc.currency)}`);
  lines.push(`${t('printDate')}: ${fmtDate(doc.createdAt)}`);
  lines.push(`${t('printStatus')}: ${statusLabel(doc.status)}`);
  if (doc.expiresAt) lines.push(`${t('labelExpiry')}: ${fmtDateOnly(doc.expiresAt)}`);
  lines.push('');
  lines.push('─'.repeat(40));
  lines.push('');
  lines.push(htmlToPlainText(doc.contentHtml) || t('sheetNoContent'));

  if (doc.status === 'assinado') {
    lines.push('');
    lines.push('─'.repeat(40));
    lines.push(t('printSigTitle'));
    lines.push(`${t('printSignedOn')} ${fmtDate(doc.signedAt)}`);
    if (doc.hash) lines.push(`Hash: ${doc.hash}`);
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugifyFileName(doc.title)}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(t('toastExported'));
}

// ────────────────────────────────────────────────
// DUPLICAR CONTRATO
// ────────────────────────────────────────────────
function duplicateDocument(id) {
  const doc = documents.find(d=>d.id===id);
  if (!doc) return;

  const copy = {
    ...doc,
    id: uid(),
    title: `${doc.title || t('unnamedFallback')} (${t('duplicateSuffix') || 'copy'})`,
    status: 'rascunho',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    signedAt: null,
    signatureDataUrl: null,
    hash: null
  };
  documents.push(copy);
  saveDocs();
  renderDashboard();
  renderArchive();
  showToast(t('toastDuplicated'));
  openSheet(copy.id);
}

// ────────────────────────────────────────────────
// ASSINATURA DIGITAL
// ────────────────────────────────────────────────
function initSignaturePad() {
  const canvas = document.getElementById('sigCanvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * 2; canvas.height = rect.height * 2;
  sigCtx = canvas.getContext('2d');
  sigCtx.scale(2,2);
  sigCtx.strokeStyle = '#F0EDE6'; sigCtx.lineWidth = 2.2; sigCtx.lineCap = 'round'; sigCtx.lineJoin = 'round';
  drawing = false;

  const pos = e => {
    const r = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  };
  const start = e => { drawing = true; const p = pos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x,p.y); };
  const move = e => { if (!drawing) return; e.preventDefault(); const p = pos(e); sigCtx.lineTo(p.x,p.y); sigCtx.stroke(); };
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
  sigCtx.clearRect(0,0,c.width,c.height);
}

async function confirmSignature() {
  const canvas = document.getElementById('sigCanvas');
  const blank = document.createElement('canvas');
  blank.width = canvas.width; blank.height = canvas.height;
  if (canvas.toDataURL() === blank.toDataURL()) { showToast(t('toastDrawSig')); return; }
  const doc = documents.find(d=>d.id===currentSheetId);
  doc.signatureDataUrl = canvas.toDataURL();
  const enc = new TextEncoder().encode(doc.contentHtml);
  const hashBuf = await crypto.subtle.digest('SHA-256', enc);
  doc.hash = Array.from(new Uint8Array(hashBuf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  doc.status = 'assinado';
  doc.signedAt = Date.now();
  saveDocs();
  renderSheet();
  showToast(t('toastSigned'));
  renderDashboard();
}

// ────────────────────────────────────────────────
// LINKS EXTERNOS — abre direto sem confirmação
// ────────────────────────────────────────────────
function openExternal(url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 100);
}

// ────────────────────────────────────────────────
// PAINEL INFO
// ────────────────────────────────────────────────
function toggleInfo() {
  const overlay = document.getElementById('infoOverlay');
  const btn = document.getElementById('infoBtn');
  const isOpen = overlay.classList.contains('open');
  overlay.classList.toggle('open', !isOpen);
  btn.classList.toggle('active', !isOpen);
}
function handleInfoOverlay(e) {
  if (e.target === document.getElementById('infoOverlay')) toggleInfo();
}

// ────────────────────────────────────────────────
// BACKUP / RESTAURO (JSON)
// ────────────────────────────────────────────────
const BACKUP_VERSION = 1;

function exportBackupJson() {
  const payload = {
    app: 'NexDoc',
    backupVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    count: documents.length,
    documents: documents
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0,10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nexdoc-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(t('toastBackupExported'));
}

function handleBackupFile(event) {
  const file = event.target.files[0];
  event.target.value = ''; // permite voltar a escolher o mesmo ficheiro depois
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    let parsed;
    try {
      parsed = JSON.parse(e.target.result);
    } catch (err) {
      showToast(t('toastBackupInvalid'));
      return;
    }

    const incoming = Array.isArray(parsed) ? parsed : parsed.documents;
    if (!Array.isArray(incoming)) {
      showToast(t('toastBackupInvalid'));
      return;
    }

    // Validação mínima: cada item deve parecer um contrato (tem título ou conteúdo)
    const valid = incoming.filter(d => d && typeof d === 'object' && (d.title !== undefined || d.contentHtml !== undefined));
    if (!valid.length) {
      showToast(t('toastBackupInvalid'));
      return;
    }

    openModal(
      t('modalImportTitle'),
      t('modalImportMsg', valid.length),
      () => applyBackupImport(valid),
      t('btnImportBackup')
    );
  };
  reader.readAsText(file, 'UTF-8');
}

function applyBackupImport(incoming) {
  const existingIds = new Set(documents.map(d => d.id));
  let imported = 0;
  incoming.forEach(raw => {
    // Gera sempre um novo id para evitar colisões com documentos existentes
    let newId = uid();
    while (existingIds.has(newId)) newId = uid();
    existingIds.add(newId);

    documents.push({
      id: newId,
      title: raw.title || '',
      // Preserva typeCode (novo formato) e type/typeCustom para compatibilidade
      typeCode: raw.typeCode || '',
      typeCustom: raw.typeCustom || '',
      type: raw.type || '',
      value: raw.value || '',
      currency: raw.currency || null,
      partyA: raw.partyA || '',
      partyB: raw.partyB || '',
      expiresAt: raw.expiresAt || null,
      notes: raw.notes || '',
      contentHtml: raw.contentHtml || '',
      status: ['rascunho','pendente','assinado'].includes(raw.status) ? raw.status : 'rascunho',
      createdAt: raw.createdAt || Date.now(),
      updatedAt: Date.now(),
      signedAt: raw.status === 'assinado' ? (raw.signedAt || null) : null,
      signatureDataUrl: raw.status === 'assinado' ? (raw.signatureDataUrl || null) : null,
      hash: raw.status === 'assinado' ? (raw.hash || null) : null
    });
    imported++;
  });

  saveDocs();
  renderDashboard();
  renderArchive();
  showToast(t('toastBackupImported', imported));
}

// Atualiza botões de formatação ao mover o cursor
document.addEventListener('selectionchange', function() {
  if (document.activeElement && document.getElementById('editorArea') &&
      document.getElementById('editorArea').contains(window.getSelection().anchorNode)) {
    updateFmtButtons();
  }
});

// ────────────────────────────────────────────────
// TIPO DE CONTRATO — resolução em tempo real
// ────────────────────────────────────────────────
// Converte typeCode neutro → texto traduzido no idioma actual.
// Suporta também documentos legados (sem typeCode) com mapeamento retroactivo.
function getDocTypeLabel(doc) {
  const typeKeyMap = {
    service:'typeService', nda:'typeNDA', lease:'typeLease',
    sale:'typeSale', employment:'typeEmployment', poa:'typePOA', other:'typeOther'
  };
  if (doc.typeCode) {
    if (doc.typeCode === 'other') return doc.typeCustom || t('typeOther');
    return t(typeKeyMap[doc.typeCode] || doc.typeCode);
  }
  // Documento legado: usa o texto gravado tal como está
  return doc.type || '';
}

// ────────────────────────────────────────────────
// INTERNATIONALISATION (i18n)
// ────────────────────────────────────────────────
const TRANSLATIONS = {
  en: {
    tagline: 'Contract Management',
    kpiTotal: 'Total', kpiDrafts: 'Drafts', kpiPending: 'Pending', kpiSigned: 'Signed',
    recent: 'Recent',
    searchPlaceholder: 'Search…',
    filterAll: 'All',
    sortDateDesc: 'Date ↓', sortDateAsc: 'Date ↑',
    sortValueDesc: 'Value ↓', sortValueAsc: 'Value ↑',
    newContract: 'New Contract', editContract: 'Edit Contract',
    importText: 'Upload file from device<br><strong>TXT, HTML, DOCX</strong> — to edit here',
    labelTitle: 'Title', labelType: 'Type', labelValue: 'Value',
    labelPartyA: '1st Party', labelPartyB: '2nd Party',
    labelExpiry: 'Expiry date', labelNotes: 'Internal notes',
    notesPlaceholder: 'Notes visible only inside the app',
    notesHint: 'Not included in the printed PDF.',
    chipExpiringSoon: 'Expiring soon', chipExpired: 'Expired',
    titlePlaceholder: 'Contract title',
    typeCustomPlaceholder: 'Specify the contract type',
    currencySearchPlaceholder: 'Search currency…',
    typeService: 'Service Agreement', typeNDA: 'Non-Disclosure Agreement',
    typeLease: 'Lease', typeSale: 'Sale & Purchase',
    typeEmployment: 'Employment Contract', typePOA: 'Power of Attorney', typeOther: 'Other',
    btnCancel: 'Cancel', btnSaveDraft: 'Save Draft', btnSendSign: 'Send to Sign',
    btnDelete: 'Delete', btnEdit: 'Edit', btnPrint: 'Print / PDF',
    btnExportTxt: 'Export .txt', btnDuplicate: 'Duplicate',
    btnDiscard: 'Discard',
    navDashboard: 'Dashboard', navArchive: 'Archive',
    infoLangTitle: 'Language',
    infoHowTitle: 'How to use',
    infoFeatTitle: 'Features',
    infoDataTitle: 'Data',
    infoDevTitle: 'Developer',
    step1: 'Tap the <strong>+</strong> button to create a new contract. Fill in the title, type, parties and value.',
    step2: 'Write content in the <strong>text editor</strong> — you have Word-like formatting tools.',
    step3: 'Save as <strong>Draft</strong> or send to <strong>Sign</strong>. Documents are stored in Archive.',
    step4: 'Open a pending contract and <strong>draw your digital signature</strong> directly on screen.',
    step5: 'Tap <strong>Print / PDF</strong> — the dialog opens automatically, choose "Save as PDF".',
    feat1: '<strong>Rich Editor</strong> — bold, italic, headings, lists, tables and colours.',
    feat2: '<strong>Digital Signature</strong> with SHA-256 hash for authenticity.',
    feat3: '<strong>Import files</strong> TXT or DOC to edit directly.',
    feat4: '<strong>Offline data</strong> — everything saved on your device, no server.',
    feat5: '<strong>Export PDF</strong> — choose "Save as PDF" in the print dialog.',
    devBio: 'Front-end developer with 3 years of experience. Builds websites, platforms and web apps. NexDoc is one of his projects.',
    toastDraft: 'Draft saved', toastSentSign: 'Sent for signature',
    toastDeleted: 'Document deleted', toastFileLoaded: 'File loaded — you can edit',
    toastSigned: 'Document signed successfully', toastDrawSig: 'Draw your signature before confirming',
    toastDuplicated: 'Contract duplicated as draft', toastExported: 'File exported',
    dataBackupHint: 'Export all your contracts to a .json file, or restore them from a previous backup.',
    btnExportBackup: 'Export backup (.json)', btnImportBackup: 'Import backup (.json)',
    toastBackupExported: 'Backup exported',
    toastBackupInvalid: 'Invalid or unrecognised backup file',
    toastBackupImported: (n) => `${n} contract${n===1?'':'s'} imported`,
    modalImportTitle: 'Import backup',
    modalImportMsg: (n) => `${n} contract${n===1?'':'s'} will be added to your archive. Continue?`,
    emptyTitle: 'No contracts', emptyMsg: 'Press + to create your first contract.',
    emptyBtn: 'New Contract',
    modalDeleteTitle: 'Delete document',
    modalDeleteMsg: (title) => `"${title}" will be permanently deleted. Continue?`,
    modalCancelTitle: 'Discard changes?',
    modalCancelMsg: 'You have unsaved changes. If you leave now, they will be lost.',
    sigSectionSigned: 'Digital Signature', sigSectionSign: 'Sign document',
    sigClear: 'Clear', sigConfirm: 'Confirm signature',
    sigDate: 'Signed on',
    sheetNoContent: 'No content',
    printType: 'Type', printParties: 'Parties', printValue: 'Value',
    printDate: 'Date', printStatus: 'Status',
    printSigTitle: 'Digital Signature', printSignedOn: 'Signed on',
    printFooter: 'Generated on',
    statusDraft: 'Draft', statusPending: 'Pending', statusSigned: 'Signed',
    popupWarn: '⚠️ Allow pop-ups to print / save PDF',
    currencyRegionAfrica: 'Africa', currencyRegionEurope: 'Europe',
    currencyRegionAmericas: 'Americas', currencyRegionAsia: 'Asia & Oceania',
    currencyNoResults: 'No results',
    unnamedFallback: 'Untitled',
    duplicateSuffix: 'copy',
    infoPdfLogoTitle: 'PDF Logo',
    infoLogoHint: 'Appears in the PDF header',
    infoChooseImage: 'Choose image',
    infoAppearanceTitle: 'Appearance',
    infoThemeToggle: 'Toggle',
    themeLight: 'Light theme',
    themeDark: 'Dark theme',
    tbBold: 'Bold (Ctrl+B)', tbItalic: 'Italic (Ctrl+I)', tbUnderline: 'Underline', tbStrike: 'Strikethrough',
    tbStyleSelect: 'Style', tbStylePlaceholder: 'Style…', tbStyleParagraph: 'Paragraph',
    tbStyleH1: 'Heading 1', tbStyleH2: 'Heading 2', tbStyleH3: 'Heading 3',
    tbStyleQuote: 'Quote', tbStyleCode: 'Code',
    tbFontSelect: 'Font', tbFontDefault: 'Default (Inter)', tbFontClassic: 'Classic',
    tbFontSize: 'Font size',
    tbAlignLeft: 'Align left', tbAlignCenter: 'Center', tbAlignRight: 'Align right', tbAlignJustify: 'Justify',
    tbListBullet: 'Bullet list', tbListOrdered: 'Numbered list',
    tbIndentDecrease: 'Decrease indent', tbIndentIncrease: 'Increase indent',
    tbHRule: 'Horizontal rule', tbInsertLink: 'Insert hyperlink', tbClearFormat: 'Clear formatting',
    tbUndo: 'Undo (Ctrl+Z)', tbRedo: 'Redo (Ctrl+Y)',
    tbTextColor: 'Text colour', tbBgColor: 'Highlight colour',
    toastLogoTooLarge: '⚠️ Image too large (max. 500 KB)',
    toastLogoSaved: 'Logo saved successfully',
    toastLogoRemoved: 'Logo removed',
    promptInsertLink: 'Hyperlink URL:',
    partyPlaceholder: 'Name / company',
  },
  pt: {
    tagline: 'Gestão de Contratos',
    kpiTotal: 'Total', kpiDrafts: 'Rascunhos', kpiPending: 'Pendentes', kpiSigned: 'Assinados',
    recent: 'Recentes',
    searchPlaceholder: 'Procurar…',
    filterAll: 'Todos',
    sortDateDesc: 'Data ↓', sortDateAsc: 'Data ↑',
    sortValueDesc: 'Valor ↓', sortValueAsc: 'Valor ↑',
    newContract: 'Novo Contrato', editContract: 'Editar Contrato',
    importText: 'Carregar ficheiro do dispositivo<br><strong>TXT, HTML, DOCX</strong> — para editar aqui',
    labelTitle: 'Título', labelType: 'Tipo', labelValue: 'Valor',
    labelPartyA: '1.º Outorgante', labelPartyB: '2.º Outorgante',
    labelExpiry: 'Data de validade', labelNotes: 'Notas internas',
    notesPlaceholder: 'Notas visíveis apenas dentro da app',
    notesHint: 'Não aparece no PDF impresso.',
    chipExpiringSoon: 'A expirar', chipExpired: 'Expirado',
    titlePlaceholder: 'Título do contrato',
    typeCustomPlaceholder: 'Especifique o tipo de contrato',
    currencySearchPlaceholder: 'Pesquisar moeda…',
    typeService: 'Prestação de Serviços', typeNDA: 'Acordo de Confidencialidade',
    typeLease: 'Arrendamento', typeSale: 'Compra e Venda',
    typeEmployment: 'Contrato de Trabalho', typePOA: 'Procuração', typeOther: 'Outro',
    btnCancel: 'Cancelar', btnSaveDraft: 'Guardar rascunho', btnSendSign: 'Enviar para assinar',
    btnDelete: 'Eliminar', btnEdit: 'Editar', btnPrint: 'Imprimir / PDF',
    btnExportTxt: 'Exportar .txt', btnDuplicate: 'Duplicar',
    btnDiscard: 'Descartar',
    navDashboard: 'Painel', navArchive: 'Arquivo',
    infoLangTitle: 'Idioma',
    infoHowTitle: 'Como usar',
    infoFeatTitle: 'Funcionalidades',
    infoDataTitle: 'Dados',
    infoDevTitle: 'Desenvolvedor',
    step1: 'Toca no botão <strong>+</strong> para criar um novo contrato. Preenche o título, tipo, partes e valor.',
    step2: 'Escreve o conteúdo no <strong>editor de texto</strong> — tens ferramentas de formatação como Word.',
    step3: 'Guarda como <strong>Rascunho</strong> ou envia para <strong>Assinar</strong>. Os documentos ficam no Arquivo.',
    step4: 'Abre um contrato pendente e <strong>desenha a assinatura digital</strong> diretamente no ecrã.',
    step5: 'Toca em <strong>Imprimir / PDF</strong> — o diálogo abre automaticamente, escolhe "Guardar como PDF".',
    feat1: '<strong>Editor rico</strong> — negrito, itálico, títulos, listas, tabelas e cores.',
    feat2: '<strong>Assinatura digital</strong> com hash SHA-256 para autenticidade.',
    feat3: '<strong>Importar ficheiros</strong> TXT ou DOC para editar diretamente.',
    feat4: '<strong>Dados offline</strong> — tudo guardado no teu dispositivo, sem servidor.',
    feat5: '<strong>Exportar PDF</strong> — escolhe "Guardar como PDF" no diálogo de impressão.',
    devBio: 'Developer front-end com 3 anos de experiência. Cria sites, plataformas e apps web. NexDoc é um dos seus projetos.',
    toastDraft: 'Rascunho guardado', toastSentSign: 'Enviado para assinatura',
    toastDeleted: 'Documento eliminado', toastFileLoaded: 'Ficheiro carregado — pode editar',
    toastSigned: 'Documento assinado com sucesso', toastDrawSig: 'Desenhe a assinatura antes de confirmar',
    toastDuplicated: 'Contrato duplicado como rascunho', toastExported: 'Ficheiro exportado',
    dataBackupHint: 'Exporta todos os teus contratos para um ficheiro .json, ou restaura-os a partir de um backup anterior.',
    btnExportBackup: 'Exportar backup (.json)', btnImportBackup: 'Importar backup (.json)',
    toastBackupExported: 'Backup exportado',
    toastBackupInvalid: 'Ficheiro de backup inválido ou não reconhecido',
    toastBackupImported: (n) => `${n} contrato${n===1?'':'s'} importado${n===1?'':'s'}`,
    modalImportTitle: 'Importar backup',
    modalImportMsg: (n) => `${n} contrato${n===1?'':'s'} ${n===1?'será':'serão'} adicionado${n===1?'':'s'} ao teu arquivo. Continuar?`,
    emptyTitle: 'Sem contratos', emptyMsg: 'Prima + para criar o primeiro contrato.',
    emptyBtn: 'Novo contrato',
    modalDeleteTitle: 'Eliminar documento',
    modalDeleteMsg: (title) => `"${title}" será eliminado permanentemente. Continuar?`,
    modalCancelTitle: 'Descartar alterações?',
    modalCancelMsg: 'Tens alterações não guardadas. Se saíres agora, vão perder-se.',
    sigSectionSigned: 'Assinatura digital', sigSectionSign: 'Assinar documento',
    sigClear: 'Limpar', sigConfirm: 'Confirmar assinatura',
    sigDate: 'Assinado em',
    sheetNoContent: 'Sem conteúdo',
    printType: 'Tipo', printParties: 'Partes', printValue: 'Valor',
    printDate: 'Data', printStatus: 'Estado',
    printSigTitle: 'Assinatura digital', printSignedOn: 'Assinado em',
    printFooter: 'Gerado em',
    statusDraft: 'Rascunho', statusPending: 'Pendente', statusSigned: 'Assinado',
    popupWarn: '⚠️ Permite pop-ups para imprimir / salvar PDF',
    currencyRegionAfrica: 'África', currencyRegionEurope: 'Europa',
    currencyRegionAmericas: 'Américas', currencyRegionAsia: 'Ásia & Oceânia',
    currencyNoResults: 'Sem resultados',
    unnamedFallback: 'Sem título',
    duplicateSuffix: 'cópia',
    infoPdfLogoTitle: 'Logo do PDF',
    infoLogoHint: 'Aparece no cabeçalho do PDF',
    infoChooseImage: 'Escolher imagem',
    infoAppearanceTitle: 'Aparência',
    infoThemeToggle: 'Alternar',
    themeLight: 'Tema claro',
    themeDark: 'Tema escuro',
    tbBold: 'Negrito (Ctrl+B)', tbItalic: 'Itálico (Ctrl+I)', tbUnderline: 'Sublinhado', tbStrike: 'Rasurado',
    tbStyleSelect: 'Estilo', tbStylePlaceholder: 'Estilo…', tbStyleParagraph: 'Parágrafo',
    tbStyleH1: 'Título 1', tbStyleH2: 'Título 2', tbStyleH3: 'Título 3',
    tbStyleQuote: 'Citação', tbStyleCode: 'Código',
    tbFontSelect: 'Tipo de letra', tbFontDefault: 'Padrão (Inter)', tbFontClassic: 'Clássica',
    tbFontSize: 'Tamanho da letra',
    tbAlignLeft: 'Alinhar à esquerda', tbAlignCenter: 'Centrar', tbAlignRight: 'Alinhar à direita', tbAlignJustify: 'Justificar',
    tbListBullet: 'Lista com marcadores', tbListOrdered: 'Lista numerada',
    tbIndentDecrease: 'Diminuir avanço', tbIndentIncrease: 'Aumentar avanço',
    tbHRule: 'Linha horizontal', tbInsertLink: 'Inserir hiperligação', tbClearFormat: 'Limpar formatação',
    tbUndo: 'Desfazer (Ctrl+Z)', tbRedo: 'Refazer (Ctrl+Y)',
    tbTextColor: 'Cor do texto', tbBgColor: 'Cor de fundo',
    toastLogoTooLarge: '⚠️ Imagem demasiado grande (máx. 500 KB)',
    toastLogoSaved: 'Logo guardado com sucesso',
    toastLogoRemoved: 'Logo removido',
    promptInsertLink: 'URL da hiperligação:',
    partyPlaceholder: 'Nome / empresa',
  },
  fr: {
    tagline: 'Gestion de Contrats',
    kpiTotal: 'Total', kpiDrafts: 'Brouillons', kpiPending: 'En attente', kpiSigned: 'Signés',
    recent: 'Récents',
    searchPlaceholder: 'Rechercher…',
    filterAll: 'Tous',
    sortDateDesc: 'Date ↓', sortDateAsc: 'Date ↑',
    sortValueDesc: 'Valeur ↓', sortValueAsc: 'Valeur ↑',
    newContract: 'Nouveau Contrat', editContract: 'Modifier le Contrat',
    importText: 'Charger un fichier depuis l\'appareil<br><strong>TXT, HTML, DOCX</strong> — pour modifier ici',
    labelTitle: 'Titre', labelType: 'Type', labelValue: 'Valeur',
    labelPartyA: '1ère Partie', labelPartyB: '2ème Partie',
    labelExpiry: 'Date d\'expiration', labelNotes: 'Notes internes',
    notesPlaceholder: 'Notes visibles uniquement dans l\'app',
    notesHint: 'Non inclus dans le PDF imprimé.',
    chipExpiringSoon: 'Expire bientôt', chipExpired: 'Expiré',
    titlePlaceholder: 'Titre du contrat',
    typeCustomPlaceholder: 'Précisez le type de contrat',
    currencySearchPlaceholder: 'Rechercher une devise…',
    typeService: 'Prestation de Services', typeNDA: 'Accord de Confidentialité',
    typeLease: 'Bail', typeSale: 'Vente & Achat',
    typeEmployment: 'Contrat de Travail', typePOA: 'Procuration', typeOther: 'Autre',
    btnCancel: 'Annuler', btnSaveDraft: 'Enregistrer brouillon', btnSendSign: 'Envoyer pour signer',
    btnDelete: 'Supprimer', btnEdit: 'Modifier', btnPrint: 'Imprimer / PDF',
    btnExportTxt: 'Exporter .txt', btnDuplicate: 'Dupliquer',
    btnDiscard: 'Abandonner',
    navDashboard: 'Tableau', navArchive: 'Archive',
    infoLangTitle: 'Langue',
    infoHowTitle: 'Comment utiliser',
    infoFeatTitle: 'Fonctionnalités',
    infoDataTitle: 'Données',
    infoDevTitle: 'Développeur',
    step1: 'Appuyez sur le bouton <strong>+</strong> pour créer un contrat. Remplissez le titre, type, parties et valeur.',
    step2: 'Rédigez le contenu dans l\'<strong>éditeur de texte</strong> — vous avez des outils de formatage comme Word.',
    step3: 'Enregistrez en <strong>Brouillon</strong> ou envoyez pour <strong>Signer</strong>. Les documents sont dans l\'Archive.',
    step4: 'Ouvrez un contrat en attente et <strong>dessinez votre signature numérique</strong> directement à l\'écran.',
    step5: 'Appuyez sur <strong>Imprimer / PDF</strong> — le dialogue s\'ouvre automatiquement, choisissez "Enregistrer en PDF".',
    feat1: '<strong>Éditeur riche</strong> — gras, italique, titres, listes, tableaux et couleurs.',
    feat2: '<strong>Signature numérique</strong> avec hash SHA-256 pour l\'authenticité.',
    feat3: '<strong>Importer des fichiers</strong> TXT ou DOC pour modifier directement.',
    feat4: '<strong>Données hors ligne</strong> — tout enregistré sur votre appareil, sans serveur.',
    feat5: '<strong>Exporter PDF</strong> — choisissez "Enregistrer en PDF" dans le dialogue d\'impression.',
    devBio: 'Développeur front-end avec 3 ans d\'expérience. Crée des sites, plateformes et apps web. NexDoc est l\'un de ses projets.',
    toastDraft: 'Brouillon enregistré', toastSentSign: 'Envoyé pour signature',
    toastDeleted: 'Document supprimé', toastFileLoaded: 'Fichier chargé — vous pouvez modifier',
    toastSigned: 'Document signé avec succès', toastDrawSig: 'Dessinez la signature avant de confirmer',
    toastDuplicated: 'Contrat dupliqué en brouillon', toastExported: 'Fichier exporté',
    dataBackupHint: 'Exportez tous vos contrats dans un fichier .json, ou restaurez-les à partir d\'une sauvegarde précédente.',
    btnExportBackup: 'Exporter la sauvegarde (.json)', btnImportBackup: 'Importer une sauvegarde (.json)',
    toastBackupExported: 'Sauvegarde exportée',
    toastBackupInvalid: 'Fichier de sauvegarde invalide ou non reconnu',
    toastBackupImported: (n) => `${n} contrat${n===1?'':'s'} importé${n===1?'':'s'}`,
    modalImportTitle: 'Importer la sauvegarde',
    modalImportMsg: (n) => `${n} contrat${n===1?'':'s'} ${n===1?'sera':'seront'} ajouté${n===1?'':'s'} à votre archive. Continuer?`,
    emptyTitle: 'Aucun contrat', emptyMsg: 'Appuyez sur + pour créer votre premier contrat.',
    emptyBtn: 'Nouveau contrat',
    modalDeleteTitle: 'Supprimer le document',
    modalDeleteMsg: (title) => `"${title}" sera supprimé définitivement. Continuer?`,
    modalCancelTitle: 'Annuler les modifications?',
    modalCancelMsg: 'Vous avez des modifications non enregistrées. Si vous quittez maintenant, elles seront perdues.',
    sigSectionSigned: 'Signature numérique', sigSectionSign: 'Signer le document',
    sigClear: 'Effacer', sigConfirm: 'Confirmer la signature',
    sigDate: 'Signé le',
    sheetNoContent: 'Aucun contenu',
    printType: 'Type', printParties: 'Parties', printValue: 'Valeur',
    printDate: 'Date', printStatus: 'Statut',
    printSigTitle: 'Signature numérique', printSignedOn: 'Signé le',
    printFooter: 'Généré le',
    statusDraft: 'Brouillon', statusPending: 'En attente', statusSigned: 'Signé',
    popupWarn: '⚠️ Autorisez les pop-ups pour imprimer / enregistrer en PDF',
    currencyRegionAfrica: 'Afrique', currencyRegionEurope: 'Europe',
    currencyRegionAmericas: 'Amériques', currencyRegionAsia: 'Asie & Océanie',
    currencyNoResults: 'Aucun résultat',
    unnamedFallback: 'Sans titre',
    duplicateSuffix: 'copie',
    infoPdfLogoTitle: 'Logo PDF',
    infoLogoHint: 'Apparaît dans l\'en-tête du PDF',
    infoChooseImage: 'Choisir une image',
    infoAppearanceTitle: 'Apparence',
    infoThemeToggle: 'Basculer',
    themeLight: 'Thème clair',
    themeDark: 'Thème sombre',
    tbBold: 'Gras (Ctrl+B)', tbItalic: 'Italique (Ctrl+I)', tbUnderline: 'Souligné', tbStrike: 'Barré',
    tbStyleSelect: 'Style', tbStylePlaceholder: 'Style…', tbStyleParagraph: 'Paragraphe',
    tbStyleH1: 'Titre 1', tbStyleH2: 'Titre 2', tbStyleH3: 'Titre 3',
    tbStyleQuote: 'Citation', tbStyleCode: 'Code',
    tbFontSelect: 'Police', tbFontDefault: 'Par défaut (Inter)', tbFontClassic: 'Classique',
    tbFontSize: 'Taille de police',
    tbAlignLeft: 'Aligner à gauche', tbAlignCenter: 'Centrer', tbAlignRight: 'Aligner à droite', tbAlignJustify: 'Justifier',
    tbListBullet: 'Liste à puces', tbListOrdered: 'Liste numérotée',
    tbIndentDecrease: 'Diminuer le retrait', tbIndentIncrease: 'Augmenter le retrait',
    tbHRule: 'Ligne horizontale', tbInsertLink: 'Insérer un lien', tbClearFormat: 'Effacer la mise en forme',
    tbUndo: 'Annuler (Ctrl+Z)', tbRedo: 'Rétablir (Ctrl+Y)',
    tbTextColor: 'Couleur du texte', tbBgColor: 'Couleur de surbrillance',
    toastLogoTooLarge: '⚠️ Image trop grande (max. 500 Ko)',
    toastLogoSaved: 'Logo enregistré avec succès',
    toastLogoRemoved: 'Logo supprimé',
    promptInsertLink: 'URL du lien :',
    partyPlaceholder: 'Nom / entreprise',
  },
  es: {
    tagline: 'Gestión de Contratos',
    kpiTotal: 'Total', kpiDrafts: 'Borradores', kpiPending: 'Pendientes', kpiSigned: 'Firmados',
    recent: 'Recientes',
    searchPlaceholder: 'Buscar…',
    filterAll: 'Todos',
    sortDateDesc: 'Fecha ↓', sortDateAsc: 'Fecha ↑',
    sortValueDesc: 'Valor ↓', sortValueAsc: 'Valor ↑',
    newContract: 'Nuevo Contrato', editContract: 'Editar Contrato',
    importText: 'Cargar archivo del dispositivo<br><strong>TXT, HTML, DOCX</strong> — para editar aquí',
    labelTitle: 'Título', labelType: 'Tipo', labelValue: 'Valor',
    labelPartyA: '1.ª Parte', labelPartyB: '2.ª Parte',
    labelExpiry: 'Fecha de vencimiento', labelNotes: 'Notas internas',
    notesPlaceholder: 'Notas visibles solo dentro de la app',
    notesHint: 'No se incluye en el PDF impreso.',
    chipExpiringSoon: 'Por vencer', chipExpired: 'Vencido',
    titlePlaceholder: 'Título del contrato',
    typeCustomPlaceholder: 'Especifique el tipo de contrato',
    currencySearchPlaceholder: 'Buscar moneda…',
    typeService: 'Prestación de Servicios', typeNDA: 'Acuerdo de Confidencialidad',
    typeLease: 'Arrendamiento', typeSale: 'Compraventa',
    typeEmployment: 'Contrato de Trabajo', typePOA: 'Poder Notarial', typeOther: 'Otro',
    btnCancel: 'Cancelar', btnSaveDraft: 'Guardar borrador', btnSendSign: 'Enviar para firmar',
    btnDelete: 'Eliminar', btnEdit: 'Editar', btnPrint: 'Imprimir / PDF',
    btnExportTxt: 'Exportar .txt', btnDuplicate: 'Duplicar',
    btnDiscard: 'Descartar',
    navDashboard: 'Panel', navArchive: 'Archivo',
    infoLangTitle: 'Idioma',
    infoHowTitle: 'Cómo usar',
    infoFeatTitle: 'Funcionalidades',
    infoDataTitle: 'Datos',
    infoDevTitle: 'Desarrollador',
    step1: 'Toca el botón <strong>+</strong> para crear un nuevo contrato. Completa el título, tipo, partes y valor.',
    step2: 'Escribe el contenido en el <strong>editor de texto</strong> — tienes herramientas de formato como Word.',
    step3: 'Guarda como <strong>Borrador</strong> o envía para <strong>Firmar</strong>. Los documentos quedan en el Archivo.',
    step4: 'Abre un contrato pendiente y <strong>dibuja tu firma digital</strong> directamente en pantalla.',
    step5: 'Toca <strong>Imprimir / PDF</strong> — el diálogo se abre automáticamente, elige "Guardar como PDF".',
    feat1: '<strong>Editor rico</strong> — negrita, cursiva, títulos, listas, tablas y colores.',
    feat2: '<strong>Firma digital</strong> con hash SHA-256 para autenticidad.',
    feat3: '<strong>Importar archivos</strong> TXT o DOC para editar directamente.',
    feat4: '<strong>Datos sin conexión</strong> — todo guardado en tu dispositivo, sin servidor.',
    feat5: '<strong>Exportar PDF</strong> — elige "Guardar como PDF" en el diálogo de impresión.',
    devBio: 'Desarrollador front-end con 3 años de experiencia. Crea sitios, plataformas y apps web. NexDoc es uno de sus proyectos.',
    toastDraft: 'Borrador guardado', toastSentSign: 'Enviado para firma',
    toastDeleted: 'Documento eliminado', toastFileLoaded: 'Archivo cargado — puede editar',
    toastSigned: 'Documento firmado con éxito', toastDrawSig: 'Dibuje la firma antes de confirmar',
    toastDuplicated: 'Contrato duplicado como borrador', toastExported: 'Archivo exportado',
    dataBackupHint: 'Exporta todos tus contratos a un archivo .json, o restáuralos desde una copia de seguridad anterior.',
    btnExportBackup: 'Exportar copia (.json)', btnImportBackup: 'Importar copia (.json)',
    toastBackupExported: 'Copia de seguridad exportada',
    toastBackupInvalid: 'Archivo de copia inválido o no reconocido',
    toastBackupImported: (n) => `${n} contrato${n===1?'':'s'} importado${n===1?'':'s'}`,
    modalImportTitle: 'Importar copia de seguridad',
    modalImportMsg: (n) => `Se ${n===1?'añadirá':'añadirán'} ${n} contrato${n===1?'':'s'} a tu archivo. ¿Continuar?`,
    emptyTitle: 'Sin contratos', emptyMsg: 'Pulse + para crear el primer contrato.',
    emptyBtn: 'Nuevo contrato',
    modalDeleteTitle: 'Eliminar documento',
    modalDeleteMsg: (title) => `"${title}" será eliminado permanentemente. ¿Continuar?`,
    modalCancelTitle: '¿Descartar cambios?',
    modalCancelMsg: 'Tienes cambios sin guardar. Si sales ahora, se perderán.',
    sigSectionSigned: 'Firma digital', sigSectionSign: 'Firmar documento',
    sigClear: 'Limpiar', sigConfirm: 'Confirmar firma',
    sigDate: 'Firmado el',
    sheetNoContent: 'Sin contenido',
    printType: 'Tipo', printParties: 'Partes', printValue: 'Valor',
    printDate: 'Fecha', printStatus: 'Estado',
    printSigTitle: 'Firma digital', printSignedOn: 'Firmado el',
    printFooter: 'Generado el',
    statusDraft: 'Borrador', statusPending: 'Pendiente', statusSigned: 'Firmado',
    popupWarn: '⚠️ Permite las ventanas emergentes para imprimir / guardar PDF',
    currencyRegionAfrica: 'África', currencyRegionEurope: 'Europa',
    currencyRegionAmericas: 'Américas', currencyRegionAsia: 'Asia & Oceanía',
    currencyNoResults: 'Sin resultados',
    unnamedFallback: 'Sin título',
    duplicateSuffix: 'copia',
    infoPdfLogoTitle: 'Logo del PDF',
    infoLogoHint: 'Aparece en el encabezado del PDF',
    infoChooseImage: 'Elegir imagen',
    infoAppearanceTitle: 'Apariencia',
    infoThemeToggle: 'Alternar',
    themeLight: 'Tema claro',
    themeDark: 'Tema oscuro',
    tbBold: 'Negrita (Ctrl+B)', tbItalic: 'Cursiva (Ctrl+I)', tbUnderline: 'Subrayado', tbStrike: 'Tachado',
    tbStyleSelect: 'Estilo', tbStylePlaceholder: 'Estilo…', tbStyleParagraph: 'Párrafo',
    tbStyleH1: 'Título 1', tbStyleH2: 'Título 2', tbStyleH3: 'Título 3',
    tbStyleQuote: 'Cita', tbStyleCode: 'Código',
    tbFontSelect: 'Fuente', tbFontDefault: 'Predeterminada (Inter)', tbFontClassic: 'Clásica',
    tbFontSize: 'Tamaño de fuente',
    tbAlignLeft: 'Alinear a la izquierda', tbAlignCenter: 'Centrar', tbAlignRight: 'Alinear a la derecha', tbAlignJustify: 'Justificar',
    tbListBullet: 'Lista con viñetas', tbListOrdered: 'Lista numerada',
    tbIndentDecrease: 'Disminuir sangría', tbIndentIncrease: 'Aumentar sangría',
    tbHRule: 'Línea horizontal', tbInsertLink: 'Insertar hipervínculo', tbClearFormat: 'Borrar formato',
    tbUndo: 'Deshacer (Ctrl+Z)', tbRedo: 'Rehacer (Ctrl+Y)',
    tbTextColor: 'Color de texto', tbBgColor: 'Color de resaltado',
    toastLogoTooLarge: '⚠️ Imagen demasiado grande (máx. 500 KB)',
    toastLogoSaved: 'Logo guardado correctamente',
    toastLogoRemoved: 'Logo eliminado',
    promptInsertLink: 'URL del hipervínculo:',
    partyPlaceholder: 'Nombre / empresa',
  }
};

let currentLang = localStorage.getItem('nexdoc_lang') || 'en';

function t(key, ...args) {
  const T = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  const val = T[key] !== undefined ? T[key] : (TRANSLATIONS.en[key] || key);
  return typeof val === 'function' ? val(...args) : val;
}

function applyLang() {
  const lang = currentLang;
  // Update static data-i18n elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.innerHTML = t(key);
  });
  // Update placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  // Update title attributes
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
  // Update select options
  document.querySelectorAll('[data-i18n-opt]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n-opt'));
  });
  // Update lang btn active state
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  // Re-render dynamic views
  renderDashboard();
  renderArchive();
  // Re-render sheet if open
  if (currentSheetId) renderSheet();
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('nexdoc_lang', lang);
  applyLang();
}

// ────────────────────────────────────────────────
// CURRENCY SMART PICKER
// ────────────────────────────────────────────────

// Traduções dos nomes das moedas por idioma (apenas para EN/FR/ES; PT usa os nomes originais do array)
const CURRENCY_NAMES = {
  en: {
    AOA:'Angolan Kwanza',ZAR:'South African Rand',NGN:'Nigerian Naira',KES:'Kenyan Shilling',
    GHS:'Ghanaian Cedi',ETB:'Ethiopian Birr',TZS:'Tanzanian Shilling',UGX:'Ugandan Shilling',
    XOF:'West African CFA Franc',XAF:'Central African CFA Franc',EGP:'Egyptian Pound',
    MAD:'Moroccan Dirham',DZD:'Algerian Dinar',MZN:'Mozambican Metical',ZMW:'Zambian Kwacha',
    BWP:'Botswana Pula',RWF:'Rwandan Franc',MGA:'Malagasy Ariary',SCR:'Seychellois Rupee',
    EUR:'Euro',GBP:'British Pound',CHF:'Swiss Franc',NOK:'Norwegian Krone',SEK:'Swedish Krona',
    DKK:'Danish Krone',PLN:'Polish Zloty',CZK:'Czech Koruna',HUF:'Hungarian Forint',
    RON:'Romanian Leu',RUB:'Russian Ruble',
    USD:'US Dollar',BRL:'Brazilian Real',CAD:'Canadian Dollar',MXN:'Mexican Peso',
    ARS:'Argentine Peso',CLP:'Chilean Peso',COP:'Colombian Peso',PEN:'Peruvian Sol',
    UYU:'Uruguayan Peso',BOB:'Bolivian Boliviano',
    CNY:'Chinese Yuan',JPY:'Japanese Yen',KRW:'South Korean Won',INR:'Indian Rupee',
    SGD:'Singapore Dollar',HKD:'Hong Kong Dollar',AUD:'Australian Dollar',NZD:'New Zealand Dollar',
    THB:'Thai Baht',MYR:'Malaysian Ringgit',IDR:'Indonesian Rupiah',AED:'UAE Dirham',SAR:'Saudi Riyal',
  },
  fr: {
    AOA:'Kwanza Angolais',ZAR:'Rand Sud-Africain',NGN:'Naira Nigérian',KES:'Shilling Kényan',
    GHS:'Cedi Ghanéen',ETB:'Birr Éthiopien',TZS:'Shilling Tanzanien',UGX:'Shilling Ougandais',
    XOF:'Franc CFA Ouest-Africain',XAF:'Franc CFA Centre-Africain',EGP:'Livre Égyptienne',
    MAD:'Dirham Marocain',DZD:'Dinar Algérien',MZN:'Metical Mozambicain',ZMW:'Kwacha Zambien',
    BWP:'Pula du Botswana',RWF:'Franc Rwandais',MGA:'Ariary Malgache',SCR:'Roupie des Seychelles',
    EUR:'Euro',GBP:'Livre Sterling',CHF:'Franc Suisse',NOK:'Couronne Norvégienne',SEK:'Couronne Suédoise',
    DKK:'Couronne Danoise',PLN:'Zloty Polonais',CZK:'Couronne Tchèque',HUF:'Forint Hongrois',
    RON:'Leu Roumain',RUB:'Rouble Russe',
    USD:'Dollar Américain',BRL:'Réal Brésilien',CAD:'Dollar Canadien',MXN:'Peso Mexicain',
    ARS:'Peso Argentin',CLP:'Peso Chilien',COP:'Peso Colombien',PEN:'Sol Péruvien',
    UYU:'Peso Uruguayen',BOB:'Boliviano',
    CNY:'Yuan Chinois',JPY:'Yen Japonais',KRW:'Won Sud-Coréen',INR:'Roupie Indienne',
    SGD:'Dollar de Singapour',HKD:'Dollar de Hong Kong',AUD:'Dollar Australien',NZD:'Dollar Néo-Zélandais',
    THB:'Baht Thaïlandais',MYR:'Ringgit Malaisien',IDR:'Roupie Indonésienne',AED:'Dirham des EAU',SAR:'Riyal Saoudien',
  },
  es: {
    AOA:'Kwanza Angoleño',ZAR:'Rand Sudafricano',NGN:'Naira Nigeriana',KES:'Chelín Keniano',
    GHS:'Cedi Ghanés',ETB:'Birr Etíope',TZS:'Chelín Tanzano',UGX:'Chelín Ugandés',
    XOF:'Franco CFA África Occidental',XAF:'Franco CFA África Central',EGP:'Libra Egipcia',
    MAD:'Dírham Marroquí',DZD:'Dinar Argelino',MZN:'Metical Mozambiqueño',ZMW:'Kwacha Zambiano',
    BWP:'Pula Botsuanesa',RWF:'Franco Ruandés',MGA:'Ariary Malgache',SCR:'Rupia de Seychelles',
    EUR:'Euro',GBP:'Libra Esterlina',CHF:'Franco Suizo',NOK:'Corona Noruega',SEK:'Corona Sueca',
    DKK:'Corona Danesa',PLN:'Esloti Polaco',CZK:'Corona Checa',HUF:'Forinto Húngaro',
    RON:'Leu Rumano',RUB:'Rublo Ruso',
    USD:'Dólar Estadounidense',BRL:'Real Brasileño',CAD:'Dólar Canadiense',MXN:'Peso Mexicano',
    ARS:'Peso Argentino',CLP:'Peso Chileno',COP:'Peso Colombiano',PEN:'Sol Peruano',
    UYU:'Peso Uruguayo',BOB:'Boliviano',
    CNY:'Yuan Chino',JPY:'Yen Japonés',KRW:'Won Surcoreano',INR:'Rupia India',
    SGD:'Dólar de Singapur',HKD:'Dólar de Hong Kong',AUD:'Dólar Australiano',NZD:'Dólar Neozelandés',
    THB:'Baht Tailandés',MYR:'Ringgit Malayo',IDR:'Rupia Indonesia',AED:'Dírham de los EAU',SAR:'Riyal Saudí',
  },
};

function getCurrencyName(c) {
  const map = CURRENCY_NAMES[currentLang];
  return (map && map[c.code]) || c.name;
}

const ALL_CURRENCIES = [
  // África
  {code:'AOA', symbol:'Kz',  name:'Kwanza Angolano',           region:'África'},
  {code:'ZAR', symbol:'R',   name:'Rand Sul-Africano',          region:'África'},
  {code:'NGN', symbol:'₦',   name:'Naira Nigeriana',            region:'África'},
  {code:'KES', symbol:'KSh', name:'Xelim Queniano',             region:'África'},
  {code:'GHS', symbol:'₵',   name:'Cedi Ganês',                 region:'África'},
  {code:'ETB', symbol:'Br',  name:'Birr Etíope',                region:'África'},
  {code:'TZS', symbol:'TSh', name:'Xelim Tanzaniano',           region:'África'},
  {code:'UGX', symbol:'USh', name:'Xelim Ugandês',              region:'África'},
  {code:'XOF', symbol:'CFA', name:'Franco CFA Oeste-Africano',  region:'África'},
  {code:'XAF', symbol:'CFA', name:'Franco CFA Central-Africano',region:'África'},
  {code:'EGP', symbol:'E£',  name:'Libra Egípcia',              region:'África'},
  {code:'MAD', symbol:'DH',  name:'Dirham Marroquino',          region:'África'},
  {code:'DZD', symbol:'DA',  name:'Dinar Argelino',             region:'África'},
  {code:'MZN', symbol:'MT',  name:'Metical Moçambicano',        region:'África'},
  {code:'ZMW', symbol:'ZK',  name:'Kwacha Zambiano',            region:'África'},
  {code:'BWP', symbol:'P',   name:'Pula do Botsuana',           region:'África'},
  {code:'RWF', symbol:'RF',  name:'Franco Ruandês',             region:'África'},
  {code:'MGA', symbol:'Ar',  name:'Ariary Malgaxe',             region:'África'},
  {code:'SCR', symbol:'SR',  name:'Rupia das Seicheles',        region:'África'},
  // Europa
  {code:'EUR', symbol:'€',   name:'Euro',                       region:'Europa'},
  {code:'GBP', symbol:'£',   name:'Libra Esterlina',            region:'Europa'},
  {code:'CHF', symbol:'Fr',  name:'Franco Suíço',               region:'Europa'},
  {code:'NOK', symbol:'kr',  name:'Coroa Norueguesa',           region:'Europa'},
  {code:'SEK', symbol:'kr',  name:'Coroa Sueca',                region:'Europa'},
  {code:'DKK', symbol:'kr',  name:'Coroa Dinamarquesa',         region:'Europa'},
  {code:'PLN', symbol:'zł',  name:'Zlóti Polaco',               region:'Europa'},
  {code:'CZK', symbol:'Kč',  name:'Coroa Checa',                region:'Europa'},
  {code:'HUF', symbol:'Ft',  name:'Florim Húngaro',             region:'Europa'},
  {code:'RON', symbol:'lei', name:'Leu Romeno',                 region:'Europa'},
  {code:'RUB', symbol:'₽',   name:'Rublo Russo',                region:'Europa'},
  // Américas
  {code:'USD', symbol:'$',   name:'Dólar Americano',            region:'Américas'},
  {code:'BRL', symbol:'R$',  name:'Real Brasileiro',            region:'Américas'},
  {code:'CAD', symbol:'C$',  name:'Dólar Canadiano',            region:'Américas'},
  {code:'MXN', symbol:'$',   name:'Peso Mexicano',              region:'Américas'},
  {code:'ARS', symbol:'$',   name:'Peso Argentino',             region:'Américas'},
  {code:'CLP', symbol:'$',   name:'Peso Chileno',               region:'Américas'},
  {code:'COP', symbol:'$',   name:'Peso Colombiano',            region:'Américas'},
  {code:'PEN', symbol:'S/',  name:'Sol Peruano',                region:'Américas'},
  {code:'UYU', symbol:'$U',  name:'Peso Uruguaio',              region:'Américas'},
  {code:'BOB', symbol:'Bs',  name:'Boliviano',                  region:'Américas'},
  // Ásia & Oceania
  {code:'CNY', symbol:'¥',   name:'Yuan Chinês',                region:'Ásia'},
  {code:'JPY', symbol:'¥',   name:'Iene Japonês',               region:'Ásia'},
  {code:'KRW', symbol:'₩',   name:'Won Sul-Coreano',            region:'Ásia'},
  {code:'INR', symbol:'₹',   name:'Rupia Indiana',              region:'Ásia'},
  {code:'SGD', symbol:'S$',  name:'Dólar de Singapura',         region:'Ásia'},
  {code:'HKD', symbol:'HK$', name:'Dólar de Hong Kong',         region:'Ásia'},
  {code:'AUD', symbol:'A$',  name:'Dólar Australiano',          region:'Ásia'},
  {code:'NZD', symbol:'NZ$', name:'Dólar Neozelandês',          region:'Ásia'},
  {code:'THB', symbol:'฿',   name:'Baht Tailandês',             region:'Ásia'},
  {code:'MYR', symbol:'RM',  name:'Ringgit Malaio',             region:'Ásia'},
  {code:'IDR', symbol:'Rp',  name:'Rupia Indonésia',            region:'Ásia'},
  {code:'AED', symbol:'د.إ', name:'Dirham dos EAU',             region:'Ásia'},
  {code:'SAR', symbol:'﷼',   name:'Riyal Saudita',              region:'Ásia'},
];

let selectedCurrency = null;

function setCurrency(code) {
  selectedCurrency = code || null;
  const lbl = document.getElementById('currencyBtnLabel');
  if (!code) {
    lbl.textContent = '— —';
    lbl.style.color = 'var(--text-muted)';
  } else {
    const c = ALL_CURRENCIES.find(x => x.code === code);
    lbl.textContent = c ? c.symbol + ' ' + c.code : code;
    lbl.style.color = 'var(--text)';
  }
}

function toggleCurrencyDropdown() {
  const dd = document.getElementById('currencyDropdown');
  const isOpen = dd.style.display === 'block';
  if (isOpen) {
    closeCurrencyDropdown();
  } else {
    dd.style.display = 'block';
    document.getElementById('currencySearch').value = '';
    filterCurrencies();
    setTimeout(() => document.getElementById('currencySearch').focus(), 60);
  }
}

function closeCurrencyDropdown() {
  document.getElementById('currencyDropdown').style.display = 'none';
}

function filterCurrencies() {
  const q = document.getElementById('currencySearch').value.toLowerCase();
  const list = ALL_CURRENCIES.filter(c =>
    !q ||
    c.code.toLowerCase().includes(q) ||
    getCurrencyName(c).toLowerCase().includes(q) ||
    c.symbol.toLowerCase().includes(q) ||
    c.region.toLowerCase().includes(q)
  );
  const regions = {};
  list.forEach(c => {
    if (!regions[c.region]) regions[c.region] = [];
    regions[c.region].push(c);
  });
  const regionOrder = ['África','Américas','Europa','Ásia'];
  let html = '';
  regionOrder.forEach(r => {
    if (!regions[r]) return;
    const regionKey = {'África':'currencyRegionAfrica','Américas':'currencyRegionAmericas','Europa':'currencyRegionEurope','Ásia':'currencyRegionAsia'}[r] || r;
    html += `<div style="padding:6px 14px 3px;font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:0.8px;text-transform:uppercase">${t(regionKey)}</div>`;
    regions[r].forEach(c => {
      const isActive = c.code === selectedCurrency;
      const activeBg = isActive ? 'var(--gold-dim)' : 'transparent';
      html += `<div onclick="selectCurrency('${c.code}')" style="padding:9px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;background:${activeBg}" onmouseover="this.style.background='var(--surface3)'" onmouseout="this.style.background='${activeBg}'">
        <span style="font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--gold);min-width:28px">${c.symbol}</span>
        <span style="flex:1;font-size:13px;color:var(--text)">${getCurrencyName(c)}</span>
        <span style="font-size:11px;color:var(--text-muted)">${c.code}</span>
        ${isActive ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      </div>`;
    });
  });
  if (!html) html = `<div style="padding:20px;text-align:center;font-size:13px;color:var(--text-muted)">${t('currencyNoResults')}</div>`;
  document.getElementById('currencyList').innerHTML = html;
}

function selectCurrency(code) {
  setCurrency(code);
  closeCurrencyDropdown();
}

document.addEventListener('click', function(e) {
  const wrap = document.getElementById('currencyPickerWrap');
  if (wrap && !wrap.contains(e.target)) closeCurrencyDropdown();
});

// ────────────────────────────────────────────────
// TEMA CLARO / ESCURO
// ────────────────────────────────────────────────
let currentTheme = localStorage.getItem('nexdoc_theme') || 'dark';

function applyTheme(theme) {
  currentTheme = theme;
  const isLight = theme === 'light';
  document.documentElement.classList.toggle('light', isLight);
  const sunIcon = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  const moonIcon = '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
  const panelIcon = document.getElementById('themeIconInPanel');
  const panelLabel = document.getElementById('themeLabelInPanel');
  if (panelIcon) panelIcon.innerHTML = isLight ? sunIcon : moonIcon;
  if (panelLabel) panelLabel.textContent = isLight ? t('themeLight') : t('themeDark');
  localStorage.setItem('nexdoc_theme', theme);
}

function toggleTheme() {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

// ────────────────────────────────────────────────
// LOGO DO PDF
// ────────────────────────────────────────────────
function handleLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 500 * 1024) { showToast(t('toastLogoTooLarge')); return; }
  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    localStorage.setItem('nexdoc_logo', dataUrl);
    localStorage.setItem('nexdoc_logo_name', file.name);
    renderLogoPreview();
    showToast(t('toastLogoSaved'));
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function removeLogo() {
  localStorage.removeItem('nexdoc_logo');
  localStorage.removeItem('nexdoc_logo_name');
  renderLogoPreview();
  showToast(t('toastLogoRemoved'));
}

function renderLogoPreview() {
  const dataUrl = localStorage.getItem('nexdoc_logo');
  const name = localStorage.getItem('nexdoc_logo_name') || 'logo';
  const wrap = document.getElementById('logoPreviewWrap');
  const img = document.getElementById('logoPreviewImg');
  const fname = document.getElementById('logoFileName');
  const label = document.getElementById('logoUploadLabel');
  if (!wrap) return;
  if (dataUrl) {
    img.src = dataUrl;
    fname.textContent = name;
    wrap.style.display = 'block';
    label.style.display = 'none';
  } else {
    wrap.style.display = 'none';
    label.style.display = 'flex';
  }
}

// ────────────────────────────────────────────────
// INIT
applyTheme(currentTheme);
applyLang(); // renders dashboard + archive + applies all translations
renderLogoPreview();
