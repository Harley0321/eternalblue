package com.example.hardware

import android.app.admin.DeviceAdminReceiver
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

sealed class UpdateSessionEvent {
    data object PendingUserConfirmation : UpdateSessionEvent()
    data object Succeeded : UpdateSessionEvent()
    data class Failed(val reason: String) : UpdateSessionEvent()
}

object UpdateEvents {
    private val _events = MutableSharedFlow<UpdateSessionEvent>(extraBufferCapacity = 8)
    val events: SharedFlow<UpdateSessionEvent> = _events.asSharedFlow()

    fun emit(event: UpdateSessionEvent) {
        _events.tryEmit(event)
    }
}

class UpdateResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        when (status) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                val confirmIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(Intent.EXTRA_INTENT)
                }
                if (confirmIntent != null) {
                    confirmIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    runCatching { context.startActivity(confirmIntent) }
                }
                UpdateEvents.emit(UpdateSessionEvent.PendingUserConfirmation)
            }
            PackageInstaller.STATUS_SUCCESS -> {
                UpdateEvents.emit(UpdateSessionEvent.Succeeded)
            }
            PackageInstaller.STATUS_FAILURE_ABORTED -> {
                UpdateEvents.emit(UpdateSessionEvent.Failed("Update cancelled"))
            }
            else -> {
                val msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                    ?.takeIf { it.isNotBlank() }
                    ?: "Package update failed (code $status)"
                UpdateEvents.emit(UpdateSessionEvent.Failed(msg))
            }
        }
    }
}

class PackageReplacedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        } ?: return
        runCatching { context.startActivity(launch) }
    }
}

class PosDeviceAdminReceiver : DeviceAdminReceiver()
