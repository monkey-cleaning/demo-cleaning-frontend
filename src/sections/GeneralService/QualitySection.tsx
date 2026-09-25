import { useSiteImages } from '../../context/SiteImagesContext';

export default function QualitySection() {
  const { img } = useSiteImages();
  const handleBookNow = () => {
    const el = document.getElementById('contact');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="w-full bg-white">
      <div className="mx-auto lg:max-w-[1140px] mt-[20px] md:mt-[60px] lg:mt-[80px] xl:mt-[100px] mb-[80px] px-4 md:px-8 lg:px-0">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8 md:gap-[30px] lg:gap-[40px] xl:gap-12">

          {/* ===== Left content ===== */}
          <div className="flex flex-col items-center md:items-start w-full md:w-auto">

            {/* Affordable cleaning solutions */}
            <p className="
              font-montserrat font-semibold text-[#031634]
              leading-[100%]
              text-center md:text-left
              text-[12.7px]
              md:text-[15px] md:mb-[14px]
              lg:text-[18px] lg:mb-[17px]
              xl:text-[20px] xl:mb-[20px]
            ">
              Affordable cleaning solutions
            </p>

            {/* Title */}
            <h2 className="
              mt-3 md:mt-[16px] lg:mt-[18px] xl:mt-[20px]
              font-montserrat text-[#031634]
              font-semibold md:font-bold
              leading-[110%]
              text-center md:text-left
              text-[22.86px]
              md:text-[26px] md:w-[360px]
              lg:text-[31px] lg:w-[440px]
              xl:text-[36px] xl:w-[520px]
            ">
              High-Quality and Friendly <br className="hidden md:block" />
              Services at Fair Prices
            </h2>

            {/* Paragraph */}
            <p className="
              mt-4 md:mt-[22px] lg:mt-[26px] xl:mt-[30px]
              md:mb-[10px]
              font-quicksand font-normal text-[#031634]
              leading-[130%]
              text-center md:text-left
              text-[10.16px]
              md:text-[13px] md:w-[360px]
              lg:text-[15px] lg:w-[440px]
              xl:text-[16px] xl:w-[520px]
            ">
              We provide comprehensive cleaning services tailored to your needs.
              From residential cleaning services
            </p>

            {/* Button */}
            <button
              className="
                mt-6 md:mt-7 lg:mt-8
                bg-[#031634] text-white border border-[#031634]
                rounded-[15.24px] md:rounded-[24px]
                w-[100px] md:w-[155px] lg:w-[168px] xl:w-[180px]
                h-[27.24px] md:h-[39px] lg:h-[42px] xl:h-[44px]
                px-[15.24px] md:px-5 lg:px-6
                py-[7.62px] md:py-3
                font-montserrat font-semibold
                text-[10.16px] md:text-[14px] lg:text-[15px] xl:text-[16px]
                leading-[100%]
                flex items-center justify-center
              "
              onClick={handleBookNow}
            >
              Get a quote
            </button>
          </div>

          {/* ===== Right image ===== */}
          <div className="flex justify-center md:justify-end w-full md:w-auto md:shrink-0">
            <img
              src={img('general.quality')}
              alt="Quality cleaning"
              loading="lazy"
              className="
                w-[303.53px] h-[267.34px]
                md:w-[340px] md:h-[299px]
                lg:w-[410px] lg:h-[361px]
                xl:w-[478px] xl:h-[421px]
                rounded-[11.43px] md:rounded-[18px]
                object-cover
              "
            />
          </div>

        </div>
      </div>
    </section>
  );
}