// CARE Real Estate - Check-In Form System
// =========================================

let currentStep = 1;
const totalSteps = 4;
let tenantSigPad = null;
let agentSigPad = null;
let tenantSigMethod = 'draw'; // 'draw' or 'type'
let agentSigMethod = 'draw';
let signOnBehalf = false;

// ===== Navigation =====
function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');

  if (page === 'dashboard') loadRecords();
  if (page === 'new-checkin') {
    resetForm();
    currentStep = 1;
    showStep(1);
    setTimeout(initSignaturePads, 100);
  }
}

// ===== Step Navigation =====
function showStep(step) {
  document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
  document.querySelector(`.form-step[data-step="${step}"]`)?.classList.add('active');
  updateStepIndicator();
  if (step === 4) setTimeout(initSignaturePads, 50);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateStepIndicator() {
  const ind = document.getElementById('steps-indicator');
  if (!ind) return;
  ind.innerHTML = '';
  for (let i = 1; i <= totalSteps; i++) {
    const dot = document.createElement('div');
    dot.className = 'step-dot' + (i === currentStep ? ' active' : '') + (i < currentStep ? ' done' : '');
    ind.appendChild(dot);
  }
}

function nextStep() {
  if (currentStep === 1 && !validateStep1()) return;
  if (currentStep < totalSteps) {
    currentStep++;
    showStep(currentStep);
  }
}

function prevStep() {
  if (currentStep > 1) {
    currentStep--;
    showStep(currentStep);
  }
}

function validateStep1() {
  const form = document.getElementById('checkin-form');
  const required = ['tenant_first_name', 'tenant_last_name', 'property_address', 'council_name', 'checkin_date'];
  for (const name of required) {
    const input = form.querySelector(`[name="${name}"]`);
    if (!input.value.trim()) {
      input.focus();
      input.style.borderColor = 'var(--care-red)';
      showToast('Please fill in all required fields', 'error');
      setTimeout(() => input.style.borderColor = '', 2000);
      return false;
    }
  }
  return true;
}

// ===== Signature Pads =====
function initSignaturePads() {
  const tCanvas = document.getElementById('tenant-sig-canvas');
  const aCanvas = document.getElementById('agent-sig-canvas');
  if (tCanvas && !tenantSigPad) {
    resizeCanvas(tCanvas);
    tenantSigPad = new SignaturePad(tCanvas, { backgroundColor: 'rgba(250,250,250,1)', penColor: '#222' });
  }
  if (aCanvas && !agentSigPad) {
    resizeCanvas(aCanvas);
    agentSigPad = new SignaturePad(aCanvas, { backgroundColor: 'rgba(250,250,250,1)', penColor: '#222' });
  }
}

function resizeCanvas(canvas) {
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
}

function clearSig(target) {
  if (target === 'tenant' && tenantSigPad) tenantSigPad.clear();
  if (target === 'agent' && agentSigPad) agentSigPad.clear();
}

function switchSigMethod(btn) {
  const target = btn.dataset.target;
  const method = btn.dataset.method;

  btn.parentElement.querySelectorAll('.sig-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');

  if (target === 'tenant') {
    tenantSigMethod = method;
    document.getElementById('tenant-draw').style.display = method === 'draw' ? '' : 'none';
    document.getElementById('tenant-type').style.display = method === 'type' ? '' : 'none';
  } else {
    agentSigMethod = method;
    document.getElementById('agent-draw').style.display = method === 'draw' ? '' : 'none';
    document.getElementById('agent-type').style.display = method === 'type' ? '' : 'none';
  }
}

function updateTypedSig(target) {
  const input = document.getElementById(`${target}-typed-sig`);
  const preview = document.getElementById(`${target}-typed-preview`);
  preview.textContent = input.value || '';
}

function getSignatureDataURL(target) {
  const method = target === 'tenant' ? tenantSigMethod : agentSigMethod;
  if (method === 'draw') {
    const pad = target === 'tenant' ? tenantSigPad : agentSigPad;
    if (pad && !pad.isEmpty()) return pad.toDataURL();
    return null;
  } else {
    const text = document.getElementById(`${target}-typed-sig`).value.trim();
    if (!text) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, 400, 100);
    ctx.font = 'italic 36px "Brush Script MT", "Segoe Script", cursive';
    ctx.fillStyle = '#222';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 200, 50);
    return canvas.toDataURL();
  }
}

