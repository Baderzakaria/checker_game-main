import {CATEGORIES,PUBLISHED_UNITS,unitSlots,getUnit,UNIT_COUNT} from "./content.js";
import {generateCrossword,normalizeArabic,entryIndexAtCell,nextCellInWord,wordsAtCell,createBankState,consumeBankTile,returnBankTile,resetBankTiles} from "./crossword.js";
import {
  loadState,saveState,applyXp,updateStreak,updateMastery,
  initCloud,cloudEnabled,currentUser,signIn,signUp,signOut
} from "./storage.js";

const appEl=document.querySelector("#app");
const toastEl=document.querySelector("#toast");
let state=loadState();
let authInfo={enabled:false,user:null};
let activeWordId=null;
let activeCellIndex=0;
let wordViewOpen=false;
let wordStartedAt=Date.now();
let boardKeyHandler=null;
let gameFeedback=null;
let gameRenderFrame=null;
let boardResizeCleanup=null;
let lockedScrollY=null;
let bodyStyleBeforeLock="";

function syncWordViewScrollLock(){
  if(wordViewOpen&&lockedScrollY===null){
    lockedScrollY=window.scrollY;
    bodyStyleBeforeLock=document.body.getAttribute("style")||"";
    Object.assign(document.body.style,{position:"fixed",top:`-${lockedScrollY}px`,left:"0",right:"0",width:"100%",overflow:"hidden"});
  }else if(!wordViewOpen&&lockedScrollY!==null){
    const y=lockedScrollY; lockedScrollY=null;
    if(bodyStyleBeforeLock) document.body.setAttribute("style",bodyStyleBeforeLock);
    else document.body.removeAttribute("style");
    requestAnimationFrame(()=>window.scrollTo(0,y));
  }
}

const esc=(s="")=>String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const ck=(r,c)=>`${r},${c}`;
const pct=(v,min=650,max=1450)=>Math.max(0,Math.min(100,Math.round((v-min)/(max-min)*100)));
const completedCount=()=>Object.values(state.units||{}).filter(x=>x.completed).length;
const publishedCompleted=()=>PUBLISHED_UNITS.filter(u=>state.units?.[u.id]?.completed).length;

function toast(msg){
  toastEl.textContent=msg;
  toastEl.classList.add("show");
  clearTimeout(toastEl._t);
  toastEl._t=setTimeout(()=>toastEl.classList.remove("show"),1800);
}

function shell(content){
  const user=currentUser();
  return `
  <div class="shell">
    <header class="topbar">
      <a class="brand" href="#home" aria-label="كلمات">
        <span class="brand-mark">ك</span><span>كلمات</span>
      </a>
      <nav class="nav">
        <a class="btn hide-sm" href="#home">الوحدات</a>
        <a class="btn hide-sm" href="#profile">تقدّمي</a>
        <a class="btn ${user?"soft":""}" href="${user?"#profile":"#login"}">${user?"حسابي":"دخول"}</a>
      </nav>
    </header>
    ${content}
    <footer class="footer">كلمات</footer>
  </div>`;
}

