package com.example.googletvlogochanger

import android.content.Intent
import android.content.SharedPreferences
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var prefs: SharedPreferences

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = getSharedPreferences("logo_changer", MODE_PRIVATE)

        val serverUrlInput = findViewById<EditText>(R.id.serverUrlInput)
        val wifiHint = findViewById<TextView>(R.id.wifiHint)
        val openUpload = findViewById<Button>(R.id.openUploadButton)
        val openTv = findViewById<Button>(R.id.openTvButton)

        val defaultUrl = prefs.getString("server_url", "http://192.168.1.100:3000") ?: ""
        serverUrlInput.setText(defaultUrl)

        wifiHint.text = "Phone/PC and Google TV must be on the same Wi‑Fi. Use your local server IP (example: http://192.168.1.100:3000)."

        openUpload.setOnClickListener {
            openPage(serverUrlInput.text.toString(), "/")
        }

        openTv.setOnClickListener {
            openPage(serverUrlInput.text.toString(), "/tv.html")
        }
    }

    private fun openPage(base: String, path: String) {
        val normalized = base.trim().trimEnd('/')
        if (normalized.isEmpty()) return

        prefs.edit().putString("server_url", normalized).apply()

        val target = "$normalized$path"
        startActivity(Intent(this, WebViewActivity::class.java).putExtra("target_url", target))
    }
}
