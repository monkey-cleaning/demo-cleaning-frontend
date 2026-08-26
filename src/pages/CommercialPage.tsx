import HeroSection from '../sections/CommercialService/HeroSection';
import Footer from '../components/layout/Footer';
import ServicesSection from '../components/layout/ServicesSection';
import FormSection from '../sections/HomePage/FormSection';


export default function CommercialPage() {
  return (
    <div className="min-h-screen max">
      <HeroSection />
      <ServicesSection initialActive="commercial" />
      <FormSection />
      <Footer />
    </div>
  );
}