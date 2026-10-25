/** Conservative, truth-blind feasibility screen. Does not change the app.
 * Two SIDs must have different outcomes somewhere in the affordable catalogue.
 * Checksum and unknown nuisance plaintext are deliberately not used.
 */
import fs from "node:fs";
import assert from "node:assert/strict";
import {oracleStarter} from "./simulate-starter-sid-recovery";
import {newStarterGuide,searchStarter,creationMoves} from "../src/core/starterGuide";
import {routeCheckpoint,starterPlaintext} from "../src/core/starterRoute";
import {projectStarterJourney} from "../src/core/starterJourney";
import {makeHypothesis} from "../src/core/sid";
import {maxPp} from "../src/core/pp";
import {STARTER_ITEM_IDS} from "../src/core/starterItems";
import {calculateStat} from "../src/core/stats";
import {speciesTraits} from "../src/core/traits";
import {SUBSTRUCT_POSITIONS} from "../src/core/pokemon";

const study=JSON.parse(fs.readFileSync("research/starter-sid-recovery-simulation.json","utf8"));
const stalls=JSON.parse(fs.readFileSync("research/starter-sid-stall-audit.json","utf8"));
const speciesIds:Record<string,number>={Treecko:277,Torchic:280,Mudkip:283};
const moveSets:Record<number,number[][]>={277:[[1,43,71,0],[1,43,71,15],[1,43,71,331],[1,43,71,98]],280:[[10,45,116,0],[10,45,116,15],[10,45,116,52]],283:[[33,45,189,0],[33,45,189,55]]};
const cache=new Map<string,{masks:number[];moves:number[]}[]>();
const identifiability=new Map<string,boolean>();
function unique(species:number,advance:number) {
  const key=`${species}/${advance}`;if(identifiability.has(key))return identifiability.get(key)!;
  const actual=oracleStarter(advance),traits=speciesTraits(species)!;
  const s=newStarterGuide();s.species=species;s.moves=creationMoves(species);s.starter={first:5,second:20,uncertainty:60,offset:0,calibration:0};
  s.nature=String(actual.pid%25);s.gender=(actual.pid&255)<31?"female":"male";s.ability=String(traits.abilities[0].id);
  s.readings=[{id:"stats",evs:[0,0,0,1,0,0],summary:{level:5,stats:actual.ivs.map((iv,i)=>calculateStat(traits.summaryBaseStats[i],iv,i===3?1:0,5,i,actual.pid%25))}}];
  const found=searchStarter(s);assert.ok(found.some(e=>e.pid===actual.pid));
  identifiability.set(key,found.length===1);return found.length===1;
}
function catalogue(species:number,advance:number,budget:number) {
  const key=`${species}/${advance}/${budget}`;if(cache.has(key))return cache.get(key)!;
  const actual=oracleStarter(advance),s=newStarterGuide();s.species=species;s.moves=creationMoves(species);
  s.battles=projectStarterJourney(s).battles;
  const base=routeCheckpoint(s),evs=base.evs as number[],h={...makeHypothesis(actual.pid,0,0),rng:{ivs:actual.ivs,abilitySlot:0}};
  const result=moveSets[species].map(moves=>{
    const facts={...base,pid:actual.pid,ivs:actual.ivs,moves,pp:moves.map(m=>m?maxPp(m,0)!:0),heldItem:0};
    const plain=starterPlaintext(facts,h),masks=[1,1,1,1]; // SID header tests zero.
    const add=(digit:number,value:number)=>masks[digit]|=1<<(value^((actual.pid>>>((digit+4)*4))&15));
    const addWord=(value:number)=>{for(let n=0;n<4;n++)add(n,(value>>>(n*4))&15);};
    for(let n=0;n<96;n++)if(n%8>=4&&plain[n]&&!(plain[n]&(plain[n]-1)))add(n%8-4,Math.log2(plain[n]));
    // Any occupied move can be swapped into slot 2; into slot 4 if occupied.
    for(const m of moves.filter(Boolean))addWord(m);
    for(const slot of [2,3])if(moves[slot])for(const m of moves.filter(Boolean)) {
      const pp=maxPp(m,0)!;const digit=slot===2?0:2;add(digit,pp&15);add(digit+1,pp>>>4);
    }
    // Teaching TM09 consumes it; it cannot also be used as a held item.
    for(const item of [0,...STARTER_ITEM_IDS])if(!(moves.includes(331)&&item===297))addWord(item);
    // The guaranteed catalogue trains in increments of one EV, monotonically.
    // It uses at most `budget` additional EVs PER STAT, up to 2*budget battles.
    for(const stat of [2,3])for(let extra=1;extra<=budget;extra++) {
      const value=evs[stat]+extra,digit=(stat-2)*2;add(digit,value&15);add(digit+1,value>>>4);
    }
    return{moves,masks};
  });cache.set(key,result);return result;
}
function groups(sids:number[],masks:number[]) {
  const map=new Map<string,number[]>();
  for(const sid of sids){let key="";for(let n=0;n<4;n++){const digit=(sid>>>(n*4))&15;key+=masks[n]&(1<<digit)?digit.toString(16):"x";}const group=map.get(key)??[];group.push(sid);map.set(key,group);}
  return[...map.values()];
}
const worldSids=new Map<number,number[]>();
for(const row of study.rows){if(worldSids.has(row.trial))continue;const tid=row.tid;let state=BigInt(tid);const sids=new Set<number>();for(let n=1;n<=1305;n++){state=(state*0x41c64e6dn+0x6073n)&0xffffffffn;if(n>=1185)sids.add(Number(state>>16n));}worldSids.set(row.trial,[...sids]);}
const results:any[]=[];
for(const budget of [0,4,8])for(const [name,species]of Object.entries(speciesIds)) {
  let originalSafe=0,anySafeWorlds=0;const probabilities:number[]=[],examples:any[]=[];
  for(let trial=1;trial<=100;trial++) {
    const sids=worldSids.get(trial)!;const row=study.rows.find((r:any)=>r.trial===trial&&r.species===name)!;
    const safe=(advance:number)=>catalogue(species,advance,budget).some(c=>groups(sids,c.masks).every(g=>g.length===1));
    if(safe(row.starter.advance))originalSafe++;
    const advances=[];for(let a=1135;a<=1255;a++)if(unique(species,a)&&safe(a))advances.push(a);
    if(advances.length)anySafeWorlds++;probabilities.push(advances.length/121);
    if(examples.length<3)examples.push({trial,eligibleAdvances:advances.length,first:advances[0]});
  }
  const summary={starter:name,additionalEVsPerStat:budget,maximumExtraBattles:budget*2,originalSafe,anySafeWorlds,meanEligibleProbability:probabilities.reduce((a,b)=>a+b,0)/100,
    meanAttemptsFromReset:probabilities.some(p=>!p)?null:probabilities.reduce((a,p)=>a+1/p,0)/100,worstEligibleProbability:Math.min(...probabilities),examples};results.push(summary);console.log(JSON.stringify(summary));
}
const heavyCases=stalls.rows.filter((r:any)=>r.steps.some((s:any)=>s.lastResort)).map((failure:any)=>{
  const row=study.rows.find((r:any)=>r.trial===failure.trial&&r.species===failure.species)!;
  const sets=catalogue(speciesIds[row.species],row.starter.advance,8);
  return{trial:row.trial,starter:row.species,cheapTestStillSeparatesFinalSet:sets.some(c=>groups(row.finalSids,c.masks).every(g=>g.length===1))};
});
fs.writeFileSync("research/starter-low-ev-screen.json",JSON.stringify({scope:"Conservative catalogue feasibility, not a rerun of the actual UI or an optimized experiment tree",assumptions:["Same 100 TID/SID candidate windows","Fixed feasible move set at level 6–11, occupied-slot swaps, all early held items","No IV/PID or true SID supplied to the screen; known PID/IVs come from unique level-5 search","Checksum and unknown nuisance fields excluded","EV cap is per stat, ordinary +1 training, monotonic targets; no vitamins","Pass means every candidate SID has a distinct joint binary pattern across the allowed catalogue; it does not bound the number of item tests"],results,heavyCases},null,2)+"\n");
