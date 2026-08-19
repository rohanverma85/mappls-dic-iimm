package com.mappls.dic.iimm

import android.app.Application
import com.mappls.sdk.maps.Mappls

class IimmApplication : Application() {
    companion object { lateinit var instance: IimmApplication; private set }
    override fun onCreate() {
        super.onCreate()
        instance = this
        if (BuildConfig.MAPPLS_CREDENTIALS_PRESENT) Mappls.getInstance(this)
        SyncScheduler.schedule(this)
    }
}
