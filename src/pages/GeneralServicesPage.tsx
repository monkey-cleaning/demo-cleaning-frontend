import HeroSection from '../sections/GeneralService/HeroSection';
import Footer from '../components/layout/Footer';
import ServicesSection from '../components/layout/ServicesSection';
import WelcomeSection from '../sections/GeneralService/WelcomeSection';
import QualitySection from '../sections/GeneralService/QualitySection';
import FormSection from '../sections/HomePage/FormSection';


export default function GeneralServicesPage() {
  return (
    <div className="min-h-screen max">
      <HeroSection />
      <ServicesSection />
      <WelcomeSection />
      <QualitySection />
      <FormSection />
      <Footer />
    </div>
  );
}