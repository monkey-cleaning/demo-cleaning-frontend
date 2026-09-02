import satisfactionImage from '../../assets/satisfaction.jpg';
import onTimeImage from '../../assets/onTime.jpg';
import ecoFriendlyImage from '../../assets/ecoFriendly.jpg';
import vettedImage from '../../assets/vetted.jpg';
import checkIcon from '../../assets/check.png';

export default function WhyChooseUsSection() {
  // objectPosition: estas fotos son horizontales/bodegón dentro de una tarjeta
  // vertical con object-cover; sin esto el sujeto (reloj, alfombra, frascos)
  // queda fuera de cuadro.
  const cards = [
    {
      image: satisfactionImage,
      objectPosition: 'center 68%',
      title: 'Satisfaction Guarantee',
      description: "We're not happy until you're happy. If something's not right, we'll make it right"
    },
    {
      image: onTimeImage,
      objectPosition: '34% 58%',
      title: 'On-Time, Every Time',
      description: 'Respect for your schedule is our priority. We arrive on time and work efficiently'
    },
    {
      image: ecoFriendlyImage,
      objectPosition: 'center 45%',
      title: 'Eco-Friendly Products',
      description: 'We use only certified green cleaning solutions'
    },
    {
      image: vettedImage,
      objectPosition: 'center 22%',
      title: 'Vetted Team Members',
      description: 'Rigorous checks and training for every team member'
    }
  ];

  return (
    /*
      CA4: mt-[-80px] on mobile preserved.
      CA3: md:mt-[-40px] eases the overlap on tablets so cards don't collide
      with the preceding section. Desktop (lg+) restores the original value.
    */
    <section className="w-full py-12 md:py-20 bg-white overflow-hidden mt-[-80px] md:mt-[-40px] lg:mt-[-80px]">
      {/* CA2: clamp title from 18.43px (mobile) up to 40px (desktop) */}
      <h2
        className="font-semibold md:font-bold text-center mb-8 md:mb-[80px]"
        style={{
          fontFamily: 'Montserrat',
          color: '#031634',
          fontSize: 'clamp(18.43px, 4vw, 40px)',
          lineHeight: '100%'
        }}
      >
        Why Choose Us
      </h2>

      {/* Mobile: horizontal scroll — CA4: untouched */}
      <div className="md:hidden overflow-x-auto scrollbar-hide px-4">
        <div className="flex gap-4" style={{ width: 'max-content' }}>
          {cards.map((card, index) => (
            <div
              key={index}
              className="relative rounded-[14.69px] overflow-hidden flex-shrink-0"
              style={{ width: '250.5px', height: '323.63px' }}
            >
              <img src={card.image} alt={card.title} loading="lazy" className="w-full h-full object-cover" style={{ objectPosition: card.objectPosition }} />
              <div
                className="absolute bottom-0 left-0 right-0 flex flex-col backdrop-blur-sm"
                style={{ height: '107.82px', padding: '7.35px 14.69px 14.69px 14.69px', gap: '6.53px', background: 'transparent' }}
              >
                <img src={checkIcon} alt="Check" loading="lazy" className="w-[24.49px] h-[24.49px] object-cover" />
                <h3 className="font-semibold leading-[100%]" style={{ fontFamily: 'Montserrat', fontSize: '16.33px', color: '#FFFFFF' }}>
                  {card.title}
                </h3>
                <p className="font-medium leading-[100%]" style={{ fontFamily: 'Quicksand', fontSize: '11.43px', color: '#FFFFFF' }}>
                  {card.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/*
        CA1/CA3 Desktop grid:
        - md (768–1023px): 2-column grid so 4 cards don't get squeezed into
          a single row. Each card uses fluid height via clamp.
        - lg (1024px+): 4-column grid restoring the original layout.
        CA4: lg:grid-cols-4 preserves the original desktop appearance exactly.
      */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-6 px-4 md:px-8 lg:px-4 max-w-7xl mx-auto">
        {cards.map((card, index) => (
          <div
            key={index}
            className="relative rounded-[18px] overflow-hidden"
            style={{
              /* CA1: fluid height prevents card from being too tall at tablet */
              height: 'clamp(280px, 30vw, 396px)'
            }}
          >
            <img src={card.image} alt={card.title} loading="lazy" className="w-full h-full object-cover" style={{ objectPosition: card.objectPosition }} />
            <div
              className="absolute bottom-0 left-0 right-0 flex flex-col backdrop-blur-sm"
              style={{ height: '132.08px', padding: '9px 18px 18px 18px', gap: '8px', background: 'transparent' }}
            >
              <img src={checkIcon} alt="Check" loading="lazy" className="w-[30px] h-[30px] object-cover" />
              <h3
                className="font-bold leading-[100%]"
                style={{
                  fontFamily: 'Montserrat',
                  /* CA2: title text scales between tablet and desktop */
                  fontSize: 'clamp(16px, 1.8vw, 20.07px)',
                  color: '#FFFFFF'
                }}
              >
                {card.title}
              </h3>
              <p
                className="font-medium"
                style={{
                  fontFamily: 'Quicksand',
                  fontSize: 'clamp(11px, 1.2vw, 12.84px)',
                  lineHeight: '144%',
                  color: '#FFFFFF'
                }}
              >
                {card.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </section>
  );
}