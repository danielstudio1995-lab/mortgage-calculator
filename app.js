'use strict';

/* ── ZAKAUT RATES Aug 2026 ── */
const ZAKAUT_RATES={5:3.00,10:2.27,15:2.37,20:2.48,25:2.57,30:2.72};
function getZakautRate(y){
  if(y<=5)return ZAKAUT_RATES[5];if(y<=10)return ZAKAUT_RATES[10];
  if(y<=15)return ZAKAUT_RATES[15];if(y<=20)return ZAKAUT_RATES[20];
  if(y<=25)return ZAKAUT_RATES[25];return ZAKAUT_RATES[30];
}

/* ── UTILS ── */
const fmt=n=>(isNaN(n)||n==null||n<=0)?'—':'₪'+Math.round(n).toLocaleString('he-IL');
const parseNum=s=>parseFloat(String(s).replace(/[₪,\s]/g,''))||0;
const setText=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
const formatInput=el=>{const v=parseNum(el.value);el.value=v>0?v.toLocaleString('he-IL'):'0';};
function setSliderFill(s){
  if(!s)return;
  const pct=Math.max(0,Math.min(100,((parseFloat(s.value)-parseFloat(s.min))/(parseFloat(s.max)-parseFloat(s.min)))*100));
  s.style.background=`linear-gradient(to left,#008B1E ${pct}%,#E2E2DC ${pct}%)`;
}

/* ══════════════════════════════════════
   VERIFIED MORTGAGE MATH
══════════════════════════════════════ */
function spitzer(P,r,y){
  if(P<=0||r<=0||y<=0)return 0;
  const rm=r/100/12,n=Math.round(y*12);
  return P*rm*Math.pow(1+rm,n)/(Math.pow(1+rm,n)-1);
}
function spitzerTotal(P,r,y){return spitzer(P,r,y)*Math.round(y*12);}

function kerenInitial(P,r,y){
  if(P<=0||y<=0)return 0;
  const n=Math.round(y*12),rm=r/100/12;
  return P/n+P*rm;
}
function kerenTotal(P,r,y){
  if(P<=0||y<=0)return P;
  const n=Math.round(y*12),rm=r/100/12;
  return P+P*rm*(n+1)/2;
}

function balloonMonthly(P,r){return P*(r/100/12);}
function balloonTotal(P,r,y){return balloonMonthly(P,r)*Math.round(y*12)+P;}

function gracePayments(P,r,y,graceMo){
  const gracePmt=P*(r/100/12);
  const remainMo=Math.max(Math.round(y*12)-graceMo,1);
  const postPmt=spitzer(P,r,remainMo/12);
  return{grace:gracePmt,post:postPmt,total:gracePmt*graceMo+postPmt*remainMo};
}

function cpiSpitzer(P,nomRate,years,annualCPI){
  const effRate=nomRate+annualCPI;
  const monthly=spitzer(P,effRate,years);
  const total=spitzerTotal(P,effRate,years);
  const elapsed=Math.min(10,years);
  const grownP=P*Math.pow(1+annualCPI/100,elapsed);
  const peak=spitzer(grownP,effRate,Math.max(years-elapsed,1));
  return{monthly,total,peak,per1:total/P};
}

function computeTrack(id,t,totalM,cpi){
  const P=t.amt>0?t.amt:totalM*(t.pct/100);
  if(P<=0||!t.enabled)return null;
  const rate=t.rate||5,years=t.years||30,graceMo=t.graceMo||12;
  let initial=0,peak=0,total=0,balloonEnd=0,per1=0;

  if(t.amort==='keren'){
    initial=kerenInitial(P,rate,years);peak=initial;
    total=kerenTotal(P,rate,years);per1=total/P;
  }else if(t.amort==='balloon'){
    initial=balloonMonthly(P,rate);peak=balloonMonthly(P,rate+2);
    total=balloonTotal(P,rate,years);balloonEnd=P;per1=total/P;
  }else if(t.amort==='grace'){
    const g=gracePayments(P,rate,years,graceMo);
    initial=g.grace;peak=g.post;total=g.total;per1=total/P;
  }else{
    if(t.cpi){const c=cpiSpitzer(P,rate,years,cpi);initial=c.monthly;peak=c.peak;total=c.total;per1=c.per1;}
    else if(!t.fixed){initial=spitzer(P,rate,years);peak=spitzer(P,rate+2,years);total=spitzerTotal(P,rate,years);per1=total/P;}
    else{initial=spitzer(P,rate,years);peak=initial;total=spitzerTotal(P,rate,years);per1=total/P;}
  }
  return{P,initial,peak,total,interest:total-P,balloonEnd,per1};
}

