import { useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Standard navbar — full-width wrapper matches the HeroSection context */}
      <div className="w-full flex-shrink-0">
        <Navbar variant="default" />
      </div>

      {/* Centered main content */}
      <main className="flex-1 flex items-center justify-center px-4 py-16 md:py-24">
        <div className="max-w-2xl w-full mx-auto text-center">

          {/* Decorative 404 number */}
          <div className="relative mb-6 select-none">
            <span
              className="
                font-montserrat font-bold text-[120px] md:text-[180px] lg:text-[220px]
                leading-none text-navy/[0.06] pointer-events-none
              "
            >
              404
            </span>
            {/* Number on top */}
            <span
              className="
                absolute inset-0 flex items-center justify-center
                font-montserrat font-bold text-[72px] md:text-[96px] lg:text-[112px]
                leading-none text-navy
              "
            >
              404
            </span>
          </div>

          {/* Title */}
          <h1 className="font-montserrat font-bold text-[24px] md:text-[32px] lg:text-[38px] text-navy leading-tight mb-4">
            Oops! Page not found
          </h1>

          {/* Support text */}
          <p className="font-montserrat font-medium text-[15px] md:text-[17px] text-navy/60 leading-relaxed mb-10 max-w-md mx-auto">
            Sorry, the page you're looking for doesn't exist or has been moved.
          </p>

          {/* CTA */}
          <button
            onClick={() => navigate('/')}
            className="
              inline-flex items-center justify-center gap-2
              bg-navy text-white
              font-montserrat font-medium text-[15px] md:text-[16px]
              rounded-[24px] px-8 py-4
              hover:bg-navy/90 active:scale-95
              transition-all duration-200
              shadow-md hover:shadow-lg
            "
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to Home
          </button>
        </div>
      </main>

      <Footer />
    </div>
  );
}