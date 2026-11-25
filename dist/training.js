'use strict';
let trainingGeneration=0;let trainingWorkbook=null;let trainingPending=null;let trainingBusy=false;
let trainingPeopleCache=null;let trainingPeopleEpoch=-1;let trainingPeopleLoading=false;let trainingEditingId=null;let trainingSingleBusy=false;
function canUploadTraining(){return Boolean(state.session&&state.profile&&Access.canUpload(state.profile));}
function renderTrainingControls(){const active=state.view==='data'&&state.area[0]==='horas_formacao';$('training-upload').hidden=!active||!canUploadTraining();$('training-readonly').hidden=!active||canUploadTraining();$('training-save').disabled=trainingBusy||!trainingPending||!canUploadTraining();$('training-file').disabled=trainingBusy;$('training-sheet').disabled=trainingBusy||!trainingWorkbook;$('training-preview-button').disabled=trainingBusy||!trainingWorkbook||!canUploadTraining();$('training-single-save').disabled=trainingSingleBusy||!canUploadTraining();$('training-single-cancel').disabled=trainingSingleBusy;renderManualRecords();if(active&&canUploadTraining())ensureTrainingPeople();}
function resetTraining(){trainingGeneration++;trainingWorkbook=null;trainingPending=null;trainingBusy=false;$('training-file').value='';$('training-sheet').replaceChildren();$('training-sheet').disabled=true;$('training-preview-body').replaceChildren();$('training-preview').hidden=true;$('training-save').hidden=true;$('training-errors').textContent='';$('training-status').textContent='';trainingPeopleCache=null;trainingPeopleEpoch=-1;resetTrainingSingleForm();renderTrainingControls();}
function resetTrainingSingleForm(){trainingEditingId=null;$('training-single-employee').value='';$('training-single-date').value='';$('training-single-hours').value='';$('training-single-topic').value='';$('training-single-save').textContent='Gravar registo';$('training-single-cancel').hidden=true;$('training-single-error').textContent='';$('training-single-status').textContent='';}
async function ensureTrainingPeople(){
  if(trainingPeopleEpoch===state.authEpoch&&trainingPeopleCache)return;
  if(trainingPeopleLoading)return;trainingPeopleLoading=true;const epoch=state.authEpoch;
  try{
    const people=await readTrainingPeople(()=>state.authEpoch!==epoch);
    if(!people||state.authEpoch!==epoch)return;
    trainingPeopleCache=people;trainingPeopleEpoch=epoch;
    const select=$('training-single-employee');const keep=select.value;select.replaceChildren(new Option('Selecione…',''));
    for(const person of [...people].sort((a,b)=>String(a.nome).localeCompare(String(b.nome),'pt')))select.append(new Option(person.nome+' · '+person.num_colaborador,String(person.num_colaborador)));
    if([...select.options].some(o=>o.value===keep))select.value=keep;
  }catch(error){$('training-single-error').textContent=message(error);}finally{trainingPeopleLoading=false;}
}
function manualRecordsFromState(){if(!state.complete||state.area[0]!=='horas_formacao')return [];return state.allRows.filter(r=>r.origem==='Excel').slice().sort((a,b)=>(b.data||'').localeCompare(a.data||''));}
function renderManualRecords(){
  const body=$('training-manual-body');if(!body)return;body.replaceChildren();
  const rows=state.view==='data'&&state.area[0]==='horas_formacao'?manualRecordsFromState():[];
  $('training-manual-wrap').hidden=!(state.view==='data'&&state.area[0]==='horas_formacao');
  $('training-manual-note').textContent=state.complete?format(rows.length)+' registos manuais acessíveis à sua conta.':'A aguardar consulta completa.';
  for(const row of rows){
    const tr=document.createElement('tr');
    for(const value of [row.nome+' · '+row.num_colaborador,row.estabelecimento||'—',format(row.data),format(row.horas),row.tema||'—',row.carregado_por||'—'])tr.append(textCell('td',value));
    const actions=document.createElement('td');
    if(canUploadTraining()){
      const id=Number(String(row.id).split(':')[1]);
      const editButton=document.createElement('button');editButton.type='button';editButton.className='secondary';editButton.textContent='Editar';
      editButton.addEventListener('click',()=>{
        trainingEditingId=id;$('training-single-employee').value=String(row.num_colaborador);$('training-single-date').value=row.data||'';$('training-single-hours').value=row.horas??'';$('training-single-topic').value=row.tema||'';
        $('training-single-save').textContent='Guardar edição';$('training-single-cancel').hidden=false;$('training-single-error').textContent='';$('training-single-status').textContent='';
        $('training-single-employee').scrollIntoView({behavior:'smooth',block:'center'});
      });
      const deleteButton=document.createElement('button');deleteButton.type='button';deleteButton.className='secondary';deleteButton.textContent='Apagar';
      deleteButton.addEventListener('click',async()=>{
        if(trainingSingleBusy||!confirm('Apagar o registo de formação de '+row.nome+' em '+format(row.data)+' ('+(row.tema||'sem tema')+')? Não pode ser desfeito.'))return;
        trainingSingleBusy=true;renderTrainingControls();
        try{await request('/rest/v1/horas_formacao_manual?id=eq.'+id,{method:'DELETE',token:await token()});if(trainingEditingId===id)resetTrainingSingleForm();if(state.area[0]==='horas_formacao'&&state.view==='data')await load();}
        catch(error){$('training-single-error').textContent=message(error);}finally{trainingSingleBusy=false;renderTrainingControls();}
      });
      actions.append(editButton,document.createTextNode(' '),deleteButton);
    }
    tr.append(actions);body.append(tr);
  }
}
$('training-single-save').addEventListener('click',async()=>{
  if(trainingSingleBusy||!canUploadTraining())return;$('training-single-error').textContent='';$('training-single-status').textContent='';
  const numColaborador=Number($('training-single-employee').value);const person=(trainingPeopleCache||[]).find(p=>Number(p.num_colaborador)===numColaborador);
  const dataValue=$('training-single-date').value;const horas=RHTraining.hours($('training-single-hours').value);const tema=RHTraining.clean($('training-single-topic').value);
  if(!person){$('training-single-error').textContent='Selecione um colaborador.';return;}
  if(!dataValue){$('training-single-error').textContent='Indique a data.';return;}
  if(horas===null){$('training-single-error').textContent='Indique as horas (número não negativo, ou HH:MM).';return;}
  if(!tema){$('training-single-error').textContent='Indique o tema.';return;}
  trainingSingleBusy=true;renderTrainingControls();
  try{
    const timestamp=new Date().toISOString();
    const body={num_colaborador:numColaborador,nome:person.nome,estabelecimento:person.estabelecimento??null,data:dataValue,horas,tema,origem:'upload manual',carregado_em:timestamp,carregado_por:state.profile.email};
    if(trainingEditingId)await request('/rest/v1/horas_formacao_manual?id=eq.'+trainingEditingId,{method:'PATCH',body,token:await token(),headers:{Prefer:'return=representation'}});
    else await request('/rest/v1/horas_formacao_manual?on_conflict=num_colaborador%2Cdata%2Ctema',{method:'POST',body,token:await token(),headers:{Prefer:'resolution=merge-duplicates,return=representation'}});
    const wasEditing=Boolean(trainingEditingId);resetTrainingSingleForm();$('training-single-status').textContent=wasEditing?'Registo atualizado.':'Registo gravado.';
    if(state.area[0]==='horas_formacao'&&state.view==='data')await load();
  }catch(error){$('training-single-error').textContent=message(error);}finally{trainingSingleBusy=false;renderTrainingControls();}
});
$('training-single-cancel').addEventListener('click',resetTrainingSingleForm);
$('training-file').addEventListener('change',async()=>{
  const file=$('training-file').files?.[0];trainingGeneration++;const generation=trainingGeneration,epoch=state.authEpoch;trainingWorkbook=null;trainingPending=null;$('training-preview-body').replaceChildren();$('training-preview').hidden=true;$('training-save').hidden=true;$('training-errors').textContent='';$('training-status').textContent='';$('training-sheet').replaceChildren();$('training-sheet').disabled=true;renderTrainingControls();if(!file)return;
  try{if(!canUploadTraining())throw new Error('Esta conta não pode importar formação.');if(!/\.xlsx?$/i.test(file.name))throw new Error('Selecione um ficheiro .xlsx ou .xls.');if(file.size>5*1024*1024)throw new Error('O ficheiro excede o limite de 5 MB.');if(typeof XLSX==='undefined')throw new Error('Não foi possível carregar o leitor de Excel. Atualize a página.');
    const bytes=await file.arrayBuffer();if(generation!==trainingGeneration||epoch!==state.authEpoch)return;trainingWorkbook=XLSX.read(bytes,{type:'array',cellDates:false,cellNF:true});for(const name of trainingWorkbook.SheetNames)$('training-sheet').append(new Option(name,name));$('training-sheet').disabled=false;$('training-status').textContent='Selecione a folha e clique em Validar e pré-visualizar.';
  }catch(error){if(generation===trainingGeneration)$('training-errors').textContent=message(error);}finally{if(generation===trainingGeneration)renderTrainingControls();}
});
$('training-sheet').addEventListener('change',()=>{trainingGeneration++;trainingPending=null;$('training-preview').hidden=true;$('training-save').hidden=true;$('training-errors').textContent='';$('training-status').textContent='Folha alterada. Valide novamente antes de importar.';renderTrainingControls();});
$('training-preview-button').addEventListener('click',async()=>{
  if(trainingBusy||!trainingWorkbook||!canUploadTraining())return;const generation=++trainingGeneration,epoch=state.authEpoch;const cancelled=()=>generation!==trainingGeneration||epoch!==state.authEpoch||!canUploadTraining();trainingBusy=true;trainingPending=null;$('training-errors').textContent='';$('training-status').textContent='A validar os colaboradores e as chaves existentes…';$('training-preview').hidden=true;$('training-save').hidden=true;renderTrainingControls();
  try{const matrix=RHTraining.matrixFromSheet(trainingWorkbook,$('training-sheet').value,XLSX);const [employees,existing,absenceSource]=await Promise.all([readTrainingPeople(cancelled),readSourceRows('horas_formacao_manual',cancelled),readSourceRows('ausencias',cancelled)]);if(cancelled()||[employees,existing,absenceSource].some(r=>r===null))return;
    const result=RHTraining.preview(matrix,employees,existing,RHDomain.combineTraining(absenceSource,[]));$('training-preview-body').replaceChildren();for(const row of result.rows.slice(0,50)){const tr=document.createElement('tr');for(const value of [row.nome+' · '+row.num_colaborador,row.estabelecimento||'—',format(row.data),format(row.horas),row.tema])tr.append(textCell('td',value));$('training-preview-body').append(tr);}
    $('training-preview').hidden=!result.rows.length;$('training-errors').textContent=result.errors.slice(0,30).join('\n')+(result.errors.length>30?'\nMais '+(result.errors.length-30)+' erros.':'');
    $('training-status').textContent=result.rows.length+' chaves únicas · '+result.creates+' novas · '+result.updates+' a atualizar · '+result.duplicates.length+' linhas repetidas idênticas ignoradas. Pré-visualização das primeiras 50 linhas. '+(result.errors.length?'Corrija os erros no ficheiro; nada foi gravado.':'Confira os dados e clique em Importar para gravar.');
    if(!result.errors.length){trainingPending=result.rows;$('training-save').hidden=false;$('training-save').textContent='Importar '+result.rows.length+' registos';}
  }catch(error){if(!cancelled()){$('training-errors').textContent=message(error);$('training-status').textContent='A validação não foi concluída. Nada foi gravado.';}}finally{if(generation===trainingGeneration){trainingBusy=false;renderTrainingControls();}}
});
$('training-save').addEventListener('click',async()=>{
  if(trainingBusy||!trainingPending||!canUploadTraining())return;const generation=trainingGeneration,epoch=state.authEpoch;const cancelled=()=>generation!==trainingGeneration||epoch!==state.authEpoch;const rows=trainingPending;trainingBusy=true;renderTrainingControls();$('training-errors').textContent='';$('training-status').textContent='A gravar as chaves validadas…';
  try{const timestamp=new Date().toISOString();const body=rows.map(r=>({...r,carregado_em:timestamp,carregado_por:state.profile.email}));await request('/rest/v1/horas_formacao_manual?on_conflict=num_colaborador%2Cdata%2Ctema',{method:'POST',body,token:await token(),headers:{Prefer:'resolution=merge-duplicates,return=representation'}});if(cancelled())return;
    trainingPending=null;$('training-save').hidden=true;$('training-status').textContent=rows.length+' registos gravados por colaborador + data + tema. Recarregar as mesmas chaves atualiza as horas, sem criar duplicados.';if(state.area[0]==='horas_formacao'&&state.view==='data')await load();
  }catch(error){if(!cancelled()){$('training-errors').textContent=message(error);$('training-status').textContent='Não foi possível confirmar a gravação. Atualize os dados antes de repetir. Repetir as mesmas chaves não duplica registos.';}}finally{if(!cancelled()){trainingBusy=false;renderTrainingControls();}}
});
$('training-template').addEventListener('click',()=>{if(typeof XLSX==='undefined'){$('training-errors').textContent='O leitor de Excel não está disponível. Atualize a página.';return;}const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Número do colaborador','Nome','Data','Horas','Tema']]),'Formação adicional');XLSX.writeFile(book,'Modelo_formacao_adicional.xlsx');});
renderTrainingControls();
