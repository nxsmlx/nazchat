/* Capture analysis (4.15.0): read a .pcap / .pcapng file (for example from PCAPdroid,
   which records this phone's own traffic without root) and summarise it: who the phone
   talked to, DNS lookups, the sites behind TLS connections (SNI), unencrypted HTTP
   requests and QUIC. The summary, not the raw capture, is what Kita sends to the model. */
'use strict';

const PCAPDROID_URL='https://play.google.com/store/apps/details?id=com.emanuelef.remote_capture';
function isPrivateIp(ip){return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|127\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|fe80:|fc|fd|::1$)/i.test(ip);}
function ipv4(b,o){return b[o]+'.'+b[o+1]+'.'+b[o+2]+'.'+b[o+3];}
function ipv6(b,o){const p=[];for(let i=0;i<16;i+=2)p.push(((b[o+i]<<8)|b[o+i+1]).toString(16));return p.join(':').replace(/(^|:)0(:0)+(:|$)/,'::');}
function dnsName(b,o,end,depth=0){
  const parts=[];let jumped=false,next=o;
  for(let guard=0;o<end&&guard<64;guard++){
    const l=b[o];
    if(l===0){if(!jumped)next=o+1;break;}
    if((l&0xC0)===0xC0){if(depth>8)break;if(!jumped)next=o+2;jumped=true;o=((l&0x3F)<<8|b[o+1]);continue;}
    parts.push(String.fromCharCode(...b.subarray(o+1,Math.min(o+1+l,end))));o+=l+1;if(!jumped)next=o;
  }
  return {name:parts.join('.').toLowerCase(),next};
}
function tlsSni(p){
  try{
    if(p.length<43||p[0]!==0x16||p[5]!==0x01) return '';
    let o=5+4+2+32;o+=1+p[o];o+=2+((p[o]<<8)|p[o+1]);o+=1+p[o];
    const extEnd=o+2+((p[o]<<8)|p[o+1]);o+=2;
    while(o+4<=extEnd&&o+4<=p.length){
      const type=(p[o]<<8)|p[o+1],len=(p[o+2]<<8)|p[o+3];
      if(type===0){const nl=(p[o+7]<<8)|p[o+8];return String.fromCharCode(...p.subarray(o+9,o+9+nl)).toLowerCase();}
      o+=4+len;
    }
  }catch(e){}
  return '';
}
/* Packets from a classic pcap or pcapng file: [{linktype, data, ts}] */
function capturePackets(buf){
  const b=new Uint8Array(buf),dv=new DataView(buf),out=[];
  const m=dv.getUint32(0,false);
  if(m===0xA1B2C3D4||m===0xD4C3B2A1||m===0xA1B23C4D||m===0x4D3CB2A1){
    const le=m===0xD4C3B2A1||m===0x4D3CB2A1,link=dv.getUint32(20,le);let o=24;
    while(o+16<=b.length&&out.length<200000){const ts=dv.getUint32(o,le),len=dv.getUint32(o+8,le);if(o+16+len>b.length)break;out.push({linktype:link,data:b.subarray(o+16,o+16+len),ts});o+=16+len;}
    return {format:'pcap',packets:out};
  }
  if(m===0x0A0D0D0A){
    let le=dv.getUint32(8,true)===0x1A2B3C4D,o=0;const links=[];
    while(o+12<=b.length&&out.length<200000){
      const type=dv.getUint32(o,le),len=dv.getUint32(o+4,le);if(len<12||o+len>b.length)break;
      if(type===0x0A0D0D0A){le=dv.getUint32(o+8,true)===0x1A2B3C4D;}
      else if(type===1) links.push(dv.getUint16(o+8,le));
      else if(type===6){const iface=dv.getUint32(o+8,le),cap=dv.getUint32(o+20,le),ts=dv.getUint32(o+12,le)*4294.967296+dv.getUint32(o+16,le)/1e6;out.push({linktype:links[iface]??1,data:b.subarray(o+28,o+28+cap),ts});}
      else if(type===3){out.push({linktype:links[0]??1,data:b.subarray(o+12,o+len-4),ts:0});}
      o+=len;
    }
    return {format:'pcapng',packets:out};
  }
  throw new Error('This is not a .pcap or .pcapng capture');
}
function ipPayload(linktype,d){
  if(linktype===1){let o=12,t=(d[o]<<8)|d[o+1];if(t===0x8100){o+=4;t=(d[o]<<8)|d[o+1];}return {ip:d.subarray(o+2),v:t===0x0800?4:t===0x86DD?6:0};}
  if(linktype===113){const t=(d[14]<<8)|d[15];return {ip:d.subarray(16),v:t===0x0800?4:t===0x86DD?6:0};}
  if(linktype===276){const t=(d[0]<<8)|d[1];return {ip:d.subarray(20),v:t===0x0800?4:t===0x86DD?6:0};}
  if(linktype===228) return {ip:d,v:4};
  if(linktype===229) return {ip:d,v:6};
  if(linktype===101||linktype===12||linktype===14) return {ip:d,v:d[0]>>4};
  return {ip:d,v:0};
}
function analyzeCapture(buf){
  const {format,packets}=capturePackets(buf);
  const hosts=new Map(),dns=new Map(),sni=new Map(),names=new Map(),http=[],proto={tcp:0,udp:0,dns:0,tls:0,http:0,quic:0,other:0};
  let first=null,last=null,bytes=0;
  const peer=(src,dst)=>isPrivateIp(dst)&&!isPrivateIp(src)?src:dst;
  for(const pk of packets){
    if(pk.ts){first=first===null?pk.ts:Math.min(first,pk.ts);last=last===null?pk.ts:Math.max(last,pk.ts);}
    bytes+=pk.data.length;
    const {ip,v}=ipPayload(pk.linktype,pk.data);
    let src,dst,proto_,l4;
    if(v===4&&ip.length>=20){const ihl=(ip[0]&15)*4;proto_=ip[9];src=ipv4(ip,12);dst=ipv4(ip,16);l4=ip.subarray(ihl);}
    else if(v===6&&ip.length>=40){proto_=ip[6];src=ipv6(ip,8);dst=ipv6(ip,24);l4=ip.subarray(40);}
    else{proto.other++;continue;}
    const who=peer(src,dst),h=hosts.get(who)||{bytes:0,packets:0};h.bytes+=pk.data.length;h.packets++;hosts.set(who,h);
    if(proto_===6&&l4.length>=20){
      proto.tcp++;const sp=(l4[0]<<8)|l4[1],dp=(l4[2]<<8)|l4[3],off=(l4[12]>>4)*4,pl=l4.subarray(off);
      if(pl.length){
        const s=tlsSni(pl);if(s){proto.tls++;sni.set(s,(sni.get(s)||0)+1);names.set(dst,s);}
        else if(/^(GET|POST|PUT|HEAD|DELETE|OPTIONS|PATCH) /.test(String.fromCharCode(...pl.subarray(0,8)))){
          const text=String.fromCharCode(...pl.subarray(0,Math.min(pl.length,800)));const line=text.split('\r\n')[0];const host=(text.match(/\r\nHost:\s*([^\r\n]+)/i)||[])[1]||dst;
          proto.http++;if(http.length<50)http.push({host:host.trim(),line:line.slice(0,160),port:dp});
        }
      }
      void sp;
    }else if(proto_===17&&l4.length>=8){
      proto.udp++;const sp=(l4[0]<<8)|l4[1],dp=(l4[2]<<8)|l4[3],pl=l4.subarray(8);
      if((sp===53||dp===53||sp===5353||dp===5353)&&pl.length>=12){
        proto.dns++;const qd=(pl[4]<<8)|pl[5],an=(pl[6]<<8)|pl[7],isResp=(pl[2]&0x80)!==0;let o=12;
        for(let i=0;i<qd&&o<pl.length;i++){const q=dnsName(pl,o,pl.length);o=q.next+4;if(!isResp&&q.name)dns.set(q.name,(dns.get(q.name)||0)+1);}
        if(isResp) for(let i=0;i<an&&o+10<pl.length;i++){const r=dnsName(pl,o,pl.length);o=r.next;const t=(pl[o]<<8)|pl[o+1],rl=(pl[o+8]<<8)|pl[o+9];o+=10;if(t===1&&rl===4)names.set(ipv4(pl,o),names.get(ipv4(pl,o))||r.name);if(t===28&&rl===16)names.set(ipv6(pl,o),names.get(ipv6(pl,o))||r.name);o+=rl;}
      }else if(sp===443||dp===443) proto.quic++;
    }else proto.other++;
  }
  return {format,packets:packets.length,bytes,seconds:first!==null?Math.max(0,last-first):0,hosts,dns,sni,names,http,proto};
}
function fmtBytes(n){return n>1e6?(n/1e6).toFixed(1)+' MB':n>1e3?(n/1e3).toFixed(1)+' KB':n+' B';}
function captureSummary(a,name){
  const top=[...a.hosts.entries()].sort((x,y)=>y[1].bytes-x[1].bytes).slice(0,15);
  const lines=['Capture '+(name||'')+': '+a.packets+' packets, '+fmtBytes(a.bytes)+(a.seconds?' over '+Math.round(a.seconds)+'s':'')+' ('+a.format+')',
    'Protocols: '+Object.entries(a.proto).filter(([,v])=>v).map(([k,v])=>k+' '+v).join(', '),'',
    'Top hosts by data:',...top.map(([ip,h])=>'- '+ip+(a.names.get(ip)?' ('+a.names.get(ip)+')':'')+': '+fmtBytes(h.bytes)+', '+h.packets+' packets'),'',
    'DNS lookups ('+a.dns.size+'):',...[...a.dns.entries()].sort((x,y)=>y[1]-x[1]).slice(0,40).map(([n,c])=>'- '+n+(c>1?' ×'+c:'')),'',
    'Encrypted sites (TLS SNI, '+a.sni.size+'):',...[...a.sni.entries()].sort((x,y)=>y[1]-x[1]).slice(0,40).map(([n,c])=>'- '+n+(c>1?' ×'+c:''))];
  if(a.http.length){lines.push('','Unencrypted HTTP requests ('+a.http.length+'):',...a.http.slice(0,20).map(h=>'- '+h.host+' · '+h.line));}
  if(a.proto.quic) lines.push('','QUIC/HTTP3 packets: '+a.proto.quic+' (encrypted; site names are not readable)');
  return lines.join('\n');
}
async function captureFileToAttachment(file){
  const buf=await readAsArrayBuffer(file);
  const a=analyzeCapture(buf);
  return {name:file.name+'.summary.txt',type:'text/plain',text:captureSummary(a,file.name),capture:true};
}
