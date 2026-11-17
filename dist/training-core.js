(function(root){
  'use strict';
  const D=typeof module==='object'&&module.exports?require('./deadlines.js'):root.RHDeadlines;
  const norm=v=>D.norm(v).replace(/[^a-z0-9]+/g,'');
  const clean=v=>String(v??'').normalize('NFC').replace(/\s+/g,' ').trim();
  const aliases={num_colaborador:['numcolaborador','numerocolaborador','numerodocolaborador','ncolaborador','nocolaborador','colaboradorid','idcolaborador','employeeid'],nome:['nome','colaborador','nomedocolaborador','name'],data:['data','date','dataformacao','datadeformacao'],horas:['horas','hora','hours','duracao','horasformacao'],tema:['tema','formacao','curso','topic','assunto'],estabelecimento:['estabelecimento','farmacia','departamento','farmaciadepartamento']};
  function key(r){return JSON.stringify([Number(r.num_colaborador),r.data,clean(r.tema)]);}
  function hours(value){if(typeof value==='number')return Number.isFinite(value)&&value>=0?value:null;const s=clean(value);if(/^\d+:\d{2}$/.test(s)){const [h,m]=s.split(':').map(Number);return m<60?h+m/60:null;}if(!/^\d+(?:[.,]\d+)?$/.test(s))return null;const n=Number(s.replace(',','.'));return Number.isFinite(n)?n:null;}
  function date(value){const s=clean(value);if(D.day(s)!==null)return s;const m=s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);if(!m)return null;const iso=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');return D.day(iso)===null?null:iso;}
  function preview(matrix,employees,existing=[],factorial=[]){
    if(!Array.isArray(matrix)||matrix.length<2)throw new Error('O ficheiro não tem linhas de formação para importar.');
    const headers=matrix[0].map(norm);const col={};for(const [field,names] of Object.entries(aliases)){const matches=headers.map((h,i)=>names.includes(h)?i:-1).filter(i=>i>=0);if(matches.length>1)throw new Error('Há mais de uma coluna para '+field+'.');col[field]=matches[0]??-1;}
    for(const field of ['data','horas','tema'])if(col[field]<0)throw new Error('Falta a coluna '+field+'.');if(col.num_colaborador<0&&col.nome<0)throw new Error('Inclua Número do colaborador ou Nome para identificar a pessoa.');
    const peopleById=new Map();const peopleByName=new Map();for(const person of employees){const id=Number(person.num_colaborador);if(Number.isInteger(id)&&id>0)peopleById.set(id,person);const name=D.norm(clean(person.nome));if(name){if(!peopleByName.has(name))peopleByName.set(name,[]);peopleByName.get(name).push(person);}}
    const existingKeys=new Set(existing.map(key));const factorialKeys=new Set(factorial.map(key));const seen=new Map();const errors=[];const duplicates=[];const rows=[];let creates=0,updates=0;
    for(let i=1;i<matrix.length;i++){const cells=matrix[i];if(!cells||cells.every(v=>v===null||v===undefined||clean(v)===''))continue;
      const get=field=>col[field]<0?null:cells[col[field]];const errorsBefore=errors.length;let person;const rawId=get('num_colaborador');
      if(rawId!==null&&rawId!==undefined&&clean(rawId)!==''){const id=Number(rawId);person=Number.isInteger(id)&&id>0?peopleById.get(id):null;if(!person)errors.push('Linha '+(i+1)+': número de colaborador inválido ou não acessível.');}
      else{const matches=peopleByName.get(D.norm(clean(get('nome'))))||[];if(matches.length!==1)errors.push('Linha '+(i+1)+': nome não encontrado ou ambíguo; indique o número do colaborador.');else person=matches[0];}
      if(person&&!clean(person.nome))errors.push('Linha '+(i+1)+': o colaborador não tem nome definido na origem.');
      if(person&&get('nome')&&D.norm(clean(get('nome')))!==D.norm(clean(person.nome)))errors.push('Linha '+(i+1)+': nome e número de colaborador não correspondem.');
      const dateValue=date(get('data')),hourValue=hours(get('horas')),tema=clean(get('tema'));
      if(!dateValue)errors.push('Linha '+(i+1)+': data inválida. Use AAAA-MM-DD ou DD/MM/AAAA.');if(hourValue===null)errors.push('Linha '+(i+1)+': horas inválidas. Use um número não negativo ou HH:MM.');if(!tema)errors.push('Linha '+(i+1)+': tema obrigatório.');
      if(errors.length!==errorsBefore)continue;
      const row={num_colaborador:Number(person.num_colaborador),nome:person.nome,estabelecimento:person.estabelecimento??null,data:dateValue,horas:hourValue,tema,origem:'upload manual'};const k=key(row);
      if(factorialKeys.has(k)){errors.push('Linha '+(i+1)+': esta chave já existe na formação Factorial; não importe a mesma formação como adicional.');continue;}
      if(seen.has(k)){const previous=seen.get(k);if(previous.horas!==row.horas)errors.push('Linha '+(i+1)+': chave repetida com horas diferentes no mesmo ficheiro.');else duplicates.push(i+1);continue;}
      seen.set(k,row);rows.push(row);existingKeys.has(k)?updates++:creates++;
    }
    if(rows.length>2000)errors.push('Limite de 2000 registos por importação. Divida o ficheiro.');if(!rows.length&&!errors.length)errors.push('Não há registos de formação para importar.');
    return {rows,errors,duplicates,creates,updates};
  }
  function matrixFromSheet(workbook,name,XLSX){
    const sheet=workbook.Sheets[name];if(!sheet?.['!ref'])throw new Error('A folha está vazia.');const range=XLSX.utils.decode_range(sheet['!ref']);if(range.e.r>2000||range.e.c>99)throw new Error('Limite de 2000 linhas de dados e 100 colunas por folha.');if(range.s.r!==0)throw new Error('Coloque os cabeçalhos na primeira linha da folha.');
    // Read the public cell value directly so formatted durations stay numeric.
    const matrix=Array.from({length:range.e.r+1},(_,r)=>Array.from({length:range.e.c+1},(_,c)=>sheet[XLSX.utils.encode_cell({r,c})]?.v??null));const headers=matrix[0].map(norm);const dateCol=headers.findIndex(v=>aliases.data.includes(v));const hoursCol=headers.findIndex(v=>aliases.horas.includes(v));
    for(let r=0;r<=range.e.r;r++)for(let c=0;c<=range.e.c;c++){const cell=sheet[XLSX.utils.encode_cell({r,c})];if(cell?.f)throw new Error('A célula '+XLSX.utils.encode_cell({r,c})+' contém uma fórmula. Importe valores, não fórmulas.');}
    for(let r=1;r<matrix.length;r++){
      if(dateCol>=0&&typeof matrix[r][dateCol]==='number'){const d=XLSX.SSF.parse_date_code(matrix[r][dateCol],{date1904:Boolean(workbook.Workbook?.WBProps?.date1904)});matrix[r][dateCol]=d?String(d.y).padStart(4,'0')+'-'+String(d.m).padStart(2,'0')+'-'+String(d.d).padStart(2,'0'):null;}
      if(hoursCol>=0&&typeof matrix[r][hoursCol]==='number'){const cell=sheet[XLSX.utils.encode_cell({r,c:hoursCol})];const format=String(cell?.z||'').toLowerCase().replace(/"[^"]*"/g,'');if(/[hms]/.test(format)&&!/[yd]/.test(format)&&format!=='general')matrix[r][hoursCol]*=24;}
    }return matrix;
  }
  const api={key,hours,date,preview,clean,matrixFromSheet};if(typeof module==='object'&&module.exports)module.exports=api;else root.RHTraining=api;
})(typeof globalThis!=='undefined'?globalThis:this);
