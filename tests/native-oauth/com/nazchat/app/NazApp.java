package com.nazchat.app;
import java.util.*;
import java.util.concurrent.*;
final class NazApp {
    static final List<String> history = Collections.synchronizedList(new ArrayList<String>());
    private static final BlockingQueue<Post> posts = new LinkedBlockingQueue<Post>();
    static void post(String script) { history.add(script); posts.add(new Post(script, Thread.currentThread())); }
    static String awaitPost() throws Exception {
        Post post = posts.poll(3, TimeUnit.SECONDS);
        if (post == null) throw new AssertionError("No OAuth event within 3 seconds");
        post.thread.join(3000);
        if (post.thread.isAlive()) throw new AssertionError("OAuth worker did not finish");
        return post.script;
    }
    static void reset() { history.clear(); posts.clear(); }
    private static final class Post {
        final String script; final Thread thread;
        Post(String script, Thread thread) { this.script = script; this.thread = thread; }
    }
}
