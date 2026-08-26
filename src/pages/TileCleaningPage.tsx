import HeroSection from '../sections/TileService/HeroSection';
import Footer from '../components/layout/Footer';
import ServicesSection from '../components/layout/SpecializedServicesSection';
import FormSection from '../sections/HomePage/FormSection';


export default function ResidentialPage() {
  return (
    <div className="min-h-screen max">
      <HeroSection />
      <ServicesSection initialActive="tile" />
      <FormSection defaultFormType="specialized" />
      <Footer />
    </div>
  );
}