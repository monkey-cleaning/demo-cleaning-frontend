import HeroSection from '../sections/CarpetService/HeroSection';
import Footer from '../components/layout/Footer';
import ServicesSection from '../components/layout/SpecializedServicesSection';
import FormSection from '../sections/HomePage/FormSection';


export default function CarpetCleaningPage() {
  return (
    <div className="min-h-screen max">
      <HeroSection />
      <ServicesSection initialActive="carpet" />
      <FormSection defaultFormType="specialized" />
      <Footer />
    </div>
  );
}