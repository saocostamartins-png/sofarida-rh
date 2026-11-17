'use strict';
let consultationGeneration=0;
let lastLatenessQuestion=null;
function resetAssistant(){consultationGeneration++;lastLatenessQuestion=null;$('chat-log').replaceChildren();$('chat-question').value='';$('chat-send').disabled=false;}
function chatMessage(text,kind,source,detail){
  const box=textCell('div',text);
  box.className='chat-message '+kind;
  if(detail){
    const disclosure=document.createElement('details');
    disclosure.className='chat-detail';
    disclosure.append(textCell('summary','Ver dias e minutos'),textCell('div',detail));
    box.append(disclosure);
  }
  if(source)box.append(textCell('small',source));
  $('chat-log').append(box);
  box.scrollIntoView({block:'nearest',behavior:'smooth'});
}
$('chat-form').addEventListener('submit',async event=>{
  event.preventDefault();const question=$('chat-question').value.trim();if(!question||$('chat-send').disabled)return;
  if(!state.profile||!state.session){chatMessage('Entre com uma conta autorizada para consultar os dados.','answer');return;}if(!Access.standard(state.profile)){chatMessage('O assistente não está disponível para este perfil. Use a aba Horas de formação.','answer');return;}
  const epoch=state.authEpoch;const generation=++consultationGeneration;const cancelled=()=>epoch!==state.authEpoch||generation!==consultationGeneration||!state.profile||!state.session;
  $('chat-question').value='';$('chat-send').disabled=true;chatMessage(question,'question');
  try{
    const followUp=RHConsultation.followUp(question,lastLatenessQuestion);
    const plan=followUp||RHConsultation.plan(question,$('chat-context').value||state.area[0],D.today());if(plan.type==='help'){chatMessage(plan.reason,'answer');return;}
    if(followUp&&!plan.refresh){
      lastLatenessQuestion.detail=true;
      chatMessage(lastLatenessQuestion.detailText,'answer',lastLatenessQuestion.source);
      return;
    }
    if(plan.type==='date'){chatMessage(RHConsultation.answer([],plan),'answer');return;}
    lastLatenessQuestion=null;
    const [rows,directory]=await Promise.all([
      readAuthorizedRows(plan.area,cancelled),
      plan.personName?readAuthorizedRows('colaboradores_factorial',cancelled):[]
    ]);
    if(cancelled()||rows===null||directory===null)return;
    const area=AREAS.find(a=>a[0]===plan.area);const stamps=rows.map(r=>r.sincronizado_em).filter(x=>typeof x==='string'&&Number.isFinite(Date.parse(x))).sort();const sync=stamps.length?' · sincronização mais recente: '+format(stamps[stamps.length-1].slice(0,10)):'';
    const source='Fonte: Supabase · '+area[1]+' · '+rows.length+' registos permitidos à conta · consulta '+format(plan.reference)+sync+'.';
    const answer=RHConsultation.answer(rows,plan,directory);
    let detail;
    if(plan.personName){
      const matches=RHConsultation.namedPeople(rows,plan,directory);
      if(matches.length===1){
        const detailText=RHConsultation.answer(rows,{...plan,personId:matches[0].id,detail:true},directory);
        lastLatenessQuestion={...plan,personId:matches[0].id,detailText,source};
        if(detailText.startsWith(answer+'\n\n'))detail=detailText.slice(answer.length+2);
      }
    }
    chatMessage(answer,'answer',source,detail);
  }catch(error){if(!cancelled())chatMessage(message(error)+' Não foi apresentada uma resposta com dados parciais.','answer');}
  finally{if(generation===consultationGeneration)$('chat-send').disabled=false;}
});
$('chat-clear').addEventListener('click',resetAssistant);
for(const button of document.querySelectorAll('[data-question]'))button.addEventListener('click',()=>{$('chat-question').value=button.dataset.question;$('chat-question').focus();});

for(const area of AREAS)$('chat-context').append(new Option(area[1],area[0]));
const assistantNavigation=document.createElement('button');assistantNavigation.type='button';assistantNavigation.dataset.area='assistant';assistantNavigation.append(textCell('span','◇'),document.createTextNode('Assistente de consulta'));
assistantNavigation.addEventListener('click',showAssistant);$('navigation').append(assistantNavigation);
function showAssistant(){
  if(typeof closeCalendar==='function')closeCalendar();
  if(!state.profile||!state.session||!Access.standard(state.profile))return;
  state.view='assistant';state.request++;setBusy(false);$('portal').classList.toggle('assistant-view',true);$('portal').classList.toggle('internal-view',false);$('internal-deadlines').hidden=true;$('assistant-panel').hidden=false;$('reload').hidden=true;
  $('chat-context').value=state.area[0];$('page-title').textContent='Assistente de consulta';$('breadcrumb').textContent='Assistente de consulta';$('page-description').textContent='Pergunte sobre colaboradores, totais e prazos, dentro das permissões da sua conta.';
  for(const button of $('navigation').children)button.classList.toggle('active',button.dataset.area==='assistant');
  $('page-title').scrollIntoView({block:'start',behavior:'smooth'});$('chat-question').focus({preventScroll:true});
}

if(state.profile)applyProfileNavigation();
