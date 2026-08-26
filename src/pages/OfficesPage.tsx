import HeroSection from '../sections/OfficesService/HeroSection';
import Footer from '../components/layout/Footer';
import ServicesSection from '../components/layout/ServicesSection';
import FormSection from '../sections/HomePage/FormSection';


export default function OfficesPage() {
  return (
    <div className="min-h-screen max">
      <HeroSection />
      <ServicesSection initialActive="offices" />
      <FormSection />
      <Footer />
    </div>
  );
}