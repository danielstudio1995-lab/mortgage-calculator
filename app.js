'use strict';

/* ── ZAKAUT RATES Aug 2026 ── */
const ZAKAUT_RATES={5:3.00,10:2.27,15:2.37,20:2.48,25:2.57,30:2.72};
function getZakautRate(years){
  if(years<=5)  return ZAKAUT_RATES[5];
  if(years<=10) return ZAKAUT_RATES[10];
  if(years<=15) return ZAKAUT_RATES[15];
  if(years<=20) return ZAKAUT_RATES[20];
  if(years<=25) return ZAKAUT_RATES[25];
  return ZAKAUT_RATES[30];
}

/* ── STEP 3 RATE by term ── */
function getEstimateRate(years){
  if(years<=10) return 3.8;
  if(years<=15) return 4.2;
  if(years<=20) return 4.5;
  if(years<=25) return 4.8;
  return 5.2;
}
function getRateLabel(years){
  if(years<=10) return 'ריבית 3.8% — ממוצע שוק לתקופה קצרה';
  if(years<=15) return 'ריבית 4.2% — ממוצע שוק לתקופה בינונית';
  if(years<=20) return 'ריבית 4.5% — ממוצע שוק לתקופה בינונית-ארוכה';
  if(years<=25) return 'ריבית 4.8% — ממוצע שוק לתקופה ארוכה';
  return 'ריבית 5.2% — ממוצע שוק לתקופה ארוכה מאוד';
}

/* ── UTILS ── */
const fmt=n=>(isNaN(n)||n==null||n<=0)?'—':'₪'+Math.round(n).toLocaleString('he-IL');
const parseNum=s=>parseFloat(String(s).replace(/[₪,\s]/g,''))||0;
const setText=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
const formatInput=el=>{const v=parseNum(el.value);if(v>0)el.value=v.toLocaleString('he-IL');};
function setSliderFill(s){
  const pct=Math.max(0,Math.min(100,((parseFloat(s.value)-parseFloat(s.min))/(parseFloat(s.max)-parseFloat(s.min)))*100));
  s.style.background=`linear-gradient(to right,#008B1E ${pct}%,#E2E2DC ${pct}%)`;
}

/* ── MATH ── */
function spitzer(P,r,y){
  if(P<=0||r<=0||y<=0)return 0;
  const rm=r/100/12,n=y*12;
  return P*rm*Math.pow(1+rm,n)/(Math.pow(1+rm,n)-1);
}
function spitzerTotal(P,r,y){return spitzer(P,r,y)*y*12;}
function kerenInitial(P,r,y){if(P<=0||y<=0)return 0;return P/(y*12)+P*(r/100/12);}
function kerenTotal(P,r,y){if(P<=0||y<=0)return 0;const rm=r/100/12,n=y*12;return P+P*rm*(n+1)/2;}
function balloonMonthly(P,r){return P*(r/100/12);}
function gracePayments(P,r,y,gMo){
  const gp=P*(r/100/12);
  const postY=Math.max((y*12-gMo)/12,0.1);
  return{grace:gp,post:spitzer(P,r,postY)};
}
// Balloon: interest-only for balloonMo months, then remaining principal + interest at end
function balloonPayments(P,r,y,bMo){
  const monthly=balloonMonthly(P,r);
  const totalInterest=monthly*bMo;
  return{monthly,endPayment:P,totalPaid:totalInterest+P};
}

function computeTrack(id,t,totalM,cpi){
  const P=totalM*(t.pct/100);
  if(P<=0||!t.enabled)return null;
  const rate=t.rate||5,years=t.years||30,graceMo=t.graceMo||12,balloonMo=t.balloonMo||12;
  let initial=0,peak=0,total=0,balloonEnd=0;

  if(t.amort==='keren'){
    initial=kerenInitial(P,rate,years);peak=initial;total=kerenTotal(P,rate,years);
  }else if(t.amort==='balloon'){
    const bp=balloonPayments(P,rate,years,balloonMo);
    initial=bp.monthly;peak=balloonMonthly(P,rate+2);
    total=bp.totalPaid;balloonEnd=P;
  }else if(t.amort==='grace'){
    const g=gracePayments(P,rate,years,graceMo);
    initial=g.grace;peak=g.post;
    total=g.grace*graceMo+g.post*(years*12-graceMo);
  }else{
    // spitzer
    if(t.cpi){
      const eff=rate+cpi;
      initial=spitzer(P,eff,years);
      const grownP=P*Math.pow(1+cpi/100,Math.min(10,years));
      peak=spitzer(grownP,eff,Math.max(years-10,1));
      total=spitzerTotal(P,eff,years)*Math.pow(1+cpi/100,years*0.5);
    }else if(!t.fixed){
      initial=spitzer(P,rate,years);
      peak=spitzer(P,rate+2,years);
      total=spitzerTotal(P,rate,years);
    }else{
      initial=spitzer(P,rate,years);peak=initial;total=spitzerTotal(P,rate,years);
    }
  }
  const per1=P>0&&total>0?total/P:0;
  return{P,initial,peak,total,interest:total-P,balloonEnd,per1};
}

