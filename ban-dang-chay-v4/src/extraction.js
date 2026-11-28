import { extractInvoiceSheet } from './invoice-sheet.js';
import { extractPackingSheet } from './packing-sheet.js';
import { extractContainerSeal } from './bill-of-lading.js';
import { bookingNoticeFields } from './booking-notice.js';
import { bookingFreeTime, resolveFreeTime } from './booking-free-time.js';
import { bookingIssueDate } from './booking-revisions.js';
import { shipmentReferences } from './shipment-references.js';
export { sourceType, isOutOfScopeFilename } from './document-recognition.js';

const linesOf=text=>String(text??'').replace(/\r/g,'\n').split(/\n+/).map(s=>s.replace(/[\u00a0\t]+/g,' ').trim()).filter(Boolean);
function clean(s){return String(s??'').replace(/^[\s:：#=–—-]+/,'').replace(/\s{2,}(?=[A-Za-zÀ-ỹ][^:]{1,35}:).*/,'').trim().slice(0,160)}
function lookup(lines,labels,valid=()=>true){
 for(const label of labels){
  const exact=new RegExp(`^\\s*(?:${label})(?:\\s*\\([^)]{1,35}\\))?\\s*(?:[:：#=–—-]\\s*|\\.{2,}\\s*|\\s{2,})(.*)$`,'i');
  const alone=new RegExp(`^\\s*(?:${label})(?:\\s*\\([^)]{1,35}\\))?\\s*[:：#=–—-]?\\s*$`,'i');
  for(let i=0;i<lines.length;i++){
   let m=lines[i].match(exact),candidate=m?clean(m[1]):'';
   if(!candidate&&alone.test(lines[i]))candidate=clean(lines[i+1]);
   if(candidate&&valid(candidate))return candidate;
  }
 }
 return '';
}
const hasNumber=s=>/\d/.test(s)&&!/^\d+\s*(?:trang|page)/i.test(s);
const number=s=>{const m=s.match(/\d[\d.,]*(?:\s*(?:kg|kgs))?/i);return m?m[0].replace(/\s*(?:kg|kgs)$/i,''):''};
const reference=s=>{const m=s.match(/[A-Za-z0-9][A-Za-z0-9./_-]{2,70}/);return m?m[0]:''};
function extract(type,text,rows){
 const lines=linesOf(text),field=(labels,valid)=>lookup(lines,labels,valid),ref=labels=>reference(field(labels,hasNumber)),weight=labels=>number(field(labels,hasNumber));
 const party=s=>s&&!/^(?:invoice|packing list|booking|bill of lading|consignee|shipper|importer|exporter|address)\b/i.test(s);
 const common={exporter:field(['exporter','shipper','seller','người xuất khẩu','nguoi xuat khau'],party),importer:field(['importer','consignee','buyer','người nhập khẩu','nguoi nhap khau'],party),hs:ref(['hs(?:\\s*code)?','mã\\s*hs','ma\\s*hs']),invoiceNo:ref(['(?:commercial\\s+)?invoice\\s*(?:no\\.?|number|#)','số\\s*hóa\\s*đơn','so\\s*hoa\\s*don','invoice']),invoiceQty:weight(['quantity','qty','số\\s*lượng','so\\s*luong']),invoiceUnit:field(['unit(?:\\s*of\\s*measure)?','đơn\\s*vị\\s*tính','don\\s*vi\\s*tinh'],s=>/^[A-Za-zÀ-ỹ]{2,20}$/.test(s)),invoiceNet:weight(['net(?:\\s*weight)?','trọng\\s*lượng\\s*tịnh','trong\\s*luong\\s*tinh']),invoiceGross:weight(['gross(?:\\s*weight)?','trọng\\s*lượng\\s*cả\\s*bì','trong\\s*luong\\s*ca\\s*bi']),invoiceValue:weight(['(?:total\\s+)?(?:fob|amount|value)','trị\\s*giá','tri\\s*gia'])};
 let o={};
 if(type==='invoice'){
  o={
   ...common,
   exporter:field(['exporter','seller','shipped\\s*by','shipper','người xuất khẩu','nguoi xuat khau'],party),
   importer:field(['importer','buyer','for\\s*account(?:\\s*and\\s*risk)?\\s*of(?:\\s*messrs)?','người nhập khẩu','nguoi nhap khau'],party),
   invoiceDate:field(['invoice\\s*date','ngày\\s*hóa\\s*đơn','ngay\\s*hoa\\s*don'],s=>!!s.match(/\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/)),
   description:field(['description(?:\\s*of\\s*goods)?','tên\\s*hàng','ten\\s*hang'],party),
   ...(rows ? extractInvoiceSheet(rows) : {}),
  };
 }
 if(type==='packing')o={plInvoiceNo:common.invoiceNo,plExporter:common.exporter,plImporter:common.importer,plQty:common.invoiceQty,plUnit:common.invoiceUnit,plNet:common.invoiceNet,plGross:common.invoiceGross};
 if(type==='packing'&&rows){
  for(const [key,value] of Object.entries(extractPackingSheet(rows)))if(value)o[key]=value;
 }
 if(type==='booking')o={bookingNo:ref(['(?:booking|bkg)\\s*(?:no\\.?|number|ref\\.?|#)','số\\s*booking','so\\s*booking']),bookingIssuedAt:bookingIssueDate(text),pickupDate:field(['empty\\s*pick.?up','ngày\\s*nhận\\s*container\\s*rỗng'],s=>/\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(s)),cyCutoff:field(['cy\\s*cut.?off']),icdCutoff:field(['icd\\s*cut.?off']),siCutoff:field(['si\\s*cut.?off']),bookingPol:field(['port\\s*of\\s*loading','cảng\\s*xếp\\s*hàng','pol'],party)};
 if(type==='booking'){
  o.bookingShipper=field(['shipper','exporter'],party);
  o.bookingConsignee=field(['consignee','cnee'],party)||
    clean(text.match(/\bCNEE\s*[:：]\s*([^\r\n]+?)(?=\s+(?:WEIGHT|VOLUME)\b|\s*$)/im)?.[1]);
  for(const [key,value] of Object.entries(bookingNoticeFields(text)))if(value)o[key]=value;
  Object.assign(o,resolveFreeTime(bookingFreeTime(text)));
 }
 if(type==='bl')o={blExporter:common.exporter,blImporter:common.importer,blPol:field(['port\\s*of\\s*loading','pol'],party),blPod:field(['port\\s*of\\s*discharg(?:e|ing)','pod'],party),blGross:common.invoiceGross};
 if(['packing','booking','bl'].includes(type)){
  const prefix=type==='packing'?'pl':type;
  Object.assign(o,shipmentReferences(text,type),extractContainerSeal(text,prefix));
 }
 return Object.fromEntries(Object.entries(o).filter(([,v])=>v));
}
export const extractFields=extract;
