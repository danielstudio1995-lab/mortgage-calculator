'use strict';

/* ═══════════════════════════════════════════
   LIVE RATES — Bank of Israel fetch
   Fallback values used if API unavailable
═══════════════════════════════════════════ */
const RATES = {
  boi:        4.00,   // Bank of Israel interest rate %
  prime:      5.50,   // Prime = BoI + 1.5
  makam:      4.00,   // מק"מ ≈ BoI rate
  govBond3:   4.00,   // 3Y govt bond
  govBond10:  4.50,   // 10Y govt bond
  inflation:  2.5,    // Annual CPI forecast
};

async function fetchLiveRates() {
  try {
    // Bank of Israel open data API — interest rate series
    const res = await fetch(
      'https://edge.boi.gov.il/FusionEdge/series/?format=json&lang=en&id=FM_PR_INT_DLY',
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    const latest = data?.result?.records?.[0];
    if (latest?.TIME_PERIOD && latest?.OBS_VALUE) {
      const rate = parseFloat(latest.OBS_VALUE);
      if (!isNaN(rate) && rate > 0) {
        RATES.boi   = rate;
        RATES.prime = rate + 1.5;
        RATES.makam = rate;
        updateRateDisplays();
        return;
      }
    }
    throw new Error('No valid data');
  } catch {
    // Silently use fallback values — already set
    updateRateDisplays();
  }
}

function updateRateDisplays() {
  const p = document.getElementById('primeRateDisplay');
  const m = document.getElementById('makamRateDisplay');
  if (p) p.textContent = `${RATES.prime.toFixed(2)}% (בנק ישראל ${RATES.boi}% + 1.5%)`;
  if (m) m.textContent = `${RATES.makam.toFixed(2)}%`;
  recalcAllTracks();
}

/* ═══════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════ */
function fmt(n) {
  if (isNaN(n) || n === null) return '—';
  return '₪' + Math.round(n).toLocaleString('he-IL');
}
function fmtK(n) {
  if (isNaN(n) || n === null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1000)      return Math.round(n / 1000) + 'K';
  return String(Math.round(n));
}
function parseNum(str) {
  return parseFloat(String(str).replace(/[₪,\s]/g, '')) || 0;
}
function formatInput(el) {
  const val = parseNum(el.value);
  if (val > 0) el.value = val.toLocaleString('he-IL');
}
function setSliderFill(slider) {
  const min  = parseFloat(slider.min);
  const max  = parseFloat(slider.max);
  const val  = parseFloat(slider.value);
  const pct  = ((val - min) / (max - min)) * 100;
  slider.style.background = `linear-gradient(to right, #008B1E ${pct}%, #E2E2DC ${pct}%)`;
}

/* ═══════════════════════════════════════════
   MORTGAGE MATH
═══════════════════════════════════════════ */

/**
 * Spitzer (standard Israeli amortization) monthly payment
 * P = principal, r = annual rate %, n = years
 */
function spitzerPayment(P, annualRate, years) {
  if (P <= 0 || annualRate <= 0 || years <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function kerenShavaPayment(P, annualRate, years) {
  if (P <= 0 || years <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  const principalPmt = P / n;
  return { initial: principalPmt + P * r, final: principalPmt };
}

function totalCostSpitzer(P, annualRate, years) {
  const pmt = spitzerPayment(P, annualRate, years);
  return pmt * years * 12;
}

/**
 * CPI-linked track: project forward using inflation
 * Returns initial and peak monthly payment
 */
function cpiLinkedPayments(P, annualRate, years, annualCPI) {
  const initial = spitzerPayment(P, annualRate + annualCPI, years);
  // Worst case scenario: CPI stays constant, principal grows
  const peakMultiplier = Math.pow(1 + annualCPI / 100, Math.min(years, 10));
  const peak = spitzerPayment(P * peakMultiplier, annualRate + annualCPI, Math.max(years - 10, years));
  return { initial, peak };
}

/**
 * Variable rate tracks: initial + stress-test peak (+2% anchor shock)
 */
function variablePayments(P, currentRate, years) {
  const initial = spitzerPayment(P, currentRate, years);
  const peak    = spitzerPayment(P, currentRate + 2, years); // +2% stress
  return { initial, peak };
}

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
const STATE = {
  // Step 1
  purchaseType: 'discounted',
  maxLTV: 75,
  propertyPrice: 2_000_000,
  equityAmount: 500_000,
  globalYears: 20,
  marketValue: 1_800_000,
  hasGrant: false,
  grantAmount: 40_000,

  // Step 2
  totalMortgage: 1_000_000,
  inflationRate: 2.5,

  tracks: {
    kalatz: { enabled: true,  pct: 40, rate: 4.90, years: 20, amort: 'spitzer', fixed: true  },
    katz:   { enabled: false, pct: 0,  rate: 3.00, years: 20, amort: 'spitzer', fixed: true,  cpi: true },
    prime:  { enabled: true,  pct: 60, spread: 0.75, years: 20, amort: 'spitzer', fixed: false },
    makam:  { enabled: false, pct: 0,  spread: 1.30, years: 20, amort: 'spitzer', fixed: false },
    var13cpi:  { enabled: false, pct: 0, spread: 1.30, years: 20, amort: 'spitzer', fixed: false, cpi: true  },
    var13:     { enabled: false, pct: 0, spread: 1.30, years: 20, amort: 'spitzer', fixed: false, cpi: false },
    var510cpi: { enabled: false, pct: 0, spread: 1.30, years: 20, amort: 'spitzer', fixed: false, cpi: true  },
    var510:    { enabled: false, pct: 0, spread: 1.30, years: 20, amort: 'spitzer', fixed: false, cpi: false },
    zakaut:    { enabled: false, pct: 0, rate: 3.50, years: 20, amort: 'spitzer', fixed: true, cpi: true },
  }
};

/* ═══════════════════════════════════════════
   TRACK INFO TEXTS
═══════════════════════════════════════════ */
const TRACK_INFO = {
  kalatz:    { title: 'קבועה לא צמודה (קל"צ)', body: 'ריבית קבועה לכל אורך חיי ההלוואה ללא הצמדה למדד. ההחזר החודשי קבוע ויציב. מסלול הביטחון המרכזי בתמהיל. הריבית ההתחלתית גבוהה יותר אך ללא הפתעות.' },
  katz:      { title: 'קבועה צמודת מדד (ק"צ)', body: 'ריבית קבועה, אך יתרת הקרן צמודה למדד המחירים לצרכן. ריבית התחלתית נמוכה יותר מקל"צ, אך הקרן גדלה עם האינפלציה.' },
  prime:     { title: 'מסלול פריים', body: 'ריבית בנק ישראל + 1.5% (פריים) ± תוספת/הנחה. מסלול גמיש לפירעון מוקדם ללא עמלה. ריבית עלולה לעלות עם החלטות בנק ישראל.' },
  makam:     { title: 'מק"מ — משתנה שנתי', body: 'הריבית מתעדכנת מדי שנה לפי תשואת המק"מ של בנק ישראל. מסלול קצר תחנות — חשוף לשינויים שנתיים בריבית.' },
  var13cpi:  { title: 'משתנה צמודה 1–3 שנים', body: 'ריבית מתעדכנת כל 1–3 שנים בהתאם לאג"ח ממשלתי, עם הצמדה למדד על הקרן. כפל חשיפה: ריבית + מדד.' },
  var13:     { title: 'משתנה לא צמודה 1–3 שנים', body: 'ריבית מתעדכנת כל 1–3 שנים, ללא הצמדה למדד. פחות יציב מקל"צ אך ריבית התחלתית נמוכה יותר.' },
  var510cpi: { title: 'משתנה צמודה 5–10 שנים', body: 'ריבית מתעדכנת כל 5–10 שנים, עם הצמדה למדד. יציבות בינונית — תחנת ריבית ארוכה יחסית.' },
  var510:    { title: 'משתנה לא צמודה 5–10 שנים', body: 'ריבית מתעדכנת כל 5–10 שנים, ללא הצמדה. איזון בין יציבות לגמישות.' },
  zakaut:    { title: 'הלוואת זכאות', body: 'הלוואה מטעם המדינה בריבית קבועה וצמודה למדד. זמינה לזכאים לפי תבחיני המדינה (מצב משפחתי, שירות צבאי, ותק). הלוואת זכאות משפרת את תנאי שאר המסלולים בתמהיל.' },
};

const TRACK_COLORS = ['#008B1E','#AEE27B','#D3A742','#5b21b6','#9d174d','#1e40af','#92400e','#065f46','#0f766e'];

/* ═══════════════════════════════════════════
   STEP 1 LOGIC
═══════════════════════════════════════════ */
function updateStep1() {
  const { purchaseType, maxLTV, propertyPrice, equityAmount } = STATE;

  const mortgage = propertyPrice - equityAmount;
  const equityPct = propertyPrice > 0 ? (equityAmount / propertyPrice * 100) : 0;
  const ltvPct    = 100 - equityPct;
  const minEquityPct = 100 - maxLTV;

  // LTV bar
  const fill = document.getElementById('ltvFill');
  if (fill) fill.style.width = Math.min(equityPct, 100) + '%';

  const epEl = document.getElementById('equityPct');
  const lpEl = document.getElementById('ltvPct');
  if (epEl) epEl.textContent = equityPct.toFixed(0) + '%';
  if (lpEl) lpEl.textContent = ltvPct.toFixed(0) + '%';

  // Validate LTV
  const warning = document.getElementById('ltvWarning');
  let valid = true;

  if (purchaseType === 'discounted') {
    // Validate against market value cap
    const mv = STATE.marketValue;
    const minEq = STATE.hasGrant ? 60_000 : 100_000;
    if (equityAmount < minEq) {
      warning.textContent = `⚠️ הון עצמי מינימלי ${minEq.toLocaleString('he-IL')} ₪`;
      warning.classList.remove('hidden');
      valid = false;
    } else if (mv > 2_100_000) {
      warning.textContent = `⚠️ שווי שוק חורג מהתקרה של 2,100,000 ₪`;
      warning.classList.remove('hidden');
      valid = false;
    } else {
      warning.classList.add('hidden');
    }
  } else {
    if (ltvPct > maxLTV) {
      warning.textContent = `⚠️ אחוז המימון (${ltvPct.toFixed(0)}%) חורג מהמותר (${maxLTV}%). יש להגדיל הון עצמי ל-${Math.ceil(propertyPrice * minEquityPct / 100).toLocaleString('he-IL')} ₪`;
      warning.classList.remove('hidden');
      valid = false;
    } else {
      warning.classList.add('hidden');
    }
  }

  // Result
  const amountEl = document.getElementById('mortgageAmount');
  const subEl    = document.getElementById('resultSub');
  if (valid && mortgage > 0) {
    if (amountEl) amountEl.textContent = fmt(mortgage);
    if (subEl)   subEl.textContent = `${ltvPct.toFixed(0)}% מימון בנקאי מתוך ${fmt(propertyPrice)}`;
    // Auto-populate step2 total mortgage
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
  if (el)     el.value = STATE.totalMortgage.toLocaleString('he-IL');
  if (slider) {
    slider.value = Math.min(STATE.totalMortgage, parseFloat(slider.max));
    setSliderFill(slider);
  }
  recalcAllTracks();
}

/* ═══════════════════════════════════════════
   STEP 2 TRACK CALCULATIONS
═══════════════════════════════════════════ */
function getTrackRate(id) {
  const t = STATE.tracks[id];
  switch (id) {
    case 'prime':     return RATES.prime + t.spread;
    case 'makam':     return RATES.makam + t.spread;
    case 'var13cpi':  return RATES.govBond3 + t.spread;
    case 'var13':     return RATES.govBond3 + t.spread;
    case 'var510cpi': return RATES.govBond10 + t.spread;
    case 'var510':    return RATES.govBond10 + t.spread;
    default:          return t.rate;
  }
}

function recalcAllTracks() {
  const totalM = STATE.totalMortgage;
  let totalMonthly  = 0;
  let totalInterest = 0;
  let grandTotal    = 0;
  let fixedPct      = 0;
  let activePct     = 0;
  let activeCount   = 0;
  const breakdowns  = [];

  Object.entries(STATE.tracks).forEach(([id, t]) => {
    if (!t.enabled) return;

    const principal = totalM * (t.pct / 100);
    if (principal <= 0) return;

    const rate    = getTrackRate(id);
    const years   = t.years;
    const cpi     = STATE.inflationRate;
    let monthly, peak, total, interest;

    if (t.amort === 'spitzer') {
      if (t.cpi) {
        const { initial, peak: pk } = cpiLinkedPayments(principal, rate, years, cpi);
        monthly = initial;
        peak    = pk;
        total   = monthly * years * 12 * (1 + cpi / 100 * years * 0.5); // approximation
      } else if (!t.fixed) {
        const { initial, peak: pk } = variablePayments(principal, rate, years);
        monthly = initial;
        peak    = pk;
        total   = totalCostSpitzer(principal, rate, years);
      } else {
        monthly = spitzerPayment(principal, rate, years);
        peak    = monthly;
        total   = totalCostSpitzer(principal, rate, years);
      }
      interest = total - principal;
    } else if (t.amort === 'keren') {
      const { initial } = kerenShavaPayment(principal, rate, years);
      monthly = initial;
      peak    = initial;
      total   = principal + (principal * (rate / 100 / 12) * years * 12 / 2);
      interest = total - principal;
    } else {
      // balloon / grace — show approximate
      monthly = spitzerPayment(principal, rate, years);
      peak    = monthly;
      total   = totalCostSpitzer(principal, rate, years);
      interest = total - principal;
    }

    activePct    += t.pct;
    activeCount  += 1;
    totalMonthly += monthly;
    totalInterest += interest;
    grandTotal    += total;
    if (t.fixed) fixedPct += t.pct;

    // Update per-track display
    updateTrackDisplay(id, { monthly, peak, total, interest, principal, rate });
    breakdowns.push({ id, monthly, peak, total, interest, principal, rate, pct: t.pct });
  });

  // Fixed rule
  const fixedPctEl   = document.getElementById('fixedPct');
  const fixedCheckEl = document.getElementById('fixedCheck');
  const fixedRuleEl  = document.querySelector('.fixed-track-rule');
  if (fixedPctEl) fixedPctEl.textContent = Math.round(fixedPct) + '%';
  const fixedOk = fixedPct >= 33.3;
  if (fixedCheckEl) fixedCheckEl.textContent = fixedOk ? '✅' : '❌';
  if (fixedRuleEl)  fixedRuleEl.classList.toggle('ok', fixedOk);

  // Total pct bar
  const pctBar = document.getElementById('totalPctBar');
  const pctVal = document.getElementById('totalPctValue');
  if (pctVal) pctVal.textContent = Math.round(activePct) + '%';
  if (pctBar) {
    const ok = Math.abs(activePct - 100) < 1;
    pctBar.classList.toggle('ok', ok);
    pctBar.querySelector('span').textContent = ok
      ? `✅ סכום האחוזים הפעילים: 100% — מעולה!`
      : `⚠️ סכום האחוזים הפעילים הוא ${Math.round(activePct)}% — נא לוודא שמגיעים ל-100%`;
  }

  // Main result
  const tmEl = document.getElementById('totalMonthly');
  const atEl = document.getElementById('activeTracks');
  const ticEl = document.getElementById('totalInterestCost');
  const gtEl  = document.getElementById('grandTotal');
  if (tmEl)  tmEl.textContent  = activeCount ? fmt(totalMonthly) : '—';
  if (atEl)  atEl.textContent  = `${activeCount} מסלולים פעילים`;
  if (ticEl) ticEl.textContent = activeCount ? fmt(totalInterest) : '—';
  if (gtEl)  gtEl.textContent  = activeCount ? fmt(grandTotal) : '—';

  // Breakdown list
  renderBreakdown(breakdowns, activePct);
}

function updateTrackDisplay(id, { monthly, peak, total, interest, principal, rate }) {
  const set = (elId, val) => {
    const el = document.getElementById(elId);
    if (el) el.textContent = val;
  };
  switch (id) {
    case 'kalatz':
      set('kalatzMonthly', fmt(monthly));
      set('kalatzTotal',   fmt(total));
      break;
    case 'katz':
      set('katzMonthly',   fmt(monthly));
      set('katzPeak',      fmt(peak));
      set('katzTotal',     fmt(total));
      break;
    case 'prime':
      set('primeMonthly',  fmt(monthly));
      set('primeTotal',    fmt(total));
      break;
    case 'makam':
      set('makamMonthly',  fmt(monthly));
      set('makamTotal',    fmt(total));
      break;
    case 'var13cpi':
      set('var13cpiMonthly',    fmt(monthly));
      set('var13cpiPeak',       fmt(peak));
      set('var13cpiTotalCost',  fmt(total));
      break;
    case 'var13':
      set('var13Monthly',    fmt(monthly));
      set('var13TotalCost',  fmt(total));
      break;
    case 'var510cpi':
      set('var510cpiMonthly',   fmt(monthly));
      set('var510cpiPeak',      fmt(peak));
      set('var510cpiTotalCost', fmt(total));
      break;
    case 'var510':
      set('var510Monthly',   fmt(monthly));
      set('var510TotalCost', fmt(total));
      break;
    case 'zakaut':
      set('zakautMonthly', fmt(monthly));
      set('zakautTotal',   fmt(total));
      break;
  }
}

function renderBreakdown(items, totalPct) {
  const list = document.getElementById('breakdownList');
  const bar  = document.getElementById('mixBar');
  if (!list || !bar) return;

  list.innerHTML = '';
  bar.innerHTML  = '';

  items.forEach((item, i) => {
    const info  = TRACK_INFO[item.id] || {};
    const color = TRACK_COLORS[i % TRACK_COLORS.length];
    const rateDisplay = getTrackRate(item.id).toFixed(2);
    const has峰 = item.peak && item.peak > item.monthly * 1.01;

    const div = document.createElement('div');
    div.className = 'breakdown-item';
    div.innerHTML = `
      <div class="breakdown-item-name">
        <span class="track-dot" style="background:${color}"></span>
        <div>
          <div class="breakdown-name">${info.title || item.id}</div>
          <div class="breakdown-detail">${Math.round(item.pct)}% | ריבית ${rateDisplay}% | ${STATE.tracks[item.id].years} שנים</div>
        </div>
      </div>
      <div class="breakdown-figures">
        <span class="breakdown-monthly">${fmt(item.monthly)}/חודש${has峰 ? `<br><small style="color:#AEE27B">שיא: ${fmt(item.peak)}</small>` : ''}</span>
        <span class="breakdown-total">סך: ${fmt(item.total)}</span>
      </div>
    `;
    list.appendChild(div);

    // Mix bar segment
    const seg = document.createElement('div');
    seg.style.cssText = `flex:${item.pct};background:${color};`;
    bar.appendChild(seg);
  });
}

/* ═══════════════════════════════════════════
   INIT & EVENT BINDING
═══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  // Fetch live rates
  fetchLiveRates();

  // ── TABS ──────────────────────────────────
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const step = tab.dataset.step;
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.page').forEach(p => {
        p.classList.toggle('active', p.id === `step${step}`);
      });
      if (step === '2') recalcAllTracks();
    });
  });

  // ── PURCHASE TYPES ─────────────────────────
  document.querySelectorAll('.purchase-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.purchase-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      STATE.purchaseType = card.dataset.type;
      STATE.maxLTV = parseInt(card.dataset.ltv);

      const df = document.getElementById('discountedFields');
      if (STATE.purchaseType === 'discounted') {
        df.classList.add('visible');
      } else {
        df.classList.remove('visible');
      }
      updateStep1();
    });
  });

  // Show discounted fields by default (since it's the default selection)
  document.getElementById('discountedFields').classList.add('visible');

  // ── GRANT TOGGLE ───────────────────────────
  const hasGrant = document.getElementById('hasGrant');
  if (hasGrant) {
    hasGrant.addEventListener('change', () => {
      STATE.hasGrant = hasGrant.checked;
      document.getElementById('grantFields').classList.toggle('hidden', !hasGrant.checked);
      document.getElementById('noGrantNote').classList.toggle('hidden', hasGrant.checked);
      updateStep1();
    });
  }

  const grantInput = document.getElementById('grantAmount');
  if (grantInput) {
    grantInput.addEventListener('input', () => {
      STATE.grantAmount = parseNum(grantInput.value);
      updateStep1();
    });
    grantInput.addEventListener('blur', () => formatInput(grantInput));
  }

  // ── MARKET VALUE ───────────────────────────
  bindInputSlider('marketValue', 'marketValueSlider', val => {
    STATE.marketValue = val;
    updateStep1();
  });

  // ── PROPERTY & EQUITY ──────────────────────
  let swapMode = false; // false = property is primary, true = equity is primary

  bindInputSlider('propertyPrice', 'propertySlider', val => {
    STATE.propertyPrice = val;
    if (!swapMode) {
      // Auto-calc equity from LTV rule
      const minEq = STATE.propertyPrice * (100 - STATE.maxLTV) / 100;
      if (STATE.equityAmount < minEq) {
        STATE.equityAmount = Math.ceil(minEq);
        syncEquityField();
      }
    } else {
      // Equity is primary; recalc property from equity
      // (do nothing — user drives equity)
    }
    updateStep1();
  });

  bindInputSlider('equityAmount', 'equitySlider', val => {
    STATE.equityAmount = val;
    updateStep1();
  });

  document.getElementById('swapBtn')?.addEventListener('click', () => {
    swapMode = !swapMode;
    const btn = document.getElementById('swapBtn');
    if (btn) btn.title = swapMode ? 'הון עצמי ראשי — מחיר מחושב' : 'מחיר ראשי — הון מחושב';
  });

  // ── YEARS (Step 1) ─────────────────────────
  document.querySelectorAll('.year-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.year-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.globalYears = parseInt(btn.dataset.years);
    });
  });

  // ── GO TO STEP 2 ───────────────────────────
  document.getElementById('goToStep2Btn')?.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === 1));
    document.querySelectorAll('.page').forEach(p => {
      p.classList.toggle('active', p.id === 'step2');
    });
    recalcAllTracks();
  });

  // ── TOTAL MORTGAGE (Step 2) ────────────────
  bindInputSlider('totalMortgage', 'totalMortgageSlider', val => {
    STATE.totalMortgage = val;
    recalcAllTracks();
  });

  // ── INFLATION ──────────────────────────────
  document.getElementById('inflPlus')?.addEventListener('click', () => {
    STATE.inflationRate = Math.min(10, +(STATE.inflationRate + 0.5).toFixed(1));
    document.getElementById('inflationRate').textContent = STATE.inflationRate + '%';
    recalcAllTracks();
  });
  document.getElementById('inflMinus')?.addEventListener('click', () => {
    STATE.inflationRate = Math.max(0, +(STATE.inflationRate - 0.5).toFixed(1));
    document.getElementById('inflationRate').textContent = STATE.inflationRate + '%';
    recalcAllTracks();
  });

  // ── SHOW ALL TRACKS TOGGLE ─────────────────
  document.getElementById('showAllTracks')?.addEventListener('change', e => {
    document.querySelectorAll('.track-card.extra-track').forEach(tc => {
      tc.classList.toggle('show', e.target.checked);
    });
  });

  // ── TRACK CARDS ────────────────────────────
  document.querySelectorAll('.track-card').forEach(card => {
    const id     = card.dataset.track;
    const t      = STATE.tracks[id];
    if (!t) return;

    // Enable/disable
    const enableCb = card.querySelector('.track-enable');
    if (enableCb) {
      enableCb.addEventListener('change', () => {
        t.enabled = enableCb.checked;
        card.classList.toggle('enabled', t.enabled);
        recalcAllTracks();
      });
      // Init
      if (t.enabled) {
        enableCb.checked = true;
        card.classList.add('enabled');
      }
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

    // Rate slider (fixed tracks)
    const rateSlider = card.querySelector('.rate-slider');
    if (rateSlider && !['prime','makam','var13cpi','var13','var510cpi','var510'].includes(id)) {
      const rateEl = document.getElementById(`${id}Rate`);
      if (rateEl) {
        rateSlider.addEventListener('input', () => {
          t.rate = parseInt(rateSlider.value) / 100;
          rateEl.textContent = t.rate.toFixed(2) + '%';
          setSliderFill(rateSlider);
          recalcAllTracks();
        });
        setSliderFill(rateSlider);
      }
    }

    // Spread slider (variable tracks)
    if (['prime','makam','var13cpi','var13','var510cpi','var510'].includes(id)) {
      const spreadSlider = card.querySelector(`[id$="SpreadSlider"]`);
      const spreadEl     = document.getElementById(`${id}Spread`);
      const totalEl      = document.getElementById(`${id}TotalRate`) || document.getElementById(`${id}Total`);
      if (spreadSlider) {
        spreadSlider.addEventListener('input', () => {
          const spread = parseInt(spreadSlider.value) / 100;
          t.spread = spread;
          if (spreadEl) {
            const sign = spread < 0 ? '' : '+';
            const sEl  = card.querySelector('.spread-sign');
            if (sEl) sEl.textContent = spread < 0 ? '' : '+';
            spreadEl.textContent = (spread < 0 ? '' : '') + Math.abs(spread).toFixed(2) + '%';
          }
          const totalRate = getTrackRate(id);
          if (totalEl) totalEl.textContent = totalRate.toFixed(2) + '%';
          setSliderFill(spreadSlider);
          recalcAllTracks();
        });
        // Init display
        const totalRate = getTrackRate(id);
        if (totalEl) totalEl.textContent = totalRate.toFixed(2) + '%';
        setSliderFill(spreadSlider);
      }
    }

    // Year buttons
    card.querySelectorAll('.years-mini .yr').forEach(btn => {
      btn.addEventListener('click', () => {
        card.querySelectorAll('.years-mini .yr').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        t.years = parseInt(btn.dataset.val);
        recalcAllTracks();
      });
    });

    // Amortization buttons
    card.querySelectorAll('.amort-row .am').forEach(btn => {
      btn.addEventListener('click', () => {
        card.querySelectorAll('.amort-row .am').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        t.amort = btn.dataset.val;
        recalcAllTracks();
      });
    });

    // Info button
    const infoBtn = card.querySelector('.info-circle');
    if (infoBtn && TRACK_INFO[id]) {
      infoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openModal(TRACK_INFO[id].title, TRACK_INFO[id].body);
      });
    }
  });

  // ── INFO BTN TOOLTIPS ─────────────────────
  document.querySelectorAll('.info-btn[title]').forEach(el => {
    el.addEventListener('click', () => {
      openModal('מידע', el.title);
    });
  });

  // ── MODAL ─────────────────────────────────
  document.getElementById('modalClose')?.addEventListener('click', closeModal);
  document.getElementById('modalOverlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // ── INITIAL RENDER ─────────────────────────
  updateStep1();
  recalcAllTracks();

  // Init all slider fills
  document.querySelectorAll('.slider').forEach(setSliderFill);
});

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
function bindInputSlider(inputId, sliderId, onChange) {
  const input  = document.getElementById(inputId);
  const slider = document.getElementById(sliderId);
  if (!input && !slider) return;

  const getVal = () => {
    if (input) return parseNum(input.value);
    return parseFloat(slider?.value) || 0;
  };

  if (input) {
    input.addEventListener('input', () => {
      const v = parseNum(input.value);
      if (slider) {
        slider.value = Math.min(v, parseFloat(slider.max));
        setSliderFill(slider);
      }
      onChange(v);
    });
    input.addEventListener('blur', () => formatInput(input));
  }

  if (slider) {
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      if (input) input.value = v.toLocaleString('he-IL');
      setSliderFill(slider);
      onChange(v);
    });
    setSliderFill(slider);
  }
}

function syncEquityField() {
  const el     = document.getElementById('equityAmount');
  const slider = document.getElementById('equitySlider');
  if (el)     el.value = STATE.equityAmount.toLocaleString('he-IL');
  if (slider) {
    slider.value = Math.min(STATE.equityAmount, parseFloat(slider.max));
    setSliderFill(slider);
  }
}

function openModal(title, body) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').textContent  = body;
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}
