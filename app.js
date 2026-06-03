'use strict';

/* ═══════════════════════════════════════════
   LIVE RATES — BoI fetch with fallback
═══════════════════════════════════════════ */
const RATES = {
  boi:      4.00,
  prime:    5.50,   // boi + 1.5
  makam:    4.00,   // ≈ boi
  govBond3: 4.00,
  govBond10:4.50,
};

async function fetchLiveRates() {
  try {
    const res = await fetch(
      'https://edge.boi.gov.il/FusionEdge/series/?format=json&lang=en&id=FM_PR_INT_DLY',
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) throw new Error();
    const data = await res.json();
    const val = parseFloat(data?.result?.records?.[0]?.OBS_VALUE);
    if (!isNaN(val) && val > 0) {
      RATES.boi   = val;
      RATES.prime = val + 1.5;
      RATES.makam = val;
    }
  } catch { /* use fallback values */ }
  updateAnchorDisplays();
}

function updateAnchorDisplays() {
  setText('primeRateDisplay',  `${RATES.prime.toFixed(2)}%`);
  setText('makamRateDisplay',  `${RATES.makam.toFixed(2)}%`);
  setText('mczAnchorDisplay',  `${RATES.govBond3.toFixed(2)}%`);
  setText('mlczAnchorDisplay', `${RATES.govBond3.toFixed(2)}%`);
  // Update totals
  updateSpreadTotal('prime',  STATE.tracks.prime.spread,  RATES.prime);
  updateSpreadTotal('makam',  STATE.tracks.makam.spread,  RATES.makam);
  updateSpreadTotal('mcz',    STATE.tracks.mcz.spread,    RATES.govBond3);
  updateSpreadTotal('mlcz',   STATE.tracks.mlcz.spread,   RATES.govBond3);
  recalcAllTracks();
}

/* ═══════════════════════════════════════════
   UTILS
═══════════════════════════════════════════ */
function fmt(n) {
  if (isNaN(n) || n == null || n <= 0) return '—';
  return '₪' + Math.round(n).toLocaleString('he-IL');
}
function parseNum(str) {
  return parseFloat(String(str).replace(/[₪,\s]/g, '')) || 0;
}
function formatInput(el) {
  const v = parseNum(el.value);
  if (v > 0) el.value = v.toLocaleString('he-IL');
}
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* Slider fill: always LTR internally, fill from left */
function setSliderFill(slider) {
  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);
  const val = parseFloat(slider.value);
  const pct = ((val - min) / (max - min)) * 100;
  slider.style.background =
    `linear-gradient(to right, #008B1E ${pct}%, #E2E2DC ${pct}%)`;
}

/* ═══════════════════════════════════════════
   MORTGAGE MATH
═══════════════════════════════════════════ */

