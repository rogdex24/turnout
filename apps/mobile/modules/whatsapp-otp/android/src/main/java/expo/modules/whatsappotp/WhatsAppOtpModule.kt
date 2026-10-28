package expo.modules.whatsappotp

import android.content.Context
import com.whatsapp.otp.android.sdk.WhatsAppOtpHandler
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val CODE_EVENT = "onCode"

class WhatsAppOtpModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.AppContextLost()
  private val handler = WhatsAppOtpHandler()

  override fun definition() = ModuleDefinition {
    Name("WhatsAppOtp")

    Events(CODE_EVENT)

    OnCreate {
      OtpHandshake.listener = { code -> sendEvent(CODE_EVENT, mapOf("code" to code)) }
    }

    OnDestroy {
      OtpHandshake.listener = null
    }

    // True when WhatsApp or WhatsApp Business is installed. Needs the <queries> entries the config plugin adds.
    Function("isInstalled") {
      handler.isWhatsAppInstalled(context)
    }

    // Sends the handshake to both WhatsApp apps and remembers its id, so only a code that comes back with it is accepted.
    Function("startHandshake") {
      OtpHandshake.begin(handler.sendOtpIntentToWhatsApp(context).toString())
    }

    Function("cancelHandshake") {
      OtpHandshake.cancel()
    }

    // A code that arrived while nothing was listening.
    Function("takePendingCode") {
      OtpHandshake.takePending()
    }

    OnActivityEntersForeground {
      OtpHandshake.takePending()?.let { sendEvent(CODE_EVENT, mapOf("code" to it)) }
    }
  }
}
