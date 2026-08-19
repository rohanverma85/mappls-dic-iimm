package com.mappls.dic.iimm

import android.app.Application
import android.util.Log
import com.mappls.sdk.maps.Mappls

class IimmApplication : Application() {
    companion object {
        lateinit var instance: IimmApplication
            private set
        var mapplsReady: Boolean = false
            private set
        var mapplsError: String? = null
            private set
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        if (BuildConfig.MAPPLS_CREDENTIALS_PRESENT) {
            try {
                Mappls.getInstance(this)
                mapplsReady = true
            } catch (error: IllegalStateException) {
                mapplsError = error.message ?: "The Mappls SDK configuration could not be validated."
                Log.e("IIMM-Mappls", "Mappls SDK initialization failed", error)
            }
        }
        SyncScheduler.schedule(this)
    }
}