/* ── STATE ── */
const STATE={
  purchaseType:'first',maxLTV:75,
  propertyPrice:2_000_000,equityAmount:500_000,
  marketValue:1_600_000,hasGrant:false,driver:'price',
  totalMortgage:1_000_000,inflationRate:2.0,
  tracks:{
    kalatz:{enabled:true,pct:33,amt:330000,rate:4.50,years:30,amort:'spitzer',fixed:true, cpi:false,graceMo:12,balloonMo:12},
    katz:  {enabled:true,pct:0, amt:0,     rate:2.50,years:30,amort:'spitzer',fixed:true, cpi:true, graceMo:12,balloonMo:12},
    zakaut:{enabled:true,pct:0, amt:0,     rate:2.72,years:30,amort:'spitzer',fixed:true, cpi:true, graceMo:12,balloonMo:12},
    prime: {enabled:true,pct:34,amt:340000,rate:5.50,years:30,amort:'spitzer',fixed:false,cpi:false,graceMo:12,balloonMo:12},
    makam: {enabled:true,pct:0, amt:0,     rate:4.00,years:30,amort:'spitzer',fixed:false,cpi:false,graceMo:12,balloonMo:12},
    mcz:   {enabled:true,pct:0, amt:0,     rate:3.50,years:30,amort:'spitzer',fixed:false,cpi:true, graceMo:12,balloonMo:12,interval:5},
    mlcz:  {enabled:true,pct:0, amt:0,     rate:5.00,years:30,amort:'spitzer',fixed:false,cpi:false,graceMo:12,balloonMo:12,interval:5},
  },
  savedMixes:[],
};

const TRACK_LABELS={kalatz:'קל"צ',katz:'ק"צ',zakaut:'זכאות',prime:'פריים',makam:'מק"מ',mcz:'מ"צ',mlcz:'מל"צ'};
const TRACK_COLORS=['#008B1E','#AEE27B','#D3A742','#5b21b6','#9d174d','#1e40af','#0f766e'];
const TRACK_INFO={
  kalatz:{title:'קבועה לא צמודה (קל"צ)',body:'ריבית קבועה לכל אורך חיי ההלוואה, ללא הצמדה. ההחזר קבוע ויציב לחלוטין.'},
  katz:  {title:'קבועה צמודת מדד (ק"צ)',body:'ריבית קבועה, אך הקרן צמודה למדד. ריבית נמינלית נמוכה, אך ההחזר גדל עם האינפלציה.'},
  zakaut:{title:'הלוואת זכאות',body:'הלוואה מטעם המדינה בריבית קבועה צמודה. ריביות אוגוסט 2026: עד 5 שנים 3%, עד 10 שנים 2.27%, עד 15 שנים 2.37%, עד 20 שנים 2.48%, עד 25 שנים 2.57%, מעל 25 שנים 2.72%.'},
  prime: {title:'פריים',body:'ריבית = ריבית בנק ישראל + 1.5%. גמיש לפירעון מוקדם. ההחזר בשיא מחושב לפי תרחיש עליית ריבית של 2%.'},
  makam: {title:'מק"מ — משתנה שנתי',body:'הריבית מתעדכנת מדי שנה לפי תשואת המק"מ של בנק ישראל.'},
  mcz:   {title:'משתנה צמודת מדד (מ"צ)',body:'ריבית מתעדכנת בכל תכיפות שינוי עם הצמדה למדד. טווח 2%–5%.'},
  mlcz:  {title:'משתנה לא צמודה (מל"צ)',body:'ריבית מתעדכנת בכל תכיפות שינוי ללא הצמדה. טווח 3.5%–6.5%.'},
};

