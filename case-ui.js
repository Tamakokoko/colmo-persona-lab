(() => {
  'use strict';
  const cases = window.COLMO_CASES, axes = window.COLMO_DATA.axes;
  const dialog = document.getElementById('caseDialog');
  const content = document.getElementById('caseContent');
  const tabs = document.getElementById('caseTabs');
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const asset = (key, name, ext='png') => window.COLMO_CASE_ASSETS[`${key}-${name}.${ext}`];
  const crop = (key,name,kind) => `<span class="brand-crop ${kind}"><img src="${asset(key,name)}" alt=""></span>`;
  function brand(c) {
    let mark;
    if(c.key==='A') mark=crop('A','imgImage8106382','brand-celia')+`<span class="brand-wordrow">小艺管家｜${crop('A','imgImage8087','brand-huawei')}</span><small>默契、包容的家人</small>`;
    else if(c.key==='B'||c.key==='F') mark=crop(c.key,'imgImage8106257','brand-bixby')+`<span class="brand-wordrow">Bixby｜${crop(c.key,'imgSamsungOrigWordmarkBlackRgb3','brand-samsung')}</span><small>自然、高效的设备专家</small>`;
    else if(c.key==='C') mark=crop('C','imgImage8041','brand-xpeng')+'<span class="brand-wordrow">小P｜小鹏汽车</span><small>主动、善解需求的出行管家</small>';
    else mark=crop(c.key,'imgBrandAsset3','brand-samsung standalone');
    return `<div class="case-brand" role="img" aria-label="${escape(c.brand)}">${mark}</div>`;
  }
  function mapping(c, row) {
    const index=axes.findIndex(axis=>axis.name.replaceAll(' / ','／')===row[0]);
    if(index<1)return '';
    const axis=axes[index], values=c.level[index].match(/\d+/g).map(Number);
    const low=values[0], high=values.at(-1), position=value=>(value-axis.min)/(axis.max-axis.min)*100;
    const ticks=axis.ticks.map((label,i)=>`<span class="case-scale-tick" style="left:${position(i+axis.min)}%"><img alt="" src="${asset(c.key,'imgTick0','svg')}"><span>${escape(label)}</span></span>`).join('');
    const point=value=>`<img class="case-scale-point" style="left:${position(value)}%" src="${asset(c.key,'imgPointHigh','svg')}" alt="">`;
    const range=axis.prefix+low+(high!==low?'–'+axis.prefix+high:'');
    return `<div class="case-mapping-row"><div class="case-axis-name">${escape(row[0])}<small>${range}</small></div><div class="case-mini-scale" role="img" aria-label="${escape(row[0])}：${range}，${escape(axis.ticks[low-axis.min])}${high!==low?'至'+escape(axis.ticks[high-axis.min]):''}"><div class="case-scale-line"></div>${ticks}${high!==low?`<span class="case-scale-range" style="left:${position(low)}%;width:${position(high)-position(low)}%"></span>`:''}${point(low)}${high!==low?point(high):''}</div><p>${escape(row[1])}</p></div>`;
  }
  function render(key) {
    const c=cases.find(item=>item.key===key)||cases[0];
    dialog.style.setProperty('--case-color',c.color);
    tabs.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.key===c.key)));
    content.innerHTML=`<article aria-labelledby="caseTitle"><header class="case-title-row"><span class="case-letter">${c.key}</span><div class="case-title-copy"><p>${escape(c.brand)} · ${escape(c.category)}</p><h3 id="caseTitle">${escape(c.title)}</h3></div>${brand(c)}</header><p class="case-scenario">${escape(c.scenario)}</p><blockquote class="case-expression">${escape(c.demo)}</blockquote><section class="case-flow-section" aria-labelledby="caseFlowTitle"><h4 id="caseFlowTitle">交互节点</h4><ol class="case-flow" style="--step-count:${c.steps.length}">${c.steps.map((step,i)=>`<li><div class="case-step-title"><span>${String(i+1).padStart(2,'0')}</span>${escape(step[0])}</div><p class="case-terminal">${escape(step[1])}</p><span class="case-channel">${escape(c.feedback[i][0])}</span><p class="case-feedback">${escape(c.feedback[i][1])}</p></li>`).join('')}</ol></section><section class="case-contribution" aria-labelledby="caseContributionTitle"><h4 id="caseContributionTitle">策略贡献</h4>${c.aligned.map(row=>mapping(c,row)).join('')}</section><footer class="case-sources"><h4>案例来源</h4>${c.refs.map(([title,url])=>`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer"><span>${escape(title)}</span><small>${escape(new URL(url).hostname)}</small><span aria-hidden="true">↗</span></a>`).join('')}</footer></article>`;
    dialog.scrollTop=0;
  }
  cases.forEach(c=>{
    const button=document.createElement('button');
    button.dataset.key=c.key;button.style.setProperty('--case-color',c.color);
    button.innerHTML=`<span>${c.key}</span>${escape(c.category)}`;
    button.addEventListener('click',()=>render(c.key));tabs.append(button);
  });
  document.getElementById('closeCases').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;
    const r=dialog.getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
  });
  dialog.addEventListener('close',()=>document.getElementById('caseReferenceButton').focus({preventScroll:true}));
  window.COLMO_CASE_UI={open(key){render(key);if(!dialog.open)dialog.showModal();dialog.scrollTop=0;}};
})();
