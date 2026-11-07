// Lapisan keputusan monitor (TIDAK mengubah mesin). Semua ambang = HIPOTESIS yang dicatat dan diaudit ke depan.
const H=['https://data-api.binance.vision','https://api.binance.com'],DAY=864e5;
async function bj(p){let e;for(const h of H){try{const r=await fetch(h+'/api/v3/'+p,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json()}catch(x){e=x}}throw e}
const kl=async(s,iv,n)=>(await bj(`klines?symbol=${s}&interval=${iv}&limit=${n}`)).map(a=>({t:a[0],h:+a[2],l:+a[3],c:+a[4],v:+a[5]}));
const ema=(a,n)=>{const k=2/(n+1);let e=a[0];return a.map(v=>e=v*k+e*(1-k))};
export const TH={volRendah:.85,trendTipis:.015,volEkstrem:6,maxJarakPct:5};
async function regime(){const k=(await kl('BTCUSDT','1d',70)).slice(0,-1),c=k.map(q=>q.c),n=k.length,px=c[n-1];
 const e20=ema(c,20)[n-1],e50=ema(c,50)[n-1],tr=k.slice(-14).map((q,i,a)=>Math.max(q.h-q.l,i?Math.abs(q.h-a[i-1].c):0)),atr=tr.reduce((x,y)=>x+y,0)/14/px*100;
 const qv=k.map(q=>q.v*q.c),vr=qv[n-1]/(qv.slice(-31,-1).reduce((x,y)=>x+y,0)/30),ts=Math.abs(e20-e50)/px,range=(Math.max(...k.slice(-14).map(q=>q.h))-Math.min(...k.slice(-14).map(q=>q.l)))/px*100;
 const fl=[];if(vr<TH.volRendah)fl.push('volume rendah ('+vr.toFixed(2)+'x rata-rata 30 hari)');if(ts<TH.trendTipis||(px<Math.max(e20,e50)&&px>Math.min(e20,e50)))fl.push('tren tidak jelas (harga di antara EMA20/EMA50)');
 const st=fl.length>=2?'TIDAK TRADING':fl.length==1?'SELEKTIF':'NORMAL';
 return{status:st,flags:fl,volRatio:vr,atrPct:atr,range14:range,trendStr:ts*100,btcTrend:px>e20&&e20>e50?1:px<e20&&e20<e50?-1:0,tunggu:atr>TH.volEkstrem?'Volatilitas ekstrem: jangan kejar harga, tunggu reda':null}}
async function eur(){const k=(await kl('EURUSDT','1d',6)).slice(0,-1),c=k.map(q=>q.c),n=c.length;const d1=(c[n-1]/c[n-2]-1)*100,d3=(c[n-1]/c[n-4]-1)*100;
 return{d1,d3,arah:d3>0.3?'menguat':d3<-0.3?'melemah':'datar',catatan:'EURUSDT (Binance) sebagai proksi EUR/USD. Informasi makro, BUKAN trigger. @eliz883: EUR/USD hijau = hindari short BTC.'}}
async function conf(r){const g=async iv=>(await kl(r.a+'USDT',iv,30)).slice(0,-1),[a,b]=await Promise.all([g('4h'),g('12h')]),s=r.d==='LONG'?1:-1,en=+r.en,sl=+r.sl,c4=a.at(-1).c,c12=b.at(-1).c;
 if(s==1?c12<sl:c12>sl)return['BATAL','close 12H melewati SL'];
 const held=a.slice(-8).some(q=>s==1?q.l<=en*1.003&&q.c>en:q.h>=en*.997&&q.c<en);
 if(s==1?c4>en:c4<en)return held?['SIAP','retest tertahan di 4H']:['TUNGGU','di sisi benar level, belum retest'];
 return['TUNGGU','tunggu close 4H '+(s==1?'di atas':'di bawah')+' entry']}
async function gapDiag(){const t=(await bj('ticker/24hr')).filter(x=>x.symbol.endsWith('USDT')).sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,40),bad=[];
 for(let i=0;i<t.length;i+=8)await Promise.all(t.slice(i,i+8).map(async x=>{try{const k=(await kl(x.symbol,'1d',130));for(let j=1;j<k.length;j++)if(k[j].t-k[j-1].t!==DAY){bad.push({s:x.symbol.slice(0,-4),gap:new Date(k[j].t).toISOString().slice(0,10)});return}}catch{}}));return{cek:t.length,gagal:bad}}
