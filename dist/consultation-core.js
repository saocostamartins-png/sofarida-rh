(function(root){
  'use strict';
  const D=typeof module==='object'&&module.exports?require('./deadlines.js'):root.RHDeadlines;
  const A=typeof module==='object'&&module.exports?require('./analytics.js'):root.RHAnalytics;
  const Domain=typeof module==='object'&&module.exports?require('./domain.js'):root.RHDomain;
  const areas=['colaboradores_factorial','colaboradores','atrasos','ausencias','ferias','horas_extras','horas_domingos_feriados','disponibilidade','horas_formacao'];
  const nf=v=>v===null||v===undefined?'sem valor':new Intl.NumberFormat('pt-PT',{maximumFractionDigits:4}).format(v);
  const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v.slice(8)+'/'+v.slice(5,7)+'/'+v.slice(0,4):'sem data';
  const questionText=question=>D.norm(question).replace(/\batarsos\b/g,'atrasos').replace(/\bpoe mes\b/g,'por mes');
  const yearPeriod=year=>({from:year+'-01-01',to:year+'-12-31'});
  function latenessGrouping(q){
    const byYear=/\bpor ano\b/.test(q);
    const byMonth=/\bpor mes\b/.test(q);
    const year=q.match(/\b(?:em|no ano de|no ano)\s+(20\d{2})\b/)?.[1];
    return {groupBy:byYear?'year':byMonth?'month':null,year,monthlyYear:byYear&&byMonth&&year?year:null};
  }
  function plan(question,currentArea,reference=D.today()){
    const q=questionText(question);const base={question,q,reference,area:currentArea,type:'summary',period:null};
    if(!q||q.length>500)return {...base,type:'help',reason:'Escreva uma pergunta até 500 caracteres.'};
    if(/^(?:hoje e que dia|que dia e hoje|que dia estamos|que dia da semana e hoje|(?:qual e )?a data (?:de )?hoje|(?:qual e )?o dia de hoje|(?:em )?que (?:dia|mes|ano) (?:estamos|e)|qual (?:e )?o (?:mes|ano|dia)(?: atual| de hoje)?)[?!. ]*$/.test(q)){
      const today=new Intl.DateTimeFormat('pt-PT',{dateStyle:'full',timeZone:'Europe/Lisbon'}).format(new Date(reference+'T12:00:00Z'));
      return {...base,type:'date',response:'Hoje é '+today+' (hora de Lisboa).'};
    }
    if(/password|palavra.passe|credencia|token|chave.*api/.test(q))return {...base,type:'help',reason:'O assistente não consulta palavras-passe, chaves ou credenciais.'};
    if(currentArea==='colaboradores'&&/atraso|atrasad/.test(q)&&!/progress|seguro|picag|assiduidade|minutos|\batrasos\b/.test(q))return {...base,type:'help',reason:'Refere-se a progressões em atraso, inscrições no seguro ou atrasos de assiduidade? Indique o tema na pergunta.'};
    if(/\b(apagar|eliminar|alterar|atualizar|inscrever|aprovar|editar)\b/.test(q)&&!(/quem|quando|deve|precisa|necessita|por inscrever/.test(q)))return {...base,type:'help',reason:'O assistente apenas consulta dados. Não altera registos nem aprova pedidos.'};
    if(/progress|seguro|dados internos|vencimento|remuneracao|categoria|funcao|contrato|admissao|habilitacao/.test(q))base.area='colaboradores';
    else if(/formacao|treinamento/.test(q))base.area='horas_formacao';
    else if(/domingo|feriado/.test(q))base.area='horas_domingos_feriados';
    else if(/horas? extra|suplementar/.test(q))base.area='horas_extras';
    else if(/atraso/.test(q))base.area='atrasos';
    else if(/ausencia|falta/.test(q))base.area='ausencias';
    else if(/ferias/.test(q))base.area='ferias';
    else if(/disponibilidade/.test(q))base.area='disponibilidade';
    else if(/colaborador|equipa|ativo/.test(q))base.area='colaboradores_factorial';
    else if(!/total|soma|registo|quant|nesta aba|dados de|informacao de|resumo/.test(q))return {...base,type:'help',reason:'Posso consultar totais por colaborador, progressões, seguro de saúde e dados de um colaborador. Indique a área ou escolha um exemplo.'};
    if(!areas.includes(base.area))return {...base,type:'help',reason:'Escolha uma área de consulta.'};
    if(base.area==='colaboradores'&&/progress|seguro/.test(q)){
      base.type='deadlines';base.kind=/progress/.test(q)?'progression':'insurance';base.status=/atraso|atrasad/.test(q)?'overdue':/90|proxim|hoje/.test(q)?'upcoming':'actions';
      const horizon=q.match(/(\d+)\s*dias/);if((horizon&&horizon[1]!=='90')||/este mes|mes passado|mes atual|\d{4}-\d{2}-\d{2}|ontem|amanha|semana/.test(q))return {...base,type:'help',reason:'A consulta de prazos usa a data de hoje e o horizonte de 90 dias. Pergunte por atrasos ou pelos próximos 90 dias.'};
      if(base.kind==='insurance'&&!/atraso|atrasad|90|proxim|hoje/.test(q)){
        if(/nao tem|sem seguro|nao est.*inscrit/.test(q))base.type='uninsured';
        else if(/ja tem|ja est|com seguro|tem seguro|possui seguro|ja inscrit/.test(q))base.type='insured';
        else if(!/deve|precisa|necessita|inscrever/.test(q))base.type='insuranceOverview';
      }
      return base;
    }
    if(/\btop(?:\s*-?\d+|\b)|\branking\b|mais atrasos/.test(q)){
      const limit=Number(q.match(/\btop\s*(-?\d+)\b/)?.[1]||10);if(!Number.isInteger(limit)||limit<1||limit>100)return {...base,type:'help',reason:'Indique um top entre 1 e 100 colaboradores.'};
      base.type='ranking';base.limit=limit;base.rankBy=base.area==='atrasos'?(/minuto|tempo|duracao/.test(q)?'minutos_atraso':'count'):base.area==='disponibilidade'?'__dias':base.area==='horas_domingos_feriados'?'horas_arredondadas':['horas_extras','horas_formacao'].includes(base.area)?'horas':'count';
    }
    const dates=[...q.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map(m=>m[1]);
    if(base.area==='atrasos'&&base.type==='summary'){
      const named=q.match(/\b(?:atrasos?|minutos de atraso)\s+(?:(?:tem|teve)\s+(?:o\s+|a\s+)?|(?:do|da|de)\s+)([\p{L}\s]+?)(?=\s+(?:este|neste|no|na|em|ano|hoje|ultimos|mes|por (?:ano|mes|dia))\b|[?!.,;()]|\s+\d|$)/u);
      if(named)base.personName=named[1].trim();
      if(base.personName){
        const grouping=latenessGrouping(q);
        base.groupBy=grouping.groupBy;
        base.monthlyYear=grouping.monthlyYear;
        if(!dates.length&&grouping.year){
          if(!grouping.monthlyYear)base.period=yearPeriod(grouping.year);
          return base;
        }
        if(!dates.length&&base.groupBy&&!/\b(?:este|neste|atual|passado|anterior|ultimos|hoje)\b/.test(q))return base;
      }
    }
    if(dates.length){if(dates.length>2||dates.some(d=>D.day(d)===null)||(dates[1]&&dates[0]>dates[1]))return {...base,type:'help',reason:'Indique uma data válida ou um intervalo ordenado no formato AAAA-MM-DD.'};base.period={from:dates[0],to:dates[1]||dates[0]};}
    else if(/ultimos 90 dias/.test(q))base.period={from:D.plus(reference,-89),to:reference};
    else if(/\b(?:este ano|ano atual|neste ano)\b/.test(q))base.period={from:reference.slice(0,4)+'-01-01',to:reference};
    else if(/\b(?:ano passado|ultimo ano|ano anterior)\b/.test(q)){
      const year=Number(reference.slice(0,4))-1;
      base.period={from:year+'-01-01',to:year+'-12-31'};
    }
    else if(/hoje/.test(q))base.period={from:reference,to:reference};
    else if(/este mes|mes atual|mes passado/.test(q)){const d=new Date(reference+'T00:00:00Z');const offset=/mes passado/.test(q)?-1:0;base.period={from:new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+offset,1)).toISOString().slice(0,10),to:new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+offset+1,0)).toISOString().slice(0,10)};}
    else{const months=['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];const month=months.findIndex(m=>new RegExp('\\b'+m+'\\b').test(q));if(month>=0){const year=Number(q.match(/\b(20\d{2})\b/)?.[1]||reference.slice(0,4));base.period={from:new Date(Date.UTC(year,month,1)).toISOString().slice(0,10),to:new Date(Date.UTC(year,month+1,0)).toISOString().slice(0,10)};}else if(/dias|semana|amanha|ontem|proxim|ano/.test(q))return {...base,type:'help',reason:'Para datas, use «este mês», «mês passado», «últimos 90 dias», o nome do mês ou um intervalo AAAA-MM-DD a AAAA-MM-DD.'};}
    return base;
  }
  function selectPerson(rows,q){const id=q.match(/colaborador\s+(?:numero\s+|n\s+)?(\d+)\b/)?.[1];if(id)return {rows:rows.filter(r=>A.person(r).id===id),matched:true};const names=[...new Set(rows.map(r=>A.person(r).name))].filter(name=>name!=='Sem identificação'&&q.includes(D.norm(name))).sort((a,b)=>b.length-a.length);return names.length?{rows:rows.filter(r=>D.norm(A.person(r).name)===D.norm(names[0])),matched:true}:{rows,matched:false};}
  function namedPeople(rows,p,directory=[]){
    const people=new Map([...rows,...directory].map(A.person).filter(person=>person.id).map(person=>[person.id,person]));
    if(p.personId)return people.has(p.personId)?[people.get(p.personId)]:[];
    const name=D.norm(p.personName);
    const words=name.split(/\s+/);
    const exact=[...people.values()].filter(person=>D.norm(person.name)===name);
    return exact.length?exact:[...people.values()].filter(person=>{
      const tokens=D.norm(person.name).split(/\s+/);
      return words.length>1&&words.every((word,index)=>index===0?tokens[0]===word:tokens.includes(word));
    });
  }
  function followUp(question,previous){
    const q=questionText(question);
    const periodQuestion=q.match(/^(?:(?:e\s+)?(?:em|no ano de|no ano)\s+)?(20\d{2})(?:[\s,]+por mes)?[?!. ]*$/);
    const groupQuestion=/^(?:e\s+)?por (?:mes|ano)[?!. ]*$/.test(q);
    if(periodQuestion||groupQuestion){
      if(!previous)return {type:'help',reason:'Indique o colaborador e o tema da consulta. Por exemplo, «Quantos atrasos tem Ana Marques em 2026?»'};
      const year=periodQuestion?.[1];
      const groupBy=/\bpor mes\b/.test(q)?'month':/\bpor ano\b/.test(q)?'year':null;
      return {...previous,question,q,period:year?yearPeriod(year):groupBy==='year'?null:previous.period,
        groupBy,monthlyYear:null,detail:!groupBy&&Boolean(previous.detail),refresh:true};
    }
    const detail=/\b(?:detalhe|detalhes|detalhar|discriminacao)\b|\b(?:lista|listar|mostra|mostrar|que|quais)\b.*\b(?:dias|datas)\b/.test(q);
    if(!detail||/\b(?:este|neste|passado|ultimos|outro|outra|202\d|ausencias|ferias|formacao|disponibilidade|seguro|progressoes)\b/.test(q))return null;
    if(!previous)return {type:'help',reason:'Pergunte primeiro pelos atrasos de um colaborador e indique o período. A seguir posso listar os dias.'};
    return {...previous,question,detail:true,refresh:false};
  }
  function latenessBreakdown(rows,groupBy){
    const groups=new Map();
    for(const row of rows){
      const day=typeof row.data==='string'?row.data.slice(0,10):'';
      if(D.day(day)===null)continue;
      const key=day.slice(0,groupBy==='year'?4:7);
      const group=groups.get(key)||{count:0,minutes:0};
      group.count++;
      group.minutes+=Number(row.minutos_atraso);
      groups.set(key,group);
    }
    const monthFormat=new Intl.DateTimeFormat('pt-PT',{month:'long',year:'numeric',timeZone:'UTC'});
    return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([key,group])=>
      '• '+(groupBy==='year'?key:monthFormat.format(new Date(key+'-01T12:00:00Z')))+
      ' · '+nf(group.count)+(group.count===1?' atraso':' atrasos')+' · '+nf(group.minutes)+' min'
    ).join('\n')||'Sem atrasos com data registada neste período.';
  }
  function answer(rows,p,directory=[]){
    if(p.type==='help')return p.reason;
    if(p.type==='date')return p.response;
    if(p.personName){
      const matches=namedPeople(rows,p,directory);
      if(!matches.length)return 'Não encontrei «'+p.personName+'» entre os colaboradores acessíveis. Indique o nome completo ou o número do colaborador.';
      if(matches.length>1)return 'Encontrei mais de um colaborador com esse nome. Indique «colaborador» seguido do número: '+matches.map(person=>person.name+' (n.º '+person.id+')').join(', ')+'.';
      const person=matches[0];
      const records=rows.filter(row=>A.person(row).id===person.id&&(!p.period||(typeof row.data==='string'&&row.data.slice(0,10)>=p.period.from&&row.data.slice(0,10)<=p.period.to)));
      const late=records.filter(row=>Number(row.minutos_atraso)>0);
      const unknown=records.filter(row=>row.minutos_atraso==null||row.minutos_atraso==='').length;
      let response=person.name+' · '+nf(late.length)+(late.length===1?' atraso registado':' atrasos registados')+' · '+nf(late.reduce((total,row)=>total+Number(row.minutos_atraso),0))+' minutos.'
        +(p.period?'\nPeríodo: '+date(p.period.from)+' a '+date(p.period.to)+'.':'')
        +(unknown?'\nRegistos por apurar: '+nf(unknown)+'.':'');
      if(p.groupBy){
        response+='\n\n'+(p.groupBy==='year'?'Por ano':'Por mês')+'\n'+latenessBreakdown(late,p.groupBy);
        if(p.monthlyYear)response+='\n\n'+p.monthlyYear+' por mês\n'+latenessBreakdown(late.filter(row=>typeof row.data==='string'&&row.data.startsWith(p.monthlyYear+'-')),'month');
      }
      if(p.detail&&late.length){
        const days=new Map();
        for(const row of late){
          const day=typeof row.data==='string'?row.data.slice(0,10):'';
          if(!days.has(day))days.set(day,{count:0,minutes:0});
          const item=days.get(day);
          item.count++;
          item.minutes+=Number(row.minutos_atraso);
        }
        const sorted=[...days].sort(([a],[b])=>a.localeCompare(b));
        response+='\n\n'+sorted.map(([day,item])=>'• '+date(day)+' · '+nf(item.minutes)+' min'+(item.count>1?' ('+item.count+' atrasos)':'')).join('\n');
      }
      return response;
    }
    const selected=selectPerson(rows,p.q);let data=selected.rows;
    if(['insured','uninsured','insuranceOverview'].includes(p.type)){
      const active=data.filter(r=>D.active(r.estado)===true);const insured=active.filter(r=>D.insurance(r.seguro_saude)===true);const uninsured=active.filter(r=>D.insurance(r.seguro_saude)===false);const unknown=active.length-insured.length-uninsured.length;
      if(p.type==='insuranceOverview')return 'Seguro de saúde · colaboradores ativos: '+insured.length+' inscritos, '+uninsured.length+' ainda não inscritos e '+unknown+' com estado do seguro por confirmar. Para prazos, pergunte por inscrições em atraso ou nos próximos 90 dias.';
      const list=p.type==='insured'?insured:uninsured;return (p.type==='insured'?'Já inscritos no seguro':'Ainda sem inscrição no seguro')+': '+list.length+' colaboradores ativos.\n'+list.slice(0,100).map(r=>'• '+A.person(r).name+' · '+(r.estabelecimento||'sem estabelecimento')+(p.type==='uninsured'?' · data prevista: '+date(r.data_seg_saude):'')).join('\n')+(list.length>100?'\nMostrados os primeiros 100.':'');
    }
    if(p.type==='deadlines'){
      const s=D.analyse(data,p.reference);const list=s[p.kind].filter(item=>p.status==='actions'?['overdue','upcoming'].includes(item.status):item.status===p.status);const type=p.kind==='progression'?'Progressões':'Inscrições no seguro de saúde';const label=p.status==='overdue'?'em atraso':p.status==='upcoming'?'de hoje até '+date(s.end):'em atraso ou até '+date(s.end);
      let output=type+' '+label+': '+list.length+' colaboradores ativos.\nData de consulta: '+date(p.reference)+'.\n';
      output+=list.slice(0,100).map(i=>'• '+A.person(i.row).name+' · '+(i.row.estabelecimento||'sem estabelecimento')+' · '+date(i.date)+' · '+(i.days<0?Math.abs(i.days)+' dias de atraso':i.days===0?'vence hoje':'daqui a '+i.days+' dias')).join('\n');
      if(!list.length)output+='Não há registos nesta situação entre os dados acessíveis.';
      if(list.length>100)output+='\nMostrados os primeiros 100 de '+list.length+'. Consulte o dashboard para filtrar.';
      return output+'\nDados a verificar: '+(p.kind==='progression'?s.missingProgression:s.missingInsurance)+'; atividade por confirmar: '+s.unknownActive+'.'+(p.kind==='insurance'?' Colaboradores com seguro «SIM» já estão inscritos e foram excluídos.':'');
    }
    if(p.period){if(p.area==='colaboradores'&&/vencimento|remuneracao|categoria|funcao|contrato|habilitacao/.test(p.q))return 'Os dados internos consultados não contêm um histórico por período destes campos. Consulte o valor atual pelo nome completo ou número do colaborador.';const field=p.area.startsWith('colaboradores')?'data_admissao':'data';if(!data.length||data.some(r=>Object.hasOwn(r,field)))data=data.filter(r=>typeof r[field]==='string'&&r[field].slice(0,10)>=p.period.from&&r[field].slice(0,10)<=p.period.to);else return 'A fonte não tem o campo de data necessário para este filtro. Não calculei um total sem aplicar o período pedido.';}
    if(p.type==='ranking'){
      const metric=p.area==='atrasos'?'minutos_atraso':p.rankBy==='count'?'':p.rankBy;const summary=Domain.aggregate(p.area,data,metric);
      const groups=summary.groups.filter(g=>g.identified&&(p.rankBy==='count'||g.known>0)).sort((a,b)=>(p.rankBy==='count'?b.count-a.count||b.total-a.total:b.total-a.total||b.count-a.count)||a.name.localeCompare(b.name,'pt'));
      const top=groups.slice(0,p.limit);const occurrence=p.area==='atrasos'?'atrasos':'registos';
      const criterion=p.rankBy==='count'?'número de '+occurrence:p.rankBy==='__dias'?'dias de disponibilidade':p.rankBy==='minutos_atraso'?'minutos de atraso':p.rankBy==='horas_arredondadas'?'horas arredondadas':'horas';
      let text='Top '+p.limit+' por '+criterion+' · '+top.length+' de '+groups.length+' colaboradores.\nOrdenação decrescente por '+criterion+'.';
      text+=p.period?'\nPeríodo: '+date(p.period.from)+' a '+date(p.period.to)+'.':'\nPeríodo: todos os registos disponíveis na fonte.';
      if(!top.length)return text+'\nNão há colaboradores com dados suficientes para este ranking nos registos acessíveis.';
      text+='\n'+top.map((g,i)=>(i+1)+'. '+g.name+(g.id?' · nº '+g.id:'')+' · '+(g.teams.join(', ')||'sem estabelecimento')+' · '+g.count+' '+occurrence+(metric?' · '+nf(g.known?g.total:null)+(metric==='__dias'?' dias':metric==='minutos_atraso'?' minutos':' horas')+(g.known<g.count?' ('+(g.count-g.known)+' registos sem valor)':''):'')).join('\n');
      if(p.area==='atrasos')text+='\nCada registo da tabela de atrasos conta como uma ocorrência; não representa necessariamente um dia distinto.';
      if(p.rankBy==='count')text+=' Empates são ordenados pelo total conhecido da medida, quando disponível, e pelo nome.';
      else text+=' Empates são ordenados pelo número de registos e pelo nome. Colaboradores sem valores da medida não entram neste ranking.';
      return text;
    }
    if(/\b(?:dados|informacao|vencimento|categoria|funcao|contrato|admissao|remuneracao|habilitacao)\b/.test(p.q)&&p.area==='colaboradores'){
      if(!selected.matched)return 'Indique o nome completo ou «colaborador» seguido do número para consultar os dados de uma pessoa.';
      if(!data.length)return 'Não encontrei esse colaborador nos registos permitidos à sua conta.';
      const fields=Object.keys(data[0]).filter(k=>p.q.includes(D.norm(k.replaceAll('_',' ')))||(['nome','num_colaborador','estabelecimento'].includes(k)));
      const show=fields.length>3?fields:['nome','num_colaborador','estabelecimento','funcao','categoria','estado'];return data.map(row=>show.filter(k=>Object.hasOwn(row,k)).map(k=>k.replaceAll('_',' ')+': '+(row[k]??'sem valor')).join('\n')).join('\n\n');
    }
    const metric=p.area==='disponibilidade'?'__dias':p.area==='horas_domingos_feriados'?'horas_arredondadas':p.area==='atrasos'?'minutos_atraso':['horas_extras','horas_formacao'].includes(p.area)?'horas':'';
    const s=Domain.aggregate(p.area,data,metric);let text='Registos: '+nf(s.count)+' · colaboradores identificados: '+nf(s.people)+'.';
    if(p.period)text+='\nPeríodo: '+date(p.period.from)+' a '+date(p.period.to)+(p.area.startsWith('colaboradores')?' (data de admissão).':'.');else text+='\nPeríodo: todos os registos disponíveis na fonte.';
    if(metric)text+='\nTotal de '+(metric==='__dias'?'dias de disponibilidade':metric.replaceAll('_',' '))+': '+nf(s.sum)+(metric==='__dias'?' dias':metric==='minutos_atraso'?' minutos':' horas')+'. Registos sem valor: '+s.missing+'.';
    if(/quem|por colaborador|resumo|equipa/.test(p.q)){text+='\n'+s.groups.slice(0,100).map(g=>'• '+g.name+(g.id?' · nº '+g.id:'')+' · '+g.count+' registos'+(metric?' · '+nf(g.known?g.total:null)+(metric==='__dias'?' dias':metric==='minutos_atraso'?' min':' h'):'')).join('\n');if(s.groups.length>100)text+='\nMostrados os primeiros 100 de '+s.groups.length+' colaboradores.';}
    if(p.area==='horas_domingos_feriados')text+='\nA medida usada é horas_arredondadas; não são somadas as horas picadas.';
    if(p.area==='disponibilidade')text+='\nCada colaborador/data conta uma vez. Marcadores 00:00–23:59 são excluídos.';
    if(p.area==='horas_formacao')text+='\nInclui Registo de Formação e Formação H. Laboral da Factorial, mais formação adicional de Excel.';
    return text;
  }
  const api={plan,answer,selectPerson,namedPeople,followUp};if(typeof module==='object'&&module.exports)module.exports=api;else root.RHConsultation=api;
})(typeof globalThis!=='undefined'?globalThis:this);
