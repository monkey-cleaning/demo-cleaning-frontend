import Navbar from "../../components/layout/Navbar";
import checksWelcome from "../../assets/checksWelcome.png";
import { useSiteImages } from '../../context/SiteImagesContext';

const CHECKS = [
  "Trained, trusted staff",
  "Detail-focused cleaning standards",
  "Eco-conscious products",
  "Reliable scheduling & communication",
];

export default function HeroSection() {
  const { img } = useSiteImages();
  return (
    <section className="relative w-full">
      <picture>
        <source srcSet={img('blog.hero.desktop')} media="(min-width: 768px)" />
        <img
          src={img('blog.hero.mobile')}
          alt="Cleaning team working in a bright living room"
          className="w-full object-right-top h-[350px] md:h-[600px] lg:h-[700px] xl:h-[800px] object-cover"
        />
      </picture>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 md:h-32 bg-gradient-to-b from-white via-white/60 to-transparent z-[1]" />

      <div className="fixed top-0 left-0 right-0 z-[100]">
        <Navbar variant="transparent" />
      </div>
      <div className="absolute inset-0 pt-[60px]">
        {/* ================= DESKTOP / TABLET ================= */}
        <div className="hidden md:flex flex-col items-start pl-8 lg:pl-16 xl:pl-24 pt-[30px] lg:pt-[49px] md:ml-[40px] lg:ml-[80px] xl:ml-[100px] md:mt-[50px] lg:mt-[80px] xl:mt-[100px]">
          {/* Title */}
          <h1 className="
            font-montserrat font-bold leading-[100%] text-[#031634]
            mb-[24px] lg:mb-[40px] xl:mb-[50px]
            text-[32px] lg:text-[40px] xl:text-[48px]
            max-w-[500px] lg:max-w-[600px] xl:max-w-[692px]
          ">
            Why Demo Cleaning Co.?
          </h1>

          {/* Subtitle */}
          <p className="
            font-quicksand font-medium leading-[130%] text-[#1E1E1E]
            mb-[20px] lg:mb-[28px] xl:mb-[35px]
            text-[16px] lg:text-[20px] xl:text-[24px]
            max-w-[420px] lg:max-w-[500px] xl:max-w-[580px]
          ">
            Reliable, detailed, and eco-conscious cleaning for homes and businesses in Victoria, BC
          </p>

          {/* Checks */}
          <ul className="space-y-[12px] lg:space-y-[16px] xl:space-y-[20px]">
            {CHECKS.map((text) => (
              <li key={text} className="flex items-center gap-[8px] lg:gap-[10px]">
                <img
                  src={checksWelcome}
                  alt=""
                  className="w-[14px] h-[14px] lg:w-[16px] lg:h-[16px] xl:w-[18px] xl:h-[18px] object-contain"
                />
                <span className="
                  font-montserrat font-semibold leading-[100%] text-[#031634]
                  text-[13px] lg:text-[15px] xl:text-[16px]
                ">
                  {text}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* ================= MOBILE — sin cambios ================= */}
        <div className="md:hidden flex flex-col items-center text-center px-4 pt-1">
          <h1 className="w-[250px] font-montserrat font-semibold text-[16px] leading-[100%] text-[#031634] mb-3 mt-5">
            Why Demo Cleaning Co.?
          </h1>
          <p className="w-[240px] font-quicksand font-medium text-[10px] leading-[100%] text-[#1E1E1E] mb-4">
            Reliable, detailed, and eco-conscious cleaning for homes and businesses in Victoria, BC
          </p>
          <ul className="mt-1 space-y-[8px]">
            {CHECKS.map((text) => (
              <li key={text} className="flex items-center gap-[6px]">
                <img src={checksWelcome} alt="" className="w-[9px] h-[9px] object-contain" />
                <span className="font-montserrat font-semibold text-[10px] leading-[100%] text-[#031634] mr-10">
                  {text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}