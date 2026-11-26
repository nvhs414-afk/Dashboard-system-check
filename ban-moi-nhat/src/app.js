import React from 'react';
import {createRoot} from 'react-dom/client';
import {Upload, Layers3, FolderOpen, ScanSearch, Trash2, ShieldCheck, ListChecks, ClipboardList, CheckCheck, Download, Printer} from 'lucide-react';
import {allowedExt,extension,readParts,unzipDocuments,releaseOcr} from './readers.js';
import {sourceType,extractDocument,resolveCandidates} from './extraction.js';
import {words, numericValue} from './schema.js';

const icons={upload:Upload,layers:Layers3,folder:FolderOpen,scan:ScanSearch,trash:Trash2,shield:ShieldCheck,list:ListChecks,clipboard:ClipboardList,check:CheckCheck,download:Download,printer:Printer};
document.querySelectorAll('[data-icon]').forEach(el=>{let component=icons[el.dataset.icon];if(!component)return;let span=document.createElement('span');span.className='lucide-slot';span.setAttribute('aria-hidden','true');el.prepend(span);createRoot(span).render(React.createElement(component,{size:18,strokeWidth:1.9}))});
const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields={
 invoice:[['invoiceNo','Số Invoice'],['invoiceDate','Ngày Invoice'],['exporter','Người xuất khẩu'],['importer','Người nhập khẩu'],['hs','Mã HS'],['invoiceQty','Số lượng'],['invoiceUnit','Đơn vị'],['invoiceNet','Net Weight (kg)'],['invoiceGross','Gross Weight (kg)'],['invoiceValue','Trị giá (USD)'],['description','Tên hàng']],
 packing:[['plInvoiceNo','Số Invoice trên PL'],['plExporter','Người xuất khẩu trên PL'],['plImporter','Người nhập khẩu trên PL'],['plQty','Số lượng'],['plUnit','Đơn vị'],['plNet','Net Weight (kg)'],['plGross','Gross Weight (kg)'],['plContainer','Container'],['plSeal','Seal']],
 customs:[['decNo','Số tờ khai'],['decInvoiceNo','Số Invoice trên tờ khai'],['decExporter','Người xuất khẩu trên tờ khai'],['decImporter','Người nhập khẩu trên tờ khai'],['decHs','Mã HS'],['decQty','Số lượng'],['decUnit','Đơn vị'],['decNet','Net Weight (kg)'],['decGross','Gross Weight (kg)'],['decValue','Trị giá (USD)'],['decChannel','Phân luồng'],['decContainer','Container'],['decSeal','Seal']],
 booking:[['bookingNo','Số Booking'],['etd','ETD (ngày)'],['etaFirst','ETA chặng 1'],['etdConnect','ETD tàu nối'],['pickupDate','Ngày nhận container rỗng'],['freeDays','Free time (ngày)'],['cyCutoff','CY cut-off'],['icdCutoff','ICD cut-off'],['siCutoff','SI cut-off'],['bookingPol','Cảng xếp hàng (POL)'],['bookingPod','Cảng dỡ hàng (POD)'],['bookingContainer','Container'],['bookingSeal','Seal'],['plannedWeight','Planned Weight (kg)'],['finalWeight','Final Weight (kg)']],
 bl:[['blNo','Số vận đơn'],['blBookingNo','Số Booking trên B/L'],['blInvoiceNo','Số Invoice trên B/L'],['blExporter','Người gửi hàng'],['blImporter','Người nhận hàng'],['blPol','POL trên B/L'],['blPod','POD trên B/L'],['blContainer','Container trên B/L'],['blSeal','Seal trên B/L'],['blGross','Gross Weight (kg)']],
 co:[['coNo','Số C/O'],['coInvoiceNo','Số Invoice trên C/O'],['coExporter','Người xuất khẩu'],['coImporter','Người nhập khẩu'],['coHs','Mã HS'],['coOrigin','Tiêu chí xuất xứ']],
};
const types={invoice:'Commercial Invoice (CI)',packing:'Packing List (PL)',customs:'Tờ khai / DS giám sát',booking:'Booking',bl:'B/L / Sea Waybill',co:'C/O',other:'Chưa xác định',zip:'Gói ZIP'};
const required=['invoice','packing','customs','booking'];
const groups=['invoice','packing','customs','booking','bl','co'];
const state={queue:[],seen:new Set(),manual:new Set(),form:{},evidence:{},skipNotes:[],scanning:false,checks:[],draft:null,active:'invoice',notice:'',showAll:false};
let toastTimer;
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4900)}
function value(k){return String(state.form[k]??'').trim()}
const num=numericValue;
const norm=words;
function eq(a,b,numeric=false){if(numeric){const x=num(a),y=num(b);return Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x-y)<=Math.max(1e-7,Math.max(Math.abs(x),Math.abs(y))*1e-10)}return !!(norm(a)&&norm(b))&&norm(a)===norm(b)}
function date(v){if(!v)return null;let m=String(v).match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);if(m)return new Date(+m[1],+m[2]-1,+m[3]);m=String(v).match(/(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})/);return m?new Date(+m[3],+m[2]-1,+m[1]):null}
function formatDate(v){const d=date(v);return d?`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`:v||'—'}
const pending = item => item.status==='Chờ quét' || item.retry;
const labelFor = (type,key) => fields[type]?.find(([k])=>k===key)?.[1]||key;
const tabNames={invoice:'CI',packing:'Packing List',customs:'Tờ khai',booking:'Booking',bl:'B/L',co:'C/O'};
function hasType(type){
  return state.queue.some(f=>f.type===type && (f.status==='Đã nhận diện'||(f.processed&&fields[type]?.some(([k])=>state.manual.has(k)&&value(k)))));
}
function renderStats(){
  $('statDocs').textContent=groups.filter(hasType).length;
  $('statChecks').textContent=state.checks.length;
  $('statIssues').textContent=state.checks.filter(c=>['warn','fail'].includes(c.status)).length;
  $('statRisk').textContent=state.draft?.mucRuiRo||'—';
}
function syncExtractedForm(){
  const next={},evidence={};
  for(const type of groups)for(const [key] of fields[type]){
    const entries=state.queue.filter(f=>f.type===type&&f.data?.[key]);
    if(!entries.length)continue;
    let firstIssue;
    const candidates=[];
    for(const f of entries){
      const data=f.data[key];
      if(data.issue)firstIssue ||= data.issue;
      for(const item of data.choices) candidates.push({...item,source:f.sourceFile||f.name,rank:1});
    }
    const merged=resolveCandidates(candidates,entries[0].data[key].role)||{value:'',choices:[],conflict:false};
    if(firstIssue)Object.assign(merged,{issue:firstIssue,conflict:true,value:''});
    evidence[key]=merged;
    if(merged.value)next[key]=merged.value;
  }
  for(const key of state.manual)next[key]=state.form[key]??'';
  state.form=next;state.evidence=evidence;
}
function renderQueue(){
  const visible=groups.map(type=>({type,files:state.queue.filter(f=>f.type===type)})).filter(g=>g.files.length);
  $('docsBody').innerHTML=visible.map(({type,files})=>{
    const good=files.filter(f=>f.processed&&f.data&&Object.keys(f.data).length);
    const issues=fields[type].filter(([key])=>state.evidence[key]?.conflict&&!state.manual.has(key)).length;
    const status=files.some(f=>f.status==='Đang xử lý')?'Đang xử lý':files.some(f=>f.status==='Chờ quét')?'Chờ quét':
      issues||files.some(f=>f.error||f.warning)?'Cần xác minh':good.length?'Đã nhận diện':'Cần xác minh';
    const present=fields[type].filter(([key])=>value(key));
    const preview=present.slice(0,3).map(([key,label])=>label+': '+value(key)).join(' · ');
    const names=[...new Set(files.map(f=>f.name))];
    const fileCell=names.length===1?esc(names[0]):'<details><summary>'+names.length+' nguồn</summary>'+names.map(n=>'<div>'+esc(n)+'</div>').join('')+'</details>';
    const note=issues?issues+' trường cần xác nhận.':files.find(f=>f.error||f.warning);
    return '<tr><td class="doc-type"><strong>'+esc(types[type])+'</strong><small>'+(required.includes(type)?'Bắt buộc':'Bổ sung')+'</small></td><td><span class="mini-status '+(status==='Cần xác minh'?'warning':status!=='Đã nhận diện'?'pending':'')+'">'+status+'</span>'+(note?'<small class="error-note">'+esc(typeof note==='string'?note:note.error||note.warning)+'</small>':'')+'</td><td class="source-list">'+fileCell+'</td><td>'+present.length+'</td><td>'+esc(preview||'—')+'</td></tr>';
  }).join('')||'<tr><td colspan="5" class="table-empty">Chọn tệp và bấm Quét hồ sơ để nhận diện chứng từ.</td></tr>';
  const missing=required.filter(type=>!hasType(type));
  $('missingBox').classList.toggle('ok',!missing.length);
  $('missingBox').textContent=state.queue.length&&!state.queue.some(f=>f.processed)?'Chờ quét hồ sơ.':missing.length?'Cần bổ sung hoặc xác minh: '+missing.map(t=>tabNames[t]).join(', ')+'.':'Đã nhận diện đủ bốn chứng từ bắt buộc.';
  $('scanBtn').disabled=state.scanning||!state.queue.some(pending);
  $('clearBtn').disabled=state.scanning;
  $('chooseFiles').disabled=state.scanning;
  $('uploadSummary').textContent=state.notice||(state.seen.size?state.seen.size+' tệp đã tải · '+groups.filter(hasType).length+' loại đã nhận diện':'Chưa có tệp.');
  const notes=[...state.skipNotes,...state.queue.filter(f=>f.error||f.warning||f.status==='Bỏ qua').map(f=>f.name+' · '+(f.error||f.warning||'Ngoài sáu loại chứng từ.'))];
  const box=$('fileNotes');box.hidden=!notes.length;
  box.querySelector('summary').textContent=notes.length+' mục cần xem lại';
  box.querySelector('ul').innerHTML=notes.map(n=>'<li>'+esc(n)+'</li>').join('');
  renderStats();
}
function originMarkup(key){
  const field=state.evidence[key],manual=state.manual.has(key);
  const manualNote=manual?'<small class="manual-note">Đã xác nhận thủ công</small>':'';
  if(!field)return manualNote;
  const conflict=field.conflict&&!manual;
  const choices=field.choices.map((c,i)=>{
    const content='<strong>'+esc(c.value)+'</strong><br>'+esc(c.source)+' · '+esc(c.where)+'<br>'+esc(c.method)+' · '+esc(c.raw);
    return conflict?'<button type="button" class="choice" data-key="'+key+'" data-choice="'+i+'">'+content+'</button>':'<p>'+content+'</p>';
  }).join('');
  return manualNote+'<details class="'+(conflict?'conflict':'source')+'"><summary>'+(conflict?'Cần xác minh':'Xem nguồn')+'</summary>'+
    (field.issue?'<p>'+esc(field.issue)+'</p>':'')+(conflict&&!field.issue?'<p>Chọn giá trị theo chứng từ hoặc nhập tay.</p>':'')+choices+'</details>';
}
function renderForm(){
  const tabs=$('formTabs'),panel=$('formPanel');
  tabs.innerHTML=groups.map(t=>'<button id="tab-'+t+'" type="button" role="tab" data-type="'+t+'" aria-label="'+esc(types[t])+'" aria-selected="'+(state.active===t)+'" aria-controls="formPanel">'+esc(tabNames[t])+'</button>').join('');
  tabs.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{state.active=btn.dataset.type;renderForm();$('tab-'+state.active).focus({preventScroll:true});}));
  panel.setAttribute('aria-labelledby','tab-'+state.active);
  panel.innerHTML='<div class="field-grid">'+fields[state.active].map(([key,label])=>{
    const v=value(key),conflict=state.evidence[key]?.conflict&&!state.manual.has(key);
    const attrs=' id="field-'+key+'" data-field="'+key+'"'+(conflict?' aria-invalid="true"':'');
    const control=key==='decChannel'?'<select'+attrs+'><option value="">Chưa xác định</option>'+['Xanh','Vàng','Đỏ'].map(s=>'<option '+(v===s?'selected':'')+'>'+s+'</option>').join('')+'</select>':'<input'+attrs+' value="'+esc(v)+'" autocomplete="off" placeholder="'+(conflict?'Chọn nguồn hoặc nhập tay':'Chưa đọc được')+'">';
    return '<div class="field"><label for="field-'+key+'">'+esc(label)+'</label>'+control+'<div class="field-origin">'+originMarkup(key)+'</div></div>';
  }).join('')+'</div>';
  const count=fields[state.active].filter(([k])=>value(k)).length;
  $('dataOrigin').textContent=count?count+' / '+fields[state.active].length+' trường có dữ liệu':'Chưa có giá trị xác nhận';
}
function confirmField(key,v){
  state.form[key]=v;state.manual.add(key);
  if(!state.scanning&&state.queue.some(f=>f.processed)&&groups.some(hasType))runChecks(false);
  renderQueue();
  const input=$('field-'+key);
  if(input){input.removeAttribute('aria-invalid');input.parentElement.querySelector('.field-origin').innerHTML=originMarkup(key);}
  $('dataOrigin').textContent=fields[state.active].filter(([k])=>value(k)).length+' / '+fields[state.active].length+' trường có dữ liệu';
}
$('formPanel').addEventListener('input',event=>{
  if(event.target.dataset.field)confirmField(event.target.dataset.field,event.target.value);
});
$('formPanel').addEventListener('click',event=>{
  const btn=event.target.closest('button.choice');if(!btn)return;
  const key=btn.dataset.key,v=state.evidence[key]?.choices[Number(btn.dataset.choice)]?.value;
  if(v!==undefined){$('field-'+key).value=v;confirmField(key,v);}
});
function resetDraft(){
 $('draftFields').innerHTML=[['Số Invoice','—'],['Người xuất khẩu','—'],['Mã HS','—'],['Số lượng','—']].map(([k,v])=>`<div class="draft-field"><span>${k}</span><b>${v}</b></div>`).join('');
 $('downloadBtn').disabled=true;$('printBtn').disabled=true;
 $('scoreValue').textContent='—';$('riskBadge').textContent='Chưa chạy';$('riskBadge').className='badge neutral';$('riskExplanation').textContent='Chờ quét hồ sơ.';$('scoreFill').style.width='0';
}
function invalidateResult(){
 if(!state.draft)return;
 state.checks=[];state.draft=null;state.showAll=false;
 $('resultContent').hidden=true;$('resultEmpty').hidden=false;$('resultEmpty').textContent='Đã thêm tệp. Bấm Quét hồ sơ để cập nhật.';
 resetDraft();renderComparisonTable();renderStats();
}
function clearAll(){
 state.queue=[];state.seen.clear();state.manual.clear();state.form={};state.evidence={};state.skipNotes=[];state.checks=[];state.draft=null;state.active='invoice';state.notice='';state.showAll=false;
 $('resultContent').hidden=true;$('resultEmpty').hidden=false;$('resultEmpty').textContent='Chưa có kết quả kiểm tra.';$('progressWrap').hidden=true;$('files').value='';
 resetDraft();renderComparisonTable();renderQueue();renderForm();toast('Đã xóa dữ liệu của phiên này.');
}
function queueFiles(files){
  if(state.scanning){toast('Chờ quét xong để thêm tệp.');return;}
  let added=0,duplicates=0,rejected=0;
  for(const file of files){
    const ext=extension(file.name),key=[file.name,file.size,file.lastModified].join('|');
    if(!allowedExt.has(ext)){rejected++;state.skipNotes.push(file.name+' · Định dạng chưa hỗ trợ.');continue;}
    if(state.seen.has(key)){duplicates++;continue;}
    state.seen.add(key);
    state.queue.push({key,file,name:file.name,type:sourceType(file.name),kind:ext,depth:0,status:'Chờ quét'});added++;
  }
  state.notice=[added?'Đã thêm '+added+' tệp.':'',rejected?'Đã loại '+rejected+' tệp chưa hỗ trợ.':'',duplicates?'Đã bỏ qua '+duplicates+' tệp trùng.':''].filter(Boolean).join(' ');
  if(added)invalidateResult();
  renderQueue();if(rejected||duplicates)toast(state.notice);
}
async function scan(){
  if(state.scanning||!state.queue.some(pending))return;
  state.scanning=true;state.notice='';
  let total=state.queue.filter(pending).length,done=0,ignored=0;
  const track=$('progressWrap').querySelector('[role="progressbar"]');
  $('progressWrap').hidden=false;
  const progress=()=>{const pct=Math.round(done*100/Math.max(1,total));$('progressBar').style.width=pct+'%';track.setAttribute('aria-valuenow',String(pct));};
  progress();renderQueue();
  try{
    for(let i=0;i<state.queue.length;i++){
      const f=state.queue[i];if(!pending(f))continue;
      f.status='Đang xử lý';f.retry=false;f.error='';
      const show=step=>{$('progressText').textContent='Đang đọc '+f.name+(step?' · '+step:'')+' ('+(done+1)+'/'+total+')';};
      show('');renderQueue();
      try{
        if(f.kind==='zip'){
          if(f.depth>=3)throw Error('ZIP lồng quá ba cấp.');
          const {files,skipped}=await unzipDocuments(f.file);
          for(const path of skipped)state.skipNotes.push(f.name+'/'+path+' · Định dạng chưa hỗ trợ hoặc vượt 60 MB.');
          if(!files.length)throw Error('ZIP không có tệp đọc được.');
          const children=files.map(({file,entry})=>({key:f.key+'/'+entry,file,name:f.name+'/'+entry,type:sourceType(file.name),kind:extension(file.name),depth:f.depth+1,status:'Chờ quét'}));
          state.queue.splice(i,1,...children);total+=children.length-1;i--;continue;
        }
        const {parts,notes}=await readParts(f.file,show);
        if(!parts.length)throw Error('Tệp không có trang hoặc sheet chứa dữ liệu.');
        const records=parts.map((part,index)=>{
          const name=part.name?f.name+' / '+part.name:f.name;
          if(!groups.includes(part.type)){ignored++;return {name,type:'other',status:'Bỏ qua',processed:true};}
          const data=extractDocument(part.type,part.units);
          const hasData=Object.keys(data).length>0;
          return {key:f.key+'#'+index,name,sourceFile:f.name,type:part.type,data,processed:true,status:hasData?'Đã nhận diện':'Cần xác minh',warning:notes.join(' '),error:hasData?'':'Đã nhận diện loại chứng từ. Cần kiểm tra nội dung và nhập trường còn thiếu.'};
        });
        state.queue.splice(i,1,...records);i+=records.length-1;
      }catch(error){
        f.status='Cần xác minh';f.processed=true;f.retry=true;f.error=String(error.message||'Không đọc được tệp.');
      }
      done++;progress();syncExtractedForm();renderQueue();renderForm();
      await new Promise(next=>setTimeout(next,0));
    }
  }finally{
    await releaseOcr();
    state.scanning=false;syncExtractedForm();
    if(!fields[state.active].some(([key])=>value(key)))state.active=groups.find(t=>fields[t].some(([key])=>value(key)))||state.active;
    renderQueue();renderForm();
  }
  $('progressBar').style.width='100%';track.setAttribute('aria-valuenow','100');
  $('progressText').textContent='Đã quét '+done+' tệp'+(ignored?' · '+ignored+' mục ngoài phạm vi':'')+'.';
  if(groups.some(hasType)){runChecks(false);toast('Đã quét và đối chiếu hồ sơ.');}
  else{$('resultEmpty').textContent='Chưa đủ dữ liệu để đối chiếu.';renderComparisonTable();toast('Chưa trích được trường. Hãy kiểm tra tệp nguồn.');}
}
function runChecks(announce=false){
 if(!state.queue.some(f=>f.status==='Đã nhận diện')&&!Object.values(state.form).some(Boolean)){toast('Hãy tải và quét hồ sơ trước khi đối chiếu.');$('resultEmpty').textContent='Chưa có dữ liệu để đối chiếu. Hãy tải và quét hồ sơ trước.';return}
 let checks=[];const add=(title,status,detail)=>checks.push({title,status,detail});const has=hasType;
 for(const type of groups)for(const [key,label] of fields[type]){
   const item=state.evidence[key];
   if(item?.conflict&&!state.manual.has(key))add(tabNames[type]+' · '+label,'warn',item.issue||'Nguồn có nhiều giá trị: '+item.choices.map(c=>c.value).join(' / ')+'. Xác nhận trong Dữ liệu trích xuất.');
 }
 for(let t of required)if(!has(t))add('Thiếu hồ sơ bắt buộc: '+types[t],'fail','Chưa nhận diện '+types[t]+' trong bộ tệp đã quét. Cần bổ sung hoặc xác minh tệp lỗi.');
 const pair=(title,a,b,unit='',numeric=false)=>{
   const x=value(a),y=value(b);
   if(!x&&!y)return;
   const [left,right]=title.split(' · ')[0].split(' ↔ ');
   const shown=v=>v?v+(unit?' '+unit:''):'chưa đọc được';
   const same=/hs$/i.test(a)&&x&&y ? x.replace(/[.\s]/g,'')===y.replace(/[.\s]/g,'') : eq(x,y,numeric);
   const missingUnit=(a==='invoiceQty') && (!value('invoiceUnit')||!value(b==='plQty'?'plUnit':'decUnit'));
   const status=!x||!y||missingUnit?'warn':same?'pass':'fail';
   add(title,status,left+': '+shown(x)+' · '+right+': '+shown(y)+'.'+(missingUnit?' Cần xác nhận đơn vị.':''));
 };
 if(has('booking')&&has('bl'))pair('Booking ↔ B/L · Số Booking','bookingNo','blBookingNo');
 if(has('invoice')&&has('packing')){pair('CI ↔ PL · Số Invoice','invoiceNo','plInvoiceNo');pair('CI ↔ PL · Người xuất khẩu','exporter','plExporter');pair('CI ↔ PL · Người nhập khẩu','importer','plImporter');let iq=value('invoiceQty'),pq=value('plQty'),iu=value('invoiceUnit'),pu=value('plUnit');if(iq&&pq&&iu&&pu&&norm(iu)!==norm(pu))add('CI ↔ PL · Số lượng và đơn vị','expected',`CI: ${iq} ${iu} · PL: ${pq} ${pu}. Chênh lệch dự kiến (Expected Difference): khác đơn vị đo; cần xác nhận quy đổi.`);else pair('CI ↔ PL · Số lượng','invoiceQty','plQty',iu||pu,true);if(iu&&pu&&norm(iu)===norm(pu))pair('CI ↔ PL · Đơn vị','invoiceUnit','plUnit');pair('CI ↔ PL · Net Weight','invoiceNet','plNet','kg',true);pair('CI ↔ PL · Gross Weight','invoiceGross','plGross','kg',true)}
 if(has('invoice')&&has('customs')){pair('CI ↔ Tờ khai · Số Invoice','invoiceNo','decInvoiceNo');pair('CI ↔ Tờ khai · Người xuất khẩu','exporter','decExporter');pair('CI ↔ Tờ khai · Người nhập khẩu','importer','decImporter');pair('CI ↔ Tờ khai · Mã HS','hs','decHs');if(value('invoiceUnit')&&value('decUnit')&&norm(value('invoiceUnit'))!==norm(value('decUnit')))add('CI ↔ Tờ khai · Số lượng','expected',`CI: ${value('invoiceQty')} ${value('invoiceUnit')} · Tờ khai: ${value('decQty')} ${value('decUnit')}. Cần xác nhận quy đổi.`);else pair('CI ↔ Tờ khai · Số lượng','invoiceQty','decQty',value('invoiceUnit'),true);if(!value('invoiceUnit')||!value('decUnit')||norm(value('invoiceUnit'))===norm(value('decUnit')))pair('CI ↔ Tờ khai · Đơn vị','invoiceUnit','decUnit');pair('CI ↔ Tờ khai · Trị giá','invoiceValue','decValue','USD',true);pair('CI ↔ Tờ khai · Gross Weight','invoiceGross','decGross','kg',true);pair('CI ↔ Tờ khai · Net Weight','invoiceNet','decNet','kg',true)}
 if(has('booking')&&has('bl')){pair('Booking ↔ B/L · POL','bookingPol','blPol');pair('Booking ↔ B/L · POD','bookingPod','blPod');pair('Booking ↔ B/L · Container','bookingContainer','blContainer');pair('Booking ↔ B/L · Seal','bookingSeal','blSeal')}
 if(has('booking')&&has('packing'))pair('Booking ↔ PL · Container','bookingContainer','plContainer');if(has('booking')&&has('customs'))pair('Booking ↔ Tờ khai · Container','bookingContainer','decContainer');if(has('customs')&&has('bl'))pair('Tờ khai ↔ B/L · Container','decContainer','blContainer');if(has('packing')&&has('bl'))pair('PL ↔ B/L · Gross Weight','plGross','blGross','kg',true);
 if(has('invoice')&&has('co')){pair('CI ↔ C/O · Số Invoice','invoiceNo','coInvoiceNo');pair('CI ↔ C/O · Người xuất khẩu','exporter','coExporter');pair('CI ↔ C/O · Người nhập khẩu','importer','coImporter');pair('CI ↔ C/O · Mã HS','hs','coHs')}
 let planned=value('plannedWeight'),final=value('finalWeight')||value('plGross');if(has('booking')&&planned&&final)add('Planned Weight ↔ Final Weight',eq(planned,final,true)?'pass':'expected',`Kế hoạch: ${planned} kg · Thực tế: ${final} kg. ${eq(planned,final,true)?'Phù hợp.':'Chênh lệch kế hoạch – thực tế cần xác minh; không tự kết luận sai.'}`);
 let seals=[['PL',value('plSeal')],['Tờ khai',value('decSeal')],['Booking',value('bookingSeal')],['B/L',value('blSeal')]].filter(([,v])=>v);if(seals.some(([,v])=>norm(v)==='na'||norm(v)==='n a'))add('Seal ghi NA','warn',seals.map(([s,v])=>s+': '+v).join(' · ')+'. Cần đối chiếu với seal thực tế trước khi xác nhận.');
 let channel=norm(value('decChannel'));if(channel==='do'||channel==='red')add('Phân luồng · Đỏ','fail','Tờ khai: Đỏ. Chuẩn bị hồ sơ và phối hợp kiểm tra thực tế hàng hóa theo yêu cầu Hải quan.');else if(channel==='vang'||channel==='yellow')add('Phân luồng · Vàng','warn','Tờ khai: Vàng. Chuẩn bị và nộp hồ sơ được yêu cầu; rà soát chứng từ liên quan.');else if(channel==='xanh'||channel==='green')add('Phân luồng · Xanh','pass','Tờ khai: Xanh. Theo dõi thông quan và giao nhận theo quy định.');else if(has('customs'))add('Phân luồng chưa rõ','warn','Chưa đọc được kết quả phân luồng. Cần xác minh trên tờ khai.');
 const radar=makeRadar();for(let c of radar.checks)add(c.title,c.status,c.detail);for(const type of groups){const failed=state.queue.filter(f=>f.type===type&&f.status==='Cần xác minh');if(failed.length&&!has(type))add(`${types[type]} cần xác minh`,'warn',`${failed.length} nguồn chưa trích được trường. ${failed[0].error||'Cần kiểm tra tệp và điền tay.'}`)}
 let critical=checks.filter(c=>c.status==='fail').length,warnings=checks.filter(c=>c.status==='warn').length,extra=channel==='do'||channel==='red'?18:channel==='vang'||channel==='yellow'?9:0,score=Math.min(100,critical*14+warnings*6+extra),level=score>=50?'Cao':critical>0||score>=20?'Trung bình':'Thấp';state.checks=checks;state.draft={nhan:'Chưa phải C/O chính thức',nguon:'Dữ liệu từ hồ sơ đã đọc hoặc nhân viên nhập trong phiên',hoaDon:value('invoiceNo'),ngayHoaDon:value('invoiceDate'),nguoiXuatKhau:value('exporter'),nguoiNhapKhau:value('importer'),tenHang:value('description'),maHS:value('hs'),soLuong:[value('invoiceQty'),value('invoiceUnit')].filter(Boolean).join(' '),netWeightKg:value('invoiceNet'),grossWeightKg:value('invoiceGross'),triGiaUSD:value('invoiceValue'),soToKhai:value('decNo'),booking:value('bookingNo'),tieuChiXuatXu:value('coOrigin')||'Chưa xác định',diemRuiRo:score,mucRuiRo:level,kiemTra:checks};state.showAll=false;renderResults(score,level,radar);renderComparisonTable();renderStats();if(announce){$('results').scrollIntoView({behavior:'smooth',block:'start'});toast('Đã cập nhật kết quả kiểm tra.')}}
