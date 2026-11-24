'use strict';
// Publishable key only. All record access is enforced by Supabase RLS.
const API = 'https://sqospqqwywtzdvvdqpqc.supabase.co';
const KEY = 'sb_publishable_eixEM4NX8NOTNYvD3zGRdg_Hu5yFsUx';
const AREAS = [
  ['colaboradores_factorial','Colaboradores','◉','Dados dos colaboradores sincronizados com a Factorial.'],
  ['colaboradores','Dados internos','▤','Prazos de progressão e inscrição no seguro de saúde, calculados pela data de consulta.'],
  ['atrasos','Atrasos','◷','Consulte os atrasos face ao turno planeado.'],
  ['ausencias','Ausências','◌','Consulte as ausências da sua equipa.'],
  ['ferias','Férias','☼','Consulte os registos de férias.'],
  ['horas_extras','Horas extras','⊕','Consulte os registos de trabalho suplementar.'],
  ['horas_domingos_feriados','Domingos e feriados','▦','Horas arredondadas por colaborador em domingos e feriados, segundo a regra definida no Supabase.'],
  ['disponibilidade','Disponibilidade','◎','Número de dias de disponibilidade por colaborador. Marcadores 00:00–23:59 são excluídos.'],
  ['horas_formacao','Horas de formação','▱','Formação Factorial e horas adicionais carregadas por Excel.']
];
const $ = id => document.getElementById(id);
const A=RHAnalytics;
const D=RHDeadlines;
const Access=RHAccess;
const state = {view:'data',authEpoch:0,allRows:[],filtered:[],complete:false,session:null,profile:null,area:AREAS[0],page:0,total:null,rows:[],columns:[],hidden:new Set(),request:0,loading:false,employeeStatus:null};
const PAGE_SIZE=100;
const tableOrders=new Map();
const label = key => key==='horas'&&state.area[0]==='horas_domingos_feriados'?'Horas das picagens (referência)':({__dias:'Dias de disponibilidade',horas_arredondadas:'Horas arredondadas (h)',id:'ID',email:'Email',nome:'Nome',estabelecimento:'Estabelecimento',perfil:'Perfil',criado_em:'Criado em',employee_id:'ID do colaborador',colaborador_id:'ID do colaborador',ano:'Ano',mes:'Mês',data:'Data',ativo:'Ativo',saida:'Saída',funcao:'Função',categoria:'Categoria',nivel:'Nível',vencimento:'Vencimento',habilitacao:'Habilitação',duracao:'Duração',minutos:'Minutos',tipo:'Tipo'}[key] || key.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase()));
function message(error){if(error?.status===401)return 'A sessão expirou. Termine a sessão e entre novamente.';if(error?.status===403)return 'A sua conta não tem permissão para consultar esta informação.';return error?.message||'Não foi possível ligar ao serviço. Tente novamente.';}
async function request(path,{method='GET',body,token,headers={}}={}){
  let response;
  try{response=await fetch(API+path,{method,headers:{apikey:KEY,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(25000)});}catch{throw new Error('Não foi possível ligar ao Supabase. Verifique a ligação e tente novamente.');}
  const raw=await response.text();let data;try{data=raw?JSON.parse(raw):null;}catch{throw new Error('O serviço devolveu uma resposta inesperada.');}
  if(!response.ok){const error=new Error(data?.msg||data?.message||data?.error_description||'Não foi possível concluir a consulta.');error.status=response.status;throw error;}
  return {data,response};
}
async function token(){
  if(!state.session)throw new Error('Entre novamente no portal.');
  if(Date.now()/1000>state.session.expires_at-60){
    const originalSession=state.session;const epoch=state.authEpoch;
    const {data}=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:originalSession.refresh_token}});
    if(state.session!==originalSession||state.authEpoch!==epoch)throw new Error('A sessão mudou durante a consulta. Volte a consultar a informação.');
    state.session={...data,expires_at:data.expires_at||Date.now()/1000+data.expires_in};
  }
  return state.session.access_token;
}
function format(value){if(value===null||value===undefined)return '—';if(typeof value==='boolean')return value?'Sim':'Não';if(typeof value==='number')return new Intl.NumberFormat('pt-PT',{maximumFractionDigits:4}).format(value);if(typeof value==='object')return JSON.stringify(value);if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4);return String(value);}
function textCell(tag,value){const el=document.createElement(tag);el.textContent=value;return el;}
function setBusy(busy){state.loading=busy;$('reload').disabled=busy;$('prev').disabled=busy||state.page===0;$('next').disabled=busy||(state.page+1)*PAGE_SIZE>=state.filtered.length;}
function filteredRows(){
  const query=$('search').value.toLocaleLowerCase('pt-PT');const team=$('team').value;const employee=$('employee').value;const dateField=$('date-field').value;const from=$('date-from').value;const to=$('date-to').value;const activity=$('activity').value;
  if(from&&to&&from>to){$('analysis-note').textContent='A data inicial deve ser anterior ou igual à data final.';return [];}
  let source;
  if(state.area[0]==='colaboradores_factorial'){source=RHEmployees.filter(state.allRows,{activity,category:$('category').value,job:$('job').value});}
  else{source=state.allRows;if(activity&&state.employeeStatus&&state.employeeStatus.size)source=source.filter(r=>state.employeeStatus.get(A.person(r).key)===activity);}
  return source.filter(r=>(!team||r.estabelecimento===team)&&(!employee||A.person(r).key===employee)&&(state.area[0]==='colaboradores'||!dateField||(!from&&!to)||(typeof r[dateField]==='string'&&(!from||r[dateField].slice(0,10)>=from)&&(!to||r[dateField].slice(0,10)<=to)))&&(!query||Object.values(r).some(v=>format(v).toLocaleLowerCase('pt-PT').includes(query))));
}
function renderEmployeeDashboard(rows){
  const field=$('employee-group').value||'categoria';
  const title={categoria:'Categoria profissional',funcao:'Função',colaborador:'Colaborador'}[field];
  const summary=RHEmployees.analyse(rows,field), show=n=>state.complete?format(n):'—';
  $('count-title').textContent='Total de colaboradores';$('count').textContent=show(summary.people);
  $('count-note').textContent=state.complete?'De '+format(RHEmployees.unique(state.allRows).length)+' colaboradores acessíveis':'A aguardar consulta completa';
  $('people-title').textContent='Ativos';$('people-count').textContent=show(summary.active);$('people-note').textContent='No âmbito dos filtros';
  $('quantity-title').textContent='Inativos';$('quantity-total').textContent=show(summary.inactive);$('quantity-note').textContent=state.complete&&summary.unknown?format(summary.unknown)+' com estado por confirmar':'No âmbito dos filtros';
  $('team-count').textContent=show(new Set(rows.map(r=>r.estabelecimento).filter(Boolean)).size);
  $('chart-title').textContent='Colaboradores por '+title.toLocaleLowerCase('pt-PT');$('chart-caption').textContent='Até 10 grupos com mais colaboradores. Selecione uma barra para filtrar a lista.';
  $('chart-unit').textContent='Pessoas';$('group-title').textContent='Resumo por '+title.toLocaleLowerCase('pt-PT');$('group-count').textContent=show(summary.groups.length)+' grupos';
  $('chart').replaceChildren();$('group-head').replaceChildren();$('group-body').replaceChildren();
  if(!state.complete||!summary.groups.length){$('chart').append(textCell('p',state.complete?'Sem colaboradores para os filtros selecionados.':'A aguardar consulta completa.'));return;}
  const head=document.createElement('tr');for(const name of [title,'Total','Ativos','Inativos','Por confirmar'])head.append(textCell('th',name));$('group-head').append(head);
  for(const group of summary.groups){const tr=document.createElement('tr');for(const val of [group.name,group.count,group.active,group.inactive,group.unknown])tr.append(textCell('td',format(val)));$('group-body').append(tr);}
  const max=summary.groups[0].count;
  for(const group of summary.groups.slice(0,10)){
    const button=document.createElement('button');button.className='bar-row';button.type='button';button.setAttribute('aria-label',group.name+': '+group.count+' colaboradores');
    const name=textCell('span',group.name);name.className='bar-name';const track=document.createElement('span');track.className='bar-track';const fill=document.createElement('span');fill.className='bar-fill';fill.style.width=group.count/max*100+'%';track.append(fill);button.append(name,track,textCell('b',format(group.count)));
    button.addEventListener('click',()=>{if(field==='colaborador'){const row=rows.find(r=>RHEmployees.key(r)===group.key);if(row)$('employee').value=A.person(row).key;}else $(field==='categoria'?'category':'job').value=group.key;state.page=0;render();});$('chart').append(button);
  }
}
function renderDashboard(rows){
  $('count-title').textContent='Total de registos';$('people-title').textContent='Colaboradores';$('chart-title').textContent='Quantidades por colaborador';$('chart-caption').textContent='Até 10 colaboradores com maior quantidade no período selecionado. Clique numa barra para ver o detalhe.';
  if(state.area[0]==='colaboradores_factorial')return renderEmployeeDashboard(rows);
  const availability=state.area[0]==='disponibilidade';const absence=state.area[0]==='ausencias';const training=state.area[0]==='horas_formacao';const metric=availability?'__dias':state.area[0]==='horas_domingos_feriados'?'horas_arredondadas':training?'horas':$('metric').value;const analysis=RHDomain.aggregate(state.area[0],rows,metric);
  if(training){$('chart-title').textContent='Menos horas de formação';$('chart-caption').textContent='Até 10 colaboradores com menor quantidade no período selecionado. Clique numa barra para ver o detalhe.';}
  $('count').textContent=state.complete?format(analysis.count):'—';$('count-note').textContent=state.complete?'De '+format(state.allRows.length)+' registos acessíveis · filtros aplicados':'A aguardar consulta completa';
  $('people-count').textContent=state.complete?format(analysis.people):'—';$('team-count').textContent=state.complete?format(new Set(rows.map(r=>r.estabelecimento).filter(Boolean)).size):'—';
  $('quantity-title').textContent=metric?'Total · '+label(metric):'Média de registos por colaborador';$('quantity-total').textContent=state.complete?format(metric?analysis.sum:analysis.average):'—';
  $('quantity-note').textContent=metric?format(analysis.known)+' registos com valor · '+format(analysis.missing)+' sem valor':'Registos divididos pelo número de colaboradores';
  if(availability){$('quantity-title').textContent='Total de dias de disponibilidade';$('quantity-note').textContent='Um dia por colaborador e data, mesmo com vários registos nesse dia';}$('people-note').textContent='Identificação por número de colaborador, quando disponível';$('chart-unit').textContent=metric?label(metric):'Registos';$('group-count').textContent=format(analysis.groups.length)+' colaboradores';
  $('chart').replaceChildren();$('group-head').replaceChildren();$('group-body').replaceChildren();
  if(!state.complete){$('chart').append(textCell('p','A aguardar consulta completa.'));return;}
  $('group-title').textContent=absence?'Absentismo por colaborador':availability?'Dias de disponibilidade por colaborador':'Resumo por colaborador';
  const chartGroups=training?[...analysis.groups].sort((a,b)=>(metric?a.total-b.total:a.count-b.count)||a.name.localeCompare(b.name,'pt')):analysis.groups;
  const values=chartGroups.slice(0,10);const max=Math.max(1,...values.map(g=>metric?g.total:g.count));
  for(const g of values){const value=metric?(g.known?g.total:null):g.count;const button=document.createElement('button');button.className='bar-row';button.type='button';button.setAttribute('aria-label',g.name+': '+format(value)+' '+(metric?label(metric):'registos'));const name=textCell('span',g.name+(g.id?' · '+g.id:''));name.className='bar-name';const track=document.createElement('span');track.className='bar-track';const fill=document.createElement('span');fill.className='bar-fill';fill.style.width=Math.max(0,(value||0)/max*100)+'%';track.append(fill);button.append(name,track,textCell('b',format(value)));button.addEventListener('click',()=>{$('employee').value=g.key;state.page=0;render();});$('chart').append(button);}
  if(!values.length)$('chart').append(textCell('p','Sem dados para os filtros selecionados.'));
  if(absence){renderAbsentism(rows);return;}
  const head=document.createElement('tr');for(const title of ['Colaborador','Registos',...(metric?[label(metric),'Com valor']:[])])head.append(textCell('th',title));$('group-head').append(head);
  for(const g of analysis.groups){const tr=document.createElement('tr');const personCell=document.createElement('td');const button=textCell('button',g.name+(g.id?' · '+g.id:''));button.className='person-link';button.type='button';button.addEventListener('click',()=>{$('employee').value=g.key;state.page=0;render();});personCell.append(button);tr.append(personCell,textCell('td',format(g.count)));if(metric)tr.append(textCell('td',format(g.known?g.total:null)),textCell('td',format(g.known)));$('group-body').append(tr);}
}
function render(){
  if(typeof syncCalendarView==='function')syncCalendarView();
  $('analysis-note').textContent=state.complete?'Análise de todos os registos acessíveis nesta aba. Os mesmos filtros aplicam-se ao dashboard, ao resumo e ao detalhe. Quantidades representam registos da origem; não equivalem automaticamente a dias ou a eventos distintos.':'';
  if(state.complete&&state.area[0]==='horas_domingos_feriados')$('analysis-note').textContent='Totais, gráfico e resumo calculados exclusivamente com horas_arredondadas (horas decimais), segundo a regra do Supabase. Valores em falta não são substituídos pelas horas das picagens. Consulte a coluna Nota para registos que necessitam de revisão.';
  if(state.complete&&state.area[0]==='disponibilidade')$('analysis-note').textContent='Contagem de dias por colaborador/data. Várias picagens no mesmo dia contam apenas um dia. Marcadores 00:00–23:59 são excluídos.';if(state.complete&&state.area[0]==='ausencias')$('analysis-note').textContent='Absentismo por colaborador: número de registos e somas dos campos Dias e Horas da origem. Formação é apresentada na sua aba própria. Filtros de data aplicam-se ao campo selecionado, sem repartir durações por dias.';
  if(state.complete&&state.area[0]==='colaboradores_factorial')$('analysis-note').textContent='Contagem de colaboradores distintos. Os filtros aplicam-se aos indicadores, ao gráfico e à lista.';
  if(state.complete&&state.area[0]==='atrasos')$('analysis-note').textContent='Uma ausência de 8 horas ou mais no próprio dia exclui o atraso. Registos de vários dias sem horas discriminadas mantêm-se. Excluídos nesta consulta: '+format(state.allRows.excusedLateness||0)+'.';
  state.filtered=filteredRows();if(typeof renderExportControls==='function')renderExportControls();renderInternalDeadlines(state.filtered);if(typeof renderTrainingControls==='function')renderTrainingControls();const rows=state.filtered.slice(state.page*PAGE_SIZE,(state.page+1)*PAGE_SIZE);state.rows=rows;renderDashboard(state.filtered);
  const columns=state.columns.filter(c=>!state.hidden.has(c)&&!(Access.role(state.profile)==='gerente'&&c==='vencimento'));$('thead').replaceChildren();$('tbody').replaceChildren();const head=document.createElement('tr');for(const c of columns)head.append(textCell('th',label(c)));$('thead').append(head);
  for(const row of rows){const tr=document.createElement('tr');for(const c of columns){const v=format(row[c]);const td=textCell('td',v);td.title=v;tr.append(td);}$('tbody').append(tr);}
  $('empty').hidden=!state.complete||rows.length!==0;$('table-wrap').hidden=rows.length===0;
  const start=rows.length?state.page*PAGE_SIZE+1:0;const end=state.page*PAGE_SIZE+rows.length;$('pagination-label').textContent=`Página ${state.page+1} · registos ${start}–${end} de ${state.filtered.length}`;setBusy(state.loading);
}
function updateDashboardPeople(){
  const department=$('team').value;
  const select=$('employee');
  const selected=select.value;
  const people=new Map();
  for(const row of state.allRows){
    if(department&&row.estabelecimento!==department)continue;
    const person=A.person(row);
    people.set(person.key,person);
  }
  const options=[...people.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt'));
  select.replaceChildren(new Option('Todos os colaboradores',''),...options.map(person=>
    new Option(person.name+(person.id?' · '+person.id:''),person.key)));
  select.value=people.has(selected)?selected:'';
}
function resetOptions(){
  const rows=state.allRows;for(const [id,field,title] of [['category','categoria','Todas as categorias'],['job','funcao','Todas as funções']]){const keep=$(id).value;$(id).replaceChildren(new Option(title,''));for(const value of [...new Set(rows.map(r=>RHEmployees.classification(r,field)))].sort((a,b)=>a.localeCompare(b,'pt')))$(id).append(new Option(value,value));if([...$(id).options].some(o=>o.value===keep))$(id).value=keep;}const keepTeam=$('team').value;const keepDate=$('date-field').value;const keepMetric=$('metric').value;
  $('team').replaceChildren(new Option('Todas as Farmácias/Departamentos',''));for(const t of [...new Set(rows.map(r=>r.estabelecimento).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt')))$('team').append(new Option(t,t));

  $('date-field').replaceChildren(new Option('Sem filtro de período',''));for(const c of A.dateFields(rows))$('date-field').append(new Option(label(c),c));
  const roundedHours=state.area[0]==='horas_domingos_feriados';const availability=state.area[0]==='disponibilidade';const training=state.area[0]==='horas_formacao';const fixedMetric=roundedHours?'horas_arredondadas':availability?'__dias':training?'horas':null;
  $('metric').replaceChildren(...(fixedMetric?[]:[new Option('Número de registos','')]));for(const c of fixedMetric?[fixedMetric]:A.numericFields(rows))$('metric').append(new Option('Soma · '+label(c),c));$('metric').disabled=Boolean(fixedMetric);
  for(const [id,value] of [['team',keepTeam],['date-field',keepDate],['metric',keepMetric]])if([...$(id).options].some(o=>o.value===value))$(id).value=value;
  updateDashboardPeople();
  if(!keepDate&&A.dateFields(rows).includes('data'))$('date-field').value='data';
  if(!keepMetric&&state.area[0]==='atrasos'&&A.numericFields(rows).includes('minutos_atraso'))$('metric').value='minutos_atraso';
  if(fixedMetric)$('metric').value=fixedMetric;
  const noDates=$('date-field').options.length===1;$('date-field').disabled=noDates;$('date-from').disabled=noDates;$('date-to').disabled=noDates;
}
function columnOptions(){
  $('columns').querySelectorAll('label').forEach(e=>e.remove());
  for(const c of state.columns.filter(c=>!(Access.role(state.profile)==='gerente'&&c==='vencimento'))){const wrap=document.createElement('label');const input=document.createElement('input');input.type='checkbox';input.checked=!state.hidden.has(c);input.addEventListener('change',()=>{if(!input.checked&&state.hidden.size===state.columns.length-1){input.checked=true;return;}input.checked?state.hidden.delete(c):state.hidden.add(c);render();});wrap.append(input,document.createTextNode(label(c)));$('columns').append(wrap);}
}
async function ensureEmployeeStatus(){
  if(state.employeeStatus)return state.employeeStatus;
  if(!Access.canSource(state.profile,'colaboradores_factorial')){state.employeeStatus=new Map();return state.employeeStatus;}
  try{
    const rows=await readSourceRows('colaboradores_factorial');
    state.employeeStatus=new Map((rows||[]).map(r=>[A.person(r).key,RHEmployees.status(r)]));
  }catch{}
  return state.employeeStatus;
}
async function load(){
  const seq=++state.request;const area=state.area[0];state.complete=false;state.allRows=[];state.filtered=[];setBusy(true);$('updated').textContent='—';$('data-error').textContent='';$('notice').textContent='A carregar todos os registos autorizados para a análise…';render();
  try{
    if(!state.profile)throw new Error('A sua conta ainda não tem um perfil de acesso configurado.');
    const [rows]=await Promise.all([
      readAuthorizedRows(area,()=>seq!==state.request,(loaded,total)=>{$('notice').textContent='A carregar '+format(loaded)+(total===null?'':' de '+format(total))+' registos para a análise…';}),
      area==='colaboradores_factorial'?Promise.resolve():ensureEmployeeStatus()
    ]);
    if(seq!==state.request||rows===null)return;
    state.allRows=rows;state.total=rows.length;state.complete=true;state.page=0;state.columns=[...new Set(rows.flatMap(r=>Object.keys(r)))];resetOptions();columnOptions();$('updated').textContent=new Intl.DateTimeFormat('pt-PT',{timeZone:'Europe/Lisbon',hour:'2-digit',minute:'2-digit'}).format(new Date());$('notice').textContent='Detalhe dos registos incluídos no dashboard · 100 registos por página. A hora da consulta não indica a atualização da origem.'+(rows.clockErrorsExcluded?' '+rows.clockErrorsExcluded+' registos 00:00–23:59 excluídos.':'')+(rows.trainingExcluded?' '+rows.trainingExcluded+' registos de formação apresentados na aba Horas de formação, fora do absentismo.':'');
    if(area==='colaboradores_factorial')state.employeeStatus=new Map(rows.map(r=>[A.person(r).key,RHEmployees.status(r)]));
  }catch(error){if(seq!==state.request)return;state.allRows=[];state.rows=[];state.total=null;state.complete=false;$('data-error').textContent=message(error);$('notice').textContent='Consulta não concluída. Nenhum total parcial foi apresentado.';}
  finally{if(seq===state.request){state.loading=false;render();}}
}
function selectArea(area){if(!canAccessArea(area[0]))return;state.view='data';$('portal').classList.toggle('assistant-view',false);$('assistant-panel').hidden=true;$('reload').hidden=false;$('portal').classList.toggle('internal-view',area[0]==='colaboradores');$('portal').classList.toggle('collaborators-view',area[0]==='colaboradores_factorial');for(const id of ['activity','category','job'])$(id).value='';$('employee-group').value='categoria';$('export-status').textContent='';state.request++;state.allRows=[];state.filtered=[];state.complete=false;for(const id of ['employee','date-field','metric','date-from','date-to'])$(id).value='';state.area=area;state.page=0;state.rows=[];state.total=null;state.columns=[];state.hidden.clear();$('search').value='';$('team').replaceChildren(new Option('Todas as Farmácias/Departamentos',''));$('columns').hidden=true;$('columns-button').setAttribute('aria-expanded','false');$('page-title').textContent=area[1];$('breadcrumb').textContent=area[1];$('page-description').textContent=area[3];for(const b of $('navigation').children)b.classList.toggle('active',b.dataset.area===area[0]);load();}
for(const area of AREAS){const b=document.createElement('button');b.dataset.area=area[0];b.append(textCell('span',area[2]),document.createTextNode(area[1]));b.addEventListener('click',()=>selectArea(area));$('navigation').append(b);}
$('login-form').addEventListener('submit',async event=>{
  event.preventDefault();$('login-error').textContent='';$('signin-button').disabled=true;
  try{
    const {data}=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:$('email').value.trim(),password:$('password').value}});$('password').value='';
    state.session={...data,expires_at:data.expires_at||Date.now()/1000+data.expires_in};
    const access=await token();const {data:user}=await request('/auth/v1/user',{token:access});
    // Profile IDs are independent from Auth user IDs in this database.
    // Match the verified identity used by the existing email-based RLS policy.
    if(!user.email)throw new Error('A conta não tem um email confirmado associado.');
    const p=new URLSearchParams({select:'id,email,nome,perfil,estabelecimento',email:'eq.'+user.email,limit:'1'});
    const {data:profiles}=await request('/rest/v1/perfis_utilizador?'+p,{token:access});
    if(!profiles?.[0])throw new Error('A conta existe, mas ainda não tem um perfil de acesso. Contacte a administração do portal.');
    state.authEpoch++;state.profile=profiles[0];if(!Access.standard(state.profile)&&!Access.trainingOnly(state.profile))throw new Error('O perfil desta conta não está autorizado a consultar o portal.');applyProfileNavigation();if(typeof resetAssistant==='function')resetAssistant();if(typeof resetTraining==='function')resetTraining();$('profile-name').textContent=state.profile.nome;$('profile-scope').textContent=state.profile.estabelecimento||state.profile.perfil;$('avatar').textContent=state.profile.nome.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
    $('scope-banner').textContent='Perfil: '+state.profile.perfil+' · '+(state.profile.estabelecimento?'Estabelecimento associado: '+state.profile.estabelecimento:'Âmbito definido pelas permissões da sua conta');
    $('login').hidden=true;$('portal').hidden=false;selectArea(AREAS.find(area=>canAccessArea(area[0])));
  }catch(error){state.session=null;state.profile=null;$('login-error').textContent=error.status===400?'Email ou palavra-passe inválidos, ou conta ainda não ativada.':message(error);}
  finally{$('signin-button').disabled=false;}
});
$('signout').addEventListener('click',async()=>{const session=state.session;state.authEpoch++;if(typeof resetAssistant==='function')resetAssistant();if(typeof resetTraining==='function')resetTraining();state.request++;state.session=null;state.profile=null;state.employeeStatus=null;state.allRows=[];state.filtered=[];state.complete=false;state.rows=[];state.columns=[];render();$('tbody').replaceChildren();$('thead').replaceChildren();$('portal').hidden=true;$('login').hidden=false;$('password').value='';$('login-error').textContent='';if(session)try{await request('/auth/v1/logout',{method:'POST',token:session.access_token});}catch{};});
$('reload').addEventListener('click',()=>{if(typeof calendarState!=='undefined'&&calendarState.open&&calendarVisible())loadCalendar();else load();});$('search').addEventListener('input',()=>{state.page=0;render();});$('team').addEventListener('change',()=>{updateDashboardPeople();state.page=0;render();});for(const id of ['employee','date-field','date-from','date-to','metric','activity','category','job','employee-group'])$(id).addEventListener('change',()=>{state.page=0;render();});$('reset-filters').addEventListener('click',()=>{for(const id of ['team','employee','date-from','date-to','search','activity','category','job'])$(id).value='';updateDashboardPeople();state.page=0;render();});$('prev').addEventListener('click',()=>{if(state.page>0){state.page--;render();}});$('next').addEventListener('click',()=>{state.page++;render();});$('columns-button').addEventListener('click',()=>{$('columns').hidden=!$('columns').hidden;$('columns-button').setAttribute('aria-expanded',String(!$('columns').hidden));});

const SOURCE_VIEW_OVERRIDES={horas_domingos_feriados:'v_horas_domingos_feriados',horas_extras:'v_horas_extras'};
async function readSourceRows(area,cancelled=()=>false,onProgress=()=>{}){
  if(!state.profile||!state.session)throw new Error('Entre no portal com uma conta autorizada.');
  if((!AREAS.some(a=>a[0]===area&&area!=='horas_formacao')&&area!=='horas_formacao_manual')||!Access.canSource(state.profile,area))throw new Error('Esta área não está disponível para consulta.');
  if(cancelled())return null;
  if(area==='colaboradores_factorial')return A.fetchAll(async(offset,limit)=>{const params=new URLSearchParams({select:'*',order:'num_colaborador.asc',offset:String(offset),limit:String(limit)});const {data,response}=await request('/rest/v1/rpc/portal_colaboradores?'+params,{token:await token(),headers:{Prefer:'count=exact'}});const raw=response.headers.get('content-range')?.split('/')[1];return {rows:data,total:raw&&raw!=='*'?Number(raw):null};},{cancelled,onProgress});
  const source=SOURCE_VIEW_OVERRIDES[area]||area;
  if(!tableOrders.has(area)){
    const {data:sample}=await request('/rest/v1/'+source+'?select=*&limit=1',{token:await token()});if(cancelled())return null;
    if(Array.isArray(sample)&&sample[0]){const keys=Object.keys(sample[0]).filter(k=>sample[0][k]===null||typeof sample[0][k]!=='object');const preferred=keys.find(k=>k==='id'||k.startsWith('id_'));tableOrders.set(area,(preferred?[preferred,...keys.filter(k=>k!==preferred)]:keys).map(k=>k+'.asc.nullslast').join(','));}
  }
  return A.fetchAll(async(offset,limit)=>{const params=new URLSearchParams({select:'*',limit:String(limit),offset:String(offset)});if(tableOrders.get(area))params.set('order',tableOrders.get(area));const {data,response}=await request('/rest/v1/'+source+'?'+params,{token:await token(),headers:{Prefer:'count=exact'}});const raw=response.headers.get('content-range')?.split('/')[1];return {rows:data,total:raw&&raw!=='*'?Number(raw):null};},{cancelled,onProgress});
}
function deadlineWords(item){if(item.status==='unknown')return 'Dados a verificar';if(item.days<0)return Math.abs(item.days)+' dias de atraso';if(item.days===0)return 'Hoje';return 'Daqui a '+item.days+' dias';}
function renderInternalDeadlines(rows){
  const internal=state.view!=='assistant'&&state.area[0]==='colaboradores';$('internal-deadlines').hidden=!internal;if(!internal)return;
  const summary=D.analyse(state.complete?rows:[],D.today());$('deadline-period').textContent='Data da consulta: '+format(summary.reference)+' · próximos 90 dias até '+format(summary.end)+' · hora de Lisboa';
  for(const [id,key] of [['progression-overdue','progressionOverdue'],['progression-upcoming','progressionUpcoming'],['insurance-overdue','insuranceOverdue'],['insurance-upcoming','insuranceUpcoming']])$(id).textContent=state.complete?format(summary.counts[key]):'—';
  const stamps=rows.map(r=>r.sincronizado_em).filter(v=>typeof v==='string'&&Number.isFinite(Date.parse(v))).sort();const fresh=stamps.length?' Última sincronização presente nos dados: '+format(stamps[stamps.length-1].slice(0,10))+'.':'';
  $('deadline-quality').textContent=state.complete?summary.missingProgression+' progressões e '+summary.missingInsurance+' inscrições com dados a verificar; '+summary.excluded+' registos inativos excluídos; '+summary.unknownActive+' com estado de atividade por confirmar. '+summary.insured+' colaboradores já inscritos no seguro.'+fresh:'A aguardar consulta completa dos dados internos.';
  const filter=$('deadline-status').value;for(const [kind,id] of [['progression','progression-list'],['insurance','insurance-list']]){
    const list=summary[kind].filter(item=>filter==='all'||(filter==='actions'?['overdue','upcoming'].includes(item.status):item.status===filter));$(id).replaceChildren();$(kind+'-list-count').textContent=state.complete?list.length+' colaboradores':'—';
    for(const item of list){const tr=document.createElement('tr');const cell=document.createElement('td');const button=textCell('button',A.person(item.row).name+' · '+(item.row.num_colaborador??'s/n'));button.type='button';button.className='person-link';button.addEventListener('click',()=>{$('employee').value=A.person(item.row).key;state.page=0;render();});cell.append(button);const status=textCell('td',item.status==='overdue'?'Em atraso':item.status==='upcoming'?'Hoje / até 90 dias':item.status==='later'?'Após 90 dias':'A verificar');status.className='deadline-state '+item.status;tr.append(cell,textCell('td',item.row.estabelecimento||'—'),textCell('td',format(item.date)),textCell('td',deadlineWords(item)),status);$(id).append(tr);}
    if(!list.length){const tr=document.createElement('tr');const td=textCell('td',state.complete?'Sem colaboradores nesta situação.':'A aguardar dados.');td.colSpan=5;tr.append(td);$(id).append(tr);}
  }
}
$('deadline-status').addEventListener('change',()=>renderInternalDeadlines(state.filtered));
for(const button of document.querySelectorAll('.deadline-card'))button.addEventListener('click',()=>{$('deadline-status').value=button.dataset.status;renderInternalDeadlines(state.filtered);$(button.dataset.kind+'-panel').scrollIntoView({behavior:'smooth',block:'nearest'});});
setInterval(()=>{if(state.complete&&state.area[0]==='colaboradores')renderInternalDeadlines(state.filtered);},60000);

async function readAuthorizedRows(area,cancelled=()=>false,onProgress=()=>{}){
  if(!state.profile||!state.session)throw new Error('Entre no portal com uma conta autorizada.');
  if(!AREAS.some(a=>a[0]===area)||!canAccessArea(area))throw new Error('Esta área não está disponível para consulta.');
  if(area==='atrasos'){
    const [rows,absences,holidays]=await Promise.all([
      readSourceRows('atrasos',cancelled,onProgress),
      readSourceRows('ausencias',cancelled),
      readSourceRows('ferias',cancelled)
    ]);
    if(cancelled()||[rows,absences,holidays].some(result=>result===null))return null;
    return RHDomain.excludeFullDayLateness(rows,[...absences,...holidays]);
  }
  if(area==='horas_formacao'){
    const results=await Promise.all([readSourceRows('ausencias',cancelled),readSourceRows('horas_formacao_manual',cancelled)]);if(cancelled()||results.some(r=>r===null))return null;return RHDomain.combineTraining(results[0],results[1]);
  }
  const rows=await readSourceRows(area,cancelled,onProgress);if(rows===null)return null;
  const prepared=RHDomain.prepare(area,rows);if(area==='ausencias'){const onlyAbsences=prepared.filter(r=>!RHDomain.isTraining(r));Object.defineProperty(onlyAbsences,'trainingExcluded',{value:prepared.length-onlyAbsences.length});return onlyAbsences;}return prepared;
}
function renderAbsentism(rows){
  const result=RHDomain.absentism(rows);const head=document.createElement('tr');for(const title of ['Colaborador','Farmácia/Departamento','Registos de ausência','Dias registados','Horas registadas','Valores em falta'])head.append(textCell('th',title));$('group-head').append(head);
  for(const group of result.groups){const tr=document.createElement('tr');const td=document.createElement('td');const button=textCell('button',group.name+(group.id?' · '+group.id:''));button.type='button';button.className='person-link';button.addEventListener('click',()=>{$('employee').value=group.key;state.page=0;render();});td.append(button);tr.append(td,textCell('td',group.teams.join(', ')||'—'),textCell('td',format(group.count)),textCell('td',format(group.daysTotal)),textCell('td',format(group.hoursTotal)),textCell('td',group.missingDays+' sem dias · '+group.missingHours+' sem horas'));$('group-body').append(tr);}
}

function canAccessArea(area){return Boolean(state.profile&&state.session&&Access.canArea(state.profile,area));}
function applyProfileNavigation(){
  for(const button of $('navigation').children)button.hidden=button.dataset.area==='assistant'?!Access.standard(state.profile):!canAccessArea(button.dataset.area);
  $('chat-context').replaceChildren();for(const area of AREAS.filter(a=>canAccessArea(a[0])))$('chat-context').append(new Option(area[1],area[0]));
}
async function readTrainingPeople(cancelled=()=>false){
  if(!state.profile||!state.session||!Access.canUpload(state.profile))throw new Error('Esta conta não pode importar formação.');
  if(!Access.trainingOnly(state.profile))return readSourceRows('colaboradores_factorial',cancelled);
  return A.fetchAll(async(offset,limit)=>{const params=new URLSearchParams({select:'num_colaborador,nome,estabelecimento',order:'num_colaborador.asc',offset:String(offset),limit:String(limit)});const {data,response}=await request('/rest/v1/rpc/formacao_colaboradores?'+params,{token:await token(),headers:{Prefer:'count=exact'}});const raw=response.headers.get('content-range')?.split('/')[1];return {rows:data,total:raw&&raw!=='*'?Number(raw):null};},{cancelled});
}
