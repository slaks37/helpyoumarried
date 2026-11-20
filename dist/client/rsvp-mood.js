const weather=document.querySelector('#rsvp-weather');
const resultDialog=document.querySelector('#rsvp-result');
const closeResult=document.querySelector('#close-rsvp-result');
const happyCopy=document.querySelector('#rsvp-result-happy');
const sadCopy=document.querySelector('#rsvp-result-sad');
const resultSymbol=document.querySelector('#rsvp-result-symbol');
const moodMotion=window.matchMedia('(prefers-reduced-motion: reduce)');

function moodFromResponses(responses){
 if(!Array.isArray(responses)||!responses.length)return 'neutral';
 return responses.some(response=>response.status==='attending')?'happy':'sad';
}

function paintMood(mood){
 weather.replaceChildren();
 weather.dataset.mood=mood;
 document.body.dataset.rsvpMood=mood;
 if(mood==='neutral'||moodMotion.matches)return;
 const count=mood==='happy'?38:34;
 for(let index=0;index<count;index++){
  const piece=document.createElement('span');
  piece.className=mood==='happy'?'rsvp-confetti':'rsvp-raindrop';
  if(mood==='happy')piece.textContent=['✿','✦','♡','✧','❀'][index%5];
  piece.style.setProperty('--x',`${(index*.61803398875%1)*100}%`);
  piece.style.setProperty('--delay',`${-(index*1.43%19)}s`);
  piece.style.setProperty('--duration',`${mood==='happy'?11+index%8:2.5+index%5*.5}s`);
  piece.style.setProperty('--drift',`${((index*37)%95)-47}px`);
  piece.style.setProperty('--size',`${mood==='happy'?13+index%7*3:38+index%6*9}px`);
  weather.append(piece);
 }
}

window.setWeddingMood=function(responses,showMessage=false){
 const mood=moodFromResponses(responses);
 paintMood(mood);
 if(!showMessage||mood==='neutral')return;
 happyCopy.hidden=mood!=='happy';
 sadCopy.hidden=mood!=='sad';
 resultDialog.setAttribute('aria-labelledby',mood==='happy'?'rsvp-result-title':'rsvp-result-sad-title');
 resultDialog.dataset.mood=mood;
 resultSymbol.textContent=mood==='happy'?'✿ ✦ ♡':'☂';
 if(!resultDialog.open)resultDialog.showModal();
 closeResult.focus();
};

document.querySelector('#rsvp-result-wishes-btn').addEventListener('click',()=>{resultDialog.close();document.querySelector('#pesan').scrollIntoView({behavior:moodMotion.matches?'instant':'smooth'});});
closeResult.addEventListener('click',()=>resultDialog.close());
resultDialog.addEventListener('click',event=>{if(event.target===resultDialog)resultDialog.close();});
moodMotion.addEventListener('change',()=>paintMood(document.body.dataset.rsvpMood||'neutral'));