function renderHome(){
  state=loadState();
  const done=publishedCompleted();
  const xp=state.xp||0, level=state.level||1;
  const slots=unitSlots(state);

  const doorCards=Object.entries(CATEGORIES).map(([id,c])=>{
    const m=state.mastery?.[id];
    const rating=m?.rating||1000;
    const detail=m?`إتقان ${pct(rating)}% · ${m.attempts} محاولة`:"ابدأ اللعب ليظهر تقدّمك";
    return `<article class="door">
      <span class="icon">${c.icon}</span>
      <div><b>${esc(c.label)}</b><small>${detail}</small></div>
    </article>`;
  }).join("");

  const unitCards=slots.map(u=>{
    const lock=!u.published;
    return `<button class="unit ${lock?"locked":""} ${u.done?"done":""}" data-unit="${u.id}" ${lock?"disabled":""}>
      <span class="n">${String(u.id).padStart(2,"0")}</span>
      <span class="pill">${u.done?"✓ مكتملة":u.published?"جاهزة":"قيد التحرير"}</span>
      <small>${esc(u.title)}<br>${esc(u.subtitle)}</small>
    </button>`;
  }).join("");

  appEl.innerHTML=shell(`
    <section class="hero">
      <div>
        <span class="eyebrow">لعبة كلمات عربية</span>
        <h1>كلمة بعد<br>كلمة.</h1>
        <p>اختر وحدة، ثم ابنِ الإجابة من بنك الحروف.</p>
        <div class="nav" style="margin-top:18px">
          <button class="btn primary" id="continue-btn">${done?"أكمل من حيث توقفت":"ابدأ الوحدة الأولى"}</button>
          <a class="btn" href="#profile">تقدّمي</a>
        </div>
      </div>
      <aside class="hero-card">
        <span class="kicker">ملف اللاعب</span>
        <h2 style="margin:8px 0 2px">${esc(state.profile?.displayName||"ضيف")}</h2>
        <p class="muted" style="margin:0 0 16px">المستوى ${level}</p>
        <div class="stats">
          <div class="stat"><b>${xp}</b><span>XP</span></div>
          <div class="stat"><b>${done}/${PUBLISHED_UNITS.length}</b><span>وحدات منشورة</span></div>
          <div class="stat"><b>${UNIT_COUNT}</b><span>مسار المرحلة</span></div>
        </div>
        <div style="margin-top:16px">
          <div style="display:flex;justify-content:space-between;margin-bottom:7px"><span>تقدم المرحلة الحالية</span><span>${Math.round(done/Math.max(1,PUBLISHED_UNITS.length)*100)}%</span></div>
          <div class="progress"><i style="width:${done/Math.max(1,PUBLISHED_UNITS.length)*100}%"></i></div>
        </div>
      </aside>
    </section>

    <div class="section-head"><div><h2>أبواب المعرفة</h2></div></div>
    <section class="doors">${doorCards}</section>

    <div class="section-head" id="units"><div><h2>الوحدات</h2></div></div>
    <section class="units">${unitCards}</section>
  `);

  document.querySelectorAll("[data-unit]").forEach(btn=>btn.addEventListener("click",()=>{
    btn.classList.add("launching");
    btn.scrollIntoView({behavior:"smooth",block:"center"});
    setTimeout(()=>location.hash=`#play/${btn.dataset.unit}`,360);
  }));
  document.querySelector("#continue-btn")?.addEventListener("click",()=>{
    const next=PUBLISHED_UNITS.find(u=>!state.units?.[u.id]?.completed)||PUBLISHED_UNITS[0];
    location.hash=`#play/${next.id}`;
  });
}

function getSession(unitId){
  const existing=state.units?.[unitId]||{};
  return {
    cells:existing.cells||{},
    solved:existing.solved||{},
    hints:existing.hints||0,
    mistakes:existing.mistakes||0,
    score:existing.score||0,
    banks:existing.banks||{},
    startedAt:existing.startedAt||new Date().toISOString(),
    completed:Boolean(existing.completed),
    stars:existing.stars||0
  };
}

const wordValue=(word,session)=>word.coords.map(x=>session.cells[ck(x.r,x.c)]||"").join("");
const isWordSolved=(word,session)=>Boolean(session.solved[word.entry.id]);
const selectedWord=grid=>grid.placed.find(w=>w.entry.id===activeWordId)||grid.placed[0];
const activeCoords=word=>new Set(word.coords.map(x=>ck(x.r,x.c)));

