import fs from 'node:fs';
import {overlay} from './overlay.mjs';
const C=JSON.parse(fs.readFileSync('config.json','utf8')),LOCAL=process.env.LOCAL_DIR,TOK=process.env.MONITOR_TOKEN;
const now=process.env.FAKE_NOW?Date.parse(process.env.FAKE_NOW):Date.now(),DAY=864e5,fin=r=>['TP','SL','kedaluwarsa'].includes(r.hasil);
async function getJ(e){
 if(LOCAL)return JSON.parse(fs.readFileSync(`${LOCAL}/${e.repo}-main/data/journal.json`,'utf8'));
 const r=await fetch(`https://raw.githubusercontent.com/${C.owner}/${e.repo}/main/data/journal.json`,{headers:TOK?{Authorization:'token '+TOK}:{}});
 if(!r.ok)throw new Error(`${e.id}: HTTP ${r.status} (repo privat? isi secret MONITOR_TOKEN)`);return r.json()}
const wil=(k,n)=>{if(!n)return null;const z=1.96,p=k/n,d=1+z*z/n,c=p+z*z/(2*n),m=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n));return[(c-m)/d,(c+m)/d]};
const wk=r=>{const d=new Date(r.waktu.slice(0,10));const t=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));t.setUTCDate(t.getUTCDate()+4-(t.getUTCDay()||7));return t.getUTCFullYear()+'-'+Math.ceil(((t-Date.UTC(t.getUTCFullYear(),0,1))/DAY+1)/7)};
const net=r=>{const e=+r.entry,s=+r.sl;return +r.R-(C.costPct/100)/(Math.abs(e-s)/e)};
const sum=a=>a.reduce((x,y)=>x+y,0);
function stats(rows){const f=rows.filter(fin),tp=f.filter(r=>r.hasil==='TP').length,sl=f.filter(r=>r.hasil==='SL').length,n=f.map(net);
 const gp=sum(n.filter(x=>x>0)),gl=-sum(n.filter(x=>x<0)),Wk=new Set(f.map(wk)),days=new Set(rows.map(r=>r.waktu.slice(0,10)));
 let ci=null;if(Wk.size>=12){const g={};f.forEach(r=>(g[wk(r)]??=[]).push(net(r)));const v=Object.values(g),b=[];for(let i=0;i<2000;i++){let s=0,c=0;for(let j=0;j<v.length;j++){const x=v[Math.floor(Math.random()*v.length)];s+=sum(x);c+=x.length}b.push(s/c)}b.sort((a,c)=>a-c);ci=[b[50],b[1950]]}
 return{sinyal:rows.length,terisi:f.length,tp,sl,exp:f.length-tp-sl,tdkIsi:rows.filter(r=>r.hasil==='tidak terisi').length,menunggu:rows.filter(r=>r.hasil==='menunggu').length,
  win:tp+sl?tp/(tp+sl):null,winCI:wil(tp,tp+sl),netR:f.length?sum(n)/f.length:null,totalR:sum(n),pf:gl?gp/gl:null,minggu:Wk.size,hari:days.size,sinyalPerHari:days.size?rows.length/days.size:0,ci}}