/* ── STATE ── */
const STATE={
  purchaseType:'first',maxLTV:75,
  propertyPrice:2_000_000,equityAmount:500_000,
  globalYears:20,marketValue:1_600_000,hasGrant:false,
  driver:'price',
  totalMortgage:1_500_000,inflationRate:2.0,
  tracks:{
    kalatz:{enabled:true,pct:33,rate:4.50,years:30,amort:'spitzer',fixed:true, cpi:false,graceMo:12,balloonMo:12},
    katz:  {enabled:true,pct:0, rate:2.50,years:30,amort:'spitzer',fixed:true, cpi:true, graceMo:12,balloonMo:12},
    zakaut:{enabled:true,pct:0, rate:2.72,years:30,amort:'spitzer',fixed:true, cpi:true, graceMo:12,balloonMo:12},
    prime: {enabled:true,pct:34,rate:5.50,years:30,amort:'spitzer',fixed:false,cpi:false,graceMo:12,balloonMo:12},
    makam: {enabled:true,pct:0, rate:4.00,years:30,amort:'spitzer',fixed:false,cpi:false,graceMo:12,balloonMo:12},
    mcz:   {enabled:true,pct:0, rate:3.50,years:30,amort:'spitzer',fixed:false,cpi:true, graceMo:12,balloonMo:12,interval:5},
    mlcz:  {enabled:true,pct:0, rate:5.00,years:30,amort:'spitzer',fixed:false,cpi:false,graceMo:12,balloonMo:12,interval:5},
  },
  savedMixes:[],
};

const TRACK_LABELS={kalatz:'קל"צ',katz:'ק"צ',zakaut:'זכאות',prime:'פריים',makam:'מק"מ',mcz:'מ"צ',mlcz:'מל"צ'};
const TRACK_COLORS=['#008B1E','#AEE27B','#D3A742','#5b21b6','#9d174d','#1e40af','#0f766e'];
const TRACK_INFO={
  kalatz:{title:'קבועה לא צמודה (קל"צ)',body:'ריבית קבועה לכל אורך חיי ההלוואה, ללא הצמדה. ההחזר קבוע ויציב לחלוטין.'},
  katz:  {title:'קבועה צמודת מדד (ק"צ)',body:'ריבית קבועה, אך הקרן צמודה למדד. ריבית נמינלית נמוכה, אך ההחזר גדל עם האינפלציה.'},
  zakaut:{title:'הלוואת זכאות',body:'הלוואה מטעם המדינה בריבית קבועה צמודה. ריביות אוגוסט 2026: עד 5 שנים 3%, עד 10 שנים 2.27%, עד 15 שנים 2.37%, עד 20 שנים 2.48%, עד 25 שנים 2.57%, מעל 25 שנים 2.72%.'},
  prime: {title:'פריים',body:'ריבית בנק ישראל + 1.5%. גמיש לפירעון מוקדם ללא עמלה. חשוף לשינויי ריבית בנק ישראל.'},
  makam: {title:'מק"מ — משתנה שנתי',body:'הריבית מתעדכנת מדי שנה לפי תשואת המק"מ. תחנת ריבית קצרה — חשוף לשינויים שנתיים.'},
  mcz:   {title:'משתנה צמודת מדד (מ"צ)',body:'ריבית מתעדכנת בכל תכיפות לשינוי עם הצמדה למדד. טווח 2%–5%.'},
  mlcz:  {title:'משתנה לא צמודה (מל"צ)',body:'ריבית מתעדכנת בכל תכיפות לשינוי ללא הצמדה. טווח 3.5%–6.5%.'},
};

