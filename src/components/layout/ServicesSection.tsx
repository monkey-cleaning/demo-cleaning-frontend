import { useEffect, useMemo, useState } from "react";

// All (overview)
import residentialDesktop from "../../assets/residential-desktop.jpg";
import commercialDesktop from "../../assets/commercial-desktop.jpg";
import officesDesktop from "../../assets/office-desktop.jpg";
import UpIcon from "../../assets/upIcon.png";

// Detailed images
import standardResidential from "../../assets/standard-residential-cleaning.png";
import deepResidential from "../../assets/deep-residential-cleaning.png";
import moveResidential from "../../assets/move-residential-cleaning.png";

import standardCommercial from "../../assets/standard-commercial-cleaning.png";
import deepCommercial from "../../assets/deep-commercial-cleaning.png";
import moveCommercial from "../../assets/move-commercial-cleaning.png";

import standardOffice from "../../assets/standard-office-cleaning.png";
import deepOffice from "../../assets/deep-office-cleaning.png";
import moveOffice from "../../assets/move-office-cleaning.png";

// Check icon for includes
import checkServices from "../../assets/check-services.png";

type CategoryId = "all" | "residential" | "commercial" | "offices";

type ServicesSectionProps = {
  initialActive?: CategoryId;
};

const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: "all",         label: "All" },
  { id: "residential", label: "Residential" },
  { id: "commercial",  label: "Commercial" },
  { id: "offices",     label: "Offices" },
];

type OverviewCard = {
  id: Exclude<CategoryId, "all">;
  title: string;
  description: string;
  imageDesktop: string;
  imageMobile: string;
  cta: string;
};

const OVERVIEW_CARDS: OverviewCard[] = [
  {
    id: "residential",
    title: "Residental Cleaning",
    description:
      "Reliable home cleaning designed around your routine and comfort. Our team ensures every corner shines, from living areas to kitchens, using eco-friendly products that keep your home fresh and safe",
    imageDesktop: residentialDesktop,
    imageMobile: residentialDesktop,
    cta: "Book Now",
  },
  {
    id: "commercial",
    title: "Commercial Cleaning",
    description:
      "Reliable cleaning solutions tailored to your business hours and needs. Our team keeps every space spotless, from floors to high-touch areas ensuring a safe, polished, and welcoming workplace",
    imageDesktop: commercialDesktop,
    imageMobile: commercialDesktop,
    cta: "Book Now",
  },
  {
    id: "offices",
    title: "Offices Cleaning",
    description:
      "Reliable office cleaning that keeps your workspace organized and fresh. From desks to meeting rooms, our team delivers spotless results using eco-friendly products and attention to every detail",
    imageDesktop: officesDesktop,
    imageMobile: officesDesktop,
    cta: "Book Now",
  },
];

type DetailedCard = {
  category: Exclude<CategoryId, "all">;
  title: string;
  description: string;
  image: string;
  includes: string[];
};

