const fs = require('fs');
const path = require('path');
const logger = require('./logger');

function fmt(dateStr) {
  if (!dateStr) return '';
  try { const d = new Date(dateStr); if (isNaN(d)) return dateStr; return d.toLocaleDateString('en-GB'); } catch { return dateStr; }
}
function fmtTime(dateStr) {
  if (!dateStr) return '';
  try { const d = new Date(dateStr); if (isNaN(d)) return dateStr; return d.toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'}); } catch { return dateStr; }
}
function fmtDT(dateStr) {
  if (!dateStr) return new Date().toLocaleString('en-GB');
  try { const d = new Date(dateStr); if (isNaN(d)) return dateStr; return d.toLocaleString('en-GB'); } catch { return dateStr; }
}
function img64(filePath) {
  try { if (!filePath || !fs.existsSync(filePath)) return null; const d = fs.readFileSync(filePath); const m = path.extname(filePath).toLowerCase()==='.png'?'image/png':'image/jpeg'; return `data:${m};base64,${d.toString('base64')}`; } catch { return null; }
}

// Helper: render signature based on signing method
function renderSig(form, fd, type) {
  const sm = (fd && fd.signing_method) || 'in_person';
  if (type === 'tenant') {
    if (sm === 'pending_digital') return '<span style="color:#e74c3c;font-style:italic;font-size:10px;">Pending - to be sent via Adobe Sign</span>';
    if (sm === 'on_behalf') return '<span style="font-style:italic;font-size:10px;">Signed on behalf by CARE agent</span>';
    if (form.tenant_signature) return '<img src="' + form.tenant_signature + '">';
    return '';
  }
  return form.agent_signature ? '<img src="' + form.agent_signature + '">' : '';
}
function renderSigText(form, fd, type) {
  const sm = (fd && fd.signing_method) || 'in_person';
  if (type === 'tenant') {
    if (sm === 'pending_digital') return 'Pending - to be sent via Adobe Sign';
    if (sm === 'on_behalf') return 'Signed on behalf by CARE agent';
    if (form.tenant_signature) return '[Signed in person]';
    return '';
  }
  return form.agent_signature ? '[Signed]' : '';
}

const LOGO_SVG = `<svg viewBox="0 0 280 90" xmlns="http://www.w3.org/2000/svg" style="height:65px;">
  <text x="10" y="12" font-family="Arial Black,Arial" font-weight="900" font-size="11" fill="#4a4a4a">Creative Appeal Real Estate</text>
  <text x="10" y="62" font-family="Arial Black,Arial" font-weight="900" font-size="52">
    <tspan fill="#2d8f48">C</tspan><tspan fill="#2d8f48">A</tspan><tspan fill="#e74c3c" dx="-8">Ì</tspan><tspan fill="#2d8f48">R</tspan><tspan fill="#2d8f48">E</tspan>
  </text>
  <text x="10" y="78" font-family="Arial" font-weight="600" font-size="10">
    <tspan fill="#2d8f48">Housing the community </tspan><tspan fill="#e74c3c">with </tspan><tspan fill="#2d8f48">CARE</tspan>
  </text>
</svg>`;

const CARE_LOGO_HTML = `<div style="text-align:center;margin-bottom:16px;">
  <div style="font-size:10px;color:#555;font-weight:600;margin-bottom:2px;">Creative Appeal Real Estate</div>
  <div style="font-size:48px;font-weight:900;letter-spacing:3px;line-height:1;">
    <span style="color:#2d8f48;">C</span><span style="color:#e74c3c;">A</span><span style="color:#2d8f48;">R</span><span style="color:#2d8f48;">E</span>
  </div>
  <div style="font-size:9px;font-weight:600;margin-top:-2px;">
    <span style="color:#2d8f48;">Housing the community </span><span style="color:#e74c3c;">with </span><span style="color:#2d8f48;">CARE</span>
  </div>
</div>`;

const FOOTER_HTML = `<div style="border-top:2px solid #e74c3c;padding-top:6px;margin-top:20px;font-size:8px;color:#666;line-height:1.5;">
  0204 553 2233 | info@creativeappeal.co.uk | <strong>www.care-realestate.co.uk</strong><br>
  Registered office: Unit 13 First Quarter, Blenheim Road, Longmead Business Park, Epsom, KT19 9QN.<br>
  Registered in England & Wales: 13876960.
</div>`;

function baseStyles() {
  return `<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter','Segoe UI',Arial,sans-serif;font-size:11px;color:#222;line-height:1.45}
    .page{padding:28px 36px;max-width:800px;margin:0 auto;position:relative}
    @media print{
      .page{padding:20px 28px;page-break-after:always}
      .page:last-child{page-break-after:avoid}
      .no-print{display:none!important}
      body{font-size:10px}
    }
    .print-btn{position:fixed;top:16px;right:16px;padding:12px 24px;background:#e74c3c;color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,0.2)}
    .print-btn:hover{background:#c0392b}

    /* Check-in form page styles */
    .ci-header{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:12px}
    .ci-left{}, .ci-right{border:1px solid #ccc;border-radius:6px;padding:12px}
    .field-row{display:flex;align-items:baseline;margin:5px 0;font-size:10px}
    .field-label{font-weight:700;text-transform:uppercase;min-width:130px;font-size:9px;color:#333;letter-spacing:0.3px}
    .field-line{flex:1;border-bottom:1px solid #999;min-height:16px;padding:0 4px;font-size:11px;color:#111}
    .field-value{font-weight:400;color:#111}
    .ci-right h3{color:#2d8f48;font-size:12px;font-weight:700;margin-bottom:6px}
    .ci-right .red{color:#e74c3c}
    .checkbox-row{display:flex;gap:20px;margin:8px 0;font-size:10px;align-items:center}
    .checkbox{width:16px;height:16px;border:1.5px solid #333;display:inline-block;vertical-align:middle;margin-right:4px;text-align:center;font-size:10px;line-height:16px}
    .checkbox.checked{background:#2d8f48;color:white}

    .sig-row{display:flex;gap:24px;margin:16px 0}
    .sig-box{flex:1;text-align:center}
    .sig-box-label{font-size:9px;font-weight:700;text-transform:uppercase;color:#444;margin-bottom:4px}
    .sig-box-area{border:1.5px solid #999;border-radius:4px;height:65px;display:flex;align-items:center;justify-content:center;background:#fafafa}
    .sig-box-area img{max-height:55px;max-width:90%}

    /* Inventory table */
    .inv-table{width:100%;border-collapse:collapse;margin:10px 0;font-size:10px}
    .inv-table th{background:#2d8f48;color:white;padding:5px 8px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase}
    .inv-table td{padding:4px 8px;border-bottom:1px solid #ddd}
    .inv-table tr:nth-child(even) td{background:#f9f9f9}
    .inv-check{color:#e74c3c;font-weight:700;font-size:13px}

    /* Check-in documents */
    .docs-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;margin:8px 0;border:1px solid #ddd;border-radius:4px;overflow:hidden}
    .docs-left{border-right:1px solid #ddd}
    .docs-left .doc-header,.docs-right .doc-row-label{background:#2d8f48;color:white;padding:5px 8px;font-size:9px;font-weight:700;text-transform:uppercase}
    .docs-left .doc-row,.docs-right .doc-row{padding:4px 8px;border-bottom:1px solid #eee;font-size:10px;display:flex;align-items:center;gap:6px}
    .docs-right .doc-row{justify-content:space-between}
    .docs-right .doc-value{border-bottom:1px solid #999;min-width:120px;font-size:10px;padding:2px 4px}

    /* Welcome pack styles */
    .wp-title{text-align:center;font-size:22px;font-weight:800;margin:12px 0}
    .wp-title .green{color:#2d8f48}
    .agency-line{font-size:10px;margin-bottom:4px}
    .agency-line .red{color:#e74c3c;font-weight:600}
    .prop-line{margin:6px 0}
    .prop-line .red{color:#e74c3c;font-weight:600}
    .prop-line .line{border-bottom:1px solid #999;display:inline-block;min-width:250px;font-weight:400;color:#111}
    .contact-box{background:#f5f5f5;border:1px solid #ddd;border-radius:6px;padding:14px;margin:12px 0}
    .contact-box h2{text-align:center;font-size:16px;font-weight:700;margin-bottom:10px}
    .contact-box p{font-size:10px;margin-bottom:4px}
    .contact-box .red{color:#e74c3c;font-weight:700}
    .contact-box .green{color:#2d8f48;font-weight:700}

    .section-heading{font-size:12px;font-weight:700;margin:14px 0 6px}
    .body-text{font-size:10px;margin-bottom:6px;line-height:1.55;text-align:justify}
    .body-text .red{color:#e74c3c;font-weight:700}
    .body-text .bold{font-weight:700}
    .body-text .italic{font-style:italic}

    /* T&C styles */
    .tc-title{text-align:center;font-size:20px;font-weight:700;margin:12px 0}

    /* Declaration */
    .declaration{font-weight:700;margin:10px 0;font-size:11px}
    .declaration-text{font-size:10px;text-align:justify;margin-bottom:16px}

    /* Consent form */
    .consent-title{text-align:center;font-size:18px;font-weight:700;margin:12px 0}
    .consent-text{font-size:10px;line-height:1.55;margin-bottom:8px;text-align:justify}
    .consent-list{font-size:10px;margin:6px 0 6px 20px}
    .consent-list li{margin:3px 0}
    .agency-list{margin:4px 0 4px 30px;font-size:10px}
    .agency-list li{margin:2px 0}
    .tick-row{display:flex;align-items:flex-start;gap:8px;margin:12px 0;font-size:10px}
    .tick-box{width:18px;height:18px;border:1.5px solid #333;flex-shrink:0;text-align:center;font-size:12px;line-height:18px}

    /* Evidence section */
    .evidence-item{border:1px solid #ddd;border-radius:6px;padding:10px;background:#f9f9f9;page-break-inside:avoid;margin-bottom:10px}
    .evidence-item img{max-width:100%;max-height:250px;border-radius:4px;display:block;margin-bottom:6px;object-fit:contain}
    .evidence-meta{font-size:9px;color:#666}
    .evidence-meta .cat{font-weight:700;color:#e74c3c;text-transform:uppercase}
    .evidence-note{font-size:10px;color:#333;font-style:italic;margin-top:4px}
  </style>`;
}

// ===== PAGE 1: CHECK-IN FORM =====
function page1_checkinForm(booking, form, formData) {
  const invItems = formData.inventory || [
    {name:'Bed(s)',in:true},{name:'Cupboard(s)',in:true},{name:'Sofa',in:true},
    {name:'Table/chairs',in:true},{name:'W. machine',in:true},{name:'Fridge/ Freezer',in:true}
  ];

  return `<div class="page">
    ${CARE_LOGO_HTML}

    <div class="ci-header">
      <div class="ci-left">
        <div class="field-row"><span class="field-label">Council</span><span class="field-line">${booking.council_name||''}</span></div>
        <div class="field-row"><span class="field-label">Housing Officer</span><span class="field-line">${formData.housing_officer||''}</span></div>
        <div class="field-row"><span class="field-label">Placement Ref.</span><span class="field-line">${booking.reference_number||''}</span></div>
        <div class="field-row"><span class="field-label">Unit No.</span><span class="field-line">${formData.unit_number||''}</span></div>
        <div style="height:8px"></div>
        <div class="field-row"><span class="field-label">Placement Name</span><span class="field-line">${booking.tenant_first_name} ${booking.tenant_last_name}</span></div>
        <div class="field-row"><span class="field-label">Placement No.</span><span class="field-line">${booking.tenant_phone||''}</span></div>
        <div class="field-row"><span class="field-label">Placement Email</span><span class="field-line">${booking.tenant_email||''}</span></div>
        <div class="field-row"><span class="field-label">NOK Name</span><span class="field-line">${formData.nok_name||''}</span></div>
        <div class="field-row"><span class="field-label">NOK Number</span><span class="field-line">${formData.nok_number||''}</span></div>
        <div class="field-row"><span class="field-label">Check In Date</span><span class="field-line">${fmt(formData.checkin_date || form.created_at)}</span></div>
        <div class="field-row"><span class="field-label">Check In Time</span><span class="field-line">${formData.checkin_time || fmtTime(form.created_at)}</span></div>
      </div>
      <div class="ci-right">
        <h3>TEMPORARY ACCOMMODATION<br><span class="red">NIGHTLY RATE: ${formData.nightly_rate || booking.nightly_rate || ''}</span></h3>
        <div class="field-row" style="margin-top:8px"><span class="field-label" style="min-width:70px">ADDRESS</span><span class="field-line">${booking.property_address||''}</span></div>
        <div style="height:24px;border-bottom:1px solid #999;margin:4px 0"></div>
        <div style="height:24px;border-bottom:1px solid #999;margin:4px 0"></div>

        <div class="checkbox-row" style="margin-top:10px">
          <span>SINGLE <span class="checkbox${formData.accommodation_type==='single'?' checked':''}"></span></span>
          <span>COUPLE <span class="checkbox${formData.accommodation_type==='couple'?' checked':''}"></span></span>
          <span>FAMILY <span class="checkbox${formData.accommodation_type==='family'?' checked':''}"></span></span>
        </div>

        <div class="field-row" style="margin-top:6px"><span class="field-label" style="min-width:140px">PET DEPOSIT REQUIRED</span><span class="field-line">${formData.pet_deposit||''}</span></div>

        <div class="checkbox-row" style="margin-top:8px">
          <span style="font-weight:700;font-size:9px;letter-spacing:0.3px">PAYING BILLS?</span>
          <span style="font-weight:700;font-size:12px;${formData.paying_bills==='yes'?'border:2.5px solid #e74c3c;border-radius:50%;padding:1px 5px;':''}">YES</span>
          <span style="font-weight:700;font-size:12px;${formData.paying_bills==='no'?'border:2.5px solid #e74c3c;border-radius:50%;padding:1px 5px;':''}">NO</span>
        </div>

        <div class="field-row" style="margin-top:8px"><span class="field-label" style="min-width:50px">NOTES</span><span class="field-line">${formData.condition_notes||''}</span></div>
        <div style="height:18px;border-bottom:1px solid #999;margin:4px 0"></div>
        <div style="height:18px;border-bottom:1px solid #999;margin:4px 0"></div>
      </div>
    </div>

    <!-- Signatures -->
    <div class="sig-row">
      <div class="sig-box">
        <div class="sig-box-label">Placement Signature</div>
        <div class="sig-box-area">${renderSig(form, formData, "tenant")}</div>
      </div>
      <div class="sig-box">
        <div class="sig-box-label">CARE Agent Signature</div>
        <div class="sig-box-area">${renderSig(form, formData, "agent")}</div>
      </div>
    </div>

    <!-- Inventory Table -->
    <table class="inv-table">
      <tr><th>INVENTORY</th><th style="width:40px;text-align:center">IN</th><th style="width:40px;text-align:center">OUT</th><th>SIGNED FOR</th><th>COMMENTS</th></tr>
      ${invItems.map(item => `<tr>
        <td>${item.name||''}</td>
        <td style="text-align:center">${item.in?'<span class="inv-check">&#10003;</span>':''}</td>
        <td style="text-align:center">${item.out?'<span class="inv-check">&#10003;</span>':''}</td>
        <td>${item.signed_for||''}</td>
        <td>${item.comments||''}</td>
      </tr>`).join('')}
    </table>

    <!-- Check In Documents + Check Out -->
    <div class="docs-grid">
      <div class="docs-left">
        <div class="doc-header">CHECK IN DOCUMENTS</div>
        <div class="doc-row"><span class="inv-check">&#10003;</span> Check In Form</div>
        <div class="doc-row"><span class="inv-check">&#10003;</span> Welcome Pack - T&Cs</div>
        <div class="doc-row"><span class="inv-check">&#10003;</span> Information Consent Form</div>
      </div>
      <div class="docs-right">
        <div class="doc-row" style="justify-content:flex-start;gap:12px"><span style="font-size:9px;font-weight:600;min-width:110px">Check out Date/ Time</span><span class="doc-value">${formData.checkout_date||''}</span></div>
        <div class="doc-row" style="justify-content:flex-start;gap:12px"><span style="font-size:9px;font-weight:600;min-width:110px">Signed by Placement</span><span class="doc-value">${formData.checkout_signed_placement||''}</span></div>
        <div class="doc-row" style="justify-content:flex-start;gap:12px"><span style="font-size:9px;font-weight:600;min-width:110px">CARE Management</span><span class="doc-value">${formData.checkout_care_mgmt||''}</span></div>
      </div>
    </div>

    <div style="margin-top:10px;font-size:9px;color:#666;text-align:center">For any questions or concerns, please call us on our office number: 0204 553 2233</div>
  </div>`;
}

// ===== PAGE 2: WELCOME PACK =====
function page2_welcomePack(booking, form, formData) {
  return `<div class="page">
    ${CARE_LOGO_HTML}

    <div class="wp-title">PLACEMENT <span class="green">WELCOME PACK</span></div>

    <div class="agency-line"><span class="red">Agency:</span> CARE Real Estate, Unit 13 First Quarter, Blenheim Road, Longmead Business Park, Epsom, KT19 9QN.</div>
    <div class="prop-line"><span class="red">Property Address:</span> <span class="line">${booking.property_address||''}</span></div>
    <div class="prop-line"><span class="red">Placement Start Date:</span> <span class="line">${fmt(booking.placement_start)}</span></div>

    <div class="contact-box">
      <h2>CONTACT INFORMATION</h2>
      <p><strong>Office/ WhatsApp number:</strong> 0204 553 2233 | Option 1 (General Enquiries) or Option 2 (Maintenance) OR the Property Managers on ext. 214</p>
      <p><strong>Office opening hours:</strong> Mon – Friday 9am-6pm | Saturday 10am-3pm | Sunday CLOSED</p>
      <p><strong>Out of Hours – 24hr (Emergency only):</strong> <span class="green">WhatsApp - 0204 553 2233</span> OR <span class="red">Call 0204 553 2233 (press Option 1)</span></p>
    </div>

    <div class="section-heading">Property Maintenance and Repairs:</div>
    <p class="body-text">Any maintenance or repairs issues can be reported <span class="bold">by email</span> to <span class="bold italic">info@creativeappeal.co.uk</span> stating your property address in the subject of the email. Alternatively, you can contact <span class="red">0204 553 2233</span> and select <span class="red">Option 2</span> for the Maintenance team. Repairs are dealt with on a priority basis, however, we will endeavour to deal with your problem within 72hrs. Should there be an emergency out of hours, you can call the office line on <span class="red">0204 553 2233</span> and select <span class="red">Option 1</span>, and we will attend to the problem as soon as we can.</p>

    <div class="section-heading">Gas Leaks:</div>
    <p class="body-text">If you smell a Gas leak, contact <span class="bold italic">National Grid</span> immediately on <span class="red">0800 111 999</span> to report it. Please refrain from using any electrical appliances in the meantime, and do not try to operate a gas cooker, or smoke near the outside of the property.</p>

    <div class="section-heading">Fire Exits:</div>
    <p class="body-text">If you are in a ground or first floor flat, then your fire exit points are the same as your entrance located on ground floor. In case of fire please dial <span class="red">999</span> and contact Emergency Services. If you are in a house, then your fire exit points are the same as your entrance and the back door leading to your garden and ground floor windows if reachable. In case of fire please dial 999 and contact Emergency Services.</p>

    <div class="section-heading">Bills:</div>
    <p class="body-text">Are the bills paid by the placement?<br>
      <span style="font-weight:700;font-size:13px;${formData.paying_bills==='yes'?'border:3px solid #e74c3c;border-radius:50%;padding:2px 6px;':''}">YES</span>
      &nbsp;/&nbsp;
      <span style="font-weight:700;font-size:13px;${formData.paying_bills==='no'?'border:3px solid #e74c3c;border-radius:50%;padding:2px 6px;':''}">NO</span>
    </p>
    <p class="body-text"><span class="bold italic">If you are responsible</span> for the bills, upon moving in our Utilities Manager will contact you to discuss how to move them into your name. Please do not do this until our team have spoken to you, to ensure a smooth process.</p>
    <p class="body-text">If your meters are <span class="bold italic">pre-pay</span>, the top up cards are provided to you and the <span class="bold italic">responsibility of topping them up is yours.</span></p>

    ${FOOTER_HTML}
  </div>`;
}

// ===== PAGE 3: TERMS & CONDITIONS =====
function page3_termsAndConditions() {
  return `<div class="page">
    ${CARE_LOGO_HTML}
    <div class="tc-title">TERMS & CONDITIONS</div>
    <p class="body-text"><strong><em>By accepting this property from CARE via the Council, you have agreed to abide by the T&Cs.</em></strong></p>

    <div class="section-heading">Car Parks:</div>
    <p class="body-text">You are NOT permitted to use the car parks of any building unless authorised.<br>No kids can play in the car park.<br>No loitering / standing / sitting in the car park.<br>No smoking / drinking in the car park unless in authorised areas.<br>No littering in the car park.</p>

    <div class="section-heading">Rubbish Disposal:</div>
    <p class="body-text">There are bins provided which must be used to dispose of rubbish. Rubbish bags must be placed inside the bin and not left next to, or on the floor. Any belongings left around communal areas or bins will be removed and disposed of without warning.</p>

    <div class="section-heading">Drugs and Illegal Substances:</div>
    <p class="body-text">You are NOT allowed to use any drugs or illegal substances within the residence, around communal areas or around the building. Smoking and vaping are ONLY permitted outdoors, in a considerate manner, and any litter must be disposed of correctly, NOT on the ground. If any evidence of smoking indoors, or drugs/ illegal substances are found, they will be reported to the council and may result in the loss of the accommodation.</p>

    <div class="section-heading">Visitors:</div>
    <p class="body-text">Visitors are permitted however NO visitor can reside at the property overnight unless authorised by the council. All placements are responsible for the behaviour of visitors who are bound by the same T&Cs as those residing in the property. Visitors must leave the property by 10pm. Security will remove individuals from the property if they refuse to leave after 10pm.</p>

    <div class="section-heading">Visits/Inspections:</div>
    <p class="body-text">CARE Real Estate and the Council carry out regular inspections of all our properties and retain the right of unconditional and immediate access to all rooms. If the Council considers that the accommodation is not being used as your main and principal home, the Council will arrange for the cancellation of the accommodation. If CARE Real Estate or the council believe there is serious breach of the regulations set out, they reserve the right to cancel the placement with immediate effect.</p>

    <div class="section-heading">Noise:</div>
    <p class="body-text">Noise must be kept to a minimum. You are NOT allowed to have loud music playing in your unit which may disturb other tenants or the commercial occupiers. You are NOT allowed to shout, sing, use loud machinery tools or cause any disturbances to other tenants. We will issue a warning for any first time anti-social behaviour. If this persists, it will be reported to the council and may result in the loss of the accommodation.</p>

    <div class="section-heading">Keys/Fobs:</div>
    <p class="body-text">It is the placement's responsibility to return the keys back upon leaving the accommodation. Don't forget your keys! In the event of a lockout, a call out fee will be chargeable.</p>

    ${FOOTER_HTML}
  </div>`;
}

// ===== PAGE 4: MORE T&Cs + DECLARATION =====
function page4_declarationAndSignatures(booking, form, formData) {
  return `<div class="page">
    ${CARE_LOGO_HTML}

    <div class="section-heading">Hazardous Items:</div>
    <p class="body-text">Placements or visitors must not have in their possession, in or around the premises, any explosives (including fireworks) or flammable materials, firearms, air guns or any other type of gun, any offensive weapon (or any item which could be used as, or perceived to be an offensive weapon) even if they hold an applicable license. Placements must not keep or possess any item which is, or is likely to become, hazardous to the health and safety of themselves or others. Placements should be aware that any items left in the property will be disposed of by CARE Real Estate unless prior arrangements have been made.</p>

    <div class="section-heading">Damage:</div>
    <p class="body-text">Placements should be aware that they may be charged for any criminal damage not related to wear and tear.</p>

    <div class="section-heading">Pets:</div>
    <p class="body-text">Placements or visitors are not allowed to keep or bring animals or pets in the property or the car park, unless prior permission is granted. These must be approved and registered by CARE Real Estate in advanced. In such cases where this doesn't happen, CARE Real Estate have the right to terminate an individual's placement.</p>

    <div class="section-heading">Check-in / Check-out Expectations:</div>
    <p class="body-text">Properties must be returned in the same condition as at check-in, with all rubbish and personal belongings fully removed. Items must not be left in communal areas, nearby bins, and should be disposed of off-site. Any costs incurred by CARE Real Estate for the removal of belongings, additional cleaning, or waste disposal will be charged to the placement accordingly.</p>

    <div class="declaration" style="margin-top:16px">PLACEMENT DECLARATION:</div>
    <p class="declaration-text">I agree to abide by the T&Cs set out above, and I understand that any breach of these T&Cs will be reported to my council housing officer, and may result in loss of placement.</p>

    <div class="sig-row" style="margin-top:20px">
      <div class="sig-box">
        <div class="sig-box-area" style="height:75px">${renderSig(form, formData, "tenant")}</div>
        <div style="font-size:9px;font-weight:600;margin-top:6px">SIGNED PLACEMENT</div>
      </div>
      <div style="flex:0.3"></div>
      <div class="sig-box">
        <div class="sig-box-area" style="height:75px">${renderSig(form, formData, "agent")}</div>
        <div style="font-size:9px;font-weight:600;margin-top:6px">SIGNED - CARE AGENT</div>
      </div>
    </div>

    <div style="text-align:center;margin-top:30px">
      <p style="font-size:10px;font-style:italic">Please refer to the contact details provided if you need anything.</p>
      <p style="font-size:13px;font-weight:800;margin-top:6px">CARE REAL ESTATE LIMITED</p>
    </div>

    ${FOOTER_HTML}
  </div>`;
}

// ===== PAGE 5: INFORMATION SHARING CONSENT FORM =====
function page5_consentForm(booking, form, formData) {
  return `<div class="page">
    ${CARE_LOGO_HTML}
    <div class="consent-title">INFORMATION SHARING CONSENT FORM</div>

    <p class="consent-text">I <span style="border-bottom:1px solid #999;min-width:150px;display:inline-block;padding:0 8px">${booking.tenant_first_name} ${booking.tenant_last_name}</span> hereby give my permission for <strong>CARE Real Estate</strong> to share personal information with other service providers in connection with my care, including accessing and sharing my medical, and if applicable, mental health and police records. I understand that <strong>CARE Real Estate</strong> may hold information gathered about me from the various agencies and as such my rights under the Data Protection Act will not be affected.</p>

    <div class="section-heading" style="font-size:11px">Statement of Consent</div>
    <ul class="consent-list">
      <li>I understand that personal information is held about me.</li>
      <li>I have had the opportunity to discuss the implications of sharing or not sharing information about me.</li>
      <li><strong>I agree that personal information about me may be shared and gathered from the following agencies:</strong></li>
    </ul>

    <ul class="agency-list" style="list-style:none">
      <li>&bull; NHS and other Health Services, including my GP practice</li>
      <li>&bull; Early Intervention Service including the police</li>
      <li>&bull; Adult Services</li>
      <li>&bull; Mental Health Services</li>
      <li>&bull; Education Support Services</li>
      <li>&bull; Social Care</li>
      <li>&bull; Voluntary Sector Organisations</li>
      <li>&bull; Security Team</li>
      <li>&bull; Local Authorities</li>
    </ul>

    <p class="consent-text">Are there any agencies you do not want us to share or gather additional information with? Please list them here:</p>
    <div style="border-bottom:1px solid #333;height:20px;margin:8px 0"></div>
    <div style="border-bottom:1px solid #333;height:20px;margin:8px 0"></div>

    <div class="tick-row" style="margin-top:14px">
      <div class="tick-box">${formData.consent_agreed?'&#10003;':''}</div>
      <span>Tick here &nbsp;<strong><em>I agree to my information being shared and gathered between services.</em></strong></span>
    </div>

    <p class="consent-text" style="margin-top:10px"><strong><em>Your consent to share personal information is entirely voluntary and you may withdraw your consent at any time.</em></strong> Should you have any questions about this process, or wish to withdraw your consent please contact: <span class="red">0204 553 2233</span></p>

    <div style="margin-top:14px">
      <div class="field-row"><span class="field-label">Placement Name</span><span class="field-line">${booking.tenant_first_name} ${booking.tenant_last_name}</span></div>
      <div class="field-row"><span class="field-label">Date of Birth</span><span class="field-line">${fmt(formData.date_of_birth)}</span></div>
      <div class="field-row"><span class="field-label">Signature</span><span class="field-line">${renderSigText(form, formData, "tenant")}</span></div>
      <div class="field-row"><span class="field-label">Date</span><span class="field-line">${fmt(form.signed_at || form.created_at)}</span></div>
      <div style="height:10px"></div>
      <div class="field-row"><span class="field-label">Signature of CARE Agent</span><span class="field-line">${renderSigText(form, formData, "agent")}</span></div>
    </div>

    <div style="margin-top:24px;display:flex;justify-content:space-between;align-items:flex-end;font-size:8px;color:#666;border-top:1px solid #ddd;padding-top:8px">
      <div><span style="color:#e74c3c;font-size:12px">&#9679;</span> Unit 13 First Quarter - Longmead Business Park,<br>Blenheim Road, Epsom, KT19 9QN</div>
      <div style="text-align:right">&bull; info@creativeappeal.co.uk &nbsp; &bull; 020 4553 2233<br><strong>www.care-realestate.co.uk</strong></div>
    </div>
  </div>`;
}

// ===== EVIDENCE APPENDIX =====
function pageEvidence(booking, form, evidence) {
  if (!evidence || evidence.length === 0) return '';
  return `<div class="page">
    ${CARE_LOGO_HTML}
    <div style="font-size:16px;font-weight:700;margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid #e74c3c">Evidence & Notes</div>
    <p style="font-size:10px;color:#666;margin-bottom:12px">${form.type==='check_in'?'Check-In':'Check-Out'} Evidence — ${booking.tenant_first_name} ${booking.tenant_last_name} — ${booking.property_address||''}</p>
    ${evidence.map(e => {
      const b64 = e.file_type === 'image' ? img64(e.file_path) : null;
      return `<div class="evidence-item">
        ${b64?`<img src="${b64}">`:`<p style="padding:20px;text-align:center;background:#eee;border-radius:4px">[Document: ${e.original_filename}]</p>`}
        <div class="evidence-meta"><span class="cat">${(e.category||'').replace('_','-')}</span> — ${e.original_filename} — ${fmtDT(e.uploaded_at)} — By: ${e.uploaded_by}</div>
        ${e.note?`<div class="evidence-note">"${e.note}"</div>`:''}
      </div>`;
    }).join('')}
  </div>`;
}

// ===== CHECK-OUT REPORT =====
function buildCheckOutHTML(booking, form, evidence) {
  const fd = JSON.parse(form.form_data || '{}');
  const cb = v => { if(!v)return''; const l=v.toLowerCase(); if(['excellent','good','clean'].includes(l))return'background:#c6f6d5;color:#276749'; if(['fair','acceptable','needs cleaning'].includes(l))return'background:#fefcbf;color:#975a16'; return'background:#fed7d7;color:#9b2c2c'; };

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>CARE Check-Out - ${booking.tenant_first_name} ${booking.tenant_last_name}</title>${baseStyles()}</head><body>
    <button class="print-btn no-print" onclick="window.print()">&#11015; Print / Save as PDF</button>

    <div class="page">
      ${CARE_LOGO_HTML}
      <div style="font-size:20px;font-weight:800;text-align:center;margin:8px 0">CHECK-OUT REPORT</div>

      <div class="ci-header">
        <div class="ci-left">
          <div class="field-row"><span class="field-label">Council</span><span class="field-line">${booking.council_name||''}</span></div>
          <div class="field-row"><span class="field-label">Property</span><span class="field-line">${booking.property_address||''}</span></div>
          <div class="field-row"><span class="field-label">Tenant</span><span class="field-line">${booking.tenant_first_name} ${booking.tenant_last_name}</span></div>
          <div class="field-row"><span class="field-label">Reference</span><span class="field-line">${booking.reference_number||''}</span></div>
          <div class="field-row"><span class="field-label">Check-Out Date</span><span class="field-line">${fmt(form.created_at)}</span></div>
        </div>
        <div class="ci-right">
          <h3 style="font-size:11px">CONDITION SUMMARY</h3>
          <div class="field-row"><span class="field-label" style="min-width:80px">Overall</span><span style="padding:2px 8px;border-radius:10px;font-size:9px;font-weight:600;${cb(fd.overall_condition)}">${fd.overall_condition||'N/A'}</span></div>
          <div class="field-row"><span class="field-label" style="min-width:80px">Cleaning</span><span style="padding:2px 8px;border-radius:10px;font-size:9px;font-weight:600;${cb(fd.cleaning_status)}">${fd.cleaning_status||'N/A'}</span></div>
          <div class="field-row"><span class="field-label" style="min-width:80px">Damages</span><span style="font-weight:600">${fd.damages_found==='yes'?'Yes — See notes':'No'}</span></div>
        </div>
      </div>

      <table class="inv-table">
        <tr><th>Assessment</th><th>Status</th><th>Notes</th></tr>
        <tr><td>Overall Condition</td><td><span style="padding:2px 8px;border-radius:10px;font-size:9px;font-weight:600;${cb(fd.overall_condition)}">${fd.overall_condition||'N/A'}</span></td><td>${fd.overall_notes||''}</td></tr>
        <tr><td>Cleaning Status</td><td><span style="padding:2px 8px;border-radius:10px;font-size:9px;font-weight:600;${cb(fd.cleaning_status)}">${fd.cleaning_status||'N/A'}</span></td><td>${fd.cleaning_notes||''}</td></tr>
        <tr><td>Damages</td><td>${fd.damages_found==='yes'?'<span style="color:#e74c3c;font-weight:700">Yes</span>':'No'}</td><td>${fd.damages_description||''}</td></tr>
        <tr><td>Keys Returned</td><td>${fd.keys_returned||'N/A'}</td><td>${fd.keys_notes||''}</td></tr>
        <tr><td>Fobs Returned</td><td>${fd.fobs_returned||'0'}</td><td></td></tr>
      </table>

      ${fd.additional_notes?`<div class="section-heading">Additional Notes</div><p class="body-text">${fd.additional_notes}</p>`:''}

      <div class="sig-row" style="margin-top:16px">
        <div class="sig-box"><div class="sig-box-label">Tenant Acknowledgement</div><div class="sig-box-area">${renderSig(form, formData, "tenant")}</div><div style="font-size:8px;color:#666;margin-top:4px">${booking.tenant_first_name} ${booking.tenant_last_name}</div></div>
        <div class="sig-box"><div class="sig-box-label">CARE Agent</div><div class="sig-box-area">${renderSig(form, formData, "agent")}</div><div style="font-size:8px;color:#666;margin-top:4px">${form.agent_name||'CARE Real Estate'}</div></div>
      </div>
      ${FOOTER_HTML}
    </div>

    ${pageEvidence(booking, form, evidence)}
  </body></html>`;
}

// ===== MAIN CHECK-IN BUILDER =====
function buildCheckInHTML(booking, form, evidence) {
  const fd = JSON.parse(form.form_data || '{}');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>CARE Check-In Pack - ${booking.tenant_first_name} ${booking.tenant_last_name}</title>${baseStyles()}</head><body>
    <button class="print-btn no-print" onclick="window.print()">&#11015; Print / Save as PDF</button>
    ${page1_checkinForm(booking, form, fd)}
    ${page2_welcomePack(booking, form, fd)}
    ${page3_termsAndConditions()}
    ${page4_declarationAndSignatures(booking, form, fd)}
    ${page5_consentForm(booking, form, fd)}
    ${pageEvidence(booking, form, evidence)}
  </body></html>`;
}

async function generateCheckInPDF(booking, form, evidence, outputPath) {
  const html = buildCheckInHTML(booking, form, evidence);
  fs.writeFileSync(outputPath.replace('.pdf','.html'), html, 'utf-8');
  fs.writeFileSync(outputPath, html, 'utf-8');
  return outputPath;
}
async function generateCheckOutPDF(booking, form, evidence, outputPath) {
  const html = buildCheckOutHTML(booking, form, evidence);
  fs.writeFileSync(outputPath.replace('.pdf','.html'), html, 'utf-8');
  fs.writeFileSync(outputPath, html, 'utf-8');
  return outputPath;
}

module.exports = { generateCheckInPDF, generateCheckOutPDF };
