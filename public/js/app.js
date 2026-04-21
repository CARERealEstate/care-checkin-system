// CARE Real Estate - Check-In Form System
// =========================================

let currentStep = 1;
const totalSteps = 4;
let tenantSigPad = nul;
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
    // Sig pads init when step 4 shown
  }
}

// ===== Step Navigation =====
function showStep(step) {
  // Only toggle steps within the new-checkin form, not the detail page
  document.querySelectorAll('#page-new-checkin .form-step').forEach(s => s.classList.remove('active'));
  document.querySelector(`#page-new-checkin .form-step[data-step="${step}"]`)?.classList.add('active');
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
  if (typeof SignaturePad === 'undefined') {
    console.warn('SignaturePad not loaded yet, retrying in 500ms...');
    setTimeout(initSignaturePads, 500);
    return;
  }
  const tCanvas = document.getElementById('tenant-sig-canvas');
  const aCanvas = document.getElementById('agent-sig-canvas');
  if (tCanvas && !tenantSigPad) {
    if (tenantSigPad) { tenantSigPad.off(); tenantSigPad = null; }
    resizeCanvas(tCanvas);
    tenantSigPad = new SignaturePad(tCanvas, { backgroundColor: 'rgba(250,250,250,1)', penColor: '#222', minWidth: 1, maxWidth: 3 });
  }
  if (aCanvas && !agentSigPad) {
    if (agentSigPad) { agentSigPad.off(); agentSigPad = null; }
    resizeCanvas(aCanvas);
    agentSigPad = new SignaturePad(aCanvas, { backgroundColor: 'rgba(250,250,250,1)', penColor: '#222', minWidth: 1, maxWidth: 3 });
  }
}

function resizeCanvas(canvas) {
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const parent = canvas.parentElement;
  // Use parent width for sizing, ensure canvas is visible
  let w = parent ? parent.clientWidth : canvas.clientWidth || 400;
  if (w < 100) w = 400; // Fallback if parent not visible yet
  const h = 150;
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.style.touchAction = 'none'; // Critical for tablet/mobile
  canvas.style.msTouchAction = 'none';
  canvas.style.userSelect = 'none';
  canvas.style.webkitUserSelect = 'none';
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
  let signingMethod = 'in_person';
  if (signOnBehalf) {
    // Generate a signature image with tenant's name in block capitals
    const tenantName = (values.tenant_first_name + ' ' + values.tenant_last_name).toUpperCase();
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, 400, 100);
    ctx.font = 'bold 28px "Inter", "Arial", sans-serif';
    ctx.fillStyle = '#222';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tenantName, 200, 40);
    ctx.font = '12px "Inter", "Arial", sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText('(Signed on behalf by agent)', 200, 70);
    tenantSig = canvas.toDataURL();
  } else {
    tenantSig = getSignatureDataURL("tenant");
    // Tenant signature is optional - can be signed later
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
      paying_bills: values.paying_bills || '',
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
    showToast('Check-in complete! Opening report...', 'success');

    // Generate and download actual PDF
    await generateAndDownloadPdf(formId);



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

      return `<div class="record-card" data-view-booking="${b.id}" style="cursor:pointer;">
        <div class="record-info">
          <h3>${b.tenant_first_name} ${b.tenant_last_name}</h3>
          <div class="record-meta">
            <span><i class="fas fa-building"></i> ${b.property_address || 'N/A'}</span>
            <span><i class="fas fa-university"></i> ${b.council_name || 'N/A'}</span>
            <span><i class="fas fa-hashtag"></i> ${b.reference_number || 'No Ref'}</span>
            <span><i class="fas fa-calendar"></i> ${formatDate(b.created_at)}</span>
          </div>
        </div>
        <div class="record-actions">
          <span class="status-badge status-${statusClass}">${statusText}</span>
          <button class="btn btn-sm btn-outline" data-download-booking="${b.id}" title="View PDF"><i class="fas fa-file-pdf"></i></button>
          <button class="btn btn-sm btn-outline" data-view-detail="${b.id}" title="View Details"><i class="fas fa-eye"></i></button>
          <button class="btn btn-sm btn-outline" data-delete-booking="${b.id}" title="Delete" style="color:#e74c3c;border-color:#e74c3c;"><i class="fas fa-trash"></i></button>
        </div>
      </div>`;
    }).join('');

    // Bind card clicks (view detail)
    container.querySelectorAll('[data-view-booking]').forEach(card => {
      card.addEventListener('click', (e) => {
        // Don't trigger if clicking a button inside the card
        if (e.target.closest('button')) return;
        viewRecord(parseInt(card.dataset.viewBooking));
      });
    });

    // Bind download buttons
    container.querySelectorAll('[data-download-booking]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadPDF(parseInt(btn.dataset.downloadBooking));
      });
    });

    // Bind view detail buttons
    container.querySelectorAll('[data-view-detail]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        viewRecord(parseInt(btn.dataset.viewDetail));
      });
    });

    // Bind delete buttons
    container.querySelectorAll('[data-delete-booking]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteBooking(parseInt(btn.dataset.deleteBooking));
      });
    });

  } catch (err) {
    console.error('Load error:', err);
  }
}