const DETAILED_CARDS: DetailedCard[] = [
  // ===== RESIDENTIAL =====
  {
    category: "residential",
    title: "Standard Cleaning",
    description:
      "Routine maintenance for a spotless home — perfect for weekly or bi-weekly schedules.",
    image: standardResidential,
    includes: [
      "Dusting and vacuuming all rooms",
      "Wiping kitchen surfaces and appliances",
      "Bathroom sanitization (sinks, toilets, showers)",
      "Floor mopping and trash removal",
    ],
  },
  {
    category: "residential",
    title: "Deep Cleaning",
    description:
      "A thorough top-to-bottom clean ideal for seasonal refreshes or first-time services.",
    image: deepResidential,
    includes: [
      "Everything from Standard Cleaning",
      "Inside oven, fridge, and cabinets",
      "Baseboards, light fixtures, and window sills",
      "Detailed bathroom and kitchen cleaning",
    ],
  },
  {
    category: "residential",
    title: "Move In / Move Out",
    description:
      "Detailed cleaning for transitions — ensure every room feels ready, fresh, and inviting.",
    image: moveResidential,
    includes: [
      "All Deep Cleaning tasks",
      "Inside closets, drawers, and storage areas",
      "Wall spot cleaning and floor detailing",
      "Final inspection touch-ups",
    ],
  },

  // ===== OFFICES =====
  {
    category: "offices",
    title: "Standard Office Cleaning",
    description:
      "Routine maintenance to keep your workspace clean, organized, and ready for the day.",
    image: standardOffice,
    includes: [
      "Dusting desks, shelves, and office equipment",
      "Vacuuming and mopping floors",
      "Trash removal and restroom cleaning",
      "Sanitizing shared areas and high-touch points",
    ],
  },
  {
    category: "offices",
    title: "Deep Office Cleaning",
    description:
      "Comprehensive cleaning for a healthier, more refreshing workspace — ideal for quarterly or seasonal service.",
    image: deepOffice,
    includes: [
      "All Standard Cleaning tasks",
      "Disinfecting keyboards, and shared electronics",
      "Interior glass and partition cleaning",
      "Upholstery and carpet care",
    ],
  },
  {
    category: "offices",
    title: "Breakroom & Common Area Care",
    description:
      "Specialized cleaning to prepare your commercial space for reopening or move-in after remodeling.",
    image: moveOffice,
    includes: [
      "Cleaning sinks, counters, and appliances",
      "Wiping tables and seating areas",
      "Replenishing paper products and sanitizers",
      "Odor control and surface polishing for a fresh feel",
    ],
  },

  // ===== COMMERCIAL =====
  {
    category: "commercial",
    title: "Standard Commercial Cleaning",
    description:
      "Regular upkeep to maintain a professional environment — perfect for offices, retail spaces, and small businesses.",
    image: standardCommercial,
    includes: [
      "Dusting, vacuuming, and mopping all floors",
      "Trash removal and restroom sanitization",
      "Wiping desks, counters, and shared surfaces",
      "Entryway and reception area cleaning",
    ],
  },
  {
    category: "commercial",
    title: "Deep Commercial Cleaning",
    description:
      "Comprehensive cleaning for businesses needing extra attention — ideal for seasonal refreshes or periodic maintenance.",
    image: deepCommercial,
    includes: [
      "All Standard Cleaning tasks",
      "Interior windows and glass partitions",
      "Detailed carpet and upholstery care",
      "Sanitization of high-touch points and equipment",
    ],
  },
  {
    category: "commercial",
    title: "Post-Construction / Renovation Cleaning",
    description:
      "Specialized cleaning to prepare your commercial space for reopening or move-in after remodeling.",
    image: moveCommercial,
    includes: [
      "Removal of dust, paint, and construction debris",
      "Deep cleaning of floors, vents, and fixtures",
      "Polishing glass and surfaces to perfection",
      "Final inspection detailing for spotless handover",
    ],
  },
];

