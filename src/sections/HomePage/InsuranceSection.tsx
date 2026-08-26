import worksafeDesktop from '../../assets/worksafe-desktop.png';
import worksafeMobile from '../../assets/worksafe-mobile.png';
import zensuranceDesktop from '../../assets/zensurance-desktop.png';
import zensuranceMobile from '../../assets/zensurance-mobile.png';
import travelersDesktop from '../../assets/travelers-desktop.png';
import travelersMobile from '../../assets/travelers-mobile.png';

export default function InsuranceSection() {
  return (
    <section className="w-full bg-white py-10 md:py-16">
      {/* Desktop (md+) */}
      <div className="hidden md:flex flex-col items-center px-8 lg:px-0">
        {/* CA2: title scales with clamp so it doesn't jump from 40px to nothing at 768px */}
        <h2
          className="font-montserrat font-bold leading-[100%] text-center text-navy mb-8 lg:mb-[50px]"
          style={{ fontSize: 'clamp(24px, 3.5vw, 40px)' }}
        >
          Insurance Providers
        </h2>

        {/*
          CA1/CA3: Replace fixed w-[713px] with fluid w-full + max-w-[713px].
          gap scales from 32px at 768px to 60px at 1024px+.
          Logo heights scale via clamp to stay proportional at tablet widths.
        */}
        <div
          className="mt-6 w-full max-w-[713px] flex items-center justify-center opacity-60 py-5"
          style={{ gap: 'clamp(32px, 5vw, 60px)', height: 'clamp(56px, 8vw, 89px)' }}
        >
          <img
            src={worksafeDesktop}
            alt="WorkSafe BC"
            loading="lazy"
            className="h-full w-auto object-contain"
          />
          <img
            src={zensuranceDesktop}
            alt="Zensurance"
            loading="lazy"
            className="h-full w-auto object-contain"
          />
          <img
            src={travelersDesktop}
            alt="Travelers"
            loading="lazy"
            className="h-full w-auto object-contain"
          />
        </div>
      </div>

      {/* Mobile */}
      <div className="md:hidden flex flex-col items-center px-4 mt-[-20px]">
        {/* Título */}
        <h2 className="font-montserrat font-semibold text-[18.43px] leading-[100%] text-center text-navy">
          Insurance Providers
        </h2>

        {/* Logos */}
        <div className="mt-4 w-full max-w-[357.16px] flex items-center justify-center gap-[24.54px] opacity-60 py-[10.02px]">
          <img
            src={worksafeMobile}
            alt="WorkSafe BC"
            loading="lazy"
            className="max-h-[44.69px] w-auto object-contain"
          />
          <img
            src={zensuranceMobile}
            alt="Zensurance"
            loading="lazy"
            className="max-h-[44.69px] w-auto object-contain"
          />
          <img
            src={travelersMobile}
            alt="Travelers"
            loading="lazy"
            className="max-h-[44.69px] w-auto object-contain"
          />
        </div>
      </div>
    </section>
  );
}