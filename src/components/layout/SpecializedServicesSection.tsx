import { useEffect, useMemo, useState } from "react";

// All (overview)
//import furnitureDesktop from "../../assets/furniture-desktop.png";
import UpIcon from "../../assets/upIcon.png";

// Detailed images
//import fabricFurniture from "../../assets/fabric-furniture.png";
//import leatherFurniture from "../../assets/leather-furniture.png";
//import cushionsFurniture from "../../assets/cushions-furniture.png";



// Check icon for includes
import checkServices from "../../assets/check-services.png";
import { useSiteImages } from '../../context/SiteImagesContext';
import type { SiteImageKey } from '../../config/siteImages';

type CategoryId = "all" | /*"furniture" |*/ "carpet" | "tile";

type ServicesSectionProps = {
  initialActive?: CategoryId;
};

const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: "all", label: "All" },
  //{ id: "furniture", label: "Furniture" },
  { id: "carpet", label: "Carpet" },
  { id: "tile", label: "Rugs" },
];

type OverviewCard = {
  id: Exclude<CategoryId, "all">;
  title: string;
  description: string;
  imageDesktop: SiteImageKey;
  imageMobile: SiteImageKey;
  cta: string;
};

const OVERVIEW_CARDS: OverviewCard[] = [
  /*{
    id: "furniture",
    title: "Furniture Cleaning",
    description:
      "Professional upholstery care that removes deep-seated dirt, dust, and stains from sofas, chairs, and cushions. Our gentle, eco-friendly process restores freshness and extends the life of your furniture.",
    imageDesktop: furnitureDesktop,
    imageMobile: furnitureDesktop,
    cta: "Explore Service",
  },*/
  {
    id: "carpet",
    title: "Carpet Cleaning",
    description:
      "Deep steam cleaning that revives your carpets' color, texture, and softness. Our trained team eliminates dust, allergens, and odors using safe, non-toxic products that leave every space refreshed.",
    imageDesktop: 'specialized.overview.carpet',
    imageMobile: 'specialized.overview.carpet',
    cta: "Explore Service",
  },
  {
    id: "tile",
    title: "Rug Washing",
    description:
      "Off-site immersion washing for area rugs and oriental carpets. We dust, wash, rinse, and controlled-dry every rug to lift years of embedded soil and bring the pile back to life.",
    imageDesktop: 'specialized.overview.tile',
    imageMobile: 'specialized.overview.tile',
    cta: "Explore Service",
  },
];

type DetailedCard = {
  category: Exclude<CategoryId, "all">;
  title: string;
  description: string;
  image: SiteImageKey;
  includes: string[];
};

const DETAILED_CARDS: DetailedCard[] = [
  // ===== FURNITURE =====
  /*{
    category: "furniture",
    title: "Fabric Upholstery",
    description:
      "Deep fabric care that removes stains, odors, and dust keeping sofas and chairs soft and refreshed.",
    image: fabricFurniture,
    includes: [
      "Steam and vacuum cleaning",
      "Stain and odor removal",
      "Pet hair and allergen control",
      "Gentle drying to protect fabric",
    ],
  },
  {
    category: "furniture",
    title: "Leather Upholstery",
    description:
      "Specialized leather cleaning and conditioning that restores shine, softness, and lasting comfort.",
    image: leatherFurniture,
    includes: [
      "Dust and buildup removal",
      "Conditioning and moisturizing",
      "Crack and fade prevention",
      "Protective finish application",
    ],
  },
  {
    category: "furniture",
    title: "Cushions & Mattresses",
    description:
      "Sanitizing care that removes allergens, dust, and odors for a cleaner, healthier sleep environment.",
    image: cushionsFurniture,
    includes: [
      "Vacuuming and deodorizing",
      "Steam sanitization treatment",
      "Stain and odor removal",
      "Allergen reduction process",
    ],
  },*/

  // ===== CARPET =====
  {
    category: "carpet",
    title: "Standard Carpet Cleaning",
    description:
      "Deep cleaning that lifts dirt, stains, and odors — leaving carpets fresh, soft, and spotless.",
    image: 'specialized.carpet.standard',
    includes: [
      "Vacuuming and pre-treatment",
      "Steam extraction cleaning",
      "Spot and odor removal",
      "Quick dry process",
    ],
  },
  {
    category: "carpet",
    title: "Deep Carpet Restoration",
    description:
      "Intensive treatment for worn or heavily soiled carpets, restoring texture, color, and freshness.",
    image: 'specialized.carpet.deep',
    includes: [
      "Deep fiber shampooing",
      "Heavy stain removal",
      "Odor and bacteria treatment",
      "Carpet grooming finish",
    ],
  },
  {
    category: "carpet",
    title: "Eco-Friendly Carpet Care",
    description:
      "Gentle cleaning with non-toxic products — safe for kids, pets, and sensitive environments.",
    image: 'specialized.carpet.eco',
    includes: [
      "Low-moisture steam cleaning",
      "Natural enzyme-based products",
      "Allergy-safe deodorizing",
      "Fabric protection layer",
    ],
  },

  // ===== RUG WASHING =====
  {
    category: "tile",
    title: "Standard Rug Wash",
    description:
      "A full immersion wash for everyday area rugs — deep soil and odour removal with a gentle, colour-safe process.",
    image: 'specialized.tile.standard',
    includes: [
      "Dry soil removal and dusting",
      "Full immersion wash and rinse",
      "Spot and odour treatment",
      "Controlled-air drying",
    ],
  },
  {
    category: "tile",
    title: "Fringe & Edge Detailing",
    description:
      "Hand detailing for fringes, borders, and worn edges — the areas a general wash always misses.",
    image: 'specialized.tile.grout',
    includes: [
      "Fibre and dye stability test",
      "Hand-scrubbed fringes and borders",
      "Edge and binding repair check",
      "Flat drying to protect the weave",
    ],
  },
  {
    category: "tile",
    title: "Large & Oversized Rugs",
    description:
      "Rotary-machine washing for room-sized and heavy rugs, plus free pickup and delivery across the service area.",
    image: 'specialized.tile.floor',
    includes: [
      "Rotary pre-scrub and deep rinse",
      "Fabric protector application",
      "Wrapped for storage or delivery",
      "Free local pickup and drop-off",
    ],
  },
];

