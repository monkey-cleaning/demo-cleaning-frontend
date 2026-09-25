import Navbar from '../../components/layout/Navbar';
import rightIcon from '../../assets/rightIcon.png';
import { useSiteImages } from '../../context/SiteImagesContext';

export default function HeroSection() {
  const { img } = useSiteImages();
  const handleBookNow = () => {
    const el = document.getElementById('contact');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative w-full">
      <picture>
        <source srcSet={img('specialized.hero.desktop')} media="(min-width: 768px)" />
        <img
          src={img('specialized.hero.mobile')}
          alt="Cleaning team working in a bright living room"
          className="w-full h-[350px] md:h-[600px] lg:h-[700px] xl:h-[800px] object-cover object-top"
        />
      </picture>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 md:h-32 bg-gradient-to-b from-white via-white/60 to-transparent z-[1]" />

      <div className="fixed top-0 left-0 right-0 z-[100]">
        <Navbar variant="transparent" />
      </div>

      <div className="absolute inset-0 pt-[60px]">

        {/* Desktop / Tablet Hero content */}
        <div className="hidden md:flex flex-col items-start pl-8 lg:pl-16 xl:pl-24 pt-[30px] lg:pt-[49px] md:ml-[40px] lg:ml-[80px] xl:ml-[100px] md:mt-[60px] lg:mt-[80px] xl:mt-[100px]">
          {/* Título Principal */}
          <h1 className="
            font-montserrat font-bold leading-[100%] text-[#031634]
            mb-[24px] lg:mb-[40px] xl:mb-[50px]
            text-[32px] lg:text-[40px] xl:text-[48px]
            max-w-[340px] lg:max-w-[420px] xl:max-w-[492px]
          ">
            Specialized Services
          </h1>

          {/* Subtítulo */}
          <p className="
            font-quicksand font-medium leading-[130%] text-[#1E1E1E]
            mb-[24px] lg:mb-[40px] xl:mb-[50px]
            text-[16px] lg:text-[20px] xl:text-[24px]
            max-w-[360px] lg:max-w-[430px] xl:max-w-[490px]
          ">
            Expert deep care for your furniture, carpets, and floors — restoring comfort, freshness, and shine
          </p>

          {/* Botón Book Now */}
          <button
            onClick={handleBookNow}
            className="
              flex items-center gap-2
              w-[140px] lg:w-[155px] xl:w-[165px]
              h-[38px] lg:h-[41px] xl:h-[44px]
              px-4 lg:px-5 xl:px-6 py-3
              bg-white border border-[#031634] rounded-[24px]
              hover:bg-gray-50 transition-colors duration-200
            "
          >
            <span className="text-[14px] lg:text-[15px] xl:text-[16px] font-montserrat font-semibold leading-[100%] text-[#031634]">
              Book Now
            </span>
            <img src={rightIcon} alt="Right Icon" className="w-[14px] lg:w-[16px] xl:w-[18px] h-auto" />
          </button>
        </div>

        {/* Mobile Hero content — sin cambios */}
        <div className="md:hidden flex flex-col items-center text-center px-4 pt-1">
          <h1 className="w-[191px] text-[16px] font-montserrat font-semibold leading-[100%] text-[#031634] mb-3 mt-5">
            Specialized Services
          </h1>
          <p className="w-[159px] text-[10px] font-quicksand font-medium leading-[100%] text-[#1E1E1E] mb-6">
            Expert deep care for your furniture, carpets, and floors — restoring comfort, freshness, and shine
          </p>
          <button
            onClick={handleBookNow}
            className="flex items-center gap-[2.66px] w-[100px] h-[22px] px-2 py-1 bg-white border border-[#031634] rounded-[8px] hover:bg-gray-50 transition-colors duration-200"
          >
            <span className="text-[10px] font-montserrat font-semibold leading-[100%] text-[#031634]">
              Book Now
            </span>
            <img src={rightIcon} alt="Right Icon" className="w-[8px] h-[8px] ml-2" />
          </button>
        </div>
      </div>
    </section>
  );
}