import {fieldMap, labelOf, normalize, canonicalUnit, quantityUnit, words, sourceType} from './schema.js';
export {sourceType};

// A candidate always travels with a location so the form can explain a value or a conflict.
function evidence(value, unit, cell, method, rank=3) {
  const where=[unit.name,cell.ref].filter(Boolean).join(' · ');
  return {value,where,raw:cell.text,method,rank,uncertain:unit.kind==='ocr' && cell.conf!=null && cell.conf<62};
}
function keyFor(value,role) {
  if(role==='hs')return value.replace(/\D/g,'');
  if(['invoice','booking','seal','container','bill','certificate','declaration'].includes(role))return value.trim().toUpperCase();
  return words(value).replace(/\b(co ltd|company limited)\b/g,'co ltd');
}
export function resolveCandidates(items,role) {
  if(!items?.length)return null;
  const confirmed=items.filter(item=>!item.uncertain);
  const pool=confirmed.length?confirmed:items;
  const best=pool.reduce((n,item)=>Math.max(n,item.rank),-Infinity);
  const seen=new Set(), choices=[];
  for(const item of pool) {
    if(item.rank!==best)continue;
    const key=keyFor(item.value,role);
    if(seen.has(key))continue;
    seen.add(key);choices.push(item);
  }
  if(!choices.length)return null;
  if(!confirmed.length)return {value:'',choices,conflict:true,issue:'OCR chưa đọc rõ. Hãy kiểm tra chữ hoặc số trên ảnh.'};
  return {value:choices.length===1?choices[0].value:'',choices,conflict:choices.length>1};
}
function matchColumns(unit,headers,cells) {
  if(!unit.spatial)return headers.map(h=>cells.find(c=>c.col===h.cell.col));
  // PDF and OCR use geometric column edges. Right-aligned numbers may start farther right than their heading.
  const centers=headers.map(h=>(h.cell.col+h.cell.end)/2);
  return headers.map((_,index)=>{
    const left=index?(centers[index-1]+centers[index])/2:-Infinity;
    const right=index+1<headers.length?(centers[index+1]+centers[index])/2:Infinity;
    const matches=cells.filter(c=>(c.col+c.end)/2>=left&&(c.col+c.end)/2<right);
    return matches.length===1?matches[0]:undefined;
  });
}
const isTotal=cell=>/^(?:(?:grand|invoice|shipment|overall) total|total(?:s| general)?|tong(?: cong| so| cộng)?|cong)$/.test(words(cell?.text));
const isSub=cell=>/^(?:sub total|subtotal|page total|total this page|carry forward|brought forward|cong trang|cong don)/.test(words(cell?.text));
const moneyOrWeight=(role)=>['qty','packages','net','gross','amount','planned','final'].includes(role);
function tableHeader(row) {
  const headers=row.cells.map(cell=>({cell,def:labelOf(cell.text)}));
  const labeled=headers.filter(h=>h.def&&!h.def.value);
  if(labeled.length<2||headers.some(h=>h.def?.value)||new Set(labeled.map(h=>h.def.role)).size<2)return null;
  // E.g. "Exporter | Test Ltd | Buyer | Test Inc" is a key/value form, not a header row.
  if(headers.some(h=>!h.def && /\d/.test(h.cell.text)))return null;
  const alternating=headers.length%2===0 && headers.every((h,i)=>i%2===0 ? h.def&&!h.def.value : !h.def);
  if(alternating && headers.some((h,i)=>i%2===1 && !/^(?:address|country|name|description|item|marks?|measurement|remark|remarks)$/.test(words(h.cell.text))))return null;
  return headers;
}
function readTable(unit,rows,start,headers,add) {
  const metricColumns=headers.map((h,i)=>h.def&&moneyOrWeight(h.def.role)?i:-1).filter(i=>i>=0);
  const unitColumn=headers.findIndex(h=>h.def?.role==='unit');
  const sums=new Map(), totals=[], detailRows=[], rowUnits=new Set();
  let last=start;
  for(let j=start+1;j<rows.length;j++) {
    const row=rows[j];
    if(row.index>rows[last].index+3)break;
    const repeated=tableHeader(row);
    if(repeated){
      const same=metricColumns.length&&repeated.length===headers.length&&repeated.every((h,i)=>words(h.cell.text)===words(headers[i].cell.text)&&h.cell.col===headers[i].cell.col);
      if(same){last=j;continue;}
      break;
    }
    const first=row.cells[0];
    if(isSub(first)){last=j;continue;}
    const mapped=matchColumns(unit,headers,row.cells);
    if(isTotal(first)) {totals.push({row,mapped});last=j;break;}
    if(row.cells.some(c=>labelOf(c.text)?.role && !normalize('unit',c)))break;
    const amounts=metricColumns.map(i=>mapped[i]&&normalize(headers[i].def.role,mapped[i],headers[i].cell.text));
    const useful=amounts.some(Boolean);
    if(metricColumns.length&&!useful&&!(row.cells.some(c=>c.formula||c.error)))break;
    if(!metricColumns.length && j>start+1)break;
    const actualUnit=unitColumn>=0?canonicalUnit(mapped[unitColumn]?.text):'';
    if(actualUnit)rowUnits.add(actualUnit);
    const unitInfo=actualUnit || canonicalUnit(headers.find(h=>h.def?.role==='qty')?.def.unit);
    if(unitInfo)rowUnits.add(unitInfo);
    for(let i=0;i<headers.length;i++) {
      const def=headers[i].def, cell=mapped[i];
      if(!def)continue;
      if(moneyOrWeight(def.role)){
        const list=sums.get(i)||[];sums.set(i,list);
        const value=cell&&normalize(def.role,cell,headers[i].cell.text);
        list.push(value?{n:Number(value),cell}:null);
        if(def.role==='qty'&&cell){const u=quantityUnit(cell.text);if(u)rowUnits.add(u);}
      }else if(cell) {
        const v=normalize(def.role,cell,headers[i].cell.text);
        if(v)add(def.role,evidence(v,unit,cell,'Cột '+headers[i].cell.text));
      }
    }
    last=j;detailRows.push(row);
  }
  const signature=headers.map(h=>words(h.cell.text)).join('|');
  const total=totals[0], packed=total?.row.cells.filter(c=>!isTotal(c))||[];
  const sumAt=i=>{const a=sums.get(i)||[];return a.length && a.every(Boolean)?+a.reduce((n,e)=>n+e.n,0).toFixed(7):null;};
  const close=(a,b)=>Math.abs(a-b)<=Math.max(.00001,Math.abs(a)*1e-8);
  // A TOTAL caption sometimes pushes every number one column to the right.
  // Realign only when all independent detail sums confirm that exact sequence.
  const shifted=total && metricColumns.length>=2 && packed.length===metricColumns.length &&
    metricColumns.every((i,k)=>{const n=sumAt(i),v=normalize(headers[i].def.role,packed[k],headers[i].cell.text);return n!==null && v!=='' && close(n,Number(v));});
  const displaced=total && metricColumns.some(i=>isTotal(total.mapped[i]));
  for(const [k,i] of metricColumns.entries()){
    const role=headers[i].def.role,entries=sums.get(i)||[],sum=sumAt(i);
    if(role==='qty'&&(rowUnits.size>1 || (unitColumn>=0 && detailRows.some(r=>!canonicalUnit(matchColumns(unit,headers,r.cells)[unitColumn]?.text))))) {
      add(role,{issue:'Các dòng có đơn vị khác nhau hoặc thiếu đơn vị.',where:unit.name,raw:headers[i].cell.text});
      continue;
    }
    if(displaced&&!shifted){
      add(role,{issue:'Dòng tổng lệch cột và chưa khớp với các dòng hàng.',where:unit.name,raw:headers[i].cell.text});
      if(sum!==null)add(role,evidence(String(sum),unit,headers[i].cell,'Tổng các dòng hàng',4));
      continue;
    }
    const cell=shifted?packed[k]:total?.mapped[i];
    const totalValue=cell&&!isTotal(cell)?normalize(role,cell,headers[i].cell.text):'';
    if(totalValue)add(role,{...evidence(totalValue,unit,cell,'Dòng tổng',5),table:signature,page:unit.page,total:true});
    if(sum!==null) {
      const first=entries[0].cell,end=entries.at(-1).cell;
      const range={conf:entries.reduce((min,e)=>Math.min(min,e.cell.conf??100),100),text:headers[i].cell.text+' · '+entries.length+' dòng',ref:first.ref===end.ref?first.ref:first.ref+'–'+end.ref};
      add(role,{...evidence(String(sum),unit,range,'Tổng các dòng hàng',5),table:signature,page:unit.page,detailSum:true});
    }else if(entries.length&&!totalValue) {
      add(role,{issue:'Thiếu số ở một hoặc nhiều dòng hàng.',where:unit.name,raw:headers[i].cell.text});
    }
    if(role==='packages'&&headers[i].cell.text.match(/cartons?|ctns?/i))add('packageUnit',evidence('CARTON',unit,headers[i].cell,'Tiêu đề cột'));
    if(role==='qty'&&rowUnits.size===1)add('unit',evidence([...rowUnits][0],unit,headers[i].cell,'Đơn vị của cột'));
  }
  return last;
}
function readPartyBox(role,unit,rows,index,col,add) {
  // VNACCS exports often place a tax code between the party heading and its name.
  for(const row of rows.slice(index+1,index+7)){
    for(const [i,cell] of row.cells.entries()){
      if(!unit.spatial&&cell.col!==col)continue;
      const raw=cell.text.trim();
      if(labelOf(raw)?.role) return;
      const name=raw.match(/^(?:tên(?:\s+(?:doanh nghiệp|đơn vị))?|name)(?=$|\s|[:：])\s*[:：]?\s*(.*)$/i);
      if(!name)continue;
      const valueCell=name[1]?{...cell,text:name[1]}:row.cells[i+1];
      const v=valueCell&&normalize(role,valueCell);
      if(v)add(role,evidence(v,unit,valueCell,'Tên trong khung '+(role==='exporter'?'người xuất khẩu':'người nhập khẩu'),4));
      return;
    }
  }
}
function scalarRows(type,unit,add) {
  const rows=unit.rows;
  for(let i=0;i<rows.length;i++){
    const row=rows[i],headers=tableHeader(row);
    if(headers) {
      const last=readTable(unit,rows,i,headers,add);
      if(last>i){i=last;continue;}
    }
    for(let c=0;c<row.cells.length;c++){
      const cell=row.cells[c];
      const fragments=cell.text.split(/\n/).map(x=>x.trim()).filter(Boolean);
      const first=fragments[0]||'';
      const paired=first.match(/^(?:container|cont|cntr)(?:\s*(?:no\.?|number))?\s*[/&]\s*seal(?:\s*(?:no\.?|number))?\s*[:：#-]?\s*(.*)$/i);
      if(paired){
        const both=paired[1]?{...cell,text:paired[1]}:row.cells[c+1]||rows[i+1]?.cells.find(x=>x.col===cell.col);
        const ids=both?.text.match(/^([A-Z]{3}[UJZ][ -]?\d{6}[ -]?\d)\s*[/,;|]\s*([A-Z0-9./_-]+)$/i);
        if(ids)for(const [role,raw] of [['container',ids[1]],['seal',ids[2]]]){
          const v=normalize(role,{text:raw});if(v)add(role,evidence(v,unit,both,'Container và seal',4));
        }
        continue;
      }
      let def=labelOf(first);
      if(!def&&type==='invoice'){
        const generic=first.match(/^(invoice|date|dated|ngày lập|no\.)\s*[:：#]\s*(.*)$/i) || first.match(/^(date|dated|no\.)\s*()$/i);
        if(generic)def={role:/^(?:invoice|no\.)$/i.test(generic[1])?'invoice':'date',value:generic[2],label:generic[1],unit:''};
      }
      if(def && (def.role==='exporter'||def.role==='importer') && !def.value)readPartyBox(def.role,unit,rows,i,cell.col,add);
      if(!def)continue;
      // Ordinal form boxes can spell out the address instructions in parentheses.
      if(/^(?:name and address|name address|ten va dia chi)$/i.test(words(def.value)))def={...def,value:''};
      let valueCell,method,rank=3;
      if(def.value){valueCell={...cell,text:def.value};method='Cùng ô với nhãn';}
      else if(fragments[1]&&!labelOf(fragments[1])){valueCell={...cell,text:fragments[1]};method='Dòng dưới nhãn';}
      else {
        const right=row.cells[c+1];
        const rightIsValue=right && (!labelOf(right.text) || canonicalUnit(right.text));
        if(rightIsValue && (!headers || headers.length===1)) {valueCell=right;method='Ô bên phải';}
        else if(rows[i+1]&&rows[i+1].index<=row.index+3){
          const next=rows[i+1], aligned=unit.spatial
            ? matchColumns(unit,row.cells.map(x=>({cell:x})),next.cells)[c]
            : next.cells.find(x=>x.col===cell.col);
          if(aligned&&!labelOf(aligned.text)){valueCell=aligned;method='Ô bên dưới';rank=2;}
        }
      }
      if(!valueCell)continue;
      const v=normalize(def.role,valueCell,def.label);
      if(v)add(def.role,evidence(v,unit,valueCell,unit.kind==='ocr'?'OCR · '+method:method,rank));
      if(def.role==='qty'){
        const u=quantityUnit(valueCell.text)||canonicalUnit(def.unit);
        if(u)add('unit',evidence(u,unit,valueCell,'Đơn vị của số lượng',rank));
      }
      if(def.role==='packages'&&/ctns?|cartons?/i.test(def.label+' '+valueCell.text))add('packageUnit',evidence('CARTON',unit,valueCell,method,rank));
    }
  }
}
// Page subtotals are never silently taken for the entire shipment. Only a printed final
// total confirmed by every contributing page can replace multiple partial sums.
function reconcilePages(role,candidates,issues){
  const items=candidates[role]||[];
  const parts=items.filter(e=>e.page&&e.detailSum);
  const pages=new Set(parts.map(e=>e.page));
  if(pages.size<2)return;
  const totals=items.filter(e=>e.page&&e.total);
  const signatures=new Set(parts.map(e=>e.table));
  const units=new Set((candidates.unit||[]).map(e=>e.value));
  const compatible=parts.length===pages.size && signatures.size===1 && (role!=='qty'||units.size===1);
  const sum=parts.reduce((n,e)=>n+Number(e.value),0);
  const lastPage=parts.reduce((n,e)=>Math.max(n,e.page),0);
  const corroborated=compatible&&totals.length===1&&totals[0].page===lastPage&&
    signatures.has(totals[0].table)&&Math.abs(Number(totals[0].value)-sum)<0.0001;
  if(corroborated)candidates[role]=items.filter(e=>!e.page||!e.detailSum);
  else (issues[role]||=[]).push({issue:'Bảng trải trên nhiều trang. Cần xác nhận tổng lô hàng.',where:parts[0].where});
}
export function extractDocument(type,units) {
  const map=fieldMap[type]||{}, candidates={}, issues={};
  function add(role,entry){
    if(entry.issue){(issues[role]||=[]).push(entry);return;}
    (candidates[role]||=[]).push(entry);
  }
  for(const unit of units)scalarRows(type,unit,add);
  for(const role of ['qty','packages','net','gross','amount'])reconcilePages(role,candidates,issues);
  const currencies=new Set((candidates.currency||[]).map(e=>e.value));
  if(candidates.amount?.length&&[...currencies].some(c=>c!=='USD')){
    const source=candidates.currency[0];
    issues.amount=[{issue:'Đơn tiền trên chứng từ là '+[...currencies].join(' / ')+'. Xác minh trị giá USD.',where:source.where}];
    delete candidates.amount;
  }
  if(!candidates.qty?.length&&!issues.qty?.length&&candidates.packages?.length){
    candidates.qty=candidates.packages;
    candidates.unit=candidates.packageUnit||[];
  }
  const data={};
  for(const [role,field] of Object.entries(map)){
    const result=resolveCandidates(candidates[role],role);
    const issue=issues[role]?.[0];
    if(!result&&!issue)continue;
    data[field]={...(result||{value:'',choices:[],conflict:false}),role};
    if(issue)Object.assign(data[field],{value:'',conflict:true,issue:issue.issue,where:issue.where});
  }
  return data;
}
export function textUnit(text,name='Văn bản') {
  const rows=String(text??'').replace(/\r\n?/g,'\n').split('\n').map((line,i)=>({
    index:i+1,cells:line.split(/\t+|\s+\|\s+| {3,}/).map((s,col)=>({text:s.trim(),col,ref:'dòng '+(i+1)})).filter(c=>c.text)
  })).filter(r=>r.cells.length);
  return {name,kind:'text',rows};
}
export const unitText=unit=>unit.rows.map(r=>r.cells.map(c=>c.text).join('\t')).join('\n');
