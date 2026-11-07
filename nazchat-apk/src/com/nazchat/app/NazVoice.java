package com.nazchat.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.webkit.JavascriptInterface;

import java.util.ArrayList;

/** Small optional dictation bridge; audio is handled by Android and not persisted by Kita Chat. */
public final class NazVoice implements RecognitionListener {
    private final Activity activity;
    private SpeechRecognizer recognizer;
    private boolean waitingPermission;

    public NazVoice(Activity activity) { this.activity = activity; }

    @JavascriptInterface
    public void start() {
        activity.runOnUiThread(new Runnable() { public void run() { startOnUi(); } });
    }

    @JavascriptInterface
    public void stop() {
        activity.runOnUiThread(new Runnable() { public void run() { if (recognizer != null) recognizer.stopListening(); } });
    }

    private void startOnUi() {
        if (android.os.Build.VERSION.SDK_INT >= 23 && activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            waitingPermission = true;
            activity.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 7402);
            emit("permission");
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(activity)) { emit("unavailable"); return; }
        if (recognizer != null) recognizer.destroy();
        recognizer = SpeechRecognizer.createSpeechRecognizer(activity);
        recognizer.setRecognitionListener(this);
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        recognizer.startListening(i);
        emit("listening");
    }

    public void onPermissionResult(int requestCode, int[] results) {
        if (requestCode != 7402) return;
        waitingPermission = false;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) startOnUi(); else emit("denied");
    }

    private void emit(String state) { NazApp.post("if(window.nazVoiceStatus)window.nazVoiceStatus(" + NazNet.jsonString(state) + ");"); }
    private void emitText(String text, boolean done) { NazApp.post("if(window.nazVoiceResult)window.nazVoiceResult(" + NazNet.jsonString(text == null ? "" : text) + "," + done + ");"); }
    @Override public void onBeginningOfSpeech() { emit("speaking"); }
    @Override public void onEndOfSpeech() { emit("processing"); }
    @Override public void onError(int error) { emit("error:" + error); }
    @Override public void onReadyForSpeech(android.os.Bundle params) {}
    @Override public void onRmsChanged(float rmsdB) {}
    @Override public void onBufferReceived(byte[] buffer) {}
    @Override public void onPartialResults(android.os.Bundle results) { emitText(first(results), false); }
    @Override public void onEvent(int eventType, android.os.Bundle params) {}
    @Override public void onResults(android.os.Bundle results) { emitText(first(results), true); emit("done"); }
    private String first(android.os.Bundle results) { ArrayList<String> values=results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION); return values == null || values.isEmpty() ? "" : values.get(0); }

}
