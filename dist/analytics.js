(function(root){
  'use strict';
  const idFields=['num_colaborador','colaborador_id','id_colaborador','employee_id','id_employee','numero_colaborador'];
  function person(row){
    const field=idFields.find(k=>row[k]!==null&&row[k]!==undefined&&row[k]!=='');
    const name=String(row.nome||row.nome_colaborador||row.colaborador||row.name||'Sem identificação');
    return {key:field?'id:'+String(row[field]):'name:'+JSON.stringify([name,row.estabelecimento||'']),name,id:field?String(row[field]):null,identified:Boolean(field||name!=='Sem identificação')};
  }
  function numericFields(rows){return [...new Set(rows.flatMap(Object.keys))].filter(k=>!/(^id($|_)|_id$|^num_|^numero_|^ano$|^mes$|^nivel$)/i.test(k)&&rows.some(r=>typeof r[k]==='number'&&Number.isFinite(r[k])));}
  function dateFields(rows){return [...new Set(rows.flatMap(Object.keys))].filter(k=>!/(sincroniz|criado|atualiz)/i.test(k)&&rows.some(r=>typeof r[k]==='string'&&/^\d{4}-\d{2}-\d{2}(T|$)/.test(r[k])));}
  function aggregate(rows,metric=''){
    const groups=new Map();let sum=0,known=0;
    for(const row of rows){const p=person(row);if(!groups.has(p.key))groups.set(p.key,{...p,count:0,total:0,known:0,teams:new Set(),days:new Set()});const g=groups.get(p.key);g.count++;if(row.estabelecimento)g.teams.add(row.estabelecimento);if(typeof row.data==='string')g.days.add(row.data.slice(0,10));if(metric&&typeof row[metric]==='number'&&Number.isFinite(row[metric])){g.total+=row[metric];g.known++;sum+=row[metric];known++;}}
    const list=[...groups.values()].map(g=>({...g,teams:[...g.teams].sort(),days:g.days.size})).sort((a,b)=>(metric?b.total-a.total:b.count-a.count)||b.count-a.count||a.name.localeCompare(b.name,'pt'));
    const people=list.filter(g=>g.identified).length;
    return {groups:list,count:rows.length,people,sum:metric&&known?sum:null,known,missing:metric?rows.length-known:0,average:people&&list.every(g=>g.identified)?rows.length/people:null};
  }
  async function fetchAll(fetchPage,{batch=500,maximum=100000,cancelled=()=>false,onProgress=()=>{}}={}){
    const rows=[];let expected=null;
    for(;;){if(cancelled())return null;const page=await fetchPage(rows.length,batch);if(cancelled())return null;
      if(!Array.isArray(page.rows))throw new Error('Resposta inválida ao carregar a análise.');
      if(page.total!==null&&page.total!==undefined){if(!Number.isSafeInteger(page.total)||page.total<0)throw new Error('Total de registos inválido.');if(expected!==null&&expected!==page.total)throw new Error('Os dados mudaram durante a consulta. Atualize para obter totais consistentes.');expected=page.total;}
      if(expected!==null&&expected>maximum)throw new Error('O volume excede o limite de análise desta versão. Os totais não foram calculados.');
      const before=rows.length;rows.push(...page.rows);if(rows.length>maximum)throw new Error('O volume excede o limite de análise desta versão.');onProgress(rows.length,expected);
      if(expected!==null&&rows.length===expected)return rows;
      if(expected!==null&&rows.length>expected)throw new Error('Os dados mudaram durante a consulta. Atualize a análise.');
      if(rows.length===before){if(expected===null)return rows;throw new Error('Consulta incompleta. Os totais não foram calculados.');}
      // Do not infer completeness from a short page: the API may cap page size.
    }
  }
  const api={person,numericFields,dateFields,aggregate,fetchAll};if(typeof module==='object'&&module.exports)module.exports=api;else root.RHAnalytics=api;
})(typeof globalThis!=='undefined'?globalThis:this);