function renderGame(unitId){
  boardResizeCleanup?.();
  boardResizeCleanup=null;
  state=loadState();
  const unit=getUnit(unitId);
  if(!unit){location.hash="#home";return;}

  const grid=generateCrossword(unit.entries);
  let session=getSession(unit.id);
  if(session.completed){renderResult(unit,grid,session);return;}

  if(!activeWordId||!grid.placed.some(w=>w.entry.id===activeWordId)){
    activeWordId=(grid.placed.find(w=>!session.solved[w.entry.id])||grid.placed[0]).entry.id;
    wordStartedAt=Date.now();
  }

  const word=selectedWord(grid);
  activeCellIndex=Math.max(0,Math.min(word.coords.length-1,activeCellIndex));
  const active=activeCoords(word);
  const solvedCells=new Set();
  for(const w of grid.placed){
    if(isWordSolved(w,session)) for(const x of w.coords) solvedCells.add(ck(x.r,x.c));
  }

  let gridHtml="";
  for(let r=0;r<grid.rows;r++){
    for(let c=0;c<grid.cols;c++){
      const cell=grid.cells[ck(r,c)];
      if(!cell){
        gridHtml+=`<button class="cell block" tabindex="-1"></button>`;
        continue;
      }
      const value=session.cells[ck(r,c)]||"";
      const cls=[
        "cell",
        active.has(ck(r,c))?"in-word":"",
        solvedCells.has(ck(r,c))?"correct":"",
        word.coords.some(x=>x.r===r&&x.c===c)?"active":"",
        word.coords[activeCellIndex]?.r===r&&word.coords[activeCellIndex]?.c===c?"cursor":""
      ].filter(Boolean).join(" ");
      gridHtml+=`<button class="${cls}" data-cell="${r},${c}" aria-label="خانة ${cell.number?cell.number:""} ${value||"فارغة"}">
        ${cell.number?`<span class="num">${cell.number}</span>`:""}<span>${esc(value)}</span>
      </button>`;
    }
  }

  const solvedN=grid.placed.filter(w=>isWordSolved(w,session)).length;
  const clueRows=dir=>[...grid.placed].filter(w=>w.dir===dir).sort((a,b)=>a.number-b.number).map(w=>`
    <button class="clue-row ${w.entry.id===word.entry.id?"active":""} ${isWordSolved(w,session)?"solved":""}" data-word="${w.entry.id}">
      <b>${w.number}</b><span>${esc(w.entry.clue)}</span>
    </button>`).join("");
  const lockedForWord=i=>solvedCells.has(ck(word.coords[i].r,word.coords[i].c));
  // Initialize once and persist it with the session.  Rendering can now never
  // create a new bank or silently trade a tile for a different letter.
  const crossingIds=new Set(word.coords.flatMap(x=>grid.cells[ck(x.r,x.c)].refs
    .filter(ref=>ref.id!==word.entry.id).map(ref=>ref.id)));
  const crossingLetters=grid.placed
    .filter(w=>crossingIds.has(w.entry.id))
    .flatMap(w=>w.chars);
  let bank=session.banks[word.entry.id];
  if(!bank){
    bank=createBankState(word.entry,{contextLetters:crossingLetters});
    // Migration for an in-progress session saved before banks had tile ids.
    // Each existing editable letter reserves one matching stable tile once.
    word.coords.forEach((x,i)=>{
      const value=session.cells[ck(x.r,x.c)];
      if(value&&!lockedForWord(i)){
        const tile=bank.tiles.find(t=>t.letter===value&&!Object.values(bank.consumedBySlot).includes(t.id));
        if(tile) bank=consumeBankTile(bank,i,tile.id);
      }
    });
    session.banks[word.entry.id]=bank;
  }
  const used=new Set(Object.values(bank.consumedBySlot).map(Number));
  const failed=gameFeedback?.unitId===unit.id&&gameFeedback?.wordId===word.entry.id&&gameFeedback?.type==="wrong";
  const succeeded=gameFeedback?.unitId===unit.id&&gameFeedback?.wordId===word.entry.id&&gameFeedback?.type==="success";
  const editableAt=i=>!solvedCells.has(ck(word.coords[i].r,word.coords[i].c));
  const wordSlots=word.coords.map((x,i)=>{
    const value=session.cells[ck(x.r,x.c)]||"";
    return `<button class="answer-slot ${value?"filled":""} ${!editableAt(i)?"locked":""}" data-slot="${i}" aria-label="الخانة ${i+1}${value?` الحرف ${esc(value)}`:" فارغة"}" ${!value||!editableAt(i)?"disabled":""}>${esc(value)}</button>`;
  }).join("");
  const wordView=wordViewOpen?`
    <section class="word-view ${failed?"is-wrong":""} ${succeeded?"is-success":""}" aria-label="إدخال الإجابة" role="dialog" aria-modal="true">
      <header class="word-view-head">
        <button class="word-close" id="close-word" aria-label="العودة إلى اللوحة">×</button>
        <div><span class="kicker">${esc(unit.title)}</span><h2>${esc(word.entry.clue)}</h2></div>
        <span class="word-count">${word.chars.length}</span>
      </header>
      <main class="word-view-body">
        <div class="answer-slots" dir="rtl">${wordSlots}</div>
        ${succeeded?'<p class="word-success" role="status">أحسنت</p>':""}
        <div class="word-actions"><button class="btn soft" id="hint-btn">تلميح</button></div>
      </main>
      <section class="letter-bank word-letter-bank ${failed?"bank-wrong":""}" aria-label="بنك الحروف">
        <span class="bank-label">اختر الحروف</span>
        <div class="bank-tiles">${bank.tiles.map((tile,i)=>`<button class="letter-tile ${used.has(tile.id)?"used":""}" style="--tile-delay:${i * 24}ms" data-tile="${tile.id}" data-letter="${esc(tile.letter)}" aria-label="الحرف ${esc(tile.letter)}" ${used.has(tile.id)?"disabled":""}>${esc(tile.letter)}</button>`).join("")}</div>
      </section>
    </section>`:"";
  appEl.innerHTML=shell(`
    <section class="game-head">
      <div><span class="kicker">الوحدة ${unit.id}</span><h1>${esc(unit.title)}</h1><span class="muted">${esc(unit.subtitle)}</span></div>
      <div class="meter">
        <span>⭐ ${session.score}</span><span>🔥 ${state.streak||0}</span>
      </div>
    </section>
    <section class="game-layout game-screen">
      <div class="board-column">
        <button class="clue-bar panel clue-bar-button" id="open-current-word" aria-label="افتح كلمة ${esc(word.entry.clue)}">
          <span class="round-btn" aria-hidden="true">‹</span>
          <span class="current-clue"><span class="pill">${word.number} · ${word.dir==="H"?"أفقي ←":"عمودي ↓"}</span><b>${esc(word.entry.clue)}</b></span>
          <span class="open-word-label">حل الكلمة</span>
        </button>
        <div class="grid-wrap">
        <div class="crossword ${failed?"wrong-board":""}" style="grid-template-columns:repeat(${grid.cols},38px)">${gridHtml}</div>
        </div>
      </div>
      <aside class="panel clue-card">
        <span class="pill">${CATEGORIES[word.entry.category]?.icon||"•"} ${esc(CATEGORIES[word.entry.category]?.label||word.entry.category)}</span>
        <h3>الكلمات</h3>
        <div class="clue-groups"><section><h4>أفقي</h4>${clueRows("H")}</section><section><h4>عمودي</h4>${clueRows("V")}</section></div>
      </aside>
    </section>${wordView}
  `);
  syncWordViewScrollLock();

  const crosswordEl=document.querySelector(".crossword");
  const gridWrap=document.querySelector(".grid-wrap");
  let resizeFrame=0;
  const resizeGrid=()=>{
    cancelAnimationFrame(resizeFrame);
    resizeFrame=requestAnimationFrame(()=>{
      const available=Math.max(0,gridWrap.clientWidth-18);
      const size=Math.max(9,Math.min(44,Math.floor((available-(grid.cols-1)*2)/grid.cols)));
      crosswordEl.style.setProperty("--cell-size",`${size}px`);
      crosswordEl.style.setProperty("--cell-font",`${Math.max(7,Math.min(17,size*.52))}px`);
      crosswordEl.style.gridTemplateColumns=`repeat(${grid.cols},var(--cell-size))`;
    });
  };
  resizeGrid();
  const gridObserver=new ResizeObserver(resizeGrid);
  gridObserver.observe(gridWrap);
  boardResizeCleanup=()=>{cancelAnimationFrame(resizeFrame);gridObserver.disconnect();};

  function persist(){
    state.units=state.units||{};
    state.units[unit.id]={...session};
    saveState(state);
  }
  function queueRender(){
    cancelAnimationFrame(gameRenderFrame);
    gameRenderFrame=requestAnimationFrame(()=>renderGame(unit.id));
  }
  function refresh(){persist();queueRender();}
  function setActive(id,index=0,open=true){
    activeWordId=id;
    activeCellIndex=index;
    wordStartedAt=Date.now();
    wordViewOpen=open;
    renderGame(unit.id);
  }
  function checkCompletedWord(){
    if(!word.coords.every(x=>session.cells[ck(x.r,x.c)])) return;
    if(wordValue(word,session)===word.chars.join("")){ solveWord(word,false); return; }
    session.mistakes++;
    gameFeedback={unitId:unit.id,wordId:word.entry.id,type:"wrong"};
    persist(); renderGame(unit.id);
    setTimeout(()=>{
      word.coords.forEach((x,i)=>{if(!solvedCells.has(ck(x.r,x.c))) delete session.cells[ck(x.r,x.c)];});
      session.banks[word.entry.id]=resetBankTiles(bank);
      gameFeedback=null; persist(); renderGame(unit.id);
    },520);
  }
  function writeLetter(raw,tileId){
    const char=Array.from(normalizeArabic(raw))[0];
    if(!char)return;
    const emptyIndex=word.coords.findIndex((x,i)=>editableAt(i)&&!session.cells[ck(x.r,x.c)]);
    const targetIndex=emptyIndex<0?activeCellIndex:emptyIndex;
    const cell=word.coords[targetIndex];
    if(!cell||solvedCells.has(ck(cell.r,cell.c)))return;
    session.cells[ck(cell.r,cell.c)]=char;
    session.banks[word.entry.id]=consumeBankTile(bank,targetIndex,tileId);
    activeCellIndex=targetIndex;
    persist();
    const next=nextCellInWord(word,activeCellIndex,1);
    activeCellIndex=next===activeCellIndex?activeCellIndex:next;
    checkCompletedWord();
    if(!gameFeedback) queueRender();
  }
  function solveWord(target,force=false){
    if(!session.solved[target.entry.id]){
      session.solved[target.entry.id]=true;
      const elapsed=Math.max(1,Math.round((Date.now()-wordStartedAt)/1000));
      const earned=Math.max(35,90+target.entry.difficulty*32-session.hints*5-(force?55:0));
      session.score+=earned;
      applyXp(state,Math.round(earned*.45));
      updateStreak(state);
      updateMastery(state,target.entry.category,{correct:true,difficulty:target.entry.difficulty,hints:force?2:0,timeSeconds:elapsed});
      toast(`صحيحة! +${earned}`);
    }
    const all=grid.placed.every(w=>session.solved[w.entry.id]);
    if(all){
      const penalty=session.hints+session.mistakes;
      session.completed=true;
      session.completedAt=new Date().toISOString();
      session.stars=penalty<=2?3:penalty<=6?2:1;
      const bonus=200+session.stars*80;
      session.score+=bonus;
      applyXp(state,bonus);
      state.units[unit.id]={...session};
      saveState(state);
      gameFeedback={unitId:unit.id,wordId:target.entry.id,type:"success"};
      renderGame(unit.id);
      setTimeout(()=>renderResult(unit,grid,session),450);
      return true;
    }
    gameFeedback={unitId:unit.id,wordId:target.entry.id,type:"success"};
    persist();
    renderGame(unit.id);
    // Let the successful answer register, then return to the board. The
    // player explicitly chooses the next word.
    setTimeout(()=>{
      wordViewOpen=false;
      gameFeedback=null;
      renderGame(unit.id);
    },620);
    return true;
  }

  document.querySelector("#open-current-word")?.addEventListener("click",()=>{wordViewOpen=true;renderGame(unit.id);});
  document.querySelector("#close-word")?.addEventListener("click",()=>{wordViewOpen=false;renderGame(unit.id);});
  document.querySelector("#hint-btn")?.addEventListener("click",()=>{
    const target=word.coords.find((x,i)=>editableAt(i)&&(session.cells[ck(x.r,x.c)]||"")!==word.chars[i]);
    if(!target){toast("كل الحروف موجودة — تحقق من الجواب");return;}
    const i=word.coords.indexOf(target);
    session.cells[ck(target.r,target.c)]=word.chars[i];
    session.hints++;
    session.score=Math.max(0,session.score-15);
    toast("كشفنا حرفًا واحدًا");
    activeCellIndex=i; refresh(); checkCompletedWord();
  });
  document.querySelectorAll("[data-word]").forEach(el=>el.addEventListener("click",()=>setActive(el.dataset.word,0,true)));
  document.querySelectorAll("[data-cell]").forEach(el=>el.addEventListener("click",()=>{
    const [r,c]=el.dataset.cell.split(",").map(Number);
    const words=wordsAtCell(grid,r,c);
    if(!words.length)return;
    const valueKey=ck(r,c);
    const selected=words.find(w=>w.entry.id===activeWordId);
    const next=selected&&words.length>1?words[(words.indexOf(selected)+1)%words.length]:words[0];
    setActive(next.entry.id,entryIndexAtCell(next,r,c),true);
  }));
  document.querySelectorAll("[data-slot]").forEach(el=>el.addEventListener("click",()=>{
    const i=Number(el.dataset.slot), cell=word.coords[i];
    if(!editableAt(i)||!session.cells[ck(cell.r,cell.c)]) return;
    delete session.cells[ck(cell.r,cell.c)];
    session.banks[word.entry.id]=returnBankTile(bank,i);
    activeCellIndex=i; persist(); renderGame(unit.id);
  }));
  document.querySelectorAll("[data-tile]").forEach(el=>el.addEventListener("click",()=>writeLetter(el.dataset.letter,Number(el.dataset.tile))));
  if(boardKeyHandler) document.removeEventListener("keydown",boardKeyHandler);
  boardKeyHandler=function onKey(e){
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(!wordViewOpen)return;
    if(e.key==="Escape"){e.preventDefault();wordViewOpen=false;renderGame(unit.id);}
  };
  document.addEventListener("keydown",boardKeyHandler);
}

