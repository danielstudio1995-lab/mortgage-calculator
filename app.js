'use strict';

/* ── ZAKAUT RATES (August 2026) ── */
const ZAKAUT_RATES = {5:3.00, 10:2.27, 15:2.37, 20:2.48, 25:2.57, 30:2.72};
function getZakautRate(years) {
  const y = Math.min(30, Math.max(1, years));
  if (y <= 5)  return ZAKAUT_RATES[5];
  if (y <= 10) return ZAKAUT_RATES[10];
  if (y <= 15) return ZAKAUT_RATES[15];
  if (y <= 20) return ZAKAUT_RATES[20];
  if (y <= 25) return ZAKAUT_RATES[25];
  return ZAKAUT_RATES[30];
}

/* ── UTILS ── */
const fmt = n => (isNaN(n)||n==null||n<=0) ? '—' : '₪'+Math.round(n).toLocaleString('he-IL');
const fmtRate = r => r.toFixed(2)+'%';
const parseNum = s => parseFloat(String(s).replace(/[₪,\s]/g,''))||0;
const setText = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
const formatInput = el => { const v=parseNum(el.value); if(v>0) el.value=v.toLocaleString('he-IL'); };

function setSliderFill(slider) {
  const min=parseFloat(slider.min), max=parseFloat(slider.max), val=parseFloat(slider.value);
  const pct = Math.max(0,Math.min(100,((val-min)/(max-min))*100));
  slider.style.background = `linear-gradient(to right,#008B1E ${pct}%,#E2E2DC ${pct}%)`;
}

/* ── MATH ── */
function spitzer(P, annualRate, years) {
  if (P<=0||annualRate<=0||years<=0) return 0;
  const r=annualRate/100/12, n=years*12;
  return P*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1);
}
function kerenInitial(P, annualRate, years) {
  if (P<=0||years<=0) return 0;
  return P/(years*12) + P*(annualRate/100/12);
}
function kerenTotal(P, annualRate, years) {
  if (P<=0||years<=0) return 0;
  const r=annualRate/100/12, n=years*12;
  return P + P*r*(n+1)/2;
}
function balloonMonthly(P, annualRate) { return P*(annualRate/100/12); }
function balloonTotal(P, annualRate, years) { return balloonMonthly(P,annualRate)*years*12+P; }
function gracePayments(P, annualRate, years, graceMo) {
  const gracePmt = P*(annualRate/100/12);
  const postYrs  = Math.max((years*12-graceMo)/12, 0.1);
  return { grace:gracePmt, post:spitzer(P,annualRate,postYrs) };
}
function spitzerTotal(P, annualRate, years) { return spitzer(P,annualRate,years)*years*12; }

function computeTrack(id, t, totalMortgage, annualCPI) {
  const P = totalMortgage*(t.pct/100);
  if (P<=0||!t.enabled) return null;
  const rate=t.rate||5, years=t.years||20, graceMo=t.graceMo||12;
  let initial=0, peak=0, total=0;

  if (t.amort==='keren') {
    initial = kerenInitial(P,rate,years);
    peak    = initial;
    total   = kerenTotal(P,rate,years);
  } else if (t.amort==='balloon') {
    initial = balloonMonthly(P,rate);
    peak    = initial;
    total   = balloonTotal(P,rate,years);
  } else if (t.amort==='grace') {
    const g = gracePayments(P,rate,years,graceMo);
    initial = g.grace; peak = g.post;
    total   = g.grace*graceMo + g.post*(years*12-graceMo);
  } else {
    // spitzer
    if (t.cpi) {
      const effRate = rate + annualCPI;
      initial = spitzer(P,effRate,years);
      const grownP = P*Math.pow(1+annualCPI/100,Math.min(10,years));
      peak    = spitzer(grownP,effRate,Math.max(years-10,1));
      total   = spitzerTotal(P,effRate,years)*Math.pow(1+annualCPI/100,years*0.5);
    } else if (!t.fixed) {
      initial = spitzer(P,rate,years);
      peak    = spitzer(P,rate+2,years);
      total   = spitzerTotal(P,rate,years);
    } else {
      initial = spitzer(P,rate,years);
      peak    = initial;
      total   = spitzerTotal(P,rate,years);
    }
  }
  return { P, initial, peak, total, interest: total-P };
}