function renderComparisonTable(){
 $('checksTableBody').innerHTML=state.checks.length?state.checks.map(c=>`<tr><td><strong>${esc(c.title)}</strong></td><td><span class="badge ${c.status==='pass'?'good':c.status==='fail'?'bad':'amber'}">${c.status==='pass'?'Đạt':c.status==='expected'?'Chênh lệch dự kiến':'Cần xử lý'}</span></td><td>${esc(c.detail)}</td></tr>`).join(''):'<tr><td colspan="3" class="table-empty">Chưa có kết quả đối chiếu.</td></tr>';
}
function makeRadar(){
 const v=value,lines=[],checks=[],hasBooking=!!(v('bookingNo')||v('etd'));
 if(!hasBooking){lines.push({title:'Chưa có dữ liệu Booking',detail:'Bổ sung Booking hoặc điền thông tin lịch tàu trước khi kiểm tra các mốc.',kind:'notice'});return {actual:false,lines,checks}}
 lines.push({title:'Booking và ETD',detail:`Booking ${v('bookingNo')||'chưa đọc được'} · ETD ${formatDate(v('etd'))}`,kind:'normal'});
 const pickup=date(v('pickupDate')),etd=date(v('etd')),free=num(v('freeDays'));
 if(pickup&&etd&&Number.isFinite(free)){
  const days=Math.round((etd-pickup)/86400000)+1,late=days-free;
  lines.push({title:'DEM/DET · free time',detail:`Nhận rỗng ${formatDate(v('pickupDate'))} → ETD ${formatDate(v('etd'))}: ${days} ngày, tính cả hai ngày · miễn phí ${free} ngày${late>0?` · vượt ${late} ngày`:''}.`,kind:late>0?'alert':'normal'});
  checks.push({title:'DEM/DET · free time',status:late>0?'fail':'pass',detail:`Thực tế ${days} ngày · free time ${free} ngày. ${late>0?'Cần xác minh phí lưu container.':'Trong hạn miễn phí.'}`});
 }else lines.push({title:'DEM/DET',detail:'Thiếu ngày nhận rỗng, ETD hoặc free time; cần xác minh với hãng tàu.',kind:'notice'});
 const eta=date(v('etaFirst')),connection=date(v('etdConnect'));
 if(eta&&connection){const delta=Math.round((connection-eta)/86400000),conflict=delta<1;lines.push({title:conflict?'Lịch nối · khóa duyệt nội bộ':'Lịch nối · đủ thời gian đệm',detail:`ETA chặng 1 ${formatDate(v('etaFirst'))} · ETD tàu nối ${formatDate(v('etdConnect'))} · đệm tối thiểu 1 ngày.`,kind:conflict?'alert':'normal'});checks.push({title:'Lịch tàu nối',status:conflict?'fail':'pass',detail:`ETA ${formatDate(v('etaFirst'))} + 1 ngày so với ETD nối ${formatDate(v('etdConnect'))}. ${conflict?'Xung đột, khóa duyệt Internal Booking.':'Đủ thời gian đệm.'}`})}
 else lines.push({title:'Lịch tàu nối',detail:'Thiếu ETA chặng 1 hoặc ETD nối; chưa thể đánh giá.',kind:'notice'});
 const reminder=(raw,days=0,hours=0)=>{const d=date(raw);if(!d)return 'chưa xác định';const time=raw.match(/\b(\d{1,2}):(\d{2})\b/);if(time)d.setHours(+time[1],+time[2]);d.setTime(d.getTime()-days*86400000-hours*3600000);return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}${time?` ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`:''}`};
 const cy=v('cyCutoff'),icd=v('icdCutoff'),si=v('siCutoff');lines.push({title:'Các mốc cut-off',detail:`CY ${cy||'chưa có'} (nhắc ${reminder(cy,2)}) · ICD ${icd||'chưa có'} (nhắc ${reminder(icd,2)}) · SI ${si||'chưa có'} (nhắc ${reminder(si,2)}). Nhắc container, seal trước 2 ngày; VGM trước CY 2 giờ (${reminder(cy,0,2)}). Trang không gửi thông báo tự động.`,kind:cy&&icd?'normal':'notice'});
 return {actual:true,lines,checks};
}
function renderCheckList(){
 const sorted=[...state.checks].sort((a,b)=>({fail:0,warn:1,expected:2,pass:3}[a.status]-{fail:0,warn:1,expected:2,pass:3}[b.status]));
 const attention=sorted.filter(c=>c.status!=='pass');
 const visible=state.showAll?sorted:attention.length?attention.slice(0,3):sorted.slice(0,3);
 $('checksList').innerHTML=visible.map(c=>`<article class="check ${c.status==='fail'?'fail':c.status==='warn'||c.status==='expected'?'warn':''}"><div class="check-top"><strong>${esc(c.title)}</strong><span class="badge ${c.status==='pass'?'good':c.status==='fail'?'bad':'amber'}">${c.status==='pass'?'Đạt':c.status==='expected'?'Chênh lệch dự kiến':'Cần xử lý'}</span></div><p>${esc(c.detail)}</p></article>`).join('');
 $('toggleChecksBtn').hidden=!state.showAll && sorted.length<=visible.length;
 $('toggleChecksBtn').textContent=state.showAll?'Thu gọn kiểm tra':`Xem đủ ${sorted.length} kiểm tra`;
}
function renderResults(score,level,radar){
 $('resultEmpty').hidden=true;$('resultContent').hidden=false;
 $('scoreValue').textContent=score;$('riskBadge').textContent='Rủi ro '+level;$('riskBadge').className='badge '+(level==='Cao'?'bad':level==='Trung bình'?'amber':'good');
 $('riskExplanation').textContent='Tính từ sai khác, cảnh báo và phân luồng.';$('scoreFill').style.width=score+'%';$('scoreFill').style.background=level==='Cao'?'#c43d4f':level==='Trung bình'?'#dd9c28':'#0e9f83';
 const issues=state.checks.filter(c=>c.status==='fail'||c.status==='warn').length,expected=state.checks.filter(c=>c.status==='expected').length;
 $('checkSummary').textContent=`${issues} điểm cần xem lại · ${expected} chênh lệch dự kiến · ${state.checks.filter(c=>c.status==='pass').length} kiểm tra đạt.`;
 renderCheckList();$('radarOrigin').textContent=radar.actual?'Từ hồ sơ đã tải':'Chưa đủ dữ liệu';
 $('radarContent').innerHTML=radar.lines.map(x=>`<div class="radar-line ${x.kind}"><strong>${esc(x.title)}</strong><p>${esc(x.detail)}</p></div>`).join('');
 const d=state.draft,items=[['Số Invoice',d.hoaDon],['Người xuất khẩu',d.nguoiXuatKhau],['Người nhập khẩu',d.nguoiNhapKhau],['Tên hàng',d.tenHang],['Mã HS',d.maHS],['Số lượng',d.soLuong],['Gross Weight',d.grossWeightKg?d.grossWeightKg+' kg':''],['Tiêu chí xuất xứ',d.tieuChiXuatXu]];
 $('draftFields').innerHTML=items.map(([k,v])=>`<div class="draft-field"><span>${esc(k)}</span><b>${esc(v||'Chưa xác định')}</b></div>`).join('');$('downloadBtn').disabled=false;$('printBtn').disabled=false;
}
const zone=$('dropZone');
$('files').accept=[...allowedExt].map(ext=>'.'+ext).join(',');
$('chooseFiles').addEventListener('click',()=>$('files').click());
$('files').addEventListener('change',e=>{queueFiles([...e.target.files]);e.target.value=''});
for(const ev of ['dragenter','dragover'])zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.add('dragging')});
for(const ev of ['dragleave','drop'])zone.addEventListener(ev,e=>{e.preventDefault();zone.classList.remove('dragging')});
zone.addEventListener('drop',e=>queueFiles([...e.dataTransfer.files]));
$('scanBtn').addEventListener('click',scan);
$('toggleChecksBtn').addEventListener('click',()=>{state.showAll=!state.showAll;renderCheckList()});
$('clearBtn').addEventListener('click',()=>{if(!state.queue.length&&!state.skipNotes.length&&!Object.values(state.form).some(Boolean)){toast('Không có dữ liệu để xóa.');return}$('clearDialog').showModal()});
$('clearDialog').addEventListener('close',()=>{if($('clearDialog').returnValue==='confirm')clearAll()});
$('downloadBtn').addEventListener('click',()=>{if(!state.draft)return;const blob=new Blob([JSON.stringify(state.draft,null,2)],{type:'application/json;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`nhap-co-${value('invoiceNo')||'dcs'}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),30000)});
$('printBtn').addEventListener('click',()=>{if(state.draft)window.print()});
resetDraft();renderComparisonTable();renderQueue();renderForm();
