'use strict';

const calendarState = {open:false, revision:0, month:'', rows:[], people:new Map(), ready:false};
const calendarDate = (month, day) => month+'-'+String(day).padStart(2,'0');

function calendarVisible() {
  return state.view==='data' && state.area[0]==='ausencias' && canAccessArea('ausencias');
}

function syncCalendarView() {
  const visible=calendarVisible();
  $('calendar-toggle').hidden=!visible;
  if(!visible && calendarState.open) closeCalendar();
}

function closeCalendar() {
  calendarState.open=false;
  calendarState.revision++;
  calendarState.rows=[];
  calendarState.people.clear();
  calendarState.ready=false;
  $('calendar-days').replaceChildren();
  $('calendar-events').replaceChildren();
  $('calendar-person').replaceChildren(new Option('Todos os colaboradores',''));
  $('calendar-team').replaceChildren(new Option('Todas as farmácias/departamentos',''));
  $('calendar-panel').hidden=true;
  $('portal').classList.toggle('calendar-view',false);
  $('calendar-toggle').setAttribute('aria-expanded','false');
}

async function calendarSource(path, params, order, cancelled) {
  return A.fetchAll(async (offset,limit)=>{
    const query=new URLSearchParams({...params,order,offset,limit});
    const {data,response}=await request('/rest/v1/'+path+'?'+query,{token:await token(),headers:{Prefer:'count=exact'}});
    const count=response.headers.get('content-range')?.split('/')[1];
    return {rows:data,total:count && count!=='*'?Number(count):null};
  },{cancelled});
}