// ===== Sign on Behalf =====
function toggleSignOnBehalf() {
  signOnBehalf = document.getElementById('sign-on-behalf').checked;
  document.getElementById('tenant-sig-section').style.display = signOnBehalf ? 'none' : '';
  document.getElementById('behalf-note').style.display = signOnBehalf ? '' : 'none';
}

// ===== Form Data Collection =====
function getFormValues() {
  const form = document.getElementById('checkin-form');
  const data = {};
  form.querySelectorAll('input, select, textarea').forEach(el => {
    if (el.name && el.type !== 'checkbox') data[el.name] = el.value;
    if (el.name && el.type === 'checkbox' && el.name === 'consent_agreed') data[el.name] = el.checked;
  });
  return data;
}

function getInventoryData() {
  const items = [];
  document.querySelectorAll('#inventory-table tbody tr').forEach(row => {
    const cb = row.querySelector('input[type="checkbox"]');
    const comment = row.querySelector('.inv-comment');
    items.push({
      name: cb?.dataset.item || '',
      in: cb?.checked || false,
      comments: comment?.value || '',
      signed_for: ''
    });
  });
  return items;
}

// ===== Submit Check-In =====
async function submitCheckIn() {
  const values = getFormValues();

  if (!values.agent_name?.trim()) {
    showToast('Please enter the agent name', 'error');
    return;
  }

  const agentSig = getSignatureDataURL('agent');
  if (!agentSig) {
    showToast('Please provide the agent signature', 'error');
    return;
  }

  let tenantSig = null;
  if (signOnBehalf) {
    tenantSig = agentSig;
  } else {
    tenantSig = getSignatureDataURL('tenant');
    if (!tenantSig) {
      showToast('Please provide the tenant signature', 'error');
      return;
    }
  }

  const inventory = getInventoryData();
  document.getElementById('loading').style.display = '';

  try {
    const bookingRes = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_first_name: values.tenant_first_name,
        tenant_last_name: values.tenant_last_name,
        tenant_email: values.tenant_email || '',
        tenant_phone: values.tenant_phone || '',
        property_address: values.property_address,
        council_name: values.council_name,
        reference_number: values.reference_number || '',
        nightly_rate: values.nightly_rate || '',
        placement_start: values.placement_start || values.checkin_date,
        placement_end: values.placement_end || ''
      })
    });
    const booking = await bookingRes.json();
    if (!bookingRes.ok) throw new Error(booking.error || 'Failed to create booking');
    const bookingId = booking.id || booking.booking?.id;

    const formRes = await fetch('/api/forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: bookingId, type: 'check_in' })
    });
    const formRecord = await formRes.json();
    if (!formRes.ok) throw new Error(formRecord.error || 'Failed to create form');
    const formId = formRecord.id || formRecord.form?.id;

    const formData = {
      housing_officer: values.housing_officer || '',
      unit_number: values.unit_number || '',
      nok_name: values.nok_name || '',
      nok_number: values.nok_number || '',
      checkin_date: values.checkin_date || '',
      checkin_time: values.checkin_time || '',
      accommodation_type: values.accommodation_type || '',
      nightly_rate: values.nightly_rate || '',
      pet_deposit: values.pet_deposit || '',
      condition_notes: values.condition_notes || '',
      inventory: inventory,
      consent_agreed: values.consent_agreed || false,
      date_of_birth: values.date_of_birth || '',
      excluded_agencies: values.excluded_agencies || '',
      signed_on_behalf: signOnBehalf,
      behalf_reason: values.behalf_reason || ''
    };

    const saveRes = await fetch(`/api/forms/${formId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        form_data: JSON.stringify(formData),
        tenant_signature: tenantSig,
        agent_signature: agentSig,
        agent_name: values.agent_name,
        signing_method: 'in_person',
        status: 'signed'
      })
    });
    if (!saveRes.ok) throw new Error('Failed to save form');

    const pdfRes = await fetch(`/api/pdf/generate/${formId}`, { method: 'POST' });
    if (!pdfRes.ok) throw new Error('Failed to generate PDF');

    document.getElementById('loading').style.display = 'none';
    showToast('Check-in complete! Downloading PDF...', 'success');

    const link = document.createElement('a');
    link.href = `/api/pdf/download/${formId}`;
    link.download = `checkin-${values.tenant_first_name}-${values.tenant_last_name}.pdf`;
    link.click();

    setTimeout(() => navigateTo('dashboard'), 1500);

  } catch (err) {
    document.getElementById('loading').style.display = 'none';
    console.error('Submit error:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

// ===== Load Records =====
async function loadRecords() {
  try {
    const res = await fetch('/api/bookings?limit=50');
    const data = await res.json();
    const bookings = data.bookings || [];
    const container = document.getElementById('records-list');

    if (bookings.length === 0) {
      container.innerHTML = `<div class="empty-state">
        <i class="fas fa-clipboard-list"></i>
        <p>No check-in records yet</p>
        <button class="btn btn-primary" id="btn-empty-checkin">Create your first check-in</button>
      </div>`;
      document.getElementById('btn-empty-checkin')?.addEventListener('click', () => navigateTo('new-checkin'));
      return;
    }

    container.innerHTML = bookings.map(b => {
      const status = b.status || 'active';
      const statusClass = status === 'checked_in' ? 'signed' : status === 'completed' ? 'completed' : 'draft';
      const statusText = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const hasForm = b.forms && b.forms.some(f => f.type === 'check_in' && f.status !== 'draft');

      return `<div class="record-card">
        <div class="record-info">
          <h3>${b.tenant_first_name} ${b.tenant_last_name}</h3>
          <div class="record-meta">
            <span><i class="fas fa-building"></i> ${b.property_address || 'N/A'}</span>
            <span><i class="fas fa-university"></i> ${b.council_name || 'N/A'}</span>
            <span><i class="fas fa-calendar"></i> ${formatDate(b.created_at)}</span>
          </div>
        </div>
        <div class="record-actions">
          <span class="status-badge status-${statusClass}">${statusText}</span>
          ${hasForm ? `<button class="btn btn-sm btn-outline" data-download-booking="${b.id}"><i class="fas fa-download"></i> PDF</button>` : ''}
        </div>
      </div>`;
    }).join('');

    // Bind download buttons
    container.querySelectorAll('[data-download-booking]').forEach(btn => {
      btn.addEventListener('click', () => downloadPDF(parseInt(btn.dataset.downloadBooking)));
    });

  } catch (err) {
    console.error('Load error:', err);
  }
}

async function downloadPDF(bookingId) {
  try {
    const res = await fetch(`/api/bookings/${bookingId}`);
    const data = await res.json();
    const form = (data.booking?.forms || data.forms || []).find(f => f.type === 'check_in' && f.pdf_path);
    if (form) {
      const link = document.createElement('a');
      link.href = `/api/pdf/download/${form.id}`;
      link.download = 'checkin.pdf';
      link.click();
    } else {
      showToast('No PDF available for this record', 'error');
    }
  } catch (err) {
    showToast('Error downloading PDF', 'error');
  }
}

// ===== Utilities =====
function resetForm() {
  const form = document.getElementById('checkin-form');
  form.reset();
  tenantSigPad = null;
  agentSigPad = null;
  tenantSigMethod = 'draw';
  agentSigMethod = 'draw';
  signOnBehalf = false;
  document.getElementById('sign-on-behalf').checked = false;
  document.getElementById('tenant-sig-section').style.display = '';
  document.getElementById('behalf-note').style.display = 'none';
  const today = new Date().toISOString().split('T')[0];
  const dateInput = form.querySelector('[name="checkin_date"]');
  if (dateInput) dateInput.value = today;
  document.querySelectorAll('.sig-tab[data-method="draw"]').forEach(t => t.classList.add('active'));
  document.querySelectorAll('.sig-tab[data-method="type"]').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.sig-draw-area').forEach(a => a.style.display = '');
  document.querySelectorAll('.sig-type-area').forEach(a => a.style.display = 'none');
}

function formatDate(str) {
  if (!str) return '';
  try {
    return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return str; }
}

function showToast(msg, type) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast show ' + (type || '');
  setTimeout(() => toast.className = 'toast', 3000);
}

// ===== Reference Number Auto-Generation =====
const councilCodes = {
  'havant': 'HBC', 'havant borough council': 'HBC', 'havant borough': 'HBC', 'hbc': 'HBC',
  'gosport': 'GBC', 'gosport borough council': 'GBC', 'gosport borough': 'GBC', 'gbc': 'GBC',
  'chichester': 'CDC', 'chichester district council': 'CDC', 'chichester district': 'CDC', 'cdc': 'CDC',
  'portsmouth': 'PCC', 'portsmouth city council': 'PCC', 'pcc': 'PCC',
  'fareham': 'FBC', 'fareham borough council': 'FBC', 'fareham borough': 'FBC', 'fbc': 'FBC',
  'east hampshire': 'EHDC', 'east hampshire district council': 'EHDC', 'ehdc': 'EHDC',
  'winchester': 'WCC', 'winchester city council': 'WCC', 'wcc': 'WCC',
  'eastleigh': 'EBC', 'eastleigh borough council': 'EBC', 'ebc': 'EBC',
  'southampton': 'SCC', 'southampton city council': 'SCC', 'scc': 'SCC',
  'arun': 'ADC', 'arun district council': 'ADC', 'adc': 'ADC',
  'basingstoke': 'BDBC', 'basingstoke and deane': 'BDBC', 'bdbc': 'BDBC',
  'new forest': 'NFDC', 'new forest district council': 'NFDC', 'nfdc': 'NFDC',
  'rushmoor': 'RBC', 'rushmoor borough council': 'RBC', 'rbc': 'RBC',
  'test valley': 'TVBC', 'test valley borough council': 'TVBC', 'tvbc': 'TVBC',
  'brighton': 'BHCC', 'brighton and hove': 'BHCC', 'bhcc': 'BHCC',
  'crawley': 'CC', 'crawley borough council': 'CC', 'cc': 'CC',
  'worthing': 'WBC', 'worthing borough council': 'WBC', 'wbc': 'WBC',
  'adur': 'ADDC', 'adur district council': 'ADDC',
  'mid sussex': 'MSDC', 'mid sussex district council': 'MSDC', 'msdc': 'MSDC',
  'horsham': 'HDC', 'horsham district council': 'HDC', 'hdc': 'HDC',
  'waverley': 'WBC2', 'waverley borough council': 'WBC2',
  'isle of wight': 'IOW', 'isle of wight council': 'IOW', 'iow': 'IOW',
  'haringey': 'HRGY', 'haringey council': 'HRGY', 'london borough of haringey': 'HRGY', 'hrgy': 'HRGY'
};

function getCouncilCode(councilName) {
  if (!councilName) return '';
  const key = councilName.trim().toLowerCase();
  if (councilCodes[key]) return councilCodes[key];
  // Try partial match
  for (const [name, code] of Object.entries(councilCodes)) {
    if (key.includes(name) || name.includes(key)) return code;
  }
  // Fallback: take first letter of each word, uppercase
  return councilName.trim().split(/\s+/).map(w => w[0]?.toUpperCase() || '').join('');
}

function abbreviateProperty(address) {
  if (!address) return '';
  // Remove postcode (e.g. PO1 3SH, SO14 2AA, GU12 4AB)
  let cleaned = address.replace(/,?\s*[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}\s*$/i, '').trim();
  // Remove trailing comma
  cleaned = cleaned.replace(/,\s*$/, '').trim();
  // Remove trailing city/town names after last comma
  const parts = cleaned.split(',');
  // Keep stripping trailing parts that look like town/city names (no numbers)
  while (parts.length > 1) {
    const last = parts[parts.length - 1].trim();
    if (!/\d/.test(last)) {
      parts.pop();
    } else {
      break;
    }
  }
  cleaned = parts.join(',').trim();

  let prefix = '';
  let rest = cleaned;

  // Check for Flat prefix
  const flatMatch = rest.match(/^(?:flat|flt)\s*(\d+[a-z]?)/i);
  if (flatMatch) {
    prefix = 'F' + flatMatch[1].toUpperCase();
    rest = rest.substring(flatMatch[0].length).replace(/^[\s,]+/, '');
  }
  // Check for Unit prefix
  const unitMatch = rest.match(/^(?:unit|room)\s*(\d+[a-z]?)/i);
  if (!flatMatch && unitMatch) {
    prefix = 'U' + unitMatch[1].toUpperCase();
    rest = rest.substring(unitMatch[0].length).replace(/^[\s,]+/, '');
  }

  // Now parse remaining: expect "[number] [road name words]"
  const numMatch = rest.match(/^(\d+[a-z]?)\s+(.+)/i);
  if (numMatch) {
    const num = numMatch[1].toUpperCase();
    const roadWords = numMatch[2].replace(/,.*$/, '').trim().split(/\s+/);
    const initials = roadWords.map(w => w[0]?.toUpperCase() || '').join('');
    return prefix + num + initials;
  }

  // No street number - just take initials of remaining words (e.g. "Delme Court")
  const words = rest.replace(/,.*$/, '').trim().split(/\s+/).filter(w => w.length > 0);
  const initials = words.map(w => w[0]?.toUpperCase() || '').join('');
  return prefix + initials;
}

function formatDateForRef(dateStr) {
  if (!dateStr) return '';
  // Input is YYYY-MM-DD from date input, output DDMMYYYY
  const parts = dateStr.split('-');
  if (parts.length !== 3) return '';
  return parts[2] + parts[1] + parts[0];
}

function generateReference() {
  const form = document.getElementById('checkin-form');
  const council = form.querySelector('[name="council_name"]')?.value || '';
  const address = form.querySelector('[name="property_address"]')?.value || '';
  const checkinDate = form.querySelector('[name="checkin_date"]')?.value || '';

  const code = getCouncilCode(council);
  const prop = abbreviateProperty(address);
  const dateRef = formatDateForRef(checkinDate);

  const refField = form.querySelector('[name="reference_number"]');
  if (refField && (code || prop || dateRef)) {
    refField.value = code + prop + dateRef;
    // Visual hint that it was auto-generated
    refField.style.borderColor = 'var(--care-green)';
    setTimeout(() => refField.style.borderColor = '', 2000);
  }
}

// ===== Init & Event Binding =====
document.addEventListener('DOMContentLoaded', () => {
  loadRecords();
  updateStepIndicator();
  bindEventListeners();
});

function bindEventListeners() {
  // Sidebar navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
  });

  // "New Check-In" header button
  const headerBtn = document.querySelector('#page-dashboard .page-header .btn-primary');
  if (headerBtn) headerBtn.addEventListener('click', () => navigateTo('new-checkin'));

  // Step 1: Next button
  const step1 = document.querySelector('.form-step[data-step="1"]');
  if (step1) {
    step1.querySelector('.btn-primary')?.addEventListener('click', nextStep);
  }

  // Step 2: Back & Next
  const step2 = document.querySelector('.form-step[data-step="2"]');
  if (step2) {
    step2.querySelector('.btn-outline')?.addEventListener('click', prevStep);
    step2.querySelector('.btn-primary')?.addEventListener('click', nextStep);
  }

  // Step 3: Back & Next
  const step3 = document.querySelector('.form-step[data-step="3"]');
  if (step3) {
    step3.querySelector('.btn-outline')?.addEventListener('click', prevStep);
    step3.querySelector('.btn-primary')?.addEventListener('click', nextStep);
  }

  // Step 4: Back & Submit
  const step4 = document.querySelector('.form-step[data-step="4"]');
  if (step4) {
    step4.querySelector('.btn-outline')?.addEventListener('click', prevStep);
    step4.querySelector('.btn-success')?.addEventListener('click', submitCheckIn);
  }

  // Signature method toggles
  document.querySelectorAll('.sig-tab').forEach(tab => {
    tab.addEventListener('click', () => switchSigMethod(tab));
  });

  // Clear signature buttons
  document.querySelector('#tenant-draw .btn')?.addEventListener('click', () => clearSig('tenant'));
  document.querySelector('#agent-draw .btn')?.addEventListener('click', () => clearSig('agent'));

  // Typed signature inputs
  document.getElementById('tenant-typed-sig')?.addEventListener('input', () => updateTypedSig('tenant'));
  document.getElementById('agent-typed-sig')?.addEventListener('input', () => updateTypedSig('agent'));

  // Sign on behalf checkbox
  document.getElementById('sign-on-behalf')?.addEventListener('change', toggleSignOnBehalf);

  // Auto-generate reference number when council, address, or date change
  const refTriggers = ['council_name', 'property_address', 'checkin_date'];
  const form = document.getElementById('checkin-form');
  refTriggers.forEach(name => {
    const input = form?.querySelector(`[name="${name}"]`);
    if (input) {
      input.addEventListener('input', generateReference);
      input.addEventListener('change', generateReference);
    }
  });
}
