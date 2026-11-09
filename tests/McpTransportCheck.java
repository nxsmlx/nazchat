package com.nazchat.app;
import java.io.*;
import org.json.*;
/** Host-side tests of production parser/URL/form routines, not Android device tests. */
public class McpTransportCheck {
    static void check(boolean value){if(!value)throw new AssertionError();}
    public static void main(String[] args)throws Exception {
        String s=": keepalive\n\nevent: message\ndata: {\"jsonrpc\":\"2.0\",\"method\":\"notifications/progress\",\"params\":{}}\n\ndata: {\"jsonrpc\":\"2.0\",\"id\":8,\"result\":{\"wrong\":true}}\n\ndata: {\"jsonrpc\":\"2.0\",\n"+"data: \"id\":7,\"result\":{\"tools\":[]}}\n\n";
        check(McpHttp.rpcBody(s,7).getJSONObject("result").getJSONArray("tools").length()==0);
        check(new JSONObject(McpHttp.readRpcStream(new ByteArrayInputStream(s.getBytes("UTF-8")),7)).getInt("id")==7);
        InputStream noEof=new ByteArrayInputStream(s.getBytes("UTF-8")){
            @Override public synchronized int read(byte[] b,int off,int len){int n=super.read(b,off,len);if(n<0)throw new AssertionError("Must return immediately on matching response, without waiting for EOF");return n;}
        };
        check(new JSONObject(McpHttp.readRpcStream(noEof,7)).getInt("id")==7);
        boolean rejected=false;try{McpHttp.rpcBody("{\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{}}",1);}catch(Exception e){rejected=true;}check(rejected);
        String form=McpHttp.form(new JSONObject().put("code","a+b &code").put("resource","https://example.com/mcp"));check(form.contains("a%2Bb+%26code"));check(form.contains("resource=https%3A%2F%2Fexample.com%2Fmcp"));
        for(String url:new String[]{"http://example.com/mcp","https://user:pass@example.com/mcp","https://localhost/mcp","https://127.0.0.1/mcp","https://[::1]/mcp","https://192.168.0.2/mcp","https://100.64.0.1/mcp","https://169.254.169.254/mcp"}){rejected=false;try{McpHttp.checked(url);}catch(Exception e){rejected=true;}check(rejected);}
        check(McpHttp.headerValue("plain_tool").equals("plain_tool"));
        System.out.println("PASS native production MCP parser: JSON/SSE IDs, multiline/progress, early response, OAuth form encoding and private URL rejection");
    }
}
