import {CATEGORIES,PUBLISHED_UNITS,unitSlots,getUnit,UNIT_COUNT} from "./content.js";
import {generateCrossword,normalizeArabic,entryIndexAtCell,nextCellInWord,wordsAtCell,createLetterBank} from "./crossword.js";
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
let wordStartedAt=Date.now();
let boardKeyHandler=null;
let gameFeedback=null;

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
      gridHtml+=`<button class="${cls}" data-cell="${r},${c}" aria-label="خانة">
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
  const bank=createLetterBank(word.entry,{distractorCount:Math.max(8,20-word.chars.length)});
  // A visible letter in an editable cell reserves one matching tile. Locked
  // crossing letters are inherited from the board and do not consume a tile.
  const used=[];
  word.coords.forEach((x,i)=>{
    const value=session.cells[ck(x.r,x.c)];
    if(value&&!lockedForWord(i)){
      const tile=bank.findIndex((letter,index)=>letter===value&&!used.includes(index));
      if(tile>=0) used.push(tile);
    }
  });
  const failed=gameFeedback?.unitId===unit.id&&gameFeedback?.wordId===word.entry.id;
  appEl.innerHTML=shell(`
    <section class="game-head">
      <div><span class="kicker">الوحدة ${unit.id}</span><h1>${esc(unit.title)}</h1><span class="muted">${esc(unit.subtitle)}</span></div>
      <div class="meter">
        <span>⭐ ${session.score}</span><span>🔥 ${state.streak||0}</span>
      </div>
    </section>
    <section class="game-layout">
      <div class="board-column">
        <div class="clue-bar panel">
          <button class="round-btn" id="prev-btn" aria-label="الكلمة السابقة">‹</button>
          <div class="current-clue"><span class="pill">${word.number} · ${word.dir==="H"?"أفقي ←":"عمودي ↓"}</span><b>${esc(word.entry.clue)}</b></div>
          <button class="round-btn" id="next-btn" aria-label="الكلمة التالية">›</button>
        </div>
        <div class="grid-wrap">
        <div class="crossword ${failed?"wrong-board":""}" style="grid-template-columns:repeat(${grid.cols},38px)">${gridHtml}</div>
        </div>
        <section class="letter-bank ${failed?"bank-wrong":""}" aria-label="بنك الحروف">
          <span class="bank-label">اختر الحروف</span>
          <div class="bank-tiles">${bank.map((letter,i)=>`<button class="letter-tile ${used.includes(i)?"used":""}" data-tile="${i}" data-letter="${esc(letter)}" ${used.includes(i)?"disabled":""}>${esc(letter)}</button>`).join("")}</div>
        </section>
        <div class="board-tools">
          <button class="btn soft" id="hint-btn">تلميح</button>
          <button class="btn danger" id="reveal-btn">كشف</button>
        </div>
      </div>
      <aside class="panel clue-card">
        <span class="pill">${CATEGORIES[word.entry.category]?.icon||"•"} ${esc(CATEGORIES[word.entry.category]?.label||word.entry.category)}</span>
        <h3>الكلمات</h3>
        <div class="clue-groups"><section><h4>أفقي</h4>${clueRows("H")}</section><section><h4>عمودي</h4>${clueRows("V")}</section></div>
      </aside>
    </section>
  `);

  const crosswordEl=document.querySelector(".crossword");
  const resizeGrid=()=>{
    crosswordEl.style.gridTemplateColumns=`repeat(${grid.cols},${innerWidth<=560?32:38}px)`;
  };
  resizeGrid();

  function persist(){
    state.units=state.units||{};
    state.units[unit.id]={...session};
    saveState(state);
  }
  function refresh(){persist();renderGame(unit.id);}
  function setActive(id,index=0){
    activeWordId=id;
    activeCellIndex=index;
    wordStartedAt=Date.now();
    renderGame(unit.id);
  }
  function checkCompletedWord(){
    if(!word.coords.every(x=>session.cells[ck(x.r,x.c)])) return;
    if(wordValue(word,session)===word.chars.join("")){ solveWord(word,false); return; }
    session.mistakes++;
    gameFeedback={unitId:unit.id,wordId:word.entry.id};
    persist(); renderGame(unit.id);
    setTimeout(()=>{
      word.coords.forEach((x,i)=>{if(!solvedCells.has(ck(x.r,x.c))) delete session.cells[ck(x.r,x.c)];});
      gameFeedback=null; persist(); renderGame(unit.id);
    },520);
  }
  function writeLetter(raw){
    const char=Array.from(normalizeArabic(raw))[0];
    if(!char)return;
    const cell=word.coords[activeCellIndex];
    if(!cell||solvedCells.has(ck(cell.r,cell.c)))return;
    session.cells[ck(cell.r,cell.c)]=char;
    persist();
    const next=nextCellInWord(word,activeCellIndex,1);
    activeCellIndex=next===activeCellIndex?activeCellIndex:next;
    checkCompletedWord();
    if(!gameFeedback) renderGame(unit.id);
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
      setTimeout(()=>renderResult(unit,grid,session),450);
      return true;
    }
    const next=grid.placed.find(w=>!session.solved[w.entry.id]);
    activeWordId=next?.entry.id||target.entry.id;
    activeCellIndex=0;
    wordStartedAt=Date.now();
    setTimeout(()=>renderGame(unit.id),220);
    return true;
  }

  function moveWord(delta){
    const idx=grid.placed.findIndex(w=>w.entry.id===word.entry.id);
    const next=grid.placed[(idx+delta+grid.placed.length)%grid.placed.length];
    setActive(next.entry.id);
  }
  document.querySelector("#next-btn")?.addEventListener("click",()=>moveWord(1));
  document.querySelector("#prev-btn")?.addEventListener("click",()=>moveWord(-1));
  document.querySelector("#hint-btn")?.addEventListener("click",()=>{
    const target=word.coords.find((x,i)=>(session.cells[ck(x.r,x.c)]||"")!==word.chars[i]);
    if(!target){toast("كل الحروف موجودة — تحقق من الجواب");return;}
    const i=word.coords.indexOf(target);
    session.cells[ck(target.r,target.c)]=word.chars[i];
    session.hints++;
    session.score=Math.max(0,session.score-15);
    toast("كشفنا حرفًا واحدًا");
    activeCellIndex=i; refresh(); checkCompletedWord();
  });
  document.querySelector("#reveal-btn")?.addEventListener("click",()=>{
    word.coords.forEach((x,i)=>session.cells[ck(x.r,x.c)]=word.chars[i]);
    session.hints+=2;
    session.score=Math.max(0,session.score-50);
    persist();
    solveWord(word,true);
  });
  document.querySelectorAll("[data-word]").forEach(el=>el.addEventListener("click",()=>setActive(el.dataset.word)));
  document.querySelectorAll("[data-cell]").forEach(el=>el.addEventListener("click",()=>{
    const [r,c]=el.dataset.cell.split(",").map(Number);
    const words=wordsAtCell(grid,r,c);
    if(!words.length)return;
    const valueKey=ck(r,c);
    if(session.cells[valueKey]&&!solvedCells.has(valueKey)&&words.some(w=>w.entry.id===activeWordId)){
      delete session.cells[valueKey];
      activeCellIndex=entryIndexAtCell(word,r,c); persist(); renderGame(unit.id); return;
    }
    const selected=words.find(w=>w.entry.id===activeWordId);
    const next=selected&&words.length>1?words[(words.indexOf(selected)+1)%words.length]:words[0];
    setActive(next.entry.id,entryIndexAtCell(next,r,c));
  }));
  document.querySelectorAll("[data-tile]").forEach(el=>el.addEventListener("click",()=>writeLetter(el.dataset.letter)));
  if(boardKeyHandler) document.removeEventListener("keydown",boardKeyHandler);
  boardKeyHandler=function onKey(e){
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.key==="ArrowLeft"){e.preventDefault();activeCellIndex=nextCellInWord(word,activeCellIndex,1);renderGame(unit.id);return;}
    if(e.key==="ArrowRight"){e.preventDefault();activeCellIndex=nextCellInWord(word,activeCellIndex,-1);renderGame(unit.id);return;}
    if(e.key==="Backspace"){e.preventDefault();const cell=word.coords[activeCellIndex];if(!solvedCells.has(ck(cell.r,cell.c))) delete session.cells[ck(cell.r,cell.c)];persist();renderGame(unit.id);return;}
    if(Array.from(normalizeArabic(e.key)).length===1){e.preventDefault();writeLetter(e.key);}
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
    <section class="result panel celebration">
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
  const hash=location.hash||"#home";
  if(hash.startsWith("#play/")){renderGame(Number(hash.split("/")[1]));return;}
  if(hash==="#profile"){renderProfile();return;}
  if(hash==="#login"){renderLogin();return;}
  renderHome();
}

window.addEventListener("hashchange",()=>{
  activeWordId=null;
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