async function downloadPDF(bookingId) {
  try {
    const res = await fetch(`/api/bookings/${bookingId}`);
    const data = await res.json();
    const forms = data.forms || [];
    const form = forms.find(f => f.type === 'check_in');
    if (!form) {
      showToast('No check-in form found for this record', 'error');
      return;
    }
    await generateAndDownloadPdf(form.id);
  } catch (err) {
    showToast('Error downloading PDF: ' + err.message, 'error');
  }
}

// Delete a booking with confirmation
async function deleteBooking(bookingId) {
  var confirmed = confirm('Are you sure you want to delete this record? This will permanently remove all associated forms, evidence and data. This action cannot be undone.');
  if (!confirmed) return;

  try {
    var res = await fetch('/api/bookings/' + bookingId, { method: 'DELETE' });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete');
    showToast('Record deleted successfully', 'success');
    if (currentViewBookingId === bookingId) {
      currentViewBookingId = null;
      navigateTo('dashboard');
    }
    loadBookings();
  } catch (err) {
    console.error('Delete error:', err);
    showToast('Error deleting record: ' + err.message, 'error');
  }
}

// Delete from the detail page
function deleteCurrentRecord() {
  if (!currentViewBookingId) { showToast('No record selected', 'error'); return; }
  deleteBooking(currentViewBookingId);
}

async function deleteCheckInForm() {
  if (!currentViewBookingId) { showToast("No record selected", "error"); return; }
  try {
    var res = await fetch("/api/bookings/" + currentViewBookingId);
    var data = await res.json();
    var forms = data.forms || [];
    var form = forms.find(function(f) { return f.type === "check_in"; });
    if (!form) { showToast("No check-in form found to delete", "error"); return; }
    var confirmed = confirm("Are you sure you want to delete this check-in form? The booking record will be kept but the form data, signatures and evidence will be removed. You can then redo the check-in.");
    if (!confirmed) return;
    var delRes = await fetch("/api/forms/" + form.id, { method: "DELETE" });
    var delData = await delRes.json();
    if (!delRes.ok) throw new Error(delData.error || "Failed to delete form");
    showToast("Check-in form deleted. You can now redo the check-in.", "success");
    viewRecord(currentViewBookingId);
  } catch (err) {
    console.error("Delete form error:", err);
    showToast("Error: " + err.message, "error");
  }
}

