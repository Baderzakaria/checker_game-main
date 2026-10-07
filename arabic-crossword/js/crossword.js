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

// A bank is deliberately just a bag of letters: callers never receive a
// "correct" marker, and Fisher-Yates means answer letters have no stable
// position to give the answer away.
export function createLetterBank(entry,{distractorCount=10,random=Math.random}={}){
  const answer=answerChars(entry);
  const distractors=[];
  for(let i=0;i<distractorCount;i++){
    distractors.push(BANK_DISTRACTORS[Math.floor(random()*BANK_DISTRACTORS.length)]);
  }
  const letters=[...answer,...distractors];
  for(let i=letters.length-1;i>0;i--){
    const j=Math.floor(random()*(i+1));
    [letters[i],letters[j]]=[letters[j],letters[i]];
  }
  return letters;
}

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

function buildWithRoot(entries,root,size=27){
  const grid=new Map();
  const rootChars=answerChars(root);
  const center=Math.floor(size/2);
  const startCol=center+Math.floor(rootChars.length/2);
  const first=canPlace(grid,center,startCol,"H",rootChars,size);
  if(!first) return null;
  for(const cell of first.cells) set(grid,cell.r,cell.c,cell.ch);

  const placed=[{entry:root,row:center,col:startCol,dir:"H",chars:rootChars,intersections:0}];
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
    .slice(0,Math.min(8,usable.length))
    .map(x=>x.e);

  let best=null;
  for(const root of roots){
    const candidate=buildWithRoot(usable,root,size);
    if(!candidate) continue;
    const compactness=1-(candidate.bounds.area/(size*size));
    const score=candidate.placed.length*1000+candidate.totalIntersections*80
      +candidate.density*180+compactness*25;
    if(!best || score>best.score) best={...candidate,score};
  }
  if(!best) throw new Error("Could not generate crossword");
  return finalize(best);
}