const DYNAMIC_SERVICES: Record<Exclude<CategoryId, "all">, string> = {
  //furniture: "While we can customize your furniture care plan to suit your needs, most clients schedule regular cleaning or seasonal refreshes",
  carpet:    "We tailor every plan to fit your home's rhythm. Most clients schedule regular cleanings, but you can choose the service that suits your needs best",
  tile:      "Every rug is assessed and priced individually. Pick the wash that fits your rug, and we handle pickup and delivery",
};

const DYNAMIC_TITLES: Record<CategoryId, string> = {
  all:       "Precision Cleaning for Every Surface",
  //furniture: "Choose Your Home Cleaning Plan",
  carpet:    "Choose Your Home Cleaning Plan",
  tile:      "Choose Your Rug Wash",
};

export default function SpecializedServicesSection({
  initialActive = "all",
}: ServicesSectionProps) {
  const { img } = useSiteImages();
  const [active, setActive] = useState<CategoryId>(initialActive);

  useEffect(() => {
    setActive(initialActive);
  }, [initialActive]);

  const detailedForActive = useMemo(() => {
    if (active === "all") return [];
    return DETAILED_CARDS.filter((c) => c.category === active);
  }, [active]);

  const dynamicServiceText = useMemo(() => {
    if (active === "all") {
      return "From upholstered furniture to high-traffic floors, our specialized services restore beauty, freshness, and durability";
    }
    return DYNAMIC_SERVICES[active];
  }, [active]);

  const dynamicTitle = useMemo(() => DYNAMIC_TITLES[active], [active]);

  const handleBookNow = () => {
    const el = document.getElementById("contact");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="w-full bg-white">
      {/* ── Wrapper ── */}
      <div className="mx-auto lg:max-w-[1140px] mt-[80px] mb-[80px] px-4 md:px-8 lg:px-0">

        {/* ======= TOP HEADER ======= */}
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
              w-[200px] md:w-[320px] lg:w-[380px] xl:w-[420px]
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

            {/* H2 — fluid width, no fixed px on md */}
            <h2 className="
              mt-6 md:mt-[40px] lg:mt-[50px]
              font-montserrat font-bold text-[#031634]
              leading-[100%]
              text-[23.28px] md:text-[36px] lg:text-[42px] xl:text-[48px]
              w-[260px] md:w-auto
              text-center md:text-left
            ">
              {dynamicTitle}
            </h2>
          </div>

          {/* Right — "Services" label + dynamic description */}
          <div className="
            flex flex-col items-center md:items-start
            md:flex-1 md:min-w-0 md:max-w-[44%] lg:max-w-[40%]
            md:mt-[90px] lg:mt-[110px] xl:mt-[120px]
          ">
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
              {dynamicServiceText}
            </p>
          </div>
        </div>

        {/* Separator line */}
        <div className="border-b border-[#CDB380] my-8 md:my-12 w-full" />

        {/* ======= CONTENT ======= */}
        {active === "all" ? (
          // -------- ALL (overview) --------
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-4 lg:gap-8">
            {OVERVIEW_CARDS.map((card) => (
              <article
                key={card.title}
                className="flex flex-col items-start w-full h-full space-y-4"
              >
                <img
                  src={img(card.imageDesktop)}
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
                  src={img(card.image)}
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