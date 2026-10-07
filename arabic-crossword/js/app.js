import {CATEGORIES,PUBLISHED_UNITS,unitSlots,getUnit,UNIT_COUNT} from "./content.js";
import {generateCrossword,normalizeArabic} from "./crossword.js";
import {
  loadState,saveState,applyXp,updateStreak,updateMastery,
  initCloud,cloudEnabled,currentUser,signIn,signUp,signOut
} from "./storage.js";

const appEl=document.querySelector("#app");
const toastEl=document.querySelector("#toast");
let state=loadState();
let authInfo={enabled:false,user:null};
let activeWordId=null;
let wordStartedAt=Date.now();

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
    <footer class="footer">كلمات — معرفة تتقاطع. نسخة تأسيسية عربية RTL.</footer>
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
        <span class="eyebrow">✦ ثقافة عامة عربية · تتدرّج معك</span>
        <h1>كل كلمة<br>تفتح بابًا.</h1>
        <p>كلمات متقاطعة بالعربية تجمع العلم، الأدب والشعر، التاريخ، الإسلام، الجغرافيا، الرياضة، الطعام، الحيوان، التقنية والفن. ليست امتحانًا؛ الصعوبة ترتفع بهدوء مع تقدّمك.</p>
        <div class="nav" style="margin-top:18px">
          <button class="btn primary" id="continue-btn">${done?"أكمل من حيث توقفت":"ابدأ الوحدة الأولى"}</button>
          <a class="btn" href="#profile">شاهد تقدّمك</a>
        </div>
      </div>
      <aside class="hero-card">
        <span class="kicker">ملف اللاعب</span>
        <h2 style="margin:8px 0 2px">${esc(state.profile?.displayName||"ضيف")}</h2>
        <p class="muted" style="margin:0 0 16px">المستوى ${level} · ${state.streak||0} أيام متتالية</p>
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

    <div class="section-head"><div><h2>أبواب المعرفة</h2><p>كل باب يبني له مستوى إتقان مستقل عندك.</p></div></div>
    <section class="doors">${doorCards}</section>

    <div class="section-head" id="units"><div><h2>المسار</h2><p>أول ${PUBLISHED_UNITS.length} وحدات قابلة للعب الآن؛ البنية ممتدة إلى 100.</p></div><span class="pill">100 وحدة</span></div>
    <section class="units">${unitCards}</section>
  `);

  document.querySelectorAll("[data-unit]").forEach(btn=>btn.addEventListener("click",()=>location.hash=`#play/${btn.dataset.unit}`));
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
        word.coords.some(x=>x.r===r&&x.c===c)?"active":""
      ].filter(Boolean).join(" ");
      gridHtml+=`<button class="${cls}" data-cell="${r},${c}" aria-label="خانة">
        ${cell.number?`<span class="num">${cell.number}</span>`:""}<span>${esc(value)}</span>
      </button>`;
    }
  }

  const solvedN=grid.placed.filter(w=>isWordSolved(w,session)).length;
  const clueList=[...grid.placed].sort((a,b)=>a.number-b.number).map(w=>`
    <button class="clue-row ${w.entry.id===word.entry.id?"active":""} ${isWordSolved(w,session)?"solved":""}" data-word="${w.entry.id}">
      <b>${w.number}${w.dir==="H"?"↔":"↕"}</b><span>${esc(w.entry.clue)}</span>
    </button>`).join("");

  const media=word.entry.media?renderMedia(word.entry.media):"";
  appEl.innerHTML=shell(`
    <section class="game-head">
      <div><span class="kicker">الوحدة ${unit.id}</span><h1>${esc(unit.title)}</h1><span class="muted">${esc(unit.subtitle)}</span></div>
      <div class="meter">
        <span class="pill">✦ ${session.score} نقطة</span>
        <span class="pill">💡 ${session.hints} مساعدة</span>
        <span class="pill">✓ ${solvedN}/${grid.placed.length}</span>
      </div>
    </section>
    ${grid.unplaced.length?`<div class="notice" style="margin-top:12px">المحرّك وضع ${grid.placed.length} من أصل ${unit.entries.length} كلمة في هذه الشبكة التجريبية. الكلمات غير الموضوعة تبقى في بنك الوحدة لإعادة التوليد لاحقًا.</div>`:""}
    <section class="game-layout">
      <div class="grid-wrap">
        <div class="crossword" style="grid-template-columns:repeat(${grid.cols},38px)">${gridHtml}</div>
      </div>
      <aside class="panel clue-card">
        <span class="pill">${CATEGORIES[word.entry.category]?.icon||"•"} ${esc(CATEGORIES[word.entry.category]?.label||word.entry.category)}</span>
        <h3>${word.number} ${word.dir==="H"?"أفقي":"عمودي"}</h3>
        ${media}
        <div class="clue">${esc(word.entry.clue)}</div>
        <input id="answer-input" class="answer-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="اكتب الجواب..." value="${esc(wordValue(word,session))}" />
        <div class="actions">
          <button class="btn primary" id="check-btn">تحقق</button>
          <button class="btn" id="next-btn">التالي</button>
          <button class="btn soft" id="hint-btn">كشف حرف</button>
          <button class="btn danger" id="reveal-btn">كشف الكلمة</button>
        </div>
        <div class="sep"></div>
        <div class="clue-list">${clueList}</div>
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
  function setActive(id){
    activeWordId=id;
    wordStartedAt=Date.now();
    renderGame(unit.id);
    setTimeout(()=>document.querySelector("#answer-input")?.focus(),0);
  }
  function writeValue(raw){
    const chars=Array.from(normalizeArabic(raw)).slice(0,word.chars.length);
    word.coords.forEach((x,i)=>{
      const key=ck(x.r,x.c);
      if(chars[i]) session.cells[key]=chars[i];
      else if(!solvedCells.has(key)) delete session.cells[key];
    });
    persist();
  }
  function completeWord(force=false){
    const actual=wordValue(word,session);
    const expected=word.chars.join("");
    if(actual!==expected&&!force){
      session.mistakes++;
      updateMastery(state,word.entry.category,{correct:false,difficulty:word.entry.difficulty,hints:0,timeSeconds:Math.max(1,(Date.now()-wordStartedAt)/1000)});
      persist();
      toast("ليست هي بعد — جرّب من التقاطعات");
      return false;
    }
    if(!session.solved[word.entry.id]){
      session.solved[word.entry.id]=true;
      const elapsed=Math.max(1,Math.round((Date.now()-wordStartedAt)/1000));
      const earned=Math.max(35,90+word.entry.difficulty*32-session.hints*5-(force?55:0));
      session.score+=earned;
      applyXp(state,Math.round(earned*.45));
      updateStreak(state);
      updateMastery(state,word.entry.category,{correct:true,difficulty:word.entry.difficulty,hints:force?2:0,timeSeconds:elapsed});
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
    activeWordId=next?.entry.id||word.entry.id;
    wordStartedAt=Date.now();
    setTimeout(()=>renderGame(unit.id),220);
    return true;
  }

  document.querySelector("#answer-input")?.addEventListener("input",e=>{
    writeValue(e.target.value);
    word.coords.forEach(x=>{
      const el=document.querySelector(`[data-cell="${x.r},${x.c}"] span:last-child`);
      if(el) el.textContent=session.cells[ck(x.r,x.c)]||"";
    });
  });
  document.querySelector("#answer-input")?.addEventListener("keydown",e=>{if(e.key==="Enter")completeWord(false);});
  document.querySelector("#check-btn")?.addEventListener("click",()=>completeWord(false));
  document.querySelector("#next-btn")?.addEventListener("click",()=>{
    const idx=grid.placed.findIndex(w=>w.entry.id===word.entry.id);
    const ordered=[...grid.placed.slice(idx+1),...grid.placed.slice(0,idx+1)];
    const next=ordered.find(w=>!session.solved[w.entry.id])||grid.placed[(idx+1)%grid.placed.length];
    setActive(next.entry.id);
  });
  document.querySelector("#hint-btn")?.addEventListener("click",()=>{
    const target=word.coords.find((x,i)=>(session.cells[ck(x.r,x.c)]||"")!==word.chars[i]);
    if(!target){toast("كل الحروف موجودة — تحقق من الجواب");return;}
    const i=word.coords.indexOf(target);
    session.cells[ck(target.r,target.c)]=word.chars[i];
    session.hints++;
    session.score=Math.max(0,session.score-15);
    toast("كشفنا حرفًا واحدًا");
    refresh();
  });
  document.querySelector("#reveal-btn")?.addEventListener("click",()=>{
    word.coords.forEach((x,i)=>session.cells[ck(x.r,x.c)]=word.chars[i]);
    session.hints+=2;
    session.score=Math.max(0,session.score-50);
    persist();
    completeWord(true);
  });
  document.querySelectorAll("[data-word]").forEach(el=>el.addEventListener("click",()=>setActive(el.dataset.word)));
  document.querySelectorAll("[data-cell]").forEach(el=>el.addEventListener("click",()=>{
    const [r,c]=el.dataset.cell.split(",").map(Number);
    const refs=grid.cells[ck(r,c)]?.refs||[];
    if(!refs.length)return;
    const currentIndex=refs.findIndex(x=>x.id===activeWordId);
    setActive(refs[(currentIndex+1)%refs.length].id);
  }));
  setTimeout(()=>document.querySelector("#answer-input")?.focus(),0);
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
    <section class="result panel">
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
