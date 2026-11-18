(() => {
  'use strict';
  const catalog = window.COLMO_DATA;
  const axes = catalog.axes;
  const scales = window.COLMO_SCALES;
  axes.forEach(axis => { axis.definition = scales[axis.id].definition; });
  const clone = value => JSON.parse(JSON.stringify(value));
  const riskKeys=['lowRisk','mediumRisk','highRisk'];
  const risks=catalog.strategies.D.riskLevels;
  let activeRisk='lowRisk';
  let expressionView='personality';
  const defaults = {version:3,catalogRevision:"20261119-trust-threshold",baseline:clone(catalog.baseline),strategies:Object.fromEntries(Object.entries(catalog.strategies).map(([key,s]) => [key, key === 'D' ? {low:[...s.low],high:[...s.high],...Object.fromEntries(riskKeys.map(k=>[k,[...risks[k].values]]))} : {values:[...s.values]}]))};
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'colmo-persona-lab-v3';
  const LEGACY_STORAGE_KEY = 'colmo-persona-lab-v1';
  const ids = ['overview', ...Object.keys(catalog.strategies)];
  let state = clone(defaults), active = 'A', visual = null, animation = 0, saveTimer = 0, toastTimer = 0;
  let storageAvailable = true;
  const strategyColors={A:'#2864dc',B:'#8050bd',C:'#148b8d',D:'#d68a19',E:'#cd507c',F:'#6475bc'};
  const visibleStrategies=new Set(Object.keys(catalog.strategies));
  const colors = {appearance:'#2864d7',communication:'#087f78',action:'#7952b5'};
  const clamp = (value,min,max) => Math.min(max,Math.max(min,value));
  const level = (i,v) => axes[i].prefix + v;
  const levelName = (i,v) => level(i,v) + ' ' + axes[i].ticks[v - axes[i].min];
  const normalize = (i,v) => (v-axes[i].min)/(axes[i].max-axes[i].min);
  const pct = (i,v) => normalize(i,v)*100;
  const NS='http://www.w3.org/2000/svg';
  function svgNode(tag,attrs,parent) { const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(parent)parent.appendChild(n);return n; }
  function toast(text) { clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3200); }
  function validate(data) {
    if(!data || ![1,2,3].includes(data.version) || !data.baseline || !data.strategies) throw new Error('文件格式不匹配，请选择本网页导出的 JSON。');
    // Upgrade old drafts to the report's routine boundary; preserve D risk settings.
    const migrating = data.catalogRevision !== defaults.catalogRevision;
    if (migrating) {
      data = clone(data);
      if (data.version === 1) {
        for (const [key, strategy] of Object.entries(data.strategies)) {
          if (key === 'D') [strategy.low[6], strategy.high[6]] = [5-strategy.high[6], 5-strategy.low[6]];
          else strategy.values[6] = 5-strategy.values[6];
        }
        data.version = 2;
      }
      // Preserve recent report drafts and their unrelated edits; widen only the threshold boundary.
      if (!['20261118-routine-boundaries','20261118-professional-cap'].includes(data.catalogRevision)) data.baseline = clone(defaults.baseline);
      data.baseline.low[6] = 2;
      data.baseline.high[6] = 4;
      for (const field of ['low','center','high']) data.baseline[field][2] = Math.min(data.baseline[field][2],3);
      const riskDraft = data.strategies.D;
      if (riskDraft) for (const field of ['low','high',...riskKeys]) {
        if (Array.isArray(riskDraft[field])) riskDraft[field][2] = Math.min(riskDraft[field][2],3);
      }
      for (const [key, strategy] of Object.entries(data.strategies)) {
        if (key !== 'D' && Array.isArray(strategy.values))
          strategy.values = strategy.values.map((v,i) => clamp(v,data.baseline.low[i],data.baseline.high[i]));
      }
    }
    const check = values => {if(!Array.isArray(values)||values.length!==8||values.some((v,i)=>!Number.isInteger(v)||v<axes[i].min||v>axes[i].max))throw new Error('参数必须是八个有效的整数刻度。');};
    for(const field of ['center','low','high']) check(data.baseline[field]);
    if(data.baseline.high[2]>3)throw new Error('COLMO 专业感上限为 L3 专业，不扩展至专家层级。');
    for(let i=0;i<8;i++)if(data.baseline.low[i]>data.baseline.center[i]||data.baseline.center[i]>data.baseline.high[i])throw new Error('原型参照线必须位于允许范围内。');
    for(const key of Object.keys(catalog.strategies)) {
      const s=data.strategies[key];if(!s)throw new Error('参数缺少策略 '+key+'。');
      for(const field of key==='D'?['low','high']:['values']){check(s[field]);if(key!=='D'&&s[field].some((v,i)=>v<data.baseline.low[i]||v>data.baseline.high[i]))throw new Error('策略 '+key+' 超出了常规允许范围。');}
      if(key==='D'&&s.low.some((v,i)=>v>s.high[i]))throw new Error('风险策略的下限不能高于上限。');
    }
    // v1 used L1 high → L4 low. Convert values and swap interval ends together.
    if(data.version === 1) {
      data = clone(data);
      const reverseRange = range => {
        [range.low[6],range.high[6]] = [5-range.high[6],5-range.low[6]];
      };
      reverseRange(data.baseline);
      data.baseline.center[6] = 5-data.baseline.center[6];
      for(const key of Object.keys(catalog.strategies)) {
        if(key === 'D') reverseRange(data.strategies[key]);
        else data.strategies[key].values[6] = 5-data.strategies[key].values[6];
      }
    }
    const riskState={low:[...data.strategies.D.low],high:[...data.strategies.D.high]};
    for(const k of riskKeys){const values=data.version===3?data.strategies.D[k]:risks[k].values.map((v,i)=>clamp(v,riskState.low[i],riskState.high[i]));check(values);if(values.some((v,i)=>v<catalog.riskBoundary.low[i]||v>catalog.riskBoundary.high[i]))throw new Error('风险等级超出独立风险策略范围。');riskState[k]=[...values];}
    for(let i=0;i<8;i++){riskState.low[i]=Math.min(...riskKeys.map(k=>riskState[k][i]));riskState.high[i]=Math.max(...riskKeys.map(k=>riskState[k][i]));}
    return {version:3,catalogRevision:"20261119-trust-threshold",baseline:{center:[...data.baseline.center],low:[...data.baseline.low],high:[...data.baseline.high]},strategies:Object.fromEntries(Object.keys(catalog.strategies).map(key=>[key,key==='D'?riskState:{values:[...data.strategies[key].values]}]))};
  }
  let loadMessage='';
  try {const cached=localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('colmo-persona-lab-v2') ?? localStorage.getItem(LEGACY_STORAGE_KEY);if(cached){
    const parsed=JSON.parse(cached),previousDefault=clone(defaults);previousDefault.strategies.D.lowRisk[6]=3;previousDefault.strategies.D.high[6]=3;
    const oldDefault=clone(previousDefault);oldDefault.version=2;for(const k of riskKeys)delete oldDefault.strategies.D[k];
    const olderDefault=clone(oldDefault);olderDefault.baseline.high[1]=3;olderDefault.baseline.high[5]=4;olderDefault.strategies.D.high[1]=3;olderDefault.strategies.D.high[5]=4;
    const priorDefaults=[defaults,previousDefault,oldDefault,olderDefault].map(d=>{const prior=clone(d);prior.strategies.C.values[5]=3;return prior;});
    const oldWarmthDefaults=[defaults,previousDefault,oldDefault,olderDefault,...priorDefaults].map(d=>{const old=clone(d);delete old.catalogRevision;old.strategies.A.values[3]=2;return old;});
    state=[previousDefault,oldDefault,olderDefault,...priorDefaults,...oldWarmthDefaults].some(d=>JSON.stringify(parsed)===JSON.stringify(d))?clone(defaults):validate(parsed);
    if(parsed.catalogRevision!==defaults.catalogRevision)loadMessage='主动介入阈值已更新为中低—高阈值，支持随长期信任与习惯积累调整；其余近期草稿参数保留。';
    if(!parsed.catalogRevision&&state.strategies.A.values[3]===2&&state.baseline.low[3]<=1){state.strategies.A.values[3]=1;loadMessage='A 类表达温度已更新为 L1 平实礼貌，其余草稿参数保留。';}
  }}catch(e){loadMessage='未能读取本机草稿，已载入默认值。';}
  function save() { clearTimeout(saveTimer);$('saveState').textContent='正在保存…';saveTimer=setTimeout(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));$('saveState').textContent='已保存至本机';}catch(e){storageAvailable=false;$('saveState').textContent='请导出保存';$('storageNote').textContent='浏览器存储不可用，请导出参数';}},250); }
  function modified(key) {if(key==='overview')return false;return JSON.stringify(key==='prototype'?state.baseline:state.strategies[key])!==JSON.stringify(key==='prototype'?defaults.baseline:defaults.strategies[key]);}
  function updateTabs(){document.querySelectorAll('.tab').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.key===active));button.classList.toggle('modified',modified(button.dataset.key));});}
  function createTabs(){for(const key of ids){
    const button=document.createElement('button');button.className='tab';button.dataset.key=key;
    button.style.setProperty('--strategy-color',strategyColors[key]||'#245de7');
    button.setAttribute('aria-label',key==='overview'?'总览':key==='prototype'?'人格原型':key+' '+catalog.strategies[key].title);
    button.title=key==='overview'?'总览':key==='prototype'?'人格原型':key+' '+catalog.strategies[key].title;
    button.innerHTML='<span class="tab-code">'+(key==='overview'?'▦':key==='prototype'?'◎':key)+'</span><span class="tab-label">'+(key==='overview'?'总览':key==='prototype'?'人格原型':catalog.strategies[key].short)+'</span>';
    button.addEventListener('click',()=>select(key));$('strategyTabs').append(button);
  }updateTabs();}
  function setStrategyVisible(key,visible,redraw=true){
    if(visible)visibleStrategies.add(key);else visibleStrategies.delete(key);
    document.querySelectorAll('input[data-strategy="'+key+'"]').forEach(input=>input.checked=visible);
    const card=document.querySelector('.overview-card[data-strategy="'+key+'"]');
    card.classList.toggle('muted',!visible);card.querySelector('.visibility-text').textContent=visible?'显示':'隐藏';
    syncAllStrategiesToggle();
    if(redraw&&active==='overview')drawOverview();
  }
  function createOverview(){
    Object.entries(catalog.strategies).forEach(([key,strategy])=>{
      const card=document.createElement('article');card.className='overview-card';card.dataset.strategy=key;card.style.setProperty('--strategy-color',strategyColors[key]);
      const row=document.createElement('div');row.className='overview-card-heading';
      const code=document.createElement('span');code.className='strategy-badge';code.textContent=key;
      const button=document.createElement('button');button.className='overview-open';button.textContent=strategy.title+' ↗';button.addEventListener('click',()=>{select(key);$('strategyContext').scrollIntoView({block:'start',behavior:'instant'});});
      const visibility=document.createElement('label');visibility.className='switch card-visibility';
      const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=true;toggle.dataset.strategy=key;toggle.setAttribute('aria-label',key+' '+strategy.title+' 显示开关');
      toggle.addEventListener('change',()=>setStrategyVisible(key,toggle.checked));
      const track=document.createElement('span');const status=document.createElement('b');status.className='visibility-text';status.textContent='显示';visibility.append(toggle,track,status);
      row.append(code,button,visibility);const definition=document.createElement('p');definition.textContent=strategy.definition;card.append(row,definition);$('overviewList').append(card);
      const label=document.createElement('label');label.className='overview-toggle';label.style.setProperty('--strategy-color',strategyColors[key]);
      const input=document.createElement('input');input.type='checkbox';input.checked=true;input.dataset.strategy=key;input.setAttribute('aria-label','显示 '+key+' '+strategy.title);
      input.addEventListener('change',()=>setStrategyVisible(key,input.checked));
      const swatch=document.createElement('span');swatch.className='overview-swatch';const text=document.createElement('span');text.textContent=key+' · '+strategy.short;
      label.append(input,swatch,text);$('overviewLegend').append(label);
    });
  }
  function drawOverview(){
    cancelAnimationFrame(animation);visual=null;
    const range=$('rangeLayer'),baseline=$('baselineLayer'),selected=$('activeLayer');range.replaceChildren();baseline.replaceChildren();selected.replaceChildren();
    baseline.setAttribute('opacity','1');
    if($('envelopeToggle').checked){svgNode('path',{d:bandPath(state.baseline.low,state.baseline.high),class:'range-fill','fill-rule':'evenodd'},range);for(const values of [state.baseline.low,state.baseline.high])svgNode('path',{d:shape(values),class:'range-outline'},range);}
    Object.keys(catalog.strategies).forEach(key=>{
      const s=state.strategies[key],color=strategyColors[key],group=svgNode('g',{'data-strategy':key,opacity:visibleStrategies.has(key)?1:0},selected);
      const lo=key==='D'?s.low:s.values,hi=key==='D'?s.high:s.values;
      if(key==='D'&&lo.some((v,i)=>v!==hi[i])){svgNode('path',{d:bandPath(lo,hi),fill:color,'fill-opacity':.09,'fill-rule':'evenodd','data-band':'D'},group);svgNode('path',{d:shape(lo),fill:'none',stroke:color,'stroke-width':1.8,'stroke-linejoin':'round','data-contour':'lower'},group);}
      svgNode('path',{d:shape(hi),fill:'none',stroke:color,'stroke-width':1.8,'stroke-linejoin':'round','data-contour':'upper'},group);
      hi.forEach((value,i)=>{const[x,y]=point(i,value);svgNode('circle',{cx:x,cy:y,r:3.4,fill:'#fff',stroke:color,'stroke-width':1.4},group);if(lo[i]!==value){const[a,b]=point(i,lo[i]);svgNode('circle',{cx:a,cy:b,r:3.1,fill:'#fff',stroke:color,'stroke-width':1.4},group);}});
    });
    $('radarDescription').textContent=Object.keys(catalog.strategies).filter(k=>visibleStrategies.has(k)).map(k=>k+' '+catalog.strategies[k].title+'：'+axes.map((a,i)=>{const s=state.strategies[k];return a.name+' '+(k==='D'?level(i,s.low[i])+'–'+level(i,s.high[i]):level(i,s.values[i]));}).join('；')).join('。');
  }
  function editingBounds(i) { return active==='D' ? [catalog.riskBoundary.low[i],catalog.riskBoundary.high[i]] : [state.baseline.low[i],state.baseline.high[i]]; }
  function selectedBounds(i) {if(active==='prototype')return [state.baseline.center[i],state.baseline.center[i]];if(active==='D')return[state.strategies.D[activeRisk][i],state.strategies.D[activeRisk][i]];return[state.strategies[active].values[i],state.strategies[active].values[i]];}
  function rangeInput(i,field,label) {
    const input=document.createElement('input');input.type='range';input.className='axis-input';input.min=axes[i].min;input.max=axes[i].max;input.step=1;input.dataset.field=field;
    input.setAttribute('aria-label',axes[i].name+' '+label);
    const hoveredValue=e=>{const r=input.getBoundingClientRect();return Math.round(axes[i].min+clamp((e.clientX-r.left-8)/(r.width-16),0,1)*(axes[i].max-axes[i].min));};
    const hitValue=e=>{
      const r=input.getBoundingClientRect(),value=hoveredValue(e);
      const x=r.left+8+normalize(i,value)*(r.width-16);
      return Math.abs(e.clientY-(r.top+r.height/2))<=7&&Math.abs(e.clientX-x)<=10?value:null;
    };
    bindScaleHover(input,i,hitValue,e=>{const r=input.getBoundingClientRect();return r.left+8+normalize(i,hoveredValue(e))*(r.width-16);});
    input.addEventListener('input',()=>{edit(i,field,Number(input.value));if(popoverState?.anchor===input){popoverState.value=Number(input.value);paintScale();}});
    return input;
  }
  function createTrack(row,i,field,label) {const outer=document.createElement('div');const track=document.createElement('div');track.className='track-wrap';track.innerHTML='<div class="track-line"></div><div class="allowed-segment"></div><div class="strategy-segment"></div>';for(let value=axes[i].min;value<=axes[i].max;value++){
      const dot=document.createElement('span');dot.className='track-tick-dot';dot.dataset.value=value;dot.setAttribute('aria-hidden','true');dot.style.left=pct(i,value)+'%';track.append(dot);
    }
    track.append(rangeInput(i,field,label));outer.append(track);row.append(outer);}
  function makeScaleEntry(i,value,label='') {
    const scale = scales[axes[i].id];
    const [name,text,example,source] = scale.levels[value-axes[i].min];
    const entry=document.createElement('div');entry.className='scale-entry';entry.dataset.level=value;
    const heading=document.createElement('div');heading.className='scale-entry-heading';
    const code=document.createElement('span');code.className='scale-code';code.textContent=level(i,value);
    const title=document.createElement('strong');title.textContent=name;
    const badge=document.createElement('span');badge.className='scale-status';badge.textContent=label;
    heading.append(code,title,badge);
    const explanation=document.createElement('p');explanation.className='scale-definition';
    const definitionLabel=document.createElement('strong');definitionLabel.textContent='刻度定义';
    explanation.append(definitionLabel,document.createTextNode(text));
    const illustration=document.createElement('p');illustration.className='scale-example';
    const exampleLabel=document.createElement('strong');exampleLabel.textContent='设计参照 · '+(source?.scenario||scale.scenario)+(source?.strategy?' · '+source.strategy+' 类策略同例':'');
    illustration.append(exampleLabel,document.createTextNode(example));
    const scenario=document.createElement('p');scenario.className='scale-scenario';
    const scenarioLabel=document.createElement('strong');scenarioLabel.textContent='共同情境';
    scenario.append(scenarioLabel,document.createTextNode(scale.context||scale.scenario));
    entry.append(heading,explanation,scenario,illustration);
    if(scale.comparisonNote){const note=document.createElement('p');note.className='scale-comparison-note';note.textContent=scale.comparisonNote;entry.append(note);}
    return entry;
  }
  let popoverState=null;
  const popover=document.createElement('div');popover.id='scale-popover';popover.className='scale-popover';
  popover.hidden=true;popover.setAttribute('role','tooltip');popover.setAttribute('aria-label','刻度含义与情境');document.body.append(popover);
  function hideScale() {
    if(popoverState)popoverState.anchor.removeAttribute('aria-describedby');
    popoverState=null;popover.hidden=true;
  }
  function positionScale() {
    if(!popoverState)return;
    const anchor=popoverState.anchor,r=anchor.getBoundingClientRect();
    const x=popoverState.x??(r.left+r.width/2),w=popover.offsetWidth,h=popover.offsetHeight;
    const left=clamp(x-w/2,12,Math.max(12,innerWidth-w-12));
    const below=r.bottom+10,top=below+h<innerHeight-12?below:Math.max(12,r.top-h-10);
    popover.style.left=left+'px';popover.style.top=top+'px';
  }
  function paintScale() {
    if(!popoverState)return;
    const {i,value}=popoverState,axis=axes[i];
    popover.className='scale-popover '+axis.group;
    const head=document.createElement('div');head.className='popover-head';head.textContent=axis.name;
    const entry=makeScaleEntry(i,value);
    popover.replaceChildren(head,entry);
    if(value<state.baseline.low[i]||value>state.baseline.high[i]){
      const note=document.createElement('p');note.className='popover-limit';note.textContent=active==='D'?'风险策略例外：不计入常规人格边界':'超出常规允许范围';popover.append(note);
    }
    positionScale();
  }
  function showScale(i,value,anchor,x=null) {
    if(popoverState)popoverState.anchor.removeAttribute('aria-describedby');
    popoverState={i,value,anchor,x};anchor.setAttribute('aria-describedby',popover.id);popover.hidden=false;paintScale();
  }
  function bindScaleHover(element,i,getValue,getX) {
    const hover=e=>{
      if(e.pointerType==='touch')return;
      const value=getValue(e);
      if(value===null){if(popoverState?.anchor===element)hideScale();return;}
      showScale(i,value,element,getX?.(e));
    };
    element.addEventListener('pointerenter',hover);
    element.addEventListener('pointermove',hover);
    element.addEventListener('pointerleave',hideScale);
    element.addEventListener('focus',()=>showScale(i,Number(element.dataset.value??element.value),element));
    element.addEventListener('blur',hideScale);
  }
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&popoverState){const anchor=popoverState.anchor;anchor.focus({preventScroll:true});hideScale();}});
  document.addEventListener('pointerdown',e=>{if(popoverState&&!popover.contains(e.target)&&!popoverState.anchor.contains(e.target))hideScale();});
  window.addEventListener('scroll',hideScale,true);
  window.addEventListener('resize',positionScale);
  function renderEditor() {
    hideScale();
    $('axesEditor').replaceChildren();
    axes.forEach((axis,i)=>{
      const row=document.createElement('div');row.className='axis-row '+axis.group;row.id='axis-'+i;
      const heading=document.createElement('div');heading.className='axis-heading';heading.innerHTML='<div class="axis-title"><span class="axis-number">'+String(i+1).padStart(2,'0')+'</span><h3>'+axis.name+'</h3><button class="info-button" aria-label="查看'+axis.name+'定义" aria-expanded="false" aria-controls="axis-detail-'+i+'">?</button></div><output class="axis-value"></output>';row.append(heading);
      const detail=document.createElement('div');detail.id='axis-detail-'+i;detail.className='axis-detail';detail.hidden=true;const definition=document.createElement('p');definition.textContent=axis.definition;const basis=document.createElement('p');basis.textContent=axis.basis;detail.append(definition,basis);if(axis.rangeGuide)appendRangeGuide(detail,axis.rangeGuide);row.append(detail);heading.querySelector('button').addEventListener('click',e=>{detail.hidden=!detail.hidden;e.currentTarget.setAttribute('aria-expanded',String(!detail.hidden));});
      createTrack(row,i,active==='prototype'?'center':active==='D'?activeRisk:'values','刻度');
      const ticks=document.createElement('div');ticks.className='tick-labels';
      axis.ticks.forEach((name,j)=>{
        const value=axis.min+j,b=document.createElement('button');b.className='tick-label';b.innerHTML='<strong>'+level(i,value)+'</strong>'+name;
        b.setAttribute('aria-label',axis.name+'：设为 '+levelName(i,value));b.dataset.value=value;
        bindScaleHover(b,i,()=>value);
        b.addEventListener('click',()=>{
          if(value>=editingBounds(i)[0]&&value<=editingBounds(i)[1]){
            let field=active==='prototype'?'center':'values';
            if(active==='D')field=activeRisk;
            edit(i,field,value);
          }
          showScale(i,value,b);
        });ticks.append(b);
      });row.append(ticks);
      if(active==='prototype'){const controls=document.createElement('div');controls.className='range-controls';for(const field of ['low','high']){const label=document.createElement('label');label.textContent=field==='low'?'允许下限':'允许上限';const select=document.createElement('select');select.className='level-select';select.dataset.field=field;select.setAttribute('aria-label',axis.name+' '+label.textContent);axis.ticks.forEach((name,j)=>{const op=document.createElement('option');op.value=axis.min+j;op.textContent=levelName(i,axis.min+j);select.append(op);});select.addEventListener('change',()=>edit(i,field,Number(select.value)));label.append(select);controls.append(label);}const help=document.createElement('span');help.className='range-instruction';help.textContent='常规策略在范围内调整；D 类风险策略单列';controls.append(help);row.append(controls);}
      if(active!=='prototype'){const note=document.createElement('p');note.textContent=catalog.strategies[active].notes[i];detail.append(note);}
      $('axesEditor').append(row);
    });
    refreshRows();
  }
  function refreshRows() {
    axes.forEach((axis,i)=>{const row=$('axis-'+i);const[low,high]=selectedBounds(i);row.querySelector('output').textContent=low===high?levelName(i,low):level(i,low)+'–'+level(i,high)+' · '+axis.ticks[low-axis.min]+' → '+axis.ticks[high-axis.min];row.querySelectorAll('.axis-input').forEach(input=>{let value=active==='prototype'?state.baseline.center[i]:active==='D'?state.strategies.D[input.dataset.field][i]:low;input.value=value;input.setAttribute('aria-valuetext',levelName(i,value));});row.querySelectorAll('.allowed-segment').forEach(el=>{el.style.left=pct(i,state.baseline.low[i])+'%';el.style.width=(pct(i,state.baseline.high[i])-pct(i,state.baseline.low[i]))+'%';});row.querySelectorAll('.strategy-segment').forEach(el=>{el.style.left=pct(i,low)+'%';el.style.width=(pct(i,high)-pct(i,low))+'%';});row.querySelectorAll('.baseline-marker').forEach(el=>el.style.left=pct(i,state.baseline.center[i])+'%');row.querySelectorAll('.track-tick-dot').forEach(dot=>{const value=Number(dot.dataset.value);dot.classList.toggle('outside-range',value<editingBounds(i)[0]||value>editingBounds(i)[1]);});row.querySelectorAll('.tick-label').forEach(b=>{const v=Number(b.dataset.value);b.classList.toggle('selected',v>=low&&v<=high);b.classList.toggle('outside-range',v<editingBounds(i)[0]||v>editingBounds(i)[1]);});row.querySelectorAll('select').forEach(s=>{s.value=state.baseline[s.dataset.field][i];Array.from(s.options).forEach(op=>op.disabled=s.dataset.field==='low'?Number(op.value)>state.baseline.high[i]:Number(op.value)<state.baseline.low[i]);});});
    $('changeCount').textContent=active==='D'?'风险策略独立展示，不计入常规边界':'在常规允许范围内调整具体表达';$('radarDescription').textContent=axes.map((axis,i)=>{const[l,h]=selectedBounds(i);return axis.name+' '+levelName(i,l)+(l!==h?' 至 '+levelName(i,h):'');}).join('；');updateTabs();
  }
  function constrainStrategies() {let count=0;for(const [key,strategy] of Object.entries(state.strategies))if(key!=='D')for(const values of Object.values(strategy))values.forEach((v,i)=>{const next=clamp(v,state.baseline.low[i],state.baseline.high[i]);if(v!==next)count++;values[i]=next;});syncRiskBounds();return count;}
  function syncRiskBounds(){const s=state.strategies.D;axes.forEach((_,i)=>{s.low[i]=Math.min(...riskKeys.map(k=>s[k][i]));s.high[i]=Math.max(...riskKeys.map(k=>s[k][i]));});}
  function edit(i,field,value) {
    if(active==='prototype'){
      const b=state.baseline;if(field==='low')value=Math.min(value,b.high[i]);if(field==='high')value=Math.max(value,b.low[i]);if(field==='center')value=clamp(value,b.low[i],b.high[i]);b[field][i]=value;b.center[i]=clamp(b.center[i],b.low[i],b.high[i]);const count=constrainStrategies();if(count)toast('原型范围已收窄，'+count+' 个策略端点已同步收敛。');
    }else{value=clamp(value,...editingBounds(i));const s=state.strategies[active];s[field][i]=value;if(active==='D')syncRiskBounds();}
    refreshRows();transition(110);save();
  }
  const cx=320,cy=285,R=210;
  function point(i,v) {const angle=-Math.PI/2+i*Math.PI/4,r=R*(.18+.82*normalize(i,v));return[cx+Math.cos(angle)*r,cy+Math.sin(angle)*r];}
  const path = points => points.map((p,i)=>(i?'L':'M')+p.map(n=>n.toFixed(3)).join(' ')).join(' ')+' Z';
  const shape = values => path(values.map((v,i)=>point(i,v)));
  function bandPath(low,high){return shape(high)+' '+path(low.map((v,i)=>point(i,v)).reverse());}
  function buildGrid() {
    const grid=$('gridLayer');
    for(let ring=0;ring<=4;ring++){const fraction=ring/4;svgNode('path',{d:shape(axes.map(a=>a.min+fraction*(a.max-a.min))),class:'grid-path'},grid);}
    axes.forEach((axis,i)=>{const p=point(i,axis.max);svgNode('path',{d:'M'+cx+' '+cy+' L'+p.join(' '),class:'spoke'},grid);for(let value=axis.min;value<=axis.max;value++){const q=point(i,value);const an=-Math.PI/2+i*Math.PI/4,dx=-Math.sin(an)*3,dy=Math.cos(an)*3;svgNode('path',{d:'M'+(q[0]-dx)+' '+(q[1]-dy)+' L'+(q[0]+dx)+' '+(q[1]+dy),stroke:'#bfcde2','stroke-width':1},grid);}});
    const locations=[[320,48,'middle'],[493,113,'middle'],[552,281,'start'],[493,472,'middle'],[320,536,'middle'],[146,472,'middle'],[89,278,'end'],[146,113,'middle']];
    axes.forEach((axis,i)=>{const[x,y,anchor]=locations[i],g=svgNode('g',{},$('labelLayer'));const t=svgNode('text',{x,y,'text-anchor':anchor,fill:colors[axis.group],class:'axis-label'},g);if(i===6){t.textContent='主动';const t2=svgNode('tspan',{x,dy:18},t);t2.textContent='介入阈值';}else if(i===2){t.textContent='感知能力';const t2=svgNode('tspan',{x,dy:18},t);t2.textContent='/ 专业感';}else t.textContent=axis.name;const tick=svgNode('text',{x,y:y+(i===2||i===6?37:21),'text-anchor':anchor,class:'axis-tick'},g);tick.textContent=axis.prefix+axis.min+' → '+axis.prefix+axis.max;t.addEventListener('click',()=>{if(active==='overview')return;setExpressionView('personality');const row=$('axis-'+i);row.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});row.classList.add('flash');setTimeout(()=>row.classList.remove('flash'),1100);});});
  }
  function buildRadarHover() {
    const layer=svgNode('g',{id:'radarTickTargets'},$('radar'));
    axes.forEach((axis,i)=>{
      for(let value=axis.min;value<=axis.max;value++){
        const [x,y]=point(i,value);
        const hit=svgNode('circle',{cx:x,cy:y,r:9,class:'radar-tick-target',tabindex:0,'data-axis':i,'data-value':value,'aria-label':axis.name+' '+levelName(i,value)},layer);
        hit.style.setProperty('--tick-color',colors[axis.group]);
        bindScaleHover(hit,i,()=>value);
      }
    });
  }
  function targetVisual() {const b=state.baseline;const lo=active==='prototype'?b.center:active==='D'?state.strategies.D[activeRisk]:state.strategies[active].values;const hi=active==='prototype'?b.center:active==='D'?state.strategies.D[activeRisk]:state.strategies[active].values;return{low:[...lo],high:[...hi],center:[...b.center],baseLow:[...b.low],baseHigh:[...b.high],envelope:$('envelopeToggle').checked?1:0};}
  function draw(v) {
    const range=$('rangeLayer'),baseline=$('baselineLayer'),selected=$('activeLayer');range.replaceChildren();baseline.replaceChildren();selected.replaceChildren();
    const envelope=svgNode('g',{opacity:v.envelope},range);svgNode('path',{d:bandPath(v.baseLow,v.baseHigh),class:'range-fill','fill-rule':'evenodd'},envelope);for(const vals of [v.baseLow,v.baseHigh])svgNode('path',{d:shape(vals),class:'range-outline'},envelope);
    // Only a nonzero lower/upper interval gets a fill. Ordinary profiles remain unfilled.
    const hasBand=v.low.some((x,i)=>Math.abs(x-v.high[i])>.0001);if(hasBand)svgNode('path',{d:bandPath(v.low,v.high),class:'band-fill','fill-rule':'evenodd'},range);
    svgNode('path',{d:shape(v.high),class:'active-line','data-contour':'upper'},selected);if(hasBand)svgNode('path',{d:shape(v.low),class:'active-line','data-contour':'lower'},selected);
    v.high.forEach((value,i)=>{const[x,y]=point(i,value);const dot=svgNode('circle',{cx:x,cy:y,r:4.8,class:'active-dot'},selected);const title=svgNode('title',{},dot);const[l,h]=selectedBounds(i);title.textContent=axes[i].name+'：'+(l===h?levelName(i,h):levelName(i,l)+' 至 '+levelName(i,h));if(Math.abs(v.low[i]-value)>.0001){const[a,b]=point(i,v.low[i]);svgNode('circle',{cx:a,cy:b,r:4.4,class:'active-dot'},selected);}});
  }
  function transition(duration=520) {cancelAnimationFrame(animation);const target=targetVisual();if(!visual||matchMedia('(prefers-reduced-motion: reduce)').matches||duration===0){visual=target;draw(visual);return;}const from=clone(visual),start=performance.now();function frame(now){const t=Math.min(1,(now-start)/duration),e=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;visual={};for(const key of Object.keys(target))visual[key]=Array.isArray(target[key])?target[key].map((v,i)=>from[key][i]+(v-from[key][i])*e):from[key]+(target[key]-from[key])*e;draw(visual);if(t<1)animation=requestAnimationFrame(frame);}animation=requestAnimationFrame(frame);}
  let scaleHelpSeen = false;
  function openScaleHelp() {
    hideScale();
    if (!$('scaleHelpDialog').open) $('scaleHelpDialog').showModal();
  }
  $('editorHint').addEventListener('click', openScaleHelp);
  $('closeScaleHelp').addEventListener('click', () => $('scaleHelpDialog').close());
  $('scaleHelpDialog').addEventListener('close', () => {
    scaleHelpSeen = true;
  });
  function select(key) {
    if(!ids.includes(key))return;hideScale();active=key;updateTabs();
    const overview=key==='overview';
    $('overviewPanel').hidden=!overview;$('overviewLegend').hidden=!overview;$('editorPanel').hidden=overview;$('detailLegend').hidden=overview;$('strategyContext').hidden=overview;
    $('chartHeading').textContent=overview?'六类策略总览':'八维人格定位';
    document.querySelector('.workspace').classList.toggle('is-overview',overview);
    document.documentElement.style.setProperty('--strategy-color',strategyColors[key]||'#245de7');
    $('riskTabs').hidden=key!=='D';
    if(overview){$('radarTitle').textContent='六类策略八维雷达图总览';drawOverview();return;}
    $('contextRationale').hidden=key==='prototype';
    renderDesignPrinciples(key);
    const proto=key==='prototype',risk=key==='D';$('activeLegend').textContent=proto?'原型参照线':key+' · '+catalog.strategies[key].short;$('bandLegend').hidden=true;$('editorTitle').textContent=proto?'人格原型':key+' · '+catalog.strategies[key].title;
    $('contextLetter').textContent=proto?'◎':key;
    $('contextTitle').textContent=proto?window.COLMO_PERSONA.title:catalog.strategies[key].title;
    if(proto)$('prototypeIntroduction').textContent=window.COLMO_PERSONA.description;
    $('prototypeIntroduction').hidden=!proto;
    $('contextPurpose').hidden=proto;
    $('contextPurpose').textContent=proto?'':catalog.strategies[key].purpose;
    renderOriginalDefinition(key);
    $('radarTitle').textContent=(proto?'COLMO 人格原型':key+' '+catalog.strategies[key].title)+'八维雷达图';
    $('radarDescription').textContent=axes.map((axis,i)=>{const[l,h]=selectedBounds(i);return axis.name+' '+levelName(i,l)+(l!==h?' 至 '+levelName(i,h):'');}).join('；');
    if(risk)renderRiskContext();
    renderEditor();renderExpressionPrinciples(key);updateExpressionView();transition();
    if (!scaleHelpSeen) openScaleHelp();
  }
  function renderOriginalDefinition(key){
    const host=$('originalDefinition');host.replaceChildren();
    const strategy=catalog.strategies[key];host.hidden=!strategy;
    if(!strategy)return;
    const line=document.createElement('p');
    const label=document.createElement('strong');label.textContent='口语化定义  ';
    line.append(label,document.createTextNode(strategy.definition));host.append(line);
    const details=document.createElement('details');
    const summary=document.createElement('summary');summary.textContent='案例与边界';details.append(summary);
    for(const [label,text] of [['案例',strategy.example],['边界',strategy.boundary]]){
      const p=document.createElement('p'),b=document.createElement('strong');b.textContent=label+'  ';
      p.append(b,document.createTextNode(text));details.append(p);
    }
    host.append(details);
  }
  function renderDesignPrinciples(key){
    const list=$('contextDimensionChange');list.replaceChildren();
    const exampleHost=$('strategyExample');exampleHost.replaceChildren();
    const example=window.COLMO_PRINCIPLES[key]?.example;
    if(example){
      const context=document.createElement('p');context.className='example-context';context.textContent='情境｜'+example.context;
      exampleHost.append(context,makeExampleResponse(example.do));
    }
    const strategy=catalog.strategies[key];

    const rows=strategy?.designPrinciples||[];
    for(const [name,principle] of rows){
      const row=document.createElement('div');row.className='design-principle';
      const title=document.createElement('dt');title.textContent=name;
      const text=document.createElement('dd');text.textContent=principle;
      row.append(title,text);list.append(row);
    }
    $('contextRisk').hidden=key!=='D';
  }
  function updateExpressionView(){
    const available=active==='prototype'||Boolean(window.COLMO_PRINCIPLES[active]);
    $('principlesTab').textContent=active==='prototype'?'人格特质与八维原则':'表达设计原则';
    const showingPrinciples=available&&expressionView==='principles';
    $('expressionViewTabs').hidden=!available;
    $('personalityPanel').hidden=showingPrinciples;
    $('principlesPanel').hidden=!showingPrinciples;
    $('resetButton').hidden=showingPrinciples;
    $('expressionViewTabs').querySelectorAll('[role="tab"]').forEach(button=>{
      const selected=button.dataset.view===(showingPrinciples?'principles':'personality');
      button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;
    });
  }
  function setExpressionView(view){
    hideScale();expressionView=view;updateExpressionView();
  }
  $('expressionViewTabs').querySelectorAll('[role="tab"]').forEach((button,i,buttons)=>{
    button.addEventListener('click',()=>setExpressionView(button.dataset.view));
    button.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+1)%buttons.length;
      buttons[next].click();buttons[next].focus();
    });
  });
  function renderExpressionPrinciples(key){
    const panel=$('principlesPanel');panel.replaceChildren();
    if(key==='prototype'){renderGeneralPrinciples(panel);return;}
    const content=window.COLMO_PRINCIPLES[key];if(!content)return;
    const element=(tag,className,text)=>{const node=document.createElement(tag);node.className=className;if(text)node.textContent=text;return node;};
    content.sections.forEach((section,index)=>{
      const block=element('section','principles-section');
      const heading=element('h3','principles-heading');
      heading.append(element('span','principles-number',String(index+1).padStart(2,'0')),document.createTextNode(section.title));
      block.append(heading,element('p','principles-summary',section.summary));
      const scales=element('div','principles-scales');scales.setAttribute('aria-label','默认人格定位参照');
      section.scales.forEach(scale=>scales.append(element('span','',scale)));block.append(scales);
      const list=element('dl','principles-items');
      section.items.forEach(item=>{
        const row=element('div','principles-item');const description=element('dd','',item.text);
        if(item.states){
          const states=element('dl','principles-states');
          item.states.forEach(state=>{const cell=element('div','');cell.append(element('dt','',state.label),element('dd','',state.text));states.append(cell);});
          description.append(states);
        }
        row.append(element('dt','',item.label),description);list.append(row);
      });
      block.append(list);panel.append(block);
    });
    const example=element('section','principles-example');
    example.append(element('h3','principles-heading','情境案例'),element('p','principles-context',content.example.context));
    const pair=element('div','principles-comparison');
    for(const [kind,title] of [['do','✓ Do'],['dont','× Don’t']]){
      const card=element('div','principles-example-card '+kind);
      card.append(element('h4','',title),makeExampleResponse(content.example[kind]));
      pair.append(card);
    }
    example.append(pair);panel.append(example);
  }
  function appendRangeGuide(host,guide){
    const section=document.createElement('section');section.className='axis-range-guide';
    const title=document.createElement('h4');title.textContent='常规允许范围 · '+guide.range;section.append(title);
    const addBlock=(block)=>{const article=document.createElement('div');article.className='axis-guide-block';const h=document.createElement('h5');h.textContent=block.title;article.append(h);for(const text of block.paragraphs){const p=document.createElement('p');p.textContent=text;article.append(p);}section.append(article);};
    guide.blocks.forEach(addBlock);
    const h=document.createElement('h4');h.textContent='区间内随情境调整表达';section.append(h);guide.adjustments.forEach(addBlock);
    const sources=document.createElement('details');sources.className='axis-guide-sources';const summary=document.createElement('summary');summary.textContent='本轴依据';sources.append(summary);
    for(const ref of guide.references){const p=document.createElement('p');p.textContent=ref;sources.append(p);}section.append(sources);
    const link=document.createElement('a');link.href='https://www.figma.com/design/H3Ve4kkJF3QuIETEv5bLzy?node-id='+guide.sourcePageId.replace(':','-');link.target='_blank';link.rel='noopener noreferrer';link.textContent='查看 Figma 原页 ↗';section.append(link);host.append(section);
  }
  function renderGeneralPrinciples(panel){
    const persona=window.COLMO_PERSONA;
    const intro=document.createElement('p');intro.className='persona-intro';intro.textContent=persona.intro;panel.append(intro);
    const legend=document.createElement('div');legend.className='persona-legend';legend.setAttribute('aria-label','颜色编码');
    for(const [group,title] of [['appearance','形象表达'],['communication','沟通表达'],['action','行动方式']]){
      const item=document.createElement('span');item.className=group;item.textContent='■ '+title;legend.append(item);
    }
    // The three-channel legend belongs to the eight-dimensional principles below.
    for(const trait of persona.traits){
      const section=document.createElement('section');section.className='persona-trait';
      const heading=document.createElement('h3');heading.textContent=trait.title;
      const body=document.createElement('p');
      for(const segment of trait.segments){const span=document.createElement('span');span.textContent=segment.text;const c=segment.color;if(c)span.style.color=`rgb(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)})`;body.append(span);}
      section.append(heading,body);panel.append(section);
    }
    const heading=document.createElement('h3');heading.className='persona-principles-title';heading.textContent='八维表达原则';
    const bridge=document.createElement('p');bridge.className='persona-intro';bridge.textContent=persona.principlesIntro;
    panel.append(heading,bridge,legend);
    window.COLMO_GENERAL_PRINCIPLES.forEach((principle,index)=>{
      const section=document.createElement('section');section.className='principles-section general-principle '+principle.group;
      const heading=document.createElement('h3');heading.className='principles-heading';
      const number=document.createElement('span');number.className='principles-number';number.textContent=String(index+1).padStart(2,'0');
      heading.append(number,document.createTextNode(principle.title));
      const axis=document.createElement('p');axis.className='principles-summary';axis.textContent=principle.axis;
      const text=document.createElement('p');text.className='general-principle-text';text.textContent=principle.text;
      section.append(heading,axis,text);panel.append(section);
    });
  }
  function makeExampleResponse(response){
    const block=document.createElement('div');block.className='example-response';
    response.split('\n').forEach(text=>{
      const paragraph=document.createElement('p');paragraph.textContent=text;block.append(paragraph);
    });
    return block;
  }
  function renderRiskContext(){
    const r=risks[activeRisk];
    document.documentElement.style.setProperty('--strategy-color',r.color);
    $('riskTabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.risk===activeRisk)));
    $('contextPurpose').textContent=catalog.strategies.D.purpose;
    $('contextRisk').textContent=r.title+'｜'+r.definition+' 本策略单独展示，不计入常规人格表达边界。';
    $('activeLegend').textContent=r.title;
    $('editorTitle').textContent=r.title+' · 八维表达';
    $('radarTitle').textContent=r.title+'八维表达雷达图';
  }
  function createRiskTabs(){riskKeys.forEach((key,i)=>{const b=document.createElement('button');b.type='button';b.role='tab';b.dataset.risk=key;b.textContent=risks[key].title;b.style.setProperty('--risk-color',risks[key].color);b.addEventListener('click',()=>{activeRisk=key;select('D');});b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;$('riskTabs').children[next].click();$('riskTabs').children[next].focus();});$('riskTabs').append(b);});}
  function syncAllStrategiesToggle(){
    const count=visibleStrategies.size,total=Object.keys(catalog.strategies).length;
    const toggle=$('allStrategiesToggle');toggle.checked=count===total;toggle.indeterminate=count>0&&count<total;
    $('allStrategiesState').textContent=count===total?'全部显示':count===0?'全部隐藏':'部分显示';
  }
  function setAllStrategiesVisible(visible){
    Object.keys(catalog.strategies).forEach(key=>setStrategyVisible(key,visible,false));
    if(active==='overview')drawOverview();
  }
  $('allStrategiesToggle').addEventListener('change',e=>setAllStrategiesVisible(e.target.checked));
  $('envelopeToggle').addEventListener('change',()=>{if(active==='overview')drawOverview();else transition(250);});
  $('resetButton').addEventListener('click',()=>{if(active==='prototype'){state.baseline=clone(defaults.baseline);constrainStrategies();}else{if(active==='D')state.strategies.D[activeRisk]=[...defaults.strategies.D[activeRisk]];else state.strategies[active]=clone(defaults.strategies[active]);constrainStrategies();}refreshRows();transition();save();toast('已恢复本页默认刻度。');});
  $('exportButton').addEventListener('click',()=>{const data={...clone(state),exportedAt:new Date().toISOString()};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='COLMO-persona-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出表达边界与全部六类策略。');});
  $('importButton').addEventListener('click',()=>$('importFile').click());$('importFile').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1000000)throw new Error('请选择小于 1 MB 的参数文件。');const data=validate(JSON.parse(await file.text()));state=data;if(active==='overview')drawOverview();else{renderEditor();transition();}save();toast('已导入表达边界与六类策略。');}catch(error){toast(error instanceof SyntaxError?'不是有效的 JSON 文件。':error.message);}finally{e.target.value='';}});
  $('caseReferenceButton').addEventListener('click',()=>{hideScale();window.COLMO_CASE_UI.open(active,activeRisk);});
  $('helpButton').addEventListener('click',()=>$('helpDialog').showModal());$('closeHelp').addEventListener('click',()=>$('helpDialog').close());$('helpDialog').addEventListener('click',e=>{if(e.target===$('helpDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
  window.addEventListener('pagehide',()=>{clearTimeout(saveTimer);if(storageAvailable)try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(e){/* Export remains available. */}});
  createRiskTabs();createTabs();createOverview();buildGrid();buildRadarHover();select('overview');openScaleHelp();if(loadMessage)toast(loadMessage);$('saveState').textContent=JSON.stringify(state)===JSON.stringify(defaults)?'Figma 默认定位':'本机调整稿';
})();
