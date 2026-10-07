import {PUBLISHED_UNITS,CATEGORIES} from "../js/content.js";
import {normalizeArabic} from "../js/crossword.js";

const all=PUBLISHED_UNITS.flatMap(unit=>unit.entries.map(entry=>({...entry,unit:unit.id})));
const keys=new Map();
const duplicates=[];
for(const item of all){
  const key=normalizeArabic(item.answer);
  if(keys.has(key)) duplicates.push([keys.get(key),item]);
  else keys.set(key,item);
}

const categories={};
for(const item of all) categories[item.category]=(categories[item.category]||0)+1;

console.log(JSON.stringify({
  publishedUnits:PUBLISHED_UNITS.length,
  entries:all.length,
  uniqueAnswers:keys.size,
  duplicates:duplicates.map(([a,b])=>({answer:b.answer,units:[a.unit,b.unit]})),
  categories:Object.fromEntries(Object.entries(categories).map(([k,v])=>[CATEGORIES[k]?.label||k,v])),
  unverified:all.filter(x=>!x.verified).length
},null,2));

if(duplicates.length){
  console.error("Duplicate normalized answers found.");
  process.exitCode=1;
}
if(PUBLISHED_UNITS.length!==10||all.length!==150){
  console.error("Published content must contain exactly 10 units and 150 answers.");
  process.exitCode=1;
}
if(all.some(item=>!item.verified)){
  console.error("Every published answer must have editorial verification.");
  process.exitCode=1;
}
