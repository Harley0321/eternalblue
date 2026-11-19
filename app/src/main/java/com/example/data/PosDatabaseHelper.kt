package com.example.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

class PosDatabaseHelper(context: Context) : SQLiteOpenHelper(context, "eternalblue_pos.db", null, 1) {
    override fun onConfigure(db: SQLiteDatabase) {
        super.onConfigure(db)
        db.enableWriteAheadLogging()
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    }

    fun getString(key: String): String? {
        readableDatabase.rawQuery("SELECT value FROM kv_store WHERE key = ?", arrayOf(key)).use { c ->
            return if (c.moveToFirst()) c.getString(0) else null
        }
    }

    fun putString(key: String, value: String) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            if (!key.endsWith("__prev") && !key.endsWith("__corrupt_backup")) {
                var existing: String? = null
                db.rawQuery("SELECT value FROM kv_store WHERE key = ?", arrayOf(key)).use { c ->
                    if (c.moveToFirst()) existing = c.getString(0)
                }
                if (!existing.isNullOrBlank()) {
                    val prevCv = ContentValues().apply {
                        put("key", "${key}__prev")
                        put("value", existing)
                    }
                    db.insertWithOnConflict("kv_store", null, prevCv, SQLiteDatabase.CONFLICT_REPLACE)
                }
            }
            val cv = ContentValues().apply {
                put("key", key)
                put("value", value)
            }
            db.insertWithOnConflict("kv_store", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun clearAll() {
        val db = writableDatabase
        db.beginTransaction()
        try {
            db.delete("kv_store", null, null)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }
}
