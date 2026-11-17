(function(root){
  'use strict';
  const key=r=>String(r.num_colaborador??r.id_factorial??JSON.stringify([r.nome,r.estabelecimento]));
  const status=r=>r.ativo===true?'active':r.ativo===false?'inactive':'unknown';
  const classification=(r,field)=>String(r[field]||'').trim()||'Por preencher';
  const unique=rows=>[...new Map(rows.map(r=>[key(r),r])).values()];
  function filter(rows,{activity='',category='',job=''}={}){return rows.filter(r=>(!activity||status(r)===activity)&&(!category||classification(r,'categoria')===category)&&(!job||classification(r,'funcao')===job));}
  function analyse(rows,field='categoria'){
    const people=unique(rows),groups=new Map();
    for(const r of people){const name=field==='colaborador'?String(r.nome||'Sem nome'):classification(r,field);const id=field==='colaborador'?key(r):name;if(!groups.has(id))groups.set(id,{key:id,name,count:0,active:0,inactive:0,unknown:0});const g=groups.get(id);g.count++;g[status(r)]++;}
    return {people:people.length,active:people.filter(r=>status(r)==='active').length,inactive:people.filter(r=>status(r)==='inactive').length,unknown:people.filter(r=>status(r)==='unknown').length,groups:[...groups.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'pt'))};
  }
  const api={key,status,classification,unique,filter,analyse};if(typeof module==='object'&&module.exports)module.exports=api;else root.RHEmployees=api;
})(typeof globalThis!=='undefined'?globalThis:this);
