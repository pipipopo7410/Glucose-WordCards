'use strict';
/* 血糖調節 3.1.1：情境暫時加入腎上腺素、漸層光暈與安全區避讓。 */
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
const HORMONES=[{name:'胰島素',bg:'#79334f',bd:'#52213d',fg:'#ffffff'},{name:'升糖素',bg:'#f8b6c4',bd:'#df8198',fg:'#70263e'}]; // 腎上腺素僅在運動動畫裡暫時出現
const RULES=[
 {from:'口腔',to:'小腸',h:'',source:'澱粉',target:['澱粉','葡萄糖'],required:true},
 {from:'小腸',to:'血管',h:'',source:['澱粉','葡萄糖'],target:'葡萄糖',required:true},
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
const matchMatter=(actual,expected)=>Array.isArray(expected)?expected.includes(actual):actual===expected;
const needsHormone=link=>!['口腔→小腸','小腸→血管'].includes(`${nameOf(link.from)}→${nameOf(link.to)}`);
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
function placeOrgan(o,x,y){invalidateDemonstration();makeOrgan(o);const p=findSpot(x,y,false,occupied(o.id));o.x=p.x;o.y=p.y;pos(o);draw();updateCounter();}
function removeOrgan(o){
 if(!o.placed)return;invalidateDemonstration();
 const n=links.filter(l=>l.from===o.id||l.to===o.id).length;
 links=links.filter(l=>l.from!==o.id&&l.to!==o.id);o.placed=false;o.matter=null;o.respirationDone=false;
 o.el.remove();o.el=null;o.slot=null;o.placeholder?.replaceWith(o.poolEl);o.placeholder=null;
 if(sourceId===o.id)clearSelection();draw();updateCounter();say(`已收回「${o.name}」${n?'並移除相關連線':''}。`);
}
function alignAll(){let planned=[];for(const o of organs.values())if(o.placed){const p=findSpot(o.x,o.y,true,planned);planned.push({...p,w:OW,h:OH,o});}for(const p of planned){p.o.x=p.x;p.o.y=p.y;pos(p.o);p.o.el.classList.remove('snapped');void p.o.el.offsetWidth;p.o.el.classList.add('snapped');}draw();return planned.length;}
function setMatter(o,name,quiet=false){if(!demoInternalUpdate)invalidateDemonstration();
 if(name&&hints&&!ALLOWED_MATTER[o.name].includes(name)){say(`「${name}」不適合放在「${o.name}」，請再試試。`);flash(o.slot);return false;}
 o.matter=name;o.respirationDone=false;updateOrganSlot(o);updateCounter();draw();if(!quiet)say(name?`已把「${name}」放進「${o.name}」。`:`已從「${o.name}」拔出物質卡。`);return true;
}
function updateOrganSlot(o){if(!o.placed)return;const m=MATTERS.find(x=>x.name===o.matter);const label=o.matter?(o.name==='小腸'?'澱粉/\n葡萄糖':o.name==='血管'&&o.matter==='葡萄糖'?'葡萄糖\n(血糖)':o.matter):(o.respirationDone?'呼吸完成':'放物質');o.slot.textContent=label;o.slot.classList.toggle('reaction',o.respirationDone);o.slot.classList.toggle('filled',!!o.matter);o.slot.dataset.matter=o.matter||'';o.slot.style.setProperty('--matter-color',m?.fg||'#fff');o.slot.classList.remove('wrong','correct');}
function chooseConnection(a,b){if(a.id===b.id)return;invalidateDemonstration();
 const idx=links.findIndex(l=>l.from===a.id&&l.to===b.id);
 if(idx>=0){links.splice(idx,1);say('已移除這條箭頭；反向箭頭（若有）不受影響。');}
 else{links.push({id:'link-'+(++linkCounter),from:a.id,to:b.id,hormone:'',adrenaline:'',status:'neutral',slotX:0,slotY:0});say(`已建立 ${a.name} → ${b.name}。${['口腔→小腸','小腸→血管'].includes(`${a.name}→${b.name}`)?'這條消化／吸收路徑不需放激素。':'若為調節路徑，可把激素放到線上。'}`);}
 draw();updateCounter();
}
function onOrganClick(o){if(!o.placed){selectTool('organ',o.name,o.poolEl);return;}if(tool)clearSelection();if(!sourceId){selectSource(o);return;}if(sourceId===o.id){clearSelection();say('已取消選取。');return;}const from=organOfId(sourceId);chooseConnection(from,o);clearSelection();}
function onMatterSlot(o){if(tool?.kind==='matter'){if(!(tool.name==='氧氣'&&spawnRespiration(o)))setMatter(o,tool.name);clearSelection();return;}if(o.matter){say(`「${o.name}」目前放的是「${o.matter}」。可直接拖出、移走，或先選其他物質替換。`);}else say('先點選物質卡，再點這個框；或直接拖曳物質過來。');}
function onHormoneSlot(link,role='primary'){
 if(!needsHormone(link)){say('消化／吸收路徑不需放激素。');clearSelection();return;}
 const current=link.hormone;
 if(tool?.kind==='hormone'){setHormone(link,tool.name,false,role);clearSelection();return;}
 if(current)say(`這個位置放的是「${current}」，可以拖出或更換。`);
 else say(role==='bonus'?'這是進階選放位置：可以使用腎上腺素。':'先選擇激素卡，再點連線的虛線框。');
}
function setHormone(link,name,quiet=false,role='primary'){
 if(!demoInternalUpdate)invalidateDemonstration();
 if(name&&!needsHormone(link)){say('消化／吸收路徑不需要激素。');return false;}
 const rule=ruleForLink(link);
 if(role==='bonus'){say('腎上腺素只在運動情境演示中出現。');return false;}
 const valid=role==='bonus'?name===rule?.bonus:name===rule?.h;
 if(name&&hints&&!valid){say('這個激素與位置不符，已退回。');flash(hormoneLayer.querySelector(`[data-link="${link.id}"][data-role="${role}"]`));return false;}
 link.hormone=name;
 link.status='neutral';draw();updateCounter();
 if(!quiet)say(name?`已將「${name}」放在 ${nameOf(link.from)} → ${nameOf(link.to)}。`:'已拔出激素卡。');return true;
}
function flash(el){if(!el)return;el.animate([{transform:'translate(-50%,-50%) scale(1)'},{transform:'translate(-50%,-50%) scale(1.17)',background:'#ffe2e1'},{transform:'translate(-50%,-50%) scale(1)'}],{duration:320});}
function hormoneTagPosition(midX,midY,ux,uy,slide,used){
 // 避讓器官、物質槽及其它激素槽，否則兩個位置雖然有畫出卻可能點不到。
 const rects=[...used];const canvasRect=canvas.getBoundingClientRect();
 const panelArea=getDemoSafeRect();if(demoUnlocked&&panelArea)rects.push(panelArea);
 for(const o of organs.values())if(o.placed){
   rects.push({x:o.x-3,y:o.y-3,w:OW+6,h:OH+6});
   if(o.slot){const r=o.slot.getBoundingClientRect();rects.push({x:r.left-canvasRect.left-5,y:r.top-canvasRect.top-5,w:r.width+10,h:r.height+10});}
 }
 const intersects=(a,b)=>a.x<b.x+b.w+5&&a.x+a.w+5>b.x&&a.y<b.y+b.h+5&&a.y+a.h+5>b.y;
 const perp=[0,-36,36,-59,59,-83,83,-107,107,-135,135],along=[0,-24,24,-53,53,-87,87,-130,130];
 let chosen=null;
 for(let radius=0;radius<=13&&!chosen;radius++)for(const norm of perp)for(const extra of along){
   const cost=Math.round(Math.abs(norm)/24)+Math.round(Math.abs(extra)/22);if(cost!==radius)continue;
   const x=midX+ux*(slide+extra)-uy*norm;
   const y=midY+uy*(slide+extra)+ux*norm;
   const r={x:x-36,y:y-16,w:72,h:32};
   if(r.x<3||r.y<3||r.x+r.w>canvas.clientWidth-3||r.y+r.h>canvas.clientHeight-3)continue;
   if(rects.some(rect=>intersects(r,rect)))continue;chosen={x,y,rect:r};break;
 }
 return chosen||{x:midX+ux*slide,y:midY+uy*slide,rect:{x:midX+ux*slide-36,y:midY+uy*slide-16,w:72,h:32}};
}
function draw(){
 for(const o of organs.values())if(o.placed)o.slot.classList.remove('matter-increase','matter-decrease');
 svg.replaceChildren();hormoneLayer.replaceChildren();const ns='http://www.w3.org/2000/svg';const hormoneBoxes=[];
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
  if(needsHormone(l)){
   const roles=['primary'];
   for(const role of roles){
    const bonus=role==='bonus',name=bonus?l.adrenaline:l.hormone;
    const tag=document.createElement('button');tag.type='button';tag.className='hormone-slot';
    tag.dataset.link=l.id;tag.dataset.role=role;
    tag.textContent=name||(bonus?'選放激素':'放激素');
    // 雙激素槽沿著該條箭頭排列；不限定學生把器官放成哪種版型。
    const slide=0;
    const position=hormoneTagPosition(l.slotX,l.slotY,ux,uy,slide,hormoneBoxes);
    hormoneBoxes.push(position.rect);
    tag.style.left=position.x+'px';tag.style.top=position.y+'px';
    if(name){const c=HORMONES.find(x=>x.name===name)?.bg||'#405471';tag.classList.add('filled',name==='胰島素'?'insulin':name==='升糖素'?'glucagon':'adrenaline');tag.style.setProperty('--h-bg',c);}
    if(l.status!=='neutral')tag.classList.add(l.status==='green'?'correct':'wrong');
    tag.setAttribute('aria-label',`${a.name}到${b.name}，${bonus?'進階激素':'必要激素'}，${name||'尚未放置'}`);
    hormoneLayer.append(tag);
    tag.title=`${a.name} → ${b.name}｜${bonus?'進階激素（選做）':'激素'}`;
    // 如為避開字卡而移動位置，用細虛線連到原箭頭，避免造成「激素不屬於此路徑」的誤解。
    const baseX=l.slotX+ux*slide,baseY=l.slotY+uy*slide;
    if(Math.hypot(position.x-baseX,position.y-baseY)>24){
     const tether=document.createElementNS(ns,'line');
     for(const[k,v]of Object.entries({x1:baseX,y1:baseY,x2:position.x,y2:position.y,stroke:'#8a9bb3','stroke-width':1.4,'stroke-dasharray':'3 5',opacity:.72}))tether.setAttribute(k,v);
     svg.append(tether);
    }
    tag.addEventListener('pointerdown',e=>pointerDown(e,{kind:'hormone-slot',link:l,role,name}));
    tag.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onHormoneSlot(l,role);}});
   }
  }
  if(l.hormone){const active=ruleForLink(l);if(active?.h===l.hormone){
    if(a.matter)a.slot.classList.add('matter-decrease');
    if(b.matter)b.slot.classList.add('matter-increase');
   }
   const hormoneColor=l.hormone==='胰島素'?'#9c5678':'#ee8aa2';
   const under=document.createElementNS(ns,'line');for(const [k,v] of Object.entries({x1:startX,y1:startY,x2:endX,y2:endY,stroke:hormoneColor,'stroke-width':'12','stroke-linecap':'round',opacity:'.19'}))under.setAttribute(k,v);svg.append(under);
   const anim=document.createElementNS(ns,'line');for(const [k,v] of Object.entries({x1:startX,y1:startY,x2:endX,y2:endY,stroke:hormoneColor,'stroke-width':'5','stroke-linecap':'round','stroke-dasharray':'16 13',opacity:'.98'}))anim.setAttribute(k,v);anim.style.animation='dash .62s linear infinite';anim.classList.add('hormone-glow');svg.append(anim);
  }
 }
}
function status(){const req=RULES.filter(r=>r.required);const optional=RULES.filter(r=>!r.required);const ok=links.filter(l=>matchLink(l)).map(l=>ruleForLink(l));
 $('canvas-counter').textContent=`核心路徑 ${req.filter(r=>ok.includes(r)).length}／${req.length} · 延伸 ${optional.filter(r=>ok.includes(r)).length}／${optional.length}`;
 $('canvas-empty').hidden=[...organs.values()].some(o=>o.placed);
}
const updateCounter=status;
function matchLink(link){const rule=ruleForLink(link);if(!rule||rule.h!==link.hormone||link.adrenaline)return false;
 const f=organOfId(link.from),t=organOfId(link.to);return matchMatter(f.matter,rule.source)&&(matchMatter(t.matter,rule.target)||(t.name==='細胞粒線體'&&t.respirationDone));
}
function checkAnswers(){let correct=new Set(),wrong=[];links.forEach(l=>{const r=ruleForLink(l);if(matchLink(l)){l.status='green';correct.add(r);}else{l.status='red';wrong.push(`${nameOf(l.from)} → ${nameOf(l.to)}`);}});
 for(const o of organs.values())if(o.placed){o.slot.classList.remove('wrong','correct');if(o.matter){o.slot.classList.add(ALLOWED_MATTER[o.name].includes(o.matter)?'correct':'wrong');}}
 const missing=RULES.filter(r=>r.required&&!correct.has(r));draw();updateCounter();
 if(missing.length===0&&wrong.length===0&&!([...organs.values()].some(o=>o.placed&&o.matter&&!ALLOWED_MATTER[o.name].includes(o.matter)))){
  unlockDemonstration();
  showDialog('血糖調節系統建構成功！',`<p>五條必要關係與物質／激素判定都正確！</p><p>已解鎖「吃飯／運動」動態演示；動畫會沿著你自己排好的概念圖播放。</p><p>脂肪合成、細胞利用葡萄糖是選做延伸，不影響通關。</p>`);say('五條核心路徑全部正確！');
 }else{
  invalidateDemonstration();
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
 stopDemonstration(true);demoUnlocked=false;demoPanel.hidden=true;cancelAnimationFrame(reflowFrame);reflowFrame=0;
 epoch++;cancelDrag(false);clearSelection();links=[];organs=new Map();idCounter=0;linkCounter=0;snap=false;hints=false;
 snapBtn.textContent='貼齊格線：關';hintBtn.textContent='即時提示：關';snapBtn.setAttribute('aria-pressed','false');hintBtn.setAttribute('aria-pressed','false');
 organPool.replaceChildren();matterPool.replaceChildren();hormonePool.replaceChildren();
 canvas.querySelectorAll('.organ-card,.particle,.canvas-toast').forEach(n=>n.remove());hormoneLayer.replaceChildren();svg.replaceChildren();
 ORGANS.forEach(createOrgan);MATTERS.forEach(m=>createTemplate(m,'matter',matterPool));HORMONES.forEach(h=>createTemplate(h,'hormone',hormonePool));
 hideDialog();draw();updateCounter();say('先放器官，點兩張器官建立箭頭；物質放在器官右下角，激素放在線中央。');
}
function inRect(x,y,r){return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;}
function closestSlot(kind,x,y){let best=null,dist=60;
 let list=kind==='matter'?[...organs.values()].filter(o=>o.placed).map(o=>({kind:'matter',o,el:o.slot})):links.filter(needsHormone).flatMap(l=>[...hormoneLayer.querySelectorAll(`[data-link="${l.id}"]`)].map(el=>({kind:'hormone',link:l,role:el.dataset.role||'primary',el})));
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
 if(restore&&drag.started&&drag.originItem){if(drag.kind==='matter-slot'&&drag.originItem.o&&drag.originItem.o.matter===null)setMatter(drag.originItem.o,drag.name,true);if(drag.kind==='hormone-slot'&&drag.originItem.link){const l=drag.originItem.link,r=drag.originItem.role||'primary';if(!(r==='bonus'?l.adrenaline:l.hormone))setHormone(l,drag.name,true,r);}}
 if(restore&&drag.wasPlaced&&drag.o?.placed){drag.o.x=drag.originX;drag.o.y=drag.originY;pos(drag.o);draw();}
 drag.preview?.remove();drag.ghost?.remove();drag.o?.el?.classList.remove('dragging');sidebar.classList.remove('drop-target');magnet(null);drag=null;
}
function pointerDown(e,info){if(demoPlaying){say('演示播放中，請先按暫停或結束演示。');return;}if(e.button!==undefined&&e.button!==0)return;if(drag)cancelDrag();
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
  if(drag.kind==='hormone-slot'&&drag.name){drag.originItem={link:drag.link,role:drag.role||'primary'};setHormone(drag.link,'',true,drag.role||'primary');}
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
 if(d.kind==='organ'&&d.wasPlaced){invalidateDemonstration();}
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
   if(!ok)ok=type==='matter'?setMatter(target.o,d.name):setHormone(target.link,d.name,false,target.role||'primary');
   if(ok)d.originItem=null;else{rejection(d.preview);if(d.originItem?.o)setMatter(d.originItem.o,d.name,true);if(d.originItem?.link)setHormone(d.originItem.link,d.name,true,d.originItem.role||'primary');d.originItem=null;say('即時提示：這個位置不適合，已退回原處。');}}
  else{d.originItem=null;say(type==='matter'?'物質已拔出；空白處放開即可移除。':'激素已拔出；空白處放開即可移除。');}
 }
 }else{
 if(d.kind==='organ')onOrganClick(d.o);
 else if(d.kind==='matter'||d.kind==='hormone')selectTool(d.kind,d.name,d.el);
 else if(d.kind==='matter-slot')onMatterSlot(d.o);
 else if(d.kind==='hormone-slot')onHormoneSlot(d.link,d.role||'primary');
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
// ====================== 血糖 3.1 情境演示 ======================
// 僅改變視覺量；以學生自行排列的正確路徑計算粒子座標，不修改原圖答案。
// 注意：低血糖警示為「長時間消耗導致血糖過低」的假設情境，非每次運動必然如此。
const demoPanel=$('demo-panel'),demoLayer=$('demo-layer'),demoCaption=$('demo-caption');
const demoProgress=$('demo-progress'),demoPause=$('demo-pause'),demoEnd=$('demo-end'),demoAlert=$('demo-alert');
const demoGlow=$('demo-alert-glow'),demoAdrenaline=$('demo-adrenaline');
let demoSequence=[],reflowFrame=0;
let demoUnlocked=false,demoPlaying=false,demoPaused=false,demoInternalUpdate=false;
let demoMode=null,demoElapsed=0,demoLastFrame=null,demoRaf=0,demoStepIndex=-1;
const DEMO_STEPS={
 meal:[
  {ms:1500,title:'飯後｜口腔澱粉增加',focus:['口腔'],levels:{'口腔':1.85}},
  {ms:2900,title:'澱粉進入小腸',focus:['口腔','小腸'],levels:{'口腔':0,'小腸':2.05},paths:[['口腔','小腸']]},
  {ms:2800,title:'葡萄糖從小腸吸收至血液',focus:['小腸','血管'],levels:{'小腸':.68,'血管':2.08},paths:[['小腸','血管']]},
  {ms:1200,title:'血糖升高',focus:['血管'],levels:{'血管':2.08},alert:'high'},
  {ms:3200,title:'胰島素調節｜肝臟與肌肉先呈現糖原儲存',focus:['血管','肝臟','肌肉組織'],levels:{'血管':1.48,'肝臟':2.05,'肌肉組織':2.05},paths:[['血管','肝臟'],['血管','肌肉組織']],hormones:['胰島素']},
  {ms:2200,title:'糖原儲存增加後，示意部分多餘糖分也可轉成脂肪',focus:['血管','脂肪組織'],levels:{'血管':1.10,'脂肪組織':1.95},paths:[['血管','脂肪組織']],hormones:['胰島素'],optionalFat:true},
  {ms:1600,title:'血糖回到穩定',focus:['血管'],levels:{'血管':1,'肝臟':1,'肌肉組織':1,'脂肪組織':1}}
 ],
 exercise:[
  {ms:1900,title:'運動開始｜先看血糖、肌糖原與肝糖',focus:['肌肉組織','血管','肝臟'],levels:{'肌肉組織':1.8,'血管':1.85,'肝臟':1.9}},
  {ms:2900,title:'持續消耗｜肌糖原和血糖減少',focus:['肌肉組織','血管'],levels:{'肌肉組織':.22,'血管':.08,'肝臟':1.9}},
  {ms:1700,title:'示意低血糖｜調節啟動',focus:['血管','肝臟'],levels:{'血管':.065,'肝臟':1.9},alert:'low'},
  {ms:3500,title:'升糖素與情境性腎上腺素協助血糖回升',focus:['肝臟','血管'],levels:{'肝臟':.31,'血管':1.6},paths:[['肝臟','血管']],hormones:['升糖素','腎上腺素'],alert:'low-to-recover'},
  {ms:1950,title:'血糖回穩｜警報解除',focus:['血管'],levels:{'血管':1,'肝臟':1},alert:'recover'}
 ]
};
// 演示的順序只為了突出因果概念；脂肪合成不必等待糖原庫完全裝滿。
const EXERCISE_INITIAL={'血管':1.85,'肝臟':1.9,'肌肉組織':1.8};

function invalidDemoStructure(){const valid=new Set(links.filter(matchLink).map(ruleForLink));return RULES.some(r=>r.required&&!valid.has(r))||links.some(l=>!matchLink(l));}
function intersectsRect(a,b,pad=0){return a.x<b.x+b.w+pad&&a.x+a.w+pad>b.x&&a.y<b.y+b.h+pad&&a.y+a.h+pad>b.y;}
function getDemoSafeRect(){
 if(demoPanel.hidden)return null;
 const box=demoPanel.getBoundingClientRect(),base=canvas.getBoundingClientRect();
 return{x:box.left-base.left-12,y:box.top-base.top-12,w:box.width+24,h:box.height+24};
}
function safePlacement(o,others,protectedRect){
 const start={x:o.x,y:o.y},step=15;
 for(let radius=0;radius<Math.max(canvas.clientWidth,canvas.clientHeight)+60;radius+=step){
  const candidates=[];
  for(let dx=-radius;dx<=radius;dx+=step){
   for(const dy of [-radius,radius])candidates.push({x:start.x+dx,y:start.y+dy});
  }
  for(let dy=-radius+step;dy<radius;dy+=step){
   for(const dx of [-radius,radius])candidates.push({x:start.x+dx,y:start.y+dy});
  }
  candidates.sort((a,b)=>((a.x-start.x)**2+(a.y-start.y)**2)-((b.x-start.x)**2+(b.y-start.y)**2));
  for(const p of candidates){
   const area={x:p.x-4,y:p.y-4,w:OW+15,h:OH+20};
   if(p.x<2||p.y<2||p.x+OW+10>canvas.clientWidth-2||p.y+OH+10>canvas.clientHeight-2)continue;
   if(intersectsRect(area,protectedRect,3)||others.some(r=>intersectsRect(area,r,6)))continue;
   return p;
  }
 }
 return null;
}
function protectDemoControls(){
 const safe=getDemoSafeRect();if(!safe)return;
 const placed=[...organs.values()].filter(o=>o.placed),changed=[];
 const obstacles=placed.map(o=>({id:o.id,x:o.x-4,y:o.y-4,w:OW+15,h:OH+20}));
 for(const o of placed){
  const area={x:o.x-4,y:o.y-4,w:OW+15,h:OH+20};
  if(!intersectsRect(area,safe,3))continue;
  const p=safePlacement(o,obstacles.filter(a=>a.id!==o.id),safe);
  if(!p)continue;
  changed.push({o,fromX:o.x,fromY:o.y,toX:p.x,toY:p.y});
  const entry=obstacles.find(a=>a.id===o.id);entry.x=p.x-4;entry.y=p.y-4;
 }
 if(!changed.length){draw();return;}
 cancelAnimationFrame(reflowFrame);const started=performance.now(),duration=320;
 function frame(now){const f=easing((now-started)/duration);
  for(const c of changed){c.o.x=c.fromX+(c.toX-c.fromX)*f;c.o.y=c.fromY+(c.toY-c.fromY)*f;pos(c.o);}
  draw();if(f<1)reflowFrame=requestAnimationFrame(frame);else reflowFrame=0;
 }
 reflowFrame=requestAnimationFrame(frame);
}
function unlockDemonstration(){demoUnlocked=true;demoPanel.hidden=false;$('demo-play-meal').disabled=false;$('demo-play-exercise').disabled=false;protectDemoControls();say('已解鎖吃飯／運動演示。');}
function invalidateDemonstration(){if(!demoUnlocked&&!demoPlaying&&!demoMode)return;cancelAnimationFrame(reflowFrame);reflowFrame=0;stopDemonstration(true);demoUnlocked=false;demoPanel.hidden=true;}
function resetDemoVisuals(){
 demoLayer.replaceChildren();canvas.classList.remove('demo-high','demo-low','demo-recover','demo-active','demo-paused');
 demoGlow.style.opacity='0';demoGlow.style.boxShadow='none';demoAdrenaline.hidden=true;demoAdrenaline.style.opacity='0';
 demoAlert.hidden=true;
 for(const o of organs.values())if(o.placed&&o.slot){o.slot.style.transform='';o.slot.style.opacity='';o.slot.classList.remove('demo-target','demo-focus');}
 for(const el of hormoneLayer.querySelectorAll('.demo-signal'))el.classList.remove('demo-signal');
}
function stopDemonstration(clearSelection=true){
 cancelAnimationFrame(demoRaf);demoRaf=0;demoPlaying=false;demoPaused=false;demoLastFrame=null;demoElapsed=0;demoStepIndex=-1;demoMode=null;
 resetDemoVisuals();demoPause.disabled=true;demoPause.textContent='暫停';demoEnd.disabled=true;demoProgress.style.width='0%';
 if(clearSelection){$('demo-play-meal').classList.remove('active');$('demo-play-exercise').classList.remove('active');}
}
function startDemonstration(mode){
 if(!demoUnlocked||invalidDemoStructure()){invalidateDemonstration();say('先完成並檢查五條核心關係，再開啟演示。');return;}
 stopDemonstration();demoMode=mode;demoSequence=mode==='meal'?DEMO_STEPS.meal.filter(x=>!x.optionalFat||!!demoLink('血管','脂肪組織')):DEMO_STEPS.exercise;demoPlaying=true;demoPaused=false;demoElapsed=0;demoLastFrame=null;demoStepIndex=0;canvas.classList.remove('demo-paused');
 canvas.classList.add('demo-active');demoPause.disabled=false;demoEnd.disabled=false;
 $('demo-play-meal').classList.toggle('active',mode==='meal');$('demo-play-exercise').classList.toggle('active',mode==='exercise');
 demoCaption.textContent=mode==='meal'?'飯後演示開始':'運動演示開始';renderDemoStep(demoSequence[0],0);demoRaf=requestAnimationFrame(demoTick);
}
function toggleDemoPause(){
 if(!demoMode)return;
 if(!demoPlaying&&demoPaused){demoPlaying=true;demoPaused=false;demoLastFrame=null;canvas.classList.remove('demo-paused');demoPause.textContent='暫停';demoRaf=requestAnimationFrame(demoTick);return;}
 if(demoPlaying){demoPlaying=false;demoPaused=true;cancelAnimationFrame(demoRaf);demoRaf=0;canvas.classList.add('demo-paused');demoPause.textContent='繼續';}
}
function currentStep(mode,elapsed){
 const steps=demoSequence,total=steps.reduce((s,a)=>s+a.ms,0);
 let acc=0;for(let i=0;i<steps.length;i++){const next=acc+steps[i].ms;if(elapsed<next)return{i,step:steps[i],progress:(elapsed-acc)/steps[i].ms,total};acc=next;}
 return null;
}
function easing(t){t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);}
function demoLink(from,to){return links.find(l=>nameOf(l.from)===from&&nameOf(l.to)===to&&matchLink(l));}
function demoLinkGeometry(link){
 const a=organOfId(link.from),b=organOfId(link.to);if(!a?.placed||!b?.placed)return null;
 const x1=a.x+OW/2,y1=a.y+OH/2,x2=b.x+OW/2,y2=b.y+OH/2,dx=x2-x1,dy=y2-y1,d=Math.hypot(dx,dy)||1;
 const ux=dx/d,uy=dy/d,reverse=links.some(q=>q.from===link.to&&q.to===link.from),shift=reverse?13:0,nx=-uy*shift,ny=ux*shift,trim=Math.min(46,d*.35);
 return{x1:x1+ux*trim+nx,y1:y1+uy*trim+ny,x2:x2-ux*trim+nx,y2:y2-uy*trim+ny};
}
function stageLevel(mode,index,name){let last=mode==='exercise'?(EXERCISE_INITIAL[name]??1):1;const steps=demoSequence;for(let i=0;i<index;i++)if(steps[i].levels&&Object.hasOwn(steps[i].levels,name))last=steps[i].levels[name];return last;}
function demoAlertState(step,t,bloodScale){
 if(step.alert==='high')return'high';
 if(step.alert==='low')return'low';
 if(step.alert==='low-to-recover')return bloodScale>=1.0?'recover':'low';
 if(step.alert==='recover')return'recover';
 return'';
}
function paintAlertGlow(step,t,bloodScale){
 if(demoMode!=='exercise'){demoGlow.style.opacity='0';return;}
 let opacity=0,mix=0;
 if(step.alert==='low'){opacity=easing(Math.min(1,t*4));}
 if(step.alert==='low-to-recover'){
  opacity=.95;mix=easing(Math.min(1,Math.max(0,(bloodScale-.5)/.72)));
 }
 if(step.alert==='recover'){opacity=.95*(1-easing(t));mix=1;}
 const red=[232,49,83],blue=[119,205,242];
 const c=red.map((v,i)=>Math.round(v*(1-mix)+blue[i]*mix));
 demoGlow.style.opacity=String(opacity);
 demoGlow.style.boxShadow=`inset 0 0 14px 4px rgba(${c.join(',')},.93), inset 0 0 39px 18px rgba(${c.join(',')},.47), inset 0 0 65px 24px rgba(${c.join(',')},.16)`;
 demoGlow.classList.toggle('warning',opacity>.05&&mix<.95);
}
function showAdrenaline(step,t){
 const during=demoMode==='exercise'&&(step.alert==='low-to-recover'||step.alert==='recover');
 const link=demoLink('肝臟','血管');if(!during||!link){demoAdrenaline.hidden=true;return;}
 const g=demoLinkGeometry(link);if(!g){demoAdrenaline.hidden=true;return;}
 demoAdrenaline.hidden=false;
 const ratio=step.alert==='recover'?1:easing(Math.min(1,Math.max(0,(t-.04)/.29)));
 let x=(g.x1+g.x2)/2,y=(g.y1+g.y2)/2-36;
 x=clamp(x,57,canvas.clientWidth-57);y=clamp(y,32,canvas.clientHeight-30);
 demoAdrenaline.style.left=x+'px';demoAdrenaline.style.top=y+'px';
 demoAdrenaline.style.opacity=String(ratio);
 const hop=step.alert==='recover'?0:-(1-ratio)*63-Math.abs(Math.sin(ratio*3*Math.PI))*14*(1-ratio);
 demoAdrenaline.style.transform=`translate(-50%,-50%) translateY(${hop}px) scale(${.55+.45*ratio})`;
}
function renderDemoStep(step,t){
 const focusing=t<.30,attention=easing(Math.min(t/.30,1)),transition=easing(Math.max(0,(t-.30)/.70));
 const sizes={};
 for(const o of organs.values())if(o.placed){
  const prev=stageLevel(demoMode,demoStepIndex,o.name),next=step.levels?.[o.name]??prev;
  const scale=prev+(next-prev)*transition,special=step.focus?.includes(o.name)||false;
  sizes[o.name]=scale;
  const rock=special&&focusing?Math.sin(t*46)*7:0;
  o.slot.style.transform=`scale(${Math.max(0,scale)}) rotate(${rock}deg)`;
  o.slot.style.opacity=scale<.13?String(Math.max(0,scale/.13)):'';
  o.slot.classList.toggle('demo-target',special);
  o.slot.classList.toggle('demo-focus',special&&focusing);
 }
 const alert=demoAlertState(step,t,sizes['血管']??1);
 canvas.classList.toggle('demo-high',alert==='high');canvas.classList.toggle('demo-low',alert==='low');
 canvas.classList.toggle('demo-recover',alert==='recover');
 paintAlertGlow(step,t,sizes['血管']??1);showAdrenaline(step,t);
 if(alert==='low'){demoAlert.hidden=false;demoAlert.textContent='低血糖！';}
 else if(alert==='recover'){demoAlert.hidden=false;demoAlert.textContent='警報解除';demoAlert.classList.add('recovered');}
 else demoAlert.hidden=true;
 demoAlert.classList.toggle('recovered',alert==='recover');
 demoAlert.style.opacity=alert==='recover'&&step.alert==='recover'?String(Math.max(0,1-transition)):'1';
 for(const el of hormoneLayer.querySelectorAll('.demo-signal'))el.classList.remove('demo-signal');
 demoLayer.replaceChildren();const ns='http://www.w3.org/2000/svg';
 const paths=[...(step.paths||[])];
 if(focusing)return; // 先閃爍及小幅度搖晃，然後才播放轉移。
 for(const [from,to] of paths){
  const link=demoLink(from,to);if(!link)continue;const g=demoLinkGeometry(link);if(!g)continue;
  const hormone=step.hormones||[];
  if(hormone.length){
   hormoneLayer.querySelector(`[data-link="${link.id}"][data-role="primary"]`)?.classList.add('demo-signal');

  }
  const color=hormone.includes('升糖素')?'#ee8aa2':hormone.includes('胰島素')?'#9c5678':'#18b9a7';
  const line=document.createElementNS(ns,'line');for(const[k,v]of Object.entries({x1:g.x1,y1:g.y1,x2:g.x2,y2:g.y2,stroke:color,'stroke-width':9,'stroke-linecap':'round',opacity:.34}))line.setAttribute(k,v);demoLayer.append(line);
  for(let i=0;i<7;i++){
   const f=(transition*1.16+i/7)%1,c=document.createElementNS(ns,'circle');
   c.setAttribute('cx',g.x1+(g.x2-g.x1)*f);c.setAttribute('cy',g.y1+(g.y2-g.y1)*f);
   c.setAttribute('r',i===0?'7':'4.8');c.setAttribute('fill',color);c.setAttribute('opacity',String(.35+.6*Math.sin(Math.PI*f)));demoLayer.append(c);
  }
 }
}
function demoTick(ts){
 if(!demoPlaying||!demoMode)return;
 if(demoLastFrame!==null)demoElapsed+=Math.min(90,ts-demoLastFrame);demoLastFrame=ts;
 const all=demoSequence.reduce((sum,a)=>sum+a.ms,0),current=currentStep(demoMode,demoElapsed);
 demoProgress.style.width=Math.min(100,100*demoElapsed/all)+'%';
 if(!current){demoPlaying=false;demoPaused=false;demoRaf=0;demoLastFrame=null;demoProgress.style.width='100%';demoCaption.textContent='演示完成，可重播或結束';demoPause.disabled=true;demoPause.textContent='暫停';resetDemoVisuals();return;}
 if(current.i!==demoStepIndex){demoStepIndex=current.i;demoCaption.textContent=current.step.title;}
 renderDemoStep(current.step,current.progress);demoRaf=requestAnimationFrame(demoTick);
}
$('demo-play-meal').addEventListener('click',()=>startDemonstration('meal'));
$('demo-play-exercise').addEventListener('click',()=>startDemonstration('exercise'));
demoPause.addEventListener('click',toggleDemoPause);
demoEnd.addEventListener('click',()=>{stopDemonstration();demoCaption.textContent='演示已結束';});
// ======================================================================

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
window.__BIO_SUGAR_TEST__={RULES,ORGANS,MATTERS,HORMONES,DEMO_STEPS,beginDemo:startDemonstration,pauseDemo:toggleDemoPause,stopDemo:stopDemonstration,getDemo:()=>({mode:demoMode,playing:demoPlaying,paused:demoPaused,unlocked:demoUnlocked,elapsed:demoElapsed,step:demoStepIndex}),getState:()=>({organs:[...organs.values()].map(o=>({name:o.name,matter:o.matter,placed:o.placed,respirationDone:o.respirationDone})),links:links.map(l=>({from:nameOf(l.from),to:nameOf(l.to),hormone:l.hormone,adrenaline:l.adrenaline,status:l.status}))}),place:(name,x,y)=>{const o=organOfName(name);if(o&&!o.placed)placeOrgan(o,x,y);},connect:(f,t)=>{const a=organOfName(f),b=organOfName(t);if(a?.placed&&b?.placed)chooseConnection(a,b);},putMatter:(n,m)=>{const o=organOfName(n);return o?.placed?setMatter(o,m,true):false;},putHormone:(f,t,h)=>{const l=links.find(l=>nameOf(l.from)===f&&nameOf(l.to)===t);return l?setHormone(l,h,true,h==='腎上腺素'?'bonus':'primary'):false;},check:checkAnswers,reset:init};
