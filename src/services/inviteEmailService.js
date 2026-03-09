const SMTP_HOST = process.env.SMTP_HOST || ""
const SMTP_PORT = Number(process.env.SMTP_PORT || 587)
const SMTP_SECURE = (process.env.SMTP_SECURE || "false").toLowerCase() === "true"
const SMTP_USER = process.env.SMTP_USER || ""
const SMTP_PASS = process.env.SMTP_PASS || ""
const SMTP_FROM = process.env.SMTP_FROM || ""
const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000"

function hasSmtpConfig() {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS && SMTP_FROM)
}

export async function sendWorkspaceInviteEmail({
  toEmail,
  workspaceName,
  role
}) {
  try {
    if (!toEmail) {
      return { sent: false, reason: "missing_recipient" }
    }

    if (!hasSmtpConfig()) {
      console.warn("[invite-email] SMTP is not configured. Skipping invite email.")
      return { sent: false, reason: "smtp_not_configured" }
    }

    let nodemailer
    try {
      const module = await import("nodemailer")
      nodemailer = module.default
    } catch {
      console.warn("[invite-email] nodemailer is not installed. Skipping invite email.")
      return { sent: false, reason: "nodemailer_not_installed" }
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    })

    const safeWorkspaceName = workspaceName || "your workspace"
    const roleLabel = role === "owner" ? "Owner" : "Member"
    const loginUrl = `${APP_BASE_URL}/login`
    const subject = `You're invited to ${safeWorkspaceName}`

    await transporter.sendMail({
      from: SMTP_FROM,
      to: toEmail,
      subject,
      text: `You have been invited to ${safeWorkspaceName} as ${roleLabel}. Login here: ${loginUrl}`,
      html: `
        <p>You have been invited to <strong>${safeWorkspaceName}</strong> as <strong>${roleLabel}</strong>.</p>
        <p>Please login to continue:</p>
        <p><a href="${loginUrl}">${loginUrl}</a></p>
      `
    })

    return { sent: true }
  } catch (error) {
    // Keep invite flow resilient even if email provider fails.
    console.error("[invite-email] Failed to send invite email:", error?.message || error)
    return { sent: false, reason: "send_failed" }
  }
}
