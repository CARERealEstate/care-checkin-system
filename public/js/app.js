// CARE Real Estate â Check-In/Out Dashboard
// ============================================

let currentPage = 'bookings';
let currentBookingId = null;
let currentFormId = null;
let tenantSigPad = null;
let agentSigPad = null;
let uploadedFiles = [];

// ============= NAVIGATION =============
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;
    showPage(page);
  });
});

function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) {
    pageEl.classList.add('active');
    currentPage = page;
  }

  const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navItem) navItem.classList.add('active');
}

// ============= BOOKINGS =============
let bookingsFilter = 'all';
let bookingsPage = 1;

document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    bookingsFilter = tab.dataset.status;
    bookingsPage = 1;
    loadBookings();
  });
});

document.getElementById('globalSearch').addEventListener('input', debounce(() => {
  bookingsPage = 1;
  loadBookings();
}, 300));

async function loadBookings() {
  const search = document.getElementById('globalSearch').value;
  const list = document.getElementById('bookings-list');
  list.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i><p>Loading bookings...</p></div>';

  try {
    const params = new URLSearchParams({
      page: bookingsPage,
      limit: 20,
      status: bookingsFilter
    });
    if (search) params.set('search', search);

    const res = await fetch(`/api/bookings?${params}`);
    const data = await res.json();

    if (!data.bookings || data.bookings.length === 0) {
      list.innerHTML = `
        <div style="text-align:center;padding:40px;color:#718096;">
          <i class="fas fa-inbox" style="font-size:40px;margin-bottom:12px;display:block;"></i>
          <p>No bookings found</p>
          <p style="font-size:13px;margin-top:8px;">Create a manual booking or sync from CRM</p>
        </div>`;
      return;
    }

    list.innerHTML = data.bookings.map(b => `
      <div class="booking-card" onclick="viewBooking(${b.id})">
        <div class="bc-info">
          <div class="bc-name">${b.tenant_first_name} ${b.tenant_last_name}</div>
          <div class="bc-details">
            <i class="fas fa-home"></i> ${b.property_address || 'No address'}
            &nbsp;|&nbsp; <i class="fas fa-landmark"></i> ${b.council_name || 'N/A'}
            &nbsp;|&nbsp; <i class="fas fa-calendar"></i> ${b.placement_start || 'N/A'}
            ${b.evidence_count > 0 ? `&nbsp;|&nbsp; <i class="fas fa-camera"></i> ${b.evidence_count} files` : ''}
          </div>
        </div>
        <div class="bc-actions">
          <span class="status-badge status-${b.status}">${formatStatus(b.status)}</span>
          ${b.has_checkin === 0 && b.status === 'active' ? '<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();startCheckIn('+b.id+')">Check In</button>' : ''}
          ${b.has_checkout === 0 && b.status === 'checked_in' ? '<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();startCheckOut('+b.id+')">Check Out</button>' : ''}
          <i class="fas fa-chevron-right" style="color:#cbd5e0;"></i>
        </div>
      </div>
    `).join('');

    // Pagination
    const pg = data.pagination;
    const pgEl = document.getElementById('bookings-pagination');
    if (pg.pages > 1) {
      let html = '';
      for (let i = 1; i <= pg.pages; i++) {
        html += `<button class="${i === pg.page ? 'active' : ''}" onclick="bookingsPage=${i};loadBookings()">${i}</button>`;
      }
      pgEl.innerHTML = html;
    } else {
      pgEl.innerHTML = '';
    }
  } catch (err) {
    list.innerHTML = `<div class="loading" style="color:#e74c3c"><p>Error: ${err.message}</p></div>`;
  }
}