/* ── PAGE 1 ── */
function updateStep1(){
  const{purchaseType,maxLTV,propertyPrice,equityAmount,driver,marketValue,hasGrant}=STATE;
  const warning=document.getElementById('ltvWarning');
  let mortgage=0,valid=true,ltvPct=0,equityPct=0;

  if(purchaseType==='discounted'){
    const cap=2_100_000,effMV=Math.min(marketValue,cap);
    const bankAmt=effMV*0.75;
    const calcEquity=propertyPrice-bankAmt;
    const minFloor=hasGrant?60_000:100_000;
    const reqEquity=Math.max(calcEquity,minFloor);
    mortgage=bankAmt;
    setText('drBankAmt',fmt(bankAmt));setText('drEquityNeeded',fmt(reqEquity));
    const cn=document.getElementById('marketValueCapNote');
    if(cn)cn.textContent=marketValue>cap?'⚠️ מעל התקרה — מחושב לפי 2,100,000 ₪':'';
    equityPct=propertyPrice>0?(reqEquity/propertyPrice*100):25;ltvPct=100-equityPct;
    if(warning)warning.classList.add('hidden');
  }else if(driver==='price'){
    const minEq=propertyPrice*(100-maxLTV)/100;
    mortgage=propertyPrice-equityAmount;
    ltvPct=propertyPrice>0?(mortgage/propertyPrice*100):0;equityPct=100-ltvPct;
    const eh=document.getElementById('equityHint');if(eh)eh.textContent=`מינימום הון עצמי: ${Math.ceil(minEq).toLocaleString('he-IL')} ₪`;
    const ph=document.getElementById('priceHint');if(ph)ph.textContent='';
    if(ltvPct>maxLTV){
      const needed=Math.ceil(propertyPrice*(100-maxLTV)/100);
      if(warning){warning.textContent=`⚠️ מימון (${ltvPct.toFixed(0)}%) חורג. הגדילו הון עצמי ל-${needed.toLocaleString('he-IL')} ₪`;warning.classList.remove('hidden');}
      valid=false;
    }else{if(warning)warning.classList.add('hidden');}
  }else{
    const maxPrice=equityAmount/((100-maxLTV)/100);
    mortgage=maxPrice*(maxLTV/100);ltvPct=maxLTV;equityPct=100-maxLTV;
    const ph=document.getElementById('priceHint');if(ph)ph.textContent=`מחיר דירה מקסימלי: ${fmt(maxPrice)}`;
    const eh=document.getElementById('equityHint');if(eh)eh.textContent='';
    const pe=document.getElementById('propertyPrice'),ps=document.getElementById('propertySlider');
    if(pe)pe.value=Math.round(maxPrice).toLocaleString('he-IL');
    if(ps){ps.value=Math.min(maxPrice,parseFloat(ps.max));setSliderFill(ps);}
    STATE.propertyPrice=maxPrice;if(warning)warning.classList.add('hidden');
  }

  const fill=document.getElementById('ltvFill');
  if(fill)fill.style.width=Math.max(0,Math.min(equityPct,100))+'%';
  setText('equityPct',equityPct.toFixed(0)+'%');setText('ltvPct',Math.max(0,ltvPct).toFixed(0)+'%');

  const mrBox=document.getElementById('monthlyRangeBox');
  const amountEl=document.getElementById('mortgageAmount'),subEl=document.getElementById('resultSub');
  if(valid&&mortgage>0){
    if(amountEl)amountEl.textContent=fmt(mortgage);
    if(subEl)subEl.textContent=purchaseType==='discounted'?`75% מימון מ-${fmt(Math.min(marketValue,2_100_000))}`:`${Math.max(0,ltvPct).toFixed(0)}% מימון מתוך ${fmt(STATE.propertyPrice)}`;
    if(mrBox){mrBox.classList.add('visible');setText('mrMin',fmt(spitzer(mortgage,2.8,25)));setText('mrMax',fmt(spitzer(mortgage,5.2,25)));}
    STATE.totalMortgage=Math.max(0,mortgage);syncTotalMortgageField();
  }else{
    if(amountEl)amountEl.textContent='—';if(subEl)subEl.textContent=valid?'הזינו נתונים לחישוב':'תקנו את הנתונים';
    if(mrBox)mrBox.classList.remove('visible');
  }
}