export async function overlay(out,C,RES,fs){
 let reg=null,eu=null;try{reg=await regime()}catch(x){out.warnings.push({lvl:'kuning',e:'monitor',t:'Kondisi pasar tidak terambil: '+x.message,aksi:'Cek akses Binance dari Actions'})}
 try{eu=await eur()}catch{}out.regime=reg;out.eur=eu;
 const ez=out.eliz.lastPost?(Date.now()-new Date(out.eliz.lastPost))/DAY:null;out.elizAge=ez;
 if(reg&&reg.status!=='NORMAL')out.warnings.push({lvl:reg.status==='TIDAK TRADING'?'merah':'kuning',e:'pasar',t:`Kondisi pasar ${reg.status}: ${reg.flags.join('; ')}`,aksi:'Sejalan dengan @eliz883: tidak harus trading tiap hari'});
 if(reg?.tunggu)out.warnings.push({lvl:'kuning',e:'pasar',t:reg.tunggu,aksi:null});
 if(eu&&eu.arah==='menguat')out.warnings.push({lvl:'info',e:'makro',t:`EUR/USD ${eu.arah} (${eu.d3.toFixed(2)}% 3 hari): hindari short BTC`,aksi:null});
 // keputusan per sinyal menunggu
 let old=[];if(!process.env.LOCAL_DIR){const r=await fetch(`https://${C.owner}.github.io/monitortn/decisions.json`);if(r.ok)old=await r.json();else if(r.status!==404)throw new Error('decisions.json HTTP '+r.status+': build dihentikan agar riwayat tidak hilang')}
 const seen=new Map(old.map(d=>[d.k,d])),today=new Date().toISOString().slice(0,10),cache={};
 for(const e of out.engines)for(const r of e.pending){
  let kp='-',kn='';try{
   if(reg?.status==='TIDAK TRADING'){kp='HINDARI';kn='pasar tanpa volume/arah'}
   else{const c=cache[r.a+r.d+r.en]??=await conf(r);kp=c[0];kn=c[1];if(r.dist!=null&&Math.abs(r.dist)>TH.maxJarakPct&&kp==='SIAP'){kp='TUNGGU';kn='harga >'+TH.maxJarakPct+'% dari entry'}}
   if(r.a==='BTC'&&r.d==='SHORT'&&eu?.arah==='menguat')kn+=' | EUR/USD menguat: hati-hati short BTC'}catch{kn='konfirmasi gagal diambil'}
  r.kp=kp;r.kn=kn;const k=`${e.id}|${r.a}|${r.w}|${r.d}`;if(kp!=='-'&&!seen.has(k))seen.set(k,{k,t:new Date().toISOString(),kp,rg:reg?.status||'?',bf:r.w<today})}
 const dec=[...seen.values()].slice(-3000),G={};
 for(const d of dec){const x=RES[d.k];if(d.bf||!x||x.R==null)continue;const g=d.kp==='SIAP'?'SIAP':'LAINNYA',s=G[g]??={n:0,tp:0,r:0};s.n++;if(x.h==='TP')s.tp++;s.r+=x.R}
 out.audit={catatan:'Keputusan dicatat saat pertama kali sinyal terlihat (tanpa backfill). Baca hanya bila tiap grup >= 30.',grup:Object.entries(G).map(([g,s])=>({g,n:s.n,tp:s.tp,r:s.r/s.n})),total:dec.length};
 out.gapDiag=null;try{out.gapDiag=await gapDiag();if(out.gapDiag.gagal.length)out.warnings.push({lvl:'kuning',e:'tnv2c2',t:`${out.gapDiag.gagal.length}/${out.gapDiag.cek} koin top volume punya candle harian bolong (kandidat penyebab data-tidak-valid): ${out.gapDiag.gagal.map(x=>x.s).join(', ')}`,aksi:'Cek apakah ini saham tokenisasi; jika ya, pertimbangkan toleransi bolong di checkBars'})}catch{}
 fs.writeFileSync('site/decisions.json',JSON.stringify(dec));
 let m=`\n## Kondisi pasar objektif\n`+(reg?`- Status: ${reg.status}${reg.flags.length?' ('+reg.flags.join('; ')+')':''}; ATR14 BTC ${reg.atrPct.toFixed(1)}%, range 14 hari ${reg.range14.toFixed(1)}%\n`:'- tidak tersedia\n')+(eu?`- EUR/USD ${eu.arah} (1 hari ${eu.d1.toFixed(2)}%, 3 hari ${eu.d3.toFixed(2)}%)\n`:'')+`\n## Keputusan monitor untuk sinyal menunggu\n`;
 for(const e of out.engines)for(const r of e.pending)m+=`- ${e.id} ${r.a} ${r.d} entry ${r.en}: ${r.kp} ${r.kn}\n`;
 m+=`\n## Audit lapisan keputusan\n${out.audit.grup.map(g=>`- ${g.g}: n=${g.n}, TP=${g.tp}, R/trade ${g.r.toFixed(2)}`).join('\n')||'- belum ada sinyal selesai'}\n`;
 if(ez!=null&&ez>3)m=`\n> PENGINGAT: postingan @eliz883 terakhir di monitor ${ez.toFixed(0)} hari lalu. Lampirkan postingan terbaru di chat.\n`+m;
 return m}
