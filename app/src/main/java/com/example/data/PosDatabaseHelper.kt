package com.example.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

class PosDatabaseHelper(context: Context) : SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {
    companion object {
        private const val DB_NAME = "eternalblue_pos.db"
        private const val DB_VERSION = 1
        private const val TABLE_KV = "pos_store_kv"
        private const val COL_KEY = "k"
        private const val COL_VAL = "v"
        private const val COL_UPDATED = "updated_ms"
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS $TABLE_KV (
                $COL_KEY TEXT PRIMARY KEY,
                $COL_VAL TEXT NOT NULL,
                $COL_UPDATED INTEGER NOT NULL
            )
            """.trimIndent()
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        onCreate(db)
    }

    fun readString(key: String): String? {
        readableDatabase.query(TABLE_KV, arrayOf(COL_VAL), "$COL_KEY = ?", arrayOf(key), null, null, null).use { c ->
            return if (c.moveToFirst()) c.getString(0) else null
        }
    }

    fun writeString(key: String, value: String) {
        val cv = ContentValues().apply {
            put(COL_KEY, key)
            put(COL_VAL, value)
            put(COL_UPDATED, System.currentTimeMillis())
        }
        writableDatabase.insertWithOnConflict(TABLE_KV, null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun getAllSizesBytes(): Map<String, Long> {
        val out = LinkedHashMap<String, Long>()
        readableDatabase.rawQuery("SELECT $COL_KEY, LENGTH(CAST($COL_VAL AS BLOB)) FROM $TABLE_KV", null).use { c ->
            while (c.moveToNext()) {
                out[c.getString(0)] = c.getLong(1)
            }
        }
        return out
    }
}
