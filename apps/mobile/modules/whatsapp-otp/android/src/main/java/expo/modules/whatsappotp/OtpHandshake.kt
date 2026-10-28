package expo.modules.whatsappotp

/**
 * The handshake id and the code WhatsApp handed back. The receiver activity can run before the JS side is listening (the app may have
 * been in the background), so a code that arrives with no listener waits here until the module takes it.
 */
object OtpHandshake {
  @Volatile
  private var expectedId: String? = null

  @Volatile
  private var pendingCode: String? = null

  @Volatile
  var listener: ((String) -> Unit)? = null

  fun begin(id: String) {
    expectedId = id
    pendingCode = null
  }

  fun expected(): String? = expectedId

  /** One code per handshake: once it is accepted, a second intent with the same id is ignored. */
  fun accept(code: String) {
    expectedId = null
    val current = listener
    if (current != null) current(code) else pendingCode = code
  }

  fun takePending(): String? {
    val code = pendingCode
    pendingCode = null
    return code
  }

  fun cancel() {
    expectedId = null
    pendingCode = null
  }
}