/* ── PAGE 1 ── */
function updateStep1(){
  const{purchaseType,maxLTV,propertyPrice,equityAmount,driver,marketValue,hasGrant}=STATE;
  const warning=document.getElementById('ltvWarning');
  const priceHint=document.getElementById('priceHint');
  const equityHint=document.getElementById('equityHint');
  let mortgage=0,valid=true,ltvPct=0,equityPct=0;

  if(purchaseType==='discounted'){
    const cap=2_100_000;
    const effMV=Math.min(marketValue,cap);
    const bankAmt=effMV*0.75;
    const calcEquity=propertyPrice-bankAmt; // what's left for buyer
    const minFloor=hasGrant?60_000:100_000;
    // Min equity is the HIGHER of the calculated requirement or the floor
    const requiredEquity=Math.max(calcEquity,minFloor);
    mortgage=bankAmt;
    equityPct=propertyPrice>0?(requiredEquity/propertyPrice*100):25;
    ltvPct=100-equityPct;
    if(priceHint) priceHint.textContent=`הון עצמי נדרש: ${Math.ceil(requiredEquity).toLocaleString('he-IL')} ₪`;
    if(equityHint) equityHint.textContent=`מימון בנקאי: ${fmt(bankAmt)}`;
    const capNote=document.getElementById('marketValueCapNote');
    if(capNote) capNote.textContent=marketValue>cap?'⚠️ מעל התקרה — מחושב לפי 2,100,000 ₪':'';
    warning.classList.add('hidden');
  }else if(driver==='price'){
    const minEquity=propertyPrice*(100-maxLTV)/100;
    mortgage=propertyPrice-equityAmount;
    ltvPct=propertyPrice>0?(mortgage/propertyPrice*100):0;
    equityPct=100-ltvPct;
    if(priceHint) priceHint.textContent='';
    if(equityHint) equityHint.textContent=`הון עצמי מינימלי: ${Math.ceil(minEquity).toLocaleString('he-IL')} ₪`;
    if(ltvPct>maxLTV){
      const needed=Math.ceil(propertyPrice*(100-maxLTV)/100);
      warning.textContent=`⚠️ מימון (${ltvPct.toFixed(0)}%) חורג מהמותר. הגדילו הון עצמי ל-${needed.toLocaleString('he-IL')} ₪`;
      warning.classList.remove('hidden');valid=false;
    }else warning.classList.add('hidden');
  }else{
    const maxPrice=equityAmount/((100-maxLTV)/100);
    mortgage=maxPrice*(maxLTV/100);ltvPct=maxLTV;equityPct=100-maxLTV;
    if(equityHint) equityHint.textContent='';
    if(priceHint) priceHint.textContent=`מחיר דירה מקסימלי: ${fmt(maxPrice)}`;
    const propEl=document.getElementById('propertyPrice'),propSld=document.getElementById('propertySlider');
    if(propEl) propEl.value=Math.round(maxPrice).toLocaleString('he-IL');
    if(propSld){propSld.value=Math.min(maxPrice,parseFloat(propSld.max));setSliderFill(propSld);}
    STATE.propertyPrice=maxPrice;
    warning.classList.add('hidden');
  }

  // LTV bar
  const fill=document.getElementById('ltvFill');
  if(fill) fill.style.width=Math.max(0,Math.min(equityPct,100))+'%';
  setText('equityPct',equityPct.toFixed(0)+'%');
  setText('ltvPct',Math.max(0,ltvPct).toFixed(0)+'%');

  updateMonthlyEstimate(mortgage);

  const amountEl=document.getElementById('mortgageAmount'),subEl=document.getElementById('resultSub');
  if(valid&&mortgage>0){
    if(amountEl) amountEl.textContent=fmt(mortgage);
    if(subEl) subEl.textContent=purchaseType==='discounted'
      ?`75% מימון מ-${fmt(Math.min(marketValue,2_100_000))}`
      :`${Math.max(0,ltvPct).toFixed(0)}% מימון מתוך ${fmt(STATE.propertyPrice)}`;
    STATE.totalMortgage=Math.max(0,mortgage);
    syncTotalMortgageField();
  }else{
    if(amountEl) amountEl.textContent='—';
    if(subEl) subEl.textContent=valid?'הזינו נתונים לחישוב':'תקנו את הנתונים';
  }
}

