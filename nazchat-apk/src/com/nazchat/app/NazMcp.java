package com.nazchat.app;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** Asynchronous, bounded, cancellable MCP tools client. Never returns OAuth tokens to JS. */
public final class NazMcp {
    static final String MODERN="2026-07-28",LEGACY="2025-11-25";
    private final Activity activity;
    private final ExecutorService pool=Executors.newFixedThreadPool(3);
    private final ConcurrentHashMap<String,HttpURLConnection> sockets=new ConcurrentHashMap<String,HttpURLConnection>();
    private final Set<String> cancelled=Collections.newSetFromMap(new ConcurrentHashMap<String,Boolean>());
    private final ConcurrentHashMap<String,Session> sessions=new ConcurrentHashMap<String,Session>();
    private int next=1;
    private static final class Session {String version=MODERN,id="",endpoint="";boolean ready=false;}
    public NazMcp(Activity a){activity=a;}
    @JavascriptInterface public void cancel(String request){cancelled.add(request);final HttpURLConnection c=sockets.remove(request);if(c!=null)new Thread(new Runnable(){public void run(){c.disconnect();}},"mcp-cancel").start();}
    public void dispose(){for(String id:sockets.keySet())cancel(id);pool.shutdownNow();sessions.clear();}
    @JavascriptInterface public void request(final String request,final String server,final String endpoint,final String method,final String params){
        if(request==null||!request.matches("[a-zA-Z0-9-]{1,100}"))return;
        pool.execute(new Runnable(){public void run(){try{
            NazOAuth.ref(server);McpHttp.checked(endpoint);
            if(!"tools/list".equals(method)&&!"tools/call".equals(method))throw new IOException("Unsupported MCP method");
            if(params.length()>100000)throw new IOException("Tool arguments exceed size limit");
            Session s=sessions.get(server);if(s==null){s=new Session();s.endpoint=endpoint;sessions.put(server,s);}if(!endpoint.equals(s.endpoint)){s=new Session();s.endpoint=endpoint;sessions.put(server,s);}
            JSONObject result;
            synchronized(s){result=perform(request,server,s,method,new JSONObject(params));}
            send(request,result);
        }catch(Exception e){try{send(request,new JSONObject().put("error",cancelled.contains(request)?"Request cancelled":safe(e)));}catch(Exception ignored){}
        }finally{sockets.remove(request);cancelled.remove(request);}}});
    }
    private McpHttp.Control control(final String req){return new McpHttp.Control(){public void opened(HttpURLConnection c)throws Exception{sockets.put(req,c);if(cancelled.contains(req))throw new IOException("Request cancelled");}};}
    private JSONObject perform(String req,String server,Session s,String method,JSONObject params)throws Exception {
        if(cancelled.contains(req))throw new IOException("Request cancelled");
        String token=NazOAuth.access(activity,server,s.endpoint,false,control(req));
        if(cancelled.contains(req))throw new IOException("Request cancelled");
        if(!s.ready&&!MODERN.equals(s.version))initialize(req,s,token);
        McpHttp.Response response=rpc(req,s,method,params,token,false);
        if(response.status==401&&!token.isEmpty()){
            if(cancelled.contains(req))throw new IOException("Request cancelled");
            token=NazOAuth.access(activity,server,s.endpoint,true,control(req));response=rpc(req,s,method,params,token,false);
        }
        if(response.status==401)throw new IOException("Sign in to this MCP server first, or sign in again for required scopes");
        if(response.status==403)throw new IOException("MCP permission denied. Sign in again to grant required scopes.");
        JSONObject envelope=null;try{envelope=new JSONObject(response.body);}catch(Exception ignored){}
        JSONObject error=envelope==null?null:envelope.optJSONObject("error");int code=error==null?0:error.optInt("code");
        if(!s.ready && MODERN.equals(s.version) && (response.status==400||response.status==404||response.status==405) && code!=-32020&&code!=-32021&&code!=-32022){
            initialize(req,s,token);response=rpc(req,s,method,params,token,false);
        }else if(code==-32022){throw new IOException("Server does not support this MCP protocol revision");}
        if(response.status==404&&!s.id.isEmpty()){s.id="";s.ready=false;throw new IOException("MCP session expired. Refresh tools to reconnect.");}
        if(response.status/100!=2)throw new IOException("MCP HTTP "+response.status+". Use a Streamable HTTP endpoint.");
        // rpc assigned id is attached privately to response headers by rpc().
        JSONObject body=McpHttp.rpcBody(response.body,Integer.parseInt(response.header("kita-rpc-id")));
        if(body.has("error"))throw new IOException("MCP error: "+body.getJSONObject("error").optString("message","Request failed").substring(0,Math.min(180,body.getJSONObject("error").optString("message","Request failed").length())));
        JSONObject result=body.getJSONObject("result");
        if("input_required".equals(result.optString("resultType")))throw new IOException("This server requests additional input. Sampling and elicitation are not supported in this release.");
        s.ready=true;
        return new JSONObject().put("result",result);
    }
    private McpHttp.Response rpc(final String req,Session s,String method,JSONObject params,String token,boolean notification)throws Exception {
        if(cancelled.contains(req)||Thread.currentThread().isInterrupted())throw new IOException("Request cancelled");
        int id;synchronized(this){id=next++;}
        JSONObject copy=new JSONObject(params.toString());
        Map<String,String> h=McpHttp.jsonHeaders();h.put("Accept","application/json, text/event-stream");h.put("Content-Type","application/json");
        if(!token.isEmpty())h.put("Authorization","Bearer "+token);
        if(!"initialize".equals(method)){h.put("MCP-Protocol-Version",s.version);if(!s.id.isEmpty())h.put("Mcp-Session-Id",s.id);}
        if(MODERN.equals(s.version)){
            h.put("Mcp-Method",method);if("tools/call".equals(method))h.put("Mcp-Name",McpHttp.headerValue(copy.getString("name")));
            JSONObject meta=new JSONObject();meta.put("io.modelcontextprotocol/protocolVersion",s.version);meta.put("io.modelcontextprotocol/clientInfo",new JSONObject().put("name","Kita Chat").put("version","4.5.0"));meta.put("io.modelcontextprotocol/clientCapabilities",new JSONObject());copy.put("_meta",meta);
        }
        JSONObject rpc=new JSONObject().put("jsonrpc","2.0").put("method",method).put("params",copy);if(!notification)rpc.put("id",id);
        McpHttp.Response r=McpHttp.rpcRequest(s.endpoint,h,rpc.toString(),notification?-1:id,new McpHttp.Control(){public void opened(HttpURLConnection c)throws Exception{sockets.put(req,c);if(cancelled.contains(req))throw new IOException("Request cancelled");}});
        r.headers.put("kita-rpc-id",String.valueOf(id));return r;
    }
    private void initialize(String req,Session s,String token)throws Exception {
        s.version=LEGACY;
        JSONObject params=new JSONObject().put("protocolVersion",LEGACY).put("capabilities",new JSONObject()).put("clientInfo",new JSONObject().put("name","Kita Chat").put("version","4.5.0"));
        McpHttp.Response response=rpc(req,s,"initialize",params,token,false);
        if(response.status/100!=2)throw new IOException("MCP initialize HTTP "+response.status);
        JSONObject body=McpHttp.rpcBody(response.body,Integer.parseInt(response.header("kita-rpc-id")));if(body.has("error"))throw new IOException("MCP initialize was rejected");
        String version=body.getJSONObject("result").getString("protocolVersion");
        if(!version.equals("2025-11-25")&&!version.equals("2025-06-18")&&!version.equals("2025-03-26"))throw new IOException("Unsupported legacy MCP protocol version");
        s.version=version;s.id=response.header("mcp-session-id");
        if(s.id.length()>256||!s.id.matches("[\\x21-\\x7E]*"))throw new IOException("Invalid MCP session id");
        McpHttp.Response ack=rpc(req,s,"notifications/initialized",new JSONObject(),token,true);if(ack.status/100!=2)throw new IOException("MCP initialization acknowledgement failed");s.ready=true;
    }
    private void send(String req,JSONObject result){NazApp.post("if(window.nazMcpDone)window.nazMcpDone("+JSONObject.quote(req)+","+JSONObject.quote(result.toString())+");");}
    private static String safe(Exception e){String m=e.getMessage();return m==null?"MCP request failed":m.substring(0,Math.min(220,m.length()));}
}
