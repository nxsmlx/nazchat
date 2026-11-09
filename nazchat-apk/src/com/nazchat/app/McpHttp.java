package com.nazchat.app;

import java.io.*;
import java.net.*;
import java.util.*;
import org.json.*;

/** Bounded, no-redirect HTTPS transport shared by MCP and OAuth. No Android dependencies. */
final class McpHttp {
    static final int MAX_BYTES = 2 * 1024 * 1024;
    interface Control { void opened(HttpURLConnection connection) throws Exception; }
    static final class Response {
        final int status; final String body; final Map<String,String> headers;
        Response(int s, String b, Map<String,String> h) { status=s; body=b; headers=h; }
        String header(String name) { String value=headers.get(name.toLowerCase(java.util.Locale.US)); return value==null?"":value; }
    }
    static URL checked(String value) throws Exception {
        URL u = new URL(value);
        if (!"https".equalsIgnoreCase(u.getProtocol()) || u.getUserInfo()!=null || u.getRef()!=null || u.getHost().isEmpty())
            throw new IOException("Use a public HTTPS URL without credentials or fragments");
        String host=u.getHost().toLowerCase(java.util.Locale.US);
        if(host.equals("localhost") || host.endsWith(".local") || host.endsWith(".localhost")) throw new IOException("Private hosts are not allowed");
        for(InetAddress a:InetAddress.getAllByName(host)) {
            byte[] b=a.getAddress();
            if(a.isAnyLocalAddress()||a.isLoopbackAddress()||a.isLinkLocalAddress()||a.isSiteLocalAddress()||a.isMulticastAddress()
                || (b.length==16 && (b[0]&0xfe)==0xfc)
                || (b.length==4 && ((b[0]&255)==0 || (b[0]&255)==127 || ((b[0]&255)==100 && (b[1]&255)>=64 && (b[1]&255)<=127)
                    || ((b[0]&255)==169 && (b[1]&255)==254) || (b[0]&255)>=224))) throw new IOException("Private network endpoints are not allowed");
        }
        return u;
    }
    static Response request(String url,String method,Map<String,String> headers,String body,Control control) throws Exception {
        return requestWithId(url,method,headers,body,control,-1);
    }
    static Response rpcRequest(String url,Map<String,String> headers,String body,int id,Control control)throws Exception {
        return requestWithId(url,"POST",headers,body,control,id);
    }
    private static Response requestWithId(String url,String method,Map<String,String> headers,String body,Control control,int rpcId) throws Exception {
        URL u=checked(url);
        HttpURLConnection c=(HttpURLConnection)u.openConnection();
        InputStream in=null;
        try {
            c.setInstanceFollowRedirects(false);c.setConnectTimeout(15000);c.setReadTimeout(45000);c.setRequestMethod(method);
            c.setRequestProperty("User-Agent","KitaChat/4.5.0 (Android)");
            for(Map.Entry<String,String> e:headers.entrySet()) {
                if(e.getValue().contains("\r")||e.getValue().contains("\n"))throw new IOException("Invalid header");
                c.setRequestProperty(e.getKey(),e.getValue());
            }
            if(control!=null)control.opened(c);
            if(body!=null){c.setDoOutput(true);byte[] bytes=body.getBytes("UTF-8");c.setFixedLengthStreamingMode(bytes.length);
                try(OutputStream out=c.getOutputStream()){out.write(bytes);}}
            int status=c.getResponseCode();
            if(status>=300 && status<400)throw new IOException("Redirect refused. Enter the final HTTPS endpoint URL.");
            Map<String,String> h=new HashMap<String,String>();
            for(Map.Entry<String,List<String>> e:c.getHeaderFields().entrySet())if(e.getKey()!=null && e.getValue()!=null && !e.getValue().isEmpty())h.put(e.getKey().toLowerCase(java.util.Locale.US),e.getValue().get(0));
            in=status>=400?c.getErrorStream():c.getInputStream();
            if(rpcId>=0&&status/100==2&&h.getOrDefault("content-type","").contains("text/event-stream")){
                return new Response(status,readRpcStream(in,rpcId),h);
            }
            ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int n;
            while(in!=null && (n=in.read(buffer))!=-1){if(out.size()+n>MAX_BYTES)throw new IOException("Response exceeds 2 MB limit");out.write(buffer,0,n);}
            return new Response(status,out.toString("UTF-8"),h);
        } finally { if(in!=null)try{in.close();}catch(Exception ignored){} c.disconnect(); }
    }
    static String readRpcStream(InputStream in,int id)throws Exception {
        if(in==null)throw new IOException("Empty SSE response");
        BufferedReader reader=new BufferedReader(new InputStreamReader(in,"UTF-8"));StringBuilder data=new StringBuilder();int size=0;String line;
        while((line=reader.readLine())!=null){size+=line.length();if(size>MAX_BYTES)throw new IOException("SSE exceeds response limit");
            if(line.isEmpty()&&data.length()>0){JSONObject event=new JSONObject(data.toString());data.setLength(0);if(event.has("id")&&String.valueOf(id).equals(event.optString("id")))return validateRpc(event,id).toString();}
            else if(line.startsWith("data:")){if(data.length()>0)data.append('\n');data.append(line.substring(5).replaceFirst("^ ",""));}
        }
        throw new IOException("SSE ended without matching response");
    }
    static Map<String,String> jsonHeaders(){Map<String,String> h=new HashMap<String,String>();h.put("Accept","application/json");return h;}
    static JSONObject getJson(String url) throws Exception {
        Response r=request(url,"GET",jsonHeaders(),null,null);
        if(r.status/100!=2)throw new IOException("Metadata HTTP "+r.status);
        return new JSONObject(r.body);
    }
    static JSONObject postJson(String url,JSONObject data) throws Exception {
        Map<String,String> h=jsonHeaders();h.put("Content-Type","application/json");
        Response r=request(url,"POST",h,data.toString(),null);
        if(r.status/100!=2)throw new IOException("Client registration HTTP "+r.status);
        return new JSONObject(r.body);
    }
    static String form(JSONObject data) throws Exception {
        StringBuilder s=new StringBuilder();Iterator<String> keys=data.keys();
        while(keys.hasNext()){String k=keys.next();if(s.length()>0)s.append('&');s.append(URLEncoder.encode(k,"UTF-8")).append('=').append(URLEncoder.encode(data.getString(k),"UTF-8"));}return s.toString();
    }
    static JSONObject postForm(String url,JSONObject data) throws Exception {
        Map<String,String> h=jsonHeaders();h.put("Content-Type","application/x-www-form-urlencoded");
        Response r=request(url,"POST",h,form(data),null);
        if(r.status/100!=2)throw new IOException("Authorization token request failed (HTTP "+r.status+"). Sign in again.");
        return new JSONObject(r.body);
    }
    /** Read SSE event groups, ignore notifications, match the actual RPC response id. */
    static JSONObject rpcBody(String body,int id) throws Exception {
        String value=body.trim();
        if(value.startsWith("{")) {JSONObject o=new JSONObject(value);return validateRpc(o,id);}
        StringBuilder data=new StringBuilder();
        for(String line:(body+"\n\n").split("\r?\n",-1)) {
            if(line.isEmpty()) {
                if(data.length()>0){JSONObject o=new JSONObject(data.toString());data.setLength(0);if(o.has("id")&&!o.isNull("id")&&String.valueOf(id).equals(o.optString("id")))return validateRpc(o,id);}
            }else if(line.startsWith("data:")){if(data.length()>0)data.append('\n');data.append(line.substring(5).replaceFirst("^ ",""));}
        }
        throw new IOException("No matching MCP response before stream ended");
    }
    private static JSONObject validateRpc(JSONObject o,int id) throws Exception {
        if(!"2.0".equals(o.optString("jsonrpc")) || !String.valueOf(id).equals(o.optString("id")) || (!o.has("result")&&!o.has("error")))throw new IOException("Invalid MCP response id or JSON-RPC envelope");return o;
    }
    static String headerValue(String value) throws Exception {
        if(value.matches("[\\x20-\\x7E]*") && !value.startsWith("=?"))return value;
        return "=?UTF-8?B?"+android.util.Base64.encodeToString(value.getBytes("UTF-8"),android.util.Base64.NO_WRAP)+"?=";
    }
}