// PDF generation - opens the check-in report in a new window for printing/saving as PDF
// Server-side PDF generation via Puppeteer
async function generateAndDownloadPdf(formId) {
  showToast('Generating PDF...', 'success');
  try {
    await fetch('/api/pdf/generate/' + formId, { method: 'POST' });
    var res = await fetch('/api/pdf/download/' + formId);
    if (!res.ok) {
      var errData = await res.json().catch(function() { return {}; });
      throw new Error(errData.error || 'Failed to generate PDF');
    }
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'CARE-CheckIn-' + formId + '.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('PDF downloaded!', 'success');
  } catch (err) {
    console.error('PDF error:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

// View PDF inline in a new browser tab
async function viewPdfInBrowser(formId) {
  showToast('Preparing PDF view...', 'success');
  try {
    await fetch('/api/pdf/generate/' + formId, { method: 'POST' });
    window.open('/api/pdf/view/' + formId, '_blank');
  } catch (err) {
    console.error('PDF view error:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

// Called from the Download PDF button on the record detail page
function downloadAsPdf() {
  if (!currentViewBookingId) { showToast('No record selected', 'error'); return; }
  downloadPDF(currentViewBookingId);
}

// Called from View PDF button - opens in new tab
function viewAsPdf() {
  if (!currentViewBookingId) { showToast('No record selected', 'error'); return; }
  // Find the form ID for this booking
  fetch('/api/bookings/' + currentViewBookingId).then(function(res) { return res.json(); }).then(function(data) {
    var forms = data.forms || [];
    var form = forms.find(function(f) { return f.type === 'check_in'; });
    if (!form) { showToast('No check-in form found', 'error'); return; }
    viewPdfInBrowser(form.id);
  }).catch(function(err) { showToast('Error: ' + err.message, 'error'); });
}
// ===== View Record Detail =====
let currentViewBookingId = null;

async function viewRecord(bookingId) {
  try {
    const res = await fetch(`/api/bookings/${bookingId}`);
    if (!res.ok) throw new Error('Failed to load record');
    const data = await res.json();
    const b = data.booking;
    const forms = data.forms || [];
    const checkInForm = forms.find(f => f.type === 'check_in');
    let formData = {};
    if (checkInForm && checkInForm.form_data) {
      try { formData = JSON.parse(checkInForm.form_data); } catch(e) {}
    }

    currentViewBookingId = bookingId;

    // Populate detail fields
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || 'â'; };

    setVal('detail-first-name', b.tenant_first_name);
    setVal('detail-last-name', b.tenant_last_name);
    setVal('detail-phone', b.tenant_phone);
    setVal('detail-email', b.tenant_email);
    setVal('detail-address', b.property_address);
    setVal('detail-council', b.council_name);
    setVal('detail-ref', b.reference_number);
    setVal('detail-housing-officer', formData.housing_officer);
    setVal('detail-unit', formData.unit_number);
    setVal('detail-nok-name', formData.nok_name);
    setVal('detail-nok-phone', formData.nok_number);
    setVal('detail-checkin-date', formData.checkin_date || b.placement_start);
    setVal('detail-checkin-time', formData.checkin_time);
    setVal('detail-accommodation', formData.accommodation_type);
    setVal('detail-rate', b.nightly_rate || formData.nightly_rate);
    setVal('detail-pet-deposit', formData.pet_deposit);
    setVal('detail-paying-bills', formData.paying_bills === 'yes' ? 'Yes' : formData.paying_bills === 'no' ? 'No' : formData.paying_bills || '');
    setVal('detail-placement-start', b.placement_start);
    setVal('detail-placement-end', b.placement_end);
    setVal('detail-notes', formData.condition_notes);

    // Status
    const status = b.status || 'active';
    const statusText = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    setText('detail-status', statusText);

    // Consent info
    setText('detail-dob', formData.date_of_birth || 'â');
    setText('detail-consent', formData.consent_agreed ? 'Yes' : 'No');
    setText('detail-excluded', formData.excluded_agencies || 'None');

    // Signatures
    const tenantSigImg = document.getElementById('detail-tenant-sig');
    const agentSigImg = document.getElementById('detail-agent-sig');
    if (tenantSigImg) {
      if (checkInForm?.tenant_signature) {
        tenantSigImg.src = checkInForm.tenant_signature;
        tenantSigImg.style.display = '';
      } else {
        tenantSigImg.style.display = 'none';
      }
    }
    if (agentSigImg) {
      if (checkInForm?.agent_signature) {
        agentSigImg.src = checkInForm.agent_signature;
        agentSigImg.style.display = '';
      } else {
        agentSigImg.style.display = 'none';
      }
    }
    setText('detail-agent-name', checkInForm?.agent_name);

    // PDF button - always show if there's a check-in form (regenerates on click)
    const pdfBtn = document.getElementById('detail-pdf-btn');
    if (pdfBtn) {
      if (checkInForm) {
        pdfBtn.style.display = '';
        pdfBtn.onclick = async () => {
          pdfBtn.disabled = true;
          pdfBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Opening PDF...';
          try {
            await viewPdfInBrowser(checkInForm.id);
          } catch(e) {
            showToast('Error viewing PDF', 'error');
          }
          pdfBtn.disabled = false;
          pdfBtn.innerHTML = '<i class="fas fa-file-pdf"></i> View PDF';
        };
      } else {
        pdfBtn.style.display = 'none';
      }
    }

    // Regenerate/Download PDF button
    const regenBtn = document.getElementById('detail-regen-btn');
    if (regenBtn) {
      if (checkInForm) {
        regenBtn.style.display = '';
        regenBtn.onclick = async () => {
          regenBtn.disabled = true;
          regenBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
          try {
            await generateAndDownloadPdf(checkInForm.id);
          } catch(e) {
            showToast('Error regenerating PDF', 'error');
          }
          regenBtn.disabled = false;
          regenBtn.innerHTML = '<i class="fas fa-redo"></i> Regenerate PDF';
        };
      } else {
        regenBtn.style.display = 'none';
      }
    }

    // Inventory table
    const invBody = document.getElementById('detail-inventory-body');
    if (invBody && formData.inventory) {
      invBody.innerHTML = formData.inventory.map(item => `<tr>
        <td>${item.name}</td>
        <td style="text-align:center"><i class="fas fa-${item.in ? 'check text-green' : 'times text-red'}"></i></td>
        <td>${item.comments || 'â'}</td>
      </tr>`).join('');
    } else if (invBody) {
      invBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#999;">No inventory data</td></tr>';
    }

    // Navigate to detail page
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const detailPage = document.getElementById('page-record-detail');
    if (detailPage) {
      detailPage.classList.add('active');
      // Ensure all form-step sections inside detail page remain visible
      detailPage.querySelectorAll('.form-step').forEach(s => s.classList.add('active'));
    }
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (err) {
    console.error('View record error:', err);
    showToast('Error loading record details', 'error');
  }
}

async function saveRecordEdits() {
  if (!currentViewBookingId) return;
  const getVal = (id) => document.getElementById(id)?.value || '';

  try {
    // Update booking
    const res = await fetch(`/api/bookings/${currentViewBookingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_first_name: getVal('detail-first-name'),
        tenant_last_name: getVal('detail-last-name'),
        tenant_email: getVal('detail-email'),
        tenant_phone: getVal('detail-phone'),
        property_address: getVal('detail-address'),
        council_name: getVal('detail-council'),
        reference_number: getVal('detail-ref'),
        placement_start: getVal('detail-placement-start'),
        placement_end: getVal('detail-placement-end'),
        nightly_rate: getVal('detail-rate')
      })
    });
    if (!res.ok) throw new Error('Failed to save booking');

    // Also update form data if we have a form
    const bRes = await fetch(`/api/bookings/${currentViewBookingId}`);
    const bData = await bRes.json();
    const forms = bData.forms || [];
    const checkInForm = forms.find(f => f.type === 'check_in');
    if (checkInForm) {
      let existingFormData = {};
      try { existingFormData = JSON.parse(checkInForm.form_data); } catch(e) {}

      // Merge edits into form data
      existingFormData.housing_officer = getVal('detail-housing-officer');
      existingFormData.unit_number = getVal('detail-unit');
      existingFormData.nok_name = getVal('detail-nok-name');
      existingFormData.nok_number = getVal('detail-nok-phone');
      existingFormData.checkin_date = getVal('detail-checkin-date');
      existingFormData.checkin_time = getVal('detail-checkin-time');
      existingFormData.accommodation_type = getVal('detail-accommodation');
      existingFormData.nightly_rate = getVal('detail-rate');
      existingFormData.pet_deposit = getVal('detail-pet-deposit');
      existingFormData.paying_bills = getVal('detail-paying-bills').toLowerCase() === 'yes' ? 'yes' : getVal('detail-paying-bills').toLowerCase() === 'no' ? 'no' : existingFormData.paying_bills;
      existingFormData.condition_notes = getVal('detail-notes');

      await fetch(`/api/forms/${checkInForm.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_data: JSON.stringify(existingFormData)
        })
      });
    }

    showToast('Changes saved! Generating updated PDF...', 'success');
    await downloadPDF(currentViewBookingId);
  } catch (err) {
    showToast('Error saving changes: ' + err.message, 'error');
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
  'haringey': 'HRGY', 'haringey council': 'HRGY', 'london borough of haringey': 'HRGY', 'hrgy': 'HRGY',
  'sevenoaks': 'SDC', 'sevenoaks district council': 'SDC', 'sevenoaks district': 'SDC', 'sdc': 'SDC'
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

  // No street number â just take initials of remaining words (e.g. "Delme Court")
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
