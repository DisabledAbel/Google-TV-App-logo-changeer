package com.example.googletvlogochanger

import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : AppCompatActivity() {
    private lateinit var prefs: SharedPreferences

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = getSharedPreferences("logo_changer", MODE_PRIVATE)

        val serverUrlInput = findViewById<EditText>(R.id.serverUrlInput)
        val wifiHint = findViewById<TextView>(R.id.wifiHint)
        val syncAppsButton = findViewById<Button>(R.id.syncAppsButton)
        val syncStatus = findViewById<TextView>(R.id.syncStatus)
        val openUpload = findViewById<Button>(R.id.openUploadButton)
        val openTv = findViewById<Button>(R.id.openTvButton)

        val defaultUrl = prefs.getString("server_url", "http://192.168.1.100:3000") ?: ""
        serverUrlInput.setText(defaultUrl)

        wifiHint.text = "Phone/PC and Google TV must be on the same Wi‑Fi. Use your local server IP (example: http://192.168.1.100:3000)."

        fun runSync(showBusyMessage: Boolean = true) {
            val base = normalizeBase(serverUrlInput.text.toString())
            if (base.isEmpty()) {
                syncStatus.text = "Enter a valid server URL first."
                return
            }

            prefs.edit().putString("server_url", base).apply()
            if (showBusyMessage) syncStatus.text = "Syncing installed apps to server..."

            Thread {
                val apps = collectInstalledAppNames()
                val success = postInstalledApps(base, apps)
                runOnUiThread {
                    syncStatus.text = if (success) {
                        "Synced ${apps.size} apps. Uploader pages now know your TV apps."
                    } else {
                        "Sync failed. Check server URL and ensure same Wi‑Fi network."
                    }
                }
            }.start()
        }

        syncAppsButton.setOnClickListener {
            runSync()
        }

        runSync(showBusyMessage = false)

        openUpload.setOnClickListener {
            openPage(serverUrlInput.text.toString(), "/")
        }

        openTv.setOnClickListener {
            openPage(serverUrlInput.text.toString(), "/tv.html")
        }
    }

    private fun collectInstalledAppNames(): List<String> {
        val pm = packageManager
        val launchIntent = Intent(Intent.ACTION_MAIN, null).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
        }

        val apps = pm.queryIntentActivities(launchIntent, PackageManager.MATCH_ALL)
            .mapNotNull { it.loadLabel(pm)?.toString()?.trim() }
            .filter { it.isNotEmpty() }
            .distinct()
            .sorted()

        return if (apps.isNotEmpty()) apps else listOf("YouTube")
    }

    private fun postInstalledApps(base: String, apps: List<String>): Boolean {
        return try {
            val url = URL("$base/api/apps")
            val connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                doOutput = true
                connectTimeout = 7000
                readTimeout = 7000
            }

            val payload = JSONObject().put("apps", JSONArray(apps)).toString()
            connection.outputStream.use { it.write(payload.toByteArray()) }

            val ok = connection.responseCode in 200..299
            connection.disconnect()
            ok
        } catch (_: Exception) {
            false
        }
    }

    private fun openPage(base: String, path: String) {
        val normalized = normalizeBase(base)
        if (normalized.isEmpty()) return

        prefs.edit().putString("server_url", normalized).apply()

        val target = "$normalized$path"
        startActivity(Intent(this, WebViewActivity::class.java).putExtra("target_url", target))
    }

    private fun normalizeBase(base: String): String {
        return base.trim().trimEnd('/')
    }
}
