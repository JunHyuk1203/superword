package com.goodnotes.vocab

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)
        
        // Configure WebView settings
        val webSettings: WebSettings = webView.settings
        webSettings.javaScriptEnabled = true
        webSettings.domStorageEnabled = true  // Required for Firebase and LocalStorage
        webSettings.databaseEnabled = true
        webSettings.mediaPlaybackRequiresUserGesture = false  // Allow auto TTS/audio
        webSettings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        webSettings.allowFileAccess = false
        webSettings.allowContentAccess = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webSettings.safeBrowsingEnabled = true
        }
        
        // Fix Google Login 403 disallowed_useragent error
        webSettings.userAgentString = webSettings.userAgentString.replace("; wv", "")
        
        // Playback does not require camera/microphone or other capture permissions.
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                request.deny()
            }
        }
        
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (isAppUrl(uri)) return false
                // Only HTTPS links may leave the app, and only after a main-frame user gesture.
                if (request.isForMainFrame && request.hasGesture() && uri.scheme == "https") {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, uri))
                    } catch (_: ActivityNotFoundException) { }
                }
                return true
            }
        }

        // Enable DOM Storage
        webView.settings.domStorageEnabled = true
        
        // Load the GitHub Pages URL
        webView.loadUrl("https://junhyuk1203.github.io/superword/")
    }

    private fun isAppUrl(uri: Uri): Boolean {
        val path = uri.path ?: return false
        return uri.scheme == "https" && uri.host == "junhyuk1203.github.io" &&
            (uri.port == -1 || uri.port == 443) && uri.userInfo == null &&
            (path == "/superword" || path.startsWith("/superword/"))
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
