import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSiteImages } from '../../context/SiteImagesContext';
import type { SiteImageKey } from '../../config/siteImages';

const services: {
  id: number;
  title: string;
  description: string;
  image: SiteImageKey;
  linkTo: string;
}[] = [
  {
    id: 1,
    title: 'Residential',
    description: 'In-home carpet and rug cleaning tailored to your lifestyle',
    image: 'home.general.residential',
    linkTo: '/services/general/residential'
  },
  {
    id: 2,
    title: 'Commercial',
    description: 'Carpet cleaning solutions for businesses of all sizes',
    image: 'home.general.commercial',
    linkTo: '/services/general/commercial'
  },
  {
    id: 3,
    title: 'Offices',
    description: 'Fresh office carpet and upholstery that lift the workspace',
    image: 'home.general.offices',
    linkTo: '/services/general/offices'
  }
];

export default function GeneralServicesSection() {
  const { img } = useSiteImages();
  const [centerIndex, setCenterIndex] = useState(1);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  const navigate = useNavigate();

  const handleCardClick = (linkTo: string, clickedIndex: number) => {
    if (isSwiping) return;
    if (clickedIndex !== centerIndex) {
      setCenterIndex(clickedIndex);
    } else {
      navigate(linkTo);
    }
  };

  const handleExploreClick = (linkTo: string, event: React.MouseEvent) => {
    event.stopPropagation();
    navigate(linkTo);
  };

  const getOrderedCards = () => {
    const left = (centerIndex - 1 + services.length) % services.length;
    const center = centerIndex;
    const right = (centerIndex + 1) % services.length;
    return [
      { ...services[left], position: 'left', originalIndex: left },
      { ...services[center], position: 'center', originalIndex: center },
      { ...services[right], position: 'right', originalIndex: right }
    ];
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setTouchStartX(e.touches[0].clientX);
    setTouchEndX(null);
    setIsSwiping(false);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX === null) return;
    const currentX = e.touches[0].clientX;
    setTouchEndX(currentX);
    if (Math.abs(currentX - touchStartX) > 10) setIsSwiping(true);
  };

  const handleTouchEnd = () => {
    if (touchStartX !== null && touchEndX !== null) {
      const diff = touchStartX - touchEndX;
      if (diff > 40) setCenterIndex((prev) => (prev + 1) % services.length);
      else if (diff < -40) setCenterIndex((prev) => (prev - 1 + services.length) % services.length);
    }
    setTouchStartX(null);
    setTouchEndX(null);
    setTimeout(() => setIsSwiping(false), 0);
  };

  return (
    /*
      CA4: mt-[-40px] on mobile preserved, lg:mt-[0px] on desktop preserved.
      CA3: Added md:mt-[-20px] for tablet middle ground.
    */
    <section className="w-full py-12 md:py-20 bg-white overflow-hidden mt-[-40px] md:mt-[-20px] lg:mt-[0px]">
      <div className="container mx-auto px-4">
        {/* Title — CA2: clamp keeps it from clashing at tablet sizes */}
        <h3
          className="text-[#031634] font-bold text-center mb-8 md:mb-12"
          style={{
            fontFamily: 'Montserrat, sans-serif',
            fontSize: 'clamp(18.43px, 5vw, 40px)',
            lineHeight: '100%',
            fontWeight: 700
          }}
        >
          General Services
        </h3>

        {/*
          CA1/CA3 Desktop grid:
          - md (768–1023px): cards shrink via clamp so 3 columns still fit
            without text overflow or cards being cut off.
          - lg (1024px+): original fixed 248px width.
          - CA4: mobile carousel below is untouched.
        */}
        <div className="hidden md:flex justify-center items-center gap-4 lg:gap-8 flex-wrap lg:flex-nowrap">
          {services.map((service, index) => (
            <div
              key={service.id}
              className="relative rounded-lg overflow-hidden group cursor-pointer flex-shrink-0"
              style={{
                /* CA1: fluid width from ~200px at 768px up to 248px at 1024px+ */
                width: 'clamp(200px, 22vw, 248px)',
                height: 'clamp(210px, 22vw, 256px)'
              }}
              onClick={() => handleCardClick(service.linkTo, index)}
            >
              <img
                src={img(service.image)}
                alt={service.title}
                loading="lazy"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4 lg:p-6 text-white">
                <h3
                  className="mb-1 lg:mb-2"
                  style={{
                    fontFamily: 'Montserrat, sans-serif',
                    fontWeight: 700,
                    /* CA2: title scales with viewport at tablet range */
                    fontSize: 'clamp(16px, 1.8vw, 21.68px)',
                    lineHeight: '100%'
                  }}
                >
                  {service.title}
                </h3>
                <p
                  className="mb-3 lg:mb-4"
                  style={{
                    fontFamily: 'Quicksand, sans-serif',
                    fontWeight: 500,
                    fontSize: 'clamp(11px, 1.2vw, 13.87px)',
                    lineHeight: '144%'
                  }}
                >
                  {service.description}
                </p>
                <button
                  className="inline-flex items-center justify-center rounded-full backdrop-blur-sm transition-all hover:bg-white/30"
                  onClick={(e) => handleExploreClick(service.linkTo, e)}
                  style={{
                    padding: '10.41px',
                    backgroundColor: 'rgba(255, 255, 255, 0.49)',
                    fontFamily: 'Montserrat, sans-serif',
                    fontWeight: 500,
                    fontSize: '10.41px',
                    lineHeight: '100%',
                    minWidth: '54.58px',
                    height: '16.05px',
                    borderRadius: '18px'
                  }}
                >
                  Explore
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Mobile View — untouched (CA4) */}
        <div
          className="md:hidden flex justify-center items-center gap-3 pb-4"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {getOrderedCards().map((card) => {
            const isCenter = card.position === 'center';
            return (
              <div
                key={`${card.id}-${card.position}`}
                onClick={() => handleCardClick(card.linkTo, card.originalIndex)}
                className={`relative rounded-lg overflow-hidden flex-shrink-0 cursor-pointer transition-all duration-500 ease-in-out ${
                  isCenter ? 'opacity-100 scale-100' : 'opacity-60 scale-95'
                }`}
                style={{
                  width: isCenter ? '131.46px' : '102.96px',
                  height: isCenter ? '164.56px' : '128.88px',
                  borderRadius: isCenter ? '9.25px' : '7.24px'
                }}
              >
                <img src={img(card.image)} alt={card.title} loading="lazy" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                <div className={`absolute bottom-0 left-0 right-0 text-white ${isCenter ? 'p-4' : 'p-3'}`}>
                  <h3 className={`font-bold mb-1 ${isCenter ? 'text-sm' : 'text-xs'}`} style={{ fontFamily: 'Montserrat, sans-serif' }}>
                    {card.title}
                  </h3>
                  <p className="mb-2 line-clamp-2 text-[10px]" style={{ fontFamily: 'Quicksand, sans-serif', lineHeight: '144%' }}>
                    {card.description}
                  </p>
                  <button
                    className="text-[9px] px-2 py-1 rounded-full bg-white/50"
                    style={{ fontFamily: 'Montserrat, sans-serif' }}
                    onClick={(e) => handleExploreClick(card.linkTo, e)}
                  >
                    Explore
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </section>
  );
}