function updateMonthlyEstimate(mortgage){
  const box=document.getElementById('monthlyEstimateBox');
  if(!box)return;
  if(mortgage>0){
    const y=STATE.globalYears;
    const r=getEstimateRate(y);
    const monthly=spitzer(mortgage,r,y);
    box.classList.add('visible');
    setText('monthlyEstimate',fmt(monthly)+' לחודש');
    setText('meNote',getRateLabel(y));
    setText('monthlyEstimateSub',`לתקופה של ${y} שנים`);
  }else{
    box.classList.remove('visible');
  }
}

function syncTotalMortgageField(){
  const el=document.getElementById('totalMortgage'),sld=document.getElementById('totalMortgageSlider');
  if(el) el.value=Math.round(STATE.totalMortgage).toLocaleString('he-IL');
  if(sld){sld.value=Math.min(STATE.totalMortgage,parseFloat(sld.max));setSliderFill(sld);}
  recalcAllTracks();
}

function setDriver(d){
  STATE.driver=d;
  document.getElementById('driverPrice')?.classList.toggle('active',d==='price');
  document.getElementById('driverEquity')?.classList.toggle('active',d==='equity');
  document.getElementById('priceWrap')?.classList.toggle('primary-driver',d==='price');
  document.getElementById('equityWrap')?.classList.toggle('primary-driver',d==='equity');
  updateStep1();
}

/* ── PCT / AMT SYNC ── */
function syncPctAmt(id,pct){
  const total=STATE.totalMortgage;
  const amt=Math.round(total*(pct/100));
  const amtEl=document.getElementById(`${id}AmtNum`);
  if(amtEl) amtEl.value=amt>0?amt.toLocaleString('he-IL'):'0';
  const pctEl=document.getElementById(`${id}PctNum`);
  if(pctEl) pctEl.value=pct;
  const sld=document.getElementById(`${id}PctSlider`);
  if(sld){sld.value=pct;setSliderFill(sld);}
  setText(`${id}Pct`,pct+'%');
}
function syncAmtPct(id,amt){
  const total=STATE.totalMortgage;
  const pct=total>0?Math.round(amt/total*100):0;
  const pctEl=document.getElementById(`${id}PctNum`);
  if(pctEl) pctEl.value=pct;
  const sld=document.getElementById(`${id}PctSlider`);
  if(sld){sld.value=pct;setSliderFill(sld);}
  setText(`${id}Pct`,pct+'%');
  STATE.tracks[id].pct=pct;
}

/* ── PAGE 2 RECALC ── */
function recalcAllTracks(){
  // Update amt fields when total changes
  Object.keys(STATE.tracks).forEach(id=>syncPctAmt(id,STATE.tracks[id].pct));

  const totalM=STATE.totalMortgage,cpi=STATE.inflationRate;
  let totalMonthly=0,totalPeak=0,totalInterest=0,grandTotal=0;
  let fixedPct=0,activePct=0,activeCount=0;
  const breakdowns=[];

  Object.entries(STATE.tracks).forEach(([id,t],i)=>{
    if(!t.enabled)return;
    const res=computeTrack(id,t,totalM,cpi);
    if(!res||res.P<=0)return;
    activeCount++;activePct+=t.pct;
    totalMonthly+=res.initial;totalPeak+=res.peak;
    totalInterest+=res.interest;grandTotal+=res.total;
    if(t.fixed)fixedPct+=t.pct;

    setText(`${id}Monthly`,fmt(res.initial));
    setText(`${id}Per1`,res.per1>0?res.per1.toFixed(2):'—');
    setText(`${id}Peak`,fmt(res.peak));
    setText(`${id}Total`,fmt(res.total));

    // Balloon end
    const balloonEndEl=document.getElementById(`${id}BalloonEnd`);
    const balloonEndRow=document.getElementById(`${id}-balloon-end`);
    if(t.amort==='balloon'){
      if(balloonEndEl) balloonEndEl.textContent=fmt(res.balloonEnd);
      if(balloonEndRow) balloonEndRow.classList.remove('hidden');
    }else{
      if(balloonEndRow) balloonEndRow.classList.add('hidden');
    }

    breakdowns.push({id,pct:t.pct,initial:res.initial,peak:res.peak,total:res.total,per1:res.per1,color:TRACK_COLORS[i%TRACK_COLORS.length]});
  });

  const fixedOk=fixedPct>=33.3;
  setText('fixedPct',Math.round(fixedPct)+'%');
  setText('fixedCheck',fixedOk?'✅':'❌');
  document.getElementById('fixedTrackRule')?.classList.toggle('ok',fixedOk);

  const pctBar=document.getElementById('totalPctBar'),pctMsg=document.getElementById('totalPctMsg');
  if(pctMsg){
    const ok=Math.abs(activePct-100)<1;
    pctBar?.classList.toggle('ok',ok);
    pctMsg.innerHTML=ok
      ?`✅ סכום האחוזים: <strong>100%</strong>`
      :`⚠️ סכום האחוזים הפעילים: <strong>${Math.round(activePct)}%</strong> — נא לוודא שמגיעים ל-100%`;
  }

  setText('totalMonthly',activeCount?fmt(totalMonthly):'—');
  setText('totalPeak',activeCount?fmt(totalPeak):'—');
  setText('totalInterestCost',activeCount?fmt(totalInterest):'—');
  setText('grandTotal',activeCount?fmt(grandTotal):'—');
  setText('activeTracks',`${activeCount} מסלולים פעילים`);

  renderBreakdown(breakdowns);
}

