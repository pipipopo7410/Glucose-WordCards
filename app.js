'use strict';
/* 血糖調節 2.0：改良既有概念圖操作，保留教師演示所需的選做路徑。 */
const ORGANS = [
 {name:'口腔',bg:'#fff0f3',bd:'#e9afbf',fg:'#87344b'},
 {name:'小腸',bg:'#fff0df',bd:'#e8bf85',fg:'#845216'},
 {name:'血管',bg:'#ffe8e9',bd:'#e7a6aa',fg:'#8d353c'},
 {name:'肝臟',bg:'#fff0e7',bd:'#dba491',fg:'#884c32'},
 {name:'肌肉組織',bg:'#eee8ff',bd:'#b8a5e2',fg:'#63458d'},
 {name:'脂肪組織',bg:'#fff4d9',bd:'#ebce83',fg:'#7d611b'},
 {name:'細胞粒線體',bg:'#e3faed',bd:'#94d6b1',fg:'#236c4c'}
];
const MATTERS=[
 {name:'澱粉',fg:'#fcd34d'},{name:'葡萄糖',fg:'#fdba74'},{name:'肝糖',fg:'#fca5a5'},
 {name:'脂肪',fg:'#fef08a'},{name:'氧氣',fg:'#67e8f9'}
];
const HORMONES=[{name:'胰島素',bg:'#2563bc',bd:'#194b94'},{name:'升糖素',bg:'#bf435b',bd:'#96304a'}];
const RULES=[
 {from:'口腔',to:'小腸',h:'',source:'澱粉',target:'葡萄糖',required:true},
 {from:'小腸',to:'血管',h:'',source:'葡萄糖',target:'葡萄糖',required:true},
 {from:'血管',to:'肝臟',h:'胰島素',source:'葡萄糖',target:'肝糖',required:true},
 {from:'肝臟',to:'血管',h:'升糖素',source:'肝糖',target:'葡萄糖',required:true},
 {from:'血管',to:'肌肉組織',h:'胰島素',source:'葡萄糖',target:'肝糖',required:true},
 {from:'血管',to:'脂肪組織',h:'胰島素',source:'葡萄糖',target:'脂肪',required:false},
 {from:'血管',to:'細胞粒線體',h:'胰島素',source:'葡萄糖',target:'葡萄糖',required:false}
];
const ALLOWED_MATTER={口腔:['澱粉'],小腸:['澱粉','葡萄糖'],血管:['葡萄糖'],肝臟:['肝糖'],肌肉組織:['肝糖'],脂肪組織:['脂肪'],細胞粒線體:['葡萄糖']};
const GRID=24,GAP=10,OW=112,OH=50;
const $=id=>document.getElementById(id);
const canvas=$('canvas'),svg=$('svg-layer'),hormoneLayer=$('hormone-slots'),sidebar=$('sidebar');
const organPool=$('organ-pool'),matterPool=$('matter-pool'),hormonePool=$('hormone-pool');
const snapBtn=$('snap-btn'),hintBtn=$('hint-btn');
let organs=new Map(),links=[],idCounter=0,linkCounter=0,sourceId=null,tool=null,drag=null,ignoreClickUntil=0;
let snap=false,hints=false,hoverTarget=null,dialogFocus=null,deferredInstall=null,offlineReady=false,epoch=0;
const clamp=(v,low,high)=>Math.max(low,Math.min(v,Math.max(low,high)));
const nameOf=id=>organs.get(id)?.name||'';
const organOfName=name=>[...organs.values()].find(o=>o.name===name);
const ruleForLink=link=>RULES.find(r=>r.from===nameOf(link.from)&&r.to===nameOf(link.to));
const say=t=>{$('status-text').textContent=t;};
function overlap(x,y,w,h,items){return items.some(a=>x<a.x+a.w+GAP&&x+w+GAP>a.x&&y<a.y+a.h+GAP&&y+h+GAP>a.y);}
function occupied(except){return [...organs.values()].filter(o=>o.placed&&o.id!==except).map(o=>({x:o.x,y:o.y,w:OW,h:OH}));}
function clampSpot(x,y){return {x:clamp(x,0,Math.max(0,canvas.clientWidth-OW)),y:clamp(y,0,Math.max(0,canvas.clientHeight-OH))};}
function findSpot(x,y,grid=snap,others=occupied(null)){
 const base=clampSpot(x,y),step=grid?GRID:17,maxR=Math.ceil(Math.max(canvas.clientWidth,canvas.clientHeight)/step)+2;
 let best;
 for(let r=0;r<=maxR;r++){
  for(let a=-r;a<=r;a++)for(let b=-r;b<=r;b++){
   if(Math.max(Math.abs(a),Math.abs(b))!==r)continue;
   const px=grid?Math.round((base.x+OW/2)/GRID)*GRID-OW/2+a*GRID:base.x+a*step;
   const py=grid?Math.round((base.y+OH/2)/GRID)*GRID-OH/2+b*GRID:base.y+b*step;
   if(px<0||py<0||px+OW>canvas.clientWidth||py+OH>canvas.clientHeight||overlap(px,py,OW,OH,others))continue;
   const d=(px-x)**2+(py-y)**2;if(!best||d<best.d)best={x:px,y:py,d};
  }
  if(best)return best;
 }
 return base;
}
function pos(o){o.el.style.setProperty('--x',o.x+'px');o.el.style.setProperty('--y',o.y+'px');}
function clearSelection(){if(sourceId)organOfId(sourceId)?.el.classList.remove('selected');sourceId=null;tool=null;document.querySelectorAll('.pool-selected').forEach(x=>x.classList.remove('pool-selected'));canvas.classList.remove('placing-mode');}
const organOfId=id=>organs.get(id);
function selectTool(kind,name,el){clearSelection();tool={kind,name};el?.classList.add('pool-selected');canvas.classList.add('placing-mode');say(kind==='organ'?`點畫布放置「${name}」，也可以直接拖曳。`:kind==='matter'?`已選「${name}」：請點器官右下角的物質框。`:`已選「${name}」：請點連線中央的激素框。`);}
function selectSource(o){clearSelection();sourceId=o.id;o.el.classList.add('selected');say(`已選「${o.name}」：接著點目標器官，建立 ${o.name} → 對方 的箭頭；再點自己可取消。`);}
function createOrgan(model,i){
 const id='organ-'+i,btn=document.createElement('button');btn.type='button';btn.className='organ-template';btn.id='pool-'+id;btn.dataset.organId=id;btn.textContent=model.name;
 ['bg','bd','fg'].forEach(k=>btn.style.setProperty('--'+k,model[k]));
 btn.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectTool('organ',model.name,btn);}});
 const o={id,name:model.name,model,poolEl:btn,el:null,slot:null,placed:false,placeholder:null,matter:null,respirationDone:false,x:0,y:0};organs.set(id,o);
 organPool.append(btn);btn.addEventListener('pointerdown',e=>pointerDown(e,{kind:'organ',o,wasPlaced:false}));
 return o;
}
function createTemplate(item,kind,pool){const b=document.createElement('button');b.type='button';b.className=kind+'-template';b.textContent=item.name;b.dataset.name=item.name;
 b.style.setProperty('--fg',item.fg||'#fff');if(item.bg)b.style.setProperty('--bg',item.bg);if(item.bd)b.style.setProperty('--bd',item.bd);
 pool.append(b);b.addEventListener('pointerdown',e=>pointerDown(e,{kind,name:item.name,el:b}));b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectTool(kind,item.name,b);}});}
