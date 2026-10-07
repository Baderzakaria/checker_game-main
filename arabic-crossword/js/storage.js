const LOCAL_KEY="kalimat-player-v1";
let supabase=null;
let user=null;

export function freshState(){
  return {
    version:1,
    profile:{displayName:"ضيف",avatar:"🧠"},
    xp:0,level:1,streak:0,lastPlayedDate:null,
    units:{},mastery:{},achievements:[],settings:{hideSolved:false},
    updatedAt:new Date().toISOString()
  };
}

export function loadState(){
  try{
    const raw=localStorage.getItem(LOCAL_KEY);
    return raw?{...freshState(),...JSON.parse(raw)}:freshState();
  }catch{return freshState();}
}

export function saveState(state){
  state.updatedAt=new Date().toISOString();
  localStorage.setItem(LOCAL_KEY,JSON.stringify(state));
  queueCloudPush(state);
  return state;
}

export function xpToLevel(xp=0){
  return Math.floor(Math.sqrt(Math.max(0,xp)/220))+1;
}

export function applyXp(state,amount){
  state.xp=Math.max(0,(state.xp||0)+Math.max(0,amount||0));
  state.level=xpToLevel(state.xp);
  return state;
}

export function updateStreak(state){
  const today=new Date().toISOString().slice(0,10);
  if(state.lastPlayedDate===today) return state;
  const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
  state.streak=state.lastPlayedDate===yesterday?(state.streak||0)+1:1;
  state.lastPlayedDate=today;
  return state;
}

export function updateMastery(state,category,{correct=true,difficulty=3,hints=0,timeSeconds=60}={}){
  const m=state.mastery[category]||{rating:1000,attempts:0,correct:0};
  const ability=(m.rating-1000)/180;
  const item=(difficulty-3)*.65;
  const expected=1/(1+Math.exp(item-ability));
  const actual=correct?1:0;
  const helpPenalty=Math.min(.55,hints*.16);
  const speed=Math.max(.7,Math.min(1.15,75/Math.max(20,timeSeconds)));
  const k=correct?28*speed*(1-helpPenalty):22;
  m.rating=Math.round(Math.max(650,Math.min(1450,m.rating+k*(actual-expected))));
  m.attempts+=1;
  if(correct)m.correct+=1;
  state.mastery[category]=m;
  return state;
}

export async function initCloud(){
  const cfg=window.SUPABASE_CONFIG||{};
  if(!cfg.url||!cfg.anonKey) return {enabled:false,user:null};
  try{
    const {createClient}=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    supabase=createClient(cfg.url,cfg.anonKey);
    const {data}=await supabase.auth.getSession();
    user=data?.session?.user||null;
    if(user) await pullCloud();
    supabase.auth.onAuthStateChange(async(_event,session)=>{
      user=session?.user||null;
      if(user) await pullCloud();
      window.dispatchEvent(new CustomEvent("kalimat-auth-changed"));
    });
    return {enabled:true,user};
  }catch(err){
    console.warn("Cloud disabled",err);
    return {enabled:false,user:null,error:err};
  }
}

export function cloudEnabled(){return Boolean(supabase);}
export function currentUser(){return user;}

export async function signUp(email,password){
  if(!supabase) throw new Error("cloud-disabled");
  const {data,error}=await supabase.auth.signUp({email,password});
  if(error) throw error;
  return data;
}
export async function signIn(email,password){
  if(!supabase) throw new Error("cloud-disabled");
  const {data,error}=await supabase.auth.signInWithPassword({email,password});
  if(error) throw error;
  user=data.user;
  await pullCloud();
  return data;
}
export async function signOut(){
  if(!supabase)return;
  await supabase.auth.signOut();
  user=null;
}

let pushTimer=null;
function queueCloudPush(state){
  if(!supabase||!user)return;
  clearTimeout(pushTimer);
  pushTimer=setTimeout(()=>pushCloud(state),500);
}

export async function pushCloud(state=loadState()){
  if(!supabase||!user)return;
  await supabase.from("player_states").upsert({
    user_id:user.id,state,updated_at:new Date().toISOString()
  },{onConflict:"user_id"});
}

export async function pullCloud(){
  if(!supabase||!user)return loadState();
  const {data,error}=await supabase.from("player_states").select("state,updated_at").eq("user_id",user.id).maybeSingle();
  if(error){console.warn(error);return loadState();}
  if(!data?.state){
    await pushCloud(loadState());
    return loadState();
  }
  const local=loadState();
  const localTime=Date.parse(local.updatedAt||0), cloudTime=Date.parse(data.updated_at||data.state.updatedAt||0);
  const chosen=cloudTime>localTime?data.state:local;
  localStorage.setItem(LOCAL_KEY,JSON.stringify(chosen));
  if(localTime>cloudTime) await pushCloud(local);
  return chosen;
}
