import Navbar from '../../components/layout/Navbar';
import heroPoster from '../../assets/video-poster.jpg';

// Hero estático. El video original de Monkey Cleaning se retiró en el paso
// white-label; cuando exista un video propio de Demo Cleaning se puede
// reintroducir un <video> aquí usando esta imagen como poster.
export default function HeroSection() {
  return (
    <section className="relative w-full bg-gray-900 h-[260px] md:h-[500px] lg:h-[650px] xl:h-[800px]">
      <img
        src={heroPoster}
        alt="Carpet cleaning technicians working in a bright living room"
        className="absolute inset-0 w-full h-full object-cover object-top"
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 md:h-32 bg-gradient-to-b from-white via-white/60 to-transparent z-[1]" />

      <div className="fixed top-0 left-0 right-0 z-[100]">
        <Navbar variant="transparent" />
      </div>
    </section>
  );
}
