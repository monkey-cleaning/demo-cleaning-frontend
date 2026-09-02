import Navbar from '../../components/layout/Navbar';
import heroDesktop from '../../assets/tile-img.jpg';
import heroMobile from '../../assets/tile-img-mobile.jpg';
import rightIcon from '../../assets/rightIcon.png';

export default function HeroSection() {
  const handleBookNow = () => {
    const el = document.getElementById('contact');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative w-full">
      <picture>
        <source srcSet={heroDesktop} media="(min-width: 768px)" />
        <img
          src={heroMobile}
          alt="Cleaning team working in a bright living room"
          className="
            w-full object-cover object-top
            h-[350px]
            md:h-[500px]
            lg:h-[700px]
            xl:h-[800px]
          "
        />
      </picture>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 md:h-32 bg-gradient-to-b from-white via-white/60 to-transparent z-[1]" />

      <div className="fixed top-0 left-0 right-0 z-[100]">
        <Navbar variant="transparent" />
      </div>

      <div className="absolute inset-0 pt-[60px]">

        {/* ================= TABLET + DESKTOP (≥768px) ================= */}
        <div className="
          hidden md:flex flex-col items-start
          pl-[5%] lg:pl-16 xl:pl-24
          ml-[20px] lg:ml-[100px]
          mt-[24px] lg:mt-[100px]
          pt-[16px] lg:pt-[49px]
        ">
          <h1 className="
            font-montserrat font-bold leading-[100%] text-[#031634]
            mb-[20px] lg:mb-[50px]
            text-[28px] lg:text-[48px]
            max-w-[380px] lg:max-w-[592px]
          ">
            Rug Washing
          </h1>

          <p className="
            font-quicksand font-medium leading-[130%] text-[#1E1E1E]
            mb-[20px] lg:mb-[35px]
            text-[14px] lg:text-[24px]
            max-w-[320px] lg:max-w-[510px]
          ">
            Off-site immersion washing that lifts embedded soil from area rugs and oriental carpets, restoring their colour, texture, and freshness.
          </p>

          <button
            onClick={handleBookNow}
            className="
              flex items-center gap-2
              w-[130px] lg:w-[165px]
              h-[38px] lg:h-[44px]
              px-4 lg:px-6
              py-2 lg:py-3
              bg-white border border-[#031634] rounded-[24px]
              hover:bg-gray-50 transition-colors duration-200
            "
          >
            <span className="
              font-montserrat font-semibold leading-[100%] text-[#031634]
              text-[13px] lg:text-[16px]
            ">
              Book Now
            </span>
            <img src={rightIcon} alt="" className="w-[14px] h-[14px] lg:w-[18px] lg:h-[17px]" />
          </button>
        </div>

        {/* ================= MOBILE (<768px) — unchanged ================= */}
        <div className="md:hidden flex flex-col items-center text-center px-4 pt-1">
          <h1 className="w-[191px] text-[16px] font-montserrat font-semibold leading-[100%] text-[#031634] mb-3 mt-5">
            Rug Washing
          </h1>
          <p className="w-[180px] text-[10px] font-quicksand font-medium leading-[100%] text-[#1E1E1E] mb-6">
            Off-site immersion washing that lifts embedded soil from area rugs and oriental carpets, restoring their colour, texture, and freshness.
          </p>
          <button
            onClick={handleBookNow}
            className="flex items-center gap-[2.66px] w-[100px] h-[22px] px-2 py-1 bg-white border border-[#031634] rounded-[8px] hover:bg-gray-50 transition-colors duration-200 mt-[-15px]"
          >
            <span className="text-[10px] font-montserrat font-semibold leading-[100%] text-[#031634]">
              Book Now
            </span>
            <img src={rightIcon} alt="" className="w-[8px] h-[8px] ml-2" />
          </button>
        </div>
      </div>
    </section>
  );
}