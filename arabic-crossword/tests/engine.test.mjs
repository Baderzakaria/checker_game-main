import test from "node:test";
import assert from "node:assert/strict";
import {normalizeArabic,generateCrossword,nextCellInWord,entryIndexAtCell,wordsAtCell,createLetterBank,answerChars,createBankState,consumeBankTile,returnBankTile} from "../js/crossword.js";
import {PUBLISHED_UNITS} from "../js/content.js";

test("Arabic normalization removes tashkeel, tatweel, spaces and alef variants",()=>{
  assert.equal(normalizeArabic("إِبْنُ خَـلْدُون"),"ابنخلدون");
});

test("all ten units generate 15-word connected compact grids",()=>{
  assert.equal(PUBLISHED_UNITS.length,10);
  for(const unit of PUBLISHED_UNITS){
    const grid=generateCrossword(unit.entries);
    assert.equal(grid.placed.length,15, `unit ${unit.id} did not place all entries`);
    assert.ok(grid.rows>0&&grid.cols>0);
    const aspect=grid.rows/grid.cols;
    assert.ok(aspect>=.5&&aspect<=2, `unit ${unit.id} aspect ${aspect}`);
    assert.equal(new Set(grid.placed.map(word=>word.entry.id)).size,grid.placed.length);
    for(const word of grid.placed){
      const crossings=word.coords.filter(cell=>grid.cells[`${cell.r},${cell.c}`].refs.length>1);
      assert.ok(crossings.length>0, `unit ${unit.id}, ${word.entry.id} is isolated`);
      for(const cell of word.coords){
        assert.ok(cell.r>=0&&cell.r<grid.rows);
        assert.ok(cell.c>=0&&cell.c<grid.cols);
        assert.equal(grid.cells[`${cell.r},${cell.c}`].char,word.chars[cell.i]);
      }
    }
  }
});

test("bank tile state consumes and returns the exact same tile multiset",()=>{
  const bank=createBankState({id:"bank-state",answer:"سوس",difficulty:2});
  const original=bank.tiles.map(tile=>tile.letter).sort();
  const first=bank.tiles[0].id;
  const consumed=consumeBankTile(bank,0,first);
  assert.deepEqual(Object.values(consumed.consumedBySlot),[first]);
  const returned=returnBankTile(consumed,0);
  assert.deepEqual(returned.tiles.map(tile=>tile.letter).sort(),original);
  const consumedAgain=consumeBankTile(returned,1,first);
  assert.equal(consumedAgain.consumedBySlot[1],first);
  assert.deepEqual(consumedAgain.tiles.map(tile=>tile.letter).sort(),original);
});

test("grid interaction helpers preserve Arabic across coordinate order",()=>{
  const word={coords:[{r:3,c:6},{r:3,c:5},{r:3,c:4}]};
  assert.equal(entryIndexAtCell(word,3,6),0);
  assert.equal(entryIndexAtCell(word,3,4),2);
  assert.equal(nextCellInWord(word,0,1),1);
  assert.equal(nextCellInWord(word,2,1),2);
  assert.equal(nextCellInWord(word,0,-1),0);
});

test("wordsAtCell returns all crossing entries",()=>{
  const horizontal={entry:{id:"h"}}, vertical={entry:{id:"v"}};
  const grid={cells:{"1,2":{refs:[{id:"h"},{id:"v"}]}},placed:[horizontal,vertical]};
  assert.deepEqual(wordsAtCell(grid,1,2),[horizontal,vertical]);
});

test("letter bank contains the exact answer multiset plus distractors and shuffles it",()=>{
  // The deterministic stream makes the assertion reproducible while still
  // exercising the shuffle path.
  let n=0;
  const random=()=>[.91,.14,.72,.33,.58,.04,.86,.21][n++%8];
  const entry={answer:"سوس"};
  const bank=createLetterBank(entry,{random});
  const answer=answerChars(entry);
  assert.equal(bank.length,answer.length+6);
  assert.ok(bank.length<=12);
  for(const ch of answer){
    assert.ok(bank.filter(x=>x===ch).length>=answer.filter(x=>x===ch).length);
  }
  assert.notDeepEqual(bank.slice(0,answer.length),answer,
    "answer letters must not be exposed in answer order");
  assert.ok(bank.every(ch=>typeof ch==="string"&&Array.from(ch).length===1));
});

test("letter bank reduces distractors for long answers while preserving every answer letter",()=>{
  const entry={answer:"الاستقلال"};
  const answer=answerChars(entry);
  const bank=createLetterBank(entry,{random:()=>.4});
  assert.equal(bank.length,12);
  assert.equal(bank.length-answer.length,3);
  for(const ch of answer) assert.ok(bank.filter(x=>x===ch).length>=answer.filter(x=>x===ch).length);
});