// ============= BOOKING DETAIL =============
async function viewBooking(id) {
  currentBookingId = id;
  showPage('booking-detail');

  const container = document.getElementById('booking-detail-content');
  container.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i></div>';

  try {
    const res = await fetch(`/api/bookings/${id}`);
    const data = await res.json();
    const b = data.booking;
    const forms = data.forms || [];
    const evidence = data.evidence || [];

    const checkinForm = forms.find(f => f.type === 'check_in');
    const checkoutForm = forms.find(f => f.type === 'check_out');

    container.innerHTML = `
      <div class="detail-header">
        <div>
          <div class="back-btn" onclick="showPage('bookings');loadBookings()"><i class="fas fa-arrow-left"></i> Back to Bookings</div>
          <h2 style="margin-top:8px;">${b.tenant_first_name} ${b.tenant_last_name}</h2>
          <span class="status-badge status-${b.status}">${formatStatus(b.status)}</span>
        </div>
        <div style="display:flex;gap:8px;">
          ${!checkinForm ? `<button class="btn btn-primary" onclick="startCheckIn(${b.id})"><i class="fas fa-sign-in-alt"></i> Start Check-In</button>` : ''}
          ${checkinForm && !checkoutForm ? `<button class="btn btn-secondary" onclick="startCheckOut(${b.id})"><i class="fas fa-sign-out-alt"></i> Start Check-Out</button>` : ''}
          <button class="btn btn-outline" onclick="editBooking(${b.id})"><i class="fas fa-edit"></i> Edit</button>
        </div>
      </div>

      <div class="info-cards">
        <div class="info-card"><div class="ic-label">Property</div><div class="ic-value">${b.property_address || 'N/A'}</div></div>
        <div class="info-card"><div class="ic-label">Council</div><div class="ic-value">${b.council_name || 'N/A'}</div></div>
        <div class="info-card"><div class="ic-label">Start Date</div><div class="ic-value">${b.placement_start || 'N/A'}</div></div>
        <div class="info-card"><div class="ic-label">Reference</div><div class="ic-value">${b.reference_number || 'N/A'}</div></div>
        <div class="info-card"><div class="ic-label">Email</div><div class="ic-value">${b.tenant_email || 'N/A'}</div></div>
        <div class="info-card"><div class="ic-label">Phone</div><div class="ic-value">${b.tenant_phone || 'N/A'}</div></div>
      </div>

      ${forms.length > 0 ? `
        <div class="section-card">
          <h3><i class="fas fa-file-alt"></i> Forms & PDFs</h3>
          ${forms.map(f => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e2e8f0;">
              <div>
                <strong>${f.type === 'check_in' ? 'Check-In Form' : 'Check-Out Form'}</strong>
                <span class="status-badge status-${f.status === 'completed' ? 'completed' : 'active'}" style="margin-left:8px;">${f.status}</span>
                <div style="font-size:12px;color:#718096;">${f.signing_method === 'in_person' ? 'In-Person' : 'Adobe Sign'} â ${new Date(f.created_at).toLocaleDateString('en-GB')}</div>
              </div>
              <div style="display:flex;gap:6px;">
                ${f.status === 'completed' && f.pdf_path ? `<button class="btn btn-sm btn-primary" onclick="downloadPDF(${f.id})"><i class="fas fa-download"></i> PDF</button>` : ''}
                ${f.status !== 'completed' ? `<button class="btn btn-sm btn-outline" onclick="resumeForm(${f.id},'${f.type}')"><i class="fas fa-edit"></i> Continue</button>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="section-card">
        <h3><i class="fas fa-camera"></i> Evidence & Files (${evidence.length})</h3>
        ${evidence.length > 0 ? `
          <div class="evidence-grid">
            ${evidence.map(e => `
              <div class="evidence-item">
                ${e.file_type === 'image' ? `<img src="/api/evidence/${e.id}/thumb" alt="${e.original_filename}" onclick="previewEvidence(${e.id})" style="cursor:pointer;">` : `<div style="height:120px;display:flex;align-items:center;justify-content:center;background:#f7fafc;"><i class="fas fa-file-pdf" style="font-size:32px;color:#e74c3c;"></i></div>`}
                <div class="ei-info">
                  <div class="ei-name">${e.original_filename}</div>
                  ${e.note ? `<div class="ei-note">${e.note}</div>` : ''}
                  <div class="ei-actions">
                    <button class="btn btn-sm btn-outline" onclick="window.open('/api/evidence/${e.id}/file')"><i class="fas fa-download"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteEvidence(${e.id},${b.id})"><i class="fas fa-trash"></i></button>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : '<p style="color:#718096;font-size:13px;">No evidence uploaded yet</p>'}
      </div>

      <div class="section-card">
        <h3><i class="fas fa-history"></i> Audit Log</h3>
        ${(data.auditLog || []).map(a => `
          <div style="padding:6px 0;border-bottom:1px solid #f0f2f5;font-size:12px;">
            <strong>${a.action.replace(/_/g,' ')}</strong> by ${a.performed_by} â ${new Date(a.created_at).toLocaleString('en-GB')}
          </div>
        `).join('') || '<p style="color:#718096;font-size:13px;">No activity yet</p>'}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="loading" style="color:#e74c3c">Error: ${err.message}</div>`;
  }
}

// ============= CHECK-IN FORM =============
async function startCheckIn(bookingId) {
  currentBookingId = bookingId;
  showPage('checkin-form');
  const container = document.getElementById('checkin-form-content');
  container.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i></div>';

  try {
    const bRes = await fetch(`/api/bookings/${bookingId}`);
    const bData = await bRes.json();
    const b = bData.booking;

    // Create form record
    const fRes = await fetch('/api/forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: bookingId, type: 'check_in', form_data: {} })
    });
    const fData = await fRes.json();

    if (fData.error && fData.formId) {
      currentFormId = fData.formId;
    } else {
      currentFormId = fData.id;
    }

    renderCheckInForm(b, currentFormId);
  } catch (err) {
    container.innerHTML = `<div class="loading" style="color:#e74c3c">Error: ${err.message}</div>`;
  }
}

function renderCheckInForm(booking, formId) {
  const container = document.getElementById('checkin-form-content');
  uploadedFiles = [];
  const today = new Date().toISOString().split('T')[0];
  const nowTime = new Date().toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});

  container.innerHTML = `
    <div class="detail-header">
      <div>
        <div class="back-btn" onclick="viewBooking(${booking.id})"><i class="fas fa-arrow-left"></i> Back to Booking</div>
        <h2 style="margin-top:8px;">Placement Check-In Pack: ${booking.tenant_first_name} ${booking.tenant_last_name}</h2>
      </div>
    </div>

    <!-- PAGE 1: CHECK-IN FORM -->
    <div class="section-card" style="border-left:4px solid #2d8f48;">
      <h3><i class="fas fa-file-alt"></i> Page 1 â Check-In Form</h3>

      <div class="form-grid">
        <div class="form-group"><label>Council <span class="required">*</span></label><input type="text" id="ci-council" value="${booking.council_name || ''}"></div>
        <div class="form-group"><label>Housing Officer</label><input type="text" id="ci-housing-officer" placeholder="Council Housing Officer name"></div>
        <div class="form-group"><label>Placement Ref.</label><input type="text" id="ci-placement-ref" value="${booking.reference_number || ''}"></div>
        <div class="form-group"><label>Unit No.</label><input type="text" id="ci-unit-number" placeholder="e.g. Unit 5"></div>
      </div>

      <div class="form-grid">
        <div class="form-group"><label>Placement Name</label><input type="text" value="${booking.tenant_first_name} ${booking.tenant_last_name}" disabled></div>
        <div class="form-group"><label>Placement Phone</label><input type="text" value="${booking.tenant_phone || ''}" disabled></div>
        <div class="form-group"><label>Placement Email</label><input type="text" value="${booking.tenant_email || ''}" disabled></div>
        <div class="form-group"><label>NOK Name</label><input type="text" id="ci-nok-name" placeholder="Next of Kin name"></div>
        <div class="form-group"><label>NOK Number</label><input type="text" id="ci-nok-number" placeholder="Next of Kin phone"></div>
        <div class="form-group"><label>Check-In Date</label><input type="date" id="ci-checkin-date" value="${today}"></div>
        <div class="form-group"><label>Check-In Time</label><input type="time" id="ci-checkin-time" value="${nowTime}"></div>
      </div>

      <h4 style="margin:16px 0 8px;color:#2d8f48;">Temporary Accommodation Details</h4>
      <div class="form-grid">
        <div class="form-group full-width"><label>Property Address</label><input type="text" id="ci-property-address" value="${booking.property_address || ''}"></div>
        <div class="form-group">
          <label>Accommodation Type <span class="required">*</span></label>
          <select id="ci-accommodation-type">
            <option value="">Select...</option>
            <option value="single">Single</option>
            <option value="couple">Couple</option>
            <option value="family">Family</option>
          </select>
        </div>
        <div class="form-group"><label>Nightly Rate (Â£)</label><input type="text" id="ci-nightly-rate" value="${booking.nightly_rate || ''}" placeholder="e.g. Â£65"></div>
        <div class="form-group"><label>Pet Deposit Required</label><input type="text" id="ci-pet-deposit" placeholder="e.g. Â£250 or N/A"></div>
      </div>

      <div class="form-group full-width">
        <label>Notes</label>
        <textarea id="ci-condition-notes" rows="3" placeholder="Any notes about the property or placement..."></textarea>
      </div>

      <h4 style="margin:16px 0 8px;color:#2d8f48;">Inventory</h4>
      <table style="width:100%;border-collapse:collapse;font-size:13px;" id="ci-inventory-table">
        <thead>
          <tr style="background:#2d8f48;color:white;">
            <th style="padding:8px;text-align:left;">Item</th>
            <th style="padding:8px;text-align:center;width:50px;">IN</th>
            <th style="padding:8px;text-align:center;width:50px;">OUT</th>
            <th style="padding:8px;text-align:left;">Signed For</th>
            <th style="padding:8px;text-align:left;">Comments</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">Bed(s)</td><td style="text-align:center;border-bottom:1px solid #eee;"><input type="checkbox" class="inv-in" checked></td><td style="text-align:center;border-bottom:1px solid #eee;"><input type="checkbox" class="inv-out"></td><td style="border-bottom:1px solid #eee;"><input type="text" class="inv-signed" style="width:100%;border:1px solid #ddd;padding:4px;border-radius:4px;"></td><td style="border-bottom:1px solid #eee;"><input type="text" class="inv-comments" style="width:100%;border:1px solid #ddd;padding:4px;border-radius:4px;"></td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">Cupboard(s)</td><td style="text-align:center;border-bottom:1px solid #eee;"><input type="checkbox" class="inv-in" checked></td><td style="text-align:center;border-bottom:1px solid #eee;"><input type="checkbox" class="inv-out"></td><td style="border-bottom:1px solid #eee;"><input type="text" class="inv-signed" style="width:100%;border:1px solid #ddd;padding:4px;border-radius:4px;"></td><td style="border-bottom:1px solid #eee;"><input type="text" class="inv-comments" style="width:100%;border:1px solid #ddd;padding:4px;border-radius:4px;"></td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">Sofa</td><td style="text-align:center;border-bottom:1px solid #eee;"><input type="checkbox" class="inv-in" checked></td><td style="text-align:center;border-bottom:1px solid #eee;"><input type="checkbox" class="inv-out"></td><td style="border-bottom:1px solid #eee;"><input type="text" class="inv-signed" style="width:100%;border:1px solid #ddd;padding:4px;border-radius:4px;"></td><td style="border-bottom:1px solid #eee;"><input type="text" class="inv-comments" style="width:100%;border:1px solid #ddd;padding:4px;border-radius:4px;"></td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">Table/chairs</td><td style="text-align:center;border-bottom:1px solid #eee;"><input type="checkbox" class="inv-in" checked></td><td style="text-align:center;border-bottom:1px solid #eee;"><input type="checkbox" class="inv-out"></td><td style="border-bottom:1px solid #eee;"><input type="text" class="inv-signed" style="width:100%;border:1px solid #ddd;padding:4px;border-radius:4px;"></td><td style="border-bottom:1px solid #eee;"><input type="text" class="inv-comments" style="width:100%;border:1px solid #ddd;padding:4px;border-radius:4px;"></td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">W. machine</td><td style="text-align:center;border-bottom:1px solid #eee;"><input type="checkbox" class="inv-in" checked></td><td style="text-align:center;border-bottom:1px solid #eee;"><input type="checkbox" class="inv-out"></td><td style="border-bottom:1px solid #eee;"><input type="text" class="inv-signed" style="width:100%;border:1px solid #ddd;padding:4px;border-radius:4px;"></td><td style="border-bottom:1px solid #eee;"><input type="text" class="inv-comments" style="width:100%;border:1px solid #ddd;padding:4px;border-radius:4px;"></td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">Fridge/ Freezer</td><td style="text-align:center;border-bottom:1px solid #eee;"><input type="checkbox" class="inv-in" checked></td><td style="text-align:center;border-bottom:1px solid #eee;"><input type="checkbox" class="inv-out"></td><td style="border-bottom:1px solid #eee;"><input type="text" class="inv-signed" style="width:100%;border:1px solid #ddd;padding:4px;border-radius:4px;"></td><td style="border-bottom:1px solid #eee;"><input type="text" class="inv-comments" style="width:100%;border:1px solid #ddd;padding:4px;border-radius:4px;"></td></tr>
        </tbody>
      </table>
    </div>

    <!-- PAGE 5 FIELDS: CONSENT FORM -->
    <div class="section-card" style="border-left:4px solid #e74c3c;">
      <h3><i class="fas fa-shield-alt"></i> Page 5 â Information Sharing Consent</h3>
      <p style="font-size:13px;color:#555;margin-bottom:12px;">Consent for CARE Real Estate to share personal information with service providers (NHS, Police, Social Care, etc.)</p>
      <div class="form-grid">
        <div class="form-group"><label>Date of Birth</label><input type="date" id="ci-date-of-birth"></div>
        <div class="form-group">
          <label>Consent Agreed</label>
          <select id="ci-consent-agreed">
            <option value="">Select...</option>
            <option value="yes" selected>Yes â Agreed to information sharing</option>
            <option value="no">No â Declined</option>
          </select>
        </div>
        <div class="form-group full-width"><label>Excluded Agencies (if any)</label><input type="text" id="ci-excluded-agencies" placeholder="List any agencies the placement does NOT want info shared with"></div>
      </div>
    </div>

    <!-- EVIDENCE UPLOADS -->
    <div class="section-card">
      <h3><i class="fas fa-camera"></i> Evidence Uploads (Optional)</h3>
      <div class="upload-zone" id="ci-upload-zone" onclick="document.getElementById('ci-file-input').click()">
        <i class="fas fa-cloud-upload-alt"></i>
        <p>Drag & drop images here, or click to browse</p>
        <p class="accepted">JPG, PNG, HEIC, PDF â Max 15MB each</p>
      </div>
      <input type="file" id="ci-file-input" multiple accept=".jpg,.jpeg,.png,.webp,.heic,.pdf" style="display:none" onchange="handleFileSelect(this.files, ${formId}, ${booking.id}, 'check_in')">
      <div id="ci-evidence-preview" class="evidence-grid"></div>
    </div>

    <!-- SIGNING -->
    <div class="section-card">
      <h3><i class="fas fa-pen-fancy"></i> Signing Method</h3>
      <div class="signing-toggle">
        <div class="signing-option active" data-method="in_person" onclick="selectSigningMethod(this, 'in_person')">
          <i class="fas fa-pen"></i>
          <span>Sign In Person</span>
        </div>
        <div class="signing-option" data-method="adobe_sign" onclick="selectSigningMethod(this, 'adobe_sign')">
          <i class="fas fa-envelope"></i>
          <span>Send via Adobe Sign</span>
        </div>
      </div>

      <div id="in-person-signing">
        <div class="signature-container">
          <div class="sig-pad-wrapper">
            <h4>Placement Signature</h4>
            <canvas id="tenant-sig-canvas"></canvas>
            <div class="sig-actions">
              <button class="btn btn-sm btn-outline" onclick="clearSignature('tenant')">Clear</button>
            </div>
          </div>
          <div class="sig-pad-wrapper">
            <h4>CARE Agent Signature</h4>
            <canvas id="agent-sig-canvas"></canvas>
            <div class="sig-actions">
              <button class="btn btn-sm btn-outline" onclick="clearSignature('agent')">Clear</button>
            </div>
            <div class="form-group" style="margin-top:8px;">
              <label>Agent Name</label>
              <input type="text" id="ci-agent-name" value="Uzair Ali">
            </div>
          </div>
        </div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:20px;">
      <button class="btn btn-outline btn-lg" onclick="saveDraft('check_in', ${formId}, ${booking.id})"><i class="fas fa-save"></i> Save Draft</button>
      <button class="btn btn-primary btn-lg" onclick="completeForm('check_in', ${formId}, ${booking.id})"><i class="fas fa-check-circle"></i> Complete Check-In & Generate PDF</button>
    </div>
  `;

  initSignaturePads();
  initUploadZone('ci-upload-zone', 'ci-file-input');
}

// ============= CHECK-OUT FORM =============
async function startCheckOut(bookingId) {
  currentBookingId = bookingId;
  showPage('checkout-form');
  const container = document.getElementById('checkout-form-content');
  container.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i></div>';

  try {
    const bRes = await fetch(`/api/bookings/${bookingId}`);
    const bData = await bRes.json();
    const b = bData.booking;

    const fRes = await fetch('/api/forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: bookingId, type: 'check_out', form_data: {} })
    });
    const fData = await fRes.json();
    currentFormId = fData.error && fData.formId ? fData.formId : fData.id;

    renderCheckOutForm(b, currentFormId);
  } catch (err) {
    container.innerHTML = `<div class="loading" style="color:#e74c3c">Error: ${err.message}</div>`;
  }
}

function renderCheckOutForm(booking, formId) {
  const container = document.getElementById('checkout-form-content');
  uploadedFiles = [];
  const today = new Date().toISOString().split('T')[0];
  const nowTime = new Date().toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});

  container.innerHTML = `
    <div class="detail-header">
      <div>
        <div class="back-btn" onclick="viewBooking(${booking.id})"><i class="fas fa-arrow-left"></i> Back to Booking</div>
        <h2 style="margin-top:8px;">Check-Out: ${booking.tenant_first_name} ${booking.tenant_last_name}</h2>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-user"></i> Booking Details</h3>
      <div class="form-grid">
        <div class="form-group"><label>Tenant</label><input type="text" value="${booking.tenant_first_name} ${booking.tenant_last_name}" disabled></div>
        <div class="form-group"><label>Property</label><input type="text" value="${booking.property_address || ''}" disabled></div>
        <div class="form-group"><label>Council</label><input type="text" value="${booking.council_name || ''}" disabled></div>
        <div class="form-group"><label>Check-Out Date</label><input type="date" id="co-checkout-date" value="${today}"></div>
        <div class="form-group"><label>Check-Out Time</label><input type="time" id="co-checkout-time" value="${nowTime}"></div>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-clipboard-check"></i> Property Condition Assessment</h3>
      <div class="form-grid">
        <div class="form-group">
          <label>Overall Condition <span class="required">*</span></label>
          <select id="co-overall-condition">
            <option value="">Select...</option>
            <option value="Excellent">Excellent</option><option value="Good">Good</option><option value="Fair">Fair</option><option value="Poor">Poor</option>
          </select>
        </div>
        <div class="form-group">
          <label>Cleaning Status <span class="required">*</span></label>
          <select id="co-cleaning-status">
            <option value="">Select...</option>
            <option value="Clean">Clean</option><option value="Acceptable">Acceptable</option><option value="Needs Cleaning">Needs Cleaning</option><option value="Heavily Soiled">Heavily Soiled</option>
          </select>
        </div>
        <div class="form-group full-width">
          <label>Overall Condition Notes</label>
          <textarea id="co-overall-notes" placeholder="General notes about the property condition..."></textarea>
        </div>
        <div class="form-group full-width">
          <label>Cleaning Notes</label>
          <textarea id="co-cleaning-notes" placeholder="Notes about cleanliness..."></textarea>
        </div>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-exclamation-triangle"></i> Damages</h3>
      <div class="form-grid">
        <div class="form-group">
          <label>Damages Found?</label>
          <select id="co-damages-found">
            <option value="no">No</option><option value="yes">Yes</option>
          </select>
        </div>
        <div class="form-group full-width">
          <label>Damage Description</label>
          <textarea id="co-damages-desc" placeholder="Describe any damages found..."></textarea>
        </div>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-key"></i> Keys & Inventory Return</h3>
      <div class="form-grid">
        <div class="form-group">
          <label>Keys Returned</label>
          <select id="co-keys-returned">
            <option value="0">0</option><option value="1">1</option><option value="2" selected>2</option><option value="3">3</option><option value="4">4</option>
          </select>
        </div>
        <div class="form-group">
          <label>Fobs Returned</label>
          <select id="co-fobs-returned">
            <option value="0">0</option><option value="1">1</option><option value="2">2</option>
          </select>
        </div>
        <div class="form-group full-width">
          <label>Keys/Inventory Notes</label>
          <textarea id="co-keys-notes" placeholder="Any notes about returned keys or missing items..."></textarea>
        </div>
      </div>

      <h4 style="margin:16px 0 8px;color:#2d8f48;">Inventory Check-Out</h4>
      <table style="width:100%;border-collapse:collapse;font-size:13px;" id="co-inventory-table">
        <thead>
          <tr style="background:#2d8f48;color:white;">
            <th style="padding:8px;text-align:left;">Item</th>
            <th style="padding:8px;text-align:center;width:60px;">Present</th>
            <th style="padding:8px;text-align:left;">Condition</th>
            <th style="padding:8px;text-align:left;">Comments</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">Bed(s)</td><td style="text-align:center;border-bottom:1px solid #eee;"><input type="checkbox" class="inv-present" checked></td><td style="border-bottom:1px solid #eee;"><select class="inv-condition" style="width:100%;padding:4px;border:1px solid #ddd;border-radius:4px;"><option>Good</option><option>Fair</option><option>Poor</option><option>Damaged</option></select></td><td style="border-bottom:1px solid #eee;"><input type="text" class="inv-co-comments" style="width:100%;border:1px solid #ddd;padding:4px;border-radius:4px;"></td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">Cupboard(s)</td><td style="text-align:center;border-bottom:1px solid #eee;"><input type="checkbox" class="inv-present" checked></td><td style="border-bottom:1px solid #eee;"><select class="inv-condition" style="width:100%;padding:4px;border:1px solid #ddd;border-radius:4px;"><option>Good</option><option>Fair</option><option>Poor</option><option>Damaged</option></select></td><td style="border-bottom:1px solid #eee;"><input type="text" class="inv-co-comments" style="width:100%;border:1px solid #ddd;padding:4px;border-radius:4px;"></td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">Sofa</td><td style="text-align:center;border-bottom:1px solid #eee;"><input type="checkbox" class="inv-present" checked></td><td style="border-bottom:1px solid #eee;"><select class="inv-condition" style="width:100%;padding:4px;border:1px solid #ddd;border-radius:4px;"><option>Good</option><option>Fair</option><option>Poor</option><option>Damaged</option></select></td><td style="border-bottom:1px solid #eee;"><input type="text" class="inv-co-comments" style="width:100%;border:1px solid #ddd;padding:4px;border-radius:4px;"></td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">Table/chairs</td><td style="text-align:center;border-bottom:1px solid #eee;"><input type="checkbox" class="inv-present" checked></td><td style="border-bottom:1px solid #eee;"><select class="inv-condition" style="width:100%;padding:4px;border:1px solid #ddd;border-radius:4px;"><option>Good</option><option>Fair</option><option>Poor</option><option>Damaged</option></select></td><td style="border-bottom:1px solid #eee;"><input type="text" class="inv-co-comments" style="width:100%;border:1px solid #ddd;padding:4px;border-radius:4px;"></td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">W. machine</td><td style="text-align:center;border-bottom:1px solid #eee;"><input type="checkbox" class="inv-present" checked></td><td style="border-bottom:1px solid #eee;"><select class="inv-condition" style="width:100%;padding:4px;border:1px solid #ddd;border-radius:4px;"><option>Good</option><option>Fair</option><option>Poor</option><option>Damaged</option></select></td><td style="border-bottom:1px solid #eee;"><input type="text" class="inv-co-comments" style="width:100%;border:1px solid #ddd;padding:4px;border-radius:4px;"></td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">Fridge/ Freezer</td><td style="text-align:center;border-bottom:1px solid #eee;"><input type="checkbox" class="inv-present" checked></td><td style="border-bottom:1px solid #eee;"><select class="inv-condition" style="width:100%;padding:4px;border:1px solid #ddd;border-radius:4px;"><option>Good</option><option>Fair</option><option>Poor</option><option>Damaged</option></select></td><td style="border-bottom:1px solid #eee;"><input type="text" class="inv-co-comments" style="width:100%;border:1px solid #ddd;padding:4px;border-radius:4px;"></td></tr>
        </tbody>
      </table>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-tachometer-alt"></i> Final Meter Readings</h3>
      <div class="form-grid">
        <div class="form-group"><label>Electric Meter</label><input type="text" id="co-meter-electric" placeholder="Final reading"></div>
        <div class="form-group"><label>Gas Meter</label><input type="text" id="co-meter-gas" placeholder="Final reading"></div>
        <div class="form-group"><label>Water Meter</label><input type="text" id="co-meter-water" placeholder="Optional"></div>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-sticky-note"></i> Additional Notes</h3>
      <div class="form-group full-width">
        <textarea id="co-additional-notes" placeholder="Any additional notes for the record..." rows="4"></textarea>
      </div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-camera"></i> Evidence Uploads (Recommended for Check-Out)</h3>
      <div class="upload-zone" id="co-upload-zone" onclick="document.getElementById('co-file-input').click()">
        <i class="fas fa-cloud-upload-alt"></i>
        <p>Upload photos of damages, cleaning issues, missing items</p>
        <p class="accepted">JPG, PNG, HEIC, PDF â Max 15MB each</p>
      </div>
      <input type="file" id="co-file-input" multiple accept=".jpg,.jpeg,.png,.webp,.heic,.pdf" style="display:none" onchange="handleFileSelect(this.files, ${formId}, ${booking.id}, 'check_out')">
      <div id="co-evidence-preview" class="evidence-grid"></div>
    </div>

    <div class="section-card">
      <h3><i class="fas fa-pen-fancy"></i> Signatures</h3>
      <div class="signing-toggle">
        <div class="signing-option active" data-method="in_person" onclick="selectSigningMethod(this, 'in_person')">
          <i class="fas fa-pen"></i><span>Sign In Person</span>
        </div>
        <div class="signing-option" data-method="adobe_sign" onclick="selectSigningMethod(this, 'adobe_sign')">
          <i class="fas fa-envelope"></i><span>Send via Adobe Sign</span>
        </div>
      </div>
      <div id="in-person-signing">
        <div class="signature-container">
          <div class="sig-pad-wrapper">
            <h4>Tenant Acknowledgement</h4>
            <canvas id="tenant-sig-canvas"></canvas>
            <div class="sig-actions"><button class="btn btn-sm btn-outline" onclick="clearSignature('tenant')">Clear</button></div>
          </div>
          <div class="sig-pad-wrapper">
            <h4>CARE Agent</h4>
            <canvas id="agent-sig-canvas"></canvas>
            <div class="sig-actions"><button class="btn btn-sm btn-outline" onclick="clearSignature('agent')">Clear</button></div>
            <div class="form-group" style="margin-top:8px;">
              <label>Agent Name</label>
              <input type="text" id="co-agent-name" value="Uzair Ali">
            </div>
          </div>
        </div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:20px;">
      <button class="btn btn-outline btn-lg" onclick="saveDraft('check_out', ${formId}, ${booking.id})"><i class="fas fa-save"></i> Save Draft</button>
      <button class="btn btn-secondary btn-lg" onclick="completeForm('check_out', ${formId}, ${booking.id})"><i class="fas fa-check-circle"></i> Complete Check-Out & Generate PDF</button>
    </div>
  `;

  initSignaturePads();
  initUploadZone('co-upload-zone', 'co-file-input');
}