function renderMedia(media){
  if(media.type==="image") return `<img src="${esc(media.url)}" alt="${esc(media.alt||"صورة السؤال")}" style="width:100%;max-height:220px;object-fit:cover;border-radius:14px;margin:10px 0" />`;
  if(media.type==="emoji") return `<div style="font-size:4rem;text-align:center;padding:12px">${esc(media.value)}</div>`;
  return "";
}

function renderResult(unit,grid,session){
  state=loadState();
  const facts=grid.placed.filter(w=>w.entry.fact).slice(0,5).map(w=>`<div class="fact"><b>${esc(w.entry.answer)}</b><br>${esc(w.entry.fact)}</div>`).join("");
  appEl.innerHTML=shell(`
    <section class="result panel celebration celebration-screen">
      <div class="big">${"★".repeat(session.stars||1)}${"☆".repeat(3-(session.stars||1))}</div>
      <span class="kicker">اكتملت الوحدة ${unit.id}</span>
      <h1 style="font-size:2.5rem;margin:10px 0">${esc(unit.title)}</h1>
      <p class="muted">جمعت <b style="color:var(--ink)">${session.score}</b> نقطة · استخدمت ${session.hints} مساعدات · ${session.mistakes} محاولات غير صحيحة.</p>
      <div class="sep"></div>
      <h3 style="text-align:right">هل تعلم؟</h3>
      ${facts||'<p class="muted">ستظهر هنا بطاقات المعرفة بعد الحل.</p>'}
      <div class="nav" style="justify-content:center;margin-top:18px">
        <button class="btn primary" id="next-unit-result">الوحدة التالية</button>
        <a class="btn" href="#profile">تقدّمي</a>
        <a class="btn" href="#home">كل الوحدات</a>
      </div>
    </section>
  `);
  document.querySelector("#next-unit-result")?.addEventListener("click",()=>{
    const next=PUBLISHED_UNITS.find(u=>u.id>unit.id&&!state.units?.[u.id]?.completed)||PUBLISHED_UNITS.find(u=>u.id>unit.id)||PUBLISHED_UNITS[0];
    activeWordId=null;
    location.hash=`#play/${next.id}`;
  });
}