async function loadCalendar() {
  const month=$('calendar-month').value;
  if(!calendarVisible() || !calendarState.open || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
  const revision=++calendarState.revision;
  const cancelled=()=>revision!==calendarState.revision || !calendarVisible();
  calendarState.ready=false;
  calendarState.rows=[];
  $('calendar-days').replaceChildren();
  $('calendar-events').replaceChildren();
  $('calendar-status').textContent='A carregar o calendário…';
  const [year,m]=month.split('-').map(Number);
  const lastDay=new Date(Date.UTC(year,m,0)).getUTCDate();
  const first=calendarDate(month,1), last=calendarDate(month,lastDay);
  const overlap={data:'lte.'+last,or:'(data_fim.gte.'+first+',and(data_fim.is.null,data.gte.'+first+'))'};
  try {
    const results=await Promise.all([
      calendarSource('ausencias',overlap,'id_ausencia.asc',cancelled),
      calendarSource('ferias',overlap,'id_ausencia.asc',cancelled),
      calendarSource('atrasos',{and:'(data.gte.'+first+',data.lte.'+last+')'},'id_turno.asc',cancelled),
      calendarSource('rpc/portal_turnos_planeados',{p_de:first,p_ate:last},'id_turno.asc',cancelled).catch(error=>{
        if(error.status===404)return [];
        throw error;
      }),
      calendarSource('rpc/portal_colaboradores',{select:'num_colaborador,nome,estabelecimento'},'num_colaborador.asc',cancelled)
    ]);
    if(cancelled()||results.some(rows=>rows===null))return;
    const [absences,holidays,attendance,schedule,directory]=results;
    const people=new Map();
    for(const row of directory) {
      const person=A.person(row);
      people.set(person.key,{person,team:String(row.estabelecimento||'').trim()});
    }
    const rows=new Map();
    function personDay(row,date) {
      const eventPerson=A.person(row);
      const registered=people.get(eventPerson.key);
      const person=registered?.person||eventPerson;
      const team=registered?.team||String(row.estabelecimento||'').trim();
      if(!registered || (!registered.team&&team))people.set(person.key,{person,team});
      const key=JSON.stringify([date,person.key]);
      if(!rows.has(key)) rows.set(key,{date,person,team,leaves:[],shifts:new Map()});
      return rows.get(key);
    }
    for(const row of [...absences,...holidays]) {
      if(RHDomain.isTraining(row) || /rejeitad|cancelad|denegad|rejected|cancelled|denied/i.test(row.estado||''))continue;
      for(let d=1;d<=lastDay;d++) {
        const date=calendarDate(month,d);
        if(date<row.data || date>(row.data_fim||row.data))continue;
        const item=personDay(row,date);
        if(!item.leaves.some(leave=>leave.id_ausencia===row.id_ausencia))item.leaves.push(row);
      }
    }
    for(const row of attendance) {
      const item=personDay(row,row.data);
      item.shifts.set(String(row.id_turno),row);
    }
    for(const row of schedule) {
      const item=personDay(row,row.data);
      const key=String(row.id_turno);
      item.shifts.set(key,{...item.shifts.get(key),...row});
    }
    calendarState.month=month;
    calendarState.rows=[...rows.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.person.name.localeCompare(b.person.name,'pt'));
    for(const row of calendarState.rows)row.team=people.get(row.person.key)?.team||row.team;
    calendarState.people=people;
    calendarState.ready=true;
    const teams=[...new Set([...people.values()].map(row=>row.team).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt'));
    const oldTeam=$('calendar-team').value;
    $('calendar-team').replaceChildren(new Option('Todas as farmácias/departamentos',''),...teams.map(team=>new Option(team,team)));
    $('calendar-team').value=teams.includes(oldTeam)?oldTeam:'';
    updateCalendarPeople();
    $('calendar-status').textContent=schedule.length?'Escala publicada, ausências e atrasos registados.':'Sem escala publicada sincronizada neste mês. São apresentados os turnos disponíveis nos registos de assiduidade.';
    renderCalendar();
  } catch(error) {
    if(!cancelled())$('calendar-status').textContent=message(error);
  }
}

function updateCalendarPeople() {
  const team=$('calendar-team').value;
  const select=$('calendar-person');
  const selected=select.value;
  const people=[...calendarState.people.values()]
    .filter(row=>!team||row.team===team)
    .sort((a,b)=>a.person.name.localeCompare(b.person.name,'pt'));
  select.replaceChildren(new Option('Todos os colaboradores',''));
  for(const {person,team:department} of people) {
    const name=[person.name,person.id,!team&&department].filter(Boolean).join(' · ');
    select.append(new Option(name,person.key));
  }
  select.value=people.some(row=>row.person.key===selected)?selected:'';
}

function renderCalendar() {
  if(!calendarState.ready)return;
  const month=calendarState.month;
  const [year,m]=month.split('-').map(Number);
  const count=new Date(Date.UTC(year,m,0)).getUTCDate();
  const firstWeekday=(new Date(Date.UTC(year,m-1,1)).getUTCDay()+6)%7;
  const employee=$('calendar-person').value;
  const team=$('calendar-team').value;
  const relevant=calendarState.rows.filter(row=>(!employee||row.person.key===employee)&&(!team||row.team===team));
  const days=$('calendar-days');
  days.replaceChildren();
  for(const day of ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'])days.append(textCell('b',day));
  for(let i=0;i<firstWeekday;i++)days.append(document.createElement('span'));
  const selected=$('calendar-day').value;
  const dayValue=selected.startsWith(month+'-')?selected:(D.today().startsWith(month+'-')?D.today():calendarDate(month,1));
  $('calendar-day').value=dayValue;
  for(let day=1;day<=count;day++) {
    const date=calendarDate(month,day);
    const rows=relevant.filter(row=>row.date===date);
    const absences=rows.filter(row=>row.leaves.length).length;
    const late=rows.filter(row=>!row.leaves.some(RHDomain.fullDayAbsence)&&[...row.shifts.values()].some(s=>Number(s.minutos_atraso)>0)).length;
    const button=textCell('button',String(day));
    button.type='button';
    button.className='calendar-day'+(absences?' calendar-absence':'');
    button.setAttribute('aria-pressed',String(date===dayValue));
    button.setAttribute('aria-label',format(date)+', '+absences+' colaboradores ausentes, '+late+' com atraso');
    if(absences)button.append(textCell('small',absences+' aus.'));
    if(late)button.append(textCell('small',late+' atr.'));
    button.addEventListener('click',()=>{$('calendar-day').value=date;renderCalendar();});
    days.append(button);
  }
  $('calendar-day-heading').textContent='Registos de '+format(dayValue);
  const events=$('calendar-events');
  events.replaceChildren();
  for(const row of relevant.filter(item=>item.date===dayValue)) {
    const article=document.createElement('article');
    const excused=row.leaves.some(RHDomain.fullDayAbsence);
    article.append(textCell('h3',row.person.name),textCell('p',row.team||'Departamento por preencher'));
    for(const leave of row.leaves) {
      const text='Ausência · '+(leave.tipo||'Tipo por indicar')+(leave.estado?' · '+leave.estado:'');
      const absence=textCell('p',text);absence.className='calendar-leave';article.append(absence);
    }
    for(const shift of row.shifts.values()) {
      const time=[shift.inicio_turno,shift.fim_turno].filter(Boolean).map(v=>String(v).slice(0,5)).join('–');
      const lateness=excused?'Atraso não aplicável · ausência de dia completo':shift.minutos_atraso==null?'Atraso por apurar':format(shift.minutos_atraso)+' min de atraso';
      article.append(textCell('p',[shift.turno||'Turno previsto',time,lateness].filter(Boolean).join(' · ')));
    }
    if(!row.shifts.size)article.append(textCell('p',excused?'Turno sem registo · Atraso não aplicável':'Turno sem registo · Atraso por apurar'));
    events.append(article);
  }
  if(!events.children.length)events.append(textCell('p','Sem registos para este dia e filtro.'));
}

$('calendar-toggle').addEventListener('click',()=>{
  if(calendarState.open){closeCalendar();return;}
  if(!calendarVisible())return;
  calendarState.open=true;
  $('calendar-panel').hidden=false;
  $('portal').classList.toggle('calendar-view',true);
  $('calendar-toggle').setAttribute('aria-expanded','true');
  if(!$('calendar-month').value)$('calendar-month').value=D.today().slice(0,7);
  loadCalendar();
});
$('calendar-month').addEventListener('change',loadCalendar);
$('calendar-person').addEventListener('change',renderCalendar);
$('calendar-team').addEventListener('change',()=>{
  updateCalendarPeople();
  renderCalendar();
});
$('signout').addEventListener('click',closeCalendar);