export default function ServicesSection({
  initialActive = "all",
}: ServicesSectionProps) {
  const [active, setActive] = useState<CategoryId>(initialActive);

  useEffect(() => {
    setActive(initialActive);
  }, [initialActive]);

  const detailedForActive = useMemo(() => {
    if (active === "all") return [];
    return DETAILED_CARDS.filter((c) => c.category === active);
  }, [active]);

  const handleBookNow = () => {
    const el = document.getElementById("contact");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="w-full bg-white">
      {/* ── Wrapper ── */}
      <div className="mx-auto lg:max-w-[1140px] mt-[80px] mb-[80px] px-4 md:px-8 lg:px-0">

        {/* ======= TOP HEADER: 2 cols on md+, stacked on mobile ======= */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 md:gap-4 lg:gap-6">

          {/* Left — label + pills + H2 */}
          <div className="flex flex-col items-center md:items-start md:flex-1 md:min-w-0">
            <p className="
              font-montserrat font-semibold text-[#031634]
              leading-[100%] mb-3
              text-[12px] md:text-[16px] lg:text-[20px]
              text-center md:text-left
            ">
              Select a category to see what's included
            </p>

            {/* Pills */}
            <div className="
              mt-2 md:mt-3
              flex items-center justify-center md:justify-start gap-1.5 md:gap-2
              bg-[#7676801F]
              p-[0.97px] md:p-[2px]
              rounded-[3.88px] md:rounded-[8px]
              w-[260px] md:w-[340px] lg:w-[420px]
              h-[20px] md:h-[30px] lg:h-[35px]
              shadow-[0px_3px_1px_0px_#0000000A,0px_3px_8px_0px_#0000001F]
            ">
              {CATEGORIES.map((cat) => {
                const isActive = active === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActive(cat.id)}
                    className={`
                      font-montserrat font-semibold
                      leading-[100%] transition
                      rounded-[2.9px] md:rounded-[6px]
                      px-2 md:px-3
                      h-[16px] md:h-[26px] lg:h-[28px]
                      text-[10px] md:text-[13px] lg:text-[16px]
                      ${isActive ? "bg-white text-[#031634]" : "bg-transparent text-[#031634]/70"}
                    `}
                    style={{
                      boxShadow: isActive
                        ? "0px 3px 1px 0px #0000000A, 0px 3px 8px 0px #0000001F"
                        : "none",
                    }}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {/* H2 — width is fluid, no fixed px on md */}
            <h2 className="
              mt-6 md:mt-[40px] lg:mt-[50px]
              font-montserrat font-bold text-[#031634]
              leading-[100%]
              text-[23.28px] md:text-[36px] lg:text-[42px] xl:text-[48px]
              w-[260px] md:w-auto
              text-center md:text-left
            ">
              We always provide the best service
            </h2>
          </div>

          {/* Right — "Services" label + description */}
          <div className="flex flex-col items-center md:items-start md:flex-1 md:min-w-0 md:max-w-[44%] lg:max-w-[40%]">
            <p className="
              font-montserrat font-semibold text-[#031634]
              leading-[100%]
              text-[15px] md:text-[17px] lg:text-[20px]
              text-center md:text-left
            ">
              Services
            </p>

            <p className="
              mt-2 md:mt-3
              font-quicksand font-medium text-[#666666]
              leading-[130%]
              text-[11.64px] md:text-[17px] lg:text-[20px] xl:text-[24px]
              w-[251px] md:w-full
              text-center md:text-left
            ">
              While we can customize your cleaning plan to suit your needs, most clients schedule regular cleaning services:
            </p>
          </div>
        </div>

        {/* Separator line */}
        <div className="border-b border-[#CDB380] my-8 md:my-12 w-full" />

        {/* ======= CONTENT ======= */}
        {active === "all" ? (
          // -------- ALL (overview) --------
          // grid-cols-1 → grid-cols-3 — cards use w-full so they never overflow
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-4 lg:gap-8">
            {OVERVIEW_CARDS.map((card) => (
              <article
                key={card.title}
                className="flex flex-col items-start w-full h-full space-y-4"
              >
                {/* Image — full width of the column, fixed aspect ratio */}
                <img
                  src={card.imageDesktop}
                  alt={card.title}
                  loading="lazy"
                  className="
                    w-full
                    h-[193px] md:h-[210px] lg:h-[240px] xl:h-[262px]
                    rounded-[14.55px] md:rounded-[20px] lg:rounded-[30px]
                    object-cover
                  "
                />

                <h3 className="
                  mt-3 md:mt-4
                  font-montserrat font-semibold text-[#031634]
                  text-[15px] md:text-[17px] lg:text-[20px]
                  leading-[100%] w-full text-left
                ">
                  {card.title}
                </h3>

                <p className="
                  mt-2 mb-4
                  font-quicksand font-medium text-[#031634]
                  text-[10px] md:text-[12px] lg:text-[14px]
                  leading-[130%]
                  w-full text-left flex-grow
                ">
                  {card.description}
                </p>

                <button
                  className="
                    flex items-center justify-center gap-[3.88px] md:gap-2
                    bg-white text-[#031634]
                    border border-[#031634]
                    rounded-[11.64px] md:rounded-[24px]
                    w-[130px] md:w-[155px] lg:w-[184px]
                    h-[25px] md:h-[37px] lg:h-[44px]
                    px-[11.64px] md:px-5 lg:px-6
                    py-[5.82px] md:py-3
                    font-montserrat font-semibold
                    text-[10px] md:text-[13px] lg:text-[16px]
                    leading-[100%]
                  "
                  onClick={handleBookNow}
                >
                  <span className="hidden md:block">{card.cta}</span>
                  <span className="block md:hidden">Explore Service</span>
                  <img
                    src={UpIcon}
                    alt=""
                    className="w-[8px] h-[8px] md:w-[10px] md:h-[10px] lg:w-[12px] lg:h-[10px]"
                  />
                </button>
              </article>
            ))}
          </div>
        ) : (
          // -------- DETAILED (per category) --------
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-4 lg:gap-8">
            {detailedForActive.map((card) => (
              <article
                key={card.title}
                className="flex flex-col items-start w-full space-y-3 md:space-y-4"
              >
                <img
                  src={card.image}
                  alt={card.title}
                  loading="lazy"
                  className="
                    w-full
                    h-[193px] md:h-[210px] lg:h-[240px] xl:h-[262px]
                    rounded-[14.55px] md:rounded-[20px] lg:rounded-[30px]
                    object-cover
                  "
                />

                <h3 className="
                  mt-3 md:mt-4
                  font-montserrat font-semibold text-[#031634]
                  text-[13px] md:text-[14px]
                  leading-[100%] w-full text-left md:mb-[10px]
                ">
                  {card.title}
                </h3>

                <p className="
                  mt-2
                  font-quicksand font-normal text-[#031634]
                  text-[10px] md:text-[12px]
                  leading-[120%] md:mb-[10px]
                  w-full text-left
                ">
                  {card.description}
                </p>

                <p className="
                  mt-3 md:mt-4
                  font-montserrat font-semibold text-[#031634]
                  text-[10px] md:text-[12px] mb-[10px]
                  leading-[100%]
                ">
                  Includes:
                </p>

                <ul className="mt-2 space-y-2 md:space-y-4 lg:space-y-6">
                  {card.includes.map((inc, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <img
                        src={checkServices}
                        alt=""
                        loading="lazy"
                        className="w-[10px] h-[10px] md:w-[12px] md:h-[12px] mt-[2px] shrink-0"
                      />
                      <span className="
                        font-quicksand font-normal text-[#031634]
                        text-[10px] md:text-[12px]
                        leading-[120%]
                      ">
                        {inc}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}