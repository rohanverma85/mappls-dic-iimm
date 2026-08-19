package com.mappls.dic.iimm

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.concurrent.TimeUnit

data class QueuedOperation(val id: Long, val entityType: String, val entityId: String, val timestamp: String, val payload: String)

class OfflineQueue(context: Context) : SQLiteOpenHelper(context, "iimm-offline.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE operations (id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, client_updated_at TEXT NOT NULL, payload TEXT NOT NULL)")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
    fun enqueue(entityType: String, entityId: String, payload: JSONObject) {
        writableDatabase.insert("operations", null, ContentValues().apply {
            put("entity_type", entityType); put("entity_id", entityId); put("client_updated_at", Instant.now().toString()); put("payload", payload.toString())
        })
    }
    fun all(): List<QueuedOperation> = readableDatabase.query("operations", null, null, null, null, null, "id").use { cursor ->
        buildList { while (cursor.moveToNext()) add(QueuedOperation(cursor.getLong(0), cursor.getString(1), cursor.getString(2), cursor.getString(3), cursor.getString(4))) }
    }
    fun remove(ids: List<Long>) { if (ids.isNotEmpty()) writableDatabase.delete("operations", "id IN (${ids.joinToString(",") { "?" }})", ids.map(Long::toString).toTypedArray()) }
}

class SyncWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        val sessions = SessionStore(applicationContext)
        if (sessions.token() == null) return Result.success()
        val queue = OfflineQueue(applicationContext)
        val items = queue.all().take(50)
        if (items.isEmpty()) return Result.success()
        val operations = JSONArray().also { array -> items.forEach { item -> array.put(JSONObject().put("entityType", item.entityType).put("entityId", item.entityId).put("clientUpdatedAt", item.timestamp).put("payload", JSONObject(item.payload))) } }
        return runCatching {
            val response = ApiClient(sessions).post("/api/sync", JSONObject().put("operations", operations)) as JSONObject
            val applied = response.getJSONArray("applied").let { a -> (0 until a.length()).map { a.getString(it) }.toSet() }
            queue.remove(items.filter { it.entityId in applied }.map { it.id })
            Result.success()
        }.getOrElse { Result.retry() }
    }
}

object SyncScheduler {
    fun schedule(context: Context) {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork("iimm-offline-sync", ExistingPeriodicWorkPolicy.KEEP, request)
    }
}