/* ── STATE ── */
const STATE = {
  // Page 1
  purchaseType:'first', maxLTV:75,
  propertyPrice:2_000_000, equityAmount:500_000,
  globalYears:20,
  marketValue:1_600_000, hasGrant:false,
  driver:'price', // 'price' or 'equity'

  // Page 2
  totalMortgage:1_500_000, inflationRate:2.0,

  tracks:{
    kalatz:{ enabled:true,  pct:33, rate:4.50, years:20, amort:'spitzer', fixed:true,  cpi:false, rMin:350, rMax:650 },
    katz:  { enabled:true,  pct:0,  rate:2.50, years:20, amort:'spitzer', fixed:true,  cpi:true,  rMin:150, rMax:500 },
    zakaut:{ enabled:true,  pct:0,  rate:2.48, years:20, amort:'spitzer', fixed:true,  cpi:true,  rMin:200, rMax:600 },
    prime: { enabled:true,  pct:34, rate:5.50, years:20, amort:'spitzer', fixed:false, cpi:false, rMin:350, rMax:650 },
    makam: { enabled:true,  pct:0,  rate:4.00, years:20, amort:'spitzer', fixed:false, cpi:false, rMin:200, rMax:700 },
    mcz:   { enabled:true,  pct:0,  rate:3.50, years:20, amort:'spitzer', fixed:false, cpi:true,  rMin:200, rMax:500, interval:5 },
    mlcz:  { enabled:true,  pct:0,  rate:5.00, years:20, amort:'spitzer', fixed:false, cpi:false, rMin:350, rMax:650, interval:5 },
  }
};

const TRACK_INFO = {
  kalatz:{ title:'קבועה לא צמודה (קל"צ)', body:'ריבית קבועה לכל אורך חיי ההלוואה, ללא הצמדה למדד. ההחזר החודשי קבוע ויציב. מסלול הביטחון המרכזי.' },
  katz:  { title:'קבועה צמודת מדד (ק"צ)', body:'ריבית קבועה, אך יתרת הקרן צמודה למדד המחירים לצרכן. ריבית נמינלית נמוכה, אך ההחזר האמיתי גדל עם האינפלציה.' },
  zakaut:{ title:'הלוואת זכאות', body:'הלוואה מטעם המדינה בריבית קבועה צמודה למדד. הריביות לפי תקופה — עד 5 שנים: 3%, עד 10 שנים: 2.27%, עד 15 שנים: 2.37%, עד 20 שנים: 2.48%, עד 25 שנים: 2.57%, מעל 25 שנים: 2.72%. ריבית אוגוסט 2026.' },
  prime: { title:'מסלול פריים', body:'ריבית = ריבית בנק ישראל + 1.5%. גמיש לפירעון מוקדם ללא עמלה. חשוף לשינויי ריבית בנק ישראל.' },
  makam: { title:'מק"מ — משתנה שנתי', body:'הריבית מתעדכנת מדי שנה לפי תשואת המק"מ של בנק ישראל. תחנת ריבית קצרה — חשוף לשינויים שנתיים.' },
  mcz:   { title:'משתנה צמודת מדד (מ"צ)', body:'ריבית מתעדכנת בכל תכיפות לשינוי בהתאם לאג"ח ממשלתי, עם הצמדה למדד על הקרן. טווח ריבית: 2%–5%.' },
  mlcz:  { title:'משתנה לא צמודה (מל"צ)', body:'ריבית מתעדכנת בכל תכיפות לשינוי ללא הצמדה. טווח ריבית: 3.5%–6.5%.' },
};

const TRACK_COLORS = ['#008B1E','#AEE27B','#D3A742','#5b21b6','#9d174d','#1e40af','#0f766e'];
const TRACK_LABELS = { kalatz:'קל"צ', katz:'ק"צ', zakaut:'זכאות', prime:'פריים', makam:'מק"מ', mcz:'מ"צ', mlcz:'מל"צ' };

/* ── PAGE 1 LOGIC ── */
function calcDiscountedMortgage() {
  const mv = STATE.marketValue;
  const cap = 2_100_000;
  const minEquity = STATE.hasGrant ? 60_000 : 100_000;
  let bankAmount;
  if (mv <= cap) {
    bankAmount = mv * 0.75;
  } else {
    bankAmount = cap * 0.75; // 75% of 2.1M cap
  }
  return { bankAmount, minEquity, effectiveMV: Math.min(mv, cap) };
}

