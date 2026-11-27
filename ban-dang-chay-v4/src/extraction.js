import { extractInvoiceSheet } from './invoice-sheet.js';
import { extractPackingSheet } from './packing-sheet.js';
import { extractContainerSeal } from './bill-of-lading.js';
import { bookingNoticeFields } from './booking-notice.js';

const plain=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

export function isOutOfScopeFilename(name) {
 const filename=String(name).split('/').pop();
 const normalized=plain(filename);
 return /to\s*khai|customs declaration|giam sat|vnaccs|certificate of origin|chung nhan xuat xu/.test(normalized) ||
  /^(?:co|c[\s_-]+o)\.[a-z0-9]+$/i.test(filename);
}

export function sourceType(name,text=''){
 const file=plain(String(name).split('/').pop()),body=plain(text),head=plain(text.slice(0,4000));
 // A transport document often mentions a Booking number. Its title or filename wins.
 const names=[['bl',/(?:^| )(?:bill(?: of lading)?|b l|bl|waybill|hbl|mbl|van don)(?: |$)/],['packing',/packing|pack list|p l|phieu dong goi/],['invoice',/invoice|hoa don|(?:^| )ci(?: |$)/],['booking',/booking|book confirmation|xac nhan dat cho/]];
 if(isOutOfScopeFilename(name))return 'other';
 if(/(?:^| )(?:dinh muc|dm\d*|material consumption)(?: |$)/.test(file))return 'other';
 for(const [type,re] of names)if(re.test(file))return type;
 if(text.slice(0,4000).split(/\r?\n/).some(line=>/^(?:to khai (?:hai quan|hang hoa)|customs declaration|danh sach giam sat|certificate of origin|chung nhan xuat xu)\b/.test(plain(line))))return 'other';
 if(text.slice(0,4000).split(/\r?\n/).some(line=>/^booking notice$/i.test(line.trim())))return 'booking';
 const titles=[['bl',/bill of lading|sea waybill|van don duong bien/],['packing',/packing list|packing details|phieu dong goi/],['invoice',/commercial invoice|hoa don thuong mai/],['booking',/booking confirmation|xac nhan dat cho/]];
 for(const [type,re] of titles)if(re.test(head))return type;
 if(text.slice(0,4000).split(/\r?\n/).some(line=>/^invoice$/i.test(line.trim())))return 'invoice';
 if(/dinh muc|material consumption|hao hut nguyen lieu/.test(head))return 'other';
 if(/bill of lading|b l no|bl number|shipped on board/.test(body))return 'bl';
 if(/packing list|packing details/.test(body))return 'packing';
 if(/commercial invoice|invoice no|invoice number/.test(body))return 'invoice';
 if(/booking no|booking number/.test(body))return 'booking';
 return 'other';
}

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
 if(type==='packing')o={plInvoiceNo:common.invoiceNo,plExporter:common.exporter,plImporter:common.importer,plQty:common.invoiceQty,plUnit:common.invoiceUnit,plNet:common.invoiceNet,plGross:common.invoiceGross,plContainer:ref(['container(?:\\s*(?:no\\.?|number))?','số\\s*container','so\\s*container']),plSeal:field(['seal(?:\\s*(?:no\\.?|number))?','số\\s*seal','so\\s*seal'],s=>/^[A-Za-z0-9./_-]{2,70}$/i.test(s))};
 if(type==='packing'&&rows){
  for(const [key,value] of Object.entries(extractPackingSheet(rows)))if(value)o[key]=value;
 }
 if(type==='booking')o={bookingNo:ref(['booking\\s*(?:no\\.?|number|#)','số\\s*booking','so\\s*booking']),pickupDate:field(['empty\\s*pick.?up','ngày\\s*nhận\\s*container\\s*rỗng'],s=>/\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(s)),freeDays:weight(['free\\s*time','số\\s*ngày\\s*miễn\\s*phí']),cyCutoff:field(['cy\\s*cut.?off']),icdCutoff:field(['icd\\s*cut.?off']),siCutoff:field(['si\\s*cut.?off']),bookingPol:field(['port\\s*of\\s*loading','cảng\\s*xếp\\s*hàng','pol'],party),bookingContainer:ref(['container(?:\\s*(?:no\\.?|number))?']),bookingSeal:field(['seal(?:\\s*(?:no\\.?|number))?'],s=>/^[A-Za-z0-9./_-]{2,70}$/i.test(s)),plannedWeight:weight(['planned\\s*weight','estimated\\s*weight']),finalWeight:weight(['final\\s*weight','verified\\s*gross\\s*mass','vgm'])};
 if(type==='booking'){
  o.bookingShipper=field(['shipper','exporter'],party);
  o.bookingConsignee=field(['consignee','cnee'],party)||
    clean(text.match(/\bCNEE\s*[:：]\s*([^\r\n]+?)(?=\s+(?:WEIGHT|VOLUME)\b|\s*$)/im)?.[1]);
  for(const [key,value] of Object.entries(bookingNoticeFields(text)))if(value)o[key]=value;
 }
 if(type==='bl')o={blExporter:common.exporter,blImporter:common.importer,blPol:field(['port\\s*of\\s*loading','pol'],party),blPod:field(['port\\s*of\\s*discharge','pod'],party),blContainer:ref(['container(?:\\s*(?:no\\.?|number))?']),blSeal:field(['seal(?:\\s*(?:no\\.?|number))?'],s=>/^[A-Za-z0-9./_-]{2,70}$/i.test(s)),blGross:common.invoiceGross};
 if(type==='bl')Object.assign(o,extractContainerSeal(text));
 return Object.fromEntries(Object.entries(o).filter(([,v])=>v));
}
export const extractFields=extract;
