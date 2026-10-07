import test from "node:test";
import assert from "node:assert/strict";
import {normalizeArabic,generateCrossword} from "../js/crossword.js";
import {PUBLISHED_UNITS} from "../js/content.js";

test("Arabic normalization removes tashkeel, tatweel, spaces and alef variants",()=>{
  assert.equal(normalizeArabic("إِبْنُ خَـلْدُون"),"ابنخلدون");
});

test("each published seed unit can generate a connected playable grid",()=>{
  for(const unit of PUBLISHED_UNITS){
    const grid=generateCrossword(unit.entries);
    assert.ok(grid.placed.length>=5, `unit ${unit.id} placed only ${grid.placed.length}`);
    assert.ok(grid.rows>0&&grid.cols>0);
    for(const word of grid.placed){
      for(const cell of word.coords){
        assert.ok(cell.r>=0&&cell.r<grid.rows);
        assert.ok(cell.c>=0&&cell.c<grid.cols);
        assert.equal(grid.cells[`${cell.r},${cell.c}`].char,word.chars[cell.i]);
      }
    }
  }
});
