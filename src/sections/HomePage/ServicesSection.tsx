import serviceDesktop from '../../assets/service-desktop.png';
import serviceMobile from '../../assets/service-mobile.png';
import { useNavigate } from 'react-router-dom';

export default function ServicesSection() {
  const navigate = useNavigate();

  const handleGetQuote = () => {
    navigate('/contact-us');
  };

  const handleCommercialCleaning = () => {
    navigate('/services/general/commercial');
  };

  return (
    <section className="w-full bg-white py-12 md:py-20">
      {/*
        CA3/CA4: px-4 (mobile) → px-8 (md/tablet) → px-[130px] (lg+)
        Prevents text from touching edges at 768–1024px range.
      */}
      <div className="w-full px-4 sm:px-6 md:px-8 lg:px-[130px] xl:px-[140px]">

        {/* Desktop Layout — hidden below md */}
        <div className="hidden md:grid md:grid-cols-2 md:items-center md:gap-8 lg:gap-0">
          {/* Left Content */}
          <div className="space-y-6 lg:space-y-8">
            {/* Always Open Badge */}
            <div className="inline-block">
              {/*
                CA2: font size scales with clamp so it never crashes into
                the image at tablet widths (768–1024px).
              */}
              <p
                className="font-montserrat font-bold text-navy"
                style={{ fontSize: 'clamp(13px, 1.5vw, 18px)', lineHeight: '30px' }}
              >
                ALWAYS OPEN! We work 7 days a week
              </p>
              <div className="w-full max-w-[383px] border-b-[3px] border-[#CDB380] mt-2.5" />
            </div>

            {/*
              CA2: H1 drops from 66px (desktop) to ~40px at 768px via clamp,
              preventing collision with the image column.
              CA3: w-full instead of fixed w-[626px] so it doesn't overflow
              the grid column on tablets.
            */}
            <h2
              className="font-montserrat font-bold text-navy w-full"
              style={{
                fontSize: 'clamp(32px, 5vw, 66px)',
                lineHeight: 'clamp(44px, 6.5vw, 90px)'
              }}
            >
              Cleaning Services Victoria BC
            </h2>

            {/* Description — fluid width */}
            <p
              className="font-quicksand font-medium text-black w-full max-w-[461px]"
              style={{ fontSize: 'clamp(14px, 1.6vw, 18px)', lineHeight: '1.65' }}
            >
              Experience the difference with our professional residential and
              commercial cleaning solutions. Available 7 days a week for your
              convenience
            </p>

            {/* Buttons — wrap on tablet if needed */}
            <div className="flex flex-wrap gap-3 lg:gap-4">
              <button
                className="px-5 py-2.5 lg:px-6 lg:py-3 rounded-[24px] border border-navy bg-white font-montserrat font-bold text-navy hover:bg-navy hover:text-white transition-colors duration-200"
                style={{ fontSize: 'clamp(13px, 1.4vw, 18px)', lineHeight: '100%' }}
                onClick={handleGetQuote}
              >
                Get a Quote
              </button>
              <button
                className="px-5 py-2.5 lg:px-6 lg:py-3 rounded-[24px] border border-navy bg-white font-montserrat font-bold text-navy hover:bg-navy hover:text-white transition-colors duration-200"
                style={{ fontSize: 'clamp(13px, 1.4vw, 18px)', lineHeight: '100%' }}
                onClick={handleCommercialCleaning}
              >
                Commercial Cleaning Book Now
              </button>
            </div>
          </div>

          {/* Right Image — scales proportionally within the column */}
          <div className="flex justify-end">
            <img
              src={serviceDesktop}
              alt="Professional cleaning team"
              loading="lazy"
              className="w-full max-w-[504px] rounded-[18px] object-cover"
              style={{ height: 'clamp(300px, 35vw, 480px)' }}
            />
          </div>
        </div>

        {/* Mobile Layout — only below md, unchanged from original */}
        <div className="md:hidden space-y-6">
          <div className="text-center mb-[40px]">
            <p className="font-montserrat font-bold text-[10px] mt-[-30px] leading-[100%] text-navy">
              ALWAYS OPEN! We work 7 days a week
            </p>
            <div className="w-[180px] border-b-[1.26px] border-[#CDB380] mt-[4.21px] mx-auto" />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
            <div className="space-y-3">
              <h2 className="font-montserrat font-semibold text-[18.43px] leading-[100%] text-navy">
                Cleaning Services Victoria BC
              </h2>
              <p className="font-quicksand font-medium text-[11.52px] leading-[100%] text-[#1E1E1E]">
                Experience the difference with our professional residential and
                commercial cleaning solutions.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleGetQuote}
                  className="px-[9.2px] py-[4.6px] rounded-[9.2px] border-[0.38px] border-navy bg-white font-montserrat font-semibold text-[10px] leading-[100%] text-navy"
                >
                  Get a Quote
                </button>
                <button
                  onClick={handleCommercialCleaning}
                  className="px-[9.2px] py-[4.6px] rounded-[9.2px] border-[0.38px] border-navy bg-white font-montserrat font-semibold text-[10px] leading-[100%] text-navy whitespace-nowrap"
                >
                  Book Now
                </button>
              </div>
            </div>

            <div className="flex-shrink-0">
              <img
                src={serviceMobile}
                alt="Professional cleaning team"
                loading="lazy"
                className="w-[136px] h-[129px] rounded-[5.57px] object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}