function renderProfile(){
  state=loadState();
  const mastery=Object.entries(CATEGORIES).map(([id,c])=>{
    const m=state.mastery?.[id]||{rating:1000,attempts:0,correct:0};
    const p=pct(m.rating);
    return `<div class="mastery-row"><header><span>${c.icon} ${esc(c.label)}</span><span>${p}%</span></header><div class="progress"><i style="width:${p}%"></i></div></div>`;
  }).join("");
  const user=currentUser();
  const accountText=user?`متصل: ${esc(user.email||"حساب سحابي")}`:cloudEnabled()?"غير مسجّل الدخول — تقدمك محفوظ محليًا الآن.":"الوضع المحلي فعّال. أضف Supabase في config.js لتفعيل الحسابات والمزامنة.";

  appEl.innerHTML=shell(`
    <section class="section-head"><div><span class="kicker">ملف اللاعب</span><h2 style="font-size:2rem">${esc(state.profile?.displayName||"ضيف")}</h2><p>المستوى ${state.level||1} · ${state.xp||0} XP · ${state.streak||0} أيام متتالية</p></div></section>
    <section class="profile-grid">
      <div class="panel">
        <h3>الحساب</h3>
        <div class="field"><label>الاسم داخل اللعبة</label><input id="display-name" value="${esc(state.profile?.displayName||"ضيف")}" /></div>
        <button class="btn primary" id="save-name">حفظ</button>
        <div class="sep"></div>
        <p class="muted">${accountText}</p>
        ${user?'<button class="btn danger" id="logout-btn">تسجيل الخروج</button>':'<a class="btn" href="#login">تسجيل الدخول</a>'}
        <div class="sep"></div>
        <div class="stats">
          <div class="stat"><b>${completedCount()}</b><span>وحدة مكتملة</span></div>
          <div class="stat"><b>${state.xp||0}</b><span>XP</span></div>
          <div class="stat"><b>${state.streak||0}</b><span>Streak</span></div>
        </div>
      </div>
      <div class="panel"><h3>إتقان الأبواب</h3><p class="muted">يتغيّر بحسب صحة الإجابة، الصعوبة، السرعة والمساعدات.</p>${mastery}</div>
    </section>
  `);

  document.querySelector("#save-name")?.addEventListener("click",()=>{
    const name=document.querySelector("#display-name").value.trim().slice(0,40)||"ضيف";
    state.profile={...(state.profile||{}),displayName:name};
    saveState(state);
    toast("تم حفظ الاسم");
    renderProfile();
  });
  document.querySelector("#logout-btn")?.addEventListener("click",async()=>{
    await signOut();
    toast("تم تسجيل الخروج");
    renderProfile();
  });
}

