import test from "node:test";
import assert from "node:assert/strict";
import {createBankState} from "../js/crossword.js";
import {
  createSession,ensureWordBank,consumedTileIds,placeTile,removeSlot,
  clearEditableWord,wordValue,wordIsComplete
} from "../js/game-state.js";

const word={
  entry:{id:"seq",answer:"سوس",difficulty:3},
  chars:["س","و","س"],
  coords:[{r:0,c:2},{r:0,c:1},{r:0,c:0}]
};

test("sequential taps persist every consumed stable tile",()=>{
  const session=createSession({});
  let bank=ensureWordBank(session,word,{solvedCells:new Set()});

  for(const [slot,letter] of ["س","و","س"].entries()){
    bank=session.banks[word.entry.id];
    const used=consumedTileIds(bank);
    const tile=bank.tiles.find(item=>item.letter===letter&&!used.has(item.id));
    assert.ok(tile);
    assert.equal(placeTile(session,word,{
      slotIndex:slot,tileId:tile.id,letter,solvedCells:new Set()
    }),true);
  }

  assert.equal(wordValue(session,word),"سوس");
  assert.equal(wordIsComplete(session,word),true);
  assert.equal(Object.keys(session.banks[word.entry.id].consumedBySlot).length,3);
});

test("removing a slot returns exactly its tile without forgetting other slots",()=>{
  const session=createSession({});
  let bank=ensureWordBank(session,word,{solvedCells:new Set()});
  const usedIds=[];

  for(const [slot,letter] of ["س","و"].entries()){
    bank=session.banks[word.entry.id];
    const used=consumedTileIds(bank);
    const tile=bank.tiles.find(item=>item.letter===letter&&!used.has(item.id));
    usedIds.push(tile.id);
    placeTile(session,word,{slotIndex:slot,tileId:tile.id,letter,solvedCells:new Set()});
  }

  const removed=removeSlot(session,word,0,new Set());
  assert.equal(removed.tileId,usedIds[0]);
  assert.equal(session.banks[word.entry.id].consumedBySlot[1],usedIds[1]);
  assert.equal(session.banks[word.entry.id].consumedBySlot[0],undefined);
});

test("clear restores the original bank order and empties editable cells",()=>{
  const session=createSession({});
  const initial=createBankState(word.entry);
  session.banks[word.entry.id]=initial;

  const tile=initial.tiles.find(item=>item.letter==="س");
  placeTile(session,word,{slotIndex:0,tileId:tile.id,letter:"س",solvedCells:new Set()});
  clearEditableWord(session,word,new Set());

  assert.deepEqual(session.banks[word.entry.id].tiles,initial.tiles);
  assert.deepEqual(session.banks[word.entry.id].consumedBySlot,{});
  assert.equal(wordValue(session,word),"");
});
