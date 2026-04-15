import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy — Moontide" };

export default function PrivacyPage() {
  return (
    <section className="py-16 px-6 bg-dawn-light">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-semibold text-deep-tide-blue mb-3">
          Privacy Policy
        </h1>
        <div className="w-8 h-0.5 bg-bright-orange mb-10" />

        <div className="space-y-8 text-deep-ocean leading-relaxed">
          <div>
            <h2 className="text-lg font-semibold text-deep-tide-blue mb-3">
              What we collect
            </h2>
            <p>
              When you book a class, we collect your name and email address.
              When you purchase a bundle, we collect your email address. When
              you use the contact form, we collect your name, email address, and
              message. We only collect what is needed to provide the service you
              requested.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-deep-tide-blue mb-3">
              How we use your data
            </h2>
            <p>
              Your information is used to process bookings, send confirmation
              emails, and respond to enquiries. We do not use your data for
              marketing unless you have given explicit consent. We do not sell
              or share your personal data with third parties for their own
              purposes.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-deep-tide-blue mb-3">
              Payment processing
            </h2>
            <p>
              Payments are processed securely by{" "}
              <a
                href="https://stripe.com/gb/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ocean-light-blue hover:text-deep-tide-blue transition-colors underline"
              >
                Stripe
              </a>
              . When you make a payment, you are redirected to Stripe&apos;s
              secure checkout page. We do not store your card details. Stripe
              processes your payment data in accordance with their own privacy
              policy.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-deep-tide-blue mb-3">
              Email communications
            </h2>
            <p>
              Booking confirmations and contact form responses are sent via{" "}
              <a
                href="https://resend.com/legal/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ocean-light-blue hover:text-deep-tide-blue transition-colors underline"
              >
                Resend
              </a>
              . Your email address is shared with Resend solely for the purpose
              of delivering these transactional emails.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-deep-tide-blue mb-3">
              Cookies
            </h2>
            <p>
              This website uses only essential cookies required for the site to
              function. These are session cookies used for administrator
              authentication and do not track your browsing activity. We do not
              use analytics, advertising, or tracking cookies.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-deep-tide-blue mb-3">
              Your rights
            </h2>
            <p>
              You have the right to request access to, correction of, or
              deletion of your personal data. To make a request, please contact
              me using the details on the{" "}
              <a
                href="/contact"
                className="text-ocean-light-blue hover:text-deep-tide-blue transition-colors underline"
              >
                contact page
              </a>
              .
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-deep-tide-blue mb-3">
              Data storage
            </h2>
            <p>
              Your data is stored securely using industry-standard encryption.
              Booking and contact data is held in a managed database hosted
              within the EU. We retain your data only for as long as necessary
              to provide our services or as required by law.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-deep-tide-blue mb-3">
              Changes to this policy
            </h2>
            <p>
              We may update this policy from time to time. Any changes will be
              posted on this page.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
