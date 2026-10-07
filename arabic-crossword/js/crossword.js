const DIACRITICS=/[\u064B-\u065F\u0670\u06D6-\u06ED]/g;

export function normalizeArabic(value=""){
  return value
    .normalize("NFKC")
    .replace(DIACRITICS,"")
    .replace(/ـ/g,"")
    .replace(/[إأآٱ]/g,"ا")
    .replace(/[\s\-–—_'".،,:;؛!?؟()\[\]{}]/g,"")
    .trim();
}

export function answerChars(entry){
  return Array.from(normalizeArabic(entry.answer));
}

const BANK_DISTRACTORS=Array.from("ابتثجحخدذرزسشصضطظعغفقكلمنهويءئؤةى");
const CONFUSABLES={
  "ا":"أإآى", "أ":"اإآ", "إ":"اأآ", "ى":"اي", "ة":"ته", "ه":"ةح",
  "ب":"تثن", "ت":"بث", "ث":"بت", "ج":"حخ", "ح":"جخه", "خ":"جح",
  "د":"ذ", "ذ":"د", "ر":"ز", "ز":"ر", "س":"ش", "ش":"س",
  "ص":"ض", "ض":"ص", "ط":"ظ", "ظ":"ط", "ع":"غ", "غ":"ع",
  "ف":"ق", "ق":"ف", "ك":"ل", "ل":"ك", "و":"ؤ", "ي":"ئ"
};

function seededRandom(seed=""){
  let value=2166136261;
  for(const ch of String(seed)) value=Math.imul(value^ch.charCodeAt(0),16777619);
  return ()=>{
    value+=0x6D2B79F5;
    let x=value;
    x=Math.imul(x^(x>>>15),x|1); x^=x+Math.imul(x^(x>>>7),x|61);
    return ((x^(x>>>14))>>>0)/4294967296;
  };
}

// A bank is deliberately just a bag of letters: callers never receive a
// "correct" marker, and Fisher-Yates means answer letters have no stable
// position to give the answer away.
export function createLetterBank(entry,{distractorCount,random,contextLetters=[]}={}){
  const answer=answerChars(entry);
  // Short answers get a few decoys; longer ones give up decoys to remain
  // focused at twelve tiles whenever their answer length allows it.
  if(distractorCount===undefined){
    // Legacy callers without a difficulty retain the historical six-decoy
    // bank; authored level-one entries deliberately stay lighter.
    const difficulty=entry.difficulty===undefined?3:(Number(entry.difficulty)||1);
    distractorCount=Math.min(difficulty>=2?6:3,Math.max(3,12-answer.length));
    distractorCount=Math.min(distractorCount,Math.max(0,12-answer.length));
  }
  random=random||seededRandom(entry.id||entry.answer);
  // Difficulty is expressed in the choices, not by exposing extra facts:
  // adults see more decoys that are genuinely easy to confuse with the answer.
  const smartPool=[...new Set(answer.flatMap(ch=>Array.from(CONFUSABLES[ch]||"")))];
  const crossingPool=[...new Set(contextLetters.filter(ch=>ch&&!answer.includes(ch)))];
  const distractors=[];
  for(let i=0;i<distractorCount;i++){
    const pool=(entry.difficulty>=2 && smartPool.length && i<Math.ceil(distractorCount*.7))
      ?smartPool : (crossingPool.length&&i%3===2 ? crossingPool : BANK_DISTRACTORS);
    distractors.push(pool[Math.floor(random()*pool.length)]);
  }
  const letters=[...answer,...distractors];
  for(let i=letters.length-1;i>0;i--){
    const j=Math.floor(random()*(i+1));
    [letters[i],letters[j]]=[letters[j],letters[i]];
  }
  return letters;
}

// Bank state is deliberately separate from rendering.  Tile ids make repeated
// letters unambiguous and guarantee that a consumed tile is the tile returned.
export function createBankState(entry,options={}){
  return {tiles:createLetterBank(entry,options).map((letter,id)=>({id,letter})),consumedBySlot:{}};
}
export function consumeBankTile(bank,slot,tileId){
  if(Object.values(bank.consumedBySlot).includes(tileId)) return bank;
  return {...bank,consumedBySlot:{...bank.consumedBySlot,[slot]:tileId}};
}
export function returnBankTile(bank,slot){
  const consumedBySlot={...bank.consumedBySlot}; delete consumedBySlot[slot];
  return {...bank,consumedBySlot};
}
export function resetBankTiles(bank){ return {...bank,consumedBySlot:{}}; }

// These small pure helpers keep browser input behavior testable.  Horizontal
// Arabic entries deliberately move toward decreasing columns.
export function nextCellInWord(word, cellIndex, step=1){
  const length=word.coords.length;
  return Math.max(0,Math.min(length-1,cellIndex+step));
}

export function entryIndexAtCell(word,row,col){
  return word.coords.findIndex(x=>x.r===row&&x.c===col);
}

export function wordsAtCell(grid,row,col){
  return (grid.cells[key(row,col)]?.refs||[])
    .map(ref=>grid.placed.find(word=>word.entry.id===ref.id))
    .filter(Boolean);
}

function key(r,c){ return `${r},${c}`; }
function get(grid,r,c){ return grid.get(key(r,c)); }
function set(grid,r,c,ch){ grid.set(key(r,c),ch); }

function boundsOf(grid){
  if(!grid.size) return {minR:0,maxR:0,minC:0,maxC:0,area:0};
  let minR=Infinity,maxR=-Infinity,minC=Infinity,maxC=-Infinity;
  for(const k of grid.keys()){
    const [r,c]=k.split(",").map(Number);
    minR=Math.min(minR,r);maxR=Math.max(maxR,r);
    minC=Math.min(minC,c);maxC=Math.max(maxC,c);
  }
  return {minR,maxR,minC,maxC,area:(maxR-minR+1)*(maxC-minC+1)};
}

function wordCells(row,col,dir,chars){
  const dr=dir==="V"?1:0, dc=dir==="H"?-1:0;
  return chars.map((ch,i)=>({r:row+dr*i,c:col+dc*i,ch,i}));
}

function canPlace(grid,row,col,dir,chars,size){
  const cells=wordCells(row,col,dir,chars);
  for(const cell of cells){
    if(cell.r<0||cell.c<0||cell.r>=size||cell.c>=size) return null;
  }
  const dr=dir==="V"?1:0, dc=dir==="H"?-1:0;
  const before={r:row-dr,c:col-dc};
  const after={r:row+dr*chars.length,c:col+dc*chars.length};
  if(get(grid,before.r,before.c)||get(grid,after.r,after.c)) return null;

  let intersections=0;
  for(const cell of cells){
    const existing=get(grid,cell.r,cell.c);
    if(existing && existing!==cell.ch) return null;
    if(existing===cell.ch){
      intersections++;
      continue;
    }
    if(dir==="H"){
      if(get(grid,cell.r-1,cell.c)||get(grid,cell.r+1,cell.c)) return null;
    }else{
      if(get(grid,cell.r,cell.c-1)||get(grid,cell.r,cell.c+1)) return null;
    }
  }
  if(grid.size && intersections===0) return null;
  return {cells,intersections};
}

function connectivity(entry,all){
  const chars=answerChars(entry);
  let score=0;
  for(const other of all){
    if(other.id===entry.id) continue;
    const setOther=new Set(answerChars(other));
    for(const ch of chars) if(setOther.has(ch)) score++;
  }
  return score;
}

function possiblePlacements(grid,entry,size){
  const chars=answerChars(entry);
  const out=[];
  if(!grid.size) return out;
  for(const [k,gridChar] of grid.entries()){
    const [r,c]=k.split(",").map(Number);
    for(let i=0;i<chars.length;i++){
      if(chars[i]!==gridChar) continue;
      for(const dir of ["H","V"]){
        const dr=dir==="V"?1:0, dc=dir==="H"?-1:0;
        const startR=r-dr*i, startC=c-dc*i;
        const valid=canPlace(grid,startR,startC,dir,chars,size);
        if(!valid) continue;
        // An exact same-direction overlay is not a crossword crossing and
        // would duplicate a placement when two answers have identical text.
        if(valid.intersections===chars.length) continue;
        const oldArea=boundsOf(grid).area;
        const simulated=new Map(grid);
        for(const x of valid.cells) set(simulated,x.r,x.c,x.ch);
        const newArea=boundsOf(simulated).area;
        const center=size/2;
        const distance=Math.abs(startR-center)+Math.abs(startC-center);
        // Crosses are worth far more than merely fitting.  The expansion and
        // centre penalties produce compact, recognisably crossword-like grids.
        const score=valid.intersections*180-(newArea-oldArea)*1.35-distance*.12
          +Math.min(chars.length,7)*.5;
        out.push({row:startR,col:startC,dir,chars,intersections:valid.intersections,score});
      }
    }
  }
  return out.sort((a,b)=>b.score-a.score);
}

function buildWithRoot(entries,root,rootDir="H",size=27){
  const grid=new Map();
  const rootChars=answerChars(root);
  const center=Math.floor(size/2);
  const startRow=rootDir==="V"?center-Math.floor(rootChars.length/2):center;
  const startCol=rootDir==="H"?center+Math.floor(rootChars.length/2):center;
  const first=canPlace(grid,startRow,startCol,rootDir,rootChars,size);
  if(!first) return null;
  for(const cell of first.cells) set(grid,cell.r,cell.c,cell.ch);

  const placed=[{entry:root,row:startRow,col:startCol,dir:rootDir,chars:rootChars,intersections:0}];
  const remaining=entries.filter(e=>e.id!==root.id);
  let totalIntersections=0;

  while(remaining.length){
    let best=null,bestIndex=-1;
    for(let i=0;i<remaining.length;i++){
      const options=possiblePlacements(grid,remaining[i],size);
      if(!options.length) continue;
      const option=options[0];
      const candidate={...option,entry:remaining[i]};
      if(!best || candidate.score>best.score){
        best=candidate;bestIndex=i;
      }
    }
    if(!best) break;
    const valid=canPlace(grid,best.row,best.col,best.dir,best.chars,size);
    for(const cell of valid.cells) set(grid,cell.r,cell.c,cell.ch);
    placed.push({
      entry:best.entry,row:best.row,col:best.col,dir:best.dir,
      chars:best.chars,intersections:best.intersections
    });
    totalIntersections+=best.intersections;
    remaining.splice(bestIndex,1);
  }

  const b=boundsOf(grid);
  const density=grid.size/Math.max(1,b.area);
  return {grid,placed,unplaced:remaining,totalIntersections,density,bounds:b};
}

function finalize(result){
  const {minR,maxR,minC,maxC}=result.bounds;
  const rows=maxR-minR+1, cols=maxC-minC+1;
  const cells={};
  for(const [k,ch] of result.grid.entries()){
    const [r,c]=k.split(",").map(Number);
    cells[key(r-minR,c-minC)]={char:ch,row:r-minR,col:c-minC,refs:[]};
  }

  const placed=result.placed.map(p=>{
    const row=p.row-minR,col=p.col-minC;
    const coords=wordCells(row,col,p.dir,p.chars);
    const item={...p,row,col,coords};
    for(const x of coords){
      const ck=key(x.r,x.c);
      if(cells[ck]) cells[ck].refs.push({id:p.entry.id,index:x.i,dir:p.dir});
    }
    return item;
  });

  const starts=[...placed].sort((a,b)=>a.row-b.row||a.col-b.col);
  const numberByCell=new Map();let n=1;
  for(const p of starts){
    const k=key(p.row,p.col);
    if(!numberByCell.has(k)) numberByCell.set(k,n++);
    p.number=numberByCell.get(k);
    if(cells[k]) cells[k].number=p.number;
  }

  return {
    rows,cols,cells,placed,
    unplaced:result.unplaced,
    intersections:result.totalIntersections,
    density:result.density
  };
}

export function generateCrossword(entries,{size=27}={}){
  const usable=entries.filter(e=>answerChars(e).length>=2 && answerChars(e).length<size-3);
  if(!usable.length) throw new Error("No usable crossword entries");
  const roots=[...usable]
    .map(e=>({e,s:connectivity(e,usable)}))
    .sort((a,b)=>b.s-a.s||answerChars(b.e).length-answerChars(a.e).length)
    .map(x=>x.e);

  let best=null;
  for(const root of roots) for(const rootDir of ["H","V"]){
    const candidate=buildWithRoot(usable,root,rootDir,size);
    if(!candidate) continue;
    const compactness=1-(candidate.bounds.area/(size*size));
    const ratio=candidate.bounds.maxR-candidate.bounds.minR+1;
    const width=candidate.bounds.maxC-candidate.bounds.minC+1;
    const aspect=Math.min(ratio,width)/Math.max(ratio,width);
    const score=candidate.placed.length*1000+candidate.totalIntersections*80
      +candidate.density*180+compactness*25+aspect*260;
    if(!best || score>best.score) best={...candidate,score};
  }
  if(!best) throw new Error("Could not generate crossword");
  return finalize(best);
}
