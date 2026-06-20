package com.fastfood.tv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Best-effort: relaunch the kiosk after the TV boots. Some Android TV OS versions restrict
 *  background starts, so this may not fire on every device — the user can also pin the app
 *  as the default boot app on most TV launchers. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val launch = Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            try {
                context.startActivity(launch)
            } catch (_: Exception) {
            }
        }
    }
}
