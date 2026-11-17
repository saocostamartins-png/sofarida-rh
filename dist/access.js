(function(root){
  'use strict';
  const role=profile=>String(profile?.perfil||'').trim().toLowerCase();
  const standard=profile=>['administracao','direcao','gerente'].includes(role(profile));
  const trainingOnly=profile=>role(profile)==='formacao';
  const canArea=(profile,area)=>(standard(profile)&&!(role(profile)==='gerente'&&area==='colaboradores'))||(trainingOnly(profile)&&area==='horas_formacao');
  const canSource=(profile,table)=>(standard(profile)&&!(role(profile)==='gerente'&&table==='colaboradores'))||(trainingOnly(profile)&&['ausencias','horas_formacao_manual'].includes(table));
  const canUpload=profile=>['administracao','direcao','formacao'].includes(role(profile));
  const api={role,standard,trainingOnly,canArea,canSource,canUpload};if(typeof module==='object'&&module.exports)module.exports=api;else root.RHAccess=api;
})(typeof globalThis!=='undefined'?globalThis:this);