// ============= SIGNATURES =============
function initSignaturePads() {
  const tCanvas = document.getElementById('tenant-sig-canvas');
  const aCanvas = document.getElementById('agent-sig-canvas');

  if (tCanvas) {
    resizeCanvas(tCanvas);
    tenantSigPad = new SignaturePad(tCanvas, { backgroundColor: 'rgb(255,255,255)', penColor: 'rgb(0,0,0)' });
  }
  if (aCanvas) {
    resizeCanvas(aCanvas);
    agentSigPad = new SignaturePad(aCanvas, { backgroundColor: 'rgb(255,255,255)', penColor: 'rgb(0,0,139)' });
  }
}

function resizeCanvas(canvas) {
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = 150 * ratio;
  canvas.style.height = '150px';
  canvas.getContext('2d').scale(ratio, ratio);
}

function clearSignature(type) {
  if (type === 'tenant' && tenantSigPad) tenantSigPad.clear();
  if (type === 'agent' && agentSigPad) agentSigPad.clear();
}

function selectSigningMethod(el, method) {
  document.querySelectorAll('.signing-option').forEach(o => o.classList.remove('active'));
  el.classList.add('active');
  const inPerson = document.getElementById('in-person-signing');
  if (inPerson) inPerson.style.display = method === 'in_person' ? 'block' : 'none';
}

