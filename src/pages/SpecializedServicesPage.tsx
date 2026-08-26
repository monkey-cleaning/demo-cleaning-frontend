import HeroSection from '../sections/SpecializedService/HeroSection';
import Footer from '../components/layout/Footer';
import SpecializedServicesSection from '../components/layout/SpecializedServicesSection';
import WelcomeSection from '../sections/SpecializedService/WelcomeSection';
import QualitySection from '../sections/SpecializedService/QualitySection';
import FormSection from '../sections/HomePage/FormSection';


export default function SpecializedServicesPage() {
  return (
    <div className="min-h-screen max">
      <HeroSection />
      <SpecializedServicesSection />
      <WelcomeSection />
      <QualitySection />
      <FormSection defaultFormType="specialized" />
      <Footer />
    </div>
  );
}