const out={updated:new Date(now).toISOString(),cfg:{minTrades:C.minTrades,minWeeks:C.minWeeks},engines:[],warnings:[]};
const W=(lvl,e,t,aksi)=>out.warnings.push({lvl,e,t,aksi});
const RES={};const ENG={};const ALL=[];const px={};async function price(a){if(a in px)return px[a];try{const r=await fetch(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${a}USDT`,{signal:AbortSignal.timeout(8000)});px[a]=r.ok?+(await r.json()).price:null}catch{px[a]=null}return px[a]}
for(const e of C.engines){
 let J;try{J=await getJ(e)}catch(x){W('merah',e.id,'Jurnal tidak terbaca: '+x.message,'Periksa nama repo di config.json atau secret MONITOR_TOKEN');continue}
 const all=J.filter(r=>r.agen===e.agen&&r.waktu>=e.start),com=all.filter(r=>r.waktu>=C.commonStart),last=all.at(-1);
 if(!last){W('merah',e.id,'Tidak ada baris jurnal untuk agen '+e.agen,'Periksa config.json');continue}
 const dd={};[...all].sort((a,b)=>a.waktu<b.waktu?-1:a.waktu>b.waktu?1:0).forEach(r=>{const d=r.waktu.slice(0,10);dd[d]=(dd[d]||0)+1;r.rk=dd[d]});
for(const r of all)ALL.push({e:e.id,w:r.waktu,d:r.waktu.slice(0,10),a:r.aset,arah:r.arah,h:r.hasil,R:fin(r)?net(r):null,rk:r.rk});
for(const r of all)RES[e.id+'|'+r.aset+'|'+r.waktu.slice(0,10)+'|'+r.arah]={h:r.hasil,R:fin(r)?net(r):null};ENG[e.id]=all;
const dir={};for(const s of['LONG','SHORT'])dir[s]=stats(all.filter(r=>r.arah===s));
 const th=tharp(all.filter(fin)),st=stats(all),sc=stats(com),s7=stats(all.filter(r=>r.waktu>=new Date(now-7*DAY).toISOString().slice(0,10)));
 const pend=(()=>{const s=new Set();return all.filter(r=>r.hasil==='menunggu').reverse().filter(r=>{const k=r.aset+'|'+r.arah+'|'+r.entry;if(s.has(k))return false;s.add(k);return true}).reverse()})();
 const dupN=all.filter(r=>r.hasil==='menunggu').length-pend.length;if(dupN>0)W('info',e.id,dupN+' sinyal menunggu duplikat (koin, arah, entry sama dengan analisis lebih baru) disembunyikan',null);for(const r of pend){const p=await price(r.aset);r.px=p;r.dist=p?(p-+r.entry)/+r.entry*100:null}
 const ready=[[st.terisi>=C.minTrades,`Trade terisi ${st.terisi}/${C.minTrades}`],[st.minggu>=C.minWeeks,`Minggu ${st.minggu}/${C.minWeeks}`],[!!st.ci&&st.ci[0]>0,'CI95 bawah R/trade > 0'],[st.pf>=1.2,'Profit factor >= 1,2']];
 if(th.ok&&th.n>=30){if(th.be<0.3)W('kuning',e.id,`Edge tipis terhadap biaya: biaya impas ${th.be.toFixed(2)}% (asumsi ${C.costPct}%). Selisih biaya/slippage kecil dapat menghapus profit`,'Uji biaya nyata di Binance (fee tier, slippage) sebelum uang sungguhan');if(th.top3!=null&&th.top3>0.5)W('kuning',e.id,`Hasil terkonsentrasi: 3 trade teratas = ${(th.top3*100).toFixed(0)}% dari total untung`,'Tanpa 3 trade itu R/trade = '+(th.meanEx3==null?'-':th.meanEx3.toFixed(2)))}
 out.engines.push({id:e.id,nama:e.nama,start:e.start,tharp:th,all:st,sejakBersama:sc,tujuhHari:s7,dir,ready,layak:ready.every(x=>x[0]),
  jurnal:all.slice(-120).reverse().map(r=>({w:r.waktu.slice(0,16),a:r.aset,d:r.arah,en:r.entry,sl:r.sl,tp:r.tp,h:r.hasil,R:r.R,al:r.alasan,sk:r.score??null,gr:r.grade??null})),
  pending:pend.map(r=>({a:r.aset,d:r.arah,en:r.entry,sl:r.sl,tp:r.tp,px:r.px,dist:r.dist,w:r.waktu.slice(0,10),rk:r.rk}))});
 const lastAny=J.at(-1),age=(now-new Date(lastAny.waktu.replace(' UTC','Z').replace(' ','T')))/36e5;
 if(age>36)W('merah',e.id,`Jurnal terakhir ${age.toFixed(0)} jam lalu: workflow jurnal mungkin mati`,'Cek Actions di repo mesin');
 if(st.sinyalPerHari>10)W('kuning',e.id,`Overtrading: ${st.sinyalPerHari.toFixed(0)} sinyal/hari. @eliz883: tidak harus trading tiap hari`,'Tambah batas harian dan skor minimum (seperti tnv2c2)');
 if(st.terisi<30)W('info',e.id,`Sampel kecil (${st.terisi} trade terisi): hasil belum bermakna`,'Tunggu data; jangan ubah mesin');
 const L=dir.LONG,S=dir.SHORT;
 if(L.terisi>=15&&S.terisi>=15&&(L.netR??0)<0&&(S.netR??0)>0.3)W('kuning',e.id,`Hasil bertumpu pada satu arah: LONG ${f2(L.netR)}R (n=${L.terisi}) vs SHORT ${f2(S.netR)}R (n=${S.terisi}). Kemungkinan bergantung rezim pasar`,'Pertimbangkan filter searah tren makro; uji lintas rezim');
 if(st.sinyal&&st.tdkIsi/st.sinyal>.3)W('kuning',e.id,`${(100*st.tdkIsi/st.sinyal).toFixed(0)}% sinyal tidak terisi: entry limit terlalu jauh`,'Batasi jarak entry ke harga (tnv2c2: maks 0,75R)');
 if(st.minggu<12)W('info',e.id,`Hanya ${st.minggu} minggu data: CI per minggu belum dapat dihitung`,'Syarat 20 minggu tetap penentu')}

// ===== Lapisan uji ala Van Tharp: SQN, sensitivitas biaya, distribusi R =====
function tharp(f){
 const n=f.length;if(n<2)return{n,ok:false};
 const g=f.map(r=>+r.R),risk=f.map(r=>Math.abs(+r.entry-+r.sl)/+r.entry);
 const mean=a=>a.reduce((x,y)=>x+y,0)/a.length,sd=a=>{const m=mean(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1))};
 const net=c=>g.map((x,i)=>x-(c/100)/risk[i]);
 const nr=net(C.costPct),m=mean(nr),s=sd(nr),sqn=s>0?Math.sqrt(n)*m/s:null,sqn100=s>0?Math.sqrt(Math.min(n,100))*m/s:null;
 const be=mean(g)/mean(risk.map(x=>1/x))*100;
 const edges=[['<= -1,1',x=>x<=-1.1],['-1,1 s/d -0,5',x=>x>-1.1&&x<=-.5],['-0,5 s/d +0,5',x=>x>-.5&&x<.5],['+0,5 s/d +1,5',x=>x>=.5&&x<1.5],['+1,5 s/d +2,5',x=>x>=1.5&&x<=2.5],['> +2,5',x=>x>2.5]];
 const srt=[...nr].sort((a,b)=>b-a),pos=srt.filter(x=>x>0).reduce((a,b)=>a+b,0),top3=srt.slice(0,3).filter(x=>x>0).reduce((a,b)=>a+b,0);
 const cls=sqn==null?'-':sqn<1.6?'buruk':sqn<2?'di bawah rata-rata':sqn<2.5?'rata-rata':sqn<3?'bagus':'sangat bagus';
 return{ok:true,n,mean:m,sd:s,sqn,sqn100,cls,be,
  biaya:[0,.1,.2,.3,.5].map(c=>({c,r:mean(net(c))})),
  dist:edges.map(([l,fn])=>({l,n:g.filter(fn).length})),
  top3:pos>0?top3/pos:null,meanEx3:n>3?mean(srt.slice(3)):null}}
function tharpMd(out){let m='\n## Uji ala Van Tharp (SQN, biaya, distribusi R)\n';
 for(const e of out.engines){const t=e.tharp;if(!t||!t.ok){m+=`- ${e.id}: data belum cukup\n`;continue}
  m+=`- ${e.id}: N=${t.n}, R/trade ${t.mean.toFixed(2)}, SD ${t.sd.toFixed(2)}, SQN ${t.sqn==null?'-':t.sqn.toFixed(2)} (SQN100 ${t.sqn100==null?'-':t.sqn100.toFixed(2)}, ${t.cls}); biaya impas ${t.be.toFixed(2)}%; biaya 0,1/0,3/0,5%: ${[1,3,4].map(i=>t.biaya[i].r.toFixed(2)).join(' / ')}R; 3 trade teratas = ${t.top3==null?'-':(t.top3*100).toFixed(0)+'%'} dari total untung; R/trade tanpa 3 teratas ${t.meanEx3==null?'-':t.meanEx3.toFixed(2)}\n    distribusi R: ${t.dist.map(d=>d.l+': '+d.n).join(' | ')}\n`}
 return m+'- Catatan: SQN bergantung pada jumlah trade; sebelum N >= 30 jangan ditafsirkan. Skala kelas SQN adalah acuan umum, cocokkan dengan buku.\n'}
function f2(x){return x==null?'-':x.toFixed(2)}
W('kuning','monitor','Penilaian monitor memakai hasil jurnal mesin (masa order 7 hari), bukan penilaian candle sendiri, sehingga tidak ada EXPIRED 3 hari yang menutup sinyal pemenang','Bila angka monitor berbeda dari jurnal mesin, itu bug monitor: laporkan');
for(const e of out.engines)if(!e.layak)W('merah',e.id,'BELUM LAYAK uang sungguhan: '+e.ready.filter(x=>!x[0]).map(x=>x[1]).join('; '),'Jika tetap trading di Binance, risiko maks 0,25% per trade');
let EZ=[];try{EZ=JSON.parse(fs.readFileSync('data/eliz-posts.json','utf8'))}catch{}
const tick=new Set();EZ.slice(-30).forEach(p=>[...p.teks.matchAll(/\$([A-Z]{2,10})/g)].forEach(m=>tick.add(m[1])));
out.eliz={posts:EZ.slice(-10).reverse(),tickers:[...tick],lastPost:EZ.at(-1)?.tgl||null,cocok:[...tick].map(t=>({t,sinyal:out.engines.map(e=>({e:e.id,n:e.jurnal.filter(r=>r.a===t).slice(0,3).map(r=>r.d+' '+r.w.slice(5,10)+' '+r.h)}))}))};
if(!EZ.length)W('kuning','eliz','data/eliz-posts.json kosong','Tambahkan postingan terbaru @eliz883');
else if((now-new Date(EZ.at(-1).tgl))/DAY>3)W('kuning','eliz',`Postingan @eliz883 terakhir di monitor sudah ${((now-new Date(EZ.at(-1).tgl))/DAY).toFixed(0)} hari`,'Perbarui data/eliz-posts.json');
fs.mkdirSync('site',{recursive:true});const OV=await overlay(out,C,RES,ALL);const f=(x,d=2)=>x==null?'-':x.toFixed(d),pc=x=>x==null?'-':(100*x).toFixed(0)+'%';
let md=`# Laporan monitor untuk Claude (${out.updated})\n\n## Kinerja (hasil jurnal mesin, biaya ${C.costPct}% pulang-pergi)\n| Mesin | Sinyal | Terisi | TP/SL | Win | R/trade | PF | Minggu | Sejak ${C.commonStart}: terisi / R/trade |\n|---|---|---|---|---|---|---|---|---|\n`;
for(const e of out.engines)md+=`| ${e.nama} | ${e.all.sinyal} | ${e.all.terisi} | ${e.all.tp}/${e.all.sl} | ${pc(e.all.win)} | ${f(e.all.netR)} | ${f(e.all.pf)} | ${e.all.minggu} | ${e.sejakBersama.terisi} / ${f(e.sejakBersama.netR)} |\n`;
md+=`\n## LONG vs SHORT\n`;for(const e of out.engines)md+=`- ${e.id}: LONG n=${e.dir.LONG.terisi} R/trade ${f(e.dir.LONG.netR)}; SHORT n=${e.dir.SHORT.terisi} R/trade ${f(e.dir.SHORT.netR)}\n`;
md+=`\n## Warning\n`;for(const w of out.warnings)md+=`- [${w.lvl}] ${w.e}: ${w.t}${w.aksi?' -> '+w.aksi:''}\n`;
md+=`\n## Postingan terbaru @eliz883 (tickers: ${out.eliz.tickers.join(', ')||'-'})\n`;for(const p of out.eliz.posts.slice(0,5))md+=`- ${p.tgl}: ${p.teks.slice(0,400)}\n`;
md+=OV+tharpMd(out);md+=`\n## Permintaan\nEvaluasi laporan ini, cocokkan dengan postingan @eliz883 di atas, lalu buatkan full coding perbaikan (zip utuh siap commit lewat GitHub web UI). Prinsip: jangan ubah core.mjs/trade-sim.mjs selama forward test tanpa memulai protokol baru; jujur soal sampel kecil dan rezim pasar. Unggah zip repo mesin terbaru bila perlu diverifikasi.\n`;
out.laporan=md;
let LG=[];if(!LOCAL){const r=await fetch(`https://${C.owner}.github.io/monitortn/laporan-log.json`);if(r.ok)LG=await r.json();else if(r.status!==404)throw new Error('laporan-log.json HTTP '+r.status+': build dihentikan agar riwayat tidak hilang')}
if(process.env.LOG_IN)LG=JSON.parse(fs.readFileSync(process.env.LOG_IN,'utf8'));
// Rekonstruksi laporan untuk tanggal yang terlewat (hanya 3 hari terakhir). BUKAN snapshot asli: dihitung ulang dari jurnal per akhir hari (WIB).
function recon(d){const cut=Date.parse(d)+864e5-7*36e5-1,ts=r=>Date.parse(r.waktu.replace(' UTC','Z').replace(' ','T'));
 let m=`# Laporan REKONSTRUKSI tanggal ${d} (dibuat ${out.updated.slice(0,10)}; BUKAN snapshot asli)\n\nDihitung ulang dari jurnal mesin dengan hanya memakai data sampai akhir ${d} (WIB). Hasil trade yang baru selesai setelah itu dianggap belum selesai. TIDAK mencakup kondisi pasar, keputusan monitor, dan harga pada hari itu.\n\n## Kinerja (biaya ${C.costPct}% pulang-pergi)\n| Mesin | Sinyal | Terisi | TP/SL | Win | R/trade | PF |\n|---|---|---|---|---|---|---|\n`;
 const T={engines:[]},D2=[];
 for(const [id,all] of Object.entries(ENG)){const rows=all.filter(r=>ts(r)<=cut).map(r=>r.tx&&r.tx>cut&&r.hasil!=='menunggu'?{...r,hasil:'menunggu'}:r);
  const st=stats(rows),th=tharp(rows.filter(fin)),dl=stats(rows.filter(r=>r.arah==='LONG')),ds=stats(rows.filter(r=>r.arah==='SHORT'));
  m+=`| ${id} | ${st.sinyal} | ${st.terisi} | ${st.tp}/${st.sl} | ${pc(st.win)} | ${f(st.netR)} | ${f(st.pf)} |\n`;
  D2.push(`- ${id}: LONG n=${dl.terisi} R/trade ${f(dl.netR)}; SHORT n=${ds.terisi} R/trade ${f(ds.netR)}`);T.engines.push({id,tharp:th})}
 m+=`\n## LONG vs SHORT\n${D2.join('\n')}\n`+tharpMd(T);
 const P=EZ.filter(p=>p.tgl.slice(0,10)<=d).slice(-5).reverse();
 m+=`\n## Postingan @eliz883 sampai ${d}\n${P.map(p=>`- ${p.tgl}: ${p.teks.slice(0,400)}`).join('\n')||'- tidak ada'}\n`;
 return m+`\n## Permintaan\nEvaluasi laporan rekonstruksi ini seperti laporan biasa, dengan catatan bahwa ia dihitung ulang dari jurnal, bukan snapshot asli.\n`}
// Satu laporan per tanggal (WIB). Laporan hari ini terus diperbarui; mulai besok ia membeku dan tampil 3 hari.
const wibD=iso=>new Date(new Date(iso).getTime()+7*36e5).toISOString().slice(0,10);
const hari=wibD(out.updated);
LG=LG.map(x=>x.d?x:{...x,d:wibD(x.t)});
for(const k of [3,2,1]){const d=new Date(Date.parse(hari)-k*864e5).toISOString().slice(0,10);if(!LG.some(x=>x.d===d))LG.push({id:d.replace(/-/g,'')+'0000',d,t:out.updated,md:recon(d),rekon:true})}
let cur=LG.find(x=>x.d===hari);
if(cur){cur.t=out.updated;cur.md=md}else{cur={id:hari.replace(/-/g,'')+'0000',d:hari,t:out.updated,md};LG.push(cur)}
out.hariIni=hari;out.hariId=cur.id;
const batas=new Date(Date.parse(hari)-4*864e5).toISOString().slice(0,10);
LG=LG.filter(x=>x.d>=batas).sort((a,b)=>a.d<b.d?-1:a.d>b.d?1:0);
out.log=LG.map(x=>x.d===hari?{...x,md:''}:x);
fs.mkdirSync('site',{recursive:true});fs.writeFileSync('site/laporan-log.json',JSON.stringify(LG));
fs.mkdirSync('site',{recursive:true});fs.copyFileSync('index.html','site/index.html');fs.writeFileSync('site/data.json',JSON.stringify(out));fs.writeFileSync('site/laporan.md',md);console.log('OK',out.engines.length,'mesin,',out.warnings.length,'warning')