// ============= FILE UPLOAD =============
function initUploadZone(zoneId, inputId) {
  const zone = document.getElementById(zoneId);
  if (!zone) return;

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const input = document.getElementById(inputId);
    if (e.dataTransfer.files.length > 0) {
      const formType = zoneId.startsWith('ci-') ? 'check_in' : 'check_out';
      handleFileSelect(e.dataTransfer.files, currentFormId, currentBookingId, formType);
    }
  });
}

async function handleFileSelect(files, formId, bookingId, category) {
  if (!files || files.length === 0) return;

  const formData = new FormData();
  const notes = [];

  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
    const note = prompt(`Note for "${files[i].name}" (optional):`, '');
    notes.push(note || '');
  }

  formData.append('form_id', formId);
  formData.append('booking_id', bookingId);
  formData.append('category', category);
  formData.append('notes', JSON.stringify(notes));
  formData.append('uploaded_by', 'Uzair');

  try {
    showToast('Uploading files...', 'info');
    const res = await fetch('/api/evidence/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.uploaded > 0) {
      showToast(`${data.uploaded} file(s) uploaded successfully`, 'success');
      refreshEvidencePreview(formId, category);
    } else {
      showToast('Upload failed', 'error');
    }
  } catch (err) {
    showToast(`Upload error: ${err.message}`, 'error');
  }
}

