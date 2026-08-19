package com.mappls.dic.iimm

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class ApiException(val status: Int, message: String) : IOException(message)

class SessionStore(context: Context) {
    private val prefs = EncryptedSharedPreferences.create(
        context,
        "iimm-secure-session",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
    fun token(): String? = prefs.getString("token", null)
    fun user(): User? = prefs.getString("user", null)?.let { User.from(JSONObject(it)) }
    fun projectId(): String? = prefs.getString("last-project-id", null)
    fun saveProjectId(projectId: String?) {
        if (!projectId.isNullOrBlank()) prefs.edit().putString("last-project-id", projectId).apply()
    }
    fun save(token: String, user: JSONObject) = prefs.edit().putString("token", token).putString("user", user.toString()).apply()
    fun clear() = prefs.edit().clear().apply()
}

class ApiClient(private val sessions: SessionStore) {
    private val base = BuildConfig.API_BASE_URL.trimEnd('/')

    suspend fun array(path: String): JSONArray {
        val result = request("GET", path) as JSONArray
        if (path == "/api/projects" && result.length() > 0) {
            sessions.saveProjectId(result.optJSONObject(0)?.optString("id"))
        }
        return result
    }
    suspend fun obj(path: String): JSONObject = request("GET", path) as JSONObject
    suspend fun post(path: String, body: JSONObject = JSONObject()): Any = request("POST", path, body)
    suspend fun patch(path: String, body: JSONObject): Any = request("PATCH", path, body)

    suspend fun download(path: String): ByteArray = withContext(Dispatchers.IO) {
        val connection = URL("$base$path").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "GET"
            connection.connectTimeout = 15_000
            connection.readTimeout = 30_000
            sessions.token()?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
            val status = connection.responseCode
            if (status !in 200..299) {
                val text = connection.errorStream?.bufferedReader()?.use { it.readText() }.orEmpty()
                throw ApiException(status, runCatching { JSONObject(text).optString("error") }.getOrNull().orEmpty().ifBlank { "Download failed ($status)" })
            }
            connection.inputStream.use { it.readBytes() }
        } finally { connection.disconnect() }
    }

    suspend fun login(userId: String): Session {
        val result = post("/api/auth/login", JSONObject().put("userId", userId)) as JSONObject
        val userJson = result.getJSONObject("user")
        sessions.save(result.getString("token"), userJson)
        return Session(result.getString("token"), User.from(userJson), result.optJSONObject("tenant")?.optString("name"))
    }

    suspend fun reverseGeocode(lat: Double, lng: Double): String {
        val path = "/api/mappls/reverse-geocode?lat=${enc(lat.toString())}&lng=${enc(lng.toString())}"
        return obj(path).getString("address")
    }

    suspend fun uploadMedia(
        bytes: ByteArray,
        mimeType: String,
        fileName: String,
        lat: Double,
        lng: Double,
        accuracyMeters: Double?,
    ): JSONObject = withContext(Dispatchers.IO) {
        val connection = URL("$base/api/media").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 15_000
            connection.readTimeout = 40_000
            connection.doOutput = true
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Content-Type", mimeType)
            connection.setRequestProperty("X-File-Name", fileName)
            connection.setRequestProperty("X-Capture-Lat", lat.toString())
            connection.setRequestProperty("X-Capture-Lng", lng.toString())
            accuracyMeters?.let { connection.setRequestProperty("X-Capture-Accuracy", it.toString()) }
            connection.setRequestProperty("X-Captured-At", java.time.Instant.now().toString())
            sessions.token()?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
            connection.outputStream.use { it.write(bytes) }
            val status = connection.responseCode
            val text = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) throw ApiException(
                status,
                runCatching { JSONObject(text).optString("error") }.getOrNull().orEmpty()
                    .ifBlank { "Evidence upload failed ($status)" },
            )
            JSONObject(text)
        } finally { connection.disconnect() }
    }

    private suspend fun request(method: String, path: String, body: JSONObject? = null): Any = withContext(Dispatchers.IO) {
        val connection = URL("$base$path").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 15_000
            connection.readTimeout = 25_000
            connection.setRequestProperty("Accept", "application/json")
            sessions.token()?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val status = connection.responseCode
            val text = (if (status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) throw ApiException(status, runCatching { JSONObject(text).optString("error") }.getOrNull().orEmpty().ifBlank { "Request failed ($status)" })
            val trimmed = text.trim()
            if (trimmed.startsWith("[")) JSONArray(trimmed) else JSONObject(trimmed.ifBlank { "{}" })
        } finally { connection.disconnect() }
    }

    private fun enc(value: String) = URLEncoder.encode(value, Charsets.UTF_8.name())
}
