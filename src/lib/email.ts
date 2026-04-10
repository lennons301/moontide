import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface ContactEmailParams {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export async function sendContactEmail(params: ContactEmailParams) {
  const { name, email, subject, message } = params;
  const to = process.env.CONTACT_EMAIL || "gwaring5@googlemail.com";

  await resend.emails.send({
    from: "Moontide <noreply@gabriellemoontide.co.uk>",
    to,
    subject: `[Moontide] ${subject}`,
    replyTo: email,
    text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`,
  });

  return { success: true };
}
