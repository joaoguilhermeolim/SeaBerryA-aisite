import { randomBytes } from "node:crypto";

import {
  adminAuthFailure,
  authorizeAdmin,
  createCsrfToken,
  textResponse,
} from "./recruitment.mjs";

export default async function handler(request) {
  if (request.method !== "GET") {
    return textResponse("MÃ©todo nÃ£o permitido.", 405, { allow: "GET" });
  }
  const authorization = authorizeAdmin(request);
  if (!authorization.ok) return adminAuthFailure(authorization.status);

  const nonce = randomBytes(18).toString("base64url");
  const csrfToken = createCsrfToken(
    authorization.config.username,
    authorization.config.csrfSecret,
  );
  const html = renderAdminPage(csrfToken, nonce);
  return textResponse(html, 200, {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": `default-src 'none'; base-uri 'none'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'`,
    "permissions-policy": "camera=(), geolocation=(), microphone=()",
    "x-frame-options": "DENY",
  });
}

function renderAdminPage(csrfToken, nonce) {
  return `<!doctype html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Candidaturas | Sea Berry</title>
  <style nonce="${nonce}">
    :root{color-scheme:light;--ink:#16251e;--muted:#637068;--paper:#f5f2e8;--card:#fff;--green:#123f2b;--lime:#c7e34a;--line:#d9ddd5;--danger:#a5382b;--shadow:0 14px 40px rgba(20,46,32,.09)}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,input,select{font:inherit}button,a,select{touch-action:manipulation}
    .shell{width:min(1440px,calc(100% - 32px));margin:0 auto;padding:32px 0 56px}.topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:24px}.eyebrow{margin:0 0 6px;color:var(--green);font-size:.75rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase}h1{margin:0;font-family:Georgia,serif;font-size:clamp(2rem,5vw,3.4rem);font-weight:500;line-height:1}.topbar p:last-child{margin:10px 0 0;color:var(--muted)}
    .public-link{display:inline-flex;align-items:center;min-height:42px;padding:0 17px;border:1px solid var(--green);border-radius:999px;color:var(--green);font-weight:750;text-decoration:none;white-space:nowrap}.public-link:hover{background:var(--green);color:#fff}
    .summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.stat{padding:18px 20px;background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow)}.stat span{display:block;color:var(--muted);font-size:.78rem;font-weight:750;text-transform:uppercase;letter-spacing:.08em}.stat strong{display:block;margin-top:5px;font-size:1.75rem}.stat.new{background:var(--green);border-color:var(--green);color:#fff}.stat.new span{color:#d4e4d9}
    .toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 220px auto auto;gap:10px;padding:14px;margin-bottom:16px;background:var(--card);border:1px solid var(--line);border-radius:16px}.control{min-height:44px;padding:0 13px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink)}.control:focus{outline:3px solid rgba(199,227,74,.5);border-color:var(--green)}.button{min-height:44px;padding:0 16px;border:0;border-radius:10px;background:var(--green);color:#fff;font-weight:800;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.button.secondary{background:#e8ede7;color:var(--green)}.button:hover{filter:brightness(.94)}.button:disabled{cursor:wait;opacity:.6}
    .notice{min-height:24px;margin:0 0 10px;color:var(--muted);font-size:.9rem}.notice.error{color:var(--danger);font-weight:700}.table-card{overflow:hidden;background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow)}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:1120px}th{padding:13px 14px;background:#eef1eb;color:#526057;font-size:.72rem;letter-spacing:.07em;text-align:left;text-transform:uppercase;position:sticky;top:0;z-index:1}td{padding:15px 14px;border-top:1px solid #eceee9;vertical-align:top;font-size:.9rem}tbody tr:hover{background:#fbfcf8}.date{white-space:nowrap;color:var(--muted)}.candidate strong{display:block;font-size:.98rem}.candidate a{display:block;margin-top:5px;color:var(--green);word-break:break-word}.modes{display:flex;flex-wrap:wrap;gap:5px}.tag{padding:4px 7px;border-radius:999px;background:#edf2e8;color:#36533e;font-size:.72rem;font-weight:700}.message{max-width:360px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.42}.status-select{min-width:145px;padding:8px;border:1px solid var(--line);border-radius:8px;background:#fff}.empty{padding:50px 24px;text-align:center;color:var(--muted)}
    .pagination{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px;border-top:1px solid var(--line)}.pagination span{color:var(--muted);font-size:.88rem}.pagination-actions{display:flex;gap:8px}.small-button{min-height:38px;padding:0 13px;border:0;border-radius:9px;background:#e8ede7;color:var(--green);font-weight:750;cursor:pointer}.small-button:disabled{opacity:.42;cursor:not-allowed}.footnote{margin:16px 2px 0;color:var(--muted);font-size:.8rem}
    @media(max-width:900px){.summary{grid-template-columns:repeat(2,1fr)}.toolbar{grid-template-columns:1fr 1fr}.topbar{flex-direction:column}.public-link{align-self:flex-start}}
    @media(max-width:560px){.shell{width:min(100% - 20px,1440px);padding-top:20px}.summary,.toolbar{grid-template-columns:1fr}.stat{padding:14px 16px}.toolbar .button{width:100%}}
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div><p class="eyebrow">Sea Berry Â· GestÃ£o protegida</p><h1>Candidaturas</h1><p>Pesquisa, acompanha o estado e exporta os registos ativos.</p></div>
      <a class="public-link" href="/recrutamento/">Ver pÃ¡gina pÃºblica</a>
    </header>
    <section class="summary" aria-label="Resumo">
      <article class="stat"><span>Total ativo</span><strong id="total-count">â€”</strong></article>
      <article class="stat new"><span>Novas</span><strong id="new-count">â€”</strong></article>
      <article class="stat"><span>Em anÃ¡lise</span><strong id="review-count">â€”</strong></article>
      <article class="stat"><span>Contactadas</span><strong id="contacted-count">â€”</strong></article>
    </section>
    <form class="toolbar" id="filters">
      <input class="control" id="query" name="q" type="search" maxlength="120" placeholder="Pesquisar nome, email, telefoneâ€¦" aria-label="Pesquisar candidaturas">
      <select class="control" id="status-filter" name="status" aria-label="Filtrar por estado">
        <option value="all">Todos os estados</option><option value="new">Nova</option><option value="in_review">Em anÃ¡lise</option><option value="contacted">Contactada</option><option value="hired">Contratada</option><option value="rejected">NÃ£o selecionada</option><option value="archived">Arquivada</option>
      </select>
      <button class="button secondary" id="refresh" type="button">Atualizar</button>
      <a class="button" id="export" href="/recrutamento/api/admin/export.csv">Exportar CSV</a>
    </form>
    <p class="notice" id="notice" role="status" aria-live="polite"></p>
    <section class="table-card" aria-label="Lista de candidaturas">
      <div class="table-wrap"><table><thead><tr><th>Recebida</th><th>Candidata/o</th><th>Modalidade</th><th>Mensagem</th><th>Estado</th></tr></thead><tbody id="applications"></tbody></table></div>
      <div class="empty" id="empty" hidden>Nenhuma candidatura corresponde aos filtros.</div>
      <footer class="pagination"><span id="page-summary">A carregarâ€¦</span><div class="pagination-actions"><button class="small-button" id="previous" type="button">Anterior</button><button class="small-button" id="next" type="button">Seguinte</button></div></footer>
    </section>
    <p class="footnote">As candidaturas sÃ£o eliminadas automaticamente apÃ³s 90 dias. O histÃ³rico mÃ­nimo de alteraÃ§Ãµes de estado Ã© eliminado apÃ³s 180 dias.</p>
  </main>
  <script nonce="${nonce}">
    (() => {
      "use strict";
      const csrfToken = "${csrfToken}";
      const statusLabels = {new:"Nova",in_review:"Em anÃ¡lise",contacted:"Contactada",hired:"Contratada",rejected:"NÃ£o selecionada",archived:"Arquivada"};
      const modeLabels = {"part-time-weekend":"Part-time fim de semana","full-time":"Full-time","part-time-weekdays":"Part-time dias Ãºteis"};
      const state = {page:1,limit:50,q:"",status:"all",loading:false};
      const tbody = document.querySelector("#applications");
      const empty = document.querySelector("#empty");
      const notice = document.querySelector("#notice");
      const exportLink = document.querySelector("#export");
      const formatDate = (value) => { try { return new Intl.DateTimeFormat("pt-PT",{dateStyle:"short",timeStyle:"short"}).format(new Date(value)); } catch { return value || "â€”"; } };
      const element = (tag,className,text) => { const node=document.createElement(tag); if(className)node.className=className; if(text!==undefined)node.textContent=text; return node; };
      const setNotice = (text,isError=false) => { notice.textContent=text; notice.className=isError?"notice error":"notice"; };
      const setLoading = (loading) => { state.loading=loading; document.querySelector("#refresh").disabled=loading; };
      const params = () => { const value=new URLSearchParams({page:String(state.page),limit:String(state.limit),status:state.status}); if(state.q)value.set("q",state.q); return value; };
      const updateExport = () => { const value=new URLSearchParams({status:state.status}); if(state.q)value.set("q",state.q); exportLink.href="/recrutamento/api/admin/export.csv?"+value; };
      function addApplication(application) {
        const row=document.createElement("tr");
        const date=element("td","date",formatDate(application.createdAt)); row.append(date);
        const candidate=element("td","candidate"); candidate.append(element("strong","",application.name));
        const email=element("a","",application.email); email.href="mailto:"+application.email; candidate.append(email);
        const phone=element("a","",application.phone); phone.href="tel:"+application.phone.replace(/[^+\\d]/g,""); candidate.append(phone); row.append(candidate);
        const modes=element("td","modes"); (application.workModes||[]).forEach((mode)=>modes.append(element("span","tag",modeLabels[mode]||mode))); row.append(modes);
        row.append(element("td","message",application.message));
        const statusCell=document.createElement("td"); const select=element("select","status-select"); select.setAttribute("aria-label","Estado de "+application.name);
        Object.entries(statusLabels).forEach(([value,label])=>{const option=element("option","",label); option.value=value; option.selected=application.status===value; select.append(option);});
        select.addEventListener("change",async()=>{const previous=application.status; select.disabled=true; setNotice("A guardar alteraÃ§Ã£oâ€¦"); try{const response=await fetch("/recrutamento/api/admin/applications/"+encodeURIComponent(application.id)+"/status",{method:"PATCH",headers:{"content-type":"application/json","x-csrf-token":csrfToken,"accept":"application/json"},body:JSON.stringify({status:select.value})}); const result=await response.json().catch(()=>({})); if(!response.ok)throw new Error(result.message||"NÃ£o foi possÃ­vel guardar."); application.status=select.value; setNotice("Estado atualizado."); await load();}catch(error){select.value=previous;setNotice(error.message||"NÃ£o foi possÃ­vel guardar.",true);}finally{select.disabled=false;}});
        statusCell.append(select); row.append(statusCell); tbody.append(row);
      }
      async function load() {
        if(state.loading)return; setLoading(true); setNotice("A carregar candidaturasâ€¦"); updateExport();
        try{const response=await fetch("/recrutamento/api/admin/applications?"+params(),{headers:{accept:"application/json"},cache:"no-store"}); const result=await response.json().catch(()=>({})); if(!response.ok)throw new Error(result.message||"NÃ£o foi possÃ­vel carregar."); tbody.replaceChildren(); result.items.forEach(addApplication); empty.hidden=result.items.length!==0;
          document.querySelector("#total-count").textContent=result.summary.total; document.querySelector("#new-count").textContent=result.summary.new||0; document.querySelector("#review-count").textContent=result.summary.in_review||0; document.querySelector("#contacted-count").textContent=result.summary.contacted||0;
          const pagination=result.pagination; document.querySelector("#page-summary").textContent=pagination.total+" resultado(s) Â· pÃ¡gina "+pagination.page+" de "+pagination.pages; document.querySelector("#previous").disabled=pagination.page<=1; document.querySelector("#next").disabled=pagination.page>=pagination.pages; setNotice("");
        }catch(error){setNotice(error.message||"NÃ£o foi possÃ­vel carregar.",true);}finally{setLoading(false);}
      }
      document.querySelector("#filters").addEventListener("submit",(event)=>{event.preventDefault();state.q=document.querySelector("#query").value.trim();state.status=document.querySelector("#status-filter").value;state.page=1;load();});
      document.querySelector("#query").addEventListener("search",()=>document.querySelector("#filters").requestSubmit());
      document.querySelector("#status-filter").addEventListener("change",()=>document.querySelector("#filters").requestSubmit());
      document.querySelector("#refresh").addEventListener("click",load);
      document.querySelector("#previous").addEventListener("click",()=>{if(state.page>1){state.page-=1;load();}});
      document.querySelector("#next").addEventListener("click",()=>{state.page+=1;load();});
      load();
    })();
  </script>
</body>
</html>`;
}

export const config = {
  path: "/recrutamento/admin",
};

