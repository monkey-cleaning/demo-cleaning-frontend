import HeroSection from '../sections/Contact/HeroSection';
import Footer from '../components/layout/Footer';
import FormSection from '../sections/HomePage/FormSection';

export default function ContactPage() {
  return (
    <div className="min-h-screen max">
      <HeroSection />
      <FormSection />

      {/* Map Section — extracted from the original Contact FormSection */}
      <div className="max-w-6xl mx-auto px-4 md:px-[5%] lg:px-6 py-12 space-y-6">
        <div>
          <h2 className="text-2xl font-semibold mb-4 text-[#031634]">Our Location</h2>

          <div className="flex items-center mb-3">
            <svg className="w-5 h-5 text-[#031634] mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <a
              href="tel:+16729745232"
              className="text-gray-700 hover:text-[#031634] hover:underline transition-colors font-medium"
            >
              Phone: 1 (672) 974-5232
            </a>
          </div>

          <div className="flex items-center mb-3">
            <svg className="w-5 h-5 text-[#031634] mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <a
              href="mailto:joaquin.labtinos@gmail.com"
              className="text-gray-700 hover:text-[#031634] hover:underline transition-colors font-medium"
            >
              Email: joaquin.labtinos@gmail.com
            </a>
          </div>
        </div>

        <div className="w-full aspect-video">
          <iframe
            width="100%"
            height="100%"
            className="rounded-lg shadow-lg"
            loading="lazy"
            allowFullScreen
            src="https://maps.google.com/maps?q=1295%20Craigflower%20Rd,%20Victoria,%20BC%20V9A%200H7,%20Canada&z=15&output=embed"
            title="Our Location"
          />
        </div>
      </div>

      <Footer />
    </div>
  );
}