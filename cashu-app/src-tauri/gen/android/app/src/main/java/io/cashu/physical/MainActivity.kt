package io.cashu.physical

import android.os.Bundle
import android.view.View
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    // Disable native overscroll glow/bounce so touch events reach
    // the JavaScript pull-to-refresh handler
    webView.overScrollMode = View.OVER_SCROLL_NEVER
  }
}
