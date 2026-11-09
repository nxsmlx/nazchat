package com.nazchat.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import java.net.*;
import java.security.*;
import java.util.*;
import org.json.*;

/** Public native OAuth client: browser + PKCE S256, issuer/resource binding, encrypted pending state. */
public final class NazOAuth {
    public static final String REDIRECT="com.nazchat.app:/oauth/callback";
    public static final String CLIENT_DOC="https://raw.githubusercontent.com/nxsmlx/nazchat/main/docs/oauth-client-metadata.json";
    private final Activity activity;
    private static final Set<String> busy=Collections.synchronizedSet(new HashSet<String>());
    private static final java.util.concurrent.ConcurrentHashMap<String,String> generations=new java.util.concurrent.ConcurrentHashMap<String,String>();
    private static String generation(String id){String g=generations.get(id);if(g==null){String n=UUID.randomUUID().toString();String old=generations.putIfAbsent(id,n);g=old==null?n:old;}return g;}
    public NazOAuth(Activity a){activity=a;}
    static String ref(String id){if(id==null||!id.matches("[a-zA-Z0-9-]{1,80}"))throw new IllegalArgumentException("Invalid server id");return "mcp:credentials:"+id;}
    static JSONObject config(Activity a,String id) throws Exception {String s=NazSecrets.getStored(a,ref(id));return s.isEmpty()?new JSONObject():new JSONObject(s);}
    static void store(Activity a,String id,JSONObject cfg) throws Exception {if(!NazSecrets.putStored(a,ref(id),cfg.toString()))throw new Exception("Secure token storage failed");}
    private static String random(int n){byte[] b=new byte[n];new SecureRandom().nextBytes(b);return android.util.Base64.encodeToString(b,11);}
    private static String enc(String s) throws Exception{return URLEncoder.encode(s,"UTF-8");}
    private static String scope(JSONObject pr,String challenge){if(challenge!=null&&!challenge.isEmpty())return challenge;JSONArray a=pr.optJSONArray("scopes_supported");StringBuilder b=new StringBuilder();if(a!=null)for(int i=0;i<a.length();i++){if(b.length()>0)b.append(' ');b.append(a.optString(i));}return b.toString();}
    private static String challenge(String header,String key){java.util.regex.Matcher m=java.util.regex.Pattern.compile("(?:^|[,\\s])"+key+"=\"([^\"]*)\"").matcher(header);return m.find()?m.group(1):"";}
    @JavascriptInterface public void start(final String endpoint,final String id,final String registeredClientId){
        if(!busy.add(id)){event(id,"error","Sign-in is already starting");return;}
        final String generation=UUID.randomUUID().toString();generations.put(id,generation);
        new Thread(new Runnable(){public void run(){try{
            ref(id);URL resourceUrl=McpHttp.checked(endpoint);
            Map<String,String> h=McpHttp.jsonHeaders();h.put("Content-Type","application/json");h.put("Accept","application/json, text/event-stream");h.put("MCP-Protocol-Version","2026-07-28");h.put("Mcp-Method","tools/list");
            McpHttp.Response probe=McpHttp.request(endpoint,"POST",h,"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}",null);
            String www=probe.header("www-authenticate"),metadata=challenge(www,"resource_metadata");
            JSONObject pr=null;
            if(!metadata.isEmpty())pr=McpHttp.getJson(metadata);
            else {
                String origin=resourceUrl.getProtocol()+"://"+resourceUrl.getAuthority();
                String path=resourceUrl.getPath();
                String[] urls={origin+"/.well-known/oauth-protected-resource"+path,origin+"/.well-known/oauth-protected-resource"};
                for(String url:urls)try{pr=McpHttp.getJson(url);break;}catch(Exception ignored){}
            }
            if(pr==null)throw new Exception("No OAuth Protected Resource Metadata. Enter the final MCP URL.");
            String resource=pr.optString("resource");if(!resource.equals(endpoint))throw new Exception("Resource metadata does not match this MCP URL. Use its canonical URL.");
            JSONArray issuers=pr.optJSONArray("authorization_servers");if(issuers==null||issuers.length()==0)throw new Exception("No authorization server advertised");
            String issuer=issuers.getString(0);URL iu=McpHttp.checked(issuer);
            String base=issuer.replaceAll("/+$","");String origin=iu.getProtocol()+"://"+iu.getAuthority(),path=iu.getPath().replaceAll("/+$","");
            String[] candidates={origin+"/.well-known/oauth-authorization-server"+path,base+"/.well-known/openid-configuration",origin+"/.well-known/openid-configuration"+path};
            JSONObject as=null;for(String url:candidates)try{JSONObject m=McpHttp.getJson(url);if(!issuer.equals(m.optString("issuer")))continue;as=m;break;}catch(Exception ignored){}
            if(as==null)throw new Exception("Authorization metadata or issuer could not be verified");
            String authUrl = as.getString("authorization_endpoint"); String token = as.getString("token_endpoint"); McpHttp.checked(authUrl); McpHttp.checked(token);
            JSONArray methods=as.optJSONArray("code_challenge_methods_supported");boolean s256=false;if(methods!=null)for(int i=0;i<methods.length();i++)if("S256".equals(methods.optString(i)))s256=true;
            if(!s256)throw new Exception("Authorization server must advertise PKCE S256 support");
            String clientId=registeredClientId==null?"":registeredClientId.trim();
            JSONObject previous=config(activity,id);
            if(clientId.isEmpty()&&issuer.equals(previous.optString("issuer")))clientId=previous.optString("clientId");
            if(clientId.isEmpty()&&as.optBoolean("client_id_metadata_document_supported",false))clientId=CLIENT_DOC;
            if(clientId.isEmpty()&&!as.optString("registration_endpoint").isEmpty()){
                JSONObject reg=new JSONObject();reg.put("client_name","Kita Chat");reg.put("redirect_uris",new JSONArray().put(REDIRECT));reg.put("grant_types",new JSONArray().put("authorization_code").put("refresh_token"));reg.put("response_types",new JSONArray().put("code"));reg.put("token_endpoint_auth_method","none");reg.put("application_type","native");
                JSONObject result=McpHttp.postJson(as.getString("registration_endpoint"),reg);
                if(!result.optString("client_secret").isEmpty())throw new Exception("Server registered a confidential client. Register a public native client instead.");clientId=result.getString("client_id");
            }
            if(clientId.isEmpty())throw new Exception("Server requires a pre-registered public client ID. Add it in server settings. Redirect: "+REDIRECT);
            String verifier=random(32),state=random(32),scopes=scope(pr,challenge(www,"scope"));
            String codeChallenge=android.util.Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes("US-ASCII")),11);
            JSONObject cfg=new JSONObject();cfg.put("endpoint",endpoint);cfg.put("resource",resource);cfg.put("issuer",issuer);cfg.put("tokenEndpoint",token);cfg.put("clientId",clientId);cfg.put("scopes",scopes);cfg.put("issRequired",as.optBoolean("authorization_response_iss_parameter_supported",false));cfg.put("generation",generation);
            synchronized(NazOAuth.class){if(!generation.equals(generations.get(id)))throw new Exception("Sign-in was cancelled");store(activity,id,cfg);} // Bind all callbacks to this registration generation.
            JSONObject pending=new JSONObject();pending.put("id",id);pending.put("state",state);pending.put("verifier",verifier);pending.put("created",System.currentTimeMillis());pending.put("config",cfg);
            if(!NazSecrets.putStored(activity,"mcp:pending:"+state,pending.toString()))throw new Exception("Cannot save secure authorization state");
            String url=authUrl+(authUrl.contains("?")?"&":"?")+"response_type=code&client_id="+enc(clientId)+"&redirect_uri="+enc(REDIRECT)+"&state="+enc(state)+"&code_challenge="+enc(codeChallenge)+"&code_challenge_method=S256&resource="+enc(resource)+(scopes.isEmpty()?"":"&scope="+enc(scopes));
            final String browserUrl=url;activity.runOnUiThread(new Runnable(){public void run(){try{activity.startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(browserUrl)));}catch(Exception e){event(id,"error","No browser available for sign-in");}}});
        }catch(Exception e){event(id,"error",safe(e));}finally{busy.remove(id);}}},"mcp-oauth").start();
    }
    public static boolean isRedirect(Uri u){return u!=null&&"com.nazchat.app".equals(u.getScheme())&&u.getAuthority()==null&&"/oauth/callback".equals(u.getPath())&&u.getFragment()==null;}
    public void handleRedirect(final Uri uri){if(!isRedirect(uri))return;new Thread(new Runnable(){public void run(){String id=null;try{
        String state=uri.getQueryParameter("state");if(state==null||!state.matches("[a-zA-Z0-9_-]{40,100}"))throw new Exception("Invalid OAuth state");
        String raw; synchronized(NazOAuth.class){raw=NazSecrets.getStored(activity,"mcp:pending:"+state);new NazSecrets(activity).remove("mcp:pending:"+state);}
        if(raw.isEmpty())throw new Exception("Sign-in request expired or already used");JSONObject pending=new JSONObject(raw);id=pending.getString("id");
        if(System.currentTimeMillis()-pending.getLong("created")>600000)throw new Exception("Sign-in expired. Try again.");
        JSONObject cfg=pending.getJSONObject("config");JSONObject current=config(activity,id);
        if(!current.optString("generation").equals(cfg.optString("generation"))||!current.optString("clientId").equals(cfg.optString("clientId"))||current.length()==0)throw new Exception("Server was removed or authorization changed");
        final String startedGeneration=generation(id);
        String iss=uri.getQueryParameter("iss");if((cfg.optBoolean("issRequired")&&iss==null)||(iss!=null&&!iss.equals(cfg.getString("issuer"))))throw new Exception("OAuth response issuer mismatch");
        if(uri.getQueryParameter("error")!=null)throw new Exception("Sign-in was declined or cancelled");String code=uri.getQueryParameter("code");if(code==null||code.isEmpty())throw new Exception("Missing authorization code");
        JSONObject form=new JSONObject();form.put("grant_type","authorization_code");form.put("code",code);form.put("client_id",cfg.getString("clientId"));form.put("redirect_uri",REDIRECT);form.put("code_verifier",pending.getString("verifier"));form.put("resource",cfg.getString("resource"));
        JSONObject tokens=McpHttp.postForm(cfg.getString("tokenEndpoint"),form);applyTokens(cfg,tokens);
        synchronized(NazOAuth.class){if(!startedGeneration.equals(generation(id))||!config(activity,id).optString("generation").equals(cfg.optString("generation")))throw new Exception("Sign-in was cancelled");store(activity,id,cfg);}event(id,"authorized","Signed in. Refreshing tools.");
    }catch(Exception e){event(id,"error",safe(e));}}},"mcp-oauth-callback").start();}
    private static final java.util.concurrent.ConcurrentHashMap<String,Object> refreshLocks=new java.util.concurrent.ConcurrentHashMap<String,Object>();
    static String access(Activity a,String id,String endpoint,boolean force) throws Exception {
        Object candidate=new Object(),old=refreshLocks.putIfAbsent(id,candidate),lock=old==null?candidate:old;
        synchronized(lock){
        String startedGeneration=generation(id);
        JSONObject cfg=config(a,id);if(cfg.length()==0)return "";
        if(!endpoint.equals(cfg.optString("endpoint")))throw new Exception("Token is bound to another MCP endpoint");
        if((force||cfg.optLong("expires",0)<System.currentTimeMillis()+30000)&&!cfg.optString("refresh_token").isEmpty()){
            JSONObject form=new JSONObject();form.put("grant_type","refresh_token");form.put("refresh_token",cfg.getString("refresh_token"));form.put("client_id",cfg.getString("clientId"));form.put("resource",cfg.getString("resource"));
            applyTokens(cfg,McpHttp.postForm(cfg.getString("tokenEndpoint"),form));
            synchronized(NazOAuth.class){if(!startedGeneration.equals(generation(id))||!config(a,id).optString("generation").equals(cfg.optString("generation")))throw new Exception("Authorization changed while refreshing");store(a,id,cfg);}
        }return cfg.optString("access_token");
        }
    }
    private static void applyTokens(JSONObject cfg,JSONObject tokens)throws Exception {
        if(!"bearer".equalsIgnoreCase(tokens.optString("token_type","Bearer")))throw new Exception("Unsupported token type");String access=tokens.optString("access_token");if(access.isEmpty())throw new Exception("No access token returned");
        cfg.put("access_token",access);if(tokens.has("refresh_token"))cfg.put("refresh_token",tokens.getString("refresh_token"));cfg.put("expires",System.currentTimeMillis()+Math.max(1,tokens.optLong("expires_in",3600))*1000);
    }
    @JavascriptInterface public boolean hasToken(String id){try{return !config(activity,id).optString("access_token").isEmpty();}catch(Exception e){return false;}}
    @JavascriptInterface public void signOut(String id){try{synchronized(NazOAuth.class){generations.put(id,UUID.randomUUID().toString());new NazSecrets(activity).remove(ref(id));}}catch(Exception ignored){}}
    @JavascriptInterface public String consumeEvent(){String s=activity.getPreferences(0).getString("mcp_event","");activity.getPreferences(0).edit().remove("mcp_event").apply();return s;}
    private void event(String id,String kind,String message){try{String json=new JSONObject().put("server",id).put("kind",kind).put("message",message).toString();activity.getPreferences(0).edit().putString("mcp_event",json).apply();NazApp.post("if(window.nazMcpOAuth)window.nazMcpOAuth("+JSONObject.quote(json)+");");}catch(Exception ignored){}}
    private static String safe(Exception e){String message=e.getMessage();return message==null?"OAuth operation failed":message.substring(0,Math.min(220,message.length()));}
}
