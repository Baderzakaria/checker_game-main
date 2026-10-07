import {createBankState,consumeBankTile,returnBankTile,resetBankTiles} from "./crossword.js";

export function createSession(existing={}){
  return {
    cells:existing.cells||{},
    solved:existing.solved||{},
    hints:existing.hints||0,
    mistakes:existing.mistakes||0,
    score:existing.score||0,
    banks:existing.banks||{},
    wordHints:existing.wordHints||{},
    startedAt:existing.startedAt||new Date().toISOString(),
    completed:Boolean(existing.completed),
    stars:existing.stars||0,
    completedAt:existing.completedAt||null
  };
}

export function cellKey(cell){ return `${cell.r},${cell.c}`; }

export function solvedCellSet(grid,session){
  const out=new Set();
  for(const word of grid.placed){
    if(!session.solved[word.entry.id]) continue;
    for(const cell of word.coords) out.add(cellKey(cell));
  }
  return out;
}

export function isEditableCell(cell,solvedCells){
  return !solvedCells.has(cellKey(cell));
}

export function ensureWordBank(session,word,{contextLetters=[],solvedCells=new Set()}={}){
  let bank=session.banks[word.entry.id]||createBankState(word.entry,{contextLetters});

  // Reconcile persisted reservations with the current crossing state. A cell
  // that became locked because another word was solved no longer consumes a
  // bank tile. Existing editable letters, including migrated sessions, reserve
  // one stable matching tile exactly once.
  word.coords.forEach((cell,index)=>{
    if(!isEditableCell(cell,solvedCells)&&bank.consumedBySlot?.[index]!==undefined){
      bank=returnBankTile(bank,index);
    }
  });

  let used=consumedTileIds(bank);
  word.coords.forEach((cell,index)=>{
    const value=session.cells[cellKey(cell)];
    if(!value||!isEditableCell(cell,solvedCells)||bank.consumedBySlot?.[index]!==undefined) return;
    const tile=bank.tiles.find(item=>item.letter===value&&!used.has(item.id));
    if(!tile) return;
    bank=consumeBankTile(bank,index,tile.id);
    used=consumedTileIds(bank);
  });

  session.banks[word.entry.id]=bank;
  return bank;
}

export function consumedTileIds(bank){
  return new Set(Object.values(bank?.consumedBySlot||{}).map(Number));
}

export function firstEditableEmptySlot(session,word,solvedCells){
  return word.coords.findIndex(cell=>isEditableCell(cell,solvedCells)&&!session.cells[cellKey(cell)]);
}

export function placeTile(session,word,{slotIndex,tileId,letter,solvedCells}){
  const cell=word.coords[slotIndex];
  if(!cell||!isEditableCell(cell,solvedCells)) return false;

  let bank=session.banks[word.entry.id];
  if(!bank) return false;
  if(consumedTileIds(bank).has(Number(tileId))) return false;

  const existingTile=bank.consumedBySlot?.[slotIndex];
  if(existingTile!==undefined) bank=returnBankTile(bank,slotIndex);

  session.cells[cellKey(cell)]=letter;
  bank=consumeBankTile(bank,slotIndex,Number(tileId));
  session.banks[word.entry.id]=bank;
  return true;
}

export function removeSlot(session,word,slotIndex,solvedCells){
  const cell=word.coords[slotIndex];
  if(!cell||!isEditableCell(cell,solvedCells)) return null;

  const value=session.cells[cellKey(cell)];
  if(!value) return null;

  let bank=session.banks[word.entry.id];
  const tileId=bank?.consumedBySlot?.[slotIndex];
  delete session.cells[cellKey(cell)];
  if(bank){
    bank=returnBankTile(bank,slotIndex);
    session.banks[word.entry.id]=bank;
  }
  return {letter:value,tileId};
}

export function clearEditableWord(session,word,solvedCells){
  word.coords.forEach(cell=>{
    if(isEditableCell(cell,solvedCells)) delete session.cells[cellKey(cell)];
  });
  if(session.banks[word.entry.id]){
    session.banks[word.entry.id]=resetBankTiles(session.banks[word.entry.id]);
  }
}

export function wordValue(session,word){
  return word.coords.map(cell=>session.cells[cellKey(cell)]||"").join("");
}

export function wordIsComplete(session,word){
  return word.coords.every(cell=>Boolean(session.cells[cellKey(cell)]));
}

export function findHintTarget(session,word,solvedCells){
  for(let index=0;index<word.coords.length;index++){
    const cell=word.coords[index];
    if(!isEditableCell(cell,solvedCells)) continue;
    const current=session.cells[cellKey(cell)]||"";
    if(current!==word.chars[index]) return index;
  }
  return -1;
}

export function applyHint(session,word,slotIndex,solvedCells){
  const cell=word.coords[slotIndex];
  if(!cell||!isEditableCell(cell,solvedCells)) return null;

  let bank=session.banks[word.entry.id];
  if(!bank) return null;

  const oldTile=bank.consumedBySlot?.[slotIndex];
  if(oldTile!==undefined) bank=returnBankTile(bank,slotIndex);

  const used=consumedTileIds(bank);
  const correctLetter=word.chars[slotIndex];
  const tile=bank.tiles.find(item=>item.letter===correctLetter&&!used.has(item.id));
  if(!tile) return null;

  session.cells[cellKey(cell)]=correctLetter;
  bank=consumeBankTile(bank,slotIndex,tile.id);
  session.banks[word.entry.id]=bank;
  session.hints=(session.hints||0)+1;
  session.wordHints[word.entry.id]=(session.wordHints[word.entry.id]||0)+1;
  return {tileId:tile.id,letter:correctLetter};
}
