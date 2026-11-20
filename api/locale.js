// This Vercel Function sees the visitor's country before the /api/* origin rewrite.
// We return only the language, never the visitor's IP address.
export function GET(request){
 const country=request.headers.get('x-vercel-ip-country');
 const language=country==='ID'?'id':/^[A-Z]{2}$/.test(country||'')?'en':'id';
 return Response.json({language},{headers:{'Cache-Control':'private, no-store','Vary':'X-Vercel-IP-Country','X-Content-Type-Options':'nosniff'}});
}