function updateStep1() {
  const { purchaseType, maxLTV, propertyPrice, equityAmount, driver } = STATE;
  const warning = document.getElementById('ltvWarning');
  const priceHint  = document.getElementById('priceHint');
  const equityHint = document.getElementById('equityHint');

  let mortgage = 0, valid = true, ltvPct = 0, equityPct = 0;

  if (purchaseType === 'discounted') {
    const { bankAmount, minEquity } = calcDiscountedMortgage();
    mortgage = bankAmount;
    const equity = STATE.marketValue <= 2_100_000
      ? STATE.marketValue * 0.25
      : STATE.marketValue - bankAmount;
    equityPct = STATE.marketValue > 0 ? (equity / STATE.marketValue * 100) : 25;
    ltvPct = 100 - equityPct;

    // Hint
    if (priceHint)  priceHint.textContent  = `הון עצמי מינימלי: ${Math.ceil(minEquity).toLocaleString('he-IL')} ₪`;
    if (equityHint) equityHint.textContent = `מימון בנקאי: ${fmt(bankAmount)}`;

    if (equityAmount < minEquity) {
      warning.textContent = `⚠️ הון עצמי מינימלי: ${minEquity.toLocaleString('he-IL')} ₪`;
      warning.classList.remove('hidden'); valid = false;
    } else { warning.classList.add('hidden'); }

  } else {
    if (driver === 'price') {
      // User typed price → compute mortgage and show min equity hint
      const minEquity = propertyPrice * (100 - maxLTV) / 100;
      mortgage = propertyPrice - equityAmount;
      ltvPct   = propertyPrice > 0 ? (mortgage / propertyPrice * 100) : 0;
      equityPct = 100 - ltvPct;
      if (priceHint)  priceHint.textContent  = '';
      if (equityHint) equityHint.textContent = `הון עצמי מינימלי: ${Math.ceil(minEquity).toLocaleString('he-IL')} ₪`;

      if (ltvPct > maxLTV) {
        const needed = Math.ceil(propertyPrice * (100-maxLTV) / 100);
        warning.textContent = `⚠️ מימון (${ltvPct.toFixed(0)}%) חורג. הגדילו הון עצמי ל-${needed.toLocaleString('he-IL')} ₪`;
        warning.classList.remove('hidden'); valid = false;
      } else { warning.classList.add('hidden'); }

    } else {
      // User typed equity → compute max property price
      const maxPrice = equityAmount / ((100 - maxLTV) / 100);
      mortgage = maxPrice * (maxLTV / 100);
      ltvPct   = maxLTV;
      equityPct = 100 - maxLTV;
      if (equityHint) equityHint.textContent = '';
      if (priceHint)  priceHint.textContent  = `מחיר דירה מקסימלי: ${fmt(maxPrice)}`;
      // Sync property price display
      const propEl = document.getElementById('propertyPrice');
      const propSld = document.getElementById('propertySlider');
      if (propEl) propEl.value = Math.round(maxPrice).toLocaleString('he-IL');
      if (propSld) { propSld.value = Math.min(maxPrice, parseFloat(propSld.max)); setSliderFill(propSld); }
      STATE.propertyPrice = maxPrice;
      warning.classList.add('hidden');
    }
  }

  // LTV bar
  const fill = document.getElementById('ltvFill');
  if (fill) fill.style.width = Math.max(0,Math.min(equityPct,100))+'%';
  setText('equityPct', equityPct.toFixed(0)+'%');
  setText('ltvPct', Math.max(0,ltvPct).toFixed(0)+'%');

  // Monthly estimate
  updateMonthlyEstimate(mortgage);

  // Result
  const amountEl = document.getElementById('mortgageAmount');
  const subEl    = document.getElementById('resultSub');
  if (valid && mortgage > 0) {
    if (amountEl) amountEl.textContent = fmt(mortgage);
    if (subEl) subEl.textContent = purchaseType==='discounted'
      ? `75% מימון מ-${fmt(Math.min(STATE.marketValue,2_100_000))}`
      : `${Math.max(0,ltvPct).toFixed(0)}% מימון מתוך ${fmt(STATE.propertyPrice)}`;
    STATE.totalMortgage = Math.max(0, mortgage);
    syncTotalMortgageField();
  } else {
    if (amountEl) amountEl.textContent = '—';
    if (subEl) subEl.textContent = valid ? 'הזינו נתונים לחישוב' : 'תקנו את הנתונים';
  }
}

