(function(root){
  'use strict';
  const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  function day(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const stamp=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==value)return null;return stamp/86400000;}
  function today(now=new Date()){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const part=t=>parts.find(p=>p.type===t).value;return part('year')+'-'+part('month')+'-'+part('day');}
  function plus(date,days){const d=day(date);return d===null?null:new Date((d+days)*86400000).toISOString().slice(0,10);}
  function active(value){const s=norm(value);if(['ativo','activa','ativa','active'].includes(s))return true;if(['inativo','inativa','saiu','saida','cessado','cessada','inactive','desligado','desligada','demitido'].includes(s))return false;return null;}
  function insurance(value){const s=norm(value);if(['sim','inscrito','inscrita','ativo','ativa','true'].includes(s))return true;if(['nao','nao inscrito','nao inscrita','por inscrever','pendente','false'].includes(s))return false;return null;}
  function status(date,reference){const due=day(date),base=day(reference);if(due===null||base===null)return {status:'unknown',days:null};const days=due-base;return {status:days<0?'overdue':days<=90?'upcoming':'later',days};}
  function analyse(rows,reference=today()){
    if(day(reference)===null)throw new Error('Data de consulta inválida.');
    const result={reference,end:plus(reference,90),progression:[],insurance:[],excluded:0,unknownActive:0,insured:0,counts:{progressionOverdue:0,progressionUpcoming:0,insuranceOverdue:0,insuranceUpcoming:0},missingProgression:0,missingInsurance:0};
    for(const row of rows){const a=active(row.estado);if(a===false){result.excluded++;continue;}if(a===null){result.unknownActive++;continue;}
      const p={row,date:row.proxima_progressao||null,...status(row.proxima_progressao,reference)};result.progression.push(p);if(p.status==='overdue')result.counts.progressionOverdue++;if(p.status==='upcoming')result.counts.progressionUpcoming++;if(p.status==='unknown')result.missingProgression++;
      const enrolled=insurance(row.seguro_saude);if(enrolled===true){result.insured++;continue;}
      const s={row,date:row.data_seg_saude||null,...(enrolled===null?{status:'unknown',days:null}:status(row.data_seg_saude,reference))};result.insurance.push(s);if(s.status==='overdue')result.counts.insuranceOverdue++;if(s.status==='upcoming')result.counts.insuranceUpcoming++;if(s.status==='unknown')result.missingInsurance++;
    }
    const compare=(a,b)=>(a.days??Infinity)-(b.days??Infinity)||String(a.row.nome||'').localeCompare(String(b.row.nome||''),'pt');result.progression.sort(compare);result.insurance.sort(compare);return result;
  }
  const api={norm,day,today,plus,active,insurance,status,analyse};if(typeof module==='object'&&module.exports)module.exports=api;else root.RHDeadlines=api;
})(typeof globalThis!=='undefined'?globalThis:this);