function renderLogin(){
  const user=currentUser();
  if(user){location.hash="#profile";return;}

  appEl.innerHTML=shell(`
    <section class="login-box panel">
      <span class="kicker">حساب اللاعب</span><h1 style="font-size:2.4rem">احفظ تقدّمك</h1>
      <p class="muted">الحساب يزامن الوحدات والنقاط ومستوى كل باب بين أجهزتك.</p>
      ${!authInfo.enabled?'<div class="notice">Supabase غير مفعّل في هذا الفرع بعد. اللعبة تعمل كاملة محليًا، ولتفعيل الحسابات ضع Project URL وAnon Key العام في <code>config.js</code> ثم نفّذ مخطط قاعدة البيانات.</div>':""}
      <form id="auth-form">
        <div class="field"><label>البريد الإلكتروني</label><input id="email" type="email" required /></div>
        <div class="field"><label>كلمة المرور</label><input id="password" type="password" minlength="6" required /></div>
        <div class="actions"><button class="btn primary" type="submit">دخول</button><button class="btn" id="signup-btn" type="button">إنشاء حساب</button></div>
      </form>
    </section>
  `);

  const form=document.querySelector("#auth-form");
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    if(!authInfo.enabled){toast("فعّل Supabase أولًا");return;}
    try{
      await signIn(document.querySelector("#email").value,document.querySelector("#password").value);
      toast("أهلًا بك");
      location.hash="#profile";
    }catch(err){toast(err.message||"تعذر تسجيل الدخول");}
  });
  document.querySelector("#signup-btn").addEventListener("click",async()=>{
    if(!authInfo.enabled){toast("فعّل Supabase أولًا");return;}
    try{
      await signUp(document.querySelector("#email").value,document.querySelector("#password").value);
      toast("تم إنشاء الحساب — تحقق من بريدك إذا كان التأكيد مفعّلًا");
    }catch(err){toast(err.message||"تعذر إنشاء الحساب");}
  });
}

function route(){
  if(boardKeyHandler){document.removeEventListener("keydown",boardKeyHandler);boardKeyHandler=null;}
  boardResizeCleanup?.();
  boardResizeCleanup=null;
  wordViewOpen=false;
  syncWordViewScrollLock();
  const hash=location.hash||"#home";
  if(hash.startsWith("#play/")){renderGame(Number(hash.split("/")[1]));return;}
  if(hash==="#profile"){renderProfile();return;}
  if(hash==="#login"){renderLogin();return;}
  renderHome();
}

window.addEventListener("hashchange",()=>{
  activeWordId=null;
  wordViewOpen=false;
  route();
});
window.addEventListener("kalimat-auth-changed",()=>{
  state=loadState();
  route();
});

(async function boot(){
  authInfo=await initCloud();
  state=loadState();
  route();
})();