function updateMonthlyEstimate(mortgage) {
  const box = document.getElementById('monthlyEstimateBox');
  const amtEl = document.getElementById('monthlyEstimate');
  const subEl = document.getElementById('monthlyEstimateSub');
  if (!box) return;
  if (mortgage > 0) {
    const monthly = spitzer(mortgage, 5, STATE.globalYears);
    box.classList.add('visible');
    if (amtEl) amtEl.textContent = fmt(monthly) + ' לחודש';
    if (subEl) subEl.textContent = `לתקופה של ${STATE.globalYears} שנים בריבית ממוצעת 5%`;
  } else {
    box.classList.remove('visible');
  }
}

function syncTotalMortgageField() {
  const el  = document.getElementById('totalMortgage');
  const sld = document.getElementById('totalMortgageSlider');
  if (el)  el.value  = Math.round(STATE.totalMortgage).toLocaleString('he-IL');
  if (sld) { sld.value = Math.min(STATE.totalMortgage, parseFloat(sld.max)); setSliderFill(sld); }
  recalcAllTracks();
}

/* ── DRIVER TOGGLE ── */
function setDriver(d) {
  STATE.driver = d;
  document.getElementById('driverPrice')?.classList.toggle('active', d==='price');
  document.getElementById('driverEquity')?.classList.toggle('active', d==='equity');
  const priceWrap  = document.getElementById('priceWrap');
  const equityWrap = document.getElementById('equityWrap');
  if (priceWrap)  priceWrap.classList.toggle('primary-driver',  d==='price');
  if (equityWrap) equityWrap.classList.toggle('primary-driver', d==='equity');
  updateStep1();
}

/* ── PAGE 2 LOGIC ── */
function recalcAllTracks() {
  const totalM = STATE.totalMortgage, cpi = STATE.inflationRate;
  let totalMonthly=0, totalPeak=0, totalInterest=0, grandTotal=0;
  let fixedPct=0, activePct=0, activeCount=0;
  const breakdowns=[];

  Object.entries(STATE.tracks).forEach(([id,t],i) => {
    if (!t.enabled) return;
    const res = computeTrack(id,t,totalM,cpi);
    if (!res||res.P<=0) return;
    activeCount++; activePct+=t.pct;
    totalMonthly+=res.initial; totalPeak+=res.peak;
    totalInterest+=res.interest; grandTotal+=res.total;
    if (t.fixed) fixedPct+=t.pct;

    // Per-track display
    const per1k = res.P>0 ? (res.initial/(res.P/1000)) : 0;
    setText(`${id}Monthly`, fmt(res.initial));
    setText(`${id}Per1k`,   per1k>0 ? '₪'+(per1k.toFixed(2)) : '—');
    setText(`${id}Peak`,    fmt(res.peak));
    setText(`${id}Total`,   fmt(res.total));

    breakdowns.push({id, pct:t.pct, initial:res.initial, peak:res.peak, total:res.total, color:TRACK_COLORS[i%TRACK_COLORS.length]});
  });

  // Fixed rule
  const fixedOk = fixedPct >= 33.3;
  setText('fixedPct', Math.round(fixedPct)+'%');
  setText('fixedCheck', fixedOk?'✅':'❌');
  document.getElementById('fixedTrackRule')?.classList.toggle('ok', fixedOk);

  // Pct bar
  const pctBar = document.getElementById('totalPctBar');
  const pctMsg = document.getElementById('totalPctMsg');
  if (pctMsg) {
    const ok = Math.abs(activePct-100)<1;
    pctBar?.classList.toggle('ok', ok);
    pctMsg.innerHTML = ok
      ? `✅ סכום האחוזים: <strong>100%</strong>`
      : `⚠️ סכום האחוזים הפעילים: <strong>${Math.round(activePct)}%</strong> — נא לוודא שמגיעים ל-100%`;
  }

  setText('totalMonthly',      activeCount ? fmt(totalMonthly)  : '—');
  setText('totalPeak',         activeCount ? fmt(totalPeak)     : '—');
  setText('totalInterestCost', activeCount ? fmt(totalInterest) : '—');
  setText('grandTotal',        activeCount ? fmt(grandTotal)    : '—');
  setText('activeTracks',      `${activeCount} מסלולים פעילים`);

  renderBreakdown(breakdowns);
}

