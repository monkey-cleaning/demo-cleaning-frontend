import PageLayout from '../components/layout/PageLayout';
import { SEO } from '../components/seo/SEO';

export default function ThankYouPage() {
  return (
    <PageLayout>
      <SEO
        title="Thank You"
        description="Thank you for requesting a cleaning quote. Our team will contact you shortly."
        canonical="https://www.monkeycleaning.com/gracias"
      />
      <section className="max-w-xl mx-auto px-4 py-24 text-center">
        <h2 className="text-3xl font-semibold text-navy mb-4">
          Thank you for your request!
        </h2>
        <p className="text-slate-700 mb-8">
          We have received your cleaning request. Our team will reach out soon to
          confirm the details and finalize your booking.
        </p>
        <a
          href="/"
          className="inline-block px-6 py-3 rounded-full bg-gold text-navy font-medium"
        >
          Back to Home
        </a>
      </section>
    </PageLayout>
  );
}
