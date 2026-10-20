const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>4Justice Board</title><style>body{margin:0;background:#09090b;color:white;font-family:Arial,sans-serif}main{max-width:850px;margin:auto;padding:28px 18px}h1{text-align:center;font-size:48px;color:#d8c8ff}section{background:#17131f;border:1px solid #7251aa;border-radius:18px;padding:20px;margin:18px 0}input,textarea,button{width:100%;box-sizing:border-box;padding:14px;margin:7px 0 13px;border-radius:10px;font-size:16px}input,textarea{background:#0e0b13;color:white;border:1px solid #7251aa}button{background:#8b5cf6;color:white;border:0;font-weight:bold;cursor:pointer}.names{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.name{background:#0e0b13;border:1px solid #49336d;border-radius:10px;padding:14px;text-align:center;font-weight:bold}.tag{text-align:center;color:#d8c8ff;font-weight:bold}.status{text-align:center}</style></head><body><main><div class="tag">WE MAKE PEACE AND EXPOSE HATE</div><h1>4JUSTICE BOARD</h1><section><h2>Submit a name for review</h2><form id="f"><input name="name" maxlength="120" required placeholder="Person's name"><input name="submitter" maxlength="120" placeholder="Your name (optional)"><input name="email" type="email" maxlength="200" placeholder="Your email (optional)"><textarea name="details" maxlength="1500" placeholder="Why should they be added? (optional)"></textarea><button>Submit to 4Justice</button><div id="s" class="status" role="status"></div></form></section><section><h2>Lives Remembered</h2><div id="n" class="names"></div></section></main><script>const e=s=>String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));async function load(){try{let r=await fetch("/api/submissions"),d=await r.json(),n=document.querySelector("#n");if(!r.ok)throw Error();n.innerHTML=d.map(x=>'<div class="name">'+e(x.name)+'</div>').join("")||"No approved names yet."}catch{document.querySelector("#n").textContent="Unable to load approved names."}}document.querySelector("#f").onsubmit=async a=>{a.preventDefault();let s=document.querySelector("#s");try{let r=await fetch("/api/submissions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(a.target)))}),d=await r.json();s.textContent=r.ok?"Submitted for review. Thank you.":d.error||"Submission failed.";if(r.ok)a.target.reset()}catch{s.textContent="Submission failed. Please try again."}};load()</script></body></html>`;
const J=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"}});
const page=(message,status=200)=>new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>4Justice Review</title></head><body style="font:18px Arial;background:#09090b;color:white;text-align:center;padding:40px"><h1>4Justice Board</h1><p>${message}</p></body></html>`,{status,headers:{"content-type":"text/html;charset=utf-8","cache-control":"no-store","referrer-policy":"no-referrer"}});
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
async function hash(s){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))))}
function token(){return hex(crypto.getRandomValues(new Uint8Array(32)))}
async function sendEmail(env,submission,approve,reject,origin){
 const text=`New 4Justice submission awaiting your review.\n\nName: ${submission.name}\nSubmitted by: ${submission.submitter||"Not provided"}\nSubmitter email: ${submission.email||"Not provided"}\nDetails: ${submission.details||"Not provided"}\n\nApprove (link expires in 7 days): ${origin}/review?token=${approve}\n\nReject (link expires in 7 days): ${origin}/review?token=${reject}\n\nOpening a link shows a confirmation page. A separate confirmation is required to apply your decision. Do not forward this email.`;
 const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({from:env.FROM_EMAIL,to:[env.NOTIFY_EMAIL],subject:`4Justice approval requested: ${submission.name}`,text})});
 if(!response.ok)throw new Error(`Email provider error ${response.status}`);
}
export default {async fetch(request,env,ctx){
 const u=new URL(request.url),path=u.pathname;
 if(request.method==="GET"&&path==="/")return new Response(HTML,{headers:{"content-type":"text/html;charset=UTF-8","x-content-type-options":"nosniff"}});
 if(!env.DB)return J({error:"Database binding DB is missing."},503);
 if(request.method==="GET"&&path==="/api/submissions"){
  try{const {results}=await env.DB.prepare("SELECT id,name,created_at FROM submissions WHERE status = 'approved' ORDER BY id DESC LIMIT 500").all();return J(results||[])}catch{return J({error:"Database is not ready."},503)}
 }
 if(request.method==="POST"&&path==="/api/submissions"){
  if(!env.RESEND_API_KEY||!env.FROM_EMAIL||!env.NOTIFY_EMAIL)return J({error:"Submission notifications are not configured. Please try later."},503);
  let b;try{b=await request.json()}catch{return J({error:"Invalid submission."},400)}
  if(!b||typeof b!=="object"||Array.isArray(b))return J({error:"Invalid submission."},400);
  const x={name:String(b.name||"").trim().slice(0,120),submitter:String(b.submitter||"").trim().slice(0,120),email:String(b.email||"").trim().slice(0,200),details:String(b.details||"").trim().slice(0,1500)};
  if(!x.name)return J({error:"Please enter a name."},400);
  const a=token(),r=token(),expiry=Math.floor(Date.now()/1000)+7*86400;
  try{
   const result=await env.DB.prepare("INSERT INTO submissions (name,submitter,email,details,status) VALUES (?,?,?,?,'pending')").bind(x.name,x.submitter,x.email,x.details).run();
   const id=result.meta.last_row_id;
   await env.DB.batch([
    env.DB.prepare("INSERT INTO approval_tokens(token_hash,submission_id,decision,expires_at) VALUES (?,?,?,?)").bind(await hash(a),id,"approved",expiry),
    env.DB.prepare("INSERT INTO approval_tokens(token_hash,submission_id,decision,expires_at) VALUES (?,?,?,?)").bind(await hash(r),id,"rejected",expiry)
   ]);
   await sendEmail(env,x,a,r,u.origin);
   return J({ok:true,message:"Submitted for review."},201);
  }catch(e){console.error("Submission or notification error",e);return J({error:"Submission could not be completed. Please contact 4Justice if the problem continues."},503)}
 }
 if(path==="/review"&&(request.method==="GET"||request.method==="POST")){
  const raw=u.searchParams.get("token")||"";
  if(!/^[0-9a-f]{64}$/.test(raw))return page("Invalid approval link.",400);
  const tokenHash=await hash(raw),now=Math.floor(Date.now()/1000);
  try{
   const record=await env.DB.prepare("SELECT t.submission_id,t.decision,t.expires_at,t.used_at,s.name,s.status FROM approval_tokens t JOIN submissions s ON s.id=t.submission_id WHERE t.token_hash=?").bind(tokenHash).first();
   if(!record||record.used_at||record.expires_at<now||record.status!=="pending")return page("This approval link has expired or has already been used.",410);
   if(request.method==="GET"){
    const decision=record.decision==="approved"?"Approve":"Reject";
    const safeName=record.name.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"></head><body style="font:18px Arial;background:#09090b;color:white;text-align:center;padding:40px"><h1>4Justice Review</h1><p>${decision} submission for <strong>${safeName}</strong>?</p><form method="POST"><button style="padding:16px;background:#8b5cf6;color:white;border:0;border-radius:10px;font-size:18px">Confirm ${decision}</button></form></body></html>`,{headers:{"content-type":"text/html;charset=utf-8","cache-control":"no-store","referrer-policy":"no-referrer"}});
   }
   const update=await env.DB.prepare("UPDATE submissions SET status=? WHERE id=? AND status='pending' AND EXISTS (SELECT 1 FROM approval_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>=?)").bind(record.decision,record.submission_id,tokenHash,now).run();
   if(!update.meta.changes)return page("This submission has already been reviewed.",409);
   await env.DB.prepare("UPDATE approval_tokens SET used_at=? WHERE submission_id=? AND used_at IS NULL").bind(now,record.submission_id).run();
   return page(record.decision==="approved"?"Approved. The name is now on the public board.":"Rejected. The name will not appear on the public board.");
  }catch(e){console.error("Review error",e);return page("Review is temporarily unavailable.",503)}
 }
 return new Response("Not found",{status:404});
}};