function renderBreakdown(items) {
  const list = document.getElementById('breakdownList');
  const bar  = document.getElementById('mixBar');
  if (!list||!bar) return;
  list.innerHTML=''; bar.innerHTML='';
  items.forEach(item => {
    const hasPeak = item.peak>item.initial*1.005;
    const div=document.createElement('div');
    div.className='breakdown-item';
    div.innerHTML=`
      <div class="breakdown-item-name">
        <span class="track-dot" style="background:${item.color}"></span>
        <div><div class="breakdown-name">${TRACK_LABELS[item.id]||item.id}</div>
        <div class="breakdown-detail">${Math.round(item.pct)}% מהתמהיל</div></div>
      </div>
      <div class="breakdown-figures">
        <span class="breakdown-monthly">${fmt(item.initial)}/חודש</span>
        ${hasPeak?`<span class="breakdown-peak">שיא: ${fmt(item.peak)}</span>`:''}
        <span class="breakdown-total">סך: ${fmt(item.total)}</span>
      </div>`;
    list.appendChild(div);
    const seg=document.createElement('div');
    seg.style.cssText=`flex:${item.pct};background:${item.color};`;
    bar.appendChild(seg);
  });
}

/* ── RATE RANGE CONTROLS ── */
const RANGE_STEP = 50; // basis points to expand/shrink
function adjustRange(trackId, dir) {
  const t = STATE.tracks[trackId];
  if (!t) return;
  const slider = document.getElementById(`${trackId}RateSlider`);
  if (!slider) return;
  if (dir==='widen') {
    t.rMin = Math.max(0,   t.rMin - RANGE_STEP);
    t.rMax = Math.min(1500, t.rMax + RANGE_STEP);
  } else {
    const mid = Math.round((t.rMin+t.rMax)/2);
    t.rMin = Math.min(t.rMin+RANGE_STEP, mid);
    t.rMax = Math.max(t.rMax-RANGE_STEP, mid);
  }
  slider.min  = t.rMin;
  slider.max  = t.rMax;
  slider.value = Math.max(t.rMin, Math.min(t.rMax, slider.value));
  t.rate = parseInt(slider.value)/100;
  setSliderFill(slider);
  setText(`${trackId}RangeMin`, (t.rMin/100).toFixed(2)+'%');
  setText(`${trackId}RangeMax`, (t.rMax/100).toFixed(2)+'%');
  updateRateDisplay(trackId, t.rate);
  recalcAllTracks();
}

function updateRateDisplay(trackId, rate) {
  const el = document.getElementById(`${trackId}Rate`);
  if (el) el.textContent = rate.toFixed(2)+'%';
}