function renderBreakdown(items){
  const list=document.getElementById('breakdownList'),bar=document.getElementById('mixBar');
  if(!list||!bar)return;
  list.innerHTML='';bar.innerHTML='';
  items.forEach(item=>{
    const hasPeak=item.peak>item.initial*1.005;
    const div=document.createElement('div');
    div.className='breakdown-item';
    div.innerHTML=`<div class="breakdown-item-name"><span class="track-dot" style="background:${item.color}"></span><div><div class="breakdown-name">${TRACK_LABELS[item.id]||item.id}</div><div class="breakdown-detail">${Math.round(item.pct)}% מהתמהיל</div></div></div><div class="breakdown-figures"><span class="breakdown-monthly">${fmt(item.initial)}/חודש</span>${hasPeak?`<span class="breakdown-peak">שיא: ${fmt(item.peak)}</span>`:''}<span class="breakdown-total">סך: ${fmt(item.total)}</span></div>`;
    list.appendChild(div);
    const seg=document.createElement('div');
    seg.style.cssText=`flex:${item.pct};background:${item.color};`;
    bar.appendChild(seg);
  });
}

/* ── SAVE & COMPARE ── */
function getCurrentMixSnapshot(){
  const totalM=STATE.totalMortgage,cpi=STATE.inflationRate;
  let totalMonthly=0,totalPeak=0,totalInterest=0,grandTotal=0;
  const tracks=[];
  Object.entries(STATE.tracks).forEach(([id,t])=>{
    if(!t.enabled)return;
    const res=computeTrack(id,t,totalM,cpi);
    if(!res||res.P<=0)return;
    totalMonthly+=res.initial;totalPeak+=res.peak;totalInterest+=res.interest;grandTotal+=res.total;
    tracks.push({id,pct:t.pct,rate:t.rate,years:t.years,monthly:res.initial,total:res.total,per1:res.per1});
  });
  return{totalMortgage:totalM,totalMonthly,totalPeak,totalInterest,grandTotal,tracks};
}

function renderCompareTable(){
  const wrap=document.getElementById('compareTableWrap');
  if(!wrap)return;
  if(STATE.savedMixes.length===0){
    wrap.innerHTML='<p class="compare-empty">שמרו תמהיל אחד או יותר כדי להשוות</p>';
    return;
  }
  const mixes=STATE.savedMixes;
  const bestMonthly=Math.min(...mixes.map(m=>m.data.totalMonthly));
  const bestTotal=Math.min(...mixes.map(m=>m.data.grandTotal));

  let html='<table class="compare-table"><thead><tr><th>קטגוריה</th>';
  mixes.forEach(m=>html+=`<th>${m.name} <button class="delete-mix-btn" data-mix-id="${m.id}">✕</button></th>`);
  html+='</tr></thead><tbody>';

  const rows=[
    ['סכום משכנתא','totalMortgage',v=>fmt(v)],
    ['החזר חודשי','totalMonthly',v=>fmt(v),'bestMonthly'],
    ['החזר חודשי בשיא','totalPeak',v=>fmt(v)],
    ['עלות ריבית','totalInterest',v=>fmt(v)],
    ['סך החזר כולל','grandTotal',v=>fmt(v),'bestTotal'],
  ];
  rows.forEach(([label,key,fmtFn,bestKey])=>{
    html+=`<tr><td><strong>${label}</strong></td>`;
    mixes.forEach(m=>{
      const val=m.data[key];
      const isBest=bestKey&&((bestKey==='bestMonthly'&&val===bestMonthly)||(bestKey==='bestTotal'&&val===bestTotal));
      html+=`<td class="${isBest?'best':''}">${fmtFn(val)}${isBest?' ⭐':''}</td>`;
    });
    html+='</tr>';
  });

  // Track rows
  const allTrackIds=[...new Set(mixes.flatMap(m=>m.data.tracks.map(t=>t.id)))];
  allTrackIds.forEach(tid=>{
    html+=`<tr><td><em>${TRACK_LABELS[tid]||tid}</em></td>`;
    mixes.forEach(m=>{
      const t=m.data.tracks.find(t=>t.id===tid);
      html+=`<td>${t?`${t.pct}% | ${t.rate.toFixed(2)}% | ${Math.round(t.years)}שנ`:'—'}</td>`;
    });
    html+='</tr>';
  });

  html+='</tbody></table>';
  wrap.innerHTML=html;

  wrap.querySelectorAll('.delete-mix-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const id=parseInt(btn.dataset.mixId);
      STATE.savedMixes=STATE.savedMixes.filter(m=>m.id!==id);
      renderCompareTable();
    });
  });
}

