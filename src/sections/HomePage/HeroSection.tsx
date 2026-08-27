import Navbar from '../../components/layout/Navbar';
import PlaceholderImage from '../../components/PlaceholderImage';

// Reemplaza al hero en video (28_11_25 Monkey-Video-Hero.webm/mp4 + poster) —
// toda la lógica de autoplay/fallback/botón-play que tenía este componente
// dejó de tener sentido sin un video real que mostrar. PlaceholderImage no
// soporta video, así que el hero pasa a ser una imagen estática como el
// resto de los Hero del sitio.
export default function HeroSection() {
  return (
    <section className="relative w-full bg-gray-900 h-[260px] md:h-[500px] lg:h-[650px] xl:h-[800px]">
      <PlaceholderImage
        className="absolute inset-0 w-full h-full"
        label="Demo Cleaning Co."
      />

      <div className="fixed top-0 left-0 right-0 z-[100]">
        <Navbar variant="transparent" />
      </div>
    </section>
  );
}