/* ── BIND HELPERS ── */
function bindNumSlider(inputId, sliderId, onChange) {
  const inp=document.getElementById(inputId), sld=document.getElementById(sliderId);
  if (inp) {
    inp.addEventListener('input', () => {
      const v=parseNum(inp.value);
      if (sld) { sld.value=Math.min(v,parseFloat(sld.max)); setSliderFill(sld); }
      onChange(v);
    });
    inp.addEventListener('blur', () => formatInput(inp));
  }
  if (sld) {
    sld.addEventListener('input', () => {
      const v=parseFloat(sld.value);
      if (inp) inp.value=Math.round(v).toLocaleString('he-IL');
      setSliderFill(sld);
      onChange(v);
    });
    setSliderFill(sld);
  }
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {

  /* TABS */
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const step=tab.dataset.step;
      document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t===tab));
      document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===`step${step}`));
      if (step==='2') recalcAllTracks();
    });
  });

  /* PURCHASE TYPES */
  document.querySelectorAll('.purchase-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.purchase-card').forEach(c=>c.classList.remove('active'));
      card.classList.add('active');
      STATE.purchaseType=card.dataset.type;
      STATE.maxLTV=parseInt(card.dataset.ltv);
      const df=document.getElementById('discountedFields');
      if (df) df.classList.toggle('visible', STATE.purchaseType==='discounted');
      updateStep1();
    });
  });

  /* DRIVER TOGGLE */
  document.getElementById('driverPrice')?.addEventListener('click',  ()=>setDriver('price'));
  document.getElementById('driverEquity')?.addEventListener('click', ()=>setDriver('equity'));
  document.getElementById('swapBtn')?.addEventListener('click', () =>
    setDriver(STATE.driver==='price' ? 'equity' : 'price')
  );
  setDriver('price'); // init

  /* GRANT */
  document.getElementById('hasGrant')?.addEventListener('change', e => {
    STATE.hasGrant = e.target.checked;
    document.getElementById('grantFields')?.classList.toggle('hidden', !e.target.checked);
    document.getElementById('noGrantNote')?.classList.toggle('hidden',  e.target.checked);
    updateStep1();
  });

  /* MARKET VALUE */
  bindNumSlider('marketValue','marketValueSlider', v => {
    STATE.marketValue=v;
    const cap=2_100_000;
    const capNote=document.getElementById('marketValueCapNote');
    if (capNote) capNote.textContent = v>cap ? '⚠️ מעל התקרה — מחושב לפי 2,100,000 ₪' : '';
    updateStep1();
  });

  /* PROPERTY & EQUITY */
  bindNumSlider('propertyPrice','propertySlider', v => { STATE.propertyPrice=v; if(STATE.driver==='price') updateStep1(); });
  bindNumSlider('equityAmount','equitySlider',    v => { STATE.equityAmount=v;  updateStep1(); });

  /* YEARS (page 1) */
  document.querySelectorAll('#step1 .year-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#step1 .year-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      STATE.globalYears=parseInt(btn.dataset.years);
      const m=document.getElementById('yearsManual'); if(m) m.value=STATE.globalYears;
      updateMonthlyEstimate(STATE.totalMortgage);
    });
  });
  document.getElementById('yearsManual')?.addEventListener('input', e => {
    const v=Math.min(30,Math.max(1,parseInt(e.target.value)||20));
    STATE.globalYears=v;
    document.querySelectorAll('#step1 .year-btn').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.years)===v));
    updateMonthlyEstimate(STATE.totalMortgage);
  });

  /* GO TO STEP 2 */
  document.getElementById('goToStep2Btn')?.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',i===1));
    document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='step2'));
    recalcAllTracks();
  });

  /* ZAKAUT UPSELL — scrolls to zakaut track in page 2 */
  document.getElementById('zakautUpsell')?.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',i===1));
    document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='step2'));
    setTimeout(()=>{
      const el=document.querySelector('[data-track="zakaut"]');
      if(el) el.scrollIntoView({behavior:'smooth',block:'start'});
    },200);
    recalcAllTracks();
  });
  document.getElementById('zakautBtn')?.addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('zakautUpsell')?.click();
  });

  /* TOTAL MORTGAGE (page 2) */
  bindNumSlider('totalMortgage','totalMortgageSlider', v => { STATE.totalMortgage=v; recalcAllTracks(); });

  /* INFLATION */
  document.getElementById('inflPlus')?.addEventListener('click',  ()=>{ STATE.inflationRate=Math.min(10,+(STATE.inflationRate+0.5).toFixed(1)); setText('inflationRate',STATE.inflationRate+'%'); recalcAllTracks(); });
  document.getElementById('inflMinus')?.addEventListener('click', ()=>{ STATE.inflationRate=Math.max(0,+(STATE.inflationRate-0.5).toFixed(1)); setText('inflationRate',STATE.inflationRate+'%'); recalcAllTracks(); });

  /* RANGE ADJ BUTTONS */
  document.querySelectorAll('.range-adj').forEach(btn => {
    btn.addEventListener('click', ()=>adjustRange(btn.dataset.track, btn.dataset.dir));
  });

  /* INTERVAL SLIDERS */
  ['mcz','mlcz'].forEach(id => {
    const sld=document.getElementById(`${id}IntervalSlider`);
    if (sld) {
      sld.addEventListener('input', ()=>{
        STATE.tracks[id].interval=parseInt(sld.value);
        setText(`${id}Interval`, sld.value+' שנים');
        setSliderFill(sld);
        recalcAllTracks();
      });
      setSliderFill(sld);
    }
  });

  /* TRACK CARDS */
  document.querySelectorAll('.track-card').forEach(card => {
    const id=card.dataset.track, t=STATE.tracks[id];
    if (!t) return;

    /* Enable */
    const cb=card.querySelector('.track-enable');
    if (cb) cb.addEventListener('change', ()=>{ t.enabled=cb.checked; card.classList.toggle('enabled',t.enabled); recalcAllTracks(); });

    /* Pct slider */
    const pctSld=card.querySelector('.track-pct-slider');
    if (pctSld) {
      pctSld.addEventListener('input', ()=>{
        t.pct=parseInt(pctSld.value);
        setText(`${id}Pct`, t.pct+'%');
        setSliderFill(pctSld);
        recalcAllTracks();
      });
      setSliderFill(pctSld);
    }

    /* Rate slider */
    const rateSld=card.querySelector('.rate-slider');
    if (rateSld && id!=='zakaut') {
      rateSld.addEventListener('input', ()=>{
        t.rate=parseInt(rateSld.value)/100;
        updateRateDisplay(id, t.rate);
        setSliderFill(rateSld);
        recalcAllTracks();
      });
      setSliderFill(rateSld);
    }

    /* Zakaut — auto-rate from years */
    if (id==='zakaut') {
      const updateZakautRate = (years) => {
        t.rate = getZakautRate(years);
        t.years = years;
        setText('zakautRateDisplay', t.rate.toFixed(2)+'%');
        recalcAllTracks();
      };
      updateZakautRate(t.years); // init
    }

    /* Year buttons */
    card.querySelectorAll('.track-years-row .yr').forEach(btn => {
      btn.addEventListener('click', ()=>{
        card.querySelectorAll('.track-years-row .yr').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const yrs=parseInt(btn.dataset.val);
        t.years=yrs;
        const yrM=card.querySelector('.yr-manual'); if(yrM) yrM.value=yrs;
        const moM=card.querySelector('.mo-manual'); if(moM) moM.value=yrs*12;
        if (id==='zakaut') { t.rate=getZakautRate(yrs); setText('zakautRateDisplay',t.rate.toFixed(2)+'%'); }
        recalcAllTracks();
      });
    });

    /* Manual year input */
    const yrManual=card.querySelector('.yr-manual');
    if (yrManual) yrManual.addEventListener('input', ()=>{
      const v=Math.min(30,Math.max(1,parseInt(yrManual.value)||20));
      t.years=v;
      const moM=card.querySelector('.mo-manual'); if(moM) moM.value=v*12;
      card.querySelectorAll('.track-years-row .yr').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.val)===v));
      if (id==='zakaut') { t.rate=getZakautRate(v); setText('zakautRateDisplay',t.rate.toFixed(2)+'%'); }
      recalcAllTracks();
    });

    /* Manual months input */
    const moManual=card.querySelector('.mo-manual');
    if (moManual) moManual.addEventListener('input', ()=>{
      const mo=Math.min(360,Math.max(1,parseInt(moManual.value)||240));
      const yrs=mo/12;
      t.years=yrs;
      const yrM=card.querySelector('.yr-manual'); if(yrM) yrM.value=Math.round(yrs);
      card.querySelectorAll('.track-years-row .yr').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.val)===Math.round(yrs)));
      if (id==='zakaut') { t.rate=getZakautRate(Math.round(yrs)); setText('zakautRateDisplay',t.rate.toFixed(2)+'%'); }
      recalcAllTracks();
    });

    /* Amort */
    card.querySelectorAll('.amort-row .am').forEach(btn => {
      btn.addEventListener('click', ()=>{
        card.querySelectorAll('.amort-row .am').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        t.amort=btn.dataset.val;
        const gd=document.getElementById(`${id}-grace`);
        if(gd) gd.classList.toggle('hidden', t.amort!=='grace');
        recalcAllTracks();
      });
    });
    const graceMo=card.querySelector('.grace-months');
    if(graceMo) graceMo.addEventListener('input',()=>{ t.graceMo=parseInt(graceMo.value)||12; recalcAllTracks(); });

    /* Info */
    const infoBt=card.querySelector('.info-circle');
    if(infoBt) infoBt.addEventListener('click', e=>{ e.stopPropagation(); const i=TRACK_INFO[id]; if(i) openModal(i.title,i.body); });
  });

  /* INFO BTNS */
  document.querySelectorAll('.info-btn[data-modal-title]').forEach(el => {
    el.addEventListener('click', ()=>openModal(el.dataset.modalTitle, el.dataset.modalBody));
  });

  /* MODAL */
  document.getElementById('modalClose')?.addEventListener('click', closeModal);
  document.getElementById('modalOverlay')?.addEventListener('click', e=>{ if(e.target===e.currentTarget) closeModal(); });

  /* INIT */
  updateStep1();
  recalcAllTracks();
  document.querySelectorAll('.slider').forEach(setSliderFill);
});

function openModal(title,body) { setText('modalTitle',title); setText('modalBody',body); document.getElementById('modalOverlay')?.classList.add('open'); }
function closeModal() { document.getElementById('modalOverlay')?.classList.remove('open'); }
