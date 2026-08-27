import checkCircle from "../../assets/checksWelcome.png";
import PlaceholderImage from "../../components/PlaceholderImage";

type Feature = { id: string; label: string };

const FEATURES: Feature[] = [
  { id: "vetted",      label: "Vetted professionals" },
  { id: "nextday",     label: "Next day availability" },
  { id: "standard",    label: "Standard cleaning tasks" },
  { id: "affordable",  label: "Affordable Prices" },
  { id: "quality",     label: "Best Quality" },
  { id: "affordable2", label: "Affordable Prices" },
];

export default function WelcomeSection() {
  const handleBookNow = () => {
    const el = document.getElementById('contact');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="w-full bg-white">
      {/* Wrapper — tablet usa lg:max-w como puente hacia desktop */}
      <div className="mx-auto lg:max-w-[1140px] mt-[20px] md:mt-[60px] lg:mt-[80px] xl:mt-[100px] mb-[80px] px-4 md:px-8 lg:px-0">
        <div className="flex flex-col md:flex-row md:items-center gap-8 md:gap-[40px] lg:gap-[60px] xl:gap-[80px]">

          {/* Imagen izquierda */}
          <div className="flex justify-center md:justify-start md:shrink-0">
            <PlaceholderImage
              className="
                w-[260px] h-auto
                md:w-[380px] md:h-[314px]
                lg:w-[460px] lg:h-[380px]
                xl:w-[535px] xl:h-[442px]
                rounded-[18px] object-cover
              "
            />
          </div>

          {/* Texto derecha */}
          <div className="flex flex-col items-center md:items-start w-full">
            <h2 className="
              font-montserrat text-[#031634]
              font-semibold md:font-bold
              leading-[100%]
              text-center md:text-left
              w-full
              text-[18.79px]
              md:text-[28px] md:max-w-[400px]
              lg:text-[32px] lg:max-w-[460px]
              xl:text-[36px] xl:max-w-[520px]
            ">
              Welcome To Our <br />
              Pro-cleaning Company!
            </h2>

            <p className="
              mt-3 md:mt-4
              font-quicksand text-[#031634] font-normal
              leading-[130%]
              text-center md:text-left w-full
              text-[10px]
              md:text-[14px] md:max-w-[400px]
              lg:text-[15px] lg:max-w-[460px]
              xl:text-[16px] xl:max-w-[520px]
            ">
              We make your space shine! Professional and reliable cleaning service company
              providing top-notch solutions for homes and businesses. Satisfaction guaranteed!
            </p>

            {/* Features grid */}
            <div className="
              mt-5 md:mt-6
              grid grid-cols-2
              gap-x-[8px] md:gap-x-[20px] lg:gap-x-[30px] xl:gap-x-[40px]
              gap-y-3 md:gap-y-4
              w-fit mx-auto md:mx-0
            ">
              {FEATURES.map((f) => (
                <div
                  key={f.id}
                  className="
                    flex items-center
                    bg-[#F5F4F4]
                    rounded-[2.09px] md:rounded-[4px]
                    px-[5.22px] md:px-[8px] lg:px-[10px]
                    py-[5.22px] md:py-[8px] lg:py-[10px]
                    gap-[4.18px] md:gap-[6px] lg:gap-2
                    w-[150px] md:w-[180px] lg:w-[215px] xl:w-[247px]
                    h-[20.44px] md:h-[34px] lg:h-[38px] xl:h-[40px]
                  "
                >
                  <img
                    src={checkCircle}
                    alt="check circle"
                    loading="lazy"
                    className="w-[8px] h-[8px] md:w-[13px] md:h-[13px] lg:w-[15px] lg:h-[15px] xl:w-[16px] xl:h-[16px] shrink-0"
                  />
                  <span className="
                    font-montserrat font-semibold text-[#031634]
                    leading-[100%]
                    text-[10px] md:text-[13px] lg:text-[15px] xl:text-[16px]
                  ">
                    {f.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Botones */}
            <div className="mt-6 md:mt-[30px] lg:mt-[40px] xl:mt-[50px] flex items-center gap-3 md:gap-4">
              <button
                className="
                  bg-[#031634] text-white border border-[#031634]
                  rounded-[12.53px] md:rounded-[24px]
                  w-[100px] md:w-[155px] lg:w-[168px] xl:w-[180px]
                  h-[22.53px] md:h-[39px] lg:h-[42px] xl:h-[44px]
                  px-[12.53px] md:px-5 lg:px-6
                  py-[6.26px] md:py-3
                  font-montserrat font-semibold
                  text-[10px] md:text-[14px] lg:text-[15px] xl:text-[16px]
                  leading-[100%]
                  flex items-center justify-center
                "
                onClick={handleBookNow}
              >
                Book Now
              </button>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}