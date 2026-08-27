import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import jamesImage from '../../assets/james-hobb.png';
import hannahBellImage from '../../assets/hannah-bell.png';
import annImage from '../../assets/ann.png';

interface Testimonial {
  id: number;
  name: string;
  date: string;
  rating: number;
  text: string;
  image: string | null;
  hasCustomImage: boolean;
}

interface AvatarProps {
  testimonial: Testimonial;
  mobile?: boolean;
}

interface StarRatingProps {
  rating: number;
  mobile?: boolean;
}

interface GoogleLogoProps {
  mobile?: boolean;
}

interface TestimonialTextProps {
  testimonial: Testimonial;
  mobile?: boolean;
}

export default function TestimonialsSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  /*
    CA1: Replace binary isMobile (< 768px) with three-state viewport so the
    carousel doesn't jump straight from 222px mobile cards to 370px desktop
    cards with nothing in between for the 768–1023px range.
  */
  const [viewport, setViewport] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  // Keep isMobile alias so sub-components (Avatar, StarRating, etc.) are unchanged
  const isMobile = viewport === 'mobile';
  const [expandedTestimonials, setExpandedTestimonials] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    const classify = () => {
      const w = window.innerWidth;
      if (w < 768) setViewport('mobile');
      else if (w < 1024) setViewport('tablet');
      else setViewport('desktop');
    };
    classify();
    window.addEventListener('resize', classify);
    return () => window.removeEventListener('resize', classify);
  }, []);

  const testimonials: Testimonial[] = [
    {
      id: 1,
      name: "James Hobbs",
      date: "1 year ago",
      rating: 5,
      text: "I have used multiple house cleaning services over the last 10 years and I can say without a doubt that Monkey is the best.",
      image: jamesImage,
      hasCustomImage: true
    },
    {
      id: 2,
      name: "Dave Edwards",
      date: "1 year ago",
      rating: 5,
      text: "Very impressed with Demo Cleaning Co. Had them do a thorough house cleaning over two sessions over a couple of days",
      image: null,
      hasCustomImage: false
    },
    {
      id: 3,
      name: "Hannah Bell",
      date: "1 year ago",
      rating: 5,
      text: "I used Demo Cleaning Co. for a move out cleaning and I was impressed by how quick, efficient and carefully they did the cleaning.",
      image: hannahBellImage,
      hasCustomImage: true
    },
    {
      id: 4,
      name: "Ali Emery",
      date: "11 months ago",
      rating: 5,
      text: "My house needed a serious deep clean and it's a tall order with three pets in the house. The cleaners did a great job, and were super friendly. Thank you!",
      image: null,
      hasCustomImage: false
    },
    {
      id: 5,
      name: "Ashley Saunders",
      date: "1 year ago",
      rating: 5,
      text: "Really well job done by the pair of cleaners who came for an initial 3 hr clean of my house. They were friendly, professional and thorough.",
      image: null,
      hasCustomImage: false
    },
    {
      id: 6,
      name: "Cindy Brown",
      date: "10 months ago",
      rating: 5,
      text: "We've been using Demo Cleaning Co. for a number of months now and absolutely love them. Their cleaning is excellent, they are always right on time.",
      image: null,
      hasCustomImage: false
    },
    {
      id: 7,
      name: "Ann",
      date: "1 year ago",
      rating: 5,
      text: "Demo Cleaning Co. is the absolute best!! I cannot even begin to express how amazing their staff is. Not only were they kind and super friendly, but they practically radiated sunshine and rainbows! If you want a spotless home and an extremely delightful experience, then Demo Cleaning Co. is the way to go! Trust me, you won't find a better house cleaning service anywhere else!",
      image: annImage,
      hasCustomImage: true
    }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [testimonials.length]);

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  const getVisibleTestimonials = () => {
    if (isMobile) {
      return [
        testimonials[currentIndex],
        testimonials[(currentIndex + 1) % testimonials.length]
      ];
    }
    return [
      testimonials[(currentIndex - 1 + testimonials.length) % testimonials.length],
      testimonials[currentIndex],
      testimonials[(currentIndex + 1) % testimonials.length]
    ];
  };

  const handleCardClick = () => {
    window.open('https://www.google.com/search?hl=en&sca_esv=f517df8b24517ced&cs=0&output=search&kgmid=/g/11y2kpps1b&q=Monkey+Cleaning&shndl=30&shem=dimg1,shrtsdl&source=sh/x/kp/local/m1/1&kgs=6879aec26f364bd1&utm_source=dimg1,shrtsdl,sh/x/kp/local/m1/1#lrd=0x6f5f49e399962659:0x4a3819f0c4e8b19a,1,,,,', '_blank');
  };

  const toggleExpand = (testimonialId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedTestimonials(prev => ({
      ...prev,
      [testimonialId]: !prev[testimonialId]
    }));
  };

  const getInitial = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  const getBackgroundColor = (name: string) => {
    const colors = [
      '#4A90E2', '#E94B3C', '#6B4C9A', '#E91E63', '#9C27B0', '#FF9800', '#4CAF50'
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const Avatar = ({ testimonial, mobile = false }: AvatarProps) => {
    if (testimonial.hasCustomImage && testimonial.image) {
      return (
        <img
          src={testimonial.image}
          alt={testimonial.name}
          loading="lazy"
          className={mobile ? "w-6 h-6 rounded-full object-cover" : "w-10 h-10 rounded-full object-cover"}
        />
      );
    }
    
    return (
      <div 
        className={`rounded-full flex items-center justify-center text-white font-semibold ${
          mobile ? 'w-6 h-6 text-xs' : 'w-10 h-10 text-base'
        }`}
        style={{ backgroundColor: getBackgroundColor(testimonial.name) }}
      >
        {getInitial(testimonial.name)}
      </div>
    );
  };

  const StarRating = ({ mobile = false }: StarRatingProps) => (
    <div className={`flex ${mobile ? 'gap-[2.41px]' : 'gap-1'}`}>
      {[...Array(5)].map((_, i) => (
        <svg
          key={i}
          className={mobile ? 'w-[14.46px] h-[14.46px]' : 'w-6 h-6'}
          viewBox="0 0 24 24"
          fill="#FFD700"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );

  const GoogleLogo = ({ mobile = false }: GoogleLogoProps) => (
    <svg
      className={mobile ? 'w-[14.46px] h-[14.46px]' : 'w-6 h-6'}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );

  const TestimonialText = ({ testimonial, mobile = false }: TestimonialTextProps) => {
    const isExpanded = expandedTestimonials[testimonial.id];
    const needsReadMore = testimonial.text.length > (mobile ? 100 : 150);
    const displayText = isExpanded ? testimonial.text : 
      (needsReadMore ? testimonial.text.substring(0, mobile ? 100 : 150) + '...' : testimonial.text);

    return (
      <div>
        <p
          style={{
            fontFamily: 'Quicksand, sans-serif',
            fontWeight: 400,
            fontSize: mobile ? '9.64px' : '16px',
            lineHeight: mobile ? '12.05px' : '20px',
            color: '#1A1A1A'
          }}
        >
          {displayText}
        </p>
        {needsReadMore && (
          <button
            onClick={(e) => toggleExpand(testimonial.id, e)}
            style={{
              fontFamily: 'Quicksand, sans-serif',
              fontWeight: 600,
              fontSize: mobile ? '8px' : '14px',
              color: '#3686F7',
              marginTop: mobile ? '4px' : '8px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            {isExpanded ? 'Hide' : 'Read more'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="w-full py-16 md:py-24 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4">
        {/* Title — CA2: clamp scales from 18px (mobile) → ~28px (tablet) → 40px (desktop) */}
        <h2
          className="text-center mb-12 md:mb-16"
          style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: isMobile ? 600 : 700,
            fontSize: 'clamp(18.43px, 4vw, 40px)',
            lineHeight: '100%',
            color: '#031634'
          }}
        >
          What Our Valued Customers Say
        </h2>

        {/* Desktop + Tablet carousel (md+) */}
        {!isMobile && (
          /*
            CA1: gap shrinks at tablet via clamp; CA3: overflow-hidden + px
            padding prevents side cards from touching viewport edges.
          */
          <div
            className="relative flex items-center justify-center px-2 md:px-6 lg:px-0"
            style={{ gap: 'clamp(16px, 2.5vw, 32px)', overflow: 'hidden' }}
          >
            {getVisibleTestimonials().map((testimonial, index) => {
              const isCenter = index === 1;
              return (
                <div
                  key={`${testimonial.id}-${index}`}
                  onClick={handleCardClick}
                  className={`cursor-pointer transition-all duration-500 flex-shrink-0 ${
                    isCenter ? 'scale-105 opacity-100' : 'scale-95 opacity-80'
                  }`}
                  style={{
                    /*
                      CA1/CA3: At 768px (~md) each card is ~240px; at 1024px
                      it reaches 370px. The center card gets a slight boost.
                      CA4: at lg+ clamp resolves to 370px — identical to original.
                    */
                    width: isCenter
                      ? 'clamp(240px, 32vw, 370px)'
                      : 'clamp(210px, 28vw, 370px)',
                    minHeight: isCenter ? 'auto' : 'auto',
                    padding: 'clamp(14px, 2vw, 24px)',
                    borderRadius: '16px',
                    border: '0.5px solid rgba(0,0,0,0.1)',
                    background: 'linear-gradient(126.27deg, #FFD8F7 -11.56%, #FFFFFF 16.68%, #FFFFFF 73.72%, #D6E7FF 134.39%)',
                    boxShadow: isCenter
                      ? '0px 4px 8px rgba(0,0,0,0.15), 0px 8px 16px rgba(0,0,0,0.1)'
                      : '0px 2px 4px rgba(0,0,0,0.1), 0px 4px 8px rgba(0,0,0,0.08)'
                  }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Avatar testimonial={testimonial} />
                      <div>
                        <p
                          style={{
                            fontFamily: 'Montserrat, sans-serif',
                            fontWeight: 600,
                            /* CA2: scales from ~13px at 768px to 16px at desktop */
                            fontSize: 'clamp(13px, 1.4vw, 16px)',
                            lineHeight: '20px',
                            color: '#1A1A1A'
                          }}
                        >
                          {testimonial.name}
                        </p>
                        <p
                          style={{
                            fontFamily: 'Montserrat, sans-serif',
                            fontWeight: 400,
                            fontSize: 'clamp(10px, 1.1vw, 12px)',
                            lineHeight: '15px',
                            color: 'rgba(0,0,0,0.5)'
                          }}
                        >
                          {testimonial.date}
                        </p>
                      </div>
                    </div>
                    <GoogleLogo />
                  </div>
                  <StarRating rating={testimonial.rating} />
                  <div className="mt-4">
                    <TestimonialText testimonial={testimonial} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Mobile View - se mantiene igual */}
        {isMobile && (
          <div className="relative flex items-center justify-start gap-4 px-4 overflow-hidden">
            {/* First card - active */}
            <div
              onClick={handleCardClick}
              className="cursor-pointer transition-all duration-500 flex-shrink-0"
              style={{
                width: '222.9px',
                padding: '14.46px',
                borderRadius: '9.64px',
                border: '0.3px solid #3686F7',
                background: 'linear-gradient(126.27deg, #FFD8F7 -11.56%, #FFFFFF 16.68%, #FFFFFF 73.72%, #D6E7FF 134.39%)',
                boxShadow: '0px 1.2px 2.41px rgba(0,0,0,0.1), 0px 4.22px 4.22px rgba(0,0,0,0.09)'
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Avatar testimonial={getVisibleTestimonials()[0]} mobile />
                  <div>
                    <p
                      style={{
                        fontFamily: 'Montserrat, sans-serif',
                        fontWeight: 600,
                        fontSize: '9.64px',
                        lineHeight: '12.05px',
                        color: '#1A1A1A'
                      }}
                    >
                      {getVisibleTestimonials()[0].name}
                    </p>
                    <p
                      style={{
                        fontFamily: 'Montserrat, sans-serif',
                        fontWeight: 400,
                        fontSize: '7.23px',
                        lineHeight: '9.04px',
                        color: 'rgba(0,0,0,0.5)'
                      }}
                    >
                      {getVisibleTestimonials()[0].date}
                    </p>
                  </div>
                </div>
                <GoogleLogo mobile />
              </div>
              <StarRating rating={getVisibleTestimonials()[0].rating} mobile />
              <div className="mt-2">
                <TestimonialText testimonial={getVisibleTestimonials()[0]} mobile />
              </div>
            </div>

            {/* Second card - preview */}
            <div
              onClick={handleCardClick}
              className="cursor-pointer transition-all duration-500 opacity-70 flex-shrink-0"
              style={{
                width: '222.9px',
                padding: '14.46px',
                borderRadius: '9.64px',
                border: '0.3px solid rgba(0,0,0,0.1)',
                background: 'linear-gradient(126.27deg, #FFD8F7 -11.56%, #FFFFFF 16.68%, #FFFFFF 73.72%, #D6E7FF 134.39%)',
                transform: 'scale(0.95)',
                boxShadow: '0px 1.2px 2.41px rgba(0,0,0,0.1), 0px 4.22px 4.22px rgba(0,0,0,0.09)'
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Avatar testimonial={getVisibleTestimonials()[1]} mobile />
                  <div>
                    <p
                      style={{
                        fontFamily: 'Montserrat, sans-serif',
                        fontWeight: 600,
                        fontSize: '9.64px',
                        lineHeight: '12.05px',
                        color: '#1A1A1A'
                      }}
                    >
                      {getVisibleTestimonials()[1].name}
                    </p>
                    <p
                      style={{
                        fontFamily: 'Montserrat, sans-serif',
                        fontWeight: 400,
                        fontSize: '7.23px',
                        lineHeight: '9.04px',
                        color: 'rgba(0,0,0,0.5)'
                      }}
                    >
                      {getVisibleTestimonials()[1].date}
                    </p>
                  </div>
                </div>
                <GoogleLogo mobile />
              </div>
              <StarRating rating={getVisibleTestimonials()[1].rating} mobile />
              <div className="mt-2">
                <TestimonialText testimonial={getVisibleTestimonials()[1]} mobile />
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons — CA2: size scales across all three viewports */}
        <div className="flex items-center justify-center gap-2 mt-[20px] lg:mt-[50px]">
          <button
            onClick={prevSlide}
            className="flex items-center justify-center bg-white border border-gray-300 rounded-full hover:bg-gray-50 transition-colors shadow-sm"
            style={{
              width: isMobile ? '18.43px' : viewport === 'tablet' ? '30px' : '40px',
              height: isMobile ? '18.43px' : viewport === 'tablet' ? '30px' : '40px'
            }}
            aria-label="Previous testimonial"
          >
            <ChevronLeft className={isMobile ? 'w-3 h-3' : viewport === 'tablet' ? 'w-4 h-4' : 'w-5 h-5'} />
          </button>
          <button
            onClick={nextSlide}
            className="flex items-center justify-center bg-white border border-gray-300 rounded-full hover:bg-gray-50 transition-colors shadow-sm"
            style={{
              width: isMobile ? '18.43px' : viewport === 'tablet' ? '30px' : '40px',
              height: isMobile ? '18.43px' : viewport === 'tablet' ? '30px' : '40px'
            }}
            aria-label="Next testimonial"
          >
            <ChevronRight className={isMobile ? 'w-3 h-3' : viewport === 'tablet' ? 'w-4 h-4' : 'w-5 h-5'} />
          </button>
        </div>
      </div>
    </div>
  );
}