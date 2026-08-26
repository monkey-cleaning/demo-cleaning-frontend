import HeroSection from '../sections/ResidentialService/HeroSection';
import Footer from '../components/layout/Footer';
import ServicesSection from '../components/layout/ServicesSection';
import FormSection from '../sections/HomePage/FormSection';


export default function ResidentialPage() {
  return (
    <div className="min-h-screen max">
      <HeroSection />
      <ServicesSection initialActive="residential" />
      <FormSection />
      <Footer />
    </div>
  );
}