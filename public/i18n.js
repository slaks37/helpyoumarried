window.weddingLanguage='id';
const languageButton=document.querySelector('#language-toggle');
function setLanguage(language){window.weddingLanguage=language;document.documentElement.lang=language;languageButton.textContent=language==='id'?'EN':'ID';languageButton.setAttribute('aria-label',language==='id'?'Switch to English':'Ganti ke Bahasa Indonesia');window.dispatchEvent(new Event('wedding-language-change'));}
window.setWeddingLanguage=setLanguage;
window.revealWedding=()=>document.documentElement.classList.remove('locale-pending');
languageButton.addEventListener('click',()=>{const next=window.weddingLanguage==='id'?'en':'id',url=new URL(location.href);url.searchParams.set('lang',next);location.assign(url.href);});
const explicitLanguage=new URLSearchParams(location.search).get('lang');
window.weddingLocaleReady=(async()=>{
 if(explicitLanguage==='id'||explicitLanguage==='en'){setLanguage(explicitLanguage);return explicitLanguage;}
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);
 try{
  // Same-origin is essential: a reverse proxy must not replace the guest's country with its own.
  const response=await fetch('/api/locale',{credentials:'omit',cache:'no-store',signal:controller.signal});
  if(response.ok){const result=await response.json();if(result.language==='id'||result.language==='en'){setLanguage(result.language);return result.language;}}
 }catch{}finally{clearTimeout(timeout);}
 // A network outage cannot leave the invitation blank. Browser language is only a fallback.
 const fallback=navigator.languages?.some(value=>/^id(?:-|$)/i.test(value))?'id':'en';
 setLanguage(fallback);return fallback;
})();
window.weddingUi=(id,en)=>window.weddingLanguage==='en'?en:id;
window.weddingEventTitle=event=>window.weddingLanguage==='en'?(event.titleEn||{ceremony:'Holy Matrimony',reception:'Reception I',celebration:'Reception II'}[event.id]||event.title):event.title;
