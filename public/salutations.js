const WEDDING_SALUTATIONS={
 bapak:{id:['Bapak'],en:['Mr.']},
 ibu:{id:['Ibu'],en:['Mrs.']},
 saudara:{id:['Saudara'],en:['Mr.']},
 saudari:{id:['Saudari'],en:['Ms.']},
 bapak_ibu:{id:['Bapak','Ibu'],en:['Mr.','Mrs.']},
 tuan_nyonya:{id:['Tuan','Nyonya'],en:['Mr.','Mrs.']}
};
const stripWeddingTitle=name=>String(name||'').trim().replace(/^(?:(?:Bapak|Ibu|Tuan|Nyonya|Saudara|Saudari|Pak|Bu|Mr\.|Mrs\.|Ms\.)\s+)+/i,'').trim();
window.weddingDisplayName=(invitation,language='id')=>{
 const name=String(invitation?.guestName||'').trim();
 const titles=WEDDING_SALUTATIONS[invitation?.salutation]?.[language];
 if(!titles)return name;
 if(titles.length===1)return `${titles[0]} ${stripWeddingTitle(name)}`.trim();
 const pair=name.match(/^(.+?)\s+(?:&|dan|and)\s+(.+)$/i);
 if(pair)return `${titles[0]} ${stripWeddingTitle(pair[1])} & ${titles[1]} ${stripWeddingTitle(pair[2])}`;
 return `${titles[0]} & ${titles[1]} ${stripWeddingTitle(name)}`.trim();
};
window.weddingAddress=invitation=>{
 const titles=WEDDING_SALUTATIONS[invitation?.salutation]?.id;
 return titles?.join(' dan ')||'Saudara/Saudari';
};
