(function(root){
  'use strict';
  const A=typeof module==='object'&&module.exports?require('./analytics.js'):root.RHAnalytics;
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const isTraining=r=>['registo de formacao','formacao h laboral'].includes(norm(r.tipo));
  const clockError=r=>/(?:^|[^\d])00:00\s*[-–—]\s*23:59(?:$|[^\d])/.test(String(r.picagens??''));
  function prepare(area,rows){
    const excludeClock=['disponibilidade','horas_domingos_feriados'].includes(area);
    const result=rows.filter(r=>!excludeClock||!clockError(r));
    if(area==='horas_extras'){
      return result.map(row=>{
        const compensation=[row.descricao,row.tipo,row.motivo].some(value=>/\bcompensacao (?:de )?horas\b/.test(norm(value)));
        return compensation&&Number.isFinite(row.horas)&&row.horas>0?{...row,horas:-row.horas}:row;
      });
    }
    Object.defineProperty(result,'clockErrorsExcluded',{value:excludeClock?rows.length-result.length:0});
    return result;
  }
  function aggregate(area,rows,metric=''){
    if(area!=='disponibilidade')return A.aggregate(rows,metric);
    const valid=rows.filter(r=>!clockError(r));const base=A.aggregate(valid);const dates=new Map();const counts=new Map();for(const row of valid){if(typeof row.data!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.data)||!Number.isFinite(Date.parse(row.data+'T00:00:00Z'))||new Date(row.data+'T00:00:00Z').toISOString().slice(0,10)!==row.data)continue;const key=A.person(row).key;if(!dates.has(key))dates.set(key,new Set());dates.get(key).add(row.data);counts.set(key,(counts.get(key)||0)+1);}
    let total=0,dated=0;for(const g of base.groups){g.days=dates.get(g.key)?.size||0;g.total=g.days;g.known=counts.get(g.key)||0;dated+=g.known;total+=g.days;}base.groups.sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'pt'));return {...base,sum:total,known:dated,missing:valid.length-dated,average:base.people?total/base.people:null};
  }
  function absentism(rows){const data=rows.filter(r=>!isTraining(r));const days=A.aggregate(data,'dias'),hours=A.aggregate(data,'horas');const byKey=new Map(hours.groups.map(g=>[g.key,g]));return {count:data.length,days:days.sum,hours:hours.sum,groups:days.groups.map(g=>({...g,daysTotal:g.known?g.total:null,hoursTotal:byKey.get(g.key)?.known?byKey.get(g.key).total:null,missingDays:g.count-g.known,missingHours:g.count-(byKey.get(g.key)?.known||0)}))};}
  function combineTraining(factorial,manual){return [...factorial.filter(isTraining).map(r=>({id:'factorial:'+r.id_ausencia,num_colaborador:r.num_colaborador,nome:r.nome,estabelecimento:r.estabelecimento,data:r.data,data_fim:r.data_fim,horas:r.horas,tema:r.tipo,origem:'Factorial',estado:r.estado,sincronizado_em:r.sincronizado_em})),...manual.map(r=>({...r,id:'manual:'+r.id,origem:'Excel',sincronizado_em:r.carregado_em}))];}

  function fullDayAbsence(row) {
    if (isTraining(row) || row.num_colaborador==null || !row.data) return false;
    if (row.data_fim && row.data_fim!==row.data) return false;
    if (row.meio_dia===true || /^(sim|true|1)$/i.test(String(row.meio_dia))) return false;
    if (/pendent|pending|rejeitad|cancel|denegad|rejected|denied|recusad|draft|rascunho/i.test(row.estado||'')) return false;
    return Number.isFinite(Number(row.horas)) && Number(row.horas)>=8;
  }

  function excludeFullDayLateness(rows, absences) {
    const excused = new Set(absences.filter(fullDayAbsence).map(row=>JSON.stringify([String(row.num_colaborador),row.data])));
    const filtered = rows.filter(row=>!(Number(row.minutos_atraso)>0 && excused.has(JSON.stringify([String(row.num_colaborador),row.data]))));
    Object.defineProperty(filtered,'excusedLateness',{value:rows.length-filtered.length});
    return filtered;
  }
  const api={norm,isTraining,clockError,prepare,aggregate,absentism,combineTraining,fullDayAbsence,excludeFullDayLateness};if(typeof module==='object'&&module.exports)module.exports=api;else root.RHDomain=api;
})(typeof globalThis!=='undefined'?globalThis:this);
