(function(root){
  'use strict';
  const areas=['atrasos','horas_extras','horas_domingos_feriados','disponibilidade'];
  const globalAreas=[...areas,'colaboradores_factorial','colaboradores','ausencias','ferias','horas_formacao'];
  function allowed(profile,area) {
    const role=String(profile?.perfil||'').trim().toLowerCase();
    if(role==='gerente')return areas.includes(area);
    if(role==='administracao'||role==='direcao')return globalAreas.includes(area);
    return role==='formacao'&&area==='horas_formacao';
  }
  // Excel interprets leading control characters and = + - @ as formulas in CSV.
  const safe=value=>typeof value==='string'&&/^[\s\u0000-\u001f]*[=+\-@]/.test(value)?"'"+value:value;
  function csv(matrix){return '\ufeff'+matrix.map(row=>row.map(v=>'"'+(typeof v==='number'?String(v).replace('.',','):String(safe(v??''))).replaceAll('"','""')+'"').join(';')).join('\r\n');}
  function detail(area,rows,person){
    if(area==='disponibilidade')return [...new Map(rows.filter(r=>typeof r.data==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(r.data)&&Number.isFinite(Date.parse(r.data))&&new Date(r.data).toISOString().slice(0,10)===r.data).map(r=>[JSON.stringify([person(r).key,r.data]),{num_colaborador:r.num_colaborador??person(r).id,nome:person(r).name,estabelecimento:r.estabelecimento,data:r.data,dias:1}])).values()];
    return rows.map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>area!=='horas_domingos_feriados'||k!=='horas')));
  }
  const api={allowed,safe,csv,detail};if(typeof module==='object'&&module.exports)module.exports=api;else root.RHExport=api;
})(typeof globalThis!=='undefined'?globalThis:this);