async function refreshEvidencePreview(formId, category) {
  const prefix = category === 'check_in' ? 'ci' : 'co';
  const container = document.getElementById(`${prefix}-evidence-preview`);
  if (!container) return;

  try {
    const res = await fetch(`/api/forms/${formId}`);
    const data = await res.json();

    container.innerHTML = (data.evidence || []).map(e => `
      <div class="evidence-item">
        ${e.file_type === 'image' ? `<img src="/api/evidence/${e.id}/thumb" alt="${e.original_filename}">` : `<div style="height:120px;display:flex;align-items:center;justify-content:center;background:#f7fafc;"><i class="fas fa-file-pdf" style="font-size:32px;color:#e74c3c;"></i></div>`}
        <div class="ei-info">
          <div class="ei-name">${e.original_filename}</div>
          ${e.note ? `<div class="ei-note">${e.note}</div>` : ''}
          <div class="ei-actions">
            <button class="btn btn-sm btn-danger" onclick="deleteEvidence(${e.id}); this.closest('.evidence-item').remove();"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) { console.error(err); }
}

// ============= FORM SUBMISSION =============
function getInventoryData(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return [];
  const rows = table.querySelectorAll('tbody tr');
  const items = [];
  rows.forEach(row => {
    const name = row.querySelector('td')?.textContent?.trim() || '';
    if (tableId === 'ci-inventory-table') {
      items.push({
        name,
        in: row.querySelector('.inv-in')?.checked || false,
        out: row.querySelector('.inv-out')?.checked || false,
        signed_for: row.querySelector('.inv-signed')?.value || '',
        comments: row.querySelector('.inv-comments')?.value || ''
      });
    } else {
      items.push({
        name,
        present: row.querySelector('.inv-present')?.checked || false,
        condition: row.querySelector('.inv-condition')?.value || '',
        comments: row.querySelector('.inv-co-comments')?.value || ''
      });
    }
  });
  return items;
}

function getFormData(type) {
  if (type === 'check_in') {
    return {
      // Page 1 fields
      housing_officer: document.getElementById('ci-housing-officer')?.value || '',
      unit_number: document.getElementById('ci-unit-number')?.value || '',
      nok_name: document.getElementById('ci-nok-name')?.value || '',
      nok_number: document.getElementById('ci-nok-number')?.value || '',
      checkin_date: document.getElementById('ci-checkin-date')?.value || '',
      checkin_time: document.getElementById('ci-checkin-time')?.value || '',
      accommodation_type: document.getElementById('ci-accommodation-type')?.value || '',
      nightly_rate: document.getElementById('ci-nightly-rate')?.value || '',
      pet_deposit: document.getElementById('ci-pet-deposit')?.value || '',
      condition_notes: document.getElementById('ci-condition-notes')?.value || '',
      inventory: getInventoryData('ci-inventory-table'),
      // Page 5 consent fields
      date_of_birth: document.getElementById('ci-date-of-birth')?.value || '',
      consent_agreed: document.getElementById('ci-consent-agreed')?.value === 'yes',
      excluded_agencies: document.getElementById('ci-excluded-agencies')?.value || ''
    };
  } else {
    return {
      checkout_date: document.getElementById('co-checkout-date')?.value || '',
      checkout_time: document.getElementById('co-checkout-time')?.value || '',
      overall_condition: document.getElementById('co-overall-condition')?.value,
      cleaning_status: document.getElementById('co-cleaning-status')?.value,
      overall_notes: document.getElementById('co-overall-notes')?.value,
      cleaning_notes: document.getElementById('co-cleaning-notes')?.value,
      damages_found: document.getElementById('co-damages-found')?.value,
      damages_description: document.getElementById('co-damages-desc')?.value,
      keys_returned: document.getElementById('co-keys-returned')?.value,
      fobs_returned: document.getElementById('co-fobs-returned')?.value,
      keys_notes: document.getElementById('co-keys-notes')?.value,
      meter_electric: document.getElementById('co-meter-electric')?.value,
      meter_gas: document.getElementById('co-meter-gas')?.value,
      meter_water: document.getElementById('co-meter-water')?.value,
      additional_notes: document.getElementById('co-additional-notes')?.value,
      inventory_checkout: getInventoryData('co-inventory-table')
    };
  }
}

async function saveDraft(type, formId, bookingId) {
  try {
    const formData = getFormData(type);
    await fetch(`/api/forms/${formId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ form_data: formData, status: 'draft' })
    });
    showToast('Draft saved', 'success');
  } catch (err) {
    showToast(`Save error: ${err.message}`, 'error');
  }
}