/** Standard Spitzer monthly payment */
function spitzer(P, annualRate, years) {
  if (P <= 0 || annualRate <= 0 || years <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
}

/** Keren Shava (equal principal) — initial (highest) payment */
function kerenInitial(P, annualRate, years) {
  if (P <= 0 || years <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return (P / n) + P * r;  // first payment is always the highest
}
function kerenFinal(P, annualRate, years) {
  if (P <= 0 || years <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return (P / n) + (P / n) * r;  // last payment (lowest)
}
function kerenTotal(P, annualRate, years) {
  if (P <= 0 || years <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return P + P * r * (n + 1) / 2;
}

/** Balloon: interest-only during term, full principal at end */
function balloonMonthly(P, annualRate) {
  if (P <= 0 || annualRate <= 0) return 0;
  return P * (annualRate / 100 / 12);
}
function balloonTotal(P, annualRate, years) {
  return balloonMonthly(P, annualRate) * years * 12 + P;
}

/** Grace period: interest-only for graceMo months, then Spitzer for remainder */
function gracePayments(P, annualRate, years, graceMo) {
  const gracePmt = P * (annualRate / 100 / 12);
  const remaining = Math.max(years * 12 - graceMo, 1);
  const postPmt = spitzer(P, annualRate, remaining / 12);
  return { grace: gracePmt, post: postPmt };
}

/** Total cost for Spitzer */
function spitzerTotal(P, annualRate, years) {
  return spitzer(P, annualRate, years) * years * 12;
}

/**
 * CPI-linked track:
 * Initial payment uses real rate. Principal grows with inflation.
 * Peak = payment after inflationYears of CPI growth.
 */
function cpiPayments(P, nominalRate, years, annualCPI, inflationYears = 10) {
  const realRate = nominalRate + annualCPI; // effective rate on linked principal
  const initial  = spitzer(P, realRate, years);
  // After inflationYears, principal has grown by CPI compounding
  const grownP   = P * Math.pow(1 + annualCPI / 100, Math.min(inflationYears, years));
  const peak     = spitzer(grownP, realRate, Math.max(years - inflationYears, 1));
  const total    = spitzerTotal(P, realRate, years) * Math.pow(1 + annualCPI / 100, years * 0.5);
  return { initial, peak, total };
}

/**
 * Variable rate:
 * Initial payment at current rate, peak at current + 2%.
 */
function variablePayments(P, currentRate, years) {
  const initial = spitzer(P, currentRate, years);
  const peak    = spitzer(P, currentRate + 2, years);
  const total   = spitzerTotal(P, currentRate, years);
  return { initial, peak, total };
}

/* Compute track outputs based on state */
function computeTrack(id, t, totalMortgage, annualCPI) {
  const P = totalMortgage * (t.pct / 100);
  if (P <= 0 || !t.enabled) return null;

  const rate    = t.effectiveRate || t.rate || 5;
  const years   = t.years || 20;
  const graceMo = t.graceMo || 12;

  let initial = 0, peak = 0, total = 0;

  if (t.amort === 'keren') {
    initial = kerenInitial(P, rate, years);
    peak    = initial; // already highest
    total   = kerenTotal(P, rate, years);
  } else if (t.amort === 'balloon') {
    initial = balloonMonthly(P, rate);
    peak    = initial;
    total   = balloonTotal(P, rate, years);
  } else if (t.amort === 'grace') {
    const g = gracePayments(P, rate, years, graceMo);
    initial = g.grace;
    peak    = g.post;
    total   = g.grace * graceMo + g.post * (years * 12 - graceMo) + P * (t.cpi ? 0 : 0);
  } else {
    // spitzer
    if (t.cpi) {
      const c = cpiPayments(P, rate, years, annualCPI);
      initial = c.initial; peak = c.peak; total = c.total;
    } else if (!t.fixed) {
      const v = variablePayments(P, rate, years);
      initial = v.initial; peak = v.peak; total = v.total;
    } else {
      initial = spitzer(P, rate, years);
      peak    = initial;
      total   = spitzerTotal(P, rate, years);
    }
  }

  return { P, initial, peak, total, interest: total - P };
}

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
const STATE = {
  purchaseType: 'first',
  maxLTV: 75,
  propertyPrice: 2_000_000,
  equityAmount:  500_000,
  globalYears:   20,
  marketValue:   1_800_000,
  hasGrant:      false,
  grantAmount:   40_000,
  totalMortgage: 1_500_000,
  inflationRate: 2.0,

  tracks: {
    kalatz: { enabled: true,  pct: 33, rate: 4.50, years: 20, amort: 'spitzer', fixed: true,  cpi: false },
    katz:   { enabled: true,  pct: 0,  rate: 2.50, years: 20, amort: 'spitzer', fixed: true,  cpi: true  },
    prime:  { enabled: true,  pct: 34, spread: 0.50, years: 20, amort: 'spitzer', fixed: false, cpi: false },
    makam:  { enabled: true,  pct: 0,  spread: 1.30, years: 20, amort: 'spitzer', fixed: false, cpi: false },
    mcz:    { enabled: true,  pct: 0,  spread: 1.30, years: 20, amort: 'spitzer', fixed: false, cpi: true,  interval: 5 },
    mlcz:   { enabled: true,  pct: 0,  spread: 1.30, years: 20, amort: 'spitzer', fixed: false, cpi: false, interval: 5 },
    zakaut: { enabled: true,  pct: 0,  rate: 3.50, years: 20, amort: 'spitzer', fixed: true,  cpi: true  },
  }
};

/* ═══════════════════════════════════════════
   TRACK INFO
═══════════════════════════════════════════ */
const TRACK_INFO = {
  kalatz: { title: 'קבועה לא צמודה (קל"צ)', body: 'ריבית קבועה לכל אורך חיי ההלוואה, ללא הצמדה למדד. ההחזר החודשי קבוע ויציב לחלוטין. מסלול הביטחון המרכזי — הריבית ההתחלתית גבוהה יותר אך ללא הפתעות.' },
  katz:   { title: 'קבועה צמודת מדד (ק"צ)', body: 'ריבית קבועה, אך יתרת הקרן צמודה למדד המחירים לצרכן. ריבית נמינלית נמוכה מקל"צ, אך ההחזר האמיתי גדל עם האינפלציה. מתאים לתקופות אינפלציה נמוכה.' },
  prime:  { title: 'מסלול פריים', body: 'ריבית = ריבית בנק ישראל + 1.5% (ריבית פריים) ± תוספת/הנחה. גמיש לפירעון מוקדם ללא עמלה. ריבית עשויה לעלות עם החלטות בנק ישראל — שמרו 1/3 לפחות בריבית קבועה.' },
  makam:  { title: 'מק"מ — משתנה שנתי', body: 'הריבית מתעדכנת מדי שנה לפי תשואת מלווה קצר מועד (מק"מ) של בנק ישראל. מסלול בעל תחנת ריבית קצרה — חשוף לשינויים שנתיים.' },
  mcz:    { title: 'משתנה צמודת מדד (מ"צ)', body: 'ריבית מתעדכנת בכל תחנה (1–10 שנים) בהתאם לאג"ח ממשלתי, עם הצמדה למדד על הקרן. חשיפה כפולה: שינוי ריבית + אינפלציה. מתאים לתקופות קצרות.' },
  mlcz:   { title: 'משתנה לא צמודה (מל"צ)', body: 'ריבית מתעדכנת בכל תחנה ללא הצמדה. פחות יציב מקל"צ אך ריבית התחלתית נמוכה יותר. טוב לתמהיל עם קל"צ כבסיס.' },
  zakaut: { title: 'הלוואת זכאות', body: 'הלוואה מטעם המדינה בריבית קבועה צמודה למדד. הריבית נמוכה ממשכנתא רגילה ומשפרת את תנאי שאר המסלולים מול הבנק. הזינו את הריבית שקיבלתם ממשרד הבינוי והשיכון.' },
};

const TRACK_COLORS = ['#008B1E','#AEE27B','#D3A742','#5b21b6','#9d174d','#1e40af','#0f766e'];
const TRACK_LABELS = {
  kalatz:'קל"צ', katz:'ק"צ', prime:'פריים',
  makam:'מק"מ', mcz:'מ"צ', mlcz:'מל"צ', zakaut:'זכאות'
};

/* ═══════════════════════════════════════════
   STEP 1
═══════════════════════════════════════════ */
function updateStep1() {
  const { purchaseType, maxLTV, propertyPrice, equityAmount, marketValue, hasGrant, grantAmount } = STATE;

  let ltvBase = propertyPrice;
  let minEquity = propertyPrice * (100 - maxLTV) / 100;

  if (purchaseType === 'discounted') {
    const cap = 2_100_000;
    const effectiveMV = Math.min(marketValue, cap);
    ltvBase   = effectiveMV;
    minEquity = hasGrant ? 60_000 : 100_000;
    const capNote = document.getElementById('marketValueCapNote');
    if (capNote) {
      if (marketValue > cap) {
        capNote.textContent = `⚠️ שווי שוק חורג מהתקרה — מחושב לפי 2,100,000 ₪`;
      } else {
        capNote.textContent = '';
      }
    }
  }

  const ltvPct    = ltvBase > 0 ? ((ltvBase - equityAmount) / ltvBase * 100) : 0;
  const equityPct = 100 - ltvPct;

  // LTV bar fill (equity %)
  const fill = document.getElementById('ltvFill');
  if (fill) fill.style.width = Math.max(0, Math.min(equityPct, 100)) + '%';
  setText('equityPct', equityPct.toFixed(0) + '%');
  setText('ltvPct',    Math.max(0, ltvPct).toFixed(0) + '%');

  // Validate
  const warning = document.getElementById('ltvWarning');
  let valid = true;
  if (equityAmount < minEquity) {
    warning.textContent = `⚠️ הון עצמי מינימלי: ${Math.round(minEquity).toLocaleString('he-IL')} ₪`;
    warning.classList.remove('hidden'); valid = false;
  } else if (purchaseType !== 'discounted' && ltvPct > maxLTV) {
    const needed = Math.ceil(propertyPrice * (100 - maxLTV) / 100);
    warning.textContent = `⚠️ מימון (${ltvPct.toFixed(0)}%) חורג מהמותר (${maxLTV}%). הגדילו הון עצמי ל-${needed.toLocaleString('he-IL')} ₪`;
    warning.classList.remove('hidden'); valid = false;
  } else {
    warning.classList.add('hidden');
  }

  // Mortgage amount
  const mortgage = purchaseType === 'discounted'
    ? Math.min(marketValue, 2_100_000) * (maxLTV / 100)
    : propertyPrice - equityAmount;

  const amountEl = document.getElementById('mortgageAmount');
  const subEl    = document.getElementById('resultSub');
  if (valid && mortgage > 0) {
    if (amountEl) amountEl.textContent = fmt(mortgage);
    if (subEl)   subEl.textContent = purchaseType === 'discounted'
      ? `${maxLTV}% מימון מתוך שווי שוק ${fmt(Math.min(marketValue, 2_100_000))}`
      : `${(ltvPct).toFixed(0)}% מימון בנקאי מתוך ${fmt(propertyPrice)}`;
    STATE.totalMortgage = Math.max(0, mortgage);
    syncTotalMortgageField();
  } else {
    if (amountEl) amountEl.textContent = '—';
    if (subEl)   subEl.textContent = valid ? 'הזינו מחיר דירה ו/או הון עצמי' : 'תקנו את הנתונים';
  }
}

function syncTotalMortgageField() {
  const el     = document.getElementById('totalMortgage');
  const slider = document.getElementById('totalMortgageSlider');
  if (el)     el.value = Math.round(STATE.totalMortgage).toLocaleString('he-IL');
  if (slider) {
    slider.value = Math.min(STATE.totalMortgage, parseFloat(slider.max));
    setSliderFill(slider);
  }
  recalcAllTracks();
}

/* ═══════════════════════════════════════════
   STEP 2 — RECALC
═══════════════════════════════════════════ */
function updateSpreadTotal(id, spread, anchor) {
  const total = anchor + spread;
  const spreadId = id === 'prime' ? 'primeSpread' : `${id}Spread`;
  const totalDisplayId = id === 'prime' ? 'primeTotalDisplay'
    : id === 'makam' ? 'makamTotalDisplay'
    : id === 'mcz'   ? 'mczTotalDisplay'
    : 'mlczTotalDisplay';
  const spreadDisplayId = id === 'prime' ? 'primeSpreadDisplay'
    : id === 'makam' ? 'makamSpreadDisplay'
    : id === 'mcz'   ? 'mczSpreadDisplay'
    : 'mlczSpreadDisplay';

  const sign = spread >= 0 ? '+' : '';
  setText(spreadId, `${sign}${spread.toFixed(2)}%`);
  setText(spreadDisplayId, `${sign}${spread.toFixed(2)}%`);
  setText(totalDisplayId, `${total.toFixed(2)}%`);
  STATE.tracks[id].effectiveRate = total;
}

function recalcAllTracks() {
  const totalM = STATE.totalMortgage;
  const cpi    = STATE.inflationRate;

  let totalMonthly  = 0;
  let totalPeak     = 0;
  let totalInterest = 0;
  let grandTotal    = 0;
  let fixedPct      = 0;
  let activePct     = 0;
  let activeCount   = 0;
  const breakdowns  = [];
  const colors      = Object.keys(STATE.tracks);

  Object.entries(STATE.tracks).forEach(([id, t], i) => {
    if (!t.enabled) return;
    const res = computeTrack(id, t, totalM, cpi);
    if (!res || res.P <= 0) return;

    activeCount++;
    activePct     += t.pct;
    totalMonthly  += res.initial;
    totalPeak     += res.peak;
    totalInterest += res.interest;
    grandTotal    += res.total;
    if (t.fixed) fixedPct += t.pct;

    // Per-track display
    const pfx = id;
    setText(`${pfx}Monthly`, fmt(res.initial));
    setText(`${pfx}Peak`,    fmt(res.peak));
    setText(`${pfx}Total`,   fmt(res.total));

    breakdowns.push({ id, pct: t.pct, initial: res.initial, peak: res.peak, total: res.total, color: TRACK_COLORS[i % TRACK_COLORS.length] });
  });

  // Fixed rule
  const fixedOk = fixedPct >= 33.3;
  setText('fixedPct', Math.round(fixedPct) + '%');
  setText('fixedCheck', fixedOk ? '✅' : '❌');
  document.getElementById('fixedTrackRule')?.classList.toggle('ok', fixedOk);

  // Total pct
  const pctBar = document.getElementById('totalPctBar');
  const pctMsg = document.getElementById('totalPctMsg');
  if (pctMsg) {
    const ok = Math.abs(activePct - 100) < 1;
    if (pctBar) pctBar.classList.toggle('ok', ok);
    pctMsg.innerHTML = ok
      ? `✅ סכום האחוזים: <strong>100%</strong> — מעולה!`
      : `⚠️ סכום האחוזים הפעילים: <strong>${Math.round(activePct)}%</strong> — נא לוודא שמגיעים ל-100%`;
  }

  // Results
  setText('totalMonthly',     activeCount ? fmt(totalMonthly)  : '—');
  setText('totalPeak',        activeCount ? fmt(totalPeak)     : '—');
  setText('totalInterestCost',activeCount ? fmt(totalInterest) : '—');
  setText('grandTotal',       activeCount ? fmt(grandTotal)    : '—');
  setText('activeTracks',     `${activeCount} מסלולים פעילים`);

  renderBreakdown(breakdowns);
}

function renderBreakdown(items) {
  const list = document.getElementById('breakdownList');
  const bar  = document.getElementById('mixBar');
  if (!list || !bar) return;
  list.innerHTML = ''; bar.innerHTML = '';

  items.forEach(item => {
    const hasPeak = item.peak > item.initial * 1.005;
    const div = document.createElement('div');
    div.className = 'breakdown-item';
    div.innerHTML = `
      <div class="breakdown-item-name">
        <span class="track-dot" style="background:${item.color}"></span>
        <div>
          <div class="breakdown-name">${TRACK_LABELS[item.id] || item.id}</div>
          <div class="breakdown-detail">${Math.round(item.pct)}% מהתמהיל</div>
        </div>
      </div>
      <div class="breakdown-figures">
        <span class="breakdown-monthly">${fmt(item.initial)}/חודש</span>
        ${hasPeak ? `<span class="breakdown-peak">שיא: ${fmt(item.peak)}</span>` : ''}
        <span class="breakdown-total">סך: ${fmt(item.total)}</span>
      </div>`;
    list.appendChild(div);

    const seg = document.createElement('div');
    seg.style.cssText = `flex:${item.pct};background:${item.color};`;
    bar.appendChild(seg);
  });
}

/* ═══════════════════════════════════════════
   BIND HELPERS
═══════════════════════════════════════════ */
function bindNumSlider(inputId, sliderId, onChange) {
  const inp = document.getElementById(inputId);
  const sld = document.getElementById(sliderId);
  if (inp) {
    inp.addEventListener('input', () => {
      const v = parseNum(inp.value);
      if (sld) { sld.value = Math.min(v, parseFloat(sld.max)); setSliderFill(sld); }
      onChange(v);
    });
    inp.addEventListener('blur', () => formatInput(inp));
  }
  if (sld) {
    sld.addEventListener('input', () => {
      const v = parseFloat(sld.value);
      if (inp) inp.value = Math.round(v).toLocaleString('he-IL');
      setSliderFill(sld);
      onChange(v);
    });
    setSliderFill(sld);
  }
}

function syncEquity(val) {
  const el  = document.getElementById('equityAmount');
  const sld = document.getElementById('equitySlider');
  STATE.equityAmount = val;
  if (el)  el.value  = Math.round(val).toLocaleString('he-IL');
  if (sld) { sld.value = Math.min(val, parseFloat(sld.max)); setSliderFill(sld); }
}

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  fetchLiveRates();

  /* ── TABS ── */
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const step = tab.dataset.step;
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `step${step}`));
      if (step === '2') recalcAllTracks();
    });
  });

  /* ── PURCHASE TYPES ── */
  document.querySelectorAll('.purchase-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.purchase-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      STATE.purchaseType = card.dataset.type;
      STATE.maxLTV = parseInt(card.dataset.ltv);
      const df = document.getElementById('discountedFields');
      if (df) df.classList.toggle('visible', STATE.purchaseType === 'discounted');
      updateStep1();
    });
  });

  /* ── GRANT TOGGLE ── */
  const hasGrant = document.getElementById('hasGrant');
  if (hasGrant) {
    hasGrant.addEventListener('change', () => {
      STATE.hasGrant = hasGrant.checked;
      document.getElementById('grantFields')?.classList.toggle('hidden', !hasGrant.checked);
      document.getElementById('noGrantNote')?.classList.toggle('hidden',  hasGrant.checked);
      updateStep1();
    });
  }
  document.getElementById('grantAmount')?.addEventListener('input', e => {
    STATE.grantAmount = parseNum(e.target.value);
    updateStep1();
  });
  document.getElementById('grantAmount')?.addEventListener('blur', e => formatInput(e.target));

  /* ── MARKET VALUE ── */
  bindNumSlider('marketValue', 'marketValueSlider', v => { STATE.marketValue = v; updateStep1(); });

  /* ── PROPERTY & EQUITY ── */
  bindNumSlider('propertyPrice', 'propertySlider', v => {
    STATE.propertyPrice = v;
    // Auto-clamp equity to respect minLTV
    const minEq = v * (100 - STATE.maxLTV) / 100;
    if (STATE.equityAmount < minEq) syncEquity(Math.ceil(minEq));
    updateStep1();
  });
  bindNumSlider('equityAmount', 'equitySlider', v => { STATE.equityAmount = v; updateStep1(); });
  document.getElementById('swapBtn')?.addEventListener('click', () => {
    // toggle: if equity is set, compute property and vice versa — simple swap of values
    const tmp = STATE.propertyPrice;
    // Not a real swap — just highlight which one leads
    const btn = document.getElementById('swapBtn');
    if (btn) btn.style.transform = btn.style.transform === 'rotate(180deg)' ? '' : 'rotate(180deg)';
  });

  /* ── YEARS (Step 1) ── */
  document.querySelectorAll('#step1 .year-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#step1 .year-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.globalYears = parseInt(btn.dataset.years);
      const manual = document.getElementById('yearsManual');
      if (manual) manual.value = STATE.globalYears;
    });
  });
  const yearsManual = document.getElementById('yearsManual');
  if (yearsManual) {
    yearsManual.addEventListener('input', () => {
      const v = Math.min(30, Math.max(1, parseInt(yearsManual.value) || 20));
      STATE.globalYears = v;
      document.querySelectorAll('#step1 .year-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.years) === v);
      });
    });
  }

  /* ── GO TO STEP 2 ── */
  document.getElementById('goToStep2Btn')?.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === 1));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'step2'));
    recalcAllTracks();
  });

  /* ── TOTAL MORTGAGE (Step 2) ── */
  bindNumSlider('totalMortgage', 'totalMortgageSlider', v => {
    STATE.totalMortgage = v; recalcAllTracks();
  });

  /* ── INFLATION ── */
  document.getElementById('inflPlus')?.addEventListener('click', () => {
    STATE.inflationRate = Math.min(10, +(STATE.inflationRate + 0.5).toFixed(1));
    setText('inflationRate', STATE.inflationRate + '%');
    recalcAllTracks();
  });
  document.getElementById('inflMinus')?.addEventListener('click', () => {
    STATE.inflationRate = Math.max(0, +(STATE.inflationRate - 0.5).toFixed(1));
    setText('inflationRate', STATE.inflationRate + '%');
    recalcAllTracks();
  });

  /* ── TRACK CARDS ── */
  document.querySelectorAll('.track-card').forEach(card => {
    const id = card.dataset.track;
    const t  = STATE.tracks[id];
    if (!t) return;

    // Enable checkbox
    const cb = card.querySelector('.track-enable');
    if (cb) {
      cb.addEventListener('change', () => {
        t.enabled = cb.checked;
        card.classList.toggle('enabled', t.enabled);
        recalcAllTracks();
      });
    }

    // Pct slider
    const pctSlider = card.querySelector('.track-pct-slider');
    const pctVal    = document.getElementById(`${id}Pct`);
    if (pctSlider && pctVal) {
      pctSlider.addEventListener('input', () => {
        t.pct = parseInt(pctSlider.value);
        pctVal.textContent = t.pct + '%';
        setSliderFill(pctSlider);
        recalcAllTracks();
      });
      setSliderFill(pctSlider);
    }

    // Rate slider (fixed tracks: kalatz, katz, zakaut)
    if (['kalatz', 'katz', 'zakaut'].includes(id)) {
      const rateSlider = card.querySelector('.rate-slider');
      const rateEl     = document.getElementById(`${id}Rate`);
      if (rateSlider && rateEl) {
        rateSlider.addEventListener('input', () => {
          t.rate = parseInt(rateSlider.value) / 100;
          rateEl.textContent = t.rate.toFixed(2) + '%';
          setSliderFill(rateSlider);
          recalcAllTracks();
        });
        setSliderFill(rateSlider);
      }
    }

    // Spread sliders (variable tracks)
    if (['prime', 'makam', 'mcz', 'mlcz'].includes(id)) {
      const spreadSlider = document.getElementById(`${id}SpreadSlider`);
      if (spreadSlider) {
        const anchor = id === 'prime' ? RATES.prime
          : id === 'makam' ? RATES.makam
          : RATES.govBond3;
        spreadSlider.addEventListener('input', () => {
          t.spread = parseInt(spreadSlider.value) / 100;
          const currentAnchor = id === 'prime' ? RATES.prime
            : id === 'makam' ? RATES.makam
            : RATES.govBond3;
          updateSpreadTotal(id, t.spread, currentAnchor);
          setSliderFill(spreadSlider);
          recalcAllTracks();
        });
        setSliderFill(spreadSlider);
        updateSpreadTotal(id, t.spread, anchor);
      }
    }

    // Interval slider (mcz, mlcz)
    if (['mcz', 'mlcz'].includes(id)) {
      const intSlider = document.getElementById(`${id}IntervalSlider`);
      const intEl     = document.getElementById(`${id}Interval`);
      if (intSlider && intEl) {
        intSlider.addEventListener('input', () => {
          t.interval = parseInt(intSlider.value);
          intEl.textContent = t.interval + ' שנים';
          setSliderFill(intSlider);
          recalcAllTracks();
        });
        setSliderFill(intSlider);
      }
    }

    // Year buttons per track
    card.querySelectorAll('.track-years-row .yr').forEach(btn => {
      btn.addEventListener('click', () => {
        card.querySelectorAll('.track-years-row .yr').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        t.years = parseInt(btn.dataset.val);
        const manual = card.querySelector('.yr-manual');
        if (manual) manual.value = t.years;
        recalcAllTracks();
      });
    });

    // Manual year input per track
    const yrManual = card.querySelector('.yr-manual');
    if (yrManual) {
      yrManual.addEventListener('input', () => {
        const v = Math.min(30, Math.max(1, parseInt(yrManual.value) || 20));
        t.years = v;
        card.querySelectorAll('.track-years-row .yr').forEach(b => {
          b.classList.toggle('active', parseInt(b.dataset.val) === v);
        });
        recalcAllTracks();
      });
    }

    // Amort buttons
    card.querySelectorAll('.amort-row .am').forEach(btn => {
      btn.addEventListener('click', () => {
        card.querySelectorAll('.amort-row .am').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        t.amort = btn.dataset.val;
        // Show/hide grace input
        const graceDiv = document.getElementById(`${id}-grace`);
        if (graceDiv) graceDiv.classList.toggle('hidden', t.amort !== 'grace');
        recalcAllTracks();
      });
    });

    // Grace months input
    const graceInp = card.querySelector('.grace-months');
    if (graceInp) {
      graceInp.addEventListener('input', () => {
        t.graceMo = parseInt(graceInp.value) || 12;
        recalcAllTracks();
      });
    }

    // Info button
    const infoBtn = card.querySelector('.info-circle');
    if (infoBtn) {
      infoBtn.addEventListener('click', e => {
        e.stopPropagation();
        const info = TRACK_INFO[id];
        if (info) openModal(info.title, info.body);
      });
    }
  });

  /* ── INFO BTN MODALS ── */
  document.querySelectorAll('.info-btn[data-modal-title]').forEach(el => {
    el.addEventListener('click', () => openModal(el.dataset.modalTitle, el.dataset.modalBody));
  });

  /* ── MODAL ── */
  document.getElementById('modalClose')?.addEventListener('click', closeModal);
  document.getElementById('modalOverlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  /* ── INIT ── */
  updateStep1();
  recalcAllTracks();
  document.querySelectorAll('.slider').forEach(setSliderFill);
});

function openModal(title, body) {
  setText('modalTitle', title);
  setText('modalBody',  body);
  document.getElementById('modalOverlay')?.classList.add('open');
}
function closeModal() {
  document.getElementById('modalOverlay')?.classList.remove('open');
}