function setPosition(o,x,y){o.x=x;o.y=y;pos(o);draw();}
function makeOrgan(o){
 if(o.placed)return;
 o.placed=true;
 const ph=document.createElement('span');ph.className='pool-placeholder';ph.textContent='已放置';o.poolEl.replaceWith(ph);o.placeholder=ph;
 const el=document.createElement('button');el.type='button';el.className='organ-card';el.textContent=o.name;el.dataset.organId=o.id;el.style.setProperty('--ow',OW+'px');el.style.setProperty('--oh',OH+'px');
 for(const k of ['bg','bd','fg'])el.style.setProperty('--'+k,o.model[k]);
 const sl=document.createElement('span');sl.className='organ-slot';sl.setAttribute('role','button');sl.tabIndex=0;sl.setAttribute('aria-label',o.name+'的物質放置框');sl.textContent='放物質';el.append(sl);
 canvas.append(el);o.el=el;o.slot=sl;
 el.addEventListener('pointerdown',e=>pointerDown(e,{kind:'organ',o,wasPlaced:true}));
 sl.addEventListener('pointerdown',e=>{e.stopPropagation();pointerDown(e,{kind:'matter-slot',o,name:o.matter});});
 sl.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onMatterSlot(o);}});
 updateCounter();
}
function placeOrgan(o,x,y){makeOrgan(o);const p=findSpot(x,y,false,occupied(o.id));o.x=p.x;o.y=p.y;pos(o);draw();updateCounter();}
function removeOrgan(o){
 if(!o.placed)return;
 const n=links.filter(l=>l.from===o.id||l.to===o.id).length;
 links=links.filter(l=>l.from!==o.id&&l.to!==o.id);o.placed=false;o.matter=null;o.respirationDone=false;
 o.el.remove();o.el=null;o.slot=null;o.placeholder?.replaceWith(o.poolEl);o.placeholder=null;
 if(sourceId===o.id)clearSelection();draw();updateCounter();say(`已收回「${o.name}」${n?'並移除相關連線':''}。`);
}
function alignAll(){let planned=[];for(const o of organs.values())if(o.placed){const p=findSpot(o.x,o.y,true,planned);planned.push({...p,w:OW,h:OH,o});}for(const p of planned){p.o.x=p.x;p.o.y=p.y;pos(p.o);p.o.el.classList.remove('snapped');void p.o.el.offsetWidth;p.o.el.classList.add('snapped');}draw();return planned.length;}
function setMatter(o,name,quiet=false){
 if(name&&hints&&!ALLOWED_MATTER[o.name].includes(name)){say(`「${name}」不適合放在「${o.name}」，請再試試。`);flash(o.slot);return false;}
 o.matter=name;o.respirationDone=false;updateOrganSlot(o);updateCounter();draw();if(!quiet)say(name?`已把「${name}」放進「${o.name}」。`:`已從「${o.name}」拔出物質卡。`);return true;
}
function updateOrganSlot(o){if(!o.placed)return;const m=MATTERS.find(x=>x.name===o.matter);o.slot.textContent=o.matter||(o.respirationDone?'呼吸完成':'放物質');o.slot.classList.toggle('reaction',o.respirationDone);o.slot.classList.toggle('filled',!!o.matter);o.slot.dataset.matter=o.matter||'';o.slot.style.setProperty('--matter-color',m?.fg||'#fff');o.slot.classList.remove('wrong','correct');}
function chooseConnection(a,b){if(a.id===b.id)return;
 const idx=links.findIndex(l=>l.from===a.id&&l.to===b.id);
 if(idx>=0){links.splice(idx,1);say('已移除這條箭頭；反向箭頭（若有）不受影響。');}
 else{links.push({id:'link-'+(++linkCounter),from:a.id,to:b.id,hormone:'',status:'neutral',slotX:0,slotY:0});say(`已建立 ${a.name} → ${b.name}；拖曳激素到虛線框（部分箭頭不需要激素）。`);}
 draw();updateCounter();
}
function onOrganClick(o){if(!o.placed){selectTool('organ',o.name,o.poolEl);return;}if(tool)clearSelection();if(!sourceId){selectSource(o);return;}if(sourceId===o.id){clearSelection();say('已取消選取。');return;}const from=organOfId(sourceId);chooseConnection(from,o);clearSelection();}
function onMatterSlot(o){if(tool?.kind==='matter'){if(!(tool.name==='氧氣'&&spawnRespiration(o)))setMatter(o,tool.name);clearSelection();return;}if(o.matter){say(`「${o.name}」目前放的是「${o.matter}」。可直接拖出、移走，或先選其他物質替換。`);}else say('先點選物質卡，再點這個框；或直接拖曳物質過來。');}
function onHormoneSlot(link){if(tool?.kind==='hormone'){setHormone(link,tool.name);clearSelection();return;}if(link.hormone){say(`這條線放的是「${link.hormone}」，可以把它拔出、換放到其他線。`);}else say('先點選胰島素或升糖素，再點這條線的虛線框。');}
function setHormone(link,name,quiet=false){
 const rule=ruleForLink(link);
 if(name&&hints&&(!rule||rule.h!==name)){say(`「${name}」不適合這條箭頭；想自行挑戰可關閉即時提示。`);flash(hormoneLayer.querySelector(`[data-link="${link.id}"]`));return false;}
 link.hormone=name;link.status='neutral';draw();updateCounter();if(!quiet)say(name?`已將「${name}」放在 ${nameOf(link.from)} → ${nameOf(link.to)}。`:'已拔出激素卡。');return true;
}
function flash(el){if(!el)return;el.animate([{transform:'translate(-50%,-50%) scale(1)'},{transform:'translate(-50%,-50%) scale(1.17)',background:'#ffe2e1'},{transform:'translate(-50%,-50%) scale(1)'}],{duration:320});}
function draw(){
 for(const o of organs.values())if(o.placed)o.slot.classList.remove('matter-increase','matter-decrease');
 svg.replaceChildren();hormoneLayer.replaceChildren();const ns='http://www.w3.org/2000/svg';
 const defs=document.createElementNS(ns,'defs');for(const [color,label] of [['#94a3b8','gray'],['#10a77b','green'],['#ee6262','red']]){
 const mk=document.createElementNS(ns,'marker');for(const [a,b] of Object.entries({id:'arrow-'+label,viewBox:'0 0 10 10',refX:'9',refY:'5',markerWidth:'6',markerHeight:'6',orient:'auto'}))mk.setAttribute(a,b);
 const p=document.createElementNS(ns,'path');p.setAttribute('d','M0 0 L10 5 L0 10z');p.setAttribute('fill',color);mk.append(p);defs.append(mk);
 }svg.append(defs);
 for(const l of links){
  const a=organOfId(l.from),b=organOfId(l.to);if(!a?.placed||!b?.placed)continue;
  const x1=a.x+OW/2,y1=a.y+OH/2,x2=b.x+OW/2,y2=b.y+OH/2;
  const dx=x2-x1,dy=y2-y1,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d;
  // 雙向路徑偏移，避免胰島素與升糖素疊在同一條線上。
  const reverse=links.some(q=>q.from===l.to&&q.to===l.from),shift=reverse?13:0;
  const nx=-uy*shift,ny=ux*shift,trim=Math.min(46,d*.35);
  const startX=x1+ux*trim+nx,startY=y1+uy*trim+ny,endX=x2-ux*trim+nx,endY=y2-uy*trim+ny;
  const line=document.createElementNS(ns,'line');for(const [key,v] of Object.entries({x1:startX,y1:startY,x2:endX,y2:endY,'stroke-width':'3.1','stroke-linecap':'round',stroke:l.status==='green'?'#10a77b':l.status==='red'?'#ee6262':'#94a3b8','marker-end':'url(#arrow-'+(l.status==='green'?'green':l.status==='red'?'red':'gray')+')'}))line.setAttribute(key,v);
  svg.append(line);l.slotX=(startX+endX)/2;l.slotY=(startY+endY)/2;
  const tag=document.createElement('button');tag.type='button';tag.className='hormone-slot';tag.dataset.link=l.id;tag.textContent=l.hormone||'放激素';tag.style.left=l.slotX+'px';tag.style.top=l.slotY+'px';
  if(l.hormone){tag.classList.add('filled');tag.style.setProperty('--h-bg',l.hormone==='胰島素'?'#2563bc':'#bf435b');}
  if(l.status!=='neutral')tag.classList.add(l.status==='green'?'correct':'wrong');
  tag.setAttribute('aria-label',`${a.name}到${b.name}，${l.hormone||'尚未放置激素'}`);hormoneLayer.append(tag);
  tag.addEventListener('pointerdown',e=>pointerDown(e,{kind:'hormone-slot',link:l,name:l.hormone}));
  tag.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onHormoneSlot(l);}});
  if(l.hormone){const active=ruleForLink(l);if(active?.h===l.hormone){
    if(a.matter)a.slot.classList.add('matter-decrease');
    if(b.matter)b.slot.classList.add('matter-increase');
   }
   const anim=document.createElementNS(ns,'line');for(const [k,v] of Object.entries({x1:startX,y1:startY,x2:endX,y2:endY,stroke:l.hormone==='胰島素'?'#3b82f6':'#ef5670','stroke-width':'2.5','stroke-dasharray':'9 9',opacity:'.72'}))anim.setAttribute(k,v);anim.style.animation='dash '+(l.hormone==='胰島素'?'1.1s':'1.35s')+' linear infinite';svg.append(anim);}
 }
}
function status(){const req=RULES.filter(r=>r.required);const optional=RULES.filter(r=>!r.required);const ok=links.filter(l=>matchLink(l)).map(l=>ruleForLink(l));
 $('canvas-counter').textContent=`核心路徑 ${req.filter(r=>ok.includes(r)).length}／${req.length} · 延伸 ${optional.filter(r=>ok.includes(r)).length}／${optional.length}`;
 $('canvas-empty').hidden=[...organs.values()].some(o=>o.placed);
}
const updateCounter=status;
function matchLink(link){const rule=ruleForLink(link);if(!rule||rule.h!==link.hormone)return false;
 const f=organOfId(link.from),t=organOfId(link.to);return f.matter===rule.source&&(t.matter===rule.target||(t.name==='細胞粒線體'&&t.respirationDone));
}
function checkAnswers(){let correct=new Set(),wrong=[];links.forEach(l=>{const r=ruleForLink(l);if(matchLink(l)){l.status='green';correct.add(r);}else{l.status='red';wrong.push(`${nameOf(l.from)} → ${nameOf(l.to)}`);}});
 for(const o of organs.values())if(o.placed){o.slot.classList.remove('wrong','correct');if(o.matter){o.slot.classList.add(ALLOWED_MATTER[o.name].includes(o.matter)?'correct':'wrong');}}
 const missing=RULES.filter(r=>r.required&&!correct.has(r));draw();updateCounter();
 if(missing.length===0&&wrong.length===0&&!([...organs.values()].some(o=>o.placed&&o.matter&&!ALLOWED_MATTER[o.name].includes(o.matter)))){
  showDialog('血糖調節系統建構成功！',`<p>五條必要關係與物質／激素判定都正確！</p><p>脂肪合成、細胞利用葡萄糖是選做延伸，不影響通關。</p><p>你可以繼續在同一張圖上添加延伸路徑，用來討論血糖恆定。</p>`);say('五條核心路徑全部正確！');
 }else{
  const detail=`<p>已完成 <strong>${RULES.filter(r=>r.required&&correct.has(r)).length}／5</strong> 條核心路徑。</p>`+
   (wrong.length?`<p>有 <strong>${wrong.length}</strong> 條連線的方向、激素或物質不符合規則，已標紅。</p>`:'')+
   (missing.length?`<p>還有 <strong>${missing.length}</strong> 條核心路徑尚未完整符合條件（不直接公布答案）。</p>`:'')+
   `<p>請檢查器官右下角的物質框、箭頭方向，以及激素是否放在相符的路徑。</p>`;
  showDialog('再檢查一下概念關係',detail);say('已標出需要重新檢視的連線；脂肪與細胞利用路徑可不做。');
 }
}
function showDialog(title,html){dialogFocus=document.activeElement;$('dialog-title').textContent=title;$('dialog-content').innerHTML=html;$('dialog').hidden=false;$('dialog-close').focus();}
function hideDialog(){$('dialog').hidden=true;dialogFocus?.focus?.();}
function init(){
 epoch++;cancelDrag(false);clearSelection();links=[];organs=new Map();idCounter=0;linkCounter=0;snap=false;hints=false;
 snapBtn.textContent='貼齊格線：關';hintBtn.textContent='即時提示：關';snapBtn.setAttribute('aria-pressed','false');hintBtn.setAttribute('aria-pressed','false');
 organPool.replaceChildren();matterPool.replaceChildren();hormonePool.replaceChildren();
 canvas.querySelectorAll('.organ-card,.particle,.canvas-toast').forEach(n=>n.remove());hormoneLayer.replaceChildren();svg.replaceChildren();
 ORGANS.forEach(createOrgan);MATTERS.forEach(m=>createTemplate(m,'matter',matterPool));HORMONES.forEach(h=>createTemplate(h,'hormone',hormonePool));
 hideDialog();draw();updateCounter();say('先放器官，點兩張器官建立箭頭；物質放在器官右下角，激素放在線中央。');
}
function inRect(x,y,r){return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;}
function closestSlot(kind,x,y){let best=null,dist=60;
 let list=kind==='matter'?[...organs.values()].filter(o=>o.placed).map(o=>({kind:'matter',o,el:o.slot})):links.map(l=>({kind:'hormone',link:l,el:hormoneLayer.querySelector(`[data-link="${l.id}"]`)}));
 for(const item of list){if(!item.el)continue;const b=item.el.getBoundingClientRect(),d=Math.hypot(x-(b.left+b.width/2),y-(b.top+b.height/2));if(d<dist){best=item;dist=d;}}
 return best;
}
function magnet(t){const el=t?.el;if(hoverTarget?.el!==el){hoverTarget?.el?.classList.remove('magnet-target');hoverTarget=t;el?.classList.add('magnet-target');}}
function preview(kind,name,x,y){const p=document.createElement('span');p.className='drag-preview '+kind;p.textContent=name;
 if(kind==='matter')p.style.setProperty('--fg',MATTERS.find(m=>m.name===name)?.fg||'#fff');else p.style.setProperty('--bg',HORMONES.find(m=>m.name===name)?.bg||'#345b80');
 document.body.append(p);movePreview(p,x,y,null);return p;}
