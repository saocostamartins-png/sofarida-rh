'use strict';
function renderExportControls(){
  const allowed=Boolean(state.session&&state.view==='data'&&RHExport.allowed(state.profile,state.area[0])&&canAccessArea(state.area[0]));
  $('export-controls').hidden=!allowed;
  for(const id of ['export-excel','export-csv'])$(id).disabled=!allowed||!state.complete||state.loading||!state.filtered.length;
  if(!allowed||!state.complete)$('export-status').textContent='';
}
function exportRows(type){
  const area=state.area[0];
  if(!state.session||state.view!=='data'||!canAccessArea(area)||!RHExport.allowed(state.profile,area)||!state.complete||state.loading||!state.filtered.length)return;
  try{
    let matrix;
    const summary=$('export-kind').value==='summary';
    if(summary){
      const metric=area==='disponibilidade'?'__dias':area==='horas_domingos_feriados'?'horas_arredondadas':$('metric').value;
      const groups=RHDomain.aggregate(area,state.filtered,metric).groups;
      const countLabel=area==='disponibilidade'?'Dias de disponibilidade':'Registos';
      const withMetric=metric&&area!=='disponibilidade';
      matrix=[['Número do colaborador','Colaborador','Farmácia/Departamento',countLabel,...(withMetric?[label(metric)]:[])],...groups.map(g=>[g.id,g.name,g.teams.join(', '),area==='disponibilidade'?g.total:g.count,...(withMetric?[g.known?g.total:null]:[])])];
    }else{
      const detail=RHExport.detail(area,state.filtered,A.person);
      const columns=[...new Set(detail.flatMap(Object.keys))].filter(c=>!state.hidden.has(c)||area==='disponibilidade'||c==='horas_arredondadas');
      matrix=[columns.map(label),...detail.map(row=>columns.map(c=>{const v=row[c];return v==null?null:typeof v==='object'?JSON.stringify(v):typeof v==='boolean'?(v?'Sim':'Não'):v;}))];
    }
    if(matrix.length===1){$('export-status').textContent='Sem dados para exportar com os filtros atuais.';return;}
    const filename='sofarida-'+area.replaceAll('_','-')+'-'+(summary?'resumo':'detalhe')+'-'+D.today();
    if(type==='xlsx'){
      if(typeof XLSX==='undefined')throw new Error('A exportação Excel não está disponível. Atualize a página ou escolha CSV.');
      const sheet=XLSX.utils.aoa_to_sheet(matrix);const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,summary?'Resumo':'Registos');XLSX.writeFile(book,filename+'.xlsx');
    }else{
      const blob=new Blob([RHExport.csv(matrix)],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);
      const link=document.createElement('a');link.href=url;link.download=filename+'.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    $('export-status').textContent=format(matrix.length-1)+' linhas preparadas para descarregar.';
  }catch(error){$('export-status').textContent=error.message||'Não foi possível exportar os registos.';}
}
$('export-excel').addEventListener('click',()=>exportRows('xlsx'));
$('export-csv').addEventListener('click',()=>exportRows('csv'));

function mobileMenu(open){$('portal').classList.toggle('mobile-menu-open',open);$('mobile-menu').setAttribute('aria-expanded',String(open));}
$('mobile-menu').addEventListener('click',()=>mobileMenu($('mobile-menu').getAttribute('aria-expanded')!=='true'));
$('navigation').addEventListener('click',event=>{if(event.target.closest('button')){mobileMenu(false);if(window.matchMedia('(max-width:760px)').matches)window.scrollTo(0,0);}});
$('signout').addEventListener('click',()=>mobileMenu(false));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('mobile-menu').getAttribute('aria-expanded')==='true'){mobileMenu(false);$('mobile-menu').focus();}});
let installPrompt;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
window.addEventListener('appinstalled',()=>{$('install-app').hidden=true;$('install-help').hidden=true;installPrompt=null;});
if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone)$('install-app').hidden=true;
$('install-app').addEventListener('click',async()=>{
  if(installPrompt){const prompt=installPrompt;installPrompt=null;try{await prompt.prompt();return;}catch{}}
  $('install-help').textContent='No iPhone, abra no Safari e toque em Partilhar → Adicionar ao ecrã principal. No Android, abra no Chrome e toque no menu ⋮ → Instalar aplicação ou Adicionar ao ecrã principal.';$('install-help').hidden=!$('install-help').hidden;
});
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