async function completeForm(type, formId, bookingId) {
  try {
    const formData = getFormData(type);
    const agentNameEl = document.getElementById(type === 'check_in' ? 'ci-agent-name' : 'co-agent-name');

    const updateData = {
      form_data: formData,
      status: 'signed',
      signing_method: document.querySelector('.signing-option.active')?.dataset.method || 'in_person',
      agent_name: agentNameEl?.value || 'Uzair Ali'
    };

    // Get signatures
    if (tenantSigPad && !tenantSigPad.isEmpty()) {
      updateData.tenant_signature = tenantSigPad.toDataURL();
    }
    if (agentSigPad && !agentSigPad.isEmpty()) {
      updateData.agent_signature = agentSigPad.toDataURL();
    }

    showToast('Saving form and generating PDF...', 'info');

    // Save form
    await fetch(`/api/forms/${formId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData)
    });

    // Generate PDF
    const pdfRes = await fetch(`/api/pdf/generate/${formId}`, { method: 'POST' });
    const pdfData = await pdfRes.json();

    if (pdfData.success) {
      showToast('PDF generated successfully!', 'success');
      setTimeout(() => {
        viewBooking(bookingId);
        window.open(`/api/pdf/download/${formId}`, '_blank');
      }, 1000);
    } else {
      showToast(`PDF generation failed: ${pdfData.error}`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function resumeForm(formId, type) {
  if (type === 'check_in') {
    currentFormId = formId;
    const bRes = await fetch(`/api/bookings/${currentBookingId}`);
    const bData = await bRes.json();
    showPage('checkin-form');
    renderCheckInForm(bData.booking, formId);
  } else {
    currentFormId = formId;
    const bRes = await fetch(`/api/bookings/${currentBookingId}`);
    const bData = await bRes.json();
    showPage('checkout-form');
    renderCheckOutForm(bData.booking, formId);
  }
}

// ============= ACTIONS =============
async function createBooking(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (result.id) {
      showToast('Booking created successfully', 'success');
      form.reset();
      showPage('bookings');
      loadBookings();
    } else {
      showToast(`Error: ${result.error}`, 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function editBooking(id) {
  // Open modal with edit form
  const res = await fetch(`/api/bookings/${id}`);
  const data = await res.json();
  const b = data.booking;

  document.getElementById('modal-title').textContent = 'Edit Booking';
  document.getElementById('modal-body').innerHTML = `
    <form onsubmit="submitEditBooking(event, ${id})">
      <div class="form-grid">
        <div class="form-group"><label>First Name</label><input type="text" name="tenant_first_name" value="${b.tenant_first_name}"></div>
        <div class="form-group"><label>Last Name</label><input type="text" name="tenant_last_name" value="${b.tenant_last_name}"></div>
        <div class="form-group"><label>Email</label><input type="email" name="tenant_email" value="${b.tenant_email || ''}"></div>
        <div class="form-group"><label>Phone</label><input type="text" name="tenant_phone" value="${b.tenant_phone || ''}"></div>
        <div class="form-group full-width"><label>Property Address</label><input type="text" name="property_address" value="${b.property_address || ''}"></div>
        <div class="form-group"><label>Council</label><input type="text" name="council_name" value="${b.council_name || ''}"></div>
        <div class="form-group"><label>Reference</label><input type="text" name="reference_number" value="${b.reference_number || ''}"></div>
        <div class="form-group"><label>Start Date</label><input type="date" name="placement_start" value="${b.placement_start || ''}"></div>
        <div class="form-group"><label>Status</label>
          <select name="status">
            <option value="active" ${b.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="checked_in" ${b.status === 'checked_in' ? 'selected' : ''}>Checked In</option>
            <option value="checked_out" ${b.status === 'checked_out' ? 'selected' : ''}>Checked Out</option>
            <option value="completed" ${b.status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="cancelled" ${b.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </div>
      </div>
      <div class="form-actions"><button type="submit" class="btn btn-primary">Save Changes</button></div>
    </form>
  `;
  openModal();
}

async function submitEditBooking(event, id) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  try {
    await fetch(`/api/bookings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    closeModal();
    showToast('Booking updated', 'success');
    viewBooking(id);
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function syncCRM() {
  showToast('Syncing from CRM...', 'info');
  try {
    const res = await fetch('/api/crm/sync', { method: 'POST' });
    const data = await res.json();
    showToast(`CRM sync: ${data.synced || 0} records synced`, 'success');
    if (document.getElementById('sync-result')) {
      document.getElementById('sync-result').innerHTML = `<div class="form-card" style="margin-top:12px;background:#f0fff4;"><p>Synced ${data.synced || 0} records. Errors: ${data.errors || 0}</p></div>`;
    }
    loadBookings();
  } catch (err) {
    showToast(`CRM sync error: ${err.message}`, 'error');
  }
}

function downloadPDF(formId) {
  window.open(`/api/pdf/download/${formId}`, '_blank');
}

async function deleteEvidence(id, bookingId) {
  if (!confirm('Delete this evidence file?')) return;
  try {
    await fetch(`/api/evidence/${id}`, { method: 'DELETE' });
    showToast('Evidence deleted', 'success');
    if (bookingId) viewBooking(bookingId);
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

function previewEvidence(id) {
  document.getElementById('modal-title').textContent = 'Evidence Preview';
  document.getElementById('modal-body').innerHTML = `<img src="/api/evidence/${id}/file" style="max-width:100%;border-radius:8px;">`;
  openModal();
}

// ============= UTILITIES =============
function formatStatus(status) {
  const map = { active: 'Active', checked_in: 'Checked In', checked_out: 'Checked Out', completed: 'Completed', cancelled: 'Cancelled' };
  return map[status] || status;
}

function debounce(fn, delay) {
  let timer;
  return function (...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), delay); };
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function openModal() { document.getElementById('modal-overlay').classList.add('active'); }
function closeModal() { document.getElementById('modal-overlay').classList.remove('active'); }

// ============= INIT =============
loadBookings();
