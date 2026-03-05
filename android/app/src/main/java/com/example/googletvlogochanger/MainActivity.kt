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
    private lateinit var serverUrlInput: EditText
    private lateinit var syncStatus: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = getSharedPreferences("logo_changer", MODE_PRIVATE)

        serverUrlInput = findViewById(R.id.serverUrlInput)
        val wifiHint = findViewById<TextView>(R.id.wifiHint)
        val syncAppsButton = findViewById<Button>(R.id.syncAppsButton)
        syncStatus = findViewById(R.id.syncStatus)
        val openUpload = findViewById<Button>(R.id.openUploadButton)
        val openTv = findViewById<Button>(R.id.openTvButton)

        val defaultUrl = prefs.getString("server_url", "http://192.168.1.100:3000") ?: ""
        serverUrlInput.setText(defaultUrl)

        wifiHint.text = "Phone/PC and Google TV must be on the same Wi‑Fi. Use your local server IP (example: http://192.168.1.100:3000)."

        syncAppsButton.setOnClickListener {
            runSync(showBusyMessage = true)
        }

        openUpload.setOnClickListener {
            openPage(serverUrlInput.text.toString(), "/")
        }

        openTv.setOnClickListener {
            openPage(serverUrlInput.text.toString(), "/tv.html")
        }

        maybeAutoSync()
    }

    override fun onResume() {
        super.onResume()
        maybeAutoSync()
    }


    private fun maybeAutoSync() {
        val now = System.currentTimeMillis()
        val last = prefs.getLong("last_sync_ts", 0L)
        if (now - last > 30_000L) {
            runSync(showBusyMessage = false)
        }
    }

    private fun runSync(showBusyMessage: Boolean) {
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
                    prefs.edit().putLong("last_sync_ts", System.currentTimeMillis()).apply()
                    "Synced ${apps.size} installed apps. Uploader pages now show your full device app list."
                } else {
                    "Sync failed. Check server URL and ensure same Wi‑Fi network."
                }
            }
        }.start()
    }

    private fun collectInstalledAppNames(): List<String> {
        @Suppress("DEPRECATION")
        val apps = packageManager.getInstalledApplications(PackageManager.GET_META_DATA)
            .map { appInfo ->
                val label = packageManager.getApplicationLabel(appInfo).toString().trim()
                val pkg = appInfo.packageName.trim()
                if (label.isNotEmpty()) "$label ($pkg)" else pkg
            }
            .filter { it.isNotEmpty() }
            .distinct()
            .sorted()

        return if (apps.isNotEmpty()) apps else listOf("YouTube (com.google.android.youtube.tv)")
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
