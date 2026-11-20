// Only sections that remain visibly on screen count as reached; jumping past them does not.
window.weddingReadingSample=({boxes,viewportHeight,pageHeight,scrollTop})=>{
 const visible=boxes.map((box,index)=>({index,overlap:Math.max(0,Math.min(box.bottom,viewportHeight)-Math.max(box.top,0)),threshold:Math.min(120,box.height*.3)})).filter(box=>box.overlap>=box.threshold&&box.overlap>0);
 visible.sort((a,b)=>b.overlap-a.overlap);
 return {depth:Math.min(100,Math.max(0,Math.round((scrollTop+viewportHeight)/Math.max(pageHeight,viewportHeight)*100))),visible:visible.map(box=>box.index)};
};
