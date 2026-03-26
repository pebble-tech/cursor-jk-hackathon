import { HACKATHON_DATE, HACKATHON_NAME, HACKATHON_VENUE } from '~/config/event';
import { env } from '~/config/env';
import { sendEmail } from '~/email/client';
import { generateQRCodeBuffer } from '~/utils/qr-image';

const QR_CODE_CONTENT_ID = 'qr-code';

type AssignedCode = {
  creditType: {
    id: string;
    name: string;
    displayName: string;
    emailInstructions: string | null;
  };
  code: {
    id: string;
    codeValue: string;
    redeemUrl: string | null;
  };
};

type SendCheckinConfirmationEmailParams = {
  to: string;
  name: string;
  qrCodeValue: string;
  assignedCodes: AssignedCode[];
};

export async function sendCheckinConfirmationEmail({
  to,
  name,
  qrCodeValue,
  assignedCodes,
}: SendCheckinConfirmationEmailParams) {
  const greeting = `Hi ${name}`;
  const qrCodeBuffer = await generateQRCodeBuffer(qrCodeValue, { width: 300, margin: 2 });

  const creditsSection = assignedCodes
    .map(({ creditType, code }) => {
      const redeemSection = code.redeemUrl
        ? `<p style="margin: 4px 0 0; font-size: 13px; line-height: 20px; color: #3f3f46;"><strong>Redeem:</strong> <a href="${code.redeemUrl}" target="_blank" style="color: #18181b; text-decoration: underline;">${code.redeemUrl}</a></p>`
        : '';
      const instructionsSection = creditType.emailInstructions
        ? `<p style="margin: 4px 0 0; font-size: 13px; line-height: 20px; color: #3f3f46;">${creditType.emailInstructions}</p>`
        : '';

      return `
        <div style="margin: 0 0 16px; padding: 16px; background-color: #f8fafc; border-radius: 8px; border-left: 4px solid #18181b;">
          <p style="margin: 0 0 8px; font-size: 15px; font-weight: 600; color: #18181b;">${creditType.displayName}</p>
          <p style="margin: 0 0 4px; font-size: 14px; line-height: 22px; color: #3f3f46;"><strong>Code:</strong> <code style="background-color: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 13px;">${code.codeValue}</code></p>
          ${redeemSection}
          ${instructionsSection}
        </div>
      `;
    })
    .join('');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Checked In! - ${HACKATHON_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td style="padding: 40px 32px;">
              <div style="display: inline-block; padding: 6px 12px; background-color: #dcfce7; border-radius: 9999px; margin-bottom: 16px;">
                <span style="font-size: 12px; font-weight: 600; color: #166534;">✓ CHECKED IN</span>
              </div>
              <h1 style="margin: 0 0 24px; font-size: 24px; font-weight: 600; color: #18181b;">You're Checked In!</h1>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 24px; color: #3f3f46;">${greeting},</p>
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: #3f3f46;">Welcome to ${HACKATHON_NAME}! You've been successfully checked in and your credits have been assigned.</p>
              
              <div style="margin: 28px 0; padding: 20px; background-color: #f8fafc; border-radius: 8px; border-left: 4px solid #18181b;">
                <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #18181b;">Event Details</p>
                <p style="margin: 0 0 4px; font-size: 14px; line-height: 22px; color: #3f3f46;"><strong>Date:</strong> ${HACKATHON_DATE}</p>
                <p style="margin: 0; font-size: 14px; line-height: 22px; color: #3f3f46;"><strong>Venue:</strong> ${HACKATHON_VENUE}</p>
              </div>

              <h2 style="margin: 28px 0 12px; font-size: 16px; font-weight: 600; color: #18181b;">Your Credits</h2>
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 24px; color: #3f3f46;">You've been assigned ${assignedCodes.length} credit${assignedCodes.length !== 1 ? 's' : ''}. Use these codes to access partner services:</p>
              
              ${creditsSection}

              <h2 style="margin: 28px 0 12px; font-size: 16px; font-weight: 600; color: #18181b;">Your QR Code</h2>
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 24px; color: #3f3f46;">Show this QR code for check-in at the event. Your QR code is permanent and never expires.</p>
              
              <div style="text-align: center; padding: 20px; background-color: #fafafa; border-radius: 8px; margin-bottom: 24px;">
                <img src="cid:${QR_CODE_CONTENT_ID}" alt="Your QR Code" width="200" height="200" style="display: block; margin: 0 auto; border-radius: 4px;" />
              </div>

              <hr style="margin: 32px 0; border: none; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 13px; line-height: 20px; color: #71717a;">You can view all your credits and QR code anytime in your <a href="${env.APP_BASE_URL}/dashboard" target="_blank" style="color: #18181b; text-decoration: underline;">dashboard</a>.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  const creditsText = assignedCodes
    .map(({ creditType, code }) => {
      const redeemText = code.redeemUrl ? `\nRedeem: ${code.redeemUrl}` : '';
      const instructionsText = creditType.emailInstructions ? `\n${creditType.emailInstructions}` : '';
      return `${creditType.displayName}\nCode: ${code.codeValue}${redeemText}${instructionsText}`;
    })
    .join('\n\n');

  const text = `${greeting},

You're Checked In!

Welcome to ${HACKATHON_NAME}! You've been successfully checked in and your credits have been assigned.

EVENT DETAILS
Date: ${HACKATHON_DATE}
Venue: ${HACKATHON_VENUE}

YOUR CREDITS
You've been assigned ${assignedCodes.length} credit${assignedCodes.length !== 1 ? 's' : ''}. Use these codes to access partner services:

${creditsText}

YOUR QR CODE
Show your QR code for check-in at the event. Your QR code is permanent and never expires.

(QR code is embedded in the HTML version of this email. Please view in an email client that supports HTML to see your QR code.)

You can view all your credits and QR code anytime in your dashboard: ${env.APP_BASE_URL}/dashboard`;

  return sendEmail({
    to,
    subject: `You're Checked In! - Your ${HACKATHON_NAME} credits`,
    html,
    text,
    attachments: [
      {
        filename: 'qrcode.png',
        content: qrCodeBuffer,
        contentId: QR_CODE_CONTENT_ID,
      },
    ],
  });
}
