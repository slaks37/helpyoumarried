import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const script=await readFile(new URL('../public/wedding-motion.js',import.meta.url),'utf8');
function setup({observer=true,reduced=false}={}){
 const events={},frames=new Map(),timers=new Map();let next=0,observe;
 function node(top=300,height=300){
  const classes=new Set(),values=new Map();return {dataset:{},hidden:false,isConnected:true,inert:false,
   classList:{add(...names){names.forEach(n=>classes.add(n));},remove(...names){names.forEach(n=>classes.delete(n));},contains:n=>classes.has(n),toggle(n,on){if(on)classes.add(n);else classes.delete(n);}},
   style:{setProperty:(key,value)=>values.set(key,value),getPropertyValue:key=>values.get(key)},
   focus(){},addEventListener(){},matches(){return false;},getBoundingClientRect:()=>({top,height})};
 }
 const hero=node(),gallery=node(500),heading=node(),gate=node(),button=node(),body=node(),main=node();
 gate.querySelectorAll=()=>[button];
 const photos=[hero,gallery];
 const document={body,hidden:false,querySelector:selector=>selector==='#music-gate'?gate:selector==='.hero-visual'?hero:button,
  querySelectorAll:selector=>selector.startsWith('header')?[main]:selector==='.living-photo'?photos:selector.startsWith('.reveal')?[heading]:photos,
  addEventListener:(name,callback)=>{events[name]=callback;}};
 const reduce={matches:reduced,addEventListener:(name,callback)=>{events.reduce=callback;}};
 const window={innerHeight:800,scrollTo(){},addEventListener:(name,callback)=>{events[name]=callback;}};
 const context={document,window,matchMedia:query=>query.includes('reduced')?reduce:{matches:false},
  requestAnimationFrame:fn=>{const id=++next;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
  setTimeout:fn=>{const id=++next;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)};
 if(observer){context.IntersectionObserver=class {constructor(callback){observe=callback;}observe(){}};window.IntersectionObserver=context.IntersectionObserver;}
 runInNewContext(script,context);
 return {events,frames,timers,hero,gallery,heading,gate,body,main,window,reduce,
  intersect(target,visible){observe([{target,isIntersecting:visible}]);},
  flush(){for(const [id,fn]of [...frames]){frames.delete(id);fn();}}};
}

test('opening releases the invitation, unrolls the hero and reveals only reached content',()=>{
 const s=setup();assert.equal(s.main.inert,true);
 assert.equal(s.heading.classList.contains('is-visible'),false);
 s.window.openWeddingMotion();assert.equal(s.gate.hidden,false);
 [...s.timers.values()][0]();
 assert.equal(s.gate.hidden,true);assert.equal(s.main.inert,false);
 assert.equal(s.hero.classList.contains('hero-unrolling'),true);
 s.intersect(s.heading,true);assert.equal(s.heading.classList.contains('is-visible'),true);
 s.intersect(s.gallery,true);s.flush();
 assert.equal(s.gallery.classList.contains('photo-awake'),true);
 assert.equal(s.gallery.style.getPropertyValue('--photo-parallax'),'-9.4px');
 s.intersect(s.gallery,false);assert.equal(s.gallery.classList.contains('photo-awake'),false);
});

test('parallax resumes after a history restoration and works without IntersectionObserver',()=>{
 const s=setup({observer:false});assert.equal(s.gallery.classList.contains('photo-awake'),true);
 s.events.scroll();assert.equal(s.frames.size,1);
 s.events.pagehide();assert.equal(s.frames.size,0);
 s.events.pageshow();assert.equal(s.frames.size,1);s.flush();
 assert.equal(s.gallery.style.getPropertyValue('--photo-parallax'),'-9.4px');
});

test('reduced motion opens immediately and cancels scroll movement',()=>{
 const s=setup({reduced:true});s.window.openWeddingMotion();
 assert.equal(s.gate.hidden,true);assert.equal(s.main.inert,false);
 s.events.scroll();assert.equal(s.frames.size,0);
 s.events.reduce();assert.equal(s.gallery.style.getPropertyValue('--photo-parallax'),'0px');
});
