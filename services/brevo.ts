const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const API_KEY       = process.env.EXPO_PUBLIC_BREVO_API_KEY ?? '';
const SENDER_EMAIL  = process.env.EXPO_PUBLIC_BREVO_SENDER_EMAIL ?? 'noreply@floodtrack.ph';
const SENDER_NAME   = 'FloodTrack';

export async function sendPasswordResetEmail(toEmail: string, otp: string): Promise<void> {
  if (!API_KEY) throw new Error('Brevo API key is missing. Add EXPO_PUBLIC_BREVO_API_KEY to your .env and restart Expo.');

  const year = new Date().getFullYear();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta name="x-apple-disable-message-reformatting"/>
  <title>Reset Your FloodTrack Password</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#0A0F1E;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background-color:#0A0F1E;min-height:100vh;">
    <tr>
      <td align="center" style="padding:48px 16px;">

        <!-- Card -->
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"
          style="max-width:560px;width:100%;border-radius:24px;overflow:hidden;
                 box-shadow:0 32px 80px rgba(0,0,0,0.6),0 0 0 1px rgba(255,255,255,0.06);">

          <!-- ═══════════════════════════════════════════════
               HERO HEADER
          ═══════════════════════════════════════════════ -->
          <tr>
            <td style="padding:0;background:#0A0F1E;position:relative;">

              <!-- Gradient bar top -->
              <div style="height:3px;background:linear-gradient(90deg,#00D2FF 0%,#4A6CF7 50%,#7C3AED 100%);"></div>

              <!-- Hero background -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                style="background:linear-gradient(145deg,#0D1535 0%,#111827 40%,#0F0A1E 100%);">
                <tr>
                  <td align="center" style="padding:52px 40px 48px;">

                    <!-- Logo badge -->
                    <div style="display:inline-block;margin-bottom:28px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="background:linear-gradient(135deg,rgba(74,108,247,0.25),rgba(124,58,237,0.25));
                                     border-radius:20px;padding:18px 28px;
                                     border:1px solid rgba(255,255,255,0.12);
                                     box-shadow:0 8px 32px rgba(74,108,247,0.3),inset 0 1px 0 rgba(255,255,255,0.1);">
                            <span style="font-size:13px;font-weight:800;color:rgba(255,255,255,0.5);
                                         letter-spacing:3px;text-transform:uppercase;display:block;margin-bottom:6px;">
                              FLOODTRACK
                            </span>
                            <!-- Wave icon using unicode -->
                            <div style="text-align:center;font-size:36px;line-height:1;">&#127754;</div>
                          </td>
                        </tr>
                      </table>
                    </div>

                    <!-- Headline -->
                    <h1 style="margin:0 0 10px;font-size:30px;font-weight:900;color:#FFFFFF;
                                letter-spacing:-0.5px;line-height:1.2;">
                      Password Reset
                    </h1>
                    <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.5);letter-spacing:0.3px;">
                      Secure account recovery
                    </p>

                    <!-- Decorative line -->
                    <div style="width:48px;height:3px;background:linear-gradient(90deg,#4A6CF7,#7C3AED);
                                border-radius:99px;margin:24px auto 0;"></div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ═══════════════════════════════════════════════
               BODY
          ═══════════════════════════════════════════════ -->
          <tr>
            <td style="background:#F8F9FF;padding:0;">

              <!-- Top accent strip -->
              <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(74,108,247,0.2),transparent);"></div>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:44px 44px 36px;">

                    <!-- Greeting -->
                    <p style="margin:0 0 6px;font-size:22px;font-weight:800;color:#1A202C;letter-spacing:-0.3px;">
                      Hi there 👋
                    </p>
                    <p style="margin:0 0 28px;font-size:15px;color:#718096;line-height:1.7;">
                      We received a request to reset the password for the FloodTrack account linked to
                      <strong style="color:#4A6CF7;font-weight:700;">${toEmail}</strong>.
                      Use the verification code below to continue.
                    </p>

                    <!-- ── OTP CARD ────────────────────────────────── -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                      style="background:linear-gradient(135deg,#1A1F3A 0%,#0F1628 100%);
                             border-radius:20px;overflow:hidden;
                             box-shadow:0 16px 48px rgba(74,108,247,0.25),0 0 0 1px rgba(255,255,255,0.08);">
                      <tr>
                        <td style="padding:0;">
                          <!-- Top shimmer bar -->
                          <div style="height:2px;background:linear-gradient(90deg,#00D2FF,#4A6CF7,#7C3AED);"></div>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="padding:36px 32px 32px;">

                          <p style="margin:0 0 16px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);
                                     letter-spacing:3px;text-transform:uppercase;">
                            Your Verification Code
                          </p>

                          <!-- OTP bold text -->
                          <p style="margin:0;font-size:48px;font-weight:900;color:#FFFFFF;
                                    letter-spacing:14px;font-family:'Courier New',Courier,monospace;
                                    text-shadow:0 0 32px rgba(74,108,247,0.9);">
                            ${otp}
                          </p>

                          <!-- Expiry pill -->
                          <div style="display:inline-block;margin-top:24px;
                                      background:rgba(255,255,255,0.06);
                                      border:1px solid rgba(255,255,255,0.1);
                                      border-radius:99px;padding:8px 20px;">
                            <span style="font-size:12px;color:rgba(255,255,255,0.5);font-weight:600;">
                              ⏱ Expires in <span style="color:#4A6CF7;font-weight:700;">10 minutes</span>
                            </span>
                          </div>
                        </td>
                      </tr>
                    </table>
                    <!-- ── END OTP CARD ────────────────────────────── -->

                    <!-- Steps -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                      style="margin-top:32px;">
                      <tr>
                        <td style="padding-bottom:20px;">
                          <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#A0AEC0;
                                     letter-spacing:2px;text-transform:uppercase;">
                            How to reset
                          </p>

                          <!-- Step 1 -->
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;width:100%;">
                            <tr>
                              <td style="vertical-align:top;padding-right:14px;width:36px;">
                                <div style="width:32px;height:32px;border-radius:10px;
                                            background:linear-gradient(135deg,#4A6CF7,#7C3AED);
                                            text-align:center;line-height:32px;
                                            font-size:13px;font-weight:800;color:#fff;">1</div>
                              </td>
                              <td style="vertical-align:middle;">
                                <p style="margin:0;font-size:14px;color:#4A5568;line-height:1.5;">
                                  Open the <strong style="color:#1A202C;">FloodTrack app</strong> and go to the Reset Password screen.
                                </p>
                              </td>
                            </tr>
                          </table>

                          <!-- Step 2 -->
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;width:100%;">
                            <tr>
                              <td style="vertical-align:top;padding-right:14px;width:36px;">
                                <div style="width:32px;height:32px;border-radius:10px;
                                            background:linear-gradient(135deg,#4A6CF7,#7C3AED);
                                            text-align:center;line-height:32px;
                                            font-size:13px;font-weight:800;color:#fff;">2</div>
                              </td>
                              <td style="vertical-align:middle;">
                                <p style="margin:0;font-size:14px;color:#4A5568;line-height:1.5;">
                                  Enter the <strong style="color:#1A202C;">6-digit code</strong> above into the verification boxes.
                                </p>
                              </td>
                            </tr>
                          </table>

                          <!-- Step 3 -->
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
                            <tr>
                              <td style="vertical-align:top;padding-right:14px;width:36px;">
                                <div style="width:32px;height:32px;border-radius:10px;
                                            background:linear-gradient(135deg,#4A6CF7,#7C3AED);
                                            text-align:center;line-height:32px;
                                            font-size:13px;font-weight:800;color:#fff;">3</div>
                              </td>
                              <td style="vertical-align:middle;">
                                <p style="margin:0;font-size:14px;color:#4A5568;line-height:1.5;">
                                  Set your <strong style="color:#1A202C;">new password</strong> and you're back in.
                                </p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Security notice -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                      style="margin-top:8px;border-radius:14px;overflow:hidden;
                             background:#FFFBEB;border:1px solid #FDE68A;">
                      <tr>
                        <td style="padding:16px 20px;">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="vertical-align:top;padding-right:12px;font-size:18px;line-height:1;">⚠️</td>
                              <td>
                                <p style="margin:0;font-size:13px;color:#92400E;line-height:1.6;">
                                  <strong>Didn't request this?</strong> If you didn't ask to reset your password,
                                  you can safely ignore this email. Your account is not at risk.
                                </p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ═══════════════════════════════════════════════
               FOOTER
          ═══════════════════════════════════════════════ -->
          <tr>
            <td style="background:#0D1117;padding:0;">
              <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent);"></div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:28px 40px;">
                    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:rgba(255,255,255,0.35);letter-spacing:2px;text-transform:uppercase;">
                      FLOODTRACK
                    </p>
                    <p style="margin:0 0 16px;font-size:12px;color:rgba(255,255,255,0.2);line-height:1.6;">
                      Real-time flood monitoring &amp; alerts
                    </p>
                    <div style="width:32px;height:1px;background:rgba(255,255,255,0.1);margin:0 auto 16px;"></div>
                    <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.15);">
                      &copy; ${year} FloodTrack. All rights reserved.<br/>
                      This is an automated message — please do not reply.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Bottom gradient bar -->
          <tr>
            <td style="padding:0;background:#0D1117;">
              <div style="height:3px;background:linear-gradient(90deg,#7C3AED 0%,#4A6CF7 50%,#00D2FF 100%);"></div>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>
</body>
</html>`;

  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: toEmail }],
      subject: '🔑 Your FloodTrack Password Reset Code',
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body?.message ?? `Brevo error ${res.status} — check your API key and sender email.`);
  }
}