function syncTotalMortgageField(){
  const el=document.getElementById('totalMortgage'),sld=document.getElementById('totalMortgageSlider');
  if(el)el.value=Math.round(STATE.totalMortgage).toLocaleString('he-IL');
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

function onAmtChange(id,amt){
  const t=STATE.tracks[id];if(!t)return;
  t.amt=amt;t.pct=STATE.totalMortgage>0?Math.round(amt/STATE.totalMortgage*100):0;
  const sld=document.getElementById(`${id}PctSlider`);if(sld){sld.value=t.pct;setSliderFill(sld);}
  recalcAllTracks();
}
function onSliderChange(id,pct){
  const t=STATE.tracks[id];if(!t)return;
  t.pct=pct;t.amt=Math.round(STATE.totalMortgage*(pct/100));
  const el=document.getElementById(`${id}AmtNum`);if(el)el.value=t.amt>0?t.amt.toLocaleString('he-IL'):'0';
  recalcAllTracks();
}

/* ── PAGE 2 RECALC ── */
function recalcAllTracks(){
  const totalM=STATE.totalMortgage,cpi=STATE.inflationRate;
  let totalMonthly=0,totalPeak=0,totalInterest=0,grandTotal=0,fixedAmt=0,allocatedAmt=0,activeCount=0;
  const breakdowns=[];

  Object.entries(STATE.tracks).forEach(([id,t],i)=>{
    if(!t.enabled)return;
    const res=computeTrack(id,t,totalM,cpi);if(!res||res.P<=0)return;
    activeCount++;allocatedAmt+=res.P;totalMonthly+=res.initial;totalPeak+=res.peak;totalInterest+=res.interest;grandTotal+=res.total;
    if(t.fixed)fixedAmt+=res.P;
    setText(`${id}Monthly`,fmt(res.initial));setText(`${id}Per1`,res.per1>0?res.per1.toFixed(2):'—');
    setText(`${id}Peak`,fmt(res.peak));setText(`${id}Total`,fmt(res.total));
    const beRow=document.getElementById(`${id}-balloon-end`),beVal=document.getElementById(`${id}BalloonEnd`);
    if(t.amort==='balloon'){if(beVal)beVal.textContent=fmt(res.balloonEnd);if(beRow)beRow.classList.remove('hidden');}
    else{if(beRow)beRow.classList.add('hidden');}
    breakdowns.push({id,amt:res.P,initial:res.initial,peak:res.peak,total:res.total,per1:res.per1,color:TRACK_COLORS[i%TRACK_COLORS.length]});
  });

  const fixedPct=totalM>0?Math.round(fixedAmt/totalM*100):0,fixedOk=fixedAmt>=totalM/3;
  setText('fixedPct',fixedPct+'%');setText('fixedCheck',fixedOk?'✅':'❌');
  document.getElementById('fixedTrackRule')?.classList.toggle('ok',fixedOk);

  const pctBar=document.getElementById('totalPctBar'),pctMsg=document.getElementById('totalPctMsg');
  if(pctMsg){
    const remain=totalM-allocatedAmt,ok=Math.abs(remain)<1000;
    pctBar?.classList.toggle('ok',ok);
    if(ok)pctMsg.innerHTML='✅ כל הסכום הוקצה למסלולים';
    else if(remain>0)pctMsg.innerHTML=`⚠️ נותר להקצות: <strong>${fmt(remain)}</strong>`;
    else pctMsg.innerHTML=`⚠️ הוקצה יותר מהסכום ב-<strong>${fmt(Math.abs(remain))}</strong>`;
  }

  setText('totalMonthly',activeCount?fmt(totalMonthly):'—');setText('totalPeak',activeCount?fmt(totalPeak):'—');
  setText('totalInterestCost',activeCount?fmt(totalInterest):'—');setText('grandTotal',activeCount?fmt(grandTotal):'—');
  setText('activeTracks',`${activeCount} מסלולים פעילים`);
  renderBreakdown(breakdowns);updateStickySummary(allocatedAmt,totalMonthly,breakdowns);
}

function renderBreakdown(items){
  const list=document.getElementById('breakdownList'),bar=document.getElementById('mixBar');
  if(!list||!bar)return;list.innerHTML='';bar.innerHTML='';
  items.forEach(item=>{
    const hasPeak=item.peak>item.initial*1.005;
    const div=document.createElement('div');div.className='breakdown-item';
    div.innerHTML=`<div class="breakdown-item-name"><span class="track-dot" style="background:${item.color}"></span><div><div class="breakdown-name">${TRACK_LABELS[item.id]||item.id}</div><div class="breakdown-detail">${fmt(item.amt)}</div></div></div><div class="breakdown-figures"><span class="breakdown-monthly">${fmt(item.initial)}/חודש</span>${hasPeak?`<span class="breakdown-peak">שיא: ${fmt(item.peak)}</span>`:''}<span class="breakdown-total">סך: ${fmt(item.total)}</span></div>`;
    list.appendChild(div);
    const seg=document.createElement('div');seg.style.cssText=`flex:${item.amt};background:${item.color};`;bar.appendChild(seg);
  });
}

function updateStickySummary(allocated,monthly,breakdowns){
  const ss=document.getElementById('stickySummary');if(!ss)return;
  const isPage2=document.getElementById('step2')?.classList.contains('active');
  if(isPage2){ss.classList.add('visible');document.body.classList.add('has-sticky');}
  else{ss.classList.remove('visible');document.body.classList.remove('has-sticky');return;}
  setText('ssTotalAmt',fmt(STATE.totalMortgage));setText('ssMonthly',monthly>0?fmt(monthly):'—');
  const remain=STATE.totalMortgage-allocated,remainEl=document.getElementById('ssRemain');
  if(remainEl){remainEl.textContent=Math.abs(remain)<1000?'הוקצה הכל':(remain>0?fmt(remain):`יתר: ${fmt(Math.abs(remain))}`);remainEl.className='ss-val'+(remain<-1000?' over':'');}
  const tracksEl=document.getElementById('ssTracks');
  if(tracksEl){tracksEl.innerHTML='';breakdowns.forEach(b=>{const chip=document.createElement('div');chip.className='ss-track-chip';chip.innerHTML=`<span class="ss-track-name" style="color:${b.color}">${TRACK_LABELS[b.id]||b.id}</span><span class="ss-track-amt">${fmt(b.amt)}</span>`;tracksEl.appendChild(chip);});}
}

function getCurrentMixSnapshot(){
  const totalM=STATE.totalMortgage,cpi=STATE.inflationRate;
  let totalMonthly=0,totalPeak=0,totalInterest=0,grandTotal=0;const tracks=[];
  Object.entries(STATE.tracks).forEach(([id,t])=>{
    if(!t.enabled)return;const res=computeTrack(id,t,totalM,cpi);if(!res||res.P<=0)return;
    totalMonthly+=res.initial;totalPeak+=res.peak;totalInterest+=res.interest;grandTotal+=res.total;
    tracks.push({id,amt:res.P,rate:t.rate,years:t.years,monthly:res.initial,total:res.total,per1:res.per1});
  });
  return{totalMortgage:totalM,totalMonthly,totalPeak,totalInterest,grandTotal,tracks};
}

function renderCompareTable(){
  const wrap=document.getElementById('compareTableWrap');if(!wrap)return;
  if(STATE.savedMixes.length===0){wrap.innerHTML='<p class="compare-empty">שמרו תמהיל אחד או יותר כדי להשוות</p>';return;}
  const mixes=STATE.savedMixes,bestMonthly=Math.min(...mixes.map(m=>m.data.totalMonthly)),bestTotal=Math.min(...mixes.map(m=>m.data.grandTotal));
  let html='<table class="compare-table"><thead><tr><th>קטגוריה</th>';
  mixes.forEach(m=>html+=`<th>${m.name} <button class="delete-mix-btn" data-mix-id="${m.id}">✕</button></th>`);
  html+='</tr></thead><tbody>';
  [['סכום משכנתא','totalMortgage',fmt],['החזר חודשי','totalMonthly',fmt,'bestMonthly'],['החזר חודשי בשיא','totalPeak',fmt],['עלות ריבית','totalInterest',fmt],['סך החזר','grandTotal',fmt,'bestTotal']].forEach(([label,key,fn,bk])=>{
    html+=`<tr><td><strong>${label}</strong></td>`;
    mixes.forEach(m=>{const v=m.data[key],ib=bk&&((bk==='bestMonthly'&&v===bestMonthly)||(bk==='bestTotal'&&v===bestTotal));html+=`<td class="${ib?'best':''}">${fn(v)}${ib?' ⭐':''}</td>`;});
    html+='</tr>';
  });
  const allIds=[...new Set(mixes.flatMap(m=>m.data.tracks.map(t=>t.id)))];
  allIds.forEach(tid=>{html+=`<tr><td><em>${TRACK_LABELS[tid]||tid}</em></td>`;mixes.forEach(m=>{const t=m.data.tracks.find(t=>t.id===tid);html+=`<td>${t?`${fmt(t.amt)} | ${t.rate.toFixed(2)}% | ${Math.round(t.years)}שנ`:'—'}</td>`;});html+='</tr>';});
  html+='</tbody></table>';wrap.innerHTML=html;
  wrap.querySelectorAll('.delete-mix-btn').forEach(btn=>btn.addEventListener('click',()=>{STATE.savedMixes=STATE.savedMixes.filter(m=>m.id!==parseInt(btn.dataset.mixId));renderCompareTable();}));
}

function bindNumSlider(inputId,sliderId,onChange){
  const inp=document.getElementById(inputId),sld=document.getElementById(sliderId);
  if(inp){inp.addEventListener('input',()=>{const v=parseNum(inp.value);if(sld){sld.value=Math.min(v,parseFloat(sld.max));setSliderFill(sld);}onChange(v);});inp.addEventListener('blur',()=>formatInput(inp));}
  if(sld){sld.addEventListener('input',()=>{const v=parseFloat(sld.value);if(inp)inp.value=Math.round(v).toLocaleString('he-IL');setSliderFill(sld);onChange(v);});setSliderFill(sld);}
}

document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{
    const step=tab.dataset.step;
    document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t===tab));
    document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===`step${step}`));
    if(step==='2')recalcAllTracks();else{document.getElementById('stickySummary')?.classList.remove('visible');document.body.classList.remove('has-sticky');}
  }));

  document.querySelectorAll('.purchase-card').forEach(card=>card.addEventListener('click',()=>{
    document.querySelectorAll('.purchase-card').forEach(c=>c.classList.remove('active'));card.classList.add('active');
    STATE.purchaseType=card.dataset.type;STATE.maxLTV=parseInt(card.dataset.ltv);
    const df=document.getElementById('discountedFields'),s2=document.getElementById('step2Card');
    const isDisc=STATE.purchaseType==='discounted';
    if(df)df.classList.toggle('visible',isDisc);if(s2)s2.style.display=isDisc?'none':'block';
    updateStep1();
  }));

  document.getElementById('hasGrant')?.addEventListener('change',e=>{STATE.hasGrant=e.target.checked;updateStep1();});
  bindNumSlider('marketValue','marketValueSlider',v=>{STATE.marketValue=v;updateStep1();});
  document.getElementById('driverPrice')?.addEventListener('click',()=>setDriver('price'));
  document.getElementById('driverEquity')?.addEventListener('click',()=>setDriver('equity'));
  document.getElementById('swapBtn')?.addEventListener('click',()=>setDriver(STATE.driver==='price'?'equity':'price'));
  setDriver('price');
  bindNumSlider('propertyPrice','propertySlider',v=>{STATE.propertyPrice=v;if(STATE.driver==='price')updateStep1();});
  bindNumSlider('equityAmount','equitySlider',v=>{STATE.equityAmount=v;updateStep1();});

  document.getElementById('goToStep2Btn')?.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',i===1));
    document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='step2'));
    recalcAllTracks();
  });

  document.getElementById('zakautUpsell')?.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',i===1));
    document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='step2'));
    const body=document.getElementById('groupFixed'),arrow=document.getElementById('groupFixedArrow');
    if(body){body.classList.remove('collapsed');if(arrow)arrow.classList.remove('closed');}
    setTimeout(()=>document.querySelector('[data-track="zakaut"]')?.scrollIntoView({behavior:'smooth',block:'start'}),200);
    recalcAllTracks();
  });
  document.getElementById('zakautBtn')?.addEventListener('click',e=>{e.stopPropagation();document.getElementById('zakautUpsell')?.click();});

  bindNumSlider('totalMortgage','totalMortgageSlider',v=>{STATE.totalMortgage=v;recalcAllTracks();});
  document.getElementById('inflPlus')?.addEventListener('click',()=>{STATE.inflationRate=Math.min(10,+(STATE.inflationRate+.5).toFixed(1));setText('inflationRate',STATE.inflationRate+'%');recalcAllTracks();});
  document.getElementById('inflMinus')?.addEventListener('click',()=>{STATE.inflationRate=Math.max(0,+(STATE.inflationRate-.5).toFixed(1));setText('inflationRate',STATE.inflationRate+'%');recalcAllTracks();});

  ['Fixed','Var'].forEach(g=>{
    const btn=document.getElementById(`group${g}Btn`),body=document.getElementById(`group${g}`),arrow=document.getElementById(`group${g}Arrow`);
    if(btn&&body&&arrow)btn.addEventListener('click',()=>{const c=body.classList.toggle('collapsed');arrow.classList.toggle('closed',c);});
  });

  ['mcz','mlcz'].forEach(id=>{
    const sld=document.getElementById(`${id}IntervalSlider`);
    if(sld){sld.addEventListener('input',()=>{STATE.tracks[id].interval=parseInt(sld.value);setText(`${id}Interval`,sld.value+' שנים');setSliderFill(sld);recalcAllTracks();});setSliderFill(sld);}
  });

  document.querySelectorAll('.track-card').forEach(card=>{
    const id=card.dataset.track,t=STATE.tracks[id];if(!t)return;
    const cb=card.querySelector('.track-enable');
    if(cb)cb.addEventListener('change',()=>{t.enabled=cb.checked;card.classList.toggle('enabled',t.enabled);recalcAllTracks();});
    const amtEl=card.querySelector('.amt-input');
    if(amtEl){amtEl.addEventListener('input',()=>onAmtChange(id,parseNum(amtEl.value)));amtEl.addEventListener('blur',()=>formatInput(amtEl));}
    const pctSld=card.querySelector('.track-pct-slider');
    if(pctSld){pctSld.addEventListener('input',()=>onSliderChange(id,parseInt(pctSld.value)));setSliderFill(pctSld);}
    const rateSld=card.querySelector('.rate-slider');
    if(rateSld&&id!=='zakaut'){rateSld.addEventListener('input',()=>{t.rate=parseInt(rateSld.value)/100;setText(`${id}Rate`,t.rate.toFixed(2)+'%');setSliderFill(rateSld);recalcAllTracks();});setSliderFill(rateSld);}
    if(id==='zakaut'){const upd=y=>{t.rate=getZakautRate(y);t.years=y;setText('zakautRateDisplay',t.rate.toFixed(2)+'%');recalcAllTracks();};upd(t.years);}
    card.querySelectorAll('.track-years-row .yr').forEach(btn=>btn.addEventListener('click',()=>{
      card.querySelectorAll('.track-years-row .yr').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
      const yrs=parseInt(btn.dataset.val);t.years=yrs;
      const yrM=card.querySelector('.yr-manual');if(yrM)yrM.value=yrs;
      const moM=card.querySelector('.mo-manual');if(moM)moM.value=yrs*12;
      if(id==='zakaut'){t.rate=getZakautRate(yrs);setText('zakautRateDisplay',t.rate.toFixed(2)+'%');}
      recalcAllTracks();
    }));
    const yrM=card.querySelector('.yr-manual');
    if(yrM)yrM.addEventListener('input',()=>{
      const v=Math.min(30,Math.max(1,parseInt(yrM.value)||30));t.years=v;
      const moM=card.querySelector('.mo-manual');if(moM)moM.value=Math.round(v*12);
      card.querySelectorAll('.track-years-row .yr').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.val)===v));
      if(id==='zakaut'){t.rate=getZakautRate(v);setText('zakautRateDisplay',t.rate.toFixed(2)+'%');}
      recalcAllTracks();
    });
    const moM=card.querySelector('.mo-manual');
    if(moM)moM.addEventListener('input',()=>{
      const mo=Math.min(360,Math.max(1,parseInt(moM.value)||360));t.years=mo/12;
      const yrEl=card.querySelector('.yr-manual');if(yrEl)yrEl.value=Math.round(t.years);
      card.querySelectorAll('.track-years-row .yr').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.val)===Math.round(t.years)));
      if(id==='zakaut'){t.rate=getZakautRate(Math.round(t.years));setText('zakautRateDisplay',t.rate.toFixed(2)+'%');}
      recalcAllTracks();
    });
    card.querySelectorAll('.amort-row .am').forEach(btn=>btn.addEventListener('click',()=>{
      card.querySelectorAll('.amort-row .am').forEach(b=>b.classList.remove('active'));btn.classList.add('active');t.amort=btn.dataset.val;
      const gd=document.getElementById(`${id}-grace`);if(gd)gd.classList.toggle('hidden',t.amort!=='grace');
      const bd=document.getElementById(`${id}-balloon`);if(bd)bd.classList.toggle('hidden',t.amort!=='balloon');
      recalcAllTracks();
    }));
    card.querySelector('.grace-months')?.addEventListener('input',e=>{t.graceMo=parseInt(e.target.value)||12;recalcAllTracks();});
    card.querySelector('.balloon-months')?.addEventListener('input',e=>{t.balloonMo=parseInt(e.target.value)||12;recalcAllTracks();});
    card.querySelector('.info-circle')?.addEventListener('click',e=>{e.stopPropagation();const i=TRACK_INFO[id];if(i)openModal(i.title,i.body);});
  });

  document.querySelectorAll('.info-btn[data-modal-title]').forEach(el=>el.addEventListener('click',()=>openModal(el.dataset.modalTitle,el.dataset.modalBody)));
  document.getElementById('modalClose')?.addEventListener('click',closeModal);
  document.getElementById('modalOverlay')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal();});
  document.getElementById('saveMixBtn')?.addEventListener('click',()=>{
    const nameEl=document.getElementById('mixName'),name=(nameEl?.value.trim())||`תמהיל ${STATE.savedMixes.length+1}`;
    STATE.savedMixes.push({id:Date.now(),name,data:getCurrentMixSnapshot()});if(nameEl)nameEl.value='';renderCompareTable();
  });
  document.getElementById('clearCompareBtn')?.addEventListener('click',()=>{STATE.savedMixes=[];renderCompareTable();});

  updateStep1();recalcAllTracks();document.querySelectorAll('.slider').forEach(setSliderFill);
});

function openModal(t,b){setText('modalTitle',t);setText('modalBody',b);document.getElementById('modalOverlay')?.classList.add('open');}
function closeModal(){document.getElementById('modalOverlay')?.classList.remove('open');}