/* ── BIND HELPER ── */
function bindNumSlider(inputId,sliderId,onChange){
  const inp=document.getElementById(inputId),sld=document.getElementById(sliderId);
  if(inp){
    inp.addEventListener('input',()=>{const v=parseNum(inp.value);if(sld){sld.value=Math.min(v,parseFloat(sld.max));setSliderFill(sld);}onChange(v);});
    inp.addEventListener('blur',()=>formatInput(inp));
  }
  if(sld){
    sld.addEventListener('input',()=>{const v=parseFloat(sld.value);if(inp)inp.value=Math.round(v).toLocaleString('he-IL');setSliderFill(sld);onChange(v);});
    setSliderFill(sld);
  }
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded',()=>{

  /* TABS */
  document.querySelectorAll('.tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      const step=tab.dataset.step;
      document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t===tab));
      document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===`step${step}`));
      if(step==='2')recalcAllTracks();
    });
  });

  /* PURCHASE TYPES */
  document.querySelectorAll('.purchase-card').forEach(card=>{
    card.addEventListener('click',()=>{
      document.querySelectorAll('.purchase-card').forEach(c=>c.classList.remove('active'));
      card.classList.add('active');
      STATE.purchaseType=card.dataset.type;STATE.maxLTV=parseInt(card.dataset.ltv);
      document.getElementById('discountedFields')?.classList.toggle('visible',STATE.purchaseType==='discounted');
      updateStep1();
    });
  });

  /* DRIVER */
  document.getElementById('driverPrice')?.addEventListener('click',()=>setDriver('price'));
  document.getElementById('driverEquity')?.addEventListener('click',()=>setDriver('equity'));
  document.getElementById('swapBtn')?.addEventListener('click',()=>setDriver(STATE.driver==='price'?'equity':'price'));
  setDriver('price');

  /* GRANT */
  document.getElementById('hasGrant')?.addEventListener('change',e=>{
    STATE.hasGrant=e.target.checked;
    document.getElementById('grantNote')?.classList.toggle('hidden',e.target.checked);
    document.getElementById('grantYesNote')?.classList.toggle('hidden',!e.target.checked);
    updateStep1();
  });

  /* MARKET VALUE */
  bindNumSlider('marketValue','marketValueSlider',v=>{STATE.marketValue=v;updateStep1();});

  /* PROPERTY & EQUITY */
  bindNumSlider('propertyPrice','propertySlider',v=>{STATE.propertyPrice=v;if(STATE.driver==='price')updateStep1();});
  bindNumSlider('equityAmount','equitySlider',v=>{STATE.equityAmount=v;updateStep1();});

  /* YEARS PAGE 1 */
  document.querySelectorAll('#step1 .year-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('#step1 .year-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      STATE.globalYears=parseInt(btn.dataset.years);
      const m=document.getElementById('yearsManual');if(m)m.value=STATE.globalYears;
      updateMonthlyEstimate(STATE.totalMortgage);
    });
  });
  document.getElementById('yearsManual')?.addEventListener('input',e=>{
    const v=Math.min(30,Math.max(1,parseInt(e.target.value)||20));
    STATE.globalYears=v;
    document.querySelectorAll('#step1 .year-btn').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.years)===v));
    updateMonthlyEstimate(STATE.totalMortgage);
  });

  /* CTA */
  document.getElementById('goToStep2Btn')?.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',i===1));
    document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='step2'));
    recalcAllTracks();
  });

  /* ZAKAUT UPSELL */
  document.getElementById('zakautUpsell')?.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',i===1));
    document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='step2'));
    setTimeout(()=>{document.querySelector('[data-track="zakaut"]')?.scrollIntoView({behavior:'smooth',block:'start'});},200);
    recalcAllTracks();
  });
  document.getElementById('zakautBtn')?.addEventListener('click',e=>{e.stopPropagation();document.getElementById('zakautUpsell')?.click();});

  /* TOTAL MORTGAGE */
  bindNumSlider('totalMortgage','totalMortgageSlider',v=>{STATE.totalMortgage=v;recalcAllTracks();});

  /* INFLATION */
  document.getElementById('inflPlus')?.addEventListener('click',()=>{STATE.inflationRate=Math.min(10,+(STATE.inflationRate+0.5).toFixed(1));setText('inflationRate',STATE.inflationRate+'%');recalcAllTracks();});
  document.getElementById('inflMinus')?.addEventListener('click',()=>{STATE.inflationRate=Math.max(0,+(STATE.inflationRate-0.5).toFixed(1));setText('inflationRate',STATE.inflationRate+'%');recalcAllTracks();});

  /* GROUP COLLAPSE */
  ['Fixed','Var'].forEach(g=>{
    const btn=document.getElementById(`group${g}Btn`),body=document.getElementById(`group${g}`),arrow=document.getElementById(`group${g}Arrow`);
    if(btn&&body&&arrow){
      btn.addEventListener('click',()=>{
        const collapsed=body.classList.toggle('collapsed');
        arrow.classList.toggle('closed',collapsed);
      });
    }
  });

  /* INTERVAL SLIDERS */
  ['mcz','mlcz'].forEach(id=>{
    const sld=document.getElementById(`${id}IntervalSlider`);
    if(sld){sld.addEventListener('input',()=>{STATE.tracks[id].interval=parseInt(sld.value);setText(`${id}Interval`,sld.value+' שנים');setSliderFill(sld);recalcAllTracks();});setSliderFill(sld);}
  });

  /* TRACK CARDS */
  document.querySelectorAll('.track-card').forEach(card=>{
    const id=card.dataset.track,t=STATE.tracks[id];
    if(!t)return;

    /* Enable */
    const cb=card.querySelector('.track-enable');
    if(cb)cb.addEventListener('change',()=>{t.enabled=cb.checked;card.classList.toggle('enabled',t.enabled);recalcAllTracks();});

    /* PCT SLIDER */
    const pctSld=card.querySelector('.track-pct-slider');
    if(pctSld){
      pctSld.addEventListener('input',()=>{
        t.pct=parseInt(pctSld.value);
        syncPctAmt(id,t.pct);
        recalcAllTracks();
      });
      setSliderFill(pctSld);
    }

    /* PCT NUM INPUT */
    const pctNum=card.querySelector('.pct-input');
    if(pctNum){
      pctNum.addEventListener('input',()=>{
        const v=Math.max(0,Math.min(id==='zakaut'?33:100,parseInt(pctNum.value)||0));
        t.pct=v;syncPctAmt(id,v);recalcAllTracks();
      });
    }

    /* AMT NUM INPUT */
    const amtNum=card.querySelector('.amt-input');
    if(amtNum){
      amtNum.addEventListener('input',()=>{
        const v=parseNum(amtNum.value);
        syncAmtPct(id,v);recalcAllTracks();
      });
      amtNum.addEventListener('blur',()=>formatInput(amtNum));
    }

    /* RATE SLIDER */
    const rateSld=card.querySelector('.rate-slider');
    if(rateSld&&id!=='zakaut'){
      rateSld.addEventListener('input',()=>{
        t.rate=parseInt(rateSld.value)/100;
        setText(`${id}Rate`,t.rate.toFixed(2)+'%');
        setSliderFill(rateSld);recalcAllTracks();
      });
      setSliderFill(rateSld);
    }

    /* ZAKAUT AUTO-RATE */
    if(id==='zakaut'){const updateZR=y=>{t.rate=getZakautRate(y);t.years=y;setText('zakautRateDisplay',t.rate.toFixed(2)+'%');recalcAllTracks();};updateZR(t.years);}

    /* YEAR BUTTONS */
    card.querySelectorAll('.track-years-row .yr').forEach(btn=>{
      btn.addEventListener('click',()=>{
        card.querySelectorAll('.track-years-row .yr').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const yrs=parseInt(btn.dataset.val);t.years=yrs;
        const yrM=card.querySelector('.yr-manual');if(yrM)yrM.value=yrs;
        const moM=card.querySelector('.mo-manual');if(moM)moM.value=yrs*12;
        if(id==='zakaut'){t.rate=getZakautRate(yrs);setText('zakautRateDisplay',t.rate.toFixed(2)+'%');}
        recalcAllTracks();
      });
    });

    /* MANUAL YEARS */
    const yrM=card.querySelector('.yr-manual');
    if(yrM)yrM.addEventListener('input',()=>{
      const v=Math.min(30,Math.max(1,parseInt(yrM.value)||30));t.years=v;
      const moM=card.querySelector('.mo-manual');if(moM)moM.value=Math.round(v*12);
      card.querySelectorAll('.track-years-row .yr').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.val)===v));
      if(id==='zakaut'){t.rate=getZakautRate(v);setText('zakautRateDisplay',t.rate.toFixed(2)+'%');}
      recalcAllTracks();
    });

    /* MANUAL MONTHS */
    const moM=card.querySelector('.mo-manual');
    if(moM)moM.addEventListener('input',()=>{
      const mo=Math.min(360,Math.max(1,parseInt(moM.value)||360));t.years=mo/12;
      const yrMEl=card.querySelector('.yr-manual');if(yrMEl)yrMEl.value=Math.round(t.years);
      card.querySelectorAll('.track-years-row .yr').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.val)===Math.round(t.years)));
      if(id==='zakaut'){t.rate=getZakautRate(Math.round(t.years));setText('zakautRateDisplay',t.rate.toFixed(2)+'%');}
      recalcAllTracks();
    });

    /* AMORT */
    card.querySelectorAll('.amort-row .am').forEach(btn=>{
      btn.addEventListener('click',()=>{
        card.querySelectorAll('.amort-row .am').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');t.amort=btn.dataset.val;
        const gd=document.getElementById(`${id}-grace`);if(gd)gd.classList.toggle('hidden',t.amort!=='grace');
        const bd=document.getElementById(`${id}-balloon`);if(bd)bd.classList.toggle('hidden',t.amort!=='balloon');
        recalcAllTracks();
      });
    });
    card.querySelector('.grace-months')?.addEventListener('input',e=>{t.graceMo=parseInt(e.target.value)||12;recalcAllTracks();});
    card.querySelector('.balloon-months')?.addEventListener('input',e=>{t.balloonMo=parseInt(e.target.value)||12;recalcAllTracks();});

    /* INFO */
    card.querySelector('.info-circle')?.addEventListener('click',e=>{e.stopPropagation();const i=TRACK_INFO[id];if(i)openModal(i.title,i.body);});
  });

  /* INFO BTN */
  document.querySelectorAll('.info-btn[data-modal-title]').forEach(el=>{
    el.addEventListener('click',()=>openModal(el.dataset.modalTitle,el.dataset.modalBody));
  });

  /* MODAL */
  document.getElementById('modalClose')?.addEventListener('click',closeModal);
  document.getElementById('modalOverlay')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal();});

  /* SAVE MIX */
  document.getElementById('saveMixBtn')?.addEventListener('click',()=>{
    const nameEl=document.getElementById('mixName');
    const name=(nameEl?.value.trim())||`תמהיל ${STATE.savedMixes.length+1}`;
    STATE.savedMixes.push({id:Date.now(),name,data:getCurrentMixSnapshot()});
    if(nameEl)nameEl.value='';
    renderCompareTable();
  });
  document.getElementById('clearCompareBtn')?.addEventListener('click',()=>{STATE.savedMixes=[];renderCompareTable();});

  /* INIT */
  updateStep1();recalcAllTracks();renderCompareTable();
  document.querySelectorAll('.slider').forEach(setSliderFill);
});

function openModal(t,b){setText('modalTitle',t);setText('modalBody',b);document.getElementById('modalOverlay')?.classList.add('open');}
function closeModal(){document.getElementById('modalOverlay')?.classList.remove('open');}