function movePreview(p,x,y,target){if(!p)return;
 const r=target?.el?.getBoundingClientRect();if(r){x=x*.28+(r.left+r.width/2)*.72;y=y*.28+(r.top+r.height/2)*.72;}
 p.style.left=x-p.offsetWidth/2+'px';p.style.top=y-p.offsetHeight/2+'px';p.classList.toggle('magnetized',!!target);
}
function cancelDrag(restore=true){if(!drag)return;
 window.removeEventListener('pointermove',pointerMove);window.removeEventListener('pointerup',pointerUp);window.removeEventListener('pointercancel',pointerCancel);
 if(restore&&drag.started&&drag.originItem){if(drag.kind==='matter-slot'&&drag.originItem.o&&drag.originItem.o.matter===null)setMatter(drag.originItem.o,drag.name,true);if(drag.kind==='hormone-slot'&&drag.originItem.link&&drag.originItem.link.hormone==='')setHormone(drag.originItem.link,drag.name,true);}
 if(restore&&drag.wasPlaced&&drag.o?.placed){drag.o.x=drag.originX;drag.o.y=drag.originY;pos(drag.o);draw();}
 drag.preview?.remove();drag.ghost?.remove();drag.o?.el?.classList.remove('dragging');sidebar.classList.remove('drop-target');magnet(null);drag=null;
}
function pointerDown(e,info){if(e.button!==undefined&&e.button!==0)return;if(drag)cancelDrag();
 const isOrgan=info.kind==='organ',placed=isOrgan&&info.o.placed,r=canvas.getBoundingClientRect();
 let ox=0,oy=0;if(placed){ox=e.clientX-r.left-info.o.x;oy=e.clientY-r.top-info.o.y;}
 drag={...info,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,started:false,wasPlaced:placed,originX:placed?info.o.x:0,originY:placed?info.o.y:0,offX:ox,offY:oy,preview:null,ghost:null,originItem:null};
 e.stopPropagation();window.addEventListener('pointermove',pointerMove,{passive:false});window.addEventListener('pointerup',pointerUp);window.addEventListener('pointercancel',pointerCancel);
}
function pointerMove(e){if(!drag||e.pointerId!==drag.pointerId)return;drag.x=e.clientX;drag.y=e.clientY;
 if(!drag.started&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>=7){
 drag.started=true;clearSelection();if(drag.kind==='organ'){
  if(drag.wasPlaced)drag.o.el.classList.add('dragging');
  else{const g=document.createElement('div');g.className='organ-card drag-ghost';g.textContent=drag.o.name;g.style.setProperty('--ow',OW+'px');g.style.setProperty('--oh',OH+'px');for(const k of ['bg','bd','fg'])g.style.setProperty('--'+k,drag.o.model[k]);document.body.append(g);drag.ghost=g;}
 }else{
  if(drag.kind==='matter-slot'&&drag.name){drag.originItem={o:drag.o};setMatter(drag.o,null,true);}
  if(drag.kind==='hormone-slot'&&drag.name){drag.originItem={link:drag.link};setHormone(drag.link,'',true);}
  if(drag.name)drag.preview=preview(drag.kind.startsWith('matter')?'matter':'hormone',drag.name,e.clientX,e.clientY);
 }
 }
 if(!drag.started)return;e.preventDefault();
 if(drag.kind==='organ'){
  sidebar.classList.toggle('drop-target',drag.wasPlaced&&inRect(e.clientX,e.clientY,sidebar.getBoundingClientRect()));
  if(drag.wasPlaced){const r=canvas.getBoundingClientRect();const p=clampSpot(e.clientX-r.left-drag.offX,e.clientY-r.top-drag.offY);setPosition(drag.o,p.x,p.y);}
  else if(drag.ghost){drag.ghost.style.setProperty('--x',e.clientX-OW/2+'px');drag.ghost.style.setProperty('--y',e.clientY-OH/2+'px');}
 }else if(drag.preview){const kind=drag.kind.startsWith('matter')?'matter':'hormone';const target=closestSlot(kind,e.clientX,e.clientY);magnet(target);movePreview(drag.preview,e.clientX,e.clientY,target);}
}
function rejection(p){if(!p)return;const c=p.cloneNode(true);c.classList.remove('magnetized');c.classList.add('reject');document.body.append(c);c.addEventListener('animationend',()=>c.remove(),{once:true});setTimeout(()=>c.remove(),420);}
function pointerUp(e){if(!drag||e.pointerId!==drag.pointerId)return;
 const d=drag,moved=d.started;ignoreClickUntil=moved?performance.now()+260:0;
 if(moved){
 if(d.kind==='organ'){
  const r=canvas.getBoundingClientRect(),onCanvas=inRect(e.clientX,e.clientY,r),o=d.o;
  if(!d.wasPlaced){if(onCanvas){placeOrgan(o,e.clientX-r.left-OW/2,e.clientY-r.top-OH/2);if(snap){const p=findSpot(o.x,o.y,true,occupied(o.id));o.x=p.x;o.y=p.y;pos(o);}say(`已放置「${o.name}」。`);}else say('器官仍在側欄，拖入畫布後放開即可放置。');}
  else if(inRect(e.clientX,e.clientY,sidebar.getBoundingClientRect()))removeOrgan(o);
  else if(!onCanvas){o.x=d.originX;o.y=d.originY;pos(o);draw();say('放在畫布外，已回到原位置。');}
  else{const p=findSpot(o.x,o.y,snap,occupied(o.id));o.x=p.x;o.y=p.y;pos(o);draw();say(snap?'器官已貼齊附近格線。':`已移動「${o.name}」。`);}
 }else if(d.name){
  const type=d.kind.startsWith('matter')?'matter':'hormone';
  let target=closestSlot(type,e.clientX,e.clientY);
  if(type==='matter'&&d.name==='氧氣'){const c=organOfName('細胞粒線體');if(c?.placed){const rect=c.el.getBoundingClientRect();if(inRect(e.clientX,e.clientY,rect)&&spawnRespiration(c)){d.originItem=null;target=null;d.name=null;say('氧氣與葡萄糖已參與細胞呼吸示意。');}}}
  if(target){let ok=false;
   if(type==='matter'&&d.name==='氧氣'&&target.o.name==='細胞粒線體')ok=spawnRespiration(target.o);
   if(!ok)ok=type==='matter'?setMatter(target.o,d.name):setHormone(target.link,d.name);
   if(ok)d.originItem=null;else{rejection(d.preview);if(d.originItem?.o)setMatter(d.originItem.o,d.name,true);if(d.originItem?.link)setHormone(d.originItem.link,d.name,true);d.originItem=null;say('即時提示：這個位置不適合，已退回原處。');}}
  else{d.originItem=null;say(type==='matter'?'物質已拔出；空白處放開即可移除。':'激素已拔出；空白處放開即可移除。');}
 }
 }else{
 if(d.kind==='organ')onOrganClick(d.o);
 else if(d.kind==='matter'||d.kind==='hormone')selectTool(d.kind,d.name,d.el);
 else if(d.kind==='matter-slot')onMatterSlot(d.o);
 else if(d.kind==='hormone-slot')onHormoneSlot(d.link);
 }
 // 完成拖曳後，不要讓 cancelDrag 將已移動的卡片回復原位置。
 d.originItem=null;d.wasPlaced=false;drag&&cancelDrag(false);magnet(null);draw();updateCounter();
}
function pointerCancel(){cancelDrag(true);}
function canvasClick(e){if(performance.now()<ignoreClickUntil||e.target!==canvas)return;if(!tool){clearSelection();return;}
 if(tool.kind==='organ'){const o=organOfName(tool.name);if(!o||o.placed){clearSelection();return;}const r=canvas.getBoundingClientRect();placeOrgan(o,e.clientX-r.left-OW/2,e.clientY-r.top-OH/2);say(`已放置「${o.name}」。`);clearSelection();}
}
function spawnRespiration(o){if(o.name!=='細胞粒線體'||o.matter!=='葡萄糖')return false;
 o.matter=null;o.respirationDone=true;updateOrganSlot(o);draw();const labels=[['水','#93c5fd',-70,-60],['二氧化碳','#dddfe6',0,-90],['能量 (ATP)','#fde68a',75,-65]];
 for(const [name,color,dx,dy] of labels){const p=document.createElement('div');p.className='particle';p.textContent=name;p.style.setProperty('--px',o.x+OW/2-30+'px');p.style.setProperty('--py',o.y+'px');p.style.setProperty('--color',color);p.style.setProperty('--dx',dx+'px');p.style.setProperty('--dy',dy+'px');canvas.append(p);p.addEventListener('animationend',()=>p.remove(),{once:true});}
 say('細胞呼吸示意：葡萄糖和氧氣參與反應，產生二氧化碳、水並釋放能量。');updateCounter();return true;
}
function maybeRespiration(target,kind,name){return kind==='matter'&&name==='氧氣'&&target?.o?.name==='細胞粒線體'&&spawnRespiration(target.o);}
function reset(){if(links.length||[...organs.values()].some(o=>o.placed)){if(!confirm('確定清空全部字卡與連線，重新開始嗎？'))return;}init();}
function showInstall(){if(deferredInstall){deferredInstall.prompt();deferredInstall.userChoice.finally(()=>deferredInstall=null);return;}
 showDialog('安裝到 iPad／手機',`<p><strong>iPad／iPhone（Safari）</strong>：開啟 GitHub Pages 網址 → 分享 → 加入主畫面。</p><p><strong>Android（Chrome）</strong>：點瀏覽器選單 → 安裝應用程式或加入主畫面。</p><p>安裝後可以獨立從桌面啟動；第一次連網完成檔案快取後，才可驗收離線使用。</p>`);
}
function network(){const el=$('network-status'),online=navigator.onLine;el.classList.toggle('offline',!online||!offlineReady);el.textContent=offlineReady?(online?'✓ 離線檔案已就緒':'✓ 離線使用中'):(online?'離線檔案尚未就緒':'離線（快取未確認）');}
async function verifyOffline(reg){if(!reg?.active)return;try{const ch=new MessageChannel();const res=await Promise.race([new Promise(ok=>{ch.port1.onmessage=e=>ok(e.data);reg.active.postMessage({type:'CHECK_OFFLINE'},[ch.port2]);}),new Promise(ok=>setTimeout(()=>ok(null),3000))]);offlineReady=!!res?.ready;}catch(e){offlineReady=false;}network();}
// 集中註冊介面事件。
$('check-btn').addEventListener('click',checkAnswers);snapBtn.addEventListener('click',()=>{snap=!snap;snapBtn.setAttribute('aria-pressed',String(snap));snapBtn.textContent='貼齊格線：'+(snap?'開':'關');if(snap){const n=alignAll();say(`已貼齊 ${n} 張器官字卡，之後拖曳也會吸附格線。`);}else say('已關閉格線吸附，恢復自由排列。');});
hintBtn.addEventListener('click',()=>{hints=!hints;hintBtn.setAttribute('aria-pressed',String(hints));hintBtn.textContent='即時提示：'+(hints?'開':'關');say(hints?'即時提示已開啟：明顯不符的物質與激素會退回；最後仍須檢查全部概念。':'即時提示已關閉：自由探索後按檢查統一判定。');});
$('reset-btn').addEventListener('click',reset);$('install-btn').addEventListener('click',showInstall);$('dialog-close').addEventListener('click',hideDialog);$('dialog').addEventListener('click',e=>{if(e.target===$('dialog'))hideDialog();});
window.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('dialog').hidden)hideDialog();else clearSelection();}});
canvas.addEventListener('click',canvasClick);
window.addEventListener('resize',()=>{for(const o of organs.values())if(o.placed){const p=clampSpot(o.x,o.y);o.x=p.x;o.y=p.y;pos(o);}draw();});
window.addEventListener('online',network);window.addEventListener('offline',network);window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;});
init();network();
if('serviceWorker'in navigator&&location.protocol.startsWith('http')){
 window.addEventListener('load',async()=>{try{const reg=await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;await verifyOffline(reg);}catch(e){console.warn('本次尚未啟用離線快取：',e);}});
 navigator.serviceWorker.addEventListener('controllerchange',async()=>{try{await verifyOffline(await navigator.serviceWorker.getRegistration('./'));}catch(e){}});
}
// 提供測試與後續模組重構使用的唯讀驗證入口。
window.__BIO_SUGAR_TEST__={RULES,ORGANS,MATTERS,HORMONES,getState:()=>({organs:[...organs.values()].map(o=>({name:o.name,matter:o.matter,placed:o.placed,respirationDone:o.respirationDone})),links:links.map(l=>({from:nameOf(l.from),to:nameOf(l.to),hormone:l.hormone,status:l.status}))}),place:(name,x,y)=>{const o=organOfName(name);if(o&&!o.placed)placeOrgan(o,x,y);},connect:(f,t)=>{const a=organOfName(f),b=organOfName(t);if(a?.placed&&b?.placed)chooseConnection(a,b);},putMatter:(n,m)=>{const o=organOfName(n);return o?.placed?setMatter(o,m,true):false;},putHormone:(f,t,h)=>{const l=links.find(l=>nameOf(l.from)===f&&nameOf(l.to)===t);return l?setHormone(l,h,true):false;},check:checkAnswers,reset:init};
