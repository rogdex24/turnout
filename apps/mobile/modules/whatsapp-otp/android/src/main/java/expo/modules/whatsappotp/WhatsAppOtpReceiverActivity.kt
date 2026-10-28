package expo.modules.whatsappotp

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import com.whatsapp.otp.android.sdk.WhatsAppOtpIncomingIntentHandler

/**
 * WhatsApp launches this activity with the code when the person taps the one-tap button in the message. It is exported, so any app can
 * start it: the code is used only when the intent carries the handshake id this app generated, and nothing here is logged.
 */
class WhatsAppOtpReceiverActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    accept(intent)
    bringAppToFront()
    finish()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    accept(intent)
    bringAppToFront()
    finish()
  }

  private fun accept(intent: Intent?) {
    val expected = OtpHandshake.expected() ?: return
    if (intent == null) return
    WhatsAppOtpIncomingIntentHandler().processOtpCode(
      intent,
      expected,
      { code -> OtpHandshake.accept(code) },
      { _, _ -> },
    )
  }

  private fun bringAppToFront() {
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return
    launch.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    startActivity(launch)
  